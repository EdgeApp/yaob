// @flow

import { Bridge, makeLocalBridge } from './bridge'
import { BridgeOptions, LocalBridgeOptions, SendMessage } from './bridge'
import { Bridgeable, onMethod, watchMethod } from './bridgeable'
import { bridgifyClass, bridgifyObject, shareData } from './magic'
import { CallbackRemover, Subscriber, close, emit, update } from './manage'

// Shared data:
export { onMethod, shareData, watchMethod }

// Defining bridgeable objects:
export { Bridgeable, bridgifyClass, bridgifyObject }

// Managing bridgeable objects:
export { close, emit, update }
// export { CallbackRemover, Subscriber }

// Building bridges:
export { Bridge, makeLocalBridge }
// export { BridgeOptions, LocalBridgeOptions, SendMessage }
