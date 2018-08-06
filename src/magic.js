// @flow
/**
 * @file
 * Bridgeable objects have a special "magic" property.
 * This file contains routines for working with these magic properties.
 */

import type { BridgeState } from './state.js'

// An object is bridgeable if it has this key:
export const MAGIC_KEY = '_yaob'

/**
 * Common flags that might be found on any magic value:
 */
export type CommonMagic = {
  // This level of the prototype chain is a shared class when set:
  +base?: string,

  // The object is non-bridgeable when set:
  closed?: true,

  // Do not proxy the items at this level of the prototype chain when set:
  skip?: true
}

/**
 * Magic data found on user-facing object instances.
 */
export type InstanceMagic = CommonMagic & {
  // The object id on this side of the bridge:
  +localId: number,

  // This is a proxy object if set. See ProxyMagic for other properties:
  +remoteId?: number,

  // Bridges serving this object:
  bridges: Array<BridgeState>,

  // Event listeners subscribed to this object:
  listeners: { [name: string]: Array<Function> }
}

/**
 * Magic data found on proxy objects.
 */
export type ProxyMagic = CommonMagic & {
  +remoteId: number,
  +errors: { [name: string]: Error | void },
  +props: { [name: string]: any }
}

let nextLocalId = 1

/**
 * Destroys a proxy.
 * The remote client will completely forget about this object,
 * and accessing it will become an error.
 */
export function closeObject (o: Object) {
  const magic = getInstanceMagic(o)

  magic.closed = true
  for (const bridge of magic.bridges) {
    bridge.emitClose(magic.localId)
  }
  magic.bridges = []
}

/**
 * Marks an object as having changes. The proxy server will send an update.
 */
export function updateObject (o: Object, name?: string) {
  const magic = getInstanceMagic(o)

  for (const bridge of magic.bridges) {
    bridge.emitChange(magic.localId, name)
  }
}

/**
 * Adds a magic marker to a class.
 * Anything derived from this class will be bridgeable.
 */
export function bridgifyClass (Class: Function): mixed {
  const o = Class.prototype
  if (!Object.prototype.hasOwnProperty.call(Class.prototype, MAGIC_KEY)) {
    Object.defineProperty(o, MAGIC_KEY, { value: {} })
  }
}

/**
 * Makes an object instance bridgeable by adding a magic property to it.
 */
export function bridgifyObject (o: Object): mixed {
  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    Object.defineProperty(o, MAGIC_KEY, { value: {} })
  }
  const magic = o[MAGIC_KEY]
  if (magic.localId) return
  magic.bridges = []
  magic.listeners = []
  magic.localId = nextLocalId++
}

/**
 * Gets the magic data from an object instance.
 */
export function getInstanceMagic (o: Object): InstanceMagic {
  // We only want to look at bridgeable objects:
  if (o[MAGIC_KEY] == null) throw new TypeError('Not a bridgeable object')

  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    Object.defineProperty(o, MAGIC_KEY, { value: { skip: true } })
  }
  const magic = o[MAGIC_KEY]
  if (magic.localId) return magic
  magic.bridges = []
  magic.listeners = []
  magic.localId = nextLocalId++
  return magic
}

/**
 * Creates a new `ProxyMagic` object.
 */
export function makeProxyMagic (remoteId: number): ProxyMagic {
  return {
    bridges: [],
    errors: {},
    listeners: {},
    localId: nextLocalId++,
    props: {},
    remoteId
  }
}

export function shareClass (Class: Function, name: string): mixed {
  const o = Class.prototype
  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    Object.defineProperty(o, MAGIC_KEY, { value: {} })
  }
  const magic = o[MAGIC_KEY]
  if (magic.base) return
  magic.base = name
}
