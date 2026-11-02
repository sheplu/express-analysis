# Node.js patch audit: csrf (pass B, blind)

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#29 — `csrf` (logic behind CSRF token creation and verification), https://github.com/pillarjs/csrf
- Library: csrf 3.1.0, default branch `master` @ `33536b89609ea7354aeae2c0720087f6ff77eaa4`, git checkout (unmodified); runtime deps installed from npm with `--ignore-scripts --omit=dev`: rndm@1.2.0, tsscmp@1.0.6, uid-safe@2.1.5, random-bytes@1.0.0
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (read-only, targeted files only)
- Reproduction runtime: Node.js v24.19.0
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (sole shipped runtime entrypoint; `files` whitelist additionally ships only LICENSE/HISTORY/README/index.d.ts, the last verified types-only) plus the resolved entrypoint of every runtime dependency: `node_modules/rndm/index.js`, `node_modules/tsscmp/lib/index.js`, `node_modules/uid-safe/index.js`, `node_modules/random-bytes/index.js`. Tests, benchmarks, examples, docs, devDependencies excluded.
- Coverage: source 100% of runtime files (five files, ~350 LOC total, each read in full); upstream corroborated from in-code references; runtime verified with before/after snapshot diff. No material limitations.

## Patching verdict

**No patching was demonstrated.** Shared core mutations: 0. Instance or
application overrides: 0. Core module interceptions: 0. Core source rewrites: 0.
This holds for csrf directly and for all four resolved runtime dependencies
(transitive scope fully covered — the dependency tree is only four single-file
packages, each read end-to-end).

Every write in the runtime scope targets either (a) the library-owned `Tokens`
constructor's prototype, or (b) each package's own `module.exports` object.
Core modules (`crypto`, `assert`) and globals (`Buffer`, `Math`, `Promise`,
`global`, `setTimeout`) are only ever **read or called**, never assigned,
deleted, redefined, or wrapped. Supplementary search G7
(`(crypto|Math|Buffer|process|assert|global|globalThis)\.\w+\s*=`) returned
zero hits; patch-keyword, module-interception, and internal-binding searches
(skill groups 4-6) returned zero hits. 11 candidates were traced and rejected;
0 remain unresolved. A runtime reproduction confirmed the static result
(see Reproduction details below).

## Confirmed Node.js patches

None. No reachable write or replacement of core APIs, globals, shared
prototypes, core-backed instances, core module loading, or core source was
found. Private/deprecated API usage and feature detection observed in
dependencies are reads only; they are documented in Supporting context and
were not promoted here.

## Candidate ledger and unresolved questions

Full ledger with trace details: [candidates.md](candidates.md). Summary:

| ID | Site and core target | Status | Reason (abridged) |
| --- | --- | --- | --- |
| C-001 | index.js:79-124 `Tokens.prototype.* =` | rejected as patch | library-owned constructor prototype, no core class involved |
| C-002 | index.js:151-159 `crypto.createHash('sha1')` | rejected as patch | read-only API call; identities intact at runtime |
| C-003 | rndm/index.js:8-13 exports assignments | rejected as patch | writes to rndm's own module.exports |
| C-004 | rndm/index.js:17,22 `Buffer.byteLength` / `Math.random` | rejected as patch | read-only calls; `Math.random` identity intact |
| C-005 | tsscmp/lib/index.js:17-18 `if (crypto.timingSafeEqual)` | rejected as patch | feature-detect read; local fallback never installed onto crypto |
| C-006 | tsscmp/lib/index.js:31 `crypto.pseudoRandomBytes(32)` | rejected as patch | deprecated-API call (DEP0115), not a write |
| C-007 | random-bytes/index.js:21 `randomBytes === pseudoRandomBytes` | rejected as patch | init-time identity read; triggers core's own lazy-alias self-resolution, proven core-owned by repro |
| C-008 | uid-safe:50 / random-bytes:47 `!global.Promise` | rejected as patch | read-only existence test |
| C-009 | uid-safe:31-32 / random-bytes:28-29 exports | rejected as patch | own module.exports |
| C-010 | uid-safe:59 / random-bytes:56 `new Promise(...)` | rejected as patch | consumption, not mutation; Promise.prototype keys unchanged |
| C-011 | random-bytes/index.js:99 `setTimeout` retry | rejected as patch | call only; `setTimeout` identity intact |

