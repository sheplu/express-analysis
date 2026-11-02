# Node.js patch audit: cookie-parser

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `cookie-parser` (Express cookie parsing middleware), local checkout at `$PACKAGE_ROOT`
- Library: cookie-parser 1.4.7, git clone of https://github.com/expressjs/cookie-parser, branch master, commit 1f2a3a2037c4efe01605e064e7cc326008be7287; runtime dependencies installed at `$PACKAGE_ROOT/node_modules`: cookie@0.7.2, cookie-signature@1.0.6
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (local checkout `$NODEJS_SOURCE`, unmodified)
- Reproduction runtime: Node.js v24.19.0 (`repro-no-core-mutation.js` beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` (182 lines, sole shipped runtime file per package.json `files`), `$PACKAGE_ROOT/node_modules/cookie/index.js` (336 lines, sole entrypoint), `$PACKAGE_ROOT/node_modules/cookie-signature/index.js` (52 lines, sole entrypoint). Tests, docs, benchmarks out of scope.
- Coverage: source — complete (all three runtime files read in full and swept with the candidate searches); upstream — bounded issue search run, no patch-related items; runtime — reproduction executed and passed on Node v24.19.0.

## Patching verdict

No patching was demonstrated. Zero shared core mutations, zero instance/application
overrides of core-backed members, zero module-loading interceptions, and zero core
source rewrites were found, direct or transitive.

cookie-parser's only writes to anything core-backed are additive own-property
assignments on the live request object inside the returned middleware
(`req.secret`, `req.cookies`, `req.signedCookies` at `$PACKAGE_ROOT/index.js:51-53,60,64-65,69`).
None of these names exists on `http.IncomingMessage` at the Node.js baseline
(constructor own properties `$NODEJS_SOURCE/lib/internal/http/incoming.js:77-106`;
prototype methods lines 257-571; defined accessors `connection`/`headers`/`headersDistinct`/
`trailers`/`trailersDistinct`/`signal` at lines 115-205), so nothing core is shadowed,
replaced, or redefined — this is the documented, supported middleware pattern of
adding request metadata, which per the audit criteria does not establish a patch.
`req.headers` is only read (`index.js:49`), never written.

The dependencies are side-effect-free at load: `cookie` is a pure string
parser/serializer that caches two `Object.prototype` method references
(reads, not writes); `cookie-signature` requires core `crypto` and only calls its
public factory functions (`createHmac`, `createHash`), assigning nothing to the
module or any prototype. No candidates remain unresolved; no runtime branches were
excluded (the single conditional branch, signed-cookie handling behind a non-empty
secret list, was inspected and exercised in the reproduction).

## Confirmed Node.js patches

None. No reachable write or replacement of a core API, global, shared prototype,
core-backed instance member, core module loading mechanism, or core source was found
in the inspected scope. Instance metadata additions and private-API-free core usage
are summarized under Supporting context; they are not patches.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:51` — `req.secret = secrets[0]` on live `http.IncomingMessage` instance | rejected as patch | New library-owned own property; no `secret` member anywhere on IncomingMessage at baseline (`$NODEJS_SOURCE/lib/internal/http/incoming.js`, negative grep). Additive request metadata, instance-scoped, no core behavior replaced. Reproduction confirms shared prototype untouched. |
| C-002 | `$PACKAGE_ROOT/index.js:52,60,69` — `req.cookies = ...` (null-proto object, then `cookie.parse` result, then JSON-decoded) | rejected as patch | No `cookies` member on IncomingMessage at baseline (negative grep over constructor, prototype methods, and `ObjectDefineProperty` accessors). Own-property addition on the instance only; guard at `index.js:45` even skips work when `req.cookies` already exists. |
| C-003 | `$PACKAGE_ROOT/index.js:53,64-65` — `req.signedCookies = ...` | rejected as patch | Same reasoning as C-002; no `signedCookies` member on IncomingMessage at baseline. |
| C-004 | `$PACKAGE_ROOT/index.js:49` — `req.headers.cookie` against core `headers` accessor (`$NODEJS_SOURCE/lib/internal/http/incoming.js:125-143`) | rejected as patch | Read-only use of the documented public `message.headers` getter; no assignment to `req.headers` or any header key anywhere in scope (searches S7/S9 negative for writes). |
| C-005 | `$PACKAGE_ROOT/node_modules/cookie/index.js:23-24` — `var __toString = Object.prototype.toString`, `var __hasOwnProperty = Object.prototype.hasOwnProperty` | rejected as patch | Reads that cache built-in method references into module-local variables (defensive, used at lines 134, 318). No write, redefine, or delete on `Object.prototype` (search S3/S10 negative for writes). |
| C-006 | `$PACKAGE_ROOT/node_modules/cookie-signature/index.js:5,16-24,36-43,49-51` — core `crypto` usage | rejected as patch | Call-only usage of public `crypto.createHmac`/`crypto.createHash` (baseline exports at `$NODEJS_SOURCE/lib/crypto.js:149,173,200-201`); no property of the `crypto` module or its returned objects is reassigned. Reproduction confirms `createHmac`/`createHash` identities unchanged after require and run. |
| C-007 | `$PACKAGE_ROOT/index.js:52-53,167` — `Object.create(null)` | rejected as patch | Creates new library-owned null-prototype objects; mutates no existing object and does not change the prototype of `req` or any core object. |
| C-008 | `$PACKAGE_ROOT/index.js:177` — `delete obj[key]` | rejected as patch | Deletes a key from the library-produced cookies object (output of `cookie.parse`, a plain object created at `node_modules/cookie/index.js:105`), not from any core-owned structure. |
| C-009 | `$PACKAGE_ROOT/index.js:24-27`, `node_modules/cookie/index.js:15-16`, `node_modules/cookie-signature/index.js:16,36` — `module.exports`/`exports` assignments | rejected as patch | Each module populates its own exports object; no foreign or core module's exports are mutated. |

No unresolved candidates.

## Supporting context

- Adding `req.cookies`/`req.signedCookies`/`req.secret` is cookie-parser's documented
  public API (README) and the standard Express/Connect middleware extension pattern:
  per-request, instance-scoped, additive, never restored (properties persist for the
  request's lifetime), and guarded against double-parsing (`index.js:45-47`).
- `cookie.parse` returns a plain `{}` (prototype = `Object.prototype`,
  `node_modules/cookie/index.js:105`), so after `index.js:60` the initial
  null-prototype `req.cookies` from `index.js:52` is replaced by a plain object;
  `req.signedCookies` stays null-prototype (`index.js:167`). Verified by the
  reproduction. A library design detail, not a core concern.
- `cookie` 0.7.2 guards against prototype-key collisions via the cached
  `__hasOwnProperty.call(obj, key)` check (`node_modules/cookie/index.js:134`) —
  defensive reads of built-ins, the opposite of patching them (upstream context:
  jshttp/cookie#176, closed).
- `cookie-signature` 1.0.6 compares HMACs via double-SHA1 hashing rather than
  `crypto.timingSafeEqual` (`node_modules/cookie-signature/index.js:42`); purely
  call-level use of public crypto APIs, noted only to confirm the dependency's
  entrypoint was reviewed in full.
- No lifecycle/install scripts exist in any of the three packages (only
  lint/test/bench entries), so no install-time or load-time patching vector exists
  outside the inspected entrypoints.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `node_modules/cookie/index.js`, `node_modules/cookie-signature/index.js` | Full reads + `rg -n --no-ignore` candidate sweeps S1-S12 (see searches.md) | Only hits: two dependency requires, one core `crypto` require, instance `req.*` writes, two `Object.prototype` method reads, own-exports assignments. No prototype writes, no loader hooks, no bindings/internal requires, no patch/wrap/shim keywords. |
| `$NODEJS_SOURCE/lib/http.js:33,268` | `rg -n "IncomingMessage" lib/http.js` | `IncomingMessage` re-exported from `internal/http/incoming` at the audited ref (legacy `lib/_http_incoming.js` no longer exists on main). |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | `rg -n -i "cookies\|\bsecret"` ; `rg -n "this\.[A-Za-z_]+ ="` ; `rg -n "IncomingMessage\.prototype\.\|ObjectDefinePropert"` ; read lines 115-163 | Negative for `cookies`/`signedCookies`/`secret`. Full member inventory (constructor lines 77-106, prototype methods 257-571, accessors 115-205) confirms no name collision with cookie-parser's writes; `headers` is a prototype accessor backed by `kHeaders` symbol, only read by the library. |
| `$NODEJS_SOURCE/lib/crypto.js:149,173,200-201` | `rg -n "createHmac\|createHash" lib/crypto.js` | `createHash`/`createHmac` are public exported factories; cookie-signature only calls them. |
| Reproduction | `PACKAGE_ROOT=<checkout> node repro-no-core-mutation.js` (Node v24.19.0) | Passed: `http.IncomingMessage.prototype` own keys, [[Prototype]], `setTimeout` and `headers` descriptor identities, `crypto.createHmac`/`createHash` identities, `Object.prototype` keys, `Module._load`/`_resolveFilename`, and `require.extensions['.js']` all unchanged after require and after a middleware run; parsed cookies land as instance own properties only. |
| expressjs/cookie-parser issues | `gh search issues --repo expressjs/cookie-parser "monkeypatch OR monkey-patch OR prototype pollution"` | Empty result — no upstream patch-related reports. |
| jshttp/cookie issues | `gh search issues --repo jshttp/cookie "prototype"` | Closed items only; #176 concerns the defensive `hasOwnProperty` call style (supports the read-only classification of C-005). |

Provenance hashes (SHA-256, package-relative):
- `index.js` d0689887ae03828781b75ff5578c6957aab0d827d8b9b33dc5304589411b8950
- `node_modules/cookie/index.js` a88f6d7257e3403b727b90a2f3f5c03591e14eaa0b217c501b7071074f080e42
- `node_modules/cookie-signature/index.js` 8d762862020064468b4af17e561ee1ee29d9d55311a1c19d958c4ff2be912963

## Coverage and limitations

- Entry points: cookie-parser has no `main`/`exports`/`bin`/`browser` fields, so the
  default `index.js` is the sole entrypoint; its npm `files` whitelist ships only
  `index.js` as runtime code. cookie (`main: index.js`) and cookie-signature
  (`main: index`) each ship a single runtime file; both were read in full. No
  conditional or optional entrypoints exist.
- Resolved dependencies: cookie@0.7.2 and cookie-signature@1.0.6, both
  dependency-free, installed at `$PACKAGE_ROOT/node_modules` and matching
  package-lock.json. No transitive runtime dependencies remain unexamined.
- Node.js files read: `lib/http.js`, `lib/internal/http/incoming.js`,
  `lib/crypto.js` at commit d44625a4b80c672215b469906ce583ce7eeeebaf, selected per
  the observed core surface (IncomingMessage instance, `headers` accessor, crypto
  factories). No recursive scan of the Node.js tree was performed.
- Branches: the signed-cookie branch (secrets non-empty) and JSON-cookie decoding
  were both statically inspected and dynamically exercised; the no-cookie-header
  early return and already-parsed guard were statically inspected. No runtime
  branch was excluded.
- Limitations: the reproduction ran on Node v24.19.0, not a build of the baseline
  commit; this is immaterial because the static member inventory was taken from the
  baseline source and the library is version-agnostic plain JS (`engines >= 0.8`).
  Upstream corroboration was a bounded issue search, sufficient given zero observed
  patch targets. A different (unaudited) version of `cookie`/`cookie-signature`
  resolved by a consumer could change the dependency-side conclusions; this audit
  pins cookie@0.7.2 and cookie-signature@1.0.6.
- What would change the verdict: any write to `http.IncomingMessage.prototype` or
  other shared core object, reassignment of an existing core-backed member on `req`
  (e.g. `req.headers`), a loader hook, or a dependency swap introducing such code.

## Changes since the previous audit

First audit (pass A of a double-blind protocol); no prior findings to revalidate.
