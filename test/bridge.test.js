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

  it('filters private members', async function () {
    class SomeClass extends Bridgeable<> {
      prop: number
      _prop: number

      constructor () {
        super()
        this.prop = 1
        this._prop = 2
      }

      method () {}
      _method () {}
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
      foo () {
        return 12
      }
    }
    const local = makeLocalBridge(new SomeClass(), { SomeClass })
    expect(local).instanceof(SomeClass)
    expect(local.foo()).equals(12)
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

  it('bridges proxies', async function () {
    const log = makeAssertLog()
    class SomeClass extends Bridgeable<{ event: number }> {
      flag: boolean

      constructor () {
        super()
        this.flag = false
      }

      foo () {
        this.flag = true
        this.update()
        return 'bar'
      }
    }

    // Note that `makeLocalBridge` happens twice here:
    const remote = new SomeClass()
    const local = makeLocalBridge(makeLocalBridge(remote))
    expect(local.flag).equals(false)
    local.on('event', x => log('got event', x))

    // Quickly try the basics:
    remote.emit('event', 1)
    expect(await local.foo()).equals('bar')
    expect(local.flag).equals(true)
    log.assert(['got event 1'])
  })
})
