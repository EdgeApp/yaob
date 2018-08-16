// @flow

import { describe, it } from 'mocha'

import { Bridgeable } from '../src/index.js'
import { makeAssertLog } from './utils/assert-log.js'
import { delay, makeLoggedBridge } from './utils/utils.js'

describe('events', function () {
  it('bridgeable', function () {
    const log = makeAssertLog({ sort: true })
    const p: Bridgeable<{
      bar: number,
      bogus: number,
      error: Error,
      foo: number
    }> = new Bridgeable()

    // Simple calls:
    p.on('foo', x => log(`callback1: ${x}`))
    const remove = p.on('foo', x => log(`callback2: ${x}`))
    p.emit('foo', 1)
    log.assert(['callback1: 1', 'callback2: 1'])

    // Removes callbacks:
    remove()
    p.emit('foo', 2)
    log.assert(['callback1: 2'])

    // Ignores missing stuff:
    p.emit('bar', 3)
    log.assert([])

    // Handles errors:
    p.on('error', e => log(e.toString()))
    p.on('bogus', x => {
      throw new Error('blew up')
    })
    p.emit('bogus', 1)
    log.assert(['Error: blew up'])
  })

  it('bridged', async function () {
    const log = makeAssertLog()
    class EventApi extends Bridgeable<{
      event: string
    }> {}

    const remote = new EventApi()
    const local = await makeLoggedBridge(log, remote)
    log.assert(['server +1 e1'])

    remote.on('event', payload => log('remote', payload))
    local.on('event', payload => log('local', payload))

    // Remote events should fire on both sides:
    remote.emit('event', 'payload 1')
    await delay(10)
    log.assert(['remote payload 1', 'server e1', 'local payload 1'])

    // Local events should stay local:
    local.emit('event', 'payload 2')
    await delay(10)
    log.assert(['local payload 2'])
  })
})