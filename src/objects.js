// @flow
/**
 * @file
 * Routines for breaking bridgeable objects into messages,
 * and then restoring those messages into proxies on the other side.
 */

import { packData, packThrow, unpackData } from './data.js'
import {
  MAGIC_KEY,
  type ProxyMagic,
  getInstanceMagic,
  makeProxyMagic
} from './magic.js'
import type { CreateMessage, PackedProps } from './protocol.js'
import type { BridgeState } from './state.js'

export type ValueCache = { [name: string]: mixed }

// No user-supplied value will ever be identical to this.
export const dirtyValue = {}

/**
 * Examines a bridgeable object and prepares it for sending of the wire.
 * Returns a creation method an the initial value cache.
 */
export function packObject(
  state: BridgeState,
  o: Object
): {
  cache: ValueCache,
  create: CreateMessage
} {
  // Iterate the prototype chain, looking for property names:
  const allNames: { [name: string]: true } = {}
  const end = Object.prototype
  for (let p = o; p !== end && p != null; p = Object.getPrototypeOf(p)) {
    for (const name of Object.getOwnPropertyNames(p)) {
      if (name !== MAGIC_KEY && !/^_/.test(name) && name !== 'constructor') {
        allNames[name] = true
      }
    }
  }

  // Iterate over the object's properties and add their names to
  // the method list or the value cache.
  const cache: ValueCache = {}
  const methods: Array<string> = []
  const props: PackedProps = {}
  for (const n in allNames) {
    try {
      const data = o[n]
      if (
        typeof data === 'function' &&
        (data[MAGIC_KEY] == null || data[MAGIC_KEY].shareId == null)
      ) {
        methods.push(n)
      } else {
        cache[n] = data
        props[n] = packData(state, data)
      }
    } catch (e) {
      cache[n] = dirtyValue
      props[n] = packThrow(state, e)
    }
  }

  const { localId } = getInstanceMagic(o)
  const create: CreateMessage = { localId, methods, props }
  return { cache, create }
}

/**
 * Checks an object for changes.
 * Updates the cache, and returns an object with the necessary changes.
 */
export function diffObject(
  state: BridgeState,
  o: Object,
  cache: ValueCache
): { dirty: boolean, props: PackedProps } {
  let dirty = false
  const props: PackedProps = {}

  for (const n in cache) {
    try {
      const value = o[n]
      if (value !== cache[n]) {
        dirty = true
        props[n] = packData(state, value)
        cache[n] = value
      }
    } catch (e) {
      props[n] = packThrow(state, e)
      cache[n] = dirtyValue
    }
  }

  return { dirty, props }
}

/**
 * Creates an object proxy.
 * The object will have the same values and methods as the original,
 * but will send everything over the bridge.
 */
export function makeProxy(state: BridgeState, create: CreateMessage): Object {
  const props = {}

  // Make the magic property descriptor:
  const magic = makeProxyMagic(create.localId)
  props[MAGIC_KEY] = { value: magic }

  // Add the getters:
  for (const n in create.props) {
    props[n] = { enumerable: true, get: makeProxyGetter(magic, n) }
  }

  // Add the methods:
  for (const n of create.methods) {
    props[n] = { value: makeProxyMethod(state, magic, n) }
  }

  // Make the object:
  return Object.create(Object.prototype, props)
}

/**
 * Unpacks a proxy's properties into the magic storage area.
 */
export function updateObjectProps(
  state: BridgeState,
  o: Object,
  props: PackedProps
): mixed {
  const magic: ProxyMagic = o[MAGIC_KEY]

  for (const n in props) {
    try {
      magic.props[n] = unpackData(state, props[n], n)
      magic.errors[n] = false
    } catch (e) {
      magic.props[n] = e
      magic.errors[n] = true
    }
  }
}

function makeProxyGetter(magic: ProxyMagic, name: string) {
  return function get() {
    if (magic.errors[name]) throw magic.props[name]
    return magic.props[name]
  }
}

function makeProxyMethod(state: BridgeState, magic: ProxyMagic, name: string) {
  return function method(...args) {
    if (magic.closed) {
      return Promise.reject(
        new TypeError(`Cannot call method '${name}' of closed proxy`)
      )
    }
    return state.emitCall(magic.remoteId, name, args)
  }
}
