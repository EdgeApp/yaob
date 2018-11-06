// @flow

import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  type ObjectTable,
  type PackedData,
  packData,
  unpackData
} from '../src/data.js'
import { MAGIC_KEY } from '../src/magic.js'

/**
 * An simplified object table for testing.
 */
class MockTable implements ObjectTable {
  objects: Array<Object>
  proxies: Array<Object>

  constructor () {
    this.objects = []
    this.proxies = []
  }

  getObject (packedId: number) {
    return packedId < 0 ? this.proxies[-packedId] : this.objects[packedId]
  }

  getPackedId (o: Object) {
    const magic = o[MAGIC_KEY]
    if (magic == null) throw new TypeError('Not a bridgeable object')
    if (magic.closed) return null
    if (magic.remoteId != null) return -magic.remoteId
    return magic.localId
  }
}

const emptyTable = new MockTable()

describe('packData', function () {
  it('handles simple types', function () {
    const sparseArray = []
    sparseArray[2] = 2

    const cases: Array<[mixed, PackedData]> = [
      // Primitives:
      [false, { raw: false }],
      [true, { raw: true }],
      [null, { raw: null }],
      [1, { raw: 1 }],
      [NaN, { raw: NaN }],
      ['blah', { raw: 'blah' }],
      [void 0, { map: 'u', raw: null }],
      [new Date(1500000000000), { map: 'd', raw: '2017-07-14T02:40:00.000Z' }],

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
      expect(packData(emptyTable, data)).deep.equals(packed)
    }
  })

  it('handles error types', function () {
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
      const split = packData(emptyTable, data)
      expect(split).deep.equals({ map: 'e', raw })
    }
  })

  it('handles bridgeable objects', function () {
    const o1 = {}
    const o2 = {}
    const o3 = {}

    o1[MAGIC_KEY] = { localId: 1 }
    o2[MAGIC_KEY] = { remoteId: 2 }
    o3[MAGIC_KEY] = { closed: true }

    const cases: Array<[Object, PackedData]> = [
      [o1, { map: 'o', raw: 1 }],
      [o2, { map: 'o', raw: -2 }],
      [o3, { map: 'o', raw: null }]
    ]

    for (const [data, split] of cases) {
      expect(packData(emptyTable, data)).deep.equals(split)
    }
  })
})

describe('unpackData', function () {
  it('restores simple types', function () {
    const cases: Array<[mixed, PackedData]> = [
      // Primitives:
      [false, { raw: false }],
      [true, { raw: true }],
      [null, { raw: null }],
      [1, { raw: 1 }],
      ['blah', { raw: 'blah' }],
      [void 0, { map: 'u', raw: null }],
      [new Date(1500000000000), { map: 'd', raw: '2017-07-14T02:40:00.000Z' }],

      // Arrays:
      [[0, 1], { raw: [0, 1] }],
      [[0, void 0], { map: ['', 'u'], raw: [0, null] }],
      [[void 0, 2], { map: ['u', ''], raw: [null, 2] }],

      // Objects:
      [{ x: 1, y: 2 }, { raw: { x: 1, y: 2 } }],
      [{ x: 1, y: void 0 }, { map: { y: 'u' }, raw: { x: 1, y: null } }]
    ]

    for (const [data, packed] of cases) {
      expect(unpackData(emptyTable, packed, 'path')).deep.equals(data)
    }
  })

  it('throws for invalid types', function () {
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
        { map: { bogus: 'o' }, raw: { bogus: 1 } },
        'RangeError: Invalid packedId 1 at path.bogus'
      ],
      [
        { map: { bogus: 'o' }, raw: { bogus: NaN } },
        'RangeError: Invalid packedId NaN at path.bogus'
      ]
    ]

    for (const [packed, message] of cases) {
      try {
        unpackData(emptyTable, packed, 'path')
        throw new Error(`should throw ${message}`)
      } catch (e) {
        expect(e.toString()).equals(message)
      }
    }
  })

  it('restores Error payload', function () {
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

    const e = unpackData(emptyTable, packed, 'error')
    expect(e).instanceof(Error)
    expect(e.message).equals('m')
    expect(e.payload).deep.equals({ x: void 0, y: 1 })
    expect(e.name).equals('PayloadError')
  })

  it('restores TypeError', function () {
    const stack = new TypeError().stack
    const packed = {
      map: 'e',
      raw: {
        base: 'TypeError',
        map: '',
        raw: { message: 'map', stack }
      }
    }

    const e = unpackData(emptyTable, packed, 'error')
    expect(e).instanceof(TypeError)
    expect(e.name).equals('TypeError')
  })

  it('restores proxy types', function () {
    const table = new MockTable()

    const o1 = {}
    const o2 = {}

    table.proxies[1] = o1
    table.objects[2] = o2

    const cases: Array<[Object, PackedData]> = [
      [o1, { map: 'o', raw: 1 }],
      [o2, { map: 'o', raw: -2 }]
    ]

    for (const [data, packed] of cases) {
      expect(unpackData(table, packed, 'path')).equal(data)
    }
  })
})
