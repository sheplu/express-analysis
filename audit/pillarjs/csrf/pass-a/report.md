# Node.js patch audit: csrf

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#29 — `csrf` (logic behind CSRF token creation and verification), https://github.com/pillarjs/csrf
- Library: csrf@3.1.0, `$PACKAGE_ROOT` = clone of pillarjs/csrf default branch `master` @ `33536b89609ea7354aeae2c0720087f6ff77eaa4`, source checkout with runtime deps installed via `npm install --ignore-scripts --omit=dev`; no local changes to audited sources
- Node.js baseline: `$NODEJS_SOURCE` = nodejs/node main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (read-only)
- Reproduction runtime: node v24.19.0
- Scope: production/runtime only — shipped entrypoint `$PACKAGE_ROOT/index.js` and all code reachable from it, plus the entrypoint/initialization of every resolved runtime dependency: rndm@1.2.0, tsscmp@1.0.6, uid-safe@2.1.5, random-bytes@1.0.0 (transitive of uid-safe). Tests, benchmarks, examples, docs, devDependencies excluded.
- Coverage: source complete (all five runtime files read in full, ~450 lines total); upstream corroboration done (pillarjs/csrf issues, suryagh/tsscmp#17); runtime verified on one Node version (v24.19.0) with a control run; legacy-Node fallback branches verified statically only (see limitations)

## Patching verdict

No patching was demonstrated. **0 shared core mutations, 0 instance/application
overrides, 0 core module interceptions, 0 core source rewrites** — direct or
transitive. All 11 candidates were traced to the exact operation and rejected
(0 unresolved). Every interaction with Node.js core across csrf and its four
resolved runtime dependencies is a read or a call: `crypto.createHash` (csrf),
`crypto.createHmac`, `crypto.pseudoRandomBytes`, `crypto.timingSafeEqual`
feature-detect (tsscmp), `crypto.randomBytes` plus the
`randomBytes === pseudoRandomBytes` identity check (random-bytes), `assert`,
`Buffer.byteLength`, `Math.random` (rndm), and `global.Promise` feature-detect
(uid-safe, random-bytes). The only `*.prototype` writes in scope are method
definitions on the library-owned `Tokens` constructor. A targeted search for
assignments or deletions on `crypto`/`assert`/`Math`/`Buffer`/`process`/
`global`/`globalThis` returned zero hits; the module-loading-hook and
internal-binding pattern groups returned zero hits; no install scripts exist.
A before/after descriptor-and-identity diff of the `crypto` module and key
globals/prototypes on node v24.19.0 showed no library-attributable change at
load or during use (the single observed descriptor change is Node core's own
lazy deprecated-alias materialization, reproduced without the library — see
supporting context).

## Confirmed Node.js patches

None. No candidate survived tracing; nothing in this section by design.
(Private API usage: none observed. Copied core code: none observed.)

## Candidate ledger and unresolved questions

Full ledger with evidence in [candidates.md](candidates.md). Summary:

| ID | Site and core target | Status | Reason (short) |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:79,94,103,112,124` — `Tokens.prototype.*=` | rejected as patch | library-owned constructor (index.js:45), inherits only Object.prototype; no core class touched |
| C-002 | `$PACKAGE_ROOT/index.js:18,151-159` — `crypto.createHash` | rejected as patch | read-only call; core baseline `$NODEJS_SOURCE/lib/crypto.js:149,200` |
| C-003 | `tsscmp/lib/index.js:17-18` — `crypto.timingSafeEqual` feature detect | rejected as patch | property read + call; fallback is a local loop, no write to `crypto` |
| C-004 | `tsscmp/lib/index.js:31` — `crypto.pseudoRandomBytes(32)` | rejected as patch | read + call of deprecated alias; descriptor change on first read is performed by core's own lazy getter (`$NODEJS_SOURCE/lib/crypto.js:309-340,387`), reproduced without the library |
| C-005 | `random-bytes/index.js:21` — `crypto.randomBytes === crypto.pseudoRandomBytes` at init | rejected as patch | two reads into a module-local variable; triggers the same core-owned alias materialization; no write |
| C-006 | `random-bytes/index.js:77,96,99` — `crypto.randomBytes` calls + `setTimeout` retry | rejected as patch | read-only calls; retry uses the global timer unmodified |
| C-007 | `rndm/index.js:17,22` — `Buffer.byteLength`, `Math.random` | rejected as patch | static calls only; identities unchanged in dynamic run |
| C-008 | `uid-safe/index.js:50`, `random-bytes/index.js:47` — `global.Promise` reads | rejected as patch | feature detection; no polyfill installed, `new Promise` used normally |
| C-009 | `rndm/index.js:2,16,20` — core `assert` usage | rejected as patch | function calls only |
| C-010 | all five files — `module.exports`/`exports.*` assignments | rejected as patch | writes to each package's own module object; G5 loader-hook group zero hits |
| C-011 | `uid-safe/index.js:103-106`, `$PACKAGE_ROOT/index.js:133-158` — method calls on core-produced Buffer/String instances | rejected as patch | invocations only; `Buffer.prototype.toString` / `String.prototype.replace` identities unchanged |

Unresolved: none.

## Supporting context

- **Core-owned lazy alias side effect (not a library patch).** On the audited
  Node main (and the Node >= 12 line), `crypto.pseudoRandomBytes` is a deprecated
  (DEP0115) lazy accessor alias defined by core at
  `$NODEJS_SOURCE/lib/crypto.js:384-389` via `getRandomBytesAlias`
  (`lib/crypto.js:309-340`). The first *read* makes core redefine the property
  on the `crypto` module as a plain data property whose value is core's own
  `randomBytes` (or a core `deprecate` wrapper under `--pending-deprecation`).
  Loading csrf triggers this read at `random-bytes/index.js:21`, and
  `tsscmp/lib/index.js:31` reads/calls the alias on every `verify`. The
  mutation is authored and executed entirely by Node core, installs only core
  code, changes no behavior, and occurs on any first read of the property
  (control run reproduced it with no library loaded). Classified as deprecated
  public-API usage, not patching.
- **Legacy-Node compatibility branches (workarounds, not patches).**
  tsscmp's `bufferEqual` byte-loop fallback for pre-6.6.0 Node without
  `crypto.timingSafeEqual` (`tsscmp/lib/index.js:15-25`, referencing
  nodejs/node#3043 / PR #3073 and jshttp/basic-auth#39);
  random-bytes' 3-attempt retry for legacy entropy-pool exhaustion gated by the
  `randomBytes === pseudoRandomBytes` check (`random-bytes/index.js:21,95-100`);
  uid-safe/random-bytes `global.Promise` detection for promise-less runtimes.
  All are local control flow; none modify core.
- **Upstream:** suryagh/tsscmp#17 (closed) discusses environments where
  `crypto.pseudoRandomBytes` is absent — confirms call-site usage only. No
  patch-related issues found in pillarjs/csrf.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `node_modules/{rndm,uid-safe,random-bytes}/index.js`, `node_modules/tsscmp/lib/index.js` | full reads + skill's six `rg -n --no-ignore` pattern groups (see [searches.md](searches.md)) | G1-G3 hits all traced and rejected; G4-G6 zero hits |
| same five files | `rg -n --no-ignore '(crypto\|assert\|Math\|global\|globalThis\|Buffer\|process)\s*(\.\s*\w+\|\[[^\]]+\])\s*=[^=]'` and `\bdelete\s+(...)` | zero hits — no writes/deletes on core modules or globals |
| dep package.json files | install/postinstall/prepare script check | none present (install also ran `--ignore-scripts`) |
| `$NODEJS_SOURCE/lib/crypto.js` @ d44625a4b80 | targeted `rg -n` + read of :149,:173,:200-201,:230,:239,:300-340,:375-395 | core baselines for createHash/createHmac/randomBytes/timingSafeEqual; pseudoRandomBytes is a core-owned lazy deprecated alias (DEP0115) |
| `$NODEJS_SOURCE/lib/internal/crypto/random.js` | `rg -n 'pseudoRandomBytes\|DEP0115'` | zero hits; alias lives entirely in lib/crypto.js |
| pillarjs/csrf issues | `gh search issues --repo pillarjs/csrf "patch"` | zero results |
| suryagh/tsscmp#17 | https://github.com/suryagh/tsscmp/issues/17 (closed) | corroborates read/call-only use of the deprecated alias |
| dynamic check | `node verify-no-mutation.js "$PACKAGE_ROOT"` and `--control` (script beside this report; node v24.19.0) | no library-attributable change to crypto descriptors or to `Math.random`/`Buffer.byteLength`/`Buffer.prototype.toString`/`Promise`/`setTimeout`/`String.prototype.replace`/`Object.prototype` at load or during create/verify/secret/secretSync; control run attributes the single pseudoRandomBytes descriptor change to core |

File hashes (sha256, relative to `$PACKAGE_ROOT`):

- `index.js` 109e4e1dfe38501de2d2427ca52d1d3f103e5f502845c21c10088548c86814f2
- `node_modules/rndm/index.js` 7f14e5512a31e12d8e1f8e63a370621cc42477d9857b8855ca4c28e95a3558eb
- `node_modules/tsscmp/lib/index.js` 8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7
- `node_modules/uid-safe/index.js` 1068a5918f3669a939c1c8865f2394cdc3ac126677e04d016a9e6fa9d9ff9a91
- `node_modules/random-bytes/index.js` d9a829fc576892245375789e614a398a577243d1649f7aed0e1b3d2e19bd8376

## Coverage and limitations

- Entry points: csrf exports exactly one runtime file (`index.js`; `files`
  whitelist also carries index.d.ts — types only, no runtime code, manually
  verified). No conditional/optional entrypoints, no `exports` map, no install
  scripts. Every resolved runtime dependency ships exactly one runtime JS file;
  each was read in full before exclusion. tsscmp's published tarball includes
  `test/`, which is unreachable from its `main` (`lib/index.js` requires only
  `crypto`) and out of scope.
- Node.js files inspected: `lib/crypto.js` (targeted line ranges) and
  `lib/internal/crypto/random.js` (targeted grep) at `d44625a4b80`. No
  recursive Node-tree scans.
- Branches not executed: tsscmp's pre-v6.6.0 fallback loop (no
  `crypto.timingSafeEqual`) and random-bytes' legacy 3-attempt path
  (`generateAttempts = 3`, requires `randomBytes !== pseudoRandomBytes`, i.e.
  Node <= 0.x) could not be triggered on node v24.19.0; both were verified
  statically to contain only local control flow with no core writes. The
  callback-vs-promise branches of uid-safe/random-bytes were both exercised.
- Dynamic verification used a single runtime (node v24.19.0); a tested branch
  cannot prove universal absence, but static proof covers all shipped code
  paths in scope.
- Blind pass: performed without reading any other pass's artifacts.
- What would change the verdict: discovery of additional shipped runtime files
  (none exist per `files`/tarball inventory), or a different resolved
  dependency version containing writes (versions here are exact-pinned by
  csrf's package.json except uid-safe's `random-bytes: ~1.0.0`, resolved to
  1.0.0).

## Changes since the previous audit

First audit (Pass A, blind). No previous report existed at this path.
