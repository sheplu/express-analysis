# Node.js patch audit: basic-auth-connect

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `basic-auth-connect` (Connect Basic Auth middleware), local clone at `$PACKAGE_ROOT`
- Library: version 1.1.0, git commit 856183e95f7bea8579c4ee07f225b2e3edb8b8b8 (https://github.com/expressjs/basic-auth-connect, branch master), source checkout with installed runtime dependency; no local modifications to tracked files
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (`$NODEJS_SOURCE`)
- Reproduction runtime: Node.js v24.19.0
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (sole entrypoint, `main` default; no `exports` map, no install/prepare scripts) and the single runtime dependency `tsscmp@1.0.6` (`$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js`, its `main`). `test.js`, `Makefile`, docs, CI, and tsscmp's `test/` are out of scope per instructions.
- Coverage: source — full (both runtime files read in full, 136 + 38 lines; full candidate pattern set run over both); upstream — git history and GitHub advisory corroborated; runtime — reproduction executed on Node v24.19.0, no mutation observed. No material limitations.

## Patching verdict

No patching was demonstrated. Zero shared core mutations, zero instance/application overrides of core-backed behavior, zero module-loading interceptions, and zero core source rewrites were found, in either the package itself (direct) or its only runtime dependency `tsscmp@1.0.6` (transitive). All ten candidate sites were resolved: every write in the runtime scope lands either on the caller-supplied request object (library-owned metadata properties `req.user` / `req.remoteUser`, which Node core does not define), on a documented writable public property (`res.statusCode`), or on a library-created `Error` instance. `tsscmp` only *calls* `crypto` APIs; its pre-v6.6.0 fallback is a local function and is never assigned back onto the `crypto` module. No unresolved candidates remain; no runtime branches were excluded (all three middleware modes — string credentials, sync callback, async callback — were traced and exercised).

## Confirmed Node.js patches

None. No candidate survived verification as a patch. Library-owned request metadata, documented API usage, and deprecated-but-ordinary core API calls are detailed under supporting context; none replaces, rewrites, or shadows Node.js core behavior.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:94` — `req.user = req.remoteUser = user` on live `http.IncomingMessage` (async path) | rejected as patch | Adds library-owned metadata own-properties to the request instance. Core `IncomingMessage` defines neither `user` nor `remoteUser` (`$NODEJS_SOURCE/lib/internal/http/incoming.js:62-106` constructor own props; grep for `user|remoteUser` negative). No core property/method is shadowed or replaced. Supported extension per HTTP contract. |
| C-002 | `$PACKAGE_ROOT/index.js:100` — same write, sync path | rejected as patch | Identical to C-001. |
| C-003 | `$PACKAGE_ROOT/index.js:118` — `res.statusCode = 401` on live `http.ServerResponse` | rejected as patch | `statusCode` is the documented writable public property for implicit headers; core default is `ServerResponse.prototype.statusCode = 200` (`$NODEJS_SOURCE/lib/internal/http/server.js:285`). The write creates an instance own property exactly as documented; prototype descriptor verified unchanged by reproduction. |
| C-004 | `$PACKAGE_ROOT/index.js:119-120` — `res.setHeader(...)`, `res.end(...)` | rejected as patch | Method invocations only; no reassignment. Core definitions intact at `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` (`setHeader`) and `:1289` (`end`); identities verified unchanged by reproduction. |
| C-005 | `$PACKAGE_ROOT/index.js:79` — `new Buffer(parts[1], 'base64')` (global `Buffer`) | rejected as patch | Call to the deprecated `Buffer()` constructor (DEP0005, `$NODEJS_SOURCE/lib/buffer.js:317-320`, warning at `:241`). Read/call only; neither `Buffer` nor `Buffer.prototype` is mutated (verified by reproduction). Supporting context only. |
| C-006 | `$PACKAGE_ROOT/index.js:134` — `http.STATUS_CODES[code]` | rejected as patch | Read-only index into the core export (`$NODEJS_SOURCE/lib/http.js:54,265`). No write anywhere to `http.*` (targeted assignment grep negative); object identity verified unchanged by reproduction. |
| C-007 | `$PACKAGE_ROOT/index.js:135` — `err.status = code` | rejected as patch | Own property on an `Error` the library itself just created at `:134`; a library-owned object, not a core-backed instance shared with Node. |
| C-008 | `$PACKAGE_ROOT/index.js:68` — `if (req.user) return next();` | rejected as patch | Read, not a write; listed for completeness of the req/res surface. |
| C-009 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:17-25` — `if (crypto.timingSafeEqual) { return crypto.timingSafeEqual(a, b); }` + loop fallback | rejected as patch | Feature-detection read plus call. The pre-v6.6.0 byte-loop fallback (lines 20-25) lives inside the local `bufferEqual` function and is never assigned onto the `crypto` module (no `crypto.<x> =` anywhere in the file); not an installed polyfill. Core export at `$NODEJS_SOURCE/lib/crypto.js:47,239`; identity verified unchanged by reproduction. |
| C-010 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:31-33` — `crypto.pseudoRandomBytes(32)`, `crypto.createHmac('sha256', key)` | rejected as patch | Calls only. `pseudoRandomBytes` is the deprecated alias (DEP0115, `$NODEJS_SOURCE/lib/crypto.js:387`, warning via `getRandomBytesAlias` at `:309-319`); `createHmac` at `:173`. No interaction with core beyond invocation; identities verified unchanged by reproduction. |

No unresolved candidates.

## Supporting context

- Deprecated core API usage (not patches): `new Buffer(...)` at `$PACKAGE_ROOT/index.js:79` (DEP0005; emits a runtime deprecation warning on first use) and `crypto.pseudoRandomBytes` at `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:31` (DEP0115). Both are plain calls into core, with no mutation.
- Request decoration: `req.user` / `req.remoteUser` (C-001/C-002) is the classic Connect-era convention of attaching application metadata to the request object — a supported extension, since `IncomingMessage` instances are ordinary extensible objects and core defines no such properties.
- `tsscmp`'s header comments reference nodejs/node#3043 and nodejs/node#3073 (the upstream addition of `crypto.timingSafeEqual`) and jshttp/basic-auth#39; these document why it feature-detects the API, not any patching.
- Why `tsscmp` is present: version 1.1.0 (commit bac1e6a, "feat: add timing safe equal comparison") fixed GHSA-7p89-p6hx-q4fw / CVE-2024-47178 (time-unsafe string comparison in < 1.1.0) by routing the string-credentials mode through `tsscmp`. A security fix using core crypto, not a patch of it.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` | Full reads; skill candidate pattern set via `rg -n --no-ignore` (6 patterns; see searches.md) | Only hits: `require('tsscmp'/'http'/'crypto')`, one `new Buffer(...)`. Zero hits for prototype/defineProperty/setPrototypeOf/Object.assign, monkey-patch vocabulary, require.cache/extensions/Module._*/registerHooks, process.binding/internalBinding/internal-module strings. |
| `$PACKAGE_ROOT` runtime writes | `rg -n '\b(req|res)\.[A-Za-z_$][\w$]*\s*=[^=]'`; `rg -n '\b(http|crypto)\s*\.\s*[\w$]+\s*=[^=]'`; `rg -n '\bdelete\b|getOwnPropertyDescriptor|freeze|seal|preventExtensions'` | Writes only at index.js:94,100 (req.user/remoteUser) and index.js:118 (res.statusCode). No writes to `http.*`/`crypto.*` module objects; no deletes or descriptor operations. |
| Package metadata / install hooks | `package.json`, `node_modules/tsscmp/package.json`, `node_modules/.package-lock.json`, `.npmrc` | Single runtime dep `tsscmp@1.0.6` (integrity `sha512-LxhtAkPDTkVCMQjt...`); no install/postinstall/prepare scripts in either package; `main` entrypoints as audited. |
| `$NODEJS_SOURCE/lib/http.js`, `lib/internal/http/{incoming,server,outgoing}.js` | Targeted `rg -n` per skill table (re-exports followed from `lib/http.js:30-61`; legacy `lib/_http_*.js` are re-export shims on main) | `IncomingMessage` defines no `user`/`remoteUser`; `ServerResponse.prototype.statusCode = 200` default at server.js:285; `setHeader` outgoing.js:813, `end` outgoing.js:1289; `STATUS_CODES` exported http.js:54,265. |
| `$NODEJS_SOURCE/lib/buffer.js`, `lib/crypto.js` | Targeted `rg -n 'DEP0005|function Buffer\('`, `rg -n 'timingSafeEqual|pseudoRandomBytes|createHmac|DEP0115'` | Baselines for C-005, C-009, C-010: deprecated-but-present constructor/alias; `timingSafeEqual` exported at crypto.js:47,239. |
| Library git history | `git log --oneline -n 15`; `git log -n 5 -S 'tsscmp' --oneline -- index.js package.json` | `tsscmp` introduced by commit bac1e6a ("feat: add timing safe equal comparison"), released in 1.1.0 (commit 45decb3). |
| GitHub advisory database | `gh api '/advisories?affects=basic-auth-connect'` (read-only) | GHSA-7p89-p6hx-q4fw / CVE-2024-47178: time-unsafe comparison, < 1.1.0, first patched 1.1.0 — corroborates the tsscmp adoption as a security fix, not a core patch. |
| Reproduction | `PACKAGE_ROOT=<path> node --no-deprecation repro-no-mutation.js` (script and `repro-output.txt` beside this report) | Node v24.19.0: identities/descriptors/own-key sets of `http.STATUS_CODES`, `IncomingMessage`/`ServerResponse` and their prototypes, `setHeader`/`end`, `crypto.timingSafeEqual`/`createHmac`/`pseudoRandomBytes`, `Buffer` + prototype, `Module._load`/`_compile`, `require.extensions`, and `globalThis` own names all UNCHANGED across require + exercising all three middleware modes (success/failure/missing-header/malformed-header). Only observable writes: `user`, `remoteUser` own props on the caller-supplied req object. Exit 0. |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (package `main` by default; no `exports`, `bin`, conditional entrypoints, or lifecycle scripts). Runtime dependency tree: exactly `tsscmp@1.0.6` -> entrypoint `lib/index.js`, which requires only `crypto`; no transitive dependencies (`node_modules/.package-lock.json`). Dev dependencies (connect, mocha, should, supertest) and `test.js`/`Makefile`/`.github` are out of the audited runtime scope.
- Node.js files read (targeted only, at d44625a4b80): `lib/http.js`, `lib/internal/http/incoming.js`, `lib/internal/http/server.js`, `lib/internal/http/outgoing.js`, `lib/_http_incoming.js` (shim head), `lib/buffer.js` (targeted), `lib/crypto.js` (targeted). No recursive scan of the Node.js tree.
- Branches tested: all three middleware construction modes and the four request outcomes (pre-set `req.user`, missing header, malformed header, valid/invalid credentials) are covered statically and in the reproduction. The tsscmp `!crypto.timingSafeEqual` fallback branch was analyzed statically only (it cannot execute on Node >= 6.6.0); either branch is call/loop-only, so the untested branch cannot patch core.
- Reproduction used mock req/res objects for middleware invocation plus identity/descriptor snapshots of the real core modules; a tested branch cannot prove universal absence, but all 174 runtime lines were read, so coverage is effectively total for this scope.
- Provenance (SHA-256, relative to `$PACKAGE_ROOT`): `index.js` 25ace225a976a36216ddc70f0a839909cc3e2f05fd2ff07e5dd4b46c39e93a40; `node_modules/tsscmp/lib/index.js` 8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7; `package.json` dc4c98e466624ca8cdcd58f6029bc1ced8f39c38a7abed9fa4499e267eceee47; `node_modules/tsscmp/package.json` 4e31b5c503caec63b2e0e2507b69c778a14dc2b42a5d17a30fd694efcfdfe2c0.
- What would change the verdict: discovery of a different resolved `tsscmp` version with module-mutating code, an added install script, or a new entrypoint writing to core module objects/prototypes.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no previous report existed at this path.
