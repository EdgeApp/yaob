// @flow

import type { BridgeOptions, SendMessage } from './bridge.js'
import { type ObjectTable, packData, packThrow, unpackData } from './data.js'
import { bridgifyClass, getInstanceMagic } from './magic.js'
import { close, emit, update } from './manage.js'
import type {
  CallMessage,
  ChangeMessage,
  CreateMessage,
  EventMessage,
  Message,
  ReturnMessage
} from './messages.js'
import {
  type ValueCache,
  diffObject,
  dirtyValue,
  makeProxy,
  packObject,
  updateObjectProps
} from './objects.js'

export class BridgeState implements ObjectTable {
  // Objects:
  +proxies: { [objectId: number]: Object }
  +objects: { [localId: number]: Object }
  +caches: { [localId: number]: ValueCache }

  // Outgoing method calls:
  nextCallId: number
  pendingCalls: {
    [callId: number]: { resolve: Function, reject: Function }
  }

  // Pending message:
  dirty: { [localId: number]: true }
  message: Message

  // Update scheduling:
  +throttleMs: number
  lastUpdate: number
  sendPending: boolean
  +sendMessage: SendMessage

  constructor (opts: BridgeOptions) {
    const { sendMessage, throttleMs = 0 } = opts

    // Objects:
    this.proxies = {}
    this.objects = {}
    this.caches = {}

    // Outgoing method calls:
    this.nextCallId = 0
    this.pendingCalls = {}

    // Pending message:
    this.dirty = {}
    this.message = {}

    // Update scheduling:
    this.throttleMs = throttleMs
    this.lastUpdate = 0
    this.sendPending = false
    this.sendMessage = sendMessage
  }

  /**
   * Grabs an object by its proxy id.
   */
  getObject (packedId: number): Object | void {
    return packedId < 0 ? this.proxies[-packedId] : this.objects[packedId]
  }

  /**
   * Returns an object's id relative to this bridge.
   * The id is positive for objects created on this side of the bridge,
   * and negative for proxy objects reflecting things on the other side.
   */
  getPackedId (o: Object): number | null {
    const magic = getInstanceMagic(o)
    if (magic.closed) return null
    if (magic.remoteId != null && this.proxies[magic.remoteId] != null) {
      return -magic.remoteId
    }
    if (this.objects[magic.localId] == null) {
      // Add unknown objects to the bridge:
      this.objects[magic.localId] = o

      const { cache, create } = packObject(this, o)
      this.caches[magic.localId] = cache
      magic.bridges.push(this)
      this.emitCreate(create, o)
    }
    return magic.localId
  }

  /**
   * Marks an object as needing changes.
   */
  markDirty (localId: number, name?: string) {
    this.dirty[localId] = true
    if (name != null && name in this.caches[localId]) {
      this.caches[localId][name] = dirtyValue
    }
    this.wakeup()
  }

  /**
   * Marks an object as being deleted.
   */
  emitClose (localId: number) {
    delete this.objects[localId]
    delete this.caches[localId]
    if (this.message.closed == null) this.message.closed = []
    this.message.closed.push(localId)
    this.wakeup()
  }

  /**
   * Attaches an object to this bridge, sending a creation message.
   */
  emitCreate (create: CreateMessage, o: Object) {
    if (this.message.created == null) this.message.created = []
    this.message.created.push(create)
    // this.wakeup() not needed, since this is part of data packing.
  }

  /**
   * Enqueues a proxy call message.
   */
  emitCall (remoteId: number, name: string, args: mixed): Promise<mixed> {
    const callId = this.nextCallId++
    const message: CallMessage = {
      callId,
      remoteId,
      name,
      ...packData(this, args)
    }
    if (this.message.calls == null) this.message.calls = []
    this.message.calls.push(message)
    this.wakeup()

    return new Promise((resolve, reject) => {
      this.pendingCalls[callId] = { resolve, reject }
    })
  }

  /**
   * Enqueues an event message.
   */
  emitEvent (localId: number, name: string, payload: mixed) {
    const message: EventMessage = {
      localId,
      name,
      ...packData(this, payload)
    }
    if (this.message.events == null) this.message.events = []
    this.message.events.push(message)
    this.wakeup()
  }

