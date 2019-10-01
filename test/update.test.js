// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { Bridgeable, update } from '../src/index.js'
import { makeAssertLog } from './utils/assert-log.js'
import { delay, makeLoggedBridge } from './utils/utils.js'

describe('updating', function() {
  it('simple mutation', async function() {
    const log = makeAssertLog()
    class MutationApi extends Bridgeable<{ count: number }> {
      count: number

      constructor() {
        super()
        this.count = 0
      }

      increment(step: number): number {
        this.count = this.count + step
        update(this)
        return this.count
      }

      incrementWithoutUpdate(step: number): number {
        this.count = this.count + step
        return this.count
      }
    }

    const remote = new MutationApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    expect(local.count).equals(0)
    local.watch('count', count => log('local', count))
    remote.watch('count', count => log('remote', count))

    // Client-triggered mutation should reflect locally:
    expect(await local.increment(1)).equals(1)
    expect(local.count).equals(1)
    log.assert(['client c1', 'remote 1', 'server ~1 r1', 'local 1'])

    // Quiet mutation works, but doesn't mirror locally:
    expect(await local.incrementWithoutUpdate(2)).equals(3)
    expect(local.count).equals(1)
    log.assert(['client c1', 'server r1'])

    // Server-triggered mutation mirrors locally:
    expect(remote.increment(3)).equals(6)
    await delay(10)
    expect(local.count).equals(6)
    log.assert(['remote 6', 'server ~1', 'local 6'])
  })

  it('deep mutation', async function() {
    const log = makeAssertLog()
    class MutationApi extends Bridgeable<{ list: Array<number> }> {
      list: Array<number>

      constructor() {
        super()
        this.list = []
      }

      push(item: number): Array<number> {
        this.list.push(item)
        update(this, 'list')
        return this.list
      }

      pushWithGeneralUpdate(item: number): Array<number> {
        this.list.push(item)
        update(this)
        return this.list
      }

      pushWithoutUpdate(item: number): Array<number> {
        this.list.push(item)
        return this.list
      }
    }

    const remote = new MutationApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    expect(local.list).deep.equals([])
    local.watch('list', list => log('local', list.length))
    remote.watch('list', list => log('remote', list.length))

    // Client-triggered mutation should reflect locally:
    expect(await local.push(1)).deep.equals([1])
    expect(local.list).deep.equals([1])
    log.assert(['client c1', 'remote 1', 'server ~1 r1', 'local 1'])

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
    log.assert(['remote 4', 'server ~1', 'local 4'])
  })

  it('before closing', async function() {
    const log = makeAssertLog()
    class MutationApi extends Bridgeable<{
      count: number,
      list: Array<number>
    }> {
      count: number
      list: Array<number>

      constructor() {
        super()
        this.count = 0
        this.list = []
      }

      close(): number {
        this.count += 1
        this.list.push(this.count)
        this._update('list')
        this._close()
        return this.count
      }
    }

    const local = await makeLoggedBridge(log, new MutationApi())
    log.assert(['server +1 e1'])

    expect(local.count).equals(0)
    expect(local.list).deep.equals([])
    local.watch('count', count => log('local', count))

    // Changes before destruction should still come across:
    expect(await local.close()).equals(1)
    expect(local.count).equals(1)
    expect(local.list).deep.equals([1])
    log.assert(['client c1', 'server -1 ~1 r1', 'local 1'])
  })
})
