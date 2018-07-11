// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { makeApi, makeProxyClient, makeProxyServer } from '../src/index.js'
import { PROXY_OBJECT_KEY, makeOverlay, stripValue } from '../src/overlay.js'
import { makeAssertLog } from './assert-log.js'
import { makeTestApi } from './fixture.js'

function getProxyId (api: any): string {
  return api[PROXY_OBJECT_KEY].proxyId
}

describe('overlay creation', function () {
  it('handles primitives', function () {
    expect(makeOverlay(false)).equals(null)
    expect(makeOverlay(true)).equals(null)
    expect(makeOverlay(null)).equals(null)
    expect(makeOverlay(1)).equals(null)
    expect(makeOverlay('blah')).equals(null)
  })

  it('handles API objects', function () {
    const data = makeApi('Demo', {})
    const proxyId = getProxyId(data)

    // Make the overlay:
    const overlay = makeOverlay(data)
    expect(overlay).equals(proxyId)

    // Strip the value:
    if (overlay == null) return // Make Flow happy
    expect(stripValue(data, overlay)).deep.equals(null)
  })

  it('handles objects', function () {
    const data = {
      nested: {
        api: makeApi('Demo', {}),
        boolean: true,
        empty: null,
        number: 2,
        string: 'blah'
      }
    }
    const proxyId = getProxyId(data.nested.api)

    // Make the overlay:
    const overlay = makeOverlay(data)
    expect(overlay).deep.equals({ nested: { api: proxyId } })

    // Strip the value:
    if (overlay == null) return // Make Flow happy
    expect(stripValue(data, overlay)).deep.equals({
      nested: {
        api: null,
        boolean: true,
        empty: null,
        number: 2,
        string: 'blah'
      }
    })
  })

  it('handles arrays', function () {
    const data = [true, [false, makeApi('Demo', {}), null]]
    const proxyId = getProxyId(data[1][1])

    // Make the overlay:
    const overlay = makeOverlay(data)
    expect(overlay).deep.equals([null, [null, proxyId, null]])
    // expect(overlay).deep.equals({ '1': { '1': proxyId } })

    // Strip the value:
    if (overlay == null) return // Make Flow happy
    expect(stripValue(data, overlay)).deep.equals([true, [false, null, null]])
  })

  it('calls the visitor', function () {
    const data = {
      api: makeApi('Demo', {}),
      nested: { api: makeApi('Demo', {}) }
    }

    let callCount = 0
    makeOverlay(data, api => ++callCount)
    expect(callCount).equals(2)
  })
})

describe('end-to-end', function () {
  it('everything works', async function () {
    const log = makeAssertLog()
    const serverRoot = makeTestApi(log)

    // Ping-pong messages between the client and the server:
    function sendClientMessage (message) {
      log('call')
      server.handleMessage(message)
    }

    function sendServerMessage (message) {
      let string = 'update'
      if (message.root) string += ' b'
      if (message.creates && message.creates.length) string += ' c'
      if (message.deletes && message.deletes.length) string += ' d'
      if (message.return) string += ' r'
      if (message.updates && message.updates.length) string += ' u'
      log(string)

      if (!client) {
      } else {
        client.handleMessage(message)
      }
    }

    // Start the client and the server:
    const client = makeProxyClient(sendClientMessage)
    const server = makeProxyServer(serverRoot, sendServerMessage)
    log.assert(['update b c'])

    // Get the client-side API:
    const clientRoot: typeof serverRoot = await client.root
    expect(clientRoot.count).equals(0)
    clientRoot.on('countChanged', (count: number) =>
      log('countChanged ' + count)
    )

    // Try changing the property:
    await clientRoot.addCount(2)
    expect(clientRoot.count).equals(2)
    log.assert(['call', 'addCount 2', 'update r u', 'countChanged 2'])

    // Try catching an error:
    const staticFail: any = await clientRoot.alwaysThrows().catch(e => e)
    expect(staticFail).instanceof(Error)
    expect(staticFail.message).equals('I will never be happy')
    log.assert(['call', 'update r'])

    // Access the static child:
    const staticChild = clientRoot.childList[1]
    if (typeof staticChild.answer !== 'number') {
      throw new TypeError('missing answer')
    }
    expect(staticChild.answer).equals(42)

    // Create a sub-child:
    const dynamicChild = await clientRoot.makeChild()
    expect(await dynamicChild.method()).to.equal('alive')
    log.assert([
      'call',
      'makeChild',
      'update c r',
      'call',
      'method',
      'update r'
    ])

    // Kill the sub-child:
    await clientRoot.killChild()
    const dynamicFail: any = await dynamicChild.method().catch(e => e)
    expect(dynamicFail).instanceof(Error)
    expect(dynamicFail.message).equals(
      "Calling method 'method' on deleted object 'DynamicChild'"
    )
    log.assert(['call', 'killChild', 'update d r'])
  })
})
