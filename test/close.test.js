// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { Bridgeable, closeObject } from '../src/index.js'
import { makeAssertLog } from './utils/assert-log.js'
import { delay, makeLoggedBridge, promiseFail } from './utils/utils.js'

class ChildBase extends Bridgeable<> {
  syncMethod (x: number) {
    return x * 2
  }
}

class ChildApi extends ChildBase {
  get answer () {
    return 42
  }
  async asyncMethod (x: number) {
    return x * 3
  }
}

class ParentApi extends Bridgeable<> {
  async makeChild () {
    return new ChildApi()
  }

  async closeChild (child: ChildApi) {
    closeObject(child)
  }
}

function checkDestruction (child: ChildApi): Promise<mixed> {
  function f (bogus) {}

  // Client-side methods work:
  expect(child.syncMethod(1.5)).equals(3)

  // Remote property access fails:
  try {
    f(child.answer)
    throw new Error('should throw')
  } catch (e) {
    expect(e.toString()).equals(
      "TypeError: Cannot read property 'answer' of deleted proxy"
    )
  }

  // Remote method call fails:
  return promiseFail(
    child.asyncMethod(1.5),
    "TypeError: Cannot call method 'asyncMethod' of closed proxy"
  )
}

describe('closing', function () {
  it('remote closure', async function () {
    const log = makeAssertLog()
    const remote = new ParentApi()
    const local = await makeLoggedBridge(log, remote, { ChildBase })
    const child = await local.makeChild()
    log.assert(['server +1 e1', 'client c1', 'server +1 r1'])

    // We can call child methods:
    expect(child).instanceof(ChildBase)
    expect(await child.asyncMethod(1.5)).equals(4.5)
    log.assert(['client c1', 'server r1'])

    // Ask the server to close the child:
    await local.closeChild(child)
    await checkDestruction(child)
    log.assert(['client c1', 'server -1 r1'])
  })

  it('client-side closure', async function () {
    const log = makeAssertLog()
    const remote = new ParentApi()
    const local = await makeLoggedBridge(log, remote, { ChildBase })
    const child = await local.makeChild()
    log.assert(['server +1 e1', 'client c1', 'server +1 r1'])

    // Deleting local proxies disables property access:
    closeObject(child)
    await checkDestruction(child)
    await delay(10)
    log.assert([])

    // Cannot send deleted proxies over the bridge:
    await promiseFail(
      local.closeChild(child),
      'TypeError: Closed bridge object at closeChild.arguments[0]'
    )
    log.assert(['client c1', 'server r1'])
  })

  it('server closure', async function () {
    const log = makeAssertLog()
    const remote = new ChildApi()
    const local = await makeLoggedBridge(log, remote, { ChildBase })
    log.assert(['server +1 e1'])

    // The server closes the object on its own initiative:
    closeObject(remote)
    await delay(10)
    await checkDestruction(local)
    log.assert(['server -1'])
  })
})
