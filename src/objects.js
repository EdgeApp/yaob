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
import { onMethod } from './manage.js'
import type { CreateMessage, PackedProps } from './messages.js'
import type { BridgeState } from './state.js'

export type ChangeEvent = {
  proxy: Object,
  name: string,
  payload: mixed
}

export type ValueCache = { [name: string]: mixed }

// No user-supplied value will ever be identical to this.
export const dirtyValue = {}

/**
 * Examines a bridgeable object and prepares it for sending of the wire.
 * Returns a creation method an the initial value cache.
 */
export function packObject (
  state: BridgeState,
  o: Object
): {
  cache: ValueCache,
  create: CreateMessage
} {
  const allNames: { [name: string]: true } = {}
  function addNames (o: Object) {
    for (const name of Object.getOwnPropertyNames(o)) {
      if (name !== MAGIC_KEY && !/^_/.test(name) && name !== 'constructor') {
        allNames[name] = true
      }
    }
  }

  // Iterate the prototype chain, looking for property names:
  let base: string | void
  const end = Object.prototype
  for (let p = o; p !== end && p != null; p = Object.getPrototypeOf(p)) {
    if (Object.prototype.hasOwnProperty.call(p, MAGIC_KEY)) {
      if (p[MAGIC_KEY].base != null) {
        base = p[MAGIC_KEY].base
        break
      }
    }
    addNames(p)
  }

  // Iterate over the object's properties and add their names to
  // the method list or the value cache.
  const cache: ValueCache = {}
  const on: Array<string> = []
  const methods: Array<string> = []
  const props: PackedProps = {}
  for (const n in allNames) {
    try {
      const value = o[n]
      if (value === onMethod) on.push(n)
      if (typeof value === 'function') methods.push(n)
      else {
        cache[n] = value
        props[n] = packData(state, value)
      }
    } catch (e) {
      cache[n] = dirtyValue
      props[n] = packThrow(state, e)
    }
  }

  const { localId } = getInstanceMagic(o)
  const create: CreateMessage = { localId, methods, props }
  if (base != null) create.base = base
  if (on.length !== 0) create.on = on
  return { cache, create }
}

/**
 * Checks an object for changes.
 * Updates the cache, and returns an object with the necessary changes.
 */
export function diffObject (
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
export function makeProxy (state: BridgeState, create: CreateMessage): Object {
  const props = {}

  // Make the magic property descriptor:
  const magic = makeProxyMagic(create.localId)
  props[MAGIC_KEY] = { value: magic }

  // Add the getters property descriptors:
  for (const n in create.props) {
    props[n] = { get: makeProxyGetter(magic, n) }
  }

  // Add the methods:
  for (const n of create.methods) {
    props[n] = { value: makeProxyMethod(state, magic, n) }
  }
  if (create.on != null) {
    for (const n of create.on) {
      props[n] = { value: onMethod }
    }
  }

  // Make the object:
  const Base = state.getBase(create.base)
  const object = Object.create(Base.prototype, props)
  Base.call(object)

  return object
}

/**
 * Unpacks a proxy's properties into the magic storage area.
 */
export function updateObjectProps (
  state: BridgeState,
  o: Object,
  props: PackedProps
): Array<ChangeEvent> {
  const magic: ProxyMagic = o[MAGIC_KEY]
  const path = magic.base || '<proxy>'

  const out: Array<ChangeEvent> = []
  for (const n in props) {
    try {
      magic.props[n] = unpackData(state, props[n], `${path}.${n}`)
      magic.errors[n] = false
      out.push({ proxy: o, name: n + 'Changed', payload: magic.props[n] })
    } catch (e) {
      magic.props[n] = e
      magic.errors[n] = true
    }
  }
  return out
}

function makeProxyGetter (magic: ProxyMagic, name: string) {
  return function get () {
    if (magic.errors[name]) throw magic.props[name]
    return magic.props[name]
  }
}

function makeProxyMethod (state: BridgeState, magic: ProxyMagic, name: string) {
  return function method (...args) {
    if (magic.closed) {
      return Promise.reject(
        new TypeError(`Cannot call method '${name}' of closed proxy`)
      )
    }
    return state.emitCall(magic.remoteId, name, args)
  }
}
