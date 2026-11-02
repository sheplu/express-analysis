# Pass B — Search Results

**Package:** mime-db v1.54.0
**Commit:** ba120a7f71bc8ab7d5299e88c0049063239029a7
**Production files:** `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/db.json`
**Search scope:** All files excluding test*, benchmark*, dotfiles, node_modules, scripts, src

## Search 1: require/import/node: builtins

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

| File | Line | Match | Production? |
|------|------|-------|-------------|
| index.js | 12 | `module.exports = require('./db.json')` | YES |
| README.md | 35 | `var db = require('mime-db')` | No (docs) |
| package-lock.json | various | `resolve-from` references | No (lockfile) |

**Production hits: 1**

## Search 2: Globals (Buffer, process, globalThis, global, extends, inherits)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

| File | Line | Match | Production? |
|------|------|-------|-------------|
| package-lock.json | various | `process-on-spawn` package name | No (lockfile) |
| db.json | 5973 | `"application/vnd.stardivision.writer-global"` | Data value only |
| db.json | 6025 | `"application/vnd.sun.xml.writer.global"` | Data value only |
| db.json | 8429-8441 | `"message/global*"` MIME types | Data value only |

**Production hits: 0** (db.json matches are MIME type names in JSON keys, not code)

## Search 3: Prototype/property manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

| File | Line | Match | Production? |
|------|------|-------|-------------|
| package-lock.json | various | devDependency package names (`array.prototype.flat`, etc.) | No (lockfile) |

**Production hits: 0**

## Search 4: Patch keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

| File | Line | Match | Production? |
|------|------|-------|-------------|
| db.json | various | MIME types containing "patch" (`application/json-patch+json`, etc.) | Data value only |
| HISTORY.md | 538 | `Add application/merge-patch+json` | No (docs) |
| package-lock.json | various | devDependency names (`wrap-ansi`, `spawn-wrap`, etc.) | No (lockfile) |

**Production hits: 0** (db.json matches are MIME type names, not code)

## Search 5: Module system hooking

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks'
```

**No hits at all.**

## Search 6: Internal bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

**No hits at all.**

## Summary

Only 1 production code hit across all 6 search groups: the `require('./db.json')` call in `index.js`. All other matches are in non-production files (package-lock.json, README.md, HISTORY.md) or are MIME type string data within db.json.