  /**
   * Enqueues a function return message.
   */
  emitReturn (callId: number, fail: boolean, value: mixed) {
    const message: ReturnMessage = {
      callId,
      ...(fail ? packThrow(this, value) : packData(this, value))
    }
    if (this.message.returns == null) this.message.returns = []
    this.message.returns.push(message)
    this.wakeup()
  }

  /**
   * Handles an incoming message,
   * updating state and triggering side-effects as needed.
   */
  handleMessage (message: Message) {
    // ----------------------------------------
    // Phase 1: Get our proxies up to date.
    // ----------------------------------------

    // Handle newly-created objects:
    if (message.created) {
      // Pass 1: Create proxies for the new objects:
      for (const create of message.created) {
        this.proxies[create.localId] = makeProxy(this, create)
      }

      // Pass 2: Fill in the values:
      for (const create of message.created) {
        updateObjectProps(this, this.proxies[create.localId], create.props)
      }
    }

    // Handle updated objects:
    if (message.changed) {
      // Pass 1: Update all the proxies:
      for (const change of message.changed) {
        const { localId, props } = change
        const o = this.proxies[localId]
        if (o == null) {
          throw new RangeError(`Invalid localId ${localId}`)
        }
        updateObjectProps(this, o, props)
      }

      // Pass 2: Fire the callbacks:
      for (const change of message.changed) {
        update(this.proxies[change.localId])
      }
    }

    // ----------------------------------------
    // Phase 2: Handle events & method calls
    // ----------------------------------------

    // Handle events:
    if (message.events) {
      for (const event of message.events) {
        const { localId, name } = event
        const o = localId === 0 ? this : this.proxies[localId]
        if (o == null) continue
        try {
          emit(o, name, unpackData(this, event, name))
        } catch (e) {
          emit(o, 'error', e) // Payload unpacking problem
        }
      }
    }

    // Handle method calls:
    if (message.calls) {
      for (const call of message.calls) {
        const { callId, remoteId, name } = call

        try {
          const o = this.objects[remoteId]
          if (o == null) {
            throw new TypeError(
              `Cannot call method '${name}' of closed proxy (remote)`
            )
          }
          if (typeof o[name] !== 'function') {
            throw new TypeError(`'${name}' is not a function`)
          }
          const args = unpackData(this, call, `${name}.arguments`)
          Promise.resolve(o[name].apply(o, args)).then(
            value => this.emitReturn(callId, false, value),
            e => this.emitReturn(callId, true, e)
          )
        } catch (e) {
          this.emitReturn(callId, true, e)
        }
      }
    }

    // Handle method returns:
    if (message.returns) {
      for (const ret of message.returns) {
        const { callId } = ret
        const pendingCall = this.pendingCalls[callId]
        if (pendingCall == null) {
          throw new RangeError(`Invalid callId ${callId}`)
        }
        try {
          pendingCall.resolve(unpackData(this, ret, '<return>'))
        } catch (e) {
          pendingCall.reject(e)
        } finally {
          delete this.pendingCalls[callId]
        }
      }
    }

    // ----------------------------------------
    // Phase 3: Clean up closed objects
    // ----------------------------------------

    if (message.closed) {
      for (const localId of message.closed) {
        const o = this.proxies[localId]
        if (o == null) return
        delete this.proxies[localId]
        close(o)
      }
    }
  }

  /**
   * Sends the current message.
   */
  sendNow () {
    // Build change messages:
    for (const id in this.dirty) {
      const localId = Number(id)
      const o = this.objects[localId]
      const { dirty, props } = diffObject(this, o, this.caches[localId])
      if (dirty) {
        const message: ChangeMessage = { localId, props }
        if (this.message.changed == null) this.message.changed = []
        this.message.changed.push(message)
      }
    }

    const message = this.message
    this.dirty = {}
    this.message = {}
    this.sendMessage(message)
  }

  /**
   * Something has changed, so prepare to send the pending message:
   */
  wakeup () {
    if (this.sendPending) return

    this.sendPending = true
    const task = () => {
      this.sendPending = false
      this.lastUpdate = Date.now()
      this.sendNow()
    }

    // We really do want `setTimeout` here, even if the delay is 0,
    // since promises and other micro tasks should fire first.
    const delay = this.lastUpdate + this.throttleMs - Date.now()
    setTimeout(task, delay < 0 ? 0 : delay)
  }
}

bridgifyClass(BridgeState)
