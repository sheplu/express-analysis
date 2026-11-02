# Pass A - Search results: content-type

All searches run against the sole production file: `$PACKAGE_ROOT/src/index.ts`

## Group 1: Imports, require, node: protocol

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1)

## Group 2: Globals (Buffer, process, globalThis, global, extends, inherits)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1)

## Group 3: Prototype mutation, defineProperty, Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** 2 matches

```
51: * Null object perf optimization. Faster than `Object.create(null)` and `{ __proto__: null }`.
55:  C.prototype = Object.create(null);
```

## Group 4: Patching keywords (monkeypatch, patch, wrap, shim, polyfill, override)

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1)

## Group 5: Module loading hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1)

## Group 6: Internal bindings (process.binding, internalBinding, _http_, internal/)

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' $PACKAGE_ROOT/src/index.ts
```

**Result:** No matches (exit code 1)
