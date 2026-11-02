# Pass B - Search Results

## Library
- **Package:** content-disposition v3.0.0
- **Commit:** 1a542fe19e982569c5fb0162b3a1997ad02da1fe
- **Production files searched:** `$PACKAGE_ROOT/src/index.ts`
- **Non-shipped files noted:** `$PACKAGE_ROOT/demo/server.js`

---

## Search 1: Imports / Requires
```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

**Production hits:** None

**Non-production hits (demo/server.js only):**
- Line 1: `import fs from 'node:fs';`
- Line 2: `import http from 'node:http';`
- Line 4: `import { create, parse } from '../dist/index.js';`

---

## Search 2: Globals / Builtins (Buffer, process, globalThis, global, extends, inherits)
```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

**Production hits:** None

**Non-production hits (demo/server.js only):**
- Line 6: `process.env.PORT`
- Line 7: `process.env.HOST`
- Lines 33, 74: `Buffer.byteLength(body)`
- Line 160: `Buffer.concat(chunks)`
- Line 166: `Buffer.from(...)`
- Line 171: `Buffer.from('--')`
- Line 173: `Buffer.from('\r\n\r\n')`

---

## Search 3: Prototype / Property Manipulation
```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

**Production hits:**
- `$PACKAGE_ROOT/src/index.ts:19`: Comment: `Faster than \`Object.create(null)\` and \`{ __proto__: null }\`.`
- `$PACKAGE_ROOT/src/index.ts:23`: `C.prototype = Object.create(null);`

---

## Search 4: Patching Keywords
```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

**Production hits:** None
**Non-production hits:** None

---

## Search 5: Module System Hooks
```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks'
```

**Production hits:** None
**Non-production hits:** None

---

## Search 6: Internal Bindings
```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

**Production hits:** None
**Non-production hits:** None
