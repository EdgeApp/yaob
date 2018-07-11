// @flow

import { PROXY_OBJECT_KEY, makeOverlay, stripValue } from './overlay.js'
import type {
  ProxyCallMessage,
  ProxyCreateEvent,
  ProxyUpdateEvent,
  ProxyUpdateMessage,
  ProxyValue
} from './protocol.js'
import { DELETED_PROXY_ID } from './protocol.js'

let lastProxyId = 0

type ProxyObjectInfo = {
  proxyId: string,
  type: string,
  methodNames: Array<string>,
  valueNames: Array<string>
}

/**
 * The proxy sends messages to the client using this function.
 */
export type SendServerMessage = (message: ProxyUpdateMessage) => mixed

/**
 * Options that can be passed to a proxy server instance.
 */
export type ProxyServerOptions = {
  throttleMs?: number
}

/**
 * The server application is responsible for receiving messages from the
 * client and passing them into this object, as well as indicating when
 * state might have changed (needing a value diff).
 */
export type ProxyServer = {
  // Redux has changed, so check for new values:
  onUpdate(): mixed,

  // The client has sent a message:
  handleMessage(message: ProxyCallMessage): mixed
}

/**
 * Marks an API object as deleted.
 * It will be deleted on the client side during the next update.
 */
export function deleteApi (object: Object): mixed {
  object[PROXY_OBJECT_KEY].proxyId = DELETED_PROXY_ID
}

/**
 * Takes an object that implements an API,
 * validates that it only has methods and getters,
 * and tags it so the bridge knows this is an API.
 * Once this is done, the object may be passed over the bridge.
 */
export function makeApi<T: Object> (type: string, object: T): T {
  const methodNames = []
  const valueNames = []

  for (const name of Object.getOwnPropertyNames(object)) {
    const d = Object.getOwnPropertyDescriptor(object, name)
    if (d) {
      if (d.get) valueNames.push(name)
      else if (typeof d.value === 'function') methodNames.push(name)
      else {
        throw new Error(
          `API property ${name} is neither a getter nor an async method.`
        )
      }
    }
  }

  const info: ProxyObjectInfo = {
    proxyId: 'p' + ++lastProxyId,
    type,
    methodNames,
    valueNames
  }
  object[PROXY_OBJECT_KEY] = info
  return object
}

/**
 * Creates the server side of an API proxy.
 */
export function makeProxyServer (
  rootApi: Object,
  sendMessage: SendServerMessage,
  opts?: ProxyServerOptions = {}
): ProxyServer {
  const { throttleMs = 16 } = opts

  // Throttling:
  let lastUpdate: number = 0
  let updateTimeout: number | null = null

  // Proxy cache:
  const proxies: {
    [proxyId: string]: {
      object: Object,
      values: { [name: string]: any }
    }
  } = {}

  /**
   * Takes a value supplied by the user's API,
   * and extracts any API objects into an overlay,
   * updating the the proxy cache and creation messages
   * with any newly-discovered objects.
   */
  function splitValue (
    value: any,
    creates: Array<ProxyCreateEvent>
  ): ProxyValue {
    const overlay = makeOverlay(value, object => {
      const info: ProxyObjectInfo = object[PROXY_OBJECT_KEY]
      const { proxyId, type, methodNames, valueNames } = info
      if (proxies[proxyId] || proxyId === DELETED_PROXY_ID) return

      // We have discovered a proxy we don't know about:
      const values = {}
      for (const name of valueNames) {
        values[name] = object[name]
      }
      proxies[proxyId] = { object, values }

      // We need to tell the client about this as well:
      creates.push({
        proxyId,
        type,
        methods: methodNames,
        ...splitValue(values, creates)
      })
    })

    return { overlay, value: stripValue(value, overlay) }
  }

  /**
   * Sends an update message to the client.
   * Includes any value changes, new proxies, or deleted proxies
   * since the last update, as well as an optional method call result.
   */
  function sendUpdate (message: ProxyUpdateMessage) {
    const creates: Array<ProxyCreateEvent> = message.creates || []
    const deletes: Array<string> = []
    const updates: Array<ProxyUpdateEvent> = []
    message.creates = creates
    message.deletes = deletes
    message.updates = updates

    // Check for proxy changes:
    for (const proxyId in proxies) {
      const { object, values } = proxies[proxyId]
      const info: ProxyObjectInfo = object[PROXY_OBJECT_KEY]

      // Check for deleted proxies:
      if (info.proxyId === DELETED_PROXY_ID) {
        delete proxies[proxyId]
        deletes.push(proxyId)
      }

      // Check for updated properties:
      for (const name of info.valueNames) {
        const value = object[name]
        if (value !== values[name]) {
          values[name] = value
          updates.push({ proxyId, name, ...splitValue(value, creates) })
        }
      }
    }

    sendMessage(message)
  }

  /**
   * Sends an immediate update, bypassing the message throttling.
   * This is used for method call results.
   */
  const sendUpdateNow = (message: ProxyUpdateMessage) => {
    if (updateTimeout != null) {
      clearTimeout(updateTimeout)
      updateTimeout = null
    }
    lastUpdate = Date.now()
    return sendUpdate(message)
  }

  // Send the root API object:
  const creates: Array<ProxyCreateEvent> = []
  sendUpdateNow({ creates, root: splitValue(rootApi, creates) })

  return {
    /**
     * Something has changed in Redux,
     * so diff the proxies and update the client.
     */
    onUpdate () {
      // These updates are expensive, so we throttle them:
      const now = Date.now()
      if (lastUpdate + throttleMs <= now) {
        lastUpdate = now
        sendUpdate({})
      } else if (updateTimeout == null) {
        updateTimeout = setTimeout(() => {
          updateTimeout = null
          lastUpdate = Date.now()
          sendUpdate({})
        }, lastUpdate + throttleMs - now)
      }
    },

    /**
     * The client has sent us a message, so handle that.
     */
    handleMessage (message: ProxyCallMessage) {
      // Bogus messages:
      if (message.callId == null || message.proxyId == null) return

      const { callId, proxyId, method, params } = message
      try {
        // Find the method:
        if (!proxies[proxyId]) {
          throw new Error(`Invaid proxyId ${proxyId}`)
        }
        const { object } = proxies[proxyId]
        if (typeof object[method] !== 'function') {
          throw new Error(`Invaid method name '${method}'`)
        }

        // Call the method:
        Promise.resolve(object[method].apply(object, params))
          .then(result => {
            const creates: Array<ProxyCreateEvent> = []
            sendUpdateNow({
              creates,
              return: { callId, fail: false, ...splitValue(result, creates) }
            })
          })
          .catch(e => {
            const creates: Array<ProxyCreateEvent> = []
            sendUpdateNow({
              creates,
              return: { callId, fail: true, ...splitValue(e, creates) }
            })
          })
      } catch (e) {
        const creates: Array<ProxyCreateEvent> = []
        sendUpdateNow({
          creates,
          return: { callId, fail: true, ...splitValue(e, creates) }
        })
      }
    }
  }
}
