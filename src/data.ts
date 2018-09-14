// @flow
/**
 * @file
 * Routines for breaking primitive values into messages,
 * and then restoring those messages into values on the other side.
 */

import { MAGIC_KEY, sharedData } from './magic'

/**
 * The data-packing system uses this interface to turn
 * bridgeable objects into packedId's and vice-versa.
 */
export interface ObjectTable {
  getPackedId(o: Object): number | null
  getObject(packedId: number): Object | void
}

/**
 * The bridge tries to send values as-is, but that isn't always possible.
 * If this data structure is non-null, the strings indicate what changes
 * need to take place to the value. This data structure is recursive,
 * so it matches the "shape" of the value.
 */
export type DataTypes =
  | '' // No change
  | '?' // Invalid value
  | 'e' // Error
  | 'o' // Object
  | 's' // Shared data
  | 'u' // Undefined

export type DataMap =
  | { [name: string]: DataTypes }
  | Array<DataTypes>
  | DataTypes

/**
 * A value for sending over the wire.
 * If the `value` needs to be modified on the client side,
 * those modifications are in the `map` structure.
 * If this value was thrown, `throw` will be true.
 */
export type PackedData = {
  readonly map?: DataMap
  readonly raw: any
  readonly throw?: true
}

/**
 * The bridge turns errors into these objects.
 */
export type PackedError = {
  readonly base: string | null
} & PackedData // Object properties

/**
 * Prepares a value for sending over the wire.
 */
export function packData (table: ObjectTable, data: unknown): PackedData {
  try {
    const map = mapData(table, data)
    const raw = packItem(table, map, data)
    return map !== '' ? { map, raw } : { raw }
  } catch (data) {
    return packThrow(table, data)
  }
}

/**
 * Prepares a thrown value for sending over the wire.
 */
export function packThrow (table: ObjectTable, data: unknown): PackedData {
  const map = mapData(table, data)
  const raw = packItem(table, map, data)
  return { map, raw, throw: true }
}

/**
 * Restores a value that has been sent over the wire.
 */
export function unpackData (
  table: ObjectTable,
  data: PackedData,
  path: string
): any {
  const { map, raw } = data
  const out = map != null ? unpackItem(table, map, raw, path) : raw
  if (data.throw) throw out
  return out
}

/**
 * Searches through a value, looking for data we can't send directly.
 * Returns a map showing where fixes need to take place.
 */
function mapData (table: ObjectTable, data: any): DataMap {
  switch (typeof data) {
    case 'boolean':
    case 'number':
    case 'string':
      return ''

    case 'object':
      if (data === null) return ''
      if (data instanceof Error) return 'e'
      if (data[MAGIC_KEY] != null) {
        return data[MAGIC_KEY].shareId != null ? 's' : 'o'
      }

      // Arrays:
      if (Array.isArray(data)) {
        let out: Array<DataMap> | '' = ''
        for (let i = 0; i < data.length; ++i) {
          const map = mapData(table, data[i])
          if (map !== '' && out === '') {
            out = []
            for (let j = 0; j < i; ++j) out[j] = ''
          }
          if (out !== '') out[i] = map
        }
        return out as any
      }

      // Data objects:
      let out: { [name: string]: DataMap } | '' = ''
      for (const n in data) {
        const map = mapData(table, data[n])
        if (map !== '') {
          if (out === '') out = {}
          out[n] = map
        }
      }
      return out as any

    case 'undefined':
      return 'u'

    case 'function':
      return data[MAGIC_KEY] != null && data[MAGIC_KEY].shareId != null
        ? 's'
        : '?'

    default:
      return '?'
  }
}

/**
 * Breaks down an error object into a JSON representation.
 */
function packError (table: ObjectTable, o: Error): PackedError {
  // Grab the properties off the object:
  const { message, stack } = o
  const props = { message, stack, ...o }

  let base = null
  if (o instanceof EvalError) base = 'EvalError'
  else if (o instanceof RangeError) base = 'RangeError'
  else if (o instanceof ReferenceError) base = 'ReferenceError'
  else if (o instanceof SyntaxError) base = 'SyntaxError'
  else if (o instanceof TypeError) base = 'TypeError'
  else if (o instanceof URIError) base = 'URIError'

  // Build the JSON value:
  return { base, ...packData(table, props) }
}

/**
 * Copies a value, removing any API objects identified in the types.
 */
function packItem (table: ObjectTable, map: DataMap, data: any): any {
  switch (map) {
    case '':
      return data

    case '?':
      return typeof data

    case 'e':
      return packError(table, data)

    case 'o':
      return table.getPackedId(data)

    case 's':
      return data[MAGIC_KEY].shareId

    case 'u':
      return null

    default:
      // Arrays:
      if (Array.isArray(map)) {
        const out = []
        for (let i = 0; i < map.length; ++i) {
          out[i] = packItem(table, map[i], data[i])
        }
        return out
      }

      // Objects:
      const out = {}
      for (const n in data) {
        out[n] = n in map ? packItem(table, map[n], data[n]) : data[n]
      }
      return out
  }
}

/**
 * Restores an error object from its JSON representation.
 */
function unpackError (
  table: ObjectTable,
  value: PackedError,
  path: string
): Error {
  const bases = {
    EvalError,
    RangeError,
    ReferenceError,
    SyntaxError,
    TypeError,
    URIError
  }

  // Make the object:
  const Base = value.base != null ? bases[value.base] || Error : Error
  const out: object = new Base()

  // Restore the properties:
  const props = unpackData(table, value, path)
  for (const n in props) out[n] = props[n]

  return out as Error
}

/**
 * Restores a value that has been sent over the wire.
 */
function unpackItem (
  table: ObjectTable,
  map: DataMap,
  raw: any,
  path: string
): any {
  switch (map) {
    case '':
      return raw

    case '?':
      const type = typeof raw === 'string' ? raw : '?'
      throw new TypeError(`Unsupported value of type ${type} at ${path}`)

    case 'e':
      if (typeof raw !== 'object' || raw === null) {
        throw new TypeError(`Expecting an error description at ${path}`)
      }
      return unpackError(table, raw, path)

    case 'o':
      if (raw === null) {
        throw new TypeError(`Closed bridge object at ${path}`)
      }
      if (typeof raw !== 'number') {
        throw new TypeError(`Expecting a packedId at ${path}`)
      }
      const o = table.getObject(-raw)
      if (o == null) throw new RangeError(`Invalid packedId at ${path}`)
      return o

    case 's':
      if (typeof raw !== 'string') {
        throw new TypeError(`Expecting a shareId at ${path}`)
      }
      const s = sharedData[raw]
      if (s == null) throw new RangeError(`Invalid shareId at ${path}`)
      return s

    case 'u':
      return void 0

    default:
      if (typeof map !== 'object' || map === null) {
        throw new TypeError(`Invalid type information ${map} at ${path}`)
      }
      if (typeof raw !== 'object' || raw === null) {
        throw new TypeError(`Expecting an array or object at ${path}`)
      }

      // Arrays:
      if (Array.isArray(map)) {
        if (!Array.isArray(raw)) {
          throw new TypeError(`Expecting an array at ${path}`)
        }
        const out = []
        for (let i = 0; i < map.length; ++i) {
          out[i] = unpackItem(table, map[i], raw[i], `${path}[${i}]`)
        }
        return out
      }

      // Objects:
      const out = {}
      for (const n in raw) {
        out[n] =
          n in map ? unpackItem(table, map[n], raw[n], `${path}.${n}`) : raw[n]
      }
      return out
  }
}