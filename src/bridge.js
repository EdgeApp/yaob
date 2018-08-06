// @flow

import { packData, unpackData } from './data.js'
import { addListener } from './events.js'
import { type Message, handleMessage, makeMessage } from './messages.js'
import { type BridgeOptions, BridgeState, type SharedClasses } from './state.js'

export type LocalBridgeOptions = {
  sharedClasses?: SharedClasses
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
    handleMessage(this._state, message)
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
  const { sharedClasses = {} } = opts

  const serverState = new BridgeState({
    sendMessage (message) {
      handleMessage(clientState, message)
    },
    sharedClasses
  })
  const clientState = new BridgeState({
    sendMessage (message) {
      handleMessage(serverState, message)
    },
    sharedClasses
  })

  const data = packData(serverState, o)
  serverState.sendMessage(makeMessage(serverState))
  return unpackData(clientState, data, 'root')
}
