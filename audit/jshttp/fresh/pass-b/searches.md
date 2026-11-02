# Search log — fresh Pass B

All searches run against `$PACKAGE_ROOT` with flags `--no-ignore -g '!test*' -g '!benchmark*'`.

## Search 1: require / import / node: builtins

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Result (3 hits, all in README.md — non-production):**

```
README.md:24:var fresh = require('fresh')
README.md:75:var fresh = require('fresh')
README.md:76:var http = require('http')
```

**Production file index.js: 0 hits.**

## Search 2: Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Result: 0 hits.**

## Search 3: prototype / defineProperty / Reflect / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Result: 0 hits.**

## Search 4: monkeypatch / patch / wrap / shim / polyfill / override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Result: 0 hits.**

## Search 5: require.cache / Module internals / ESM hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Result: 0 hits.**

## Search 6: process.binding / internalBinding / internal modules

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' $PACKAGE_ROOT
```

**Result: 0 hits.**

## Summary

| Search group | Production hits | Non-production hits |
|---|---|---|
| 1. require/import/node: | 0 | 3 (README.md) |
| 2. Buffer/process/global/extends/inherits | 0 | 0 |
| 3. prototype/defineProperty/Reflect/Object.assign | 0 | 0 |
| 4. monkeypatch/patch/wrap/shim/polyfill/override | 0 | 0 |
| 5. require.cache/Module internals/ESM hooks | 0 | 0 |
| 6. process.binding/internalBinding/internal modules | 0 | 0 |
| **Total** | **0** | **3** |
