// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { Bridgeable, close, shareData } from '../src/index.js'
import { makeAssertLog } from './utils/assert-log.js'
import { delay, makeLoggedBridge, promiseFail } from './utils/utils.js'

class ChildApi extends Bridgeable<> {
  get answer () {
    return 42
  }

  async asyncMethod (x: number) {
    return x * 3
  }

  syncMethod (x: number) {
    return x * 2
  }
}

shareData({
  'ChildApi.syncMethod': ChildApi.prototype.syncMethod
})

class ParentApi extends Bridgeable<> {
  async makeChild () {
    return new ChildApi()
  }

  async closeChild (child: ChildApi) {
    close(child)
  }
}

function checkDestruction (child: ChildApi): Promise<mixed> {
  // Client-side methods & properties work:
  expect(child.syncMethod(1.5)).equals(3)
  expect(child.answer).equals(42)

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
    const local = await makeLoggedBridge(log, remote)
    const child = await local.makeChild()
    log.assert(['server +1 e1', 'client c1', 'server +1 r1'])

    // We can call child methods:
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
    const local = await makeLoggedBridge(log, remote)
    const child = await local.makeChild()
    log.assert(['server +1 e1', 'client c1', 'server +1 r1'])

    // Deleting local proxies disables property access:
    close(child)
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
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    // The server closes the object on its own initiative:
    close(remote)
    await delay(10)
    await checkDestruction(local)
    log.assert(['server -1'])
  })
})
