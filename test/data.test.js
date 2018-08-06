// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import { type PackedData, packData, unpackData } from '../src/data.js'
import { Bridgeable, closeObject } from '../src/index.js'
import { getInstanceMagic } from '../src/magic.js'
import { makeProxy } from '../src/objects.js'
import { BridgeState } from '../src/state.js'

const dummyOptions = { sendMessage () {} }

describe('packData', function () {
  it('handles simple types', function () {
    const state = new BridgeState(dummyOptions)
    const sparseArray = []
    sparseArray[2] = 2

    const cases: Array<[mixed, PackedData]> = [
      // Primitives:
      [false, { raw: false }],
      [true, { raw: true }],
      [null, { raw: null }],
      [1, { raw: 1 }],
      ['blah', { raw: 'blah' }],
      [void 0, { map: 'u', raw: null }],

      // Arrays:
      [[0, 1], { raw: [0, 1] }],
      [[0, void 0], { map: ['', 'u'], raw: [0, null] }],
      [sparseArray, { map: ['u', 'u', ''], raw: [null, null, 2] }],

      // Objects:
      [{ x: 1, y: 2 }, { raw: { x: 1, y: 2 } }],
      [{ x: 1, y: void 0 }, { map: { y: 'u' }, raw: { x: 1, y: null } }],

      // Invalid types:
      [() => {}, { map: '?', raw: 'function' }],
      [{ x: 1, y () {} }, { map: { y: '?' }, raw: { x: 1, y: 'function' } }]
    ]

    for (const [data, packed] of cases) {
      expect(packData(state, data)).deep.equals(packed)
    }
  })

  it('handles error types', function () {
    const state = new BridgeState(dummyOptions)

    // Builtin errors:
    const error = new Error('e')
    const typeError = new TypeError('type')

    // Complex error:
    function PayloadError (payload: Object, message: string): Error {
      const e: Object = new Error(message)
      e.payload = payload
      e.name = 'PayloadError'
      return e
    }
    const payloadError = new PayloadError({ x: void 0, y: 1 }, 'payload')

    const cases: Array<[mixed, PackedData]> = [
      [
        error,
        {
          base: null,
          raw: { message: 'e', stack: error.stack }
        }
      ],
      [
        typeError,
        {
          base: 'TypeError',
          raw: { message: 'type', stack: typeError.stack }
        }
      ],
      [
        payloadError,
        {
          base: null,
          map: { payload: { x: 'u' } },
          raw: {
            message: 'payload',
            name: 'PayloadError',
            payload: { x: null, y: 1 },
            stack: payloadError.stack
          }
        }
      ]
    ]

    for (const [data, raw] of cases) {
      const split = packData(state, data)
      expect(split).deep.equals({ map: 'e', raw })
    }
  })

  it('handles proxy types', function () {
    const state = new BridgeState(dummyOptions)

    // Normal object:
    const p1 = new Bridgeable()
    const id1 = state.getPackedId(getInstanceMagic(p1))

    // Closed object:
    const p2 = new Bridgeable()
    closeObject(p2)
    const id2 = state.getPackedId(getInstanceMagic(p2))
    expect(id2).equals(null)

    // Proxy object:
    const p3 = makeProxy(state, {
      localId: 2,
      methods: [],
      props: {}
    })
    state.proxies[2] = p3
    const id3 = state.getPackedId(getInstanceMagic(p3))
    expect(id3).lessThan(0)

    const cases: Array<[Object, PackedData]> = [
      [p1, { map: 'o', raw: id1 }],
      [p2, { map: 'o', raw: null }],
      [p3, { map: 'o', raw: id3 }]
    ]

    for (const [data, split] of cases) {
      expect(packData(state, data)).deep.equals(split)
    }
  })
})

describe('unpackData', function () {
  it('restores simple types', function () {
    const state = new BridgeState(dummyOptions)

    const cases: Array<[mixed, PackedData]> = [
      // Primitives:
      [false, { raw: false }],
      [true, { raw: true }],
      [null, { raw: null }],
      [1, { raw: 1 }],
      ['blah', { raw: 'blah' }],
      [void 0, { map: 'u', raw: null }],

      // Arrays:
      [[0, 1], { raw: [0, 1] }],
      [[0, void 0], { map: ['', 'u'], raw: [0, null] }],
      [[void 0, 2], { map: ['u', ''], raw: [null, 2] }],

      // Objects:
      [{ x: 1, y: 2 }, { raw: { x: 1, y: 2 } }],
      [{ x: 1, y: void 0 }, { map: { y: 'u' }, raw: { x: 1, y: null } }]
    ]

    for (const [data, packed] of cases) {
      expect(unpackData(state, packed, 'path')).deep.equals(data)
    }
  })

  it('throws for invalid types', function () {
    const state = new BridgeState(dummyOptions)
    const cases: Array<[PackedData, string]> = [
      [
        { map: '?', raw: 'function' },
        'TypeError: Unsupported value of type function at path'
      ],
      [
        { map: { y: '?' }, raw: { x: 1, y: 'function' } },
        'TypeError: Unsupported value of type function at path.y'
      ],
      [
        { map: ['', '?'], raw: [1, 'symbol'] },
        'TypeError: Unsupported value of type symbol at path[1]'
      ],
      [
        { map: ['', { z: '?' }], raw: [1, { z: null }] },
        'TypeError: Unsupported value of type ? at path[1].z'
      ],
      [
        { map: { cleared: 'o' }, raw: { cleared: null } },
        'TypeError: Closed bridge object at path.cleared'
      ],
      [
        { map: { bogus: 'o' }, raw: { bogus: NaN } },
        'RangeError: Invalid packedId at path.bogus'
      ]
    ]

    for (const [packed, message] of cases) {
      try {
        unpackData(state, packed, 'path')
        throw new Error(`should throw ${message}`)
      } catch (e) {
        expect(e.toString()).equals(message)
      }
    }
  })

  it('restores Error payload', function () {
    const state = new BridgeState(dummyOptions)
    const stack = new Error().stack
    const packed = {
      map: 'e',
      raw: {
        base: null,
        map: { payload: { x: 'u' } },
        raw: {
          message: 'm',
          name: 'PayloadError',
          payload: { x: null, y: 1 },
          stack
        }
      }
    }

    const e = unpackData(state, packed, 'error')
    expect(e).instanceof(Error)
    expect(e.message).equals('m')
    expect(e.payload).deep.equals({ x: void 0, y: 1 })
    expect(e.name).equals('PayloadError')
  })

  it('restores TypeError', function () {
    const state = new BridgeState(dummyOptions)
    const stack = new TypeError().stack
    const packed = {
      map: 'e',
      raw: {
        base: 'TypeError',
        map: '',
        raw: { message: 'map', stack }
      }
    }

    const e = unpackData(state, packed, 'error')
    expect(e).instanceof(TypeError)
    expect(e.name).equals('TypeError')
  })

  it('restores proxy types', function () {
    const state = new BridgeState(dummyOptions)

    class Derived extends Bridgeable<{ foo: string }> {}
    const p1 = new Bridgeable()
    const p2 = new Derived()
    const o1 = {}

    state.proxies[1] = p1
    state.proxies[2] = p2
    state.objects[1] = o1

    const cases: Array<[Object, PackedData]> = [
      [p1, { map: 'o', raw: 1 }],
      [p2, { map: 'o', raw: 2 }],
      [o1, { map: 'o', raw: -1 }]
    ]

    for (const [data, packed] of cases) {
      expect(unpackData(state, packed, 'path')).equal(data)
    }
  })
})
