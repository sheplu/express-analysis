# Pass B -- Search Results

**Library**: on-headers v1.1.0
**Commit**: 691b687710ece2eef62e6a6d1bdcf3a3fcab932a
**Production files searched**: `index.js` (sole production file)

## Search Group 1: Imports and requires

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

**Production hits (index.js only)**:
- `index.js:16: var http = require('http')`

Analysis: Single import of Node.js core `http` module. No third-party dependencies.

## Search Group 2: Globals and inheritance

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

**Production hits**: None in index.js.

Analysis: No use of Buffer, process, globalThis, global, extends, or inherits in production code.

## Search Group 3: Prototype and property manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|...'
```

**Production hits**:
- `index.js:19: var isAppendHeaderSupported = typeof http.ServerResponse.prototype.appendHeader === 'function'`

Analysis: Read-only access to `http.ServerResponse.prototype.appendHeader` via `typeof` check. This is a feature-detection read, not a mutation. No `defineProperty`, `setPrototypeOf`, `__proto__`, or `Object.assign` used.

## Search Group 4: Patch/wrap/shim keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

**Production hits**: None in index.js.

Note: HISTORY.md mentions "Fix `res.writeHead` patch missing return value" which confirms the library's intent to patch writeHead, but this is not in production code.

## Search Group 5: Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|...)...'
```

**Production hits**: None.

Analysis: No module system manipulation.

## Search Group 6: Internal bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|...'
```

**Production hits**: None.

Analysis: No access to internal bindings or private Node.js APIs.
