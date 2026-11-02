# on-finished v2.4.2 — Pass A Raw Search Results

Commit: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`

Production files searched:
- `$PACKAGE_ROOT/index.js` (247 lines)
- `$PACKAGE_ROOT/node_modules/ee-first/index.js` (96 lines)

All searches run from `$PACKAGE_ROOT`.

---

## Group 1: require / import / from

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' index.js node_modules/ee-first/index.js
```

```
index.js:24:var first = require('ee-first')
index.js:208:    return require('async_hooks')
```

**ee-first/index.js**: no hits.

### Analysis
- `require('ee-first')` — runtime dependency, npm package. No core module.
- `require('async_hooks')` — Node.js core module, inside `tryRequireAsyncHooks()` wrapped in try/catch. Used to create `AsyncResource` instances for context propagation. Not a patch.

---

## Group 2: Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' index.js node_modules/ee-first/index.js
```

```
index.js:34:  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)) }
```

**ee-first/index.js**: no hits.

### Analysis
- `process.nextTick` — read-only usage as a fallback for `setImmediate`. No mutation of process.

---

## Group 3: .prototype / __proto__ / defineProperty / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' index.js node_modules/ee-first/index.js
```

```
index.js:181: * Patch ServerResponse.prototype.assignSocket for node.js 0.8.
```

**ee-first/index.js**: no hits.

### Analysis
- Line 181 is a JSDoc **comment** only — the string "ServerResponse.prototype.assignSocket" appears in a documentation block, not in executable code. The actual `patchAssignSocket` function (lines 189-199) operates on an **instance**, not the prototype. See C-001 in candidates.

---

## Group 4: patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' index.js node_modules/ee-first/index.js
```

```
index.js:53:  attachListener(msg, wrap(listener))
index.js:129:    // istanbul ignore next: node.js 0.8 patch
index.js:188:// istanbul ignore next: node.js 0.8 patch
index.js:220:function wrap (fn) {
```

**ee-first/index.js**: no hits.

### Analysis
- **Line 53**: `wrap(listener)` — wraps a user callback with `AsyncResource.runInAsyncScope`. Creates a new bound function. Does NOT mutate any prototype or core object. See C-003 in candidates.
- **Line 129**: Comment only — describes purpose of `patchAssignSocket` call.
- **Line 188**: Comment only — describes `patchAssignSocket` function.
- **Line 220**: `function wrap(fn)` — definition of the wrapper function. Creates new `AsyncResource` and returns a bound function. No mutation of core.

---

## Group 5: require.cache / Module internals

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' index.js node_modules/ee-first/index.js
```

No hits in either file.

---

## Group 6: process.binding / internalBinding / _http_ / internal/

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' index.js node_modules/ee-first/index.js
```

No hits in either file.

---

## Summary of Search Hits

| Group | File | Hits | Relevant to patching? |
|-------|------|------|-----------------------|
| 1 | index.js | 2 | No (normal require) |
| 2 | index.js | 1 | No (read-only process.nextTick) |
| 3 | index.js | 1 | Comment only |
| 4 | index.js | 4 | Yes — wrap() and patchAssignSocket |
| 5 | — | 0 | — |
| 6 | — | 0 | — |
| 1-6 | ee-first/index.js | 0 | — |
