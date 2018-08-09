// @flow

import { shareClass } from './magic.js'
import type { EmitMethod, OnMethod } from './manage.js'
import { closeObject, emitMethod, onMethod, updateObject } from './manage.js'

/**
 * The base class for all bridgeable API's. Provides callback capability.
 */
export class Bridgeable<Events = {}> {
  +emit: EmitMethod<Events>
  +on: OnMethod<Events>

  close () {
    closeObject(this)
  }

  update (name?: string) {
    updateObject(this, name)
  }
}
shareClass(Bridgeable, 'Bridgeable')

// Put the `on` and `emit` methods on the prototype:
const hack: any = Bridgeable.prototype
hack.emit = emitMethod
hack.on = onMethod
