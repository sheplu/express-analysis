# Pass A search log — csrf@3.1.0 patch audit

Scope searched (runtime files reachable from shipped entrypoints; `--no-ignore`
used because dependencies live under node_modules):

- `$PACKAGE_ROOT/index.js` (sole shipped runtime entrypoint; `files` whitelist = LICENSE, HISTORY.md, README.md, index.d.ts, index.js)
- `$PACKAGE_ROOT/node_modules/rndm/index.js` (rndm@1.2.0, sole shipped JS)
- `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` (tsscmp@1.0.6 `main`; tarball also carries test/ — out of scope, not reachable from lib/index.js which requires only `crypto`)
- `$PACKAGE_ROOT/node_modules/uid-safe/index.js` (uid-safe@2.1.5, sole shipped JS)
- `$PACKAGE_ROOT/node_modules/random-bytes/index.js` (random-bytes@1.0.0, sole shipped JS)

`$PACKAGE_ROOT/index.d.ts` inspected manually: TypeScript declarations only, no runtime code.

## Skill candidate pattern groups (rg -n --no-ignore over the five files above)

| # | Pattern | Result |
| --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | 8 hits — static `require` of `crypto` (csrf index.js:18, tsscmp lib/index.js:9, random-bytes index.js:14), `assert` (rndm index.js:2), and the three dep packages (csrf index.js:15-17, uid-safe index.js:15). No dynamic import, no `node:` specifiers. All ledgered. |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | 6 hits — `global.Promise` reads (uid-safe index.js:50, random-bytes index.js:47), `Buffer.byteLength(chars)` call (rndm index.js:17), `Buffer` in JSDoc comments (uid-safe index.js:95,97; random-bytes index.js:68). No `extends`/`inherits`, no writes. Ledgered C-007/C-008. |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | 5 hits — all `Tokens.prototype.<method> =` on the library-owned `Tokens` constructor (csrf index.js:79,94,103,112,124). No defineProperty/__proto__/setPrototypeOf anywhere. Ledgered C-001. |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | zero hits |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | zero hits |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | zero hits |

## Targeted follow-up searches (same five files)

| Pattern | Purpose | Result |
| --- | --- | --- |
| `(crypto\|assert\|Math\|global\|globalThis\|Buffer\|process)\s*(\.\s*\w+\|\[[^\]]+\])\s*=[^=]` | any assignment onto a core module/global (incl. computed keys) | zero hits |
| `\bdelete\s+(crypto\|assert\|Buffer\|process\|global)` | property deletion on core objects | zero hits |
| package.json `scripts` of all four deps | preinstall/install/postinstall/prepare hooks | none present in rndm, tsscmp, uid-safe, random-bytes (install was also run with `--ignore-scripts`) |
| `find <dep> -name '*.js' -not -path '*/node_modules/*'` | shipped-file inventory per dep | each dep ships exactly one runtime JS (tsscmp additionally ships test/, out of scope) |

## Node.js core verification searches ($NODEJS_SOURCE @ d44625a4b80, read-only)

| Scope | Query | Result |
| --- | --- | --- |
| lib/crypto.js | `createHash\|createHmac\|randomBytes\|pseudoRandomBytes\|timingSafeEqual` | createHash defined :149 / exported :200; createHmac :173/:201; randomBytes exported :230; timingSafeEqual exported :239; pseudoRandomBytes :387 |
| lib/crypto.js:309-340,384-389 | read `getRandomBytesAlias` | deprecated aliases prng/pseudoRandomBytes/rng are core-owned lazy accessors that redefine themselves as data properties (value = core `randomBytes`, or a core `deprecate` wrapper under `--pending-deprecation`, DEP0115) on first read |
| lib/internal/crypto/random.js | `pseudoRandomBytes\|DEP0115` | zero hits (alias handled entirely in lib/crypto.js) |

No recursive scan of the Node tree was performed.

## Upstream corroboration (gh, read-only)

| Query | Result |
| --- | --- |
| `gh search issues --repo pillarjs/csrf "patch"` | zero results |
| `gh search issues "pseudoRandomBytes repo:suryagh/tsscmp"` + `gh issue view 17` | suryagh/tsscmp#17 (closed): environments lacking `crypto.pseudoRandomBytes`; confirms tsscmp merely calls the deprecated alias — no patching discussion |

## Dynamic verification

Script: `verify-no-mutation.js` (this folder). Runs on node v24.19.0:

- `node verify-no-mutation.js --control` — no library; a single read of `crypto.pseudoRandomBytes` flips that property accessor -> data with value `=== crypto.randomBytes` (core lazy alias). No other change.
- `node verify-no-mutation.js "$PACKAGE_ROOT"` — after `require(csrf)`: identical single descriptor change (attributed to core by the control), NONE otherwise; after exercising `create`/`verify` (valid+invalid)/`secret` (callback+promise)/`secretSync`: zero crypto descriptor changes, zero global/builtin identity changes (`Math.random`, `Buffer.byteLength`, `Buffer.prototype.toString`, `Promise`, `setTimeout`, `String.prototype.replace`, `Object.prototype` key set). Functional checks passed.
