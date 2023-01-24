/**
 * Options used to create a new bridge.
 */
export interface BridgeOptions {
  sendMessage: (message: object) => unknown
  hideProperties?: string[]
  throttleMs?: number
}

/**
 * An object bridge.
 */
export declare class Bridge {
  constructor(opts: BridgeOptions)
  handleMessage(message: object): void
  getRoot(): Promise<any>
  sendRoot(root: object): void
  close(error: Error): void
}

/**
 * Options used to create a new local bridge.
 */
export interface LocalBridgeOptions {
  cloneMessage?: (x: object) => object
  hideProperties?: string[]
  throttleMs?: number
}

/**
 * Bridges a single object locally. This is great for unit tests,
 * where you want to verify that your API works correctly over a bridge,
 * but don't want to actually spawn a separate process.
 */
export declare function makeLocalBridge<T>(o: T, opts?: LocalBridgeOptions): T

/**
 * Undoes the effect of `on` or `watch`.
 */
export type CallbackRemover = () => void

/**
 * Signature of the `on` and `watch` methods.
 */
export type Subscriber<Events extends {} = {}> = <Name extends keyof Events>(
  name: Name,
  f: (v: Events[Name]) => unknown
) => CallbackRemover

/**
 * The `on` function,
 * but packaged as a method and ready to be placed on an object.
 */
export declare function onMethod(name: string, f: Function): CallbackRemover

/**
 * The `watch` function,
 * but packaged as a method and ready to be placed on an object.
 */
export declare function watchMethod(name: string, f: Function): CallbackRemover

/**
 * The base class for all bridgeable API's. Provides callback capability.
 */
export declare class Bridgeable<Props extends {} = {}, Events extends {} = {}> {
  readonly on: Subscriber<Events>
  readonly watch: Subscriber<Props>

  _close(): void
  _emit<Name extends keyof Events>(name: Name, payload: Events[Name]): unknown
  _update(name?: keyof Props): void
}

export declare function bridgifyClass<Type extends Function>(Class: Type): Type
export declare function bridgifyObject<Type extends object>(o: Type): Type
export declare function shareData(table: object, namespace?: string): void

export declare function close(o: object): void
export declare function emit(o: object, name: string, payload: unknown): void
export declare function update<T extends object>(o: T, name?: keyof T): void
