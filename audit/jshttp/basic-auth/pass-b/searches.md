# basic-auth v3.0.0 — Pass B — Raw Search Results

**Commit:** `301fe415bd5cf342f2c87ac37906c199a8f5800a`
**Search target:** `$PACKAGE_ROOT/src/` (production files only: `index.ts`, `base64.ts`)
**Exclusions:** `test*`, `benchmark*`, `.*`, `node_modules`

---

## Group 1 — Imports / requires / `node:` protocol

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ./src/
```

### Production hits

```
./src/index.ts:9:import { base64 } from './base64.js';
```

### Non-production hits (test/bench — excluded from analysis)

```
./src/format.bench.ts:1:import { bench, describe } from 'vitest';
./src/format.bench.ts:2:import { format } from './index.js';
./src/format.spec.ts:1:import { describe, it, assert } from 'vitest';
./src/format.spec.ts:2:import { format } from './index.js';
./src/parse.spec.ts:1:import { describe, it, assert } from 'vitest';
./src/parse.spec.ts:2:import { parse } from './index.js';
./src/parse.bench.ts:1:import { describe, bench } from 'vitest';
./src/parse.bench.ts:2:import { parse } from './index.js';
./src/base64.spec.ts:1:import { afterAll, assert, beforeAll, describe, it, vi } from 'vitest';
./src/base64.spec.ts:6:  const { base64 } = await import('./base64.js');
```

---

## Group 2 — Buffer / process / globalThis / global / extends / inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ./src/
```

### Production hits

```
./src/base64.ts:2:  if (typeof Buffer !== 'undefined') {
./src/base64.ts:4:      encode: (str: string) => Buffer.from(str, 'utf-8').toString('base64'),
./src/base64.ts:5:      decode: (str: string) => Buffer.from(str, 'base64').toString('utf-8'),
```

### Non-production hits (test/bench — excluded from analysis)

```
./src/base64.spec.ts:17:  describe.skipIf(!Buffer)('Buffer', async () => {
./src/base64.spec.ts:29:      vi.stubGlobal('Buffer', undefined);
```

---

## Group 3 — Prototype / defineProperty / Reflect / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' ./src/
```

### Production hits

None.

### Non-production hits (test/bench — excluded from analysis)

```
./src/base64.spec.ts:27:  describe.skipIf(!Uint8Array.prototype.toBase64)('Uint8Array', async () => {
```

---

## Group 4 — Monkeypatch / patch / wrap / shim / polyfill / override keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ./src/
```

### Production hits

None.

### Non-production hits

None.

---

## Group 5 — Module loader hooks (require.cache, Module._, etc.)

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' ./src/
```

### Production hits

None.

### Non-production hits

None.

---

## Group 6 — process.binding / internalBinding / internal modules

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' ./src/
```

### Production hits

None.

### Non-production hits

None.
