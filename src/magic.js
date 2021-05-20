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
export type ClassMagic = {}

/**
 * Magic data shared by all object instances.
 */
type ObjectMagic = {
  // The object id on this side of the bridge:
  +localId: number,

  // The object is no longer bridgeable when set:
  closed?: true,

  // Bridges subscribed to this object:
  bridges: BridgeState[],

  // Event listeners subscribed to this object:
  listeners: { [name: string]: Function[] },

  // Property watchers subscribed to this object:
  watchers: { [name: string]: { data: mixed, fs: Function[] } }
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

/**
 * Magic data found on shared props.
 */
export type SharedMagic = {
  +shareId: string
}

let nextLocalId = 1
export const sharedData: { [sharedId: string]: mixed } = {}

/**
 * Adds or updates an object's magic data.
 */
function addMagic(o: Object, magic: ClassMagic | ObjectMagic | SharedMagic) {
  if (Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    Object.assign(o[MAGIC_KEY], magic)
  } else {
    Object.defineProperty(o, MAGIC_KEY, { value: magic })
  }
}

/**
 * Makes a class bridgeable, including anything derived from it.
 */
export function bridgifyClass<Type: Function>(Class: Type): Type {
  const o = Class.prototype
  if (!Object.prototype.hasOwnProperty.call(o, MAGIC_KEY)) {
    const magic: ClassMagic = {}
    addMagic(o, magic)
  }
  return Class
}

/**
 * Makes an object instance bridgeable.
 */
export function bridgifyObject<Type: Object>(o: Type): Type {
  if (
    !Object.prototype.hasOwnProperty.call(o, MAGIC_KEY) ||
    o[MAGIC_KEY].localId == null
  ) {
    const magic: InstanceMagic = {
      localId: nextLocalId++,
      bridges: [],
      listeners: {},
      watchers: {}
    }
    addMagic(o, magic)
  }
  return o
}

/**
 * Gets the magic data from an object instance.
 */
export function getInstanceMagic(o: Object): InstanceMagic {
  // We only want to look at bridgeable objects:
  if (o[MAGIC_KEY] == null) throw new TypeError('Not a bridgeable object')

  bridgifyObject(o)
  return o[MAGIC_KEY]
}

/**
 * Creates a new `ProxyMagic` object.
 */
export function makeProxyMagic(remoteId: number): ProxyMagic {
  return {
    // InstanceMagic:
    localId: nextLocalId++,
    bridges: [],
    listeners: {},
    watchers: {},
    // ProxyMagic:
    remoteId,
    errors: {},
    props: {}
  }
}

/**
 * Adds items to the global shared data table.
 */
export function shareData(
  table: { [name: string]: Object },
  namespace?: string
) {
  if (namespace == null) namespace = ''
  else namespace += '.'

  for (const n of Object.getOwnPropertyNames(table)) {
    const shareId = namespace + n
    if (sharedData[shareId] != null) {
      throw new Error(`A shared value named ${shareId} already exists`)
    }
    sharedData[shareId] = table[n]
    addMagic(table[n], { shareId })
  }
}
