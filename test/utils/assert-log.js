// @flow

import { expect } from 'chai'

export type AssertLogOptions = {
  ignoreOrder?: boolean,
  verbose?: boolean
}

/**
 * Asserts that a correct sequence of events have occurred.
 * Used for testing callbacks.
 *
 * To log an event, call this function with a string describing the event.
 * Then, to verify that everything is correct, call the `assert` method
 * with an array of expected log strings. If there is a mis-match,
 * `assert` will throw an exception.
 */
export type AssertLog = ((...args: Array<unknown>) => unknown) & {
  assert(Array<string>): unknown,
  clear(): unknown
}

/**
 * Creates an object that can assert that the correct events have occurred.
 * Used for testing callbacks.
 * @param sort True to ignore the order of events.
 * @param verbose True to also send all logged events to the console.
 */
export function makeAssertLog (opts: AssertLogOptions = {}): AssertLog {
  const { ignoreOrder = false, verbose = false } = opts
  let events: Array<string> = []

  const out: any = function log () {
    let event = ''
    for (let i = 0; i < arguments.length; ++i) {
      const arg = arguments[i]
      if (i > 0) event += ' '
      event += typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    }

    if (verbose) console.log(event)
    events.push(event)
  }

  out.assert = function assert (expected: Array<string>) {
    ignoreOrder
      ? expect(events.sort()).to.deep.equal(expected.sort())
      : expect(events).to.deep.equal(expected)
    events = []
  }

  out.clear = function clear () {
    events = []
  }

  return out
}
