# on-finished v2.4.2 — Raw Search Results (Pass B)

Commit: `9a73f9c1c0b7a17c84b7d68ac5212b11a272cd6a`

All searches run from `$PACKAGE_ROOT` against production files:
- `index.js` (247 lines)
- `node_modules/ee-first/index.js` (96 lines)

---

## Search Group 1: require / import patterns

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' index.js node_modules/ee-first/index.js
```

### Results

```
index.js:24:var first = require('ee-first')
index.js:208:    return require('async_hooks')
```

**Analysis**: Two `require` calls.
- `ee-first` — runtime dependency, bundled in `node_modules/ee-first/`
- `async_hooks` — Node.js core module, loaded inside `tryRequireAsyncHooks()` with try/catch fallback

No `node:` prefixed imports. No ESM imports.

---

## Search Group 2: Global / built-in access patterns

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' index.js node_modules/ee-first/index.js
```

### Results

```
index.js:34:  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)) }
```

**Analysis**: Single use of `process.nextTick` as a fallback for `setImmediate`.
This is a read-only API call, not a mutation.

No `Buffer`, `globalThis`, `global`, `extends`, or `inherits` usage.

---

## Search Group 3: Prototype / property definition patterns

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' index.js node_modules/ee-first/index.js
```

### Results

```
index.js:181: * Patch ServerResponse.prototype.assignSocket for node.js 0.8.
```

**Analysis**: This is a JSDoc comment, not executable code. The comment describes
the intent of `patchAssignSocket`. Despite the comment referencing
`ServerResponse.prototype.assignSocket`, the actual code at lines 189-199
performs a per-instance assignment (`res.assignSocket = ...`), NOT a prototype
mutation. See C-001 in candidates.md.

No `defineProperty`, `setPrototypeOf`, `__proto__`, `Object.assign`, or `Reflect` usage.

---

## Search Group 4: Patch / wrap / shim / override patterns

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' index.js node_modules/ee-first/index.js
```

### Results

```
index.js:53:  attachListener(msg, wrap(listener))
index.js:129:    // istanbul ignore next: node.js 0.8 patch
index.js:188:// istanbul ignore next: node.js 0.8 patch
index.js:220:function wrap (fn) {
```

**Analysis**:
- `wrap(listener)` at line 53: calls `wrap()` defined at line 220. Creates a new
  `AsyncResource` instance and returns a bound function. Standard `async_hooks`
  API usage; no mutation of any shared object.
- Lines 129 and 188: Comments labeling `patchAssignSocket` as a "node.js 0.8 patch".
- `function wrap` at line 220: utility that wraps a function in an AsyncResource
  scope. Creates new objects only; does not mutate prototypes or globals.

---

## Search Group 5: Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' index.js node_modules/ee-first/index.js
```

### Results

```
(no matches)
```

**Analysis**: No module system hooks or manipulations.

---

## Search Group 6: Internal binding / private API patterns

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' index.js node_modules/ee-first/index.js
```

### Results

```
(no matches)
```

**Analysis**: No use of private Node.js internal bindings or internal modules.
