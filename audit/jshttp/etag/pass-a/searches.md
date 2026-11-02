# Pass A — Raw Search Results

**Package:** etag v1.8.1
**Commit:** 5df2cfdd46d310ccf51638d5b702375cbd99da44
**Production files searched:** `$PACKAGE_ROOT/index.js` (sole production file)

## Search 1: Imports / Requires

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

```
21:var crypto = require('crypto')
22:var Stats = require('fs').Stats
```

## Search 2: Globals (Buffer, process, globalThis, global, extends, inherits)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

```
34: * @param {Buffer|string} entity
54:    ? Buffer.byteLength(entity, 'utf8')
63: * @param {string|Buffer|Stats} entity
82:  if (!isStats && typeof entity !== 'string' && !Buffer.isBuffer(entity)) {
83:    throw new TypeError('argument entity must be string, Buffer, or fs.Stats')
```

## Search 3: Prototype / Property Manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

```
29:var toString = Object.prototype.toString
```

## Search 4: Patch Keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

No matches.

## Search 5: Module System Hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks'
```

No matches.

## Search 6: Internal Bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

No matches.
