// @flow

import { packData, unpackData } from './data'
import { addListener } from './manage'
import { Message } from './protocol'
import { BridgeState } from './state'

/**
 * The bridge sends messages using this function.
 */
export type SendMessage = (message: Object) => unknown

/**
 * Options used to create a new bridge.
 */
export type BridgeOptions = {
  sendMessage: SendMessage
  throttleMs?: number
}

/**
 * Options used to create a new local bridge.
 */
export type LocalBridgeOptions = {
  cloneMessage?: (x: object) => object
  throttleMs?: number
}

/**
 * An object bridge.
 */
export class Bridge {
  readonly _state: BridgeState
  readonly _rootPromise: Promise<Object>

  constructor (opts: BridgeOptions) {
    this._state = new BridgeState(opts)
    this._rootPromise = new Promise(resolve =>
      addListener(this._state, 'root', resolve)
    )
  }

  handleMessage (message: Message): unknown {
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
  function nopClone (m: Object): Object {
    return m
  }
  const { cloneMessage = nopClone, throttleMs } = opts

  const serverState = new BridgeState({
    sendMessage (message) {
      clientState.handleMessage(cloneMessage(message))
    },
    throttleMs
  })
  const clientState = new BridgeState({
    sendMessage (message) {
      serverState.handleMessage(cloneMessage(message))
    },
    throttleMs
  })

  const data = cloneMessage(packData(serverState, o))
  serverState.sendNow()
  return unpackData(clientState, cloneMessage(data) as any, 'root')
}
