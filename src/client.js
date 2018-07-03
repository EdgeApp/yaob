// @flow

import { DELETED_PROXY_ID } from './protocol'
import type {
  ProxyCallMessage,
  ProxyError,
  ProxyOverlay,
  ProxyUpdateMessage,
  ProxyValue
} from './protocol.js'

/**
 * The proxy sends messages to the server using this function.
 */
export type SendClientMessage = (message: ProxyCallMessage) => mixed

/**
 * The client application is responsible for receiving messages from the
 * server and passing them into this object.
 */
export type ProxyClient = {
  // The root of the API:
  root: Promise<any>,

  // The server has sent a message:
  onMessage(message: ProxyUpdateMessage): mixed
}

/**
 * Creates the client side of an API proxy.
 */
export function makeProxyClient (sendMessage: SendClientMessage): ProxyClient {
  let lastCallId = 0

  // Proxy cache:
  const proxies: { [proxyId: string]: Object } = {}
  const pendingCalls: {
    [callId: number]: { resolve: Function, reject: Function }
  } = {}

  function restoreError (value: ProxyError): Error {
    const out = new Error(value.message)
    out.name = value.name
    return out
  }

  function applyOverlay (value: any, overlay: ProxyOverlay): any {
    // Proxies:
    if (overlay === null) return value
    if (typeof overlay === 'string') {
      if (overlay === DELETED_PROXY_ID) return null
      return proxies[overlay]
    }

    // Arrays:
    if (Array.isArray(overlay)) {
      const out = []
      for (let i = 0; i < value.length; ++i) {
        out[i] = overlay[i] ? applyOverlay(value[i], overlay[i]) : value[i]
      }
      return out
    }

    // Objects:
    if (overlay !== null) {
      const out = {}
      for (const name in value) {
        out[name] = overlay[name]
          ? applyOverlay(value[name], overlay[name])
          : value[name]
      }
      return out
    }
  }

  /**
   * Restores a value that was stripped using `stripValue`.
   */
  function restoreValue (value: ProxyValue) {
    return applyOverlay(value.value, value.overlay)
  }

  /**
   * Creates a method for placement on a proxy object.
   */
  function makeMethod (proxyId, method, type) {
    return (...args) => {
      if (!proxies[proxyId]) {
        return Promise.reject(
          new Error(`Calling method '${method}' on deleted object '${type}'`)
        )
      }

      // TODO: Overlay args?
      const callId = ++lastCallId
      sendMessage({ proxyId, callId, method, args })
      return new Promise((resolve, reject) => {
        pendingCalls[callId] = { resolve, reject }
      })
    }
  }

  let resolveRoot
  const root = new Promise(resolve => (resolveRoot = resolve))

  /**
   * Handle an incoming message from the server.
   */
  function onMessage (message: ProxyUpdateMessage) {
    // Handle newly-created objects:
    if (message.creates) {
      // Pass 1: Create proxies for the new objects:
      for (const { proxyId, methods, type } of message.creates) {
        // TODO: Use Object.create to snag client-side methods
        const proxy = {}
        proxies[proxyId] = proxy
        for (const method of methods) {
          proxy[method] = makeMethod(proxyId, method, type)
        }
        proxy.on = (name, callback) =>
          (proxy['on' + name[0].toUpperCase() + name.slice(1)] = callback)
      }

      // Pass 2: Fill in the values:
      for (const { proxyId, values } of message.creates) {
        for (const name in values) {
          proxies[proxyId][name] = restoreValue(values[name])
        }
      }
    }

    // Handle deleted objects:
    if (message.deletes) {
      for (const proxyId of message.deletes) {
        delete proxies[proxyId]
      }
    }

    // Handle updated objects:
    if (message.updates) {
      for (const { proxyId, name, value, overlay } of message.updates) {
        const proxy = proxies[proxyId]
        proxy[name] = applyOverlay(value, overlay)

        // Fire the callback:
        const callback =
          proxy['on' + name[0].toUpperCase() + name.slice(1) + 'Changed']
        if (callback) callback(proxy[name])
      }
    }

    // Handle function returns:
    if (message.return) {
      const { callId, error, result } = message.return
      if (error) pendingCalls[callId].reject(restoreError(error))
      if (result) pendingCalls[callId].resolve(restoreValue(result))
      delete pendingCalls[callId]
    }

    // Handle the root object:
    if (message.root) {
      resolveRoot(restoreValue(message.root))
    }
  }

  const out = { root, onMessage }
  return out
}
