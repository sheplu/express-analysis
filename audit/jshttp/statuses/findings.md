# Detailed Findings: statuses v2.0.2

**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5
**Date:** 2026-11-01

## Confirmed Findings (F-series)

None. No monkeypatching or patching of Node.js core was found.

## Candidate Analysis (C-series)

### C-001: Local JSON require — `$PACKAGE_ROOT/index.js:15`

```js
var codes = require('./codes.json')
```

**Search group:** 1 (require/import patterns)
**Both passes agree:** NOT a patch.

This is a standard `require()` call loading a local JSON data file. It does not
import any Node.js core module. The loaded data is a plain object mapping HTTP
status codes to message strings (e.g., `"200": "OK"`). The result is stored in
a module-scoped variable and used to populate the library's own internal lookup
tables. No built-in module is shadowed, replaced, or modified.

---

### C-002: Read-only hasOwnProperty check — `$PACKAGE_ROOT/index.js:96`

```js
if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {
```

**Search group:** 3 (prototype access patterns)
**Both passes agree:** NOT a patch.

This is a read-only access of `Object.prototype.hasOwnProperty`, invoked via
`.call()` to safely check property existence on the library's own internal
`status.code` map. This is a standard defensive JavaScript idiom. There is no
write to `Object.prototype` — no property is added, removed, or modified on any
prototype object.

---

### C-003: Read-only hasOwnProperty check — `$PACKAGE_ROOT/index.js:109`

```js
if (!Object.prototype.hasOwnProperty.call(status.message, code)) {
```

**Search group:** 3 (prototype access patterns)
**Both passes agree:** NOT a patch.

Identical pattern to C-002. Read-only use of `Object.prototype.hasOwnProperty`
to check property existence on the library's own internal `status.message` map.
No prototype mutation occurs.

## Search Groups with Zero Hits

The following search groups returned no matches in production files:

| Group | Pattern Target                                     | Result    |
|-------|----------------------------------------------------|-----------|
| 2     | Buffer, process, globalThis, global, extends, inherits | No hits |
| 4     | monkeypatch, patch, wrap, shim, polyfill, override | No hits   |
| 5     | require.cache, require.extensions, Module._* hooks | No hits   |
| 6     | process.binding, internalBinding, internal modules | No hits   |

## Dependency Analysis

- **Runtime dependencies:** Zero. The `package.json` contains no `dependencies` field.
- **node_modules:** Directory does not exist, confirming no installed dependencies.
- **Transitive risk:** None. With zero dependencies, there is no transitive patching vector.
