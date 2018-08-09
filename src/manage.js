// @flow
/**
 * @file
 * Functions for managing updates, events, and object lifetime.
 */

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
 * Destroys a proxy.
 * The remote client will completely forget about this object,
 * and accessing it will become an error.
 */
export function close (o: Object): mixed {
  const magic = getInstanceMagic(o)

  magic.closed = true
  for (const bridge of magic.bridges) {
    bridge.emitClose(magic.localId)
  }
  magic.bridges = []
}

/**
 * Emits an event on a bridgeable object.
 */
export function emit (o: Object, name: string, payload: mixed): mixed {
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
        out.then(void 0, e => emit(o, 'error', e))
      }
    } catch (e) {
      if (name !== 'error') emit(o, 'error', e)
    }
  }
}

/**
 * Marks an object as having changes. The proxy server will send an update.
 */
export function update<T: {}> (o: T, name?: $Keys<T>): mixed {
  const magic = getInstanceMagic(o)

  for (const bridge of magic.bridges) {
    bridge.markDirty(magic.localId, name)
  }
}
