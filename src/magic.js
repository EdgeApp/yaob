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
export type BaseMagic = {
  // This level of the prototype chain is a shared class when set:
  base?: string,

  // The object is non-bridgeable when set:
  closed?: true,

  // Do not proxy the items at this level of the prototype chain when set:
  skip?: true
}

export type CommonInstanceMagic = BaseMagic & {
  // The object id on this side of the bridge:
  localId: number,

  // Bridges subscribed to this object:
  bridges: Array<BridgeState>,

  // Event listeners subscribed to this object:
  listeners: { [name: string]: Array<Function> }
}

/**
 * Magic data found on user-facing object instances.
 */
export type InstanceMagic = CommonInstanceMagic & {
  // This is a proxy object if set. See ProxyMagic for other properties:
  +remoteId?: number
}

/**
 * Magic data found on proxy objects.
 */
export type ProxyMagic = CommonInstanceMagic & {
  +remoteId: number,

  // True if the property getter should throw the value:
  +errors: { [name: string]: boolean },

  // Values for property getters to return:
  +props: { [name: string]: mixed }
}

let nextLocalId = 1

/**
 * Adds a magic marker to a class.
 * Anything derived from this class will be bridgeable.
 */
export function bridgifyClass (Class: Function): mixed {
  const o = Class.prototype
  if (!Object.prototype.hasOwnProperty.call(Class.prototype, MAGIC_KEY)) {
    const magic: BaseMagic = {}
    Object.defineProperty(o, MAGIC_KEY, { value: magic })
  }
}

/**
 * Makes an object instance bridgeable by adding a magic property to it.
 */
export function bridgifyObject (o: Object): mixed {
  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    const magic: BaseMagic = {}
    Object.defineProperty(o, MAGIC_KEY, { value: magic })
  }
  const magic: InstanceMagic = o[MAGIC_KEY]
  if (magic.localId) return
  magic.localId = nextLocalId++
  magic.bridges = []
  magic.listeners = {}
}

/**
 * Gets the magic data from an object instance.
 */
export function getInstanceMagic (o: Object): InstanceMagic {
  // We only want to look at bridgeable objects:
  if (o[MAGIC_KEY] == null) throw new TypeError('Not a bridgeable object')

  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    const magic: BaseMagic = { skip: true }
    Object.defineProperty(o, MAGIC_KEY, { value: magic })
  }
  const magic: InstanceMagic = o[MAGIC_KEY]
  if (magic.localId) return magic
  magic.localId = nextLocalId++
  magic.bridges = []
  magic.listeners = {}
  return magic
}

/**
 * Creates a new `ProxyMagic` object.
 */
export function makeProxyMagic (remoteId: number): ProxyMagic {
  return {
    // InstanceMagic:
    localId: nextLocalId++,
    bridges: [],
    listeners: {},
    // ProxyMagic:
    remoteId,
    errors: {},
    props: {}
  }
}

export function shareClass (Class: Function, name: string): mixed {
  const o = Class.prototype
  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    const magic: BaseMagic = {}
    Object.defineProperty(o, MAGIC_KEY, { value: magic })
  }
  const magic: BaseMagic = o[MAGIC_KEY]
  if (magic.base) return
  magic.base = name
}
