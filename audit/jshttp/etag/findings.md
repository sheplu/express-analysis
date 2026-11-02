# Detailed Findings: etag v1.8.1

## Scope

- **Package:** etag v1.8.1
- **Commit:** 5df2cfdd46d310ccf51638d5b702375cbd99da44
- **Entrypoint:** `$PACKAGE_ROOT/index.js` (declared in `package.json` `files` array)
- **Runtime dependencies:** None (zero `dependencies` in `package.json`, no `node_modules/`)
- **Production files:** 1 file, 132 lines

## Node.js Core Interactions

### F-001: crypto module usage (Line 21, 46-50)

```js
var crypto = require('crypto')
// ...
var hash = crypto
  .createHash('sha1')
  .update(entity, 'utf8')
  .digest('base64')
  .substring(0, 27)
```

**Classification:** Standard API usage (READ)
**Analysis:** The `crypto` module is imported and used to create SHA-1 hashes. The module reference is stored in a local variable and called through its public API. No properties of the `crypto` module are modified, replaced, or extended.

### F-002: fs.Stats usage (Line 22, 106)

```js
var Stats = require('fs').Stats
// ...
if (typeof Stats === 'function' && obj instanceof Stats) {
```

**Classification:** Standard API usage (READ)
**Analysis:** The `Stats` constructor is read from the `fs` module for use in `instanceof` type checking. The `fs` module itself is not stored, and the `Stats` constructor is never modified. This is a pure read operation.

### F-003: Buffer global usage (Lines 54, 82)

```js
Buffer.byteLength(entity, 'utf8')  // line 54
Buffer.isBuffer(entity)             // line 82
```

**Classification:** Standard API usage (READ)
**Analysis:** Two static methods on the global `Buffer` class are called for their intended purposes: computing byte length and checking if a value is a Buffer. Neither call modifies `Buffer` or its prototype.

### F-004: Object.prototype.toString reference (Line 29, 111-113)

```js
var toString = Object.prototype.toString
// ...
toString.call(obj.ctime) === '[object Date]'
toString.call(obj.mtime) === '[object Date]'
```

**Classification:** Standard API usage (READ)
**Analysis:** The `Object.prototype.toString` method reference is cached in a local variable for efficient type-checking. This is a well-known pattern for reliable type detection. The reference is only used for `.call()` invocations. `Object.prototype` is never written to.

## Search Group Results

### Group 1: Imports/requires
- Line 21: `require('crypto')` -- standard import
- Line 22: `require('fs').Stats` -- standard import

### Group 2: Globals (Buffer, process, globalThis, global)
- Line 54: `Buffer.byteLength` -- standard API call
- Line 82: `Buffer.isBuffer` -- standard API call
- Lines 65, 83: `Buffer` in JSDoc comments only

### Group 3: Prototype/property manipulation
- Line 29: `Object.prototype.toString` -- read-only reference

### Group 4: Patch keywords (monkeypatch, patch, wrap, shim, polyfill, override)
- No hits

### Group 5: Module system hooks (require.cache, Module._, etc.)
- No hits

### Group 6: Internal bindings (process.binding, internalBinding, internal/)
- No hits

## Confirmed Patches

**None.**

All five candidate hits were traced to read-only API usage. No writes, mutations, extensions, or replacements of Node.js core functionality were found.
