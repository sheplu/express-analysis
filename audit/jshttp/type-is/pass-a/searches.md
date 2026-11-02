# Pass A — Raw Search Results

## Search 1: Imports / requires / node: builtins
```
src/index.ts:8:import { parse, isTypeValid, isTokenValid, ContentType } from "content-type";
```

## Search 2: Globals (Buffer, process, globalThis, global, extends, inherits)
```
src/index.ts:137:export interface TypeIsOptions extends NormalizeOptions {
```

## Search 3: Prototype / property manipulation
```
node_modules/content-type/dist/index.js:45: * Null object perf optimization. Faster than `Object.create(null)` and `{ __proto__: null }`.
node_modules/content-type/dist/index.js:49:    C.prototype = Object.create(null);
```

## Search 4: Patch / wrap / shim / polyfill / override keywords
No results.

## Search 5: Module loader hooks (require.cache, Module._, etc.)
No results.

## Search 6: Internal bindings (process.binding, internalBinding, _http_, internal/)
No results.
