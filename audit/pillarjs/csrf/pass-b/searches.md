# Search log — csrf pass B (blind)

Scope of every search: the shipped runtime files only —
`$PACKAGE_ROOT/index.js`,
`$PACKAGE_ROOT/node_modules/rndm/index.js`,
`$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js`,
`$PACKAGE_ROOT/node_modules/uid-safe/index.js`,
`$PACKAGE_ROOT/node_modules/random-bytes/index.js`.
`rg --no-ignore` used because the files live under `node_modules`. Tests,
benchmarks, docs, and `index.d.ts` (types only, verified no runtime code)
excluded per scope. `find` over the four dependency directories confirmed the
above list is every `.js` file outside `tsscmp/test/` (out of scope).

## Skill group 1 — imports

Pattern: `require\s*\(|\bfrom\s*['"]|\bimport\s*\(|\bnode:`

Hits (complete core-import inventory):

| File:line | Import |
| --- | --- |
| index.js:15 | `require('rndm')` |
| index.js:16 | `require('uid-safe')` |
| index.js:17 | `require('tsscmp')` |
| index.js:18 | `require('crypto')` |
| node_modules/rndm/index.js:2 | `require('assert')` |
| node_modules/uid-safe/index.js:15 | `require('random-bytes')` |
| node_modules/random-bytes/index.js:14 | `require('crypto')` |
| node_modules/tsscmp/lib/index.js:9 | `require('crypto')` |

No ESM, dynamic `import()`, or `node:` specifiers. Core modules touched:
`crypto` (x3), `assert` (x1). All other requires are intra-tree packages.

## Skill group 2 — globals/inheritance

Pattern: `\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(`

Hits:
- node_modules/rndm/index.js:17 — `Buffer.byteLength(chars)` (read-only call)
- node_modules/uid-safe/index.js:50 — `!global.Promise` (read-only feature test)
- node_modules/random-bytes/index.js:47 — `!global.Promise` (read-only feature test)
- uid-safe/index.js:95,97 and random-bytes/index.js:68 — JSDoc comments only

No `extends`, no `util.inherits`, no `globalThis`, no `process` usage.

## Skill group 3 — prototype/descriptor mutation

Pattern: `\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign`

Hits: index.js:79, 94, 103, 112, 124 — all five are
`Tokens.prototype.<method> = function ...` where `Tokens` is the library's own
constructor defined at index.js:45. No core or global prototype is touched.
Zero hits for `__proto__`, `setPrototypeOf`, `defineProperty`, `Reflect.*`,
`Object.assign`.

## Skill group 4 — patch keywords

Pattern (case-insensitive): `monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b`

**Zero hits** (rg exit 1).

## Skill group 5 — module-loading interception

Pattern: `require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks`

**Zero hits** (rg exit 1).

## Skill group 6 — bindings/internals

Pattern: `process\.(binding|_linkedBinding)|internalBinding|['"]_http_|['"]internal/`

**Zero hits** (rg exit 1).

## Supplementary searches

### G7 — assignment writes to core namespaces

Pattern: `(crypto|Math|Buffer|process|assert|global|globalThis)\s*\.\s*\w+\s*=[^=]`

**Zero hits** (rg exit 1). No runtime file assigns onto any core namespace.

### G8 — crypto/Math.random usage inventory (reads/calls)

Pattern: `crypto\.\w+|Math\.random|timingSafeEqual|pseudoRandomBytes|randomBytes|createHash|createHmac`

Hits (all are reads or calls, no writes):
- index.js:153 — `crypto.createHash('sha1')`
- tsscmp/lib/index.js:17-18 — `if (crypto.timingSafeEqual) { return crypto.timingSafeEqual(a, b) }` (feature-detect read + call)
- tsscmp/lib/index.js:31 — `crypto.pseudoRandomBytes(32)` (deprecated API call)
- tsscmp/lib/index.js:32-33 — `crypto.createHmac('sha256', key)` calls
- random-bytes/index.js:21 — `crypto.randomBytes === crypto.pseudoRandomBytes` (init-time identity read)
- random-bytes/index.js:77,96 — `crypto.randomBytes(size[, cb])` calls
- rndm/index.js:22 — `Math.random()` call
- uid-safe/index.js:15,76,88 — calls into the random-bytes package (not core)

### G9 — delete / descriptor / freeze operations

Pattern: `\bdelete\b|getOwnPropertyDescriptor|freeze|seal`

**Zero hits** (rg exit 1).

### Install scripts

Checked `scripts` in all five package.json files (csrf, rndm, tsscmp,
uid-safe, random-bytes): **no install/postinstall/prepare scripts** in any.
(Tree was installed with `--ignore-scripts` regardless.)

### Node core baseline (targeted, per skill table)

`rg -n "pseudoRandomBytes|randomBytes|createHash|createHmac|timingSafeEqual" $NODEJS_SOURCE/lib/crypto.js`
→ export sites at lib/crypto.js:200 (createHash), :201 (createHmac),
:230 (randomBytes), :239 (timingSafeEqual); `pseudoRandomBytes` defined as a
lazy deprecated-alias accessor via `getRandomBytesAlias` at lib/crypto.js:304
and :387. No recursive scan of the Node tree performed.
