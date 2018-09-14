// @flow

import { expect } from 'chai'

import { Bridge } from '../../src/index.js'

export function delay (ms: number): Promise<unknown> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function promiseFail (
  promise: Promise<unknown>,
  text: string
): Promise<unknown> {
  return promise.then(
    ok => Promise.reject(new Error('Should fail')),
    e => expect(e.toString()).equals(text)
  )
}

/**
 * Creates a local client / server bridge with logging.
 */
export function makeLoggedBridge<T: Object> (
  log: string => unknown,
  root: T
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
      // console.log(message)
      server.handleMessage(JSON.parse(JSON.stringify(message)))
    }
  })
  const server = new Bridge({
    sendMessage (message) {
      log('server' + describeMessage(message))
      // console.log(message)
      client.handleMessage(JSON.parse(JSON.stringify(message)))
    }
  })

  server.sendRoot(root)
  const out: any = client.getRoot()
  return out
}
