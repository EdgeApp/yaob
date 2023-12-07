# Changelog

## Unreleased

- added: Support the JavaScript `Set` and `Map` types in serialized data.

## 0.3.11 (2023-07-27)

- fixed: Do not send blank messages over the bridge.

## 0.3.10 (2023-01-24)

- fixed: Add missing `hideProperties` to the TypeScript types.

## 0.3.9 (2023-01-17)

- added: Accept a `hideProperties` configuration option to make certain properties non-enumerable.

## 0.3.8 (2022-07-07)

- Allow errors to contain unserializable types such as functions

## 0.3.7 (2021-05-20)

- Mark method return types as `void` where appropriate. This is not a breaking change, since these YAOB methods were already returning `void` at run-time, but the types were just wrong.

## 0.3.6 (2020-01-02)

- Add TypeScript type definitions.
- Add `ArrayBuffer` support.

## 0.3.5 (2019-11-23)

- Add TypeScript type definitions.
- Increase Flow support to version 0.105.

## 0.3.4 (2019-05-06)

- Add a `close` method to the `Bridge` object.
- Emit a `close` event when objects close.
- Make proxy properties enumerable.

## 0.3.3 (2019-02-11)

- Return the input object from `bridgifyObject` & `bridgifyClass`.
- Add support for `Uint8Array` objects.
- Log the method name for failed return values.

## 0.3.2 (2018-11-20)

- Improve invalid ID error messages.

## 0.3.1 (2018-10-08)

- Preserve `Date` objects.
- Do not name the library entry point with an `.mjs` extension.

## 0.3.0 (2018-09-26)

- Do not call the `watch` callback initially (breaking change).
- Unsubscribe all callbacks when objects close (breaking change).

## 0.2.1 (2018-09-24)

- Improve documentation.
- Upgrade to Babel 7 (shrinks the build from 4.5K to 3.8K).

## 0.2.0 (2018-09-11)

- Change proxy management interface.
  - Split subscription methods into `watch` for properties and `on` for events.
  - Rename management methods:
    - `emitEvent` -> `Bridgeable._emit` / `emit`
    - `closeObject` -> `Bridgeable._close` / `close`
    - `updateObject` -> `Bridgeable._update` / `update`
  - Replace the shared class system with a shared value system.
- Proxy all object properties, except ones that start with underscores.
- Leave properties active on closed proxies.

## 0.1.1 (2018-08-13)

- Add `cloneMessage` & `throttleMs` options to `makeLocalBridge`.
- Improve error messages for closed proxies.
- Fix typos & clean up code.

## 0.1.0 (2018-08-06)

- Initial experimental development.
