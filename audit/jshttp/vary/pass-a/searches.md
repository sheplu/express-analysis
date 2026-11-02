# vary v1.1.2 — Pass A Raw Search Results

**Package:** vary v1.1.2 (commit 1220b9c)
**Production file:** `$PACKAGE_ROOT/index.js`
**Date:** 2026-11-01

---

## Search Group 1 — require / import / node: builtins

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' index.js
```

**Result:** 0 matches in index.js.

Hits in non-production files (README.md, package-lock.json) were ignored per scope.

---

## Search Group 2 — Global objects (Buffer, process, globalThis, global, extends, inherits)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' index.js
```

**Result:** 0 matches in index.js.

Hits in non-production files (package-lock.json) were ignored per scope.

---

## Search Group 3 — Prototype manipulation (prototype, __proto__, defineProperty, Reflect, Object.assign)

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' index.js
```

**Result:** 0 matches in index.js.

Hits in non-production files (package-lock.json) were ignored per scope.

---

## Search Group 4 — Patching keywords (monkeypatch, patch, wrap, shim, polyfill, override)

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' index.js
```

**Result:** 0 matches in index.js.

Hits in non-production files (package-lock.json) were ignored per scope.

---

## Search Group 5 — Module loader hooks (require.cache, require.extensions, Module._*)

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' index.js
```

**Result:** 0 matches in index.js.

---

## Search Group 6 — Internal bindings (process.binding, internalBinding, _http_, internal/)

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' index.js
```

**Result:** 0 matches in index.js.

---

## Summary

All six search groups returned **zero matches** against the sole production file `$PACKAGE_ROOT/index.js`. No candidates were generated from the regex sweep.
