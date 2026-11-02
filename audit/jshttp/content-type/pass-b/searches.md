# Search results -- content-type Pass B

All searches target the sole production file:
`$PACKAGE_ROOT/src/index.ts`

## Search 1: Imports, require, node: protocol

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1).

## Search 2: Globals -- Buffer, process, globalThis, global, extends, inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1).

## Search 3: Prototype manipulation, defineProperty, Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** 2 matches.

```
51: * Null object perf optimization. Faster than `Object.create(null)` and `{ __proto__: null }`.
55:  C.prototype = Object.create(null);
```

## Search 4: Monkeypatch, shim, polyfill, override keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1).

## Search 5: Module loader hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1).

## Search 6: process.binding, internalBinding, private Node.js modules

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1).

## Summary

- Total hits across all 6 searches: **2** (both from Search 3)
- Both hits relate to a local `NullObject` constructor pattern, not any external/shared prototype
- No imports, no Node.js globals, no module hooks, no internal bindings found
