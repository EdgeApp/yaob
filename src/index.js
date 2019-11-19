// @flow

import type {
  BridgeOptions,
  LocalBridgeOptions,
  SendMessage
} from './bridge.js'
import { Bridge, makeLocalBridge } from './bridge.js'
import { Bridgeable, onMethod, watchMethod } from './bridgeable.js'
import { bridgifyClass, bridgifyObject, shareData } from './magic.js'
import {
  type CallbackRemover,
  type Subscriber,
  close,
  emit,
  update
} from './manage.js'

// Shared data:
export { onMethod, shareData, watchMethod }

// Defining bridgeable objects:
export { Bridgeable, bridgifyClass, bridgifyObject }

// Managing bridgeable objects:
export { close, emit, update }
export type { CallbackRemover, Subscriber }

// Building bridges:
export { Bridge, makeLocalBridge }
export type { BridgeOptions, LocalBridgeOptions, SendMessage }
