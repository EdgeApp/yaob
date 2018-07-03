# yaob

> Yet Another Object Bridge

Normally Web Workers, Node.js child processes, cross-domain windows, and similar things can only communicate by sending messages back and forth. This is really inconvenient compared to using a normal object-oriented API.

This library allows software to expose a nice object-oriented API, even if it's trapped behind a messaging interface. It does this by serializing method calls, property changes, and events into a stream of messages that can pass over the interface.

Similar libraries include:

* [post-robot](https://github.com/krakenjs/post-robot) - Only works with iframes and popup windows.
* [remote-lib](http://www.remotelib.com/) - Rich functionality, but requires ES6 proxy support.

## Using

In a typical use-case, a client process, such as a web app, needs some functionality from a server process, such as a Web Worker. The client launches the server process, and the server process returns a single object that contains its API.

Returning a single object may seem limited, but this object can have properties and methods that return other objects in turn. This initial object acts as the "root" of the server's API, which can be arbitrarily complicated.

These API objects can have dynamic properties. If the properties change on the server-side object, the library will update the client-side object to match. It will also generate an event that the client can subscribe to. This way, the client can react to changing server-side values. This feature makes `yaob` unique compared to similar libraries.

### API Objects

Normally, the server can only return primitive Javascript values to the client, like strings, numbers, booleans, Arrays, and Objects. The only way to return functions is to place them in specially-marked "API objects". These API objects can contain async methods and getter functions, which the `yaob` library will proxy across the messaging interface.

Here is an example of an API object with a getter function, `version` and a method, `makeCounter`.

```js
import { makeApi } from 'yaob'

function makeWorkerApi () {
  return makeApi('Worker', {
    get version () {
      return '1.0.0'
    },

    async makeCounter () {
      return makeCounterApi()
    }
  })
}
```

The `makeCounter` method returns another API object, which looks like this:

```js
function makeCounterApi () {
  let _count = 0

  return makeApi('Counter', {
    get count () {
      return _count
    },

    async up () {
      _count++
    }

    async down () {
      _count--
    }
  })
}
```

### Server Side

The server side (Web Worker, Node.js child process, iframe, or such) begins by creating an initial API object to send across the bridge, such as the one shown in the example above.

To send this object to the client, the server needs a way to transmit and receive messages. For Web Workers, these are `postMessage` and `onmessage`. Other interfaces, such as Web Sockets, TCP/IP, or Node.js child processes have their own corresponding substitutes:

```js
// worker.js

import { makeProxyServer } from 'yaob'

// Create a proxy server, telling it how to send messages out:
const server = makeProxyServer(
  makeWorkerApi(),
  message => postMessage(message)
)

// If the worker gets a message, give it to the proxy server:
onmessage = event => server.onMessage(event.data))
```

This is all the server side needs.

### Client Side

On the client side, spin up your worker and connect a proxy client to its messaging interface:

```js
import { makeProxyServer } from 'yaob'

const worker = new WebWorker('./worker.js')

// Create the proxy client, telling it how to send messages out:
const client = makeProxyClient(message => worker.postMessage(message))

// If the worker sends us a message, forward it to the proxy client:
worker.addEventListener('message', event => client.onMessage(event))
```

Now we can wait for the server side to send us the root object, which we can then use:

```js
// Wait for the server to send us a value...
const root = await client.root

// Property access is synchronous!
expect(root.version).to.equal('1.0.0')

// Call the `makeCounter` method:
const counter = await root.makeCounter()
await counter.up()
expect(counter.count).to.equal(1)
await counter.dount()
expect(counter.count).to.equal(0)

// Subscribe to changes to the `count` property:
counter.on('countChange', newValue => console.log(newValue))
```
