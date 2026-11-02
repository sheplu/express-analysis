# Pass B -- Raw Search Results

**Package:** compressible v2.0.18 (commit 9a7ea07)
**Source:** `$PACKAGE_ROOT` = `compressible/upstream/compressible/`
**Date:** 2026-11-01

All searches run with:
`--no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'`

Non-production files (scripts/, README.md, HISTORY.md, package-lock.json, package.json) are
listed for completeness but marked `[non-prod]`.

---

## Search 1 -- require / import / from / node:

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

| # | File | Line | Match |
|---|------|------|-------|
| 1 | index.js | 16 | `var db = require('mime-db')` |
| 2 | node_modules/mime-db/index.js | 12 | `module.exports = require('./db.json')` |
| 3 | scripts/version-history.js | 3 | `var fs = require('fs')` `[non-prod]` |
| 4 | scripts/version-history.js | 4 | `var path = require('path')` `[non-prod]` |
| 5 | README.md | 20 | `var compressible = require('compressible')` `[non-prod]` |
| 6 | node_modules/mime-db/README.md | 35 | `var db = require('mime-db')` `[non-prod]` |
| 7-12 | package-lock.json | various | `resolve-from` references `[non-prod]` |

---

## Search 2 -- Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

| # | File | Line | Match |
|---|------|------|-------|
| 1 | node_modules/mime-db/db.json | 5763 | `"application/vnd.stardivision.writer-global"` |
| 2 | node_modules/mime-db/db.json | 5815 | `"application/vnd.sun.xml.writer.global"` |
| 3 | node_modules/mime-db/db.json | 8174 | `"message/global"` |
| 4 | node_modules/mime-db/db.json | 8178 | `"message/global-delivery-status"` |
| 5 | node_modules/mime-db/db.json | 8182 | `"message/global-disposition-notification"` |
| 6 | node_modules/mime-db/db.json | 8186 | `"message/global-headers"` |
| 7-10 | scripts/version-history.js | 8,15,20,28 | `process.env`, `process.exit` `[non-prod]` |
| 11-12 | package-lock.json | various | `process-on-spawn` references `[non-prod]` |

---

## Search 3 -- prototype / __proto__ / setPrototypeOf / defineProperty / Reflect / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

| # | File | Line | Match |
|---|------|------|-------|
| 1-28 | package-lock.json | various | Package names containing "prototype" (e.g. `array.prototype.flat`) `[non-prod]` |

**Zero hits in any production file.**

---

## Search 4 -- monkeypatch / patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

| # | File | Line | Match |
|---|------|------|-------|
| 1 | node_modules/mime-db/db.json | 439 | `"application/dash-patch+xml"` |
| 2 | node_modules/mime-db/db.json | 889 | `"application/json-patch+json"` |
| 3 | node_modules/mime-db/db.json | 1082 | `"application/merge-patch+json"` |
| 4 | node_modules/mime-db/db.json | 1311 | `"application/patch-ops-error+xml"` |
| 5 | node_modules/mime-db/db.json | 6977 | `"application/xml-patch+xml"` |
| 6 | node_modules/mime-db/db.json | 7028 | `"application/yang-patch+json"` |
| 7 | node_modules/mime-db/db.json | 7032 | `"application/yang-patch+xml"` |
| 8 | node_modules/mime-db/HISTORY.md | 537 | `Add application/merge-patch+json` `[non-prod]` |
| 9 | HISTORY.md | 58 | `Fix regex fallback to not override...` `[non-prod]` |
| 10-20 | package-lock.json | various | `es-shim-unscopables`, `wrap-ansi`, `spawn-wrap`, `word-wrap` `[non-prod]` |

---

## Search 5 -- require.cache / require.extensions / Module._load / etc.

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks'
```

**Zero hits across all files.**

---

## Search 6 -- process.binding / internalBinding / _http_ / internal/

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

**Zero hits across all files.**