Unresolved: none.

## Supporting context

- **Deprecated core API read/call (tsscmp@1.0.6, random-bytes@1.0.0).**
  `crypto.pseudoRandomBytes` is called at tsscmp lib/index.js:31 and compared
  by identity at random-bytes index.js:21. On the audited core baseline this
  property is a lazy deprecated-alias accessor
  (`getRandomBytesAlias`, $NODEJS_SOURCE lib/crypto.js:304 and :387; DEP0115)
  that, on first read, redefines itself into a data property whose value is
  core's own `randomBytes`. The first read in a pristine process therefore
  changes the property's descriptor from accessor to data — but the
  redefinition is performed by Node core itself, triggered by any read, and
  installs a core function. `repro/lazy-alias-note.js` demonstrates this:
  after loading csrf without pre-touching the alias, the resolved value is
  reference-identical to the pristine `crypto.randomBytes`
  (`resolvedValueIsCoreRandomBytes: true`, `randomBytesUntouched: true`).
  Not a library patch.
- **Feature detection, not polyfilling (tsscmp@1.0.6).** tsscmp
  lib/index.js:17-25 uses `crypto.timingSafeEqual` when present (Node >= 6.6.0)
  and otherwise falls back to a local non-constant-time byte loop. The
  fallback stays a module-local function; nothing is written back to `crypto`.
  Code comments reference nodejs/node#3043, nodejs/node#3073, and
  jshttp/basic-auth#39 as rationale.
- **Legacy-environment retry logic (random-bytes@1.0.0).** The
  `generateAttempts` value (1 vs 3) only changes how many times the package
  retries its own call to `crypto.randomBytes` on entropy-pool errors in
  ancient Node versions; it has no effect on core.
- **Library-owned class (csrf).** `Tokens` (index.js:45) is a plain
  constructor; its prototype methods (create/secret/secretSync/_tokenize/verify)
  are library API, not overrides of any core type. `module.exports = Tokens`
  with guard `if (!(this instanceof Tokens)) return new Tokens(options)` is an
  ordinary callable-constructor pattern.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT runtime files (5) | full read + `rg --no-ignore` skill groups 1-6 ([searches.md](searches.md)) | groups 4, 5, 6 zero hits; groups 1-3 hits all traced and rejected |
| $PACKAGE_ROOT runtime files (5) | supplementary G7 core-namespace assignment regex | zero hits — no write to crypto/Math/Buffer/process/assert/global |
| $PACKAGE_ROOT runtime files (5) | G9 `delete\|getOwnPropertyDescriptor\|freeze\|seal` | zero hits |
| package.json x5 | scripts inspection | no install/postinstall/prepare scripts anywhere in runtime tree |
| dependency dirs | `find ... -name '*.js'` | confirms the five runtime files are the complete runtime JS surface (only extra JS is tsscmp/test/, out of scope) |
| $NODEJS_SOURCE lib/crypto.js | targeted `rg` + read of lines 140-180, 195-245, 300-330, 375-395 @ d44625a4b80 | baseline: createHash:149, createHmac:173, exports 200/201/230/239; pseudoRandomBytes = lazy alias of randomBytes via getRandomBytesAlias (304, 387) |
| upstream references | nodejs/node#3043, nodejs/node#3073, jshttp/basic-auth#39 (cited in tsscmp source comments) | context for timingSafeEqual feature detection; merged core feature, no library patch implied |
| runtime | `node repro/snapshot-diff.js "$PACKAGE_ROOT"` (Node v24.19.0) | VERDICT: NO CORE MUTATION OBSERVED — all 15 identity checks true, 0 descriptor diffs, 0 prototype/global/require diffs; full output in repro/snapshot-diff.result.json |
| runtime | `node repro/lazy-alias-note.js "$PACKAGE_ROOT"` (Node v24.19.0) | pseudoRandomBytes accessor-to-data transition shown to be core-owned lazy resolution; resolved value === pristine crypto.randomBytes |

