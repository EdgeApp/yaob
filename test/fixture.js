// @flow

import { deleteApi, makeApi } from '../src/index.js'

export type StaticChildApi = {
  +answer: number
}

export type DynamicChildApi = {
  method(): Promise<string>
}

export type OnChange<name: string, Type> = (
  name,
  (value: Type) => mixed
) => mixed

export type TestApi = {
  +count: number,
  +childList: Array<StaticChildApi | number>,
  makeChild(): Promise<DynamicChildApi>,
  killChild(): Promise<mixed>,
  addCount(steps: number): Promise<number>,

  on: OnChange<'countChanged', number> &
    OnChange<'childListChanged', Array<StaticChildApi | number>>
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

    async makeChild () {
      log('makeChild')
      if (dynamicChild == null) {
        dynamicChild = makeDynamicChildApi(log)
      }
      return dynamicChild
    },

    async killChild () {
      log('killChild')
      if (dynamicChild) {
        deleteApi(dynamicChild)
        dynamicChild = void 0
      }
    },

    async addCount (steps: number) {
      log('addCount ' + steps)
      count += steps
      return count
    },

    // Make Flow happy:
    on (): any {}
  }

  return makeApi('TestApi', out)
}
