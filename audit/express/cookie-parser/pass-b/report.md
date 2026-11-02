# Node.js patch audit: cookie-parser

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: npm package `cookie-parser` (Express cookie parsing middleware), audited from a local clone at `$PACKAGE_ROOT`
- Library: cookie-parser 1.4.7, git clone of https://github.com/expressjs/cookie-parser, branch master, commit 1f2a3a2037c4efe01605e064e7cc326008be7287; runtime dependencies installed at `$PACKAGE_ROOT/node_modules`: cookie@0.7.2, cookie-signature@1.0.6; no local modifications observed
- Node.js baseline: `$NODEJS_SOURCE`, main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (version header 28.0.0-pre)
- Reproduction runtime: Node.js 24.19.0 (`node repro-check.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — `index.js` (182 lines, the sole shipped runtime file per `package.json` `files`), `node_modules/cookie/index.js` (335 lines, sole entrypoint), `node_modules/cookie-signature/index.js` (51 lines, sole entrypoint). Tests/docs out of scope. No install/postinstall scripts, no conditional or optional entrypoints (`main`/default `index.js` only, no `exports` maps) in any of the three packages.
- Coverage: source — complete (all three runtime entrypoints read in full; full candidate pattern set plus write census run over all three); upstream — targeted corroboration of cookie-signature versions via GitHub API; runtime — reproduction executed on Node 24.19.0 comparing 13 core-state checkpoints before/after require and middleware execution.

## Patching verdict

No patching of Node.js was demonstrated anywhere in the inspected scope.

- Shared core mutations: **0**. No write to any core module object, core prototype
  (`http.IncomingMessage.prototype`, `Object.prototype`, `Buffer`, etc.), global,
  or binding anywhere in the three runtime files.
- Instance/application overrides: **0**. The only writes touching a core-backed
  object are `req.secret`, `req.cookies`, and `req.signedCookies`
  (`index.js:51-53,60,64-65,69`) on the per-request `http.IncomingMessage`
  instance. These keys do not exist on core `IncomingMessage` at the audited
  Node.js ref (verified in `$NODEJS_SOURCE/lib/internal/http/incoming.js`, reached
  via the `$NODEJS_SOURCE/lib/_http_incoming.js` re-export), so nothing core is
  shadowed or replaced; they are library-owned request metadata and cookie-parser's
  documented public API, which per the audit criteria does not establish a patch.
- Core module interception: **0**. No `require.cache`/`require.extensions`/
  `Module._load`/loader-hook usage.
- Core source rewrites: **0**. No install scripts, no on-disk patching.
- Transitive origin: both runtime dependencies were fully inspected; neither
  applies any patch (cookie is pure string/regex logic; cookie-signature only
  *calls* `crypto.createHmac`/`crypto.createHash`).
- Unresolved candidates: none. All 11 ledger candidates resolved (all rejected).

## Confirmed Node.js patches

None. No candidate survived verification; nothing in this section by design.
(Private API usage: none observed either — the libraries use only documented
core surface: `require('crypto')` factory calls and reads of `req.headers.cookie`.)

## Candidate ledger and unresolved questions

Full ledger with per-site detail is in `candidates.md` beside this report. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | index.js:15-16, `require('cookie')`, `require('cookie-signature')` | rejected as patch | ordinary CJS loading of the two runtime deps; no loader interception |
| C-002 | index.js:23-27, `module.exports.*` | rejected as patch | writes to the package's own module exports object |
| C-003 | index.js:51, `req.secret =` on `http.IncomingMessage` instance | rejected as patch | key absent from core IncomingMessage (`$NODEJS_SOURCE/lib/internal/http/incoming.js`); library-owned metadata, documented cookie-parser API; own instance property only (repro-verified) |
| C-004 | index.js:52,60,69, `req.cookies =` | rejected as patch | same as C-003; populated from `cookie.parse` into a fresh plain object |
| C-005 | index.js:53,64-65, `req.signedCookies =` | rejected as patch | same as C-003; fresh `Object.create(null)` / derived plain object |
| C-006 | index.js:113,176-177, `obj[key] =`, `ret[key] =`, `delete obj[key]` | rejected as patch | mutate the plain cookie-value objects created at C-004/C-005, not core-backed objects |
| C-007 | node_modules/cookie/index.js:15-16, `exports.parse/serialize` | rejected as patch | own module exports |
| C-008 | node_modules/cookie/index.js:23-24, `Object.prototype.toString`/`hasOwnProperty` | rejected as patch | load-time **reads** captured into locals; no descriptor or prototype write |
| C-009 | node_modules/cookie/index.js:144, `obj[key] =` | rejected as patch | write into the fresh `{}` created at line 105 inside `parse` |
| C-010 | node_modules/cookie-signature/index.js:5,19-23,50, `require('crypto')` + `createHmac`/`createHash` | rejected as patch | plain calls into core crypto; no reassignment of any `crypto` member; no `timingSafeEqual` call or polyfill in 1.0.6 (see supporting context) |
| C-011 | node_modules/cookie-signature/index.js:16,36, `exports.sign/unsign` | rejected as patch | own module exports |

Unresolved: none.

## Supporting context

- **`req.cookies` / `req.signedCookies` / `req.secret`** are the package's
  documented API (README): per-request metadata added as own properties of each
  request instance inside the middleware. Core baseline check: at the audited
  Node.js ref the `IncomingMessage` implementation lives in
  `$NODEJS_SOURCE/lib/internal/http/incoming.js` (re-exported by
  `$NODEJS_SOURCE/lib/_http_incoming.js`, now deprecation-shimmed as DEP0199);
  grep for `secret|cookie` there matches only the known-header fast-path entries
  for the `cookie`/`set-cookie` *header names* inside `req.headers`
  (lines 394, 397, 419, 438-439, 528-531) — no instance or prototype member named
  `secret`, `cookies`, or `signedCookies` exists. cookie-parser only **reads**
  `req.headers.cookie` (index.js:49) and never writes `req.headers`.
- **cookie@0.7.2 load-time work** is limited to compiling five RegExp literals
  and capturing references to `Object.prototype.toString` and
  `Object.prototype.hasOwnProperty` (read-only, a hardening idiom). `parse` and
  `serialize` are pure string manipulation; no Buffer, no process/global access,
  no core module imported at all.
- **cookie-signature@1.0.6 and `timingSafeEqual`**: the audited version does
  **not** use `crypto.timingSafeEqual` — neither as a call nor as a polyfill. Its
  `unsign` compares `sha1(mac) == sha1(val)` (hash-then-compare as a timing-attack
  mitigation, index.js:42,49-51) using plain `crypto.createHash` calls. Upstream
  adopted a direct `crypto.timingSafeEqual(...)` **call** (not a polyfill) in
  cookie-signature 1.1.0 and kept it in 1.2.x (verified from the GitHub tags
  `1.1.0`/`1.2.0` of visionmedia/node-cookie-signature); those versions are not in
  this dependency tree (cookie-parser pins `cookie-signature: 1.0.6`). In no
  version checked is any `crypto` member replaced.
- No shimming/patching helper dependencies (shimmer, require-in-the-middle, etc.)
  exist in the tree; `node_modules` contains exactly `cookie` and
  `cookie-signature`.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/index.js, node_modules/cookie/index.js, node_modules/cookie-signature/index.js | full file reads + `rg -n --no-ignore` skill pattern set P1-P6 (see searches.md) | Only hits: ordinary requires (P1), read-only `Object.prototype` captures (P3). P2 (Buffer/process/global/inherits), P4 (patch/wrap/shim/polyfill keywords), P5 (module interception), P6 (bindings/internals): zero hits |
| Same three files | write census: `rg` for `X.y =`, computed `[k] =`, `delete` (P7-P11) | Every write accounted for in the candidate ledger; no write targets a core module, prototype, or global |
| Package metadata | `package.json` of all three packages; `node_modules` listing | No install/preinstall/postinstall scripts; no `exports` maps or conditional entrypoints; deps resolved to cookie@0.7.2, cookie-signature@1.0.6 |
| $NODEJS_SOURCE/lib/_http_incoming.js | full read at commit d44625a4b80 | Deprecation shim (DEP0199) re-exporting `internal/http/incoming` — followed the re-export |
| $NODEJS_SOURCE/lib/internal/http/incoming.js | `rg -n -i "secret\|cookie"`; `rg -n "this\.\w+ ="`; prototype member listing | No core member named `secret`/`cookies`/`signedCookies`; cookie matches are header-name table entries only |
| Reproduction | `node repro-check.js "$PACKAGE_ROOT"` (Node 24.19.0) | 13 checkpoints (Object/String/IncomingMessage prototypes, crypto function identities, Buffer/global identity, Module._load/_resolveFilename/_extensions, JSON.parse, globalThis keys) identical before/after require and after middleware execution on a real IncomingMessage; added fields are own instance properties |
| Upstream: visionmedia/node-cookie-signature | `gh api repos/visionmedia/node-cookie-signature/contents/index.js?ref=1.1.0` and `?ref=1.2.0`; tag list | 1.1.0+ call `crypto.timingSafeEqual` directly (no polyfill); audited 1.0.6 predates it — corroborates the call-vs-polyfill question |
| Provenance hashes (SHA-256) | `shasum -a 256 <runtime files>` | index.js `d0689887ae03828781b75ff5578c6957aab0d827d8b9b33dc5304589411b8950`; node_modules/cookie/index.js `a88f6d7257e3403b727b90a2f3f5c03591e14eaa0b217c501b7071074f080e42`; node_modules/cookie-signature/index.js `8d762862020064468b4af17e561ee1ee29d9d55311a1c19d958c4ff2be912963` |

## Coverage and limitations

- Entry points: all three runtime entrypoints read line-by-line in full
  (182 + 335 + 51 lines); they are the complete shipped runtime surface
  (`files` arrays limit cookie-parser and cookie to `index.js`; cookie-signature
  ships only `index.js`). Tests (`test/`), docs, and dev-dependencies excluded
  as out of scope.
- Node.js files read: `lib/_http_incoming.js` (full) and targeted scans of
  `lib/internal/http/incoming.js` at commit d44625a4b80; no recursive scan of
  the Node.js tree performed, per skill.
- Reproduction ran on Node 24.19.0, not on a build of the baseline commit; the
  static analysis is against the baseline source. Given the package supports
  `node >= 0.8` with no version-conditional branches, behavior is uniform across
  runtimes; the single tested runtime is a minor limitation only.
- Double-blind protocol: this pass (pass-b) was performed independently; no other
  audit output was read.
- What would change the verdict: a different resolved version of `cookie` or
  `cookie-signature` (other majors not audited beyond the timingSafeEqual spot
  check), or runtime files outside the three inspected entrypoints.

## Changes since the previous audit

First audit for this pass (pass-b); no prior report at this output path.
