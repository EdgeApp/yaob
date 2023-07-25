// @flow

import { BridgeState } from './BridgeState.js'
import { packData, unpackData } from './data.js'
import { addListener } from './manage.js'
import { type Message } from './protocol.js'

/**
 * The bridge sends messages using this function.
 */
export type SendMessage = (message: Object) => mixed

/**
 * Options used to create a new bridge.
 */
export type BridgeOptions = {
  sendMessage: SendMessage,
  hideProperties?: string[],
  throttleMs?: number
}

/**
 * Options used to create a new local bridge.
 */
export type LocalBridgeOptions = {
  cloneMessage?: (x: Object) => Object,
  hideProperties?: string[],
  throttleMs?: number
}

/**
 * An object bridge.
 */
export class Bridge {
  +_state: BridgeState
  +_rootPromise: Promise<Object>

  constructor(opts: BridgeOptions) {
    this._state = new BridgeState(opts)
    this._rootPromise = new Promise(resolve =>
      addListener(this._state, 'root', resolve)
    )
  }

  handleMessage(message: Message): void {
    this._state.handleMessage(message)
  }

  getRoot(): Promise<any> {
    return this._rootPromise
  }

  sendRoot(root: Object): void {
    this._state.emitEvent(0, 'root', root)
  }

  close(error: Error): void {
    this._state.close(error)
  }
}

/**
 * Bridges a single object locally. This is great for unit tests,
 * where you want to verify that your API works correctly over a bridge,
 * but don't want to actually spawn a separate process.
 */
export function makeLocalBridge<T>(o: T, opts: LocalBridgeOptions = {}): T {
  function nopClone(m: Object): Object {
    return m
  }
  const { cloneMessage = nopClone, hideProperties, throttleMs } = opts

  const serverState = new BridgeState({
    sendMessage(message) {
      clientState.handleMessage(cloneMessage(message))
    },
    hideProperties,
    throttleMs
  })
  const clientState = new BridgeState({
    sendMessage(message) {
      serverState.handleMessage(cloneMessage(message))
    },
    hideProperties,
    throttleMs
  })

  const data = cloneMessage(packData(serverState, o))
  serverState.sendNow()
  return unpackData(clientState, cloneMessage(data), 'root')
}
