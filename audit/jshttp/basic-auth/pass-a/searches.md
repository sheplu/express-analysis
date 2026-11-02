# basic-auth v3.0.0 — Pass A — Raw Search Results

Package: `basic-auth` v3.0.0
Commit: `301fe415bd5cf342f2c87ac37906c199a8f5800a`
Date: 2026-11-01

Production source files searched:
- `$PACKAGE_ROOT/src/index.ts`
- `$PACKAGE_ROOT/src/base64.ts`

> All results below are filtered to production files only (spec/bench/test files excluded).

---

## Group 1 — Imports / require / `node:` protocol

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ./src/
```

**Production hits:**

```
./src/index.ts:9:import { base64 } from './base64.js';
```

No `require()`, no `node:` protocol imports, no dynamic `import()`.

---

## Group 2 — Globals: Buffer, process, globalThis, global, extends, inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ./src/
```

**Production hits:**

```
./src/base64.ts:2:  if (typeof Buffer !== 'undefined') {
./src/base64.ts:4:      encode: (str: string) => Buffer.from(str, 'utf-8').toString('base64'),
./src/base64.ts:5:      decode: (str: string) => Buffer.from(str, 'base64').toString('utf-8'),
```

---

## Group 3 — Prototype / property manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' ./src/
```

**Production hits:** (none)

---

## Group 4 — Monkeypatch / shim / polyfill keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ./src/
```

**Production hits:** (none)

---

## Group 5 — Module-loader hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' ./src/
```

**Production hits:** (none)

---

## Group 6 — Internal bindings / private Node.js APIs

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' ./src/
```

**Production hits:** (none)
