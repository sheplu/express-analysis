# Node.js patch audit: basic-auth-connect

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: npm package `basic-auth-connect` (Connect's Basic Auth middleware), local clone under `$PACKAGE_ROOT`
- Library: version 1.1.0, git commit 856183e95f7bea8579c4ee07f225b2e3edb8b8b8 (https://github.com/expressjs/basic-auth-connect, branch master), clean working tree, source checkout (not an npm tarball)
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf (v28.0.0-pre per `src/node_version.h`), unmodified checkout at `$NODEJS_SOURCE`
- Reproduction runtime: not run; static proof suffices (entire runtime surface is 136 + 39 lines, read in full)
- Scope: production/runtime code only — `index.js` (sole entrypoint; no `exports` map, no install/lifecycle scripts) and the single resolved runtime dependency `tsscmp@1.0.6` (entrypoint `lib/index.js`, no transitive dependencies). `test.js`, `Makefile`, docs, and `tsscmp/test/` out of scope per request.
- Coverage: source — full (both runtime files read line-by-line plus full candidate-pattern sweep); upstream — targeted read-only check of expressjs/basic-auth-connect issues/PRs; runtime — no dynamic reproduction (not needed).

## Patching verdict

No patching was demonstrated. Zero shared core mutations, zero
instance/application overrides of core behavior, zero module-loading
interceptions, and zero core source rewrites were found, whether direct or via
the single runtime dependency (`tsscmp@1.0.6`). All 13 candidate sites were
resolved and rejected; none is unresolved. The library only:

1. calls documented core HTTP response APIs on live per-request objects
   (`res.statusCode = 401`, `res.setHeader(...)`, `res.end(...)`),
2. attaches two library-owned metadata properties (`req.user`,
   `req.remoteUser`) to the live `IncomingMessage` instance — neither name
   exists anywhere in core's `IncomingMessage` implementation, so nothing core
   is shadowed or replaced,
3. calls two deprecated-but-supported core APIs (`new Buffer(...)` DEP0005 in
   the library; `crypto.pseudoRandomBytes` DEP0115 in tsscmp) — deprecated
   usage, not mutation, and
4. performs a read-only feature detection of `crypto.timingSafeEqual` in
   tsscmp (reads the property; never assigns it).

Coverage boundary: runtime scope only (`$PACKAGE_ROOT/index.js`,
`$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js`). Tests, docs, and build
tooling were excluded by request; neither package has install scripts, so no
code outside this scope executes at install or require time.

## Confirmed Node.js patches

None. No candidate survived verification against the Node.js baseline. Private
API usage and deprecated-API calls found during the sweep are listed under
Supporting context, not promoted here.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:1`, `require('tsscmp')` | rejected as patch | Plain module import; dependency itself audited (C-010..C-013), no patching found. |
| C-002 | `$PACKAGE_ROOT/index.js:2`, `require('http')` | rejected as patch | Core import held in local `http`; only use is a read at index.js:134 (C-009). No property of the `http` module object is ever written. |
| C-003 | `$PACKAGE_ROOT/index.js:79`, `new Buffer(parts[1], 'base64')` | rejected as patch | Call to the deprecated core `Buffer()` constructor (DEP0005), which internally delegates to `Buffer.from` (`$NODEJS_SOURCE/lib/buffer.js:320-330`). A call, not a mutation of `Buffer` or its prototype. See Supporting context. |
| C-004 | `$PACKAGE_ROOT/index.js:94`, `req.user = req.remoteUser = user` (async branch) | rejected as patch | Writes two new expando properties on the live `http.IncomingMessage` instance. Neither `user` nor `remoteUser` exists in `$NODEJS_SOURCE/lib/internal/http/incoming.js` (grep negative), so no core property/method/accessor is shadowed or replaced. Library-owned request metadata — the long-standing Connect/Express middleware convention. |
| C-005 | `$PACKAGE_ROOT/index.js:100`, `req.user = req.remoteUser = user` (sync branch) | rejected as patch | Same object/keys as C-004; same reasoning. |
| C-006 | `$PACKAGE_ROOT/index.js:118`, `res.statusCode = 401` | rejected as patch | Documented writable API. Core defines the prototype default `ServerResponse.prototype.statusCode = 200` (`$NODEJS_SOURCE/lib/internal/http/server.js:285`) as a plain data property deliberately shadowed by per-instance assignment; core itself reads `this.statusCode` when flushing (`server.js:420`). Per-instance documented usage, not an override of core behavior. |
| C-007 | `$PACKAGE_ROOT/index.js:119`, `res.setHeader('WWW-Authenticate', ...)` | rejected as patch | Invocation of the documented core method `OutgoingMessage.prototype.setHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`). The method is called, never reassigned or wrapped. |
| C-008 | `$PACKAGE_ROOT/index.js:120`, `res.end('Unauthorized')` | rejected as patch | Invocation of the documented core method; no assignment. |
| C-009 | `$PACKAGE_ROOT/index.js:134`, `http.STATUS_CODES[code]` | rejected as patch | Indexed read of the exported status-code map (`$NODEJS_SOURCE/lib/http.js:54,265`, re-exported from `lib/internal/http/server.js`). Read-only; no key is written or deleted. |
| C-010 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:9`, `require('crypto')` | rejected as patch | Plain core import; subsequent uses are reads/calls only (C-011..C-013). |
| C-011 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:17-18`, `crypto.timingSafeEqual` | rejected as patch | Feature detection: `if (crypto.timingSafeEqual) return crypto.timingSafeEqual(a, b)`. Property read + call; never assigned, no polyfill installed onto the `crypto` module (the fallback byte loop is a local code path). Export confirmed at `$NODEJS_SOURCE/lib/crypto.js:239`. |
| C-012 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:31`, `crypto.pseudoRandomBytes(32)` | rejected as patch | Call to the deprecated core alias (DEP0115, defined via `getRandomBytesAlias` at `$NODEJS_SOURCE/lib/crypto.js:309,387`, aliasing `randomBytes`). A call, not a mutation. See Supporting context. |
| C-013 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:32-33`, `crypto.createHmac(...).update(...).digest()` | rejected as patch | Documented API calls (`$NODEJS_SOURCE/lib/crypto.js:173,201`); no assignment to the module or any prototype. |

Unresolved candidates: none.

## Supporting context

- Deprecated core API usage (not patches):
  - `new Buffer(string, 'base64')` at `$PACKAGE_ROOT/index.js:79` uses the
    DEP0005 constructor. Core keeps it functional and delegates to
    `Buffer.from` (`$NODEJS_SOURCE/lib/buffer.js:317-330`); the deprecation
    warning is flag-gated (`showFlaggedDeprecation`). Deprecated usage of a
    supported core path, not a rewrite of it.
  - `crypto.pseudoRandomBytes` at
    `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:31` is the DEP0115 alias of
    `randomBytes` (`$NODEJS_SOURCE/lib/crypto.js:309,387`); deprecation warning
    only under `--pending-deprecation`.
- Compatibility workaround (not a patch): tsscmp's `bufferEqual` feature-detects
  `crypto.timingSafeEqual` (added in Node 6.6.0; see nodejs/node#3043 and
  nodejs/node#3073 referenced in the file header, and jshttp/basic-auth#39
  referenced at `tsscmp/lib/index.js:16`) and falls back to a local byte-compare
  loop on ancient runtimes. The fallback stays inside the library; `crypto` is
  never modified.
- Middleware convention: `req.user` / `req.remoteUser` annotate the request
  object per the Connect/Express middleware pattern; core's `IncomingMessage`
  defines no such names at the audited revision, so these are purely additive
  application metadata on a core-backed instance.
- Upstream: open, unmerged PR expressjs/basic-auth-connect#10 ("Release
  proposal: 2.0.0") would rewrite index.js to ES6 and drop the tsscmp
  dependency in favor of direct `crypto` usage. Not present in the audited
  1.1.0 source; no effect on this verdict.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js` | Full line-by-line read | Entire runtime surface (136 + 39 lines) inspected; all writes identified. |
| Same two files | Skill candidate pattern set via `rg -n --no-ignore` (6 pattern groups; see searches.md) | Only hits: core imports (index.js:1-2, tsscmp lib/index.js:9) and `new Buffer` (index.js:79). Prototype/defineProperty/`__proto__`/`Object.assign`; monkeypatch/wrap/shim/polyfill/override; `require.cache`/`require.extensions`/`Module._*`/`syncBuiltinESMExports`/`registerHooks`; `process.binding`/`internalBinding`/`'internal/'` — all negative. |
| Same two files | `rg -n --no-ignore '(req\|res\|http\|crypto\|Buffer)\s*(\.\|\[)[^=]*=[^=]'` | Writes found only at index.js:94,100 (`req.user`/`req.remoteUser`) and index.js:118 (`res.statusCode`); `delete`/descriptor-op search negative. |
| `$PACKAGE_ROOT/node_modules/tsscmp/` (whole package incl. tests, as a safety net) | `rg -n --no-ignore '\.prototype\b\|definePropert\|require\.cache\|Module\._\|process\.binding\|__proto__\|setPrototypeOf'` | No matches. |
| `$PACKAGE_ROOT/package.json`, `$PACKAGE_ROOT/node_modules/tsscmp/package.json` | `rg -n '"(pre\|post)?install"\|"prepare"'` | No install/lifecycle scripts; no code runs at install time. |
| `$NODEJS_SOURCE/lib/http.js` | Read lines 1-60; `rg -n 'STATUS_CODES'` | At this commit the HTTP implementation lives in `lib/internal/http/*` (legacy `lib/_http_*.js` are thin re-exports). `STATUS_CODES` exported at lib/http.js:54,265. |
| `$NODEJS_SOURCE/lib/internal/http/server.js` | `rg -n 'statusCode'` | `ServerResponse.prototype.statusCode = 200` at :285 — prototype default designed for per-instance assignment; core reads `this.statusCode` at :420. Confirms C-006 as documented usage. |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js` | `rg -n 'setHeader\b'` | `OutgoingMessage.prototype.setHeader` defined at :813. Confirms C-007 as a call into core, not a replacement. |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` | `rg -n 'remoteUser\|\.user\b'` | No matches — `user`/`remoteUser` are not core properties. Confirms C-004/C-005 as library metadata. |
| `$NODEJS_SOURCE/lib/buffer.js` | `rg -n 'DEP0005\|function Buffer\('` + read lines 310-345 | Deprecated `Buffer()` constructor at :320 delegates to `Buffer.from`/`Buffer.alloc`; DEP0005 warning flag-gated. Confirms C-003 as deprecated usage, not mutation. |
| `$NODEJS_SOURCE/lib/crypto.js` | `rg -n 'timingSafeEqual\|pseudoRandomBytes\|createHmac'` + read `getRandomBytesAlias` (:309) | `timingSafeEqual` exported at :239; `pseudoRandomBytes` is the DEP0115 alias of `randomBytes` at :387; `createHmac` at :173/:201. Confirms C-011..C-013 as plain API usage. |
| Library git history | `git log -S 'new Buffer' -- index.js`; `git log -S 'tsscmp' -- index.js package.json` | `new Buffer` present since early history; tsscmp introduced by commit bac1e6a "feat: add timing safe equal comparison". No patching-related history. |
| expressjs/basic-auth-connect issues/PRs | `gh search issues/prs --repo expressjs/basic-auth-connect 'Buffer'`; `gh pr view 10` | No Buffer-related issues. PR #10 (open, unmerged): 2.0.0 proposal rewriting index.js and removing tsscmp — not in audited source. https://github.com/expressjs/basic-auth-connect/pull/10 |
| tsscmp file-header references | nodejs/node#3043, nodejs/node#3073, jshttp/basic-auth#39 (cited in `tsscmp/lib/index.js:5-7,16`) | Context for `crypto.timingSafeEqual` availability (landed in Node 6.6.0); motivates the feature detection, no patch implied. |

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` is the only export (CommonJS, default
  `main`); no `exports` map, no conditional entrypoints, no bin, no
  dist/bundled output, no native code. `tsscmp@1.0.6` entrypoint
  `lib/index.js` (`"main": "lib/index.js"`) has no dependencies of its own
  (`node_modules/.package-lock.json` confirms a single-package tree;
  tsscmp integrity sha512-LxhtAkPDTkVCMQjt2h6eBVY28KCjikZqZfMcC15YBeNjkgUpdCfBu5HoiOTDu86v6smE8yOjyEktJ8hlbANHQA==).
- Node.js files selected per observed API surface only (HTTP
  request/response, Buffer, crypto); verified at commit
  d44625a4b80c672215b469906ce583ce7eeeebaf after following the `lib/http.js`
  re-exports to `lib/internal/http/*`. No recursive scan of the Node.js tree.
- Branches: both middleware auth branches (sync/async callback), the
  string-credentials constructor path, and the `unauthorized`/`error` helpers
  were read; tsscmp's `timingSafeEqual`-present and fallback branches both
  inspected. No runtime branch left uninspected.
- Excluded by requested scope: `test.js`, `Makefile`, `.github/`, README,
  `tsscmp/test/` and CI config (no runtime-reachable code; tsscmp's whole
  directory was additionally pattern-scanned as a safety net — negative).
- No dynamic reproduction was run; the full runtime surface is small enough
  that static reading of every line constitutes complete proof.
- Node.js baseline is the main development branch (v28.0.0-pre), not an LTS
  release; the contracts relied on (`statusCode` assignability, `setHeader`,
  `IncomingMessage` property set, `Buffer()` DEP0005, `pseudoRandomBytes`
  DEP0115, `timingSafeEqual`) are stable across supported release lines, so
  this does not affect the verdict.
- What would change the verdict: a future release adding install scripts,
  assignments to `http`/`crypto`/`Buffer` module objects or prototypes, or a
  dependency change (e.g. PR #10's rewrite) would require re-audit.

## Changes since the previous audit

First audit (independent pass; no prior report read or updated, per
double-blind protocol).
