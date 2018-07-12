// @flow

import { deleteApi, makeApi } from '../src/index.js'
import type { Event } from '../src/index.js'

export type StaticChildApi = {
  +answer: number
}

export type DynamicChildApi = {
  method(): Promise<string>
}

export type TestApi = {
  +count: number,
  +childList: Array<StaticChildApi | number>,

  addCount(steps: number): Promise<number>,
  alwaysThrows(): Promise<mixed>,
  killChild(): Promise<mixed>,
  makeChild(): Promise<DynamicChildApi>,
  syncMethod(multipler: number): number,

  on: Event<'countChanged', number> &
    Event<'childListChanged', Array<StaticChildApi | number>> &
    Event<'event', string>
}

function nop () {}

function makeStaticChildApi () {
  const out: StaticChildApi = {
    get answer () {
      return 42
    }
  }
  return makeApi('Child', out)
}

function makeDynamicChildApi (log: string => mixed) {
  const out: DynamicChildApi = {
    async method () {
      log('method')
      return 'alive'
    }
  }
  return makeApi('DynamicChild', out)
}

// Client-side shim methods:
export const shims = {
  TestApi: {
    syncMethod (multipler: number) {
      return this.count * multipler
    }
  }
}

export function makeTestApi (log: string => mixed = nop) {
  const child = makeStaticChildApi()
  const childList = [32, child, child]

  // Mutable state:
  let dynamicChild: DynamicChildApi | void
  let count = 0

  const out: TestApi = {
    get count () {
      return count
    },

    get childList () {
      return childList
    },

    async addCount (steps: number) {
      log('addCount ' + steps)
      count += steps
      return count
    },

    async alwaysThrows () {
      throw new TypeError('I will never be happy')
    },

    async killChild () {
      log('killChild')
      if (dynamicChild) {
        deleteApi(dynamicChild)
        dynamicChild = void 0
      }
    },

    async makeChild () {
      log('makeChild')
      if (dynamicChild == null) {
        dynamicChild = makeDynamicChildApi(log)
      }
      return dynamicChild
    },

    // Make Flow happy:
    on (): any {},

    ...shims['TestApi']
  }

  return makeApi('TestApi', out)
}
