// @flow

import { bridgifyClass, shareData } from './magic.js'
import type { Subscriber } from './manage.js'
import { addListener, addWatcher, close, emit, update } from './manage.js'

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
export class Bridgeable<Props: {} = {}, Events: {} = {}> {
  +on: Subscriber<Events>
  +watch: Subscriber<Props>

  _close () {
    close(this)
  }

  _emit<Name: $Keys<Events>> (
    name: Name,
    payload: $ElementType<Events, Name>
  ): mixed {
    return emit(this, name, payload)
  }

  _update (name?: $Keys<Props>) {
    update(this, name)
  }
}

// Put the shared methods onto the prototype:
const hack: any = Bridgeable.prototype
hack.on = onMethod
hack.watch = watchMethod

bridgifyClass(Bridgeable)
