// @flow

import { expect } from 'chai'

import { Bridge, type SharedClasses } from '../../src/index.js'

export function delay (ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function promiseFail (
  promise: Promise<mixed>,
  text: string
): Promise<mixed> {
  return promise.then(
    ok => Promise.reject(new Error('Should fail')),
    e => expect(e.toString()).equals(text)
  )
}

/**
 * Creates a local client / server bridge with logging.
 */
export function makeLoggedBridge<T: Object> (
  log: string => mixed,
  root: T,
  sharedClasses: SharedClasses = {}
): Promise<T> {
  function describeMessage (message): string {
    let out = ''
    if (message.closed) out += ' -' + message.closed.length
    if (message.changed) out += ' ~' + message.changed.length
    if (message.created) out += ' +' + message.created.length

    if (message.calls) out += ' c' + message.calls.length
    if (message.events) out += ' e' + message.events.length
    if (message.returns) out += ' r' + message.returns.length
    return out
  }

  const client = new Bridge({
    sendMessage (message) {
      log('client' + describeMessage(message))
      server.handleMessage(JSON.parse(JSON.stringify(message)))
    },
    sharedClasses
  })
  const server = new Bridge({
    sendMessage (message) {
      log('server' + describeMessage(message))
      client.handleMessage(JSON.parse(JSON.stringify(message)))
    },
    sharedClasses
  })

  server.sendRoot(root)
  const out: any = client.getRoot()
  return out
}
