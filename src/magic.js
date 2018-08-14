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
 * Magic data used to mark classes as bridgeable.
 */
export type ClassMagic = {
  // This level of the prototype chain is a shared class when set:
  +base?: string,

  // Do not proxy the items at this level of the prototype chain when set:
  skip?: true
}

/**
 * Magic data shared by all object instances.
 */
export type ObjectMagic = ClassMagic & {
  // The object id on this side of the bridge:
  +localId: number,

  // The object is no longer bridgeable when set:
  closed?: true,

  // Bridges subscribed to this object:
  bridges: Array<BridgeState>,

  // Event listeners subscribed to this object:
  listeners: { [name: string]: Array<Function> }
}

/**
 * Magic data found on user-facing object instances.
 */
export type InstanceMagic = ObjectMagic & {
  // This is a proxy object if set. See ProxyMagic for other properties:
  +remoteId?: number
}

/**
 * Magic data found on proxy objects.
 */
export type ProxyMagic = ObjectMagic & {
  +remoteId: number,

  // True if the property getter should throw the value:
  +errors: { [name: string]: boolean },

  // Values for property getters to return:
  +props: { [name: string]: mixed }
}

let nextLocalId = 1

/**
 * Adds or updates an object's magic data.
 */
function addMagic (o: Object, magic: ClassMagic) {
  if (Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    Object.assign(o[MAGIC_KEY], magic)
  } else {
    Object.defineProperty(o, MAGIC_KEY, { value: magic })
  }
}

/**
 * Makes a class bridgeable, including anything derived from it.
 */
export function bridgifyClass (Class: Function): mixed {
  const o = Class.prototype
  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    const magic: ClassMagic = {}
    addMagic(o, magic)
  }
}

/**
 * Makes an object instance bridgeable.
 */
export function bridgifyObject (o: Object): mixed {
  if (
    !Object.prototype.hasOwnProperty.call(o, MAGIC_KEY) ||
    o[MAGIC_KEY].localId == null
  ) {
    addMagic(o, makeObjectMagic(o, false))
  }
}

/**
 * Gets the magic data from an object instance.
 */
export function getInstanceMagic (o: Object): InstanceMagic {
  // We only want to look at bridgeable objects:
  if (o[MAGIC_KEY] == null) throw new TypeError('Not a bridgeable object')

  // Create local magic if we don't already have it:
  if (
    !Object.prototype.hasOwnProperty.call(o, MAGIC_KEY) ||
    o[MAGIC_KEY].localId == null
  ) {
    addMagic(o, makeObjectMagic(o, true))
  }

  return o[MAGIC_KEY]
}

/**
 * Creates a new `InstanceMagic` object for local objects.
 */
function makeObjectMagic (o: Object, skip: boolean): InstanceMagic {
  const out: InstanceMagic = {
    localId: nextLocalId++,
    bridges: [],
    listeners: {}
  }
  if (skip) out.skip = true
  return out
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
  const magic: ClassMagic = {
    base: name
  }
  addMagic(Class.prototype, magic)
}
