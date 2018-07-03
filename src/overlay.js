// @flow

import type { JsonValue, ProxyError, ProxyOverlay } from './protocol.js'

export const PROXY_OBJECT_KEY = 'proxy key'

/**
 * Turns an `Error` object into something that is compatible with either
 * JSON or the `WebWorker` structured clone algorithm.
 */
export function jsonizeError (error: mixed): ProxyError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...error // Snag any enumerable props
    }
  }

  return {
    name: 'TypeError',
    message: 'Invalid error object ' + JSON.stringify(error)
  }
}

/**
 * Searches through a JSON value, looking for API objects.
 * Returns an overlay containing the proxy id's,
 * or `undefined` if there are no API objects.
 * Calls `visitor` for each API object identified during the traversal.
 */
export function makeOverlay (
  value: any,
  visitor?: (proxyObject: any) => mixed
): ProxyOverlay {
  // Arrays:
  if (Array.isArray(value)) {
    let out = null
    for (let i = 0; i < value.length; ++i) {
      const overlay = makeOverlay(value[i], visitor)
      if (overlay !== null && out === null) {
        out = []
        for (let j = 0; j < i; ++j) out[j] = null
      }
      if (out !== null) out[i] = overlay
    }
    return out
  }

  // Objects:
  if (value !== null && typeof value === 'object') {
    // If this is an API object, return its id:
    const info = value[PROXY_OBJECT_KEY]
    if (info) {
      if (visitor) visitor(value)
      return info.proxyId
    }

    // Otherwise, recurse:
    let out = null
    for (const name in value) {
      const overlay = makeOverlay(value[name], visitor)
      if (overlay !== null) {
        if (out === null) out = {}
        out[name] = overlay
      }
    }
    return out
  }

  // Primitives:
  return null
}

/**
 * Copies a value, removing any API objects identified in the overlay.
 */
export function stripValue (value: any, overlay: ProxyOverlay): JsonValue {
  if (overlay === null) return value
  if (typeof overlay === 'string') return null

  // Arrays:
  if (Array.isArray(overlay)) {
    const out = []
    for (let i = 0; i < value.length; ++i) {
      out[i] = overlay[i] ? stripValue(value[i], overlay[i]) : value[i]
    }
    return out
  }

  // Objects:
  const out = {}
  for (const name in value) {
    out[name] = overlay[name]
      ? stripValue(value[name], overlay[name])
      : value[name]
  }
  return out
}
