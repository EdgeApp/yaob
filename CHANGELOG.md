# Changelog

## Unreleased

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
