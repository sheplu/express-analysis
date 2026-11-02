# Pass B -- Raw Search Results

Package: **methods v1.1.2**
Production file: `$PACKAGE_ROOT/index.js` (70 lines)
Date: 2026-11-01

---

## Group 1 -- require / import / node:

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ...
```

### Production-file hits

| # | File | Line | Text |
|---|------|------|------|
| 1 | `$PACKAGE_ROOT/index.js` | 15 | `var http = require('http')` |

### Non-production hits (excluded from analysis)

- `package-lock.json` lines 363, 899, 1226, 4168, 5089, 5095, 5127 (dependency metadata)
- `README.md` line 33 (documentation example)

---

## Group 2 -- Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ...
```

### Production-file hits

None.

### Non-production hits (excluded from analysis)

- `package-lock.json` lines 4101, 4167, 4819, 4821, 4826, 4828, 4978 (dependency metadata referencing `process-nextick-args`, `process-on-spawn`)

---

## Group 3 -- .prototype / __proto__ / defineProperty / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' ...
```

### Production-file hits

None.

### Non-production hits (excluded from analysis)

- `package-lock.json` lines 662, 664, 681, 683, 1471, 1483, 1509, 1515, 1516, 1517, 2269, 2271, 4072, 5020, 5022, 5610, 5612, 5633, 5635, 5652, 5654, 6036 (dependency metadata for es-shim polyfill packages)

---

## Group 4 -- monkeypatch / patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ...
```

### Production-file hits

| # | File | Line | Text |
|---|------|------|------|
| 1 | `$PACKAGE_ROOT/index.js` | 65 | `'patch',` |

### Non-production hits (excluded from analysis)

- `package-lock.json` lines 672, 1123, 1600, 1602, 4171, 4217, 4351, 4353, 4515, 5478, 5480, 5496, 5513, 6111, 6113, 6128, 6130, 6143, 6146, 6156, 6172, 6185, 6192, 6202, 6217 (dependency metadata for `wrap-ansi`, `spawn-wrap`, `es-shim-unscopables`, `word-wrap`)
- `README.md` line 18 (documentation text mentioning "shim module")

---

## Group 5 -- require.cache / Module loader hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' ...
```

### Production-file hits

None.

### Non-production hits

None.

---

## Group 6 -- process.binding / internalBinding / _http_ / internal/

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' ...
```

### Production-file hits

None.

### Non-production hits

None.
