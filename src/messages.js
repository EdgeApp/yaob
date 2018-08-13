// @flow

import { type PackedData, unpackData } from './data.js'
import { closeObject, emitEvent } from './manage.js'
import {
  type ChangeEvent,
  diffObject,
  makeProxy,
  updateObjectProps
} from './objects.js'
import type { BridgeState } from './state.js'

/**
 * A PackedData instance that handles object properties.
 */
export type PackedProps = { [name: string]: PackedData }

/**
 * The client sends this message to call methods on a proxy object.
 */
export type CallMessage = {
  callId: number,
  remoteId: number,
  name: string
} & PackedData // Parameter array

/**
 * The server sends this when the values on a proxy object change.
 */
export type ChangeMessage = {
  localId: number,
  props: PackedProps
}

/**
 * The server sends this when it creates a new proxy object.
 */
export type CreateMessage = {
  localId: number,
  base?: string,
  on?: Array<string>,
  methods: Array<string>,
  props: PackedProps
}

/**
 * The server sends this when it creates a new proxy object.
 */
export type EventMessage = {
  localId: number,
  name: string
} & PackedData // Parameter array

/**
 * The server sends this when a proxy method call has returned or thrown.
 */
export type ReturnMessage = {
  callId: number
} & PackedData // Return value

/**
 * The server sends this whenever anything happens.
 * It can include the various event types described above.
 */
export type Message = {
  calls?: Array<CallMessage>,
  changed?: Array<ChangeMessage>,
  closed?: Array<number>,
  created?: Array<CreateMessage>,
  events?: Array<EventMessage>,
  returns?: Array<ReturnMessage>
}

/**
 * Handles an incoming message,
 * updating state and triggering side-effects as needed.
 */
export function handleMessage (state: BridgeState, message: Message) {
  // ----------------------------------------
  // Phase 1: Get our proxies up to date.
  // ----------------------------------------

  // Handle newly-created objects:
  if (message.created) {
    // Pass 1: Create proxies for the new objects:
    for (const create of message.created) {
      state.proxies[create.localId] = makeProxy(state, create)
    }

    // Pass 2: Fill in the values:
    for (const create of message.created) {
      updateObjectProps(state, state.proxies[create.localId], create.props)
    }
  }

  // Handle updated objects:
  if (message.changed) {
    // Pass 1: Update all the proxies:
    let events: Array<ChangeEvent> = []
    for (const change of message.changed) {
      const { localId, props } = change
      const o = state.proxies[localId]
      if (o == null) {
        throw new RangeError(`Invalid localId ${localId}`)
      }
      const newEvents = updateObjectProps(state, o, props)
      events = events.concat(newEvents)
    }

    // Pass 2: Fire the callbacks:
    for (const event of events) {
      const { proxy, name, payload } = event
      emitEvent(proxy, name, payload)
    }
  }

  // ----------------------------------------
  // Phase 2: Handle events & method calls
  // ----------------------------------------

  // Handle events:
  if (message.events) {
    for (const event of message.events) {
      const { localId, name } = event
      const o = localId === 0 ? state : state.proxies[localId]
      if (o == null) continue
      try {
        emitEvent(o, name, unpackData(state, event, name))
      } catch (e) {
        emitEvent(o, 'error', e) // Payload unpacking problem
      }
    }
  }

  // Handle method calls:
  if (message.calls) {
    for (const call of message.calls) {
      const { callId, remoteId, name } = call

      try {
        const o = state.objects[remoteId]
        if (o == null) {
          throw new TypeError(
            `Cannot call method '${name}' of closed proxy (remote)`
          )
        }
        if (typeof o[name] !== 'function') {
          throw new TypeError(`'${name}' is not a function`)
        }
        const args = unpackData(state, call, `${name}.arguments`)
        Promise.resolve(o[name].apply(o, args)).then(
          value => state.emitReturn(callId, false, value),
          e => state.emitReturn(callId, true, e)
        )
      } catch (e) {
        state.emitReturn(callId, true, e)
      }
    }
  }

  // Handle method returns:
  if (message.returns) {
    for (const ret of message.returns) {
      const { callId } = ret
      const pendingCall = state.pendingCalls[callId]
      if (pendingCall == null) {
        throw new RangeError(`Invalid callId ${callId}`)
      }
      try {
        pendingCall.resolve(unpackData(state, ret, '<return>'))
      } catch (e) {
        pendingCall.reject(e)
      } finally {
        delete state.pendingCalls[callId]
      }
    }
  }

  // ----------------------------------------
  // Phase 3: Clean up closed objects
  // ----------------------------------------

  if (message.closed) {
    for (const localId of message.closed) {
      const o = state.proxies[localId]
      if (o == null) return
      delete state.proxies[localId]
      closeObject(o)
    }
  }
}

/**
 * Gathers pending events and bundles them into a message.
 */
export function makeMessage (state: BridgeState): Message {
  // Build change messages:
  const changed: Array<ChangeMessage> = []
  for (const id in state.dirty) {
    const localId = Number(id)
    const o = state.objects[localId]
    const { dirty, props } = diffObject(state, o, state.caches[localId])
    if (dirty) {
      const message: ChangeMessage = { localId, props }
      changed.push(message)
    }
  }

  const out: Message = {}
  if (changed.length) out.changed = changed
  if (state.closed.length) out.closed = state.closed
  if (state.created.length) out.created = state.created
  if (state.calls.length) out.calls = state.calls
  if (state.events.length) out.events = state.events
  if (state.returns.length) out.returns = state.returns
  state.messageSent()

  return out
}
