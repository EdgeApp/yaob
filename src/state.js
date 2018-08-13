// @flow

import type { BridgeOptions, SendMessage, SharedClasses } from './bridge.js'
import { Bridgeable } from './bridgeable.js'
import { packData, packThrow } from './data.js'
import { type InstanceMagic, bridgifyClass, shareClass } from './magic.js'
import type {
  CallMessage,
  CreateMessage,
  EventMessage,
  ReturnMessage
} from './messages.js'
import { makeMessage } from './messages.js'
import { type ValueCache, dirtyValue, packObject } from './objects.js'

export class BridgeState {
  // Objects:
  +sharedClasses: SharedClasses
  +proxies: { [objectId: number]: Object }
  +objects: { [localId: number]: Object }
  +caches: { [localId: number]: ValueCache }

  // Outgoing method calls:
  nextCallId: number
  pendingCalls: {
    [callId: number]: { resolve: Function, reject: Function }
  }

  // Pending message:
  changed: { [localId: number]: true }
  closed: Array<number>
  created: Array<CreateMessage>
  calls: Array<CallMessage>
  returns: Array<ReturnMessage>
  events: Array<EventMessage>

  // Update scheduling:
  +throttleMs: number
  lastUpdate: number
  sendPending: boolean
  +sendMessage: SendMessage

  constructor (opts: BridgeOptions) {
    const { sendMessage, sharedClasses = {}, throttleMs = 0 } = opts

    // Objects:
    this.sharedClasses = sharedClasses
    for (const name in sharedClasses) {
      shareClass(sharedClasses[name], name)
    }
    this.proxies = {}
    this.objects = {}
    this.caches = {}

    // Outgoing method calls:
    this.nextCallId = 0
    this.pendingCalls = {}

    // Pending message:
    this.messageSent()

    // Update scheduling:
    this.throttleMs = throttleMs
    this.lastUpdate = 0
    this.sendPending = false
    this.sendMessage = sendMessage
  }

  /**
   * Returns a base class based on its name.
   */
  getBase (base?: string): Function {
    const table = { Bridgeable }

    if (base == null) return Object
    if (this.sharedClasses[base] != null) return this.sharedClasses[base]
    if (table[base] != null) return table[base]
    throw new RangeError(`Cannot find shared base class ${base}`)
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
  getPackedId (magic: InstanceMagic): number | null {
    if (magic.closed) return null
    if (magic.remoteId != null && this.proxies[magic.remoteId] != null) {
      return -magic.remoteId
    }
    return magic.localId
  }

  /**
   * Marks an object as needing changes.
   */
  emitChange (localId: number, name?: string) {
    this.changed[localId] = true
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
    this.closed.push(localId)
    this.wakeup()
  }

  /**
   * Attaches an object to this bridge, sending a creation message.
   */
  emitCreate (magic: InstanceMagic, o: Object) {
    const { localId } = magic

    // Bail out if we already have this object:
    if (this.objects[localId] != null) return
    this.objects[localId] = o

    const { cache, create } = packObject(this, o)
    this.caches[localId] = cache
    magic.bridges.push(this)
    this.created.push(create)
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
    this.calls.push(message)
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
    this.events.push(message)
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
    this.returns.push(message)
    this.wakeup()
  }

  /**
   * Clears everything scheduled to be sent in the next message.
   */
  messageSent () {
    this.changed = {}
    this.closed = []
    this.created = []
    this.calls = []
    this.returns = []
    this.events = []
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
      this.sendMessage(makeMessage(this))
    }

    // We really do want `setTimeout` here, even if the delay is 0,
    // since promises and other micro tasks should fire first.
    const delay = this.lastUpdate + this.throttleMs - Date.now()
    setTimeout(task, delay < 0 ? 0 : delay)
  }
}

bridgifyClass(BridgeState)
