# Pass B — Raw Search Results

**Package:** etag v1.8.1
**Commit:** 5df2cfdd46d310ccf51638d5b702375cbd99da44
**Production files searched:** `$PACKAGE_ROOT/index.js` (sole production file)

## Search 1: Imports / Requires

```
21:var crypto = require('crypto')
22:var Stats = require('fs').Stats
```

## Search 2: Globals (Buffer, process, globalThis, global, extends, inherits)

```
34: * @param {Buffer|string} entity
54:    ? Buffer.byteLength(entity, 'utf8')
63: * @param {string|Buffer|Stats} entity
82:  if (!isStats && typeof entity !== 'string' && !Buffer.isBuffer(entity)) {
83:    throw new TypeError('argument entity must be string, Buffer, or fs.Stats')
```

## Search 3: Prototype / Property Manipulation

```
29:var toString = Object.prototype.toString
```

## Search 4: Patch Keywords (monkeypatch, patch, wrap, shim, polyfill, override)

No matches.

## Search 5: Module System Hooks (require.cache, require.extensions, Module._*)

No matches.

## Search 6: Internal Bindings (process.binding, internalBinding, _http_, internal/)

No matches.
