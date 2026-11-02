# Pass A — Search Results

All searches run against: `$PACKAGE_ROOT/src/index.ts`

## Group 1: Imports/Requires/Node Protocol
```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' $PACKAGE_ROOT/src/index.ts
```
**Result:** NO MATCHES

## Group 2: Globals/Built-ins
```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' $PACKAGE_ROOT/src/index.ts
```
**Result:** 1 hit
```
91:   * The default function is the global `decodeURIComponent`, wrapped in a `try..catch`. If an error
```

## Group 3: Prototype/Property Manipulation
```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' $PACKAGE_ROOT/src/index.ts
```
**Result:** 1 hit
```
78:  C.prototype = Object.create(null);
```

## Group 4: Patching Keywords
```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' $PACKAGE_ROOT/src/index.ts
```
**Result:** NO MATCHES

## Group 5: Module System Hooks
```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' $PACKAGE_ROOT/src/index.ts
```
**Result:** NO MATCHES

## Group 6: Node.js Internals
```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' $PACKAGE_ROOT/src/index.ts
```
**Result:** NO MATCHES
