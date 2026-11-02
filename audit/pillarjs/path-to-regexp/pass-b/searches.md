# Pass B search log — path-to-regexp@9.0.0

Scope of every search below (runtime production code only):

- `$PACKAGE_ROOT/src/index.ts` (git tag v9.0.0 @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20`)
- `$NPM_ARTIFACT/dist/index.js` (published npm tarball 9.0.0, extracted)

Out of scope and therefore not searched as patch candidates: `src/*.spec.ts`,
`src/index.bench.ts`, `vitest.config.mts`, docs, configs, devDependencies.
The package declares **zero runtime dependencies** (`dependencies` absent from
`package.json`), so no dependency tree was scanned.

Tool: `rg -n <pattern> <the two files above>`.

## Skill candidate pattern groups (mandatory six)

| # | Pattern | Result | Disposition |
| --- | --- | --- | --- |
| 1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | **0 hits** | No module imports at all: the library is fully self-contained; it loads no Node core module and no dependency. |
| 2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | 15 hits | All benign: `class PathError extends TypeError` (src/index.ts:128, dist/index.js:21) = ordinary subclassing (ledger C-001); `process` hits (src/index.ts:452,454,476; dist/index.js:236,239,253) are a **local function declaration** named `process` inside `pathToRegexp`, not the global (C-002); remaining hits are TypeScript `extends` in type/interface/generic declarations (type-level only, erased in dist). No `Buffer`, no `globalThis`, no global `process` reference. |
| 3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | **0 hits** | No prototype access or descriptor manipulation anywhere in runtime code. |
| 4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | **0 hits** | No patching vocabulary. |
| 5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | **0 hits** | No module-loader interception. |
| 6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | **0 hits** | No native bindings or internal module access. |

## Domain-specific searches (RegExp/String intrinsics focus)

| # | Pattern | Result | Disposition |
| --- | --- | --- | --- |
| 7 | `RegExp` | 6 hits | Only `new RegExp(pattern, flags)` construction at src/index.ts:481 / dist/index.js:256 and the local helper name `toRegExpSource`. No `RegExp.prototype`, no static writes, no subclassing of RegExp (C-003). |
| 8 | `Symbol\.` and `\[\s*Symbol` | **0 hits** | No well-known-symbol definitions or overrides (`Symbol.match/matchAll/replace/split/search/species` untouched). |
| 9 | `\bexec\b` | 2 hits | `regexp.exec(input)` at src/index.ts:417 / dist/index.js:213 — read-only call of the intrinsic on a library-created instance; never assigned (C-004). |
| 10 | `String\.` | **0 hits** | No `String` static/prototype access; string methods used only as instance reads (`replace`, `split`, `includes`, `endsWith`) on local values. |
| 11 | `Object\.` | 2 hits | `Object.create(null)` (src/index.ts:421 / dist/index.js:217) — creates a fresh null-prototype params object; not a mutation. |
| 12 | `Array\.` | 4 hits | `Array.isArray(...)` reads only. |
| 13 | `Function\(\|eval\(\|new Function` | 0 relevant hits | Matches are local helper names `tokensToFunction`/`tokenToFunction`; no dynamic code evaluation. |
| 14 | `delete\s` | **0 hits** | No property deletion. |
| 15 | `=\s*function\|\.\w+\s*=` | 40 hits | Every assignment targets library-local objects: `missing.length = len`, `result.length = len` (local arrays), `this.originalPath = ...` (own instance in `PathError` constructor), `path += ...` etc. Zero writes to shared/core objects (C-007). |
| 16 | `encodeURIComponent\|decodeURIComponent` | 6 hits | Used as default option values (reads of globals); never reassigned (C-005). |

## Artifact inventory checks

| Check | Command | Result |
| --- | --- | --- |
| npm artifact file list | `find $NPM_ARTIFACT/.. -type f` | `path-to-regexp-9.0.0.tgz`, `package/{LICENSE,Readme.md,package.json,dist/{index.js,index.js.map,index.d.ts}}` — no install hooks, no extra executables. |
| Lifecycle scripts | `rg '"(pre\|post)?install"\|"prepare"' $NPM_ARTIFACT/package.json` | Only `"prepare": "ts-scripts install && npm run build"` — not executed on registry-tarball installs (dist/ ships prebuilt); build-only, devDependency tooling (C-006). |
| `dist/index.d.ts` | `rg 'prototype\|define\|assign\|global'` | Type declarations only; no executable code. |
| `dist/index.js.map` | inspected name/role | Source map metadata; non-executable. |
| Tarball vs extracted dist | `tar -xzf ... -O package/dist/index.js \| diff - package/dist/index.js` | Byte-identical ("TARBALL-EXTRACT-MATCH"). |
| Tarball integrity | `shasum -a1 / -a512` vs `npm view path-to-regexp@9.0.0 dist.shasum dist.integrity` | sha1 `f6b516e6b5dbfbe9034a6fc1289bc687b26b70c7` and `sha512-kfo5HIFCfEH24bcHSWEFIfrwiCsm/DXR+j1fc0696VIdWkICdAcKH2LxRClvz5HQcG4iCQpb4qBZ7pttGPG/dA==` — **both match the registry**. |

## Node.js core baseline

No Node core module is imported by the library (search #1: zero hits), so no
`$NODEJS_SOURCE` lib file is an applicable patch target. The relevant "core"
objects in this domain are JS language intrinsics (RegExp/String/Object/Array/
Function prototypes, well-known symbols), which live in V8, not in Node's `lib/`
tree; they were verified live via the before/after runtime snapshot in
`repro/snapshot-diff.cjs` (zero changes). `$NODEJS_SOURCE` (main @
`d44625a4b80c672215b469906ce583ce7eeeebaf`) was used read-only for ref
recording only; no recursive scans performed.
