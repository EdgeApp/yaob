// @flow

import { makeAssertLog } from 'assert-log'
import { expect } from 'chai'
import { describe, it } from 'mocha'

import type { Subscriber } from '../src/index.js'
import {
  Bridgeable,
  bridgifyClass,
  bridgifyObject,
  emit,
  makeLocalBridge,
  onMethod
} from '../src/index.js'
import { expectRejection } from './utils/expect-rejection.js'
import { makeLoggedBridge } from './utils/logged-bridge.js'

describe('bridging', function () {
  it('maintains object identity', async function () {
    const log = makeAssertLog()
    class ChildApi extends Bridgeable<> {}
    const remoteChild = new ChildApi()

    class ParentApi extends Bridgeable<> {
      get children() {
        return [remoteChild, remoteChild]
      }
    }

    const remote = new ParentApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert('server +2 e1')

    // The two children are the same object on the client side:
    expect(local.children.length).equals(2)
    expect(local.children[0]).equals(local.children[1])
  })

  it('handles recursive objects', async function () {
    const log = makeAssertLog()
    class LoopyApi extends Bridgeable<> {
      get self() {
        return this
      }
    }

    const remote = new LoopyApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert('server +1 e1')

    expect(local.self).equals(local)
  })

  it('filters private members', async function () {
    class SomeClass extends Bridgeable<> {
      prop: number
      _prop: number

      constructor() {
        super()
        this.prop = 1
        this._prop = 2
      }

      method() {}
      _method() {}
    }
    const local = makeLocalBridge(new SomeClass())
    expect(local.method).is.a('function')
    expect(local.prop).equals(1)
    expect(local).to.not.have.property('_method')
    expect(local).to.not.have.property('_prop')
  })

  it('calls methods', async function () {
    const log = makeAssertLog()
    class MethodApi extends Bridgeable<> {
      simple(x: number) {
        return x * 2
      }

      throws() {
        throw new Error('I will never be happy')
      }
    }

    const remote = new MethodApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert('server +1 e1')

    expect(await local.simple(21)).equals(42)
    log.assert('client c1', 'server r1')

    await expectRejection(local.throws(), 'Error: I will never be happy')
    log.assert('client c1', 'server r1')
  })

  it('getter throws', function () {
    class Boom {
      get bar() {
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
      foo() {}
    }
    bridgifyClass(SomeClass)
    const local = makeLocalBridge(new SomeClass())
    expect(local.foo).is.a('function')
  })

  it('bridgifyObject', function () {
    const remote = {
      foo() {}
    }
    bridgifyObject(remote)
    const local = makeLocalBridge(remote)
    expect(local.foo).is.a('function')
  })

  it('preserves onMethod', async function () {
    const log = makeAssertLog()
    class SomeClass {
      on: Subscriber<{ event: number }>
    }
    SomeClass.prototype.on = onMethod
    bridgifyClass(SomeClass)

    const remote = new SomeClass()
    const local = makeLocalBridge(remote)
    local.on('event', x => log('got event', x))

    emit(remote, 'event', 1)
    await log.waitFor(1).assert('got event 1')
  })

  it('bridges proxies', async function () {
    const log = makeAssertLog()
    class SomeClass extends Bridgeable<{ flag: boolean }, { event: number }> {
      flag: boolean

      constructor() {
        super()
        this.flag = false
      }

      foo() {
        this.flag = true
        this._update()
        return 'bar'
      }
    }

    // Note that `makeLocalBridge` happens twice here:
    const remote = new SomeClass()
    const local = makeLocalBridge(makeLocalBridge(remote))
    expect(local.flag).equals(false)
    local.on('event', x => log('got event', x))
    local.watch('flag', x => log('got flag', x))

    // Try an event:
    remote._emit('event', 1)
    await log.waitFor(1).assert('got event 1')

    // Try a method:
    expect(await local.foo()).equals('bar')
    log.assert('got flag true')
    expect(local.flag).equals(true)
  })

  it('hides requested properties', async function () {
    const remote = bridgifyObject({
      a: 1,
      b: 2
    })

    const local = makeLocalBridge(remote, { hideProperties: ['b'] })
    expect(local.a).equals(1)
    expect(local.b).equals(2)
    expect(Object.keys(local)).deep.equals(['a'])
    expect(JSON.stringify(local)).equals('{"a":1}')
  })
})
