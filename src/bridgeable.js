// @flow

import { bridgifyClass, shareData } from './magic.js'
import type { OnMethod } from './manage.js'
import { addListener, close, emit, update } from './manage.js'

/**
 * The `on` function,
 * but packaged as a method and ready to be placed on an object.
 */
export const onMethod: Function = function on (name, f) {
  return addListener(this, name, f)
}

shareData({ onMethod })

/**
 * The base class for all bridgeable API's. Provides callback capability.
 */
export class Bridgeable<Events: {} = {}> {
  +on: OnMethod<Events>

  _close () {
    close(this)
  }

  _emit<Name: $Keys<Events>> (
    name: Name,
    payload: $ElementType<Events, Name>
  ): mixed {
    return emit(this, name, payload)
  }

  _update (name?: *) {
    update(this, name)
  }
}

// Put the `on` method onto the prototype:
const hack: any = Bridgeable.prototype
hack.on = onMethod

bridgifyClass(Bridgeable)
