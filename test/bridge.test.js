// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  Bridgeable,
  type OnMethod,
  bridgifyClass,
  bridgifyObject,
  emitEvent,
  makeLocalBridge,
  onMethod
} from '../src/index.js'
import { makeAssertLog } from './utils/assert-log.js'
import { delay, makeLoggedBridge, promiseFail } from './utils/utils.js'

describe('bridging', function () {
  it('maintains object identity', async function () {
    const log = makeAssertLog()
    class ChildApi extends Bridgeable<> {}
    const remoteChild = new ChildApi()

    class ParentApi extends Bridgeable<> {
      get children () {
        return [remoteChild, remoteChild]
      }
    }

    const remote = new ParentApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +2 e1'])

    // The two children are the same object on the client side:
    expect(local.children.length).equals(2)
    expect(local.children[0]).equals(local.children[1])
  })

  it('handles recursive objects', async function () {
    const log = makeAssertLog()
    class LoopyApi extends Bridgeable<> {
      get self () {
        return this
      }
    }

    const remote = new LoopyApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    expect(local.self).equals(local)
  })

  it('calls methods', async function () {
    const log = makeAssertLog()
    class MethodApi extends Bridgeable<> {
      simple (x: number) {
        return x * 2
      }

      throws () {
        throw new Error('I will never be happy')
      }
    }

    const remote = new MethodApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    expect(await local.simple(21)).equals(42)
    log.assert(['client c1', 'server r1'])

    await promiseFail(local.throws(), 'Error: I will never be happy')
    log.assert(['client c1', 'server r1'])
  })

  it('getter throws', function () {
    class Boom {
      get bar () {
        throw new Error('Oops!')
      }
    }

    const local = makeLocalBridge(new Boom())

    try {
      expect(local.bar)
      throw new Error('Should throw')
    } catch (e) {
      expect(String(e)).equals('Error: Oops!')
    }
  })

  it('bridgifyClass', function () {
    class SomeClass {
      foo () {}
    }
    bridgifyClass(SomeClass)
    const local = makeLocalBridge(new SomeClass())
    expect(local.foo).is.a('function')
  })

  it('bridgifyObject', function () {
    const remote = {
      foo () {}
    }
    bridgifyObject(remote)
    const local = makeLocalBridge(remote)
    expect(local.foo).is.a('function')
  })

  it('shared classes', function () {
    class SomeClass {
      foo () {}
    }
    const local = makeLocalBridge(new SomeClass(), { SomeClass })
    expect(local).instanceof(SomeClass)
    expect(typeof local.foo).equals('function')
  })

  it('preserves onMethod', async function () {
    const log = makeAssertLog()
    class SomeClass {
      on: OnMethod<{ event: number }>
    }
    SomeClass.prototype.on = onMethod
    bridgifyClass(SomeClass)

    const remote = new SomeClass()
    const local = makeLocalBridge(remote)
    local.on('event', x => log('got event', x))

    emitEvent(remote, 'event', 1)
    await delay(10)
    log.assert(['got event 1'])
  })
})
