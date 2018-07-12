// @flow

export const OVERLAY_DELETED_PROXY = 'x'
export const OVERLAY_ERROR = 'e'
export const OVERLAY_UNDEFINED = 'u'

/**
 * A pure JSON value type.
 */
export type JsonValue =
  | { [name: string]: JsonValue }
  | Array<JsonValue>
  | false
  | null
  | number
  | string
  | true

/**
 * The bridge sends proxy instances as an overlay.
 * To reconstruct the original value with proxies in place,
 * replace each `number` in the overlay with the matching proxy instance,
 * then deeply merge the overlay with the data value.
 */
export type ProxyOverlay =
  | { [name: string]: ProxyOverlay }
  | Array<ProxyOverlay>
  | string
  | null

/**
 * A value for sending over the wire.
 * It has any proxies filtered out into an overlay.
 */
export type ProxyValue = {
  overlay: ProxyOverlay,
  value: JsonValue
}

/**
 * The client sends this message to call methods on a proxy object.
 */
export type ProxyCallMessage = {
  callId: number,
  proxyId: string,
  method: string,
  params: Array<JsonValue>
}

/**
 * The server sends this when it creates a new proxy object.
 */
export type ProxyCreateEvent = {
  proxyId: string,
  type: string,
  methods: Array<string>,
  overlay: ProxyOverlay,
  value: JsonValue
}

/**
 * The server sends this when it creates a new proxy object.
 */
export type ProxyEventEvent = {
  proxyId: string,
  name: string,
  overlay: ProxyOverlay,
  value: JsonValue
}

/**
 * The server sends this when a proxy method call has returned or thrown.
 */
export type ProxyReturnEvent = {
  callId: number,
  fail: boolean,
  overlay: ProxyOverlay,
  value: JsonValue
}

/**
 * The server sends this when the values on a proxy object change.
 */
export type ProxyUpdateEvent = {
  proxyId: string,
  name: string,
  overlay: ProxyOverlay,
  value: JsonValue
}

/**
 * The server sends this whenever anything happens.
 * It can include the various event types described above.
 */
export type ProxyUpdateMessage = {
  creates?: Array<ProxyCreateEvent>,
  deletes?: Array<string>,
  event?: ProxyEventEvent,
  return?: ProxyReturnEvent,
  root?: ProxyValue,
  updates?: Array<ProxyUpdateEvent>
}
