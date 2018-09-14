// @flow

import { bridgifyClass, shareData } from './magic'
import { Subscriber } from './manage'
import { addListener, addWatcher, close, emit, update } from './manage'

/**
 * The `on` function,
 * but packaged as a method and ready to be placed on an object.
 */
export const onMethod: Function = function on (name, f) {
  return addListener(this, name, f)
}

/**
 * The `watch` function,
 * but packaged as a method and ready to be placed on an object.
 */
export const watchMethod: Function = function watch (name, f) {
  return addWatcher(this, name, f)
}

shareData({ onMethod, watchMethod })

/**
 * The base class for all bridgeable API's. Provides callback capability.
 */
export class Bridgeable<Events extends {} = {}> {
  readonly on: Subscriber<Events>
  readonly watch: Subscriber<this>

  constructor () {
    this.on = onMethod as any
    this.watch = watchMethod as any
  }

  _close () {
    close(this)
  }

  _emit<Name extends keyof Events & string> (
    name: Name,
    payload: Events[Name]
  ): unknown {
    return emit(this, name, payload)
  }

  _update (name?: keyof this & string) {
    update(this, name)
  }
}
bridgifyClass(Bridgeable)
