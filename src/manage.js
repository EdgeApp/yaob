// @flow
/**
 * @file
 * Functions for managing updates, events, and object lifetime.
 */

import { getInstanceMagic } from './magic.js'

/**
 * Undoes the effect of `on`.
 */
export type CallbackRemover = () => void

/**
 * Signature of the `on` method.
 */
export type Subscriber<Events: {} = {}> = <Name: $Keys<Events>>(
  name: Name,
  f: (v: $ElementType<Events, Name>) => mixed
) => CallbackRemover

// No user-supplied value will ever be identical to this.
export const dirtyValue = {}

/**
 * Subscribes to an event on a bridgeable object.
 */
export function addListener(
  o: Object,
  name: string,
  f: Function
): CallbackRemover {
  const { closed, listeners } = getInstanceMagic(o)

  if (closed) return () => {}
  if (listeners[name] == null) listeners[name] = [f]
  else listeners[name].push(f)

  return function unsubscribe() {
    listeners[name] = listeners[name].filter(i => i !== f)
  }
}

/**
 * Subscribes to property changes on a bridgeable object.
 */
export function addWatcher(
  o: Object,
  name: string,
  f: Function
): CallbackRemover {
  const { closed, watchers } = getInstanceMagic(o)

  // Don't catch access errors, since we want the user to see them:
  const data = o[name]

  if (closed) return () => {}
  if (watchers[name] == null) watchers[name] = { data, fs: [f] }
  else watchers[name].fs.push(f)

  return function unsubscribe() {
    watchers[name].fs = watchers[name].fs.filter(i => i !== f)
  }
}

/**
 * Destroys a proxy.
 * The remote client will completely forget about this object,
 * and accessing it will become an error.
 */
export function close(o: Object): void {
  const magic = getInstanceMagic(o)

  // Call local callbacks:
  const listeners = magic.listeners.close
  if (listeners != null) {
    for (const f of listeners) {
      callCallback(o, f, undefined, true)
    }
  }

  magic.closed = true
  for (const bridge of magic.bridges) {
    bridge.emitClose(magic.localId)
  }
  magic.bridges = []
  magic.listeners = {}
  magic.watchers = {}
}

/**
 * Emits an event on a bridgeable object.
 */
export function emit(o: Object, name: string, payload: mixed): void {
  const magic = getInstanceMagic(o)
  if (magic.closed) throw new Error('Cannot emit event on closed object')

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
export function update<T: {}>(o: T, name?: $Keys<T>): void {
  const magic = getInstanceMagic(o)
  if (magic.closed) throw new Error('Cannot update closed object')

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
export function callCallback(
  o: Object,
  f: Function,
  payload: mixed,
  emitError: boolean
): void {
  try {
    const out = f(payload)

    // If the function returns a promise, emit an error if it rejects:
    if (emitError && out != null && typeof out.then === 'function') {
      out.then(undefined, (e: any) => emit(o, 'error', e))
    }
  } catch (e) {
    if (emitError) emit(o, 'error', e)
  }
}
