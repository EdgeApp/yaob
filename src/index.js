// @flow

import { Bridge, makeLocalBridge } from './bridge.js'
import type {
  BridgeOptions,
  LocalBridgeOptions,
  SendMessage,
  SharedClasses
} from './bridge.js'
import { Bridgeable } from './bridgeable.js'
import {
  type CallbackRemover,
  type EmitMethod,
  type OnMethod,
  addListener,
  emitEvent,
  emitMethod,
  onMethod
} from './events.js'
import {
  bridgifyClass,
  bridgifyObject,
  closeObject,
  updateObject
} from './magic.js'

// Defining bridgeable objects:
export { Bridgeable, bridgifyClass, bridgifyObject }

// Managing bridgeable objects:
export {
  addListener,
  closeObject,
  emitEvent,
  emitMethod,
  onMethod,
  updateObject
}
export type { CallbackRemover, EmitMethod, OnMethod }

// Building bridges:
export { Bridge, makeLocalBridge }
export type { BridgeOptions, LocalBridgeOptions, SendMessage, SharedClasses }
