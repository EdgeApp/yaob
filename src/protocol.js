// @flow

import { type PackedData } from './data.js'

/**
 * A PackedData instance that handles object properties.
 */
export type PackedProps = { [name: string]: PackedData }

/**
 * The client sends this message to call methods on a proxy object.
 */
export type CallMessage = {
  callId: number,
  remoteId: number,
  name: string
} & PackedData // Parameter array

/**
 * The server sends this when the values on a proxy object change.
 */
export type ChangeMessage = {
  localId: number,
  props: PackedProps
}

/**
 * The server sends this when it creates a new proxy object.
 */
export type CreateMessage = {
  localId: number,
  methods: string[],
  props: PackedProps
}

/**
 * The server sends this when it creates a new proxy object.
 */
export type EventMessage = {
  localId: number,
  name: string
} & PackedData // Parameter array

/**
 * The server sends this when a proxy method call has returned or thrown.
 */
export type ReturnMessage = {
  callId: number
} & PackedData // Return value

/**
 * The server sends this whenever anything happens.
 * It can include the various event types described above.
 */
export type Message = {
  calls?: CallMessage[],
  changed?: ChangeMessage[],
  closed?: number[],
  created?: CreateMessage[],
  events?: EventMessage[],
  returns?: ReturnMessage[]
}
