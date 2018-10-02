# Flow types for yaob

In a typical yaob use-case, a server process exposes an object-oriented API to a client process.

Ideally, the Flow types the client sees for this API should not contain server-side implementation details like private methods. The bridge does not proxy these members over in the first place, so keeping them out of the client's Flow types is especially important.

This tutorial will explain how to write clean client-facing Flow types while ensuring that the server implementation always matches.

## Client-facing types

The first step is to write client-facing types for your API. These describe the properties, methods, and events the client can access:

```typescript
// client/index.js

import type { Subscriber } from 'yaob'

// Events:
export type RootEvents = {
  error: any,
  event: number
}

// Properties and methods:
export type Root = {
  +on: Subscriber<RootEvents>,
  +watch: Subscriber<Root>

  +prop1: number,
  +prop2: string,

  method1(param: number): Promise<void>,
  method2(param: string): Promise<boolean>,
}
```

All these definitions use `type`, not `interface`. Interface types are incompatible with `yaob`, and using them will produce "indexer property is missing" errors. The properties are also read-only (using the `+` prefix), since `yaob` does not allow the client to write to bridged properties.

The `yaob` library exports a `Subscriber` type, which helps describe the `on` and `watch` methods.

These types would go into the client-facing part of your library. If you use [rollup.js](https://rollupjs.org/guide/en) to bundle your client-facing code, you can use the [rollup-plugin-flow-entry](https://www.npmjs.com/package/rollup-plugin-flow-entry) plugin to expose these types to your users.

## Server implementation

The server-side implementation needs to match these client-facing types:

```typescript
import { Bridgeable } from 'yaob'

import type { Root, RootEvents } from '../client/index.js'

export class RootApi extends Bridgeable<Root, RootEvents> {
  _private1: number // Not exposed to the client code!
  _private2: string

  constructor () { ... }

  get prop1 () { ... }
  get prop2 () { ... }

  async method1 (param: number) { ... }
  async method2 (param: string) { ... }
}
```

The `Bridgeable` base class takes two type parameters. The first type parameter lists the properties `watch` can subscribe to, and the second type parameter lists the events `on` can subscribe to.

To verify that this class correctly implements the client-facing `Root` type, cast the root instance before sending it over the bridge:

```typescript
// Verify that `RootApi` matches the `Root` type:
const root: Root = new RootApi()

// Send the root object to the client:
const server = new Bridge(...)
server.sendRoot(root)
```

If the implementation differs in any way from the client-facing types, Flow will give an appropriate error.
