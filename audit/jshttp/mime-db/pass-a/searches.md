# Pass A — Search Results

## Package
- **Name:** mime-db
- **Version:** 1.54.0
- **Commit:** ba120a7f71bc8ab7d5299e88c0049063239029a7

## Production files scanned
- `$PACKAGE_ROOT/index.js` (12 lines)
- `$PACKAGE_ROOT/db.json` (9613 lines, static JSON data)

## Search Group 1: require/import/from
```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```
**Production hits:**
- `index.js:12` — `module.exports = require('./db.json')`

**Non-production hits (excluded):**
- `README.md:35` — documentation example
- `package-lock.json` — multiple "resolve-from" entries (dev dependency metadata)

## Search Group 2: Buffer/process/globalThis/global/extends/inherits
```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```
**Production hits:**
- `db.json:5973` — `"application/vnd.stardivision.writer-global"` (MIME type name)
- `db.json:6025` — `"application/vnd.sun.xml.writer.global"` (MIME type name)
- `db.json:8429` — `"message/global"` (MIME type name)
- `db.json:8433` — `"message/global-delivery-status"` (MIME type name)
- `db.json:8437` — `"message/global-disposition-notification"` (MIME type name)
- `db.json:8441` — `"message/global-headers"` (MIME type name)

**Non-production hits (excluded):**
- `package-lock.json` — "process-on-spawn" entries (dev dependency)

## Search Group 3: prototype/defineProperty/Object.assign
```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```
**Production hits:** None

**Non-production hits (excluded):**
- `package-lock.json` — multiple dev dependency names containing "prototype" (e.g., `array.prototype.flat`, `string.prototype.trim`)

## Search Group 4: patch/wrap/shim/polyfill/override
```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```
**Production hits:**
- `db.json:478` — `"application/dash-patch+xml"` (MIME type name)
- `db.json:937` — `"application/json-patch+json"` (MIME type name)
- `db.json:941` — `"application/json-patch-query+json"` (MIME type name)
- `db.json:1149` — `"application/merge-patch+json"` (MIME type name)
- `db.json:1378` — `"application/patch-ops-error+xml"` (MIME type name)
- `db.json:7220` — `"application/xml-patch+xml"` (MIME type name)
- `db.json:7272` — `"application/yang-patch+json"` (MIME type name)
- `db.json:7276` — `"application/yang-patch+xml"` (MIME type name)

**Non-production hits (excluded):**
- `package-lock.json` — dev dependency names ("wrap-ansi", "es-shim-unscopables", "spawn-wrap", "word-wrap")
- `HISTORY.md` — changelog entry

## Search Group 5: require.cache/Module hooks
```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks'
```
**Hits:** None (exit code 1)

## Search Group 6: process.binding/internalBinding
```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```
**Hits:** None (exit code 1)
