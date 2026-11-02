# Pass A - Search Results

**Library:** on-headers v1.1.0
**Commit:** 691b687710ece2eef62e6a6d1bdcf3a3fcab932a
**Production files:** `$PACKAGE_ROOT/index.js` (sole production file per `files` field in package.json)

All searches run against production files only (excluding test*, benchmark*, dotfiles, nested node_modules).

## Search 1: require/import

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

**Production hits:**
- `index.js:16:var http = require('http')` -- imports Node.js core `http` module

**Non-production hits (scripts/):** `fs`, `path`, `../scripts/upstream-common`, `crypto`, `http` -- all build/dev scripts, not shipped.

**Assessment:** Single core import of `http`. No third-party dependencies. No dynamic imports.

## Search 2: Globals/builtins (Buffer, process, globalThis, global, extends, inherits)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

**Production hits:** NONE

**Non-production hits:** `process.env` and `process.exit` in `scripts/version-history.js` only.

**Assessment:** No globals accessed or mutated in production code.

## Search 3: Prototype/defineProperty

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

**Production hits:**
- `index.js:19:var isAppendHeaderSupported = typeof http.ServerResponse.prototype.appendHeader === 'function'`

**Assessment:** READ-ONLY access to `http.ServerResponse.prototype.appendHeader` via `typeof` check. No write to prototype. Used to select between `set1dArrayWithAppend` and `set1dArrayWithSet` helper functions. Feature detection only.

## Search 4: patch/wrap/shim/polyfill/override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

**Production hits:** NONE

**Non-production hits:** `HISTORY.md:9` mentions "Fix `res.writeHead` patch missing return value" (documentation only).

**Assessment:** No self-describing patch language in production code.

## Search 5: Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks'
```

**Production hits:** NONE

**Assessment:** No module loader hooks.

## Search 6: Internal bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

**Production hits:** NONE

**Assessment:** No access to Node.js internal bindings or private modules.
