// @flow

import { Bridge, makeLocalBridge } from './bridge.js'
import type {
  BridgeOptions,
  LocalBridgeOptions,
  SendMessage,
  SharedClasses
} from './bridge.js'
import { Bridgeable, onMethod } from './bridgeable.js'
import { bridgifyClass, bridgifyObject } from './magic.js'
import {
  type CallbackRemover,
  type OnMethod,
  close,
  emit,
  update
} from './manage.js'

// Defining bridgeable objects:
export { Bridgeable, bridgifyClass, bridgifyObject }

// Managing bridgeable objects:
export { close, emit, update, onMethod }
export type { CallbackRemover, OnMethod }

// Building bridges:
export { Bridge, makeLocalBridge }
export type { BridgeOptions, LocalBridgeOptions, SendMessage, SharedClasses }
