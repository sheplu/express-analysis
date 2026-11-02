# Search log -- fresh Pass A

All searches run against `$PACKAGE_ROOT` excluding `test*` and `benchmark*` directories.

Production files in scope (per `package.json` `files` field): `index.js` only.

## Search 1 -- require / import / node: builtins

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Results:**

```
README.md:24:var fresh = require('fresh')
README.md:75:var fresh = require('fresh')
README.md:76:var http = require('http')
```

All hits are in `README.md` (documentation, not shipped in `files`). Zero hits in production code (`index.js`).

## Search 2 -- Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Results:** No matches (exit code 1).

## Search 3 -- prototype / defineProperty / Reflect / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Results:** No matches (exit code 1).

## Search 4 -- monkeypatch / patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Results:** No matches (exit code 1).

## Search 5 -- require.cache / Module internals / ESM hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Results:** No matches (exit code 1).

## Search 6 -- process.binding / internalBinding / _http_ / internal/

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Results:** No matches (exit code 1).

## Supplemental search -- Date.parse usage in index.js

```
rg -n '\bDate\.parse\b' $PACKAGE_ROOT/index.js
```

**Results:**

```
94:  var timestamp = date && Date.parse(date)
96:  // istanbul ignore next: guard against date.js Date.parse patching
```

This is a read-only call to `Date.parse`, not a mutation. The comment references a *different* library (date.js) that may patch `Date.parse`; fresh itself does not.

## Summary

- Total hits across all 6 search groups in production files (`index.js`): **0**
- Total hits in non-production files (README.md): 3 (all `require()` calls in documentation examples)
- Supplemental Date.parse check: call only, no mutation
