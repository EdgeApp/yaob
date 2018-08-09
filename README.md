# yaob

> Yet Another Object Bridge

Normally Web Workers, Node.js child processes, cross-domain windows, and similar things can only communicate by sending messages back and forth. This is really inconvenient compared to using a normal object-oriented API.

This library allows software to expose a nice object-oriented API, even if it's trapped behind a messaging interface. It does this by serializing method calls, property changes, and events into a stream of messages that can pass over the interface.

Similar libraries include:

- [post-robot](https://github.com/krakenjs/post-robot) - Only works with iframes and popup windows.
- [remote-lib](http://www.remotelib.com/) - Rich functionality, but requires ES6 proxy support.

## Using

In a typical use-case, a client process, such as a web app, needs some functionality from a server process, such as a Web Worker. The client launches the server process, and the server process sends back an object that contains its API. The client interacts with the server by calling methods on this object.

The initial object the server sends across is called the "root" object. This object can have methods that return other objects, allowing the server to expose a rich, multi-object API.

These API objects can also have dynamic properties. If the properties change on the server-side object, `yaob` will update the client-side object to match. It will also generate an event that the client can subscribe to. This way, the client can react to changing server-side values. This feature makes `yaob` unique compared to similar libraries.

### Bridgeable Objects

To pass over the bridge, objects should inherit from the `Bridgeable` base class. These Bridgeable objects can contain async methods and getter functions, which the `yaob` library will bridge across the messaging interface. This is the only place functions are allowed. If the API tries to pass function objects directly, `yaob` won't be able to handle them and will throw an error.

Here is an example of a simple bridgeable object:

```js
import { Bridgeable } from 'yaob'

class WorkerApi extends Bridgeable {
  constructor () {
    this._multiplier = 2
  }

  async double (x) {
    return x * this._multiplier
  }

  get version () {
    return '1.0.0'
  }
}
```

The `yaob` library will not bridge property or method names that begin with an underscore. This means that `this._multiplier` will not be visible to the client. The client will only see the `double` method and the `version` getter. This provides a simple way to make things private.

### Server Side

The `yaob` library provides a `Bridge` object, which can send objects back and forth. The `Bridge` needs to know how to send and receive messages. For Web Workers, `postMessage` and `onmessage` are the way to do this. Other interfaces, such as Web Sockets, TCP/IP, or Node.js child processes each have their own different ways:

```js
// worker.js
import { Bridge } from 'yaob'

// Create a bridge server, telling it how to send messages out:
const server = new Bridge({
  sendMessage: message => postMessage(message)
})

// If the worker gets a message, give it to the bridge server:
onmessage = event => server.handleMessage(event.data)
```

Once this send & receive functionality is set up, we can transmit our initial API object:

```js
// worker.js
server.sendRoot(new WorkerApi());
```

This is all the server side needs to do.

### Client Side

On the client side, spin up your worker and connect a `Bridge` to its messaging interface:

```js
import { Bridge } from 'yaob'

const worker = new WebWorker('./worker.js')

// Create the bridge client, telling it how to send messages out:
const client = new Bridge({
  sendMessage: message => worker.postMessage(message)
})

// If the worker sends us a message, forward it to the bridge client:
worker.onmessage = event => client.handleMessage(event.data)
```

Now we can wait for the server side to send us the root object, which we can then use:

```js
// Wait for the server to send us the root object...
const root = await client.getRoot()

// Method calls are async:
expect(await root.double(1.5)).equals(3)

// Property access is synchronous!
expect(root.version).equals('1.0.0')

// Private properties are not visible:
expect(root).to.not.have.property('_multiplier')
```

### Updating properties

Any time a property changes, the server-side object should call `this._update()`. This method is part of the `Bridgeable` base class. It tells the bridge to diff the object's properties and send over the changed ones. The `_update` method is only available on the server side, since its name begins with an underscore.

The bridge compares the object's properties shallowly (`===`). This means `yaob` won't notice if you modify the contents of an array, for example, since the property's identity doesn't change (it's still the same array). To force the bridge to send a property like this, simply pass the property's name to the `_update` method:

```js
class ListExample extends Bridgeable {
  constructor () {
    this.list = []
  }

  async addItem (item) {
    this.list.push(item)

    // Explicitly send the `list` property over the bridge:
    this._update('list')
  }
}
```

### Events

`Bridgeable` objects can emit events. To subscribe to events, use the `on` method, which is part of the `Bridgeable` base class:

```js
listExample.on('listChanged', list => {
  console.log('got new list:', list)
})
```

Any time a property changes, the bridge will automatically generate a property-`Changed` event with the new value. The bridge will also emit an `error` event any time an event callback throws an exception.

To send events, use the `_emit` method, which is also part of the `Bridgeable` base class:

```js
someObject._emit('eventName', somePayload)
```

The `on` method is available on both the client and server side objects, but the `_emit` method is only available on the server side, since its name begins with an underscore.

The payload must be a single value. If you need a more complicated payload, simply pack everything into an object:

```js
someObject._emit('logout', { username: 'yaob', reason: 'timeout' })
```

The `on` method returns an unsubscribe function. You can use this to unsubscribe at any time. You can also use it to set up a one-shot event listener:

```js
const unsubscribe = someObject.on('logout', payload => {
  unsubscribe()
  shutDownApp(payload)
})
```

### Closing

Once the server sends an object over the bridge, the object will stick around for the lifetime of the bridge. This is because there is no way of knowing when the client will access the object again. This can leak memory.

If this sort of thing becomes a problem, you can explicitly free objects by calling `this._close()`, which is part of the `Bridgeable` base class. Closing a server-side object will make it un-bridgeable and will destroy the client-side object. Accessing any property or method on the client side will then throw an exception.

This can also be a useful way to represent logging out of accounts, closing files, or other situations where an API object needs to become unusable.

### Unit Testing

To help test your API in a realistic setting (but without starting an entirely new process), the `yaob` library provides a `makeLocalBridge` function, which returns a locally-connected bridge for any bridgeable object:

```js
class MyApi extends Bridgeable { ... }

const testApi = makeLocalBridge(new MyApi())
```

This example creates a `testApi` which looks and feels just like a `MyApi` instance, but is actually a bridge. Every property change and method call turns into a message, just as it would if the `MyApi` instance were in another process.

The `makeLocalBridge` function also accepts an optional `cloneMessage` function:

```js
const testApi = makeLocalBridge(new MyApi(), {
  cloneMessage: m => JSON.parse(JSON.stringify(m))
})
```

This makes it possible to incorporate realistic message serialization and deserialization into the test.

### Shared Base Classes

Both the `Bridge` constructor and `makeLocalBridge` function accept an optional `sharedClasses` parameter, which is a table of constructor functions. If an object extends one of these base classes on the server side, the bridge will ensure that it also extends the same class on the client side:

```js
class BaseClass extends Bridgeable {
  double (x) {
    return 2 * x
  }
}

class SomeApi extends BaseClass { ... }

const local = makeLocalBridge(new SomeApi(), {
  sharedClasses: { BaseClass }
})

// The `instanceof` operator works:
expect(local).instanceof(BaseClass)

// No `await` needed!
expect(local.double(3)).equals(6)
```

This provides a way to put synchronous methods on your API objects. Just put the methods in the shared base class, and they will exist on both sides of the bridge. Note that these methods will *not* be able to access properties or methods that begin with underscores, since those aren't bridged. The synchronous methods can only access whatever public API the client side could access anyhow.

The `Bridge` constructors on both sides of a messaging interface need to receive the same `sharedClasses` table for this to work properly.

### Throttling

Both the `Bridge` constructor and `makeLocalBridge` function accept an optional `throttleMs` option. When this option is set, the bridge will wait this long between sending messages. It will batch up any events, method calls, or property changes that occur in the mean time. This may improve performance if properties change often, but could also hurt performance by increasing latency.

```js
makeLocalBridge(new RootApi(), { throttleMs: 10 })
```

```js
const server = new Bridge({
  throttleMs: 10,
  sendMessage () {}
})
```

### Avoiding `Bridgeable`

The easiest way to make your object bridgeable is to extend the `Bridgeable` base class. If you need more control though, `yaob` provides other options:

* Call `bridgifyClass` on a class constructor function. Any instances of this class will be bridgeable.
* Call `bridgifyObject` directly on an object.
* Put your base class in the `sharedClasses` object. All these classes are automatically bridgeable, even if they don't inherit from `Bridgeable`.

You might use one of these other options if you don't control your class hierarchy, for instance. All the `Bridgeable` methods have standalone versions, so their functionality is available even if your class doesn't extend `Bridgeable`:

```js
import { close, emit, update } from 'yaob'

// Instead of this._emit(...):
emit(this, 'event', payload)

// Instead of this._update():
update(this)

// Instead of this._close():
close(this)
```

If you would like to give your users a nice `on` method like the one `Bridgeable` provides, you can do this:

```js
import { bridgifyClass, onMethod } from 'yaob'

class SomeApi { ... }
SomeApi.prototype.on = onMethod

bridgifyClass(SomeApi)
```

The `onMethod` value is special, so the bridge knows to replace it with a proper `on` method on the client side instead of bridging it.

### Flow Types

This library ships with Flow types. If you are using Flow, you should pass a table of supported events to the `Bridgeable` base class, like this:

```js
type Events = {
  someEvent: string,
  propertyChanged: number
}

class SomeApi extends Bridgeable<Events> { ... }
```

For each property in the table, the name is the event name, and the type is the payload type.

If you are using the `onMethod` as described above, you can do this to get proper typing:

```js
import type { OnMethod } from 'yaob'
import { bridgifyClass, onMethod } from 'yaob'

class SomeApi {
  on: OnMethod<Events>
}
SomeApi.prototype.on = onMethod

bridgifyClass(SomeApi)
```

### Bundling

Consider using a tool like [rollup.js](https://rollupjs.org/guide/en) to bundle your library. This bundler supports tree shaking, so it will eliminate unused code from the bundles it produces. This way, you can put all your code in one source tree, and let the bundler separate your server-side code from your client-side code.
