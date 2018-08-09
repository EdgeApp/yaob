// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { Bridgeable, update } from '../src/index.js'
import { makeAssertLog } from './utils/assert-log.js'
import { delay, makeLoggedBridge } from './utils/utils.js'

describe('updating', function () {
  it('simple mutation', async function () {
    const log = makeAssertLog()
    class MutationApi extends Bridgeable<{ countChanged: number }> {
      count: number

      constructor () {
        super()
        this.count = 0
      }

      increment (step: number) {
        this.count = this.count + step
        update(this)
        return this.count
      }

      incrementWithoutUpdate (step: number) {
        this.count = this.count + step
        return this.count
      }
    }

    const remote = new MutationApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    expect(local.count).equals(0)
    local.on('countChanged', count => log('on', count))

    // Client-triggered mutation should reflect locally:
    expect(await local.increment(1)).equals(1)
    expect(local.count).equals(1)
    log.assert(['client c1', 'server ~1 r1', 'on 1'])

    // Quiet mutation works, but doesn't mirror locally:
    expect(await local.incrementWithoutUpdate(2)).equals(3)
    expect(local.count).equals(1)
    log.assert(['client c1', 'server r1'])

    // Server-triggered mutation mirrors locally:
    expect(remote.increment(3)).equals(6)
    await delay(10)
    expect(local.count).equals(6)
    log.assert(['server ~1', 'on 6'])
  })

  it('deep mutation', async function () {
    const log = makeAssertLog()
    class MutationApi extends Bridgeable<{ listChanged: Array<number> }> {
      list: Array<number>

      constructor () {
        super()
        this.list = []
      }

      push (item: number) {
        this.list.push(item)
        update(this, 'list')
        return this.list
      }

      pushWithGeneralUpdate (item: number) {
        this.list.push(item)
        update(this)
        return this.list
      }

      pushWithoutUpdate (item: number) {
        this.list.push(item)
        return this.list
      }
    }

    const remote = new MutationApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    expect(local.list).deep.equals([])
    local.on('listChanged', list => log('on', list.length))

    // Client-triggered mutation should reflect locally:
    expect(await local.push(1)).deep.equals([1])
    expect(local.list).deep.equals([1])
    log.assert(['client c1', 'server ~1 r1', 'on 1'])

    // Quiet mutation works, but doesn't mirror locally:
    expect(await local.pushWithoutUpdate(2)).deep.equals([1, 2])
    expect(local.list).deep.equals([1])
    log.assert(['client c1', 'server r1'])

    // Non-specific updates also doesn't mirror locally:
    expect(await local.pushWithGeneralUpdate(4)).deep.equals([1, 2, 4])
    expect(local.list).deep.equals([1])
    log.assert(['client c1', 'server r1'])

    // Server-triggered mutation mirrors locally:
    expect(remote.push(8)).deep.equals([1, 2, 4, 8])
    await delay(10)
    expect(local.list).deep.equals([1, 2, 4, 8])
    log.assert(['server ~1', 'on 4'])
  })
})
