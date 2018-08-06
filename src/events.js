// @flow

import { getInstanceMagic } from './magic.js'

/**
 * Undoes the effect of `on`.
 */
export type CallbackRemover = () => mixed

/**
 * Signature of the `on` method.
 */
export type OnMethod<Events = {}> = <Name: $Keys<Events>>(
  name: Name,
  f: (v: $ElementType<Events, Name>) => mixed
) => CallbackRemover

/**
 * Signature of the `emit` method.
 */
export type EmitMethod<Events = {}> = <Name: $Keys<Events>>(
  name: Name,
  payload: $ElementType<Events, Name>
) => mixed

/**
 * Subscribes to an event on a bridgeable object.
 */
export function addListener (
  o: Object,
  name: string,
  f: Function
): CallbackRemover {
  const { listeners } = getInstanceMagic(o)

  if (listeners[name] == null) listeners[name] = [f]
  else listeners[name].push(f)

  return function unsubscribe () {
    listeners[name] = listeners[name].filter(i => i !== f)
  }
}

/**
 * Emits an event on a bridgeable object.
 */
export function emitEvent (o: Object, name: string, payload: mixed): mixed {
  const magic = getInstanceMagic(o)

  // Schedule outgoing event messages:
  for (const bridge of magic.bridges) {
    bridge.emitEvent(magic.localId, name, payload)
  }

  // Call local callbacks:
  const listeners = magic.listeners[name]
  if (listeners == null) return
  for (const f of listeners) {
    try {
      const out = f(payload)

      // If the function returns a promise, emit an error if it rejects:
      if (out != null && typeof out.then === 'function') {
        out.then(void 0, e => emitEvent(o, 'error', e))
      }
    } catch (e) {
      if (name !== 'error') emitEvent(o, 'error', e)
    }
  }
}

/**
 * The emit function,
 * but packaged as a method and ready to be placed on an object.
 */
export const emitMethod: any = function emitMethod (name, payload) {
  return emitEvent(this, name, payload)
}

/**
 * The addListener function,
 * but packaged as a method and ready to be placed on an object.
 */
export const onMethod: any = function onMethod (name, f) {
  return addListener(this, name, f)
}