Runtime file hashes (SHA-256, relative to $PACKAGE_ROOT):

```
109e4e1dfe38501de2d2427ca52d1d3f103e5f502845c21c10088548c86814f2  index.js
7f14e5512a31e12d8e1f8e63a370621cc42477d9857b8855ca4c28e95a3558eb  node_modules/rndm/index.js
8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7  node_modules/tsscmp/lib/index.js
1068a5918f3669a939c1c8865f2394cdc3ac126677e04d016a9e6fa9d9ff9a91  node_modules/uid-safe/index.js
d9a829fc576892245375789e614a398a577243d1649f7aed0e1b3d2e19bd8376  node_modules/random-bytes/index.js
```

## Reproduction details

Scripts and sanitized outputs in [repro/](repro/):

- `snapshot-diff.js` — snapshots BEFORE requiring the library and AFTER
  requiring + exercising `new Tokens()`, factory call `Tokens(opts)`,
  `secret()` promise + callback, `secretSync()`, `create(secret)`,
  `verify(secret, token)` true and two false paths. Captured: descriptors and
  identities of `crypto.createHash/createHmac/randomBytes/pseudoRandomBytes/timingSafeEqual`,
  `crypto.Hash` and its prototype keys plus `update`/`digest` identities,
  `Math.random`, `Object.assign`, `Module._load`, `Module._resolveFilename`,
  `process.binding`, `Promise`, `setTimeout`, own keys of
  Object/Array/String/Function/Promise prototypes, `require.extensions` keys,
  `require.cache` builtin-style entries and growth, and `globalThis` own keys.
  Result (`snapshot-diff.result.json`): all exercises behaved as documented;
  every identity check `true`; empty diffs everywhere; `require.cache` grew by
  exactly the five expected library files; final line
  `"VERDICT": "NO CORE MUTATION OBSERVED"`.
- `lazy-alias-note.js` — isolates the C-007 observable: without pre-reading
  the alias, loading csrf flips the `crypto.pseudoRandomBytes` descriptor from
  accessor to data (core's lazy DEP0115 mechanism), and the installed value is
  reference-identical to the pristine `crypto.randomBytes`
  (`lazy-alias-note.result.json`).

Outputs sanitized: package root replaced by `$PACKAGE_ROOT`; leak check for
absolute home paths returned clean.

## Coverage and limitations

- Entry points: csrf ships a single runtime file (`index.js`); `index.d.ts`
  verified to contain type declarations only. No conditional or optional
  entrypoints, no `exports` map, no browser field in any package.
- Dependencies: all four resolved runtime packages (rndm@1.2.0, tsscmp@1.0.6,
  uid-safe@2.1.5, random-bytes@1.0.0) are single-file; each entrypoint was
  read in full before exclusion. random-bytes is the sole transitive dep
  (via uid-safe). No install scripts in any package.
- Node.js files read: `$NODEJS_SOURCE/lib/crypto.js` only (targeted sections),
  per the skill's relevance table; no recursive core scan.
- Branches not executed at runtime: the tsscmp byte-loop fallback (requires
  Node < 6.6.0 where `crypto.timingSafeEqual` is absent) and the
  `generateAttempts === 1` legacy branch — both statically verified to contain
  no writes; they only alter module-local behavior. The
  callback-without-Promise branches (`!global.Promise`) likewise only throw or
  take the callback path (callback path was exercised).
- A tested branch set cannot prove universal absence, but the complete runtime
  source (~350 LOC) was read line-by-line, so the static claim is exhaustive
  for this scope. What would change the verdict: a different resolved
  dependency version introducing writes, or running on an unmaintained Node
  (< 6.6.0) — neither alters this tree as pinned by the shipped
  package-lock.json.
- Blind-pass constraint honored: nothing outside `pass-b/` under the audit
  root was read.

## Changes since the previous audit

First audit (pass B, independent blind pass; no prior pass-b report existed).
