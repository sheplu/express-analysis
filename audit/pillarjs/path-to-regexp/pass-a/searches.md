# Pass A search log: path-to-regexp@9.0.0

Scope searched (runtime files only, per audit scope):

- `$PACKAGE_ROOT/src/index.ts` (git master @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20`)
- `$NPM_ARTIFACT/dist/index.js` (published 9.0.0 artifact, the file consumers load)

Out of scope and therefore not searched as candidates: `src/*.spec.ts`,
`src/index.bench.ts`, configs, docs, devDependencies, `dist/index.d.ts`
(type declarations, not executed), `dist/index.js.map` (source map, not
executed). All searches used `rg -n --no-ignore` restricted to the two runtime
files above.

## Skill candidate pattern groups (mandatory six)

| # | Pattern | Result |
| --- | --- | --- |
| 1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | ZERO HITS. The library imports nothing at all — no CommonJS, ESM, `node:`, or dynamic imports in either runtime file. |
| 2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | HITS (all benign, ledger C-001/C-002/C-007): `extends` at src/index.ts:128 + dist/index.js:21 (`class PathError extends TypeError`, ordinary subclassing); TypeScript-only `extends` in interfaces/generics at src/index.ts:43,256,278,379,387,392,402 (erased in dist); `process` hits at src/index.ts:452,454,476 + dist/index.js:236,239,253 are a local function named `process` inside `pathToRegexp`, not Node's global. No Buffer/globalThis/global/inherits. |
| 3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | ZERO HITS. |
| 4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` | ZERO HITS. |
| 5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | ZERO HITS. |
| 6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | ZERO HITS. |

## Domain-specific extra searches (RegExp/String/intrinsics focus)

| # | Pattern | Result |
| --- | --- | --- |
| 7 | `\bSymbol\b` (well-known symbol overrides, e.g. `Symbol.match`/`Symbol.replace`) | ZERO HITS. |
| 8 | `RegExp\.\|String\.\|Object\.\|Array\.\|Function\.\|Reflect\b\|Proxy\b` (static/intrinsic member access) | HITS (benign, ledger C-006): `Array.isArray(...)` at src/index.ts:338,453 + dist/index.js:169,237; `Object.create(null)` at src/index.ts:421 + dist/index.js:217. Read-only/constructor uses; no writes to intrinsic namespaces. |
| 9 | `\bexec\b` | HITS (benign, ledger C-003): `regexp.exec(input)` at src/index.ts:417 + dist/index.js:213 — method call on library-created RegExp instance; no assignment. |
| 10 | `new\s+RegExp` | HITS (ledger C-004): src/index.ts:481 + dist/index.js:256 — constructs and returns a plain RegExp; verified unpatched (no own keys added, prototype unchanged). |
| 11 | `delete\s` | ZERO HITS. |
| 12 | `\bdefine\|freeze\|seal\b` | ZERO HITS. |
| 13 | Dotted-member write scan `^[^=]*\.[A-Za-z_$][\w$]*\s*=[^=]` (any assignment to a property of any object) | HITS (benign, ledger C-005): `this.originalPath = originalPath` (dist/index.js:27, own field of library class instance); `missing.length = len` (src:323 / dist:157) and `result.length = len` (src:501 / dist:267), both truncating library-local arrays. These are the ONLY property assignments in the entire runtime code. |

## Supplementary verifications

| Check | Command (portable form) | Result |
| --- | --- | --- |
| Git HEAD / cleanliness | `git -C "$PACKAGE_ROOT" log -1; git status --porcelain` | HEAD `32292b9d13239c7fa3ed23e89c59c10264f9fe20` ("9.0.0"), working tree clean. |
| Tarball integrity vs registry | `openssl dgst -sha512 -binary path-to-regexp-9.0.0.tgz \| openssl base64 -A` vs `npm view path-to-regexp@9.0.0 dist.integrity` | Match: `sha512-kfo5HIFCfEH24bcHSWEFIfrwiCsm/DXR+j1fc0696VIdWkICdAcKH2LxRClvz5HQcG4iCQpb4qBZ7pttGPG/dA==` (registry shasum `f6b516e6b5dbfbe9034a6fc1289bc687b26b70c7`). |
| Extracted artifact matches tarball | `tar -xzf ... -O package/dist/index.js \| shasum -a 256` vs extracted file | Both `033dfd75db5ffc587fc2741d6331ac4907494b87f353e792b1505dadfb86d706`. |
| Tarball contents | `tar -tzf path-to-regexp-9.0.0.tgz` | 6 files: LICENSE, Readme.md, package.json, dist/index.js, dist/index.js.map, dist/index.d.ts. Single runtime file. |
| Runtime export parity src vs dist | `grep '^export'` both files | dist exports exactly the 6 runtime symbols of src (`PathError`, `parse`, `compile`, `match`, `pathToRegexp`, `stringify`); all other src exports are type-only and erased. |
| Bounded history | `git log -n 10 -S 'prototype' -- src/index.ts`; same with `defineProperty` | ZERO commits touching those symbols in src/index.ts history. |
| Dynamic intrinsic snapshot | `node verify-no-mutation.mjs "$NPM_ARTIFACT/dist/index.js"` (node v24.19.0) | NO MUTATION DETECTED across globalThis, RegExp(+prototype), String(+prototype), Object(+prototype), Array(+prototype), Function.prototype, Error/TypeError(+prototypes), Symbol; `encodeURIComponent`/`decodeURIComponent`/`RegExp.prototype.exec`/`String.prototype.replace`/`String.prototype.split` identities unchanged; returned regexp is a plain RegExp with no extra own keys. |
