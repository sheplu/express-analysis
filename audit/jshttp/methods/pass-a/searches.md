# Pass A — Raw Search Results

Package: `methods` v1.1.2
Production file: `$PACKAGE_ROOT/index.js` (70 lines)
Date: 2026-11-01

Results below are filtered to **production files only** (`index.js`).
Hits in `README.md`, `package-lock.json`, and other non-production files are
excluded since they are not executed at runtime.

---

## Group 1 — require / import / node:

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ...
```

```
$PACKAGE_ROOT/index.js:15:var http = require('http')
```

**1 production hit.**

---

## Group 2 — Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ...
```

No production hits.

---

## Group 3 — .prototype / __proto__ / setPrototypeOf / defineProperty / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' ...
```

No production hits.

---

## Group 4 — monkeypatch / patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ...
```

```
$PACKAGE_ROOT/index.js:65:    'patch',
```

**1 production hit** (the string literal `'patch'` — an HTTP method name).

---

## Group 5 — require.cache / require.extensions / Module._load / etc.

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' ...
```

No hits at all (production or otherwise).

---

## Group 6 — process.binding / internalBinding / _http_ / internal/

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' ...
```

No hits at all (production or otherwise).

---

## Summary of production hits

| Group | Pattern Category                 | Production Hits |
|-------|----------------------------------|-----------------|
| 1     | require / import / node:         | 1               |
| 2     | Buffer / process / globals       | 0               |
| 3     | prototype / defineProperty       | 0               |
| 4     | patch / wrap / shim / polyfill   | 1               |
| 5     | Module loader hooks              | 0               |
| 6     | process.binding / internalBinding| 0               |
| **Total** |                              | **2**           |
