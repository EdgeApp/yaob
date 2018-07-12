// @flow

import {
  OVERLAY_DELETED_PROXY,
  OVERLAY_ERROR,
  OVERLAY_UNDEFINED
} from './protocol'
import type {
  ProxyCallMessage,
  ProxyOverlay,
  ProxyUpdateMessage
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
  handleMessage(message: ProxyUpdateMessage): mixed
}

/**
 * Creates the client side of an API proxy.
 */
export function makeProxyClient (
  sendMessage: SendClientMessage,
  shims?: Object = {}
): ProxyClient {
  let lastCallId = 0

  // Proxy cache:
  const proxies: { [proxyId: string]: Object } = {}
  const pendingCalls: {
    [callId: number]: { resolve: Function, reject: Function }
  } = {}

  function applyOverlay (value: any, overlay: ProxyOverlay): any {
    // Simple values:
    if (overlay === null) return value
    if (overlay === OVERLAY_DELETED_PROXY) return null
    if (overlay === OVERLAY_ERROR) {
      const out = new Error()
      out.name = value.name
      out.stack = value.stack
      out.message = value.message
      return out
    }
    if (overlay === OVERLAY_UNDEFINED) return void 0

    // Proxies:
    if (typeof overlay === 'string') return proxies[overlay]

    // Arrays:
    if (Array.isArray(overlay)) {
      const out = []
      for (let i = 0; i < value.length; ++i) {
        out[i] = overlay[i] ? applyOverlay(value[i], overlay[i]) : value[i]
      }
      return out
    }

    // Objects:
    const out = {}
    for (const name in value) {
      out[name] = overlay[name]
        ? applyOverlay(value[name], overlay[name])
        : value[name]
    }
    return out
  }

  /**
   * Fires a callback on an object.
   */
  function callCallback (proxyId: string, name: string, value: mixed) {
    const proxy = proxies[proxyId]
    const callback = proxy['on' + name[0].toUpperCase() + name.slice(1)]
    if (callback) callback(value)
  }

  /**
   * Creates a method for placement on a proxy object.
   */
  function makeMethod (proxyId, method, type) {
    return (...params) => {
      if (!proxies[proxyId]) {
        return Promise.reject(
          new Error(`Calling method '${method}' on deleted object '${type}'`)
        )
      }

      // TODO: Overlay args?
      const callId = ++lastCallId
      sendMessage({ proxyId, callId, method, params })
      return new Promise((resolve, reject) => {
        pendingCalls[callId] = { resolve, reject }
      })
    }
  }

  let resolveRoot
  const root = new Promise(resolve => (resolveRoot = resolve))

  const out = {
    /**
     * Handle an incoming message from the server.
     */
    handleMessage (message: ProxyUpdateMessage) {
      // Handle newly-created objects:
      if (message.creates) {
        // Pass 1: Create proxies for the new objects:
        for (const { proxyId, methods, type } of message.creates) {
          const proxy = {}
          proxies[proxyId] = proxy

          for (const method of methods) {
            proxy[method] = makeMethod(proxyId, method, type)
          }

          if (shims[type]) {
            for (const name in shims[type]) {
              proxy[name] = shims[type][name]
            }
          }

          proxy.on = (name, callback) =>
            (proxy['on' + name[0].toUpperCase() + name.slice(1)] = callback)
        }

        // Pass 2: Fill in the values:
        for (const { proxyId, value, overlay } of message.creates) {
          const values = applyOverlay(value, overlay)
          for (const name in values) {
            proxies[proxyId][name] = values[name]
          }
        }
      }

      // Handle deleted objects:
      if (message.deletes) {
        for (const proxyId of message.deletes) {
          delete proxies[proxyId]
        }
      }

      // Handle server-side events:
      if (message.event) {
        const { proxyId, name, overlay, value } = message.event
        callCallback(proxyId, name, applyOverlay(value, overlay))
      }

      // Handle updated objects:
      if (message.updates) {
        for (const { proxyId, name, value, overlay } of message.updates) {
          const proxy = proxies[proxyId]
          proxy[name] = applyOverlay(value, overlay)

          // Fire the callback:
          callCallback(proxyId, name + 'Changed', proxy[name])
        }
      }

      // Handle function returns:
      if (message.return) {
        const { callId, fail, overlay, value } = message.return
        const result = applyOverlay(value, overlay)

        // Resolve the promise:
        if (fail) pendingCalls[callId].reject(result)
        else pendingCalls[callId].resolve(result)
        delete pendingCalls[callId]
      }

      // Handle the root object:
      if (message.root) {
        const { overlay, value } = message.root
        const root = applyOverlay(value, overlay)
        const hack: any = out
        hack.syncRoot = root
        resolveRoot(root)
      }
    },

    root
  }

  return out
}
