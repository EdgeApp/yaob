// @flow
/**
 * @file
 * Functions for managing updates, events, and object lifetime.
 */

import { getInstanceMagic } from './magic'

/**
 * Undoes the effect of `on`.
 */
export type CallbackRemover = () => unknown

/**
 * Signature of the `on` method.
 */
export type Subscriber < Events extends {} = {} > = <Name extends keyof Events>(
  name: Name,
  f: (v: Events[Name]) => unknown
) => CallbackRemover

// No user-supplied value will ever be identical to this.
export const dirtyValue = {}

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
 * Subscribes to property changes on a bridgeable object.
 */
export function addWatcher (
  o: Object,
  name: string,
  f: Function
): CallbackRemover {
  const { watchers } = getInstanceMagic(o)

  // Call the callback once.
  // Don't catch access errors, since we want the user to see them:
  const data = o[name]
  callCallback(o, f, data, true)

  if (watchers[name] == null) watchers[name] = { data, fs: [f] }
  else watchers[name].fs.push(f)

  return function unsubscribe () {
    watchers[name].fs = watchers[name].fs.filter(i => i !== f)
  }
}

/**
 * Destroys a proxy.
 * The remote client will completely forget about this object,
 * and accessing it will become an error.
 */
export function close (o: Object): unknown {
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
export function emit (o: Object, name: string, payload: unknown): unknown {
  const magic = getInstanceMagic(o)

  // Schedule outgoing event messages:
  for (const bridge of magic.bridges) {
    bridge.emitEvent(magic.localId, name, payload)
  }

  // Call local callbacks:
  const listeners = magic.listeners[name]
  if (listeners != null) {
    for (const f of listeners) {
      callCallback(o, f, payload, name !== 'error')
    }
  }
}

/**
 * Marks an object as having changes. The proxy server will send an update.
 */
export function update<T extends {}> (o: T, name?: keyof T & string): unknown {
  const magic = getInstanceMagic(o)

  for (const bridge of magic.bridges) {
    bridge.markDirty(magic.localId, name)
  }

  // Blow away the cache if we have a name:
  if (name != null && magic.watchers[name] != null) {
    magic.watchers[name].data = dirtyValue
  }

  // Call watcher callbacks:
  for (const n in magic.watchers) {
    const cache = magic.watchers[n]
    try {
      const data = o[n]
      if (data !== cache.data) {
        cache.data = data
        for (const f of cache.fs) callCallback(o, f, cache.data, true)
      }
    } catch (e) {}
  }
}

/**
 * Calls a user-supplied callback function with error checking.
 */
export function callCallback (
  o: Object,
  f: Function,
  payload: unknown,
  emitError: boolean
) {
  try {
    const out = f(payload)

    // If the function returns a promise, emit an error if it rejects:
    if (emitError && out != null && typeof out.then === 'function') {
      out.then(void 0, e => emit(o, 'error', e))
    }
  } catch (e) {
    if (emitError) emit(o, 'error', e)
  }
}
