# vary v1.1.2 — Pass B Raw Search Results

**Commit:** 1220b9c
**Production file:** `$PACKAGE_ROOT/index.js`
**Date:** 2026-11-01

---

## Group 1 — `require` / `import` / `node:` builtins

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' $PACKAGE_ROOT/index.js
```

**Result:** No matches (exit 1)

---

## Group 2 — Global references (`Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits`)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' $PACKAGE_ROOT/index.js
```

**Result:** No matches (exit 1)

---

## Group 3 — Prototype / property-descriptor mutation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' $PACKAGE_ROOT/index.js
```

**Result:** No matches (exit 1)

---

## Group 4 — Patching keywords (`monkeypatch`, `patch`, `wrap`, `shim`, `polyfill`, `override`)

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' $PACKAGE_ROOT/index.js
```

**Result:** No matches (exit 1)

---

## Group 5 — Module-system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' $PACKAGE_ROOT/index.js
```

**Result:** No matches (exit 1)

---

## Group 6 — Internal bindings / private APIs

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' $PACKAGE_ROOT/index.js
```

**Result:** No matches (exit 1)

---

## Summary

All six search groups returned **zero hits** against the sole production file `$PACKAGE_ROOT/index.js`. No candidates were generated from any search group.
