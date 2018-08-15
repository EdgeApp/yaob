// @flow

import { packData, unpackData } from './data.js'
import { addListener } from './manage.js'
import { type Message } from './messages.js'
import { BridgeState } from './state.js'

/**
 * The bridge sends messages using this function.
 */
export type SendMessage = (message: Message) => mixed

/**
 * A table of classes shared between the client and the server.
 */
export type SharedClasses = { [name: string]: Function }

/**
 * Options used to create a new bridge.
 */
export type BridgeOptions = {
  sendMessage: SendMessage,
  sharedClasses?: SharedClasses,
  throttleMs?: number
}

/**
 * Options used to create a new local bridge.
 */
export type LocalBridgeOptions = {
  cloneMessage?: (x: Message) => Message,
  sharedClasses?: SharedClasses,
  throttleMs?: number
}

/**
 * An object bridge.
 */
export class Bridge {
  +_state: BridgeState
  +_rootPromise: Promise<Object>

  constructor (opts: BridgeOptions) {
    this._state = new BridgeState(opts)
    this._rootPromise = new Promise(resolve =>
      addListener(this._state, 'root', resolve)
    )
  }

  handleMessage (message: Message): mixed {
    this._state.handleMessage(message)
  }

  getRoot () {
    return this._rootPromise
  }

  sendRoot (root: Object) {
    this._state.emitEvent(0, 'root', root)
  }
}

/**
 * Bridges a single object locally. This is great for unit tests,
 * where you want to verify that your API works correctly over a bridge,
 * but don't want to actually spawn a separate process.
 */
export function makeLocalBridge<T> (o: T, opts: LocalBridgeOptions = {}): T {
  function nopClone (m) {
    return m
  }
  const { cloneMessage = nopClone, sharedClasses = {}, throttleMs } = opts

  const serverState = new BridgeState({
    sendMessage (message) {
      clientState.handleMessage(cloneMessage(message))
    },
    sharedClasses,
    throttleMs
  })
  const clientState = new BridgeState({
    sendMessage (message) {
      serverState.handleMessage(cloneMessage(message))
    },
    sharedClasses,
    throttleMs
  })

  const data = packData(serverState, o)
  serverState.sendNow()
  return unpackData(clientState, data, 'root')
}
