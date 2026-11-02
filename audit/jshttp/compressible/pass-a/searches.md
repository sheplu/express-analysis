# Pass A -- Raw Search Results

**Package:** compressible v2.0.18 (commit 9a7ea07)
**Source:** `$PACKAGE_ROOT` = `compressible/upstream/compressible/`
**Date:** 2026-11-01
**Auditor:** Pass A (independent, double-blind)

All searches executed from `$PACKAGE_ROOT` with flags:
`--no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'`

Non-production files (package-lock.json, README.md, HISTORY.md, scripts/) are noted but excluded from analysis. Only production files (`index.js`, `node_modules/mime-db/index.js`, `node_modules/mime-db/db.json`) are evaluated.

---

## Search 1 -- require / import / from

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

### Hits in production files

| # | File | Line | Content |
|---|------|------|---------|
| 1 | `index.js` | 16 | `var db = require('mime-db')` |
| 2 | `node_modules/mime-db/index.js` | 12 | `module.exports = require('./db.json')` |

### Hits in non-production files (excluded from analysis)

- `README.md:20` -- documentation example
- `scripts/version-history.js:3-4` -- build script (fs, path)
- `node_modules/mime-db/README.md:35` -- documentation example
- `package-lock.json` -- multiple `resolve-from` references (metadata only)

---

## Search 2 -- Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

### Hits in production files

| # | File | Line | Content |
|---|------|------|---------|
| 1 | `node_modules/mime-db/db.json` | 5763 | `"application/vnd.stardivision.writer-global": {` |
| 2 | `node_modules/mime-db/db.json` | 5815 | `"application/vnd.sun.xml.writer.global": {` |
| 3 | `node_modules/mime-db/db.json` | 8174 | `"message/global": {` |
| 4 | `node_modules/mime-db/db.json` | 8178 | `"message/global-delivery-status": {` |
| 5 | `node_modules/mime-db/db.json` | 8182 | `"message/global-disposition-notification": {` |
| 6 | `node_modules/mime-db/db.json` | 8186 | `"message/global-headers": {` |

All are MIME type name strings inside a static JSON data file. None are code.

### Hits in non-production files (excluded from analysis)

- `scripts/version-history.js:8,15,20,28` -- build script using `process.env` / `process.exit`
- `package-lock.json` -- `process-on-spawn` package name references

---

## Search 3 -- .prototype / __proto__ / defineProperty / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

### Hits in production files

None.

### Hits in non-production files (excluded from analysis)

- `package-lock.json` -- multiple references to npm package names containing `.prototype.` (e.g. `array.prototype.flat`, `string.prototype.trim`, etc.). These are package name strings in lockfile metadata, not code.

---

## Search 4 -- monkeypatch / patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

### Hits in production files

| # | File | Line | Content |
|---|------|------|---------|
| 1 | `node_modules/mime-db/db.json` | 439 | `"application/dash-patch+xml": {` |
| 2 | `node_modules/mime-db/db.json` | 889 | `"application/json-patch+json": {` |
| 3 | `node_modules/mime-db/db.json` | 1082 | `"application/merge-patch+json": {` |
| 4 | `node_modules/mime-db/db.json` | 1311 | `"application/patch-ops-error+xml": {` |
| 5 | `node_modules/mime-db/db.json` | 6977 | `"application/xml-patch+xml": {` |
| 6 | `node_modules/mime-db/db.json` | 7028 | `"application/yang-patch+json": {` |
| 7 | `node_modules/mime-db/db.json` | 7032 | `"application/yang-patch+xml": {` |

All are MIME type name strings inside a static JSON data file. None are code.

### Hits in non-production files (excluded from analysis)

- `HISTORY.md:58` -- changelog entry mentioning "override"
- `package-lock.json` -- package names containing "wrap", "shim" (e.g. `wrap-ansi`, `spawn-wrap`, `es-shim-unscopables`)
- `node_modules/mime-db/HISTORY.md:537` -- changelog mentioning `merge-patch+json`

---

## Search 5 -- require.cache / require.extensions / Module internals

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks'
```

### Hits in production files

None.

### Hits in non-production files

None.

---

## Search 6 -- process.binding / internalBinding / internal modules

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

### Hits in production files

None.

### Hits in non-production files

None.
