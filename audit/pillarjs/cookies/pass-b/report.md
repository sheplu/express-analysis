# Node.js patch audit: cookies

- Verdict: **confirmed patching** — two transient shared-global mutations, both transitive via depd@2.0.0, both saved-and-synchronously-restored; zero permanent mutations and zero mutations of `http`/`crypto` core objects.
- Status: complete
- Input: issue sheplu/express-analysis#21 — `cookies` (signed and unsigned cookies based on Keygrip), https://github.com/pillarjs/cookies
- Library: cookies@0.9.2, default branch `master` @ `6e35de1524bb55d5deac3edcf67c2ac374d658d0`, git clone of upstream, unmodified. Runtime deps installed with `npm install --ignore-scripts --omit=dev`: depd@2.0.0, keygrip@1.1.0, tsscmp@1.0.6.
- Node.js baseline: $NODEJS_SOURCE, `main` @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only.
- Reproduction runtime: Node v24.19.0 (`repro/repro.js`, results in `repro/results.json`, `repro/summary.txt`).
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` (sole shipped file; `main` default, no `exports` map) plus the resolved entrypoints of every runtime dependency: `node_modules/depd/index.js`, `node_modules/depd/lib/browser/index.js` (conditional `browser` entrypoint, inspected and confirmed unused under Node), `node_modules/keygrip/index.js`, `node_modules/tsscmp/lib/index.js`. Tests, examples, docs, devDependencies out of scope.
- Coverage: source — complete (all five runtime files read in full; the six skill pattern groups plus supplementary patterns run over the full scope, see `searches.md`); upstream — corroborated (depd#32, depd#36, depd#39, cookies#122/#144); runtime — reproduced (before/after snapshots, import-time and runtime trap logs, signed-cookie HTTP round trip).

## Patching verdict

Patching is demonstrated, with a narrow and well-bounded footprint:

- **Shared core/global mutations: 2 confirmed (F-001, F-002)** — depd@2.0.0's `getStack()` assigns `Error.prepareStackTrace` and `Error.stackTraceLimit` (realm-wide globals that Node core itself installs/consults), then restores both synchronously in the same tick. Both are **transitive** (cookies -> depd) and **transient** (save/replace/restore with no awaited or asynchronous gap between write and restore). They execute unconditionally at `require('cookies')` time (twice) and again on each deprecation warning at runtime.
- **Instance/application overrides: 0 confirmed.** The optional middleware adds a `cookies` data property to req/res instances (metadata, not an override — C-007). `http.OutgoingMessage.prototype.setHeader` is read and invoked, never written (C-001).
- **Core module interception / core source rewrites: 0.** Zero hits for loader hooks, `require.cache`/`require.extensions`, `Module._*`, `process.binding`, `internalBinding`, or internal-module specifiers.
- Unresolved candidates: none. All 13 candidates in the ledger are resolved (2 confirmed, 11 rejected).

Runtime diffing confirms the permanent state is untouched: after `require` and after a full signed-cookie set/get/verify exercise, every tracked core identity (`http.OutgoingMessage.prototype.setHeader/getHeader/removeHeader/end`, `http.ServerResponse.prototype.writeHead`, `http.IncomingMessage.prototype.destroy`, `crypto.createHmac/timingSafeEqual/pseudoRandomBytes/randomBytes`, `Object.assign`, `Module._load`, `Module._resolveFilename`, `process.binding`, `Error.captureStackTrace`) is identical to baseline; `Object/Array/String/Function/Error` prototype key sets, `Error` constructor own keys, global object keys, `require.extensions` keys, and builtin-style `require.cache` entries are unchanged; `Error.prepareStackTrace`/`Error.stackTraceLimit` end at their baseline values.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` transiently replaced with depd's `prepareObjectStackTrace`

- Category: shared core mutation (global V8/Node stack-formatting hook), transient — synchronously restored
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:386` (write), `:384` (save), `:395` (restore) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L386
- Origin: transitive — cookies@0.9.2 -> depd@2.0.0 (`$PACKAGE_ROOT/index.js:10`)
- Core baseline: Node installs its own default hook — `ErrorPrepareStackTrace` at `$NODEJS_SOURCE lib/internal/errors.js:168` — and the realm callback `prepareStackTraceCallback` (`lib/internal/errors.js:136-156`) delegates all error-stack formatting to whatever function sits on `Error.prepareStackTrace`; `--enable-source-maps` processing (`lib/internal/source_map/prepare_stack_trace.js:28`) participates through the same single hook. Verified at runtime: stock Node v24.19.0 boots with `Error.prepareStackTrace === function ErrorPrepareStackTrace`.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (a function returning the raw CallSite array), replacing Node's installed default; restored to the saved previous value at `:395`.
- Execution chain (import time, unconditional): `require('cookies')` -> `$PACKAGE_ROOT/index.js:10` `require('depd')('cookies')` -> depd factory `depd/index.js:108` `getStack()` -> write at `:386`; and again `$PACKAGE_ROOT/index.js:252` `deprecate.property(Cookie.prototype, 'maxage', ...)` -> `depd/index.js:456` `getStack()`. Runtime: every deprecation log (`depd/index.js:199`, e.g. deprecated keys-array constructor at `$PACKAGE_ROOT/index.js:90`, `secureProxy` at `:154`, `maxage` accessor at `:252`).
- Activation: always on module load — no guard; `process.noDeprecation` only short-circuits `log()`, not the two import-time `getStack()` calls in the factory and `wrapproperty`.
- Scope and restoration: realm-global — while set, every `error.stack` materialization in the process formats through depd's hook; restored synchronously a few statements later (no async gap). Verified restored after require and after exercise.
- Resulting behavior: within the window, stack traces lose Node's default/source-map formatting; concurrent consumers that save/restore the same hook can interleave destructively. Not hypothetical: depd#32 reports collisions (`callSite.getFileName is not a function`), and depd#36/#39 document breakage with Node's `--enable-source-maps` — opened by a Node.js source-maps author.
- Evidence: static — write/restore visible at depd/index.js:382-399; dynamic — `repro/repro.js` getter/setter trap recorded, during `require('cookies')`, two set-cycles `prepareObjectStackTrace -> ErrorPrepareStackTrace (restore)`, plus one more cycle during a deprecated-API call (`repro/results.json` `phases.importTimeTrapLog` / `phases.runtimeTrapLog`), ending at the baseline value.
- Upstream: https://github.com/dougwilson/nodejs-depd/issues/32 (closed; "Why is this library overwriting Error type?" — quotes this exact function), https://github.com/dougwilson/nodejs-depd/issues/36 and https://github.com/dougwilson/nodejs-depd/issues/39 (closed; source-map incompatibility), https://github.com/dougwilson/nodejs-depd/issues/50 (open; same collision symptom class). Behavior unchanged in depd@2.0.0, the version resolved here.

### F-002: `Error.stackTraceLimit` transiently raised to `Math.max(10, current)`

- Category: shared core mutation (global stack-capture depth), transient — synchronously restored
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:387` (write), `:382` (save), `:396` (restore) — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L387
- Origin: transitive — cookies@0.9.2 -> depd@2.0.0
- Core baseline: `Error.stackTraceLimit` defaults to 10; it is a process-wide data property consumed by V8 at every stack capture. Node core itself treats it as shared mutable state with the identical save/replace/restore idiom ($NODEJS_SOURCE `lib/internal/errors.js:181-188`, `:416-419`) and defensively checks its writability (`lib/internal/errors.js:248-254`).
- Exact mutation: `Error.stackTraceLimit = Math.max(10, limit)`; restored to the saved value at `:396`.
- Execution chain and activation: identical to F-001 (same `getStack()` body; same two unconditional import-time executions and per-deprecation runtime executions).
- Scope and restoration: process-global while set — any stack captured in the window uses depth >= 10 regardless of an application-configured lower value; restored synchronously. Verified restored.
- Resulting behavior: with an application-set limit below 10 (e.g. 3), stacks captured inside the window contain up to 10 frames instead. No effect when the ambient limit is already >= 10.
- Evidence: static — depd/index.js:382-399; dynamic — repro set a sentinel `Error.stackTraceLimit = 3` around the require/exercise windows and wrapped `Error.captureStackTrace`: each depd capture ran with `stackTraceLimitInForce: 10`, and the final observed value was the sentinel 3 (`restoredBySubject: true`) — demonstrating both the write and the restore (`repro/results.json`).
- Upstream: covered by the same depd#32 discussion; no dedicated issue.

## Candidate ledger and unresolved questions

Full ledger with traces in `candidates.md`. Summary:

| ID | Site and core target | Status | Note |
| --- | --- | --- | --- |
| C-001 | index.js:167, `http.OutgoingMessage.prototype.setHeader` | rejected as patch | read + `.call(res, ...)`; never assigned; identity verified unchanged at runtime |
| C-002 | depd/index.js:386, `Error.prepareStackTrace` | confirmed -> F-001 | transient write + restore, observed live |
| C-003 | depd/index.js:387, `Error.stackTraceLimit` | confirmed -> F-002 | transient write + restore, observed live |
| C-004 | index.js:246, `defineProperty(Cookie.prototype, 'maxage')` | rejected as patch | library-owned prototype |
| C-005 | index.js:252 -> depd `wrapproperty`/`convertDataDescriptorToAccessor` (depd:62, :485) | rejected as patch | descriptor rewrite applied only to library-owned `Cookie.prototype` |
| C-006 | depd/index.js:496-535, defineProperty on `DeprecationError` instance | rejected as patch | fresh library-owned `Error` instance; `Error.prototype`/constructor untouched |
| C-007 | index.js:298-306, `req.cookies = res.cookies = ...` middleware | rejected as patch | optional; adds metadata property to instances, replaces nothing |
| C-008 | depd/index.js:425, `new Function` in `wrapfunction` | rejected as patch | returns wrapper; no caller in scope (cookies never uses `deprecate.function`) |
| C-009 | depd/index.js:251/:260, `process.emit` / `process.stderr.write` | rejected as patch | calls, no mutation |
| C-010 | keygrip/index.js, `crypto.createHmac` use | rejected as patch | calls only |
| C-011 | tsscmp/lib/index.js, `crypto.timingSafeEqual`/`pseudoRandomBytes` | rejected as patch | feature-detect read + calls only |
| C-012 | depd/lib/browser/index.js (conditional entrypoint) | rejected as patch | not loaded under Node; no external writes regardless |
| C-013 | index.js:90-97, `options.constructor.name === 'Keygrip'` | rejected as patch | read-only duck typing |

Unresolved: none.

## Supporting context

- **Private/core API read at `$PACKAGE_ROOT/index.js:167`** (C-001): `var setHeader = res.set ? http.OutgoingMessage.prototype.setHeader : res.setHeader` then `setHeader.call(res, 'Set-Cookie', headers)`. When a framework defines `res.set` (Express), cookies deliberately bypasses it and invokes the original core `setHeader` (`$NODEJS_SOURCE lib/internal/http/outgoing.js:813`, exported via `lib/_http_outgoing.js` and `lib/http.js:50,269`) on the instance. This is read-only use of a public core method to *avoid* framework overrides — the inverse of patching. Known duck-typing fragility is tracked upstream (pillarjs/cookies#122 open, #144 closed re fastify) but involves no mutation.
- **depd is a patching-capable utility**: `deprecate.function`/`deprecate.property` wrap arbitrary caller-supplied functions/properties. Within this dependency tree they are applied only to the library-owned `Cookie.prototype` (`maxage` alias). No core object is ever passed to them.
- keygrip@1.1.0 and tsscmp@1.0.6 are pure `crypto` consumers (HMAC signing, double-HMAC timing-safe compare); tsscmp's `crypto.pseudoRandomBytes` is a deprecated-but-public core API — usage, not mutation.
- No install scripts in cookies/depd/keygrip/tsscmp; deps were installed with `--ignore-scripts` regardless.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/index.js; node_modules/{depd,keygrip,tsscmp} entrypoints | full reads + 6 skill pattern groups + supplementary patterns (`searches.md`) | complete hit inventory; groups 5 and 6 zero hits |
| $NODEJS_SOURCE lib/http.js, lib/internal/http/outgoing.js, lib/_http_outgoing.js | `rg -n "OutgoingMessage.prototype.setHeader" lib/internal/http/outgoing.js` | baseline for C-001: definition at lib/internal/http/outgoing.js:813; cookies only reads it |
| $NODEJS_SOURCE lib/internal/errors.js | `rg -n "prepareStackTrace|stackTraceLimit" lib/internal/errors.js` | baseline for F-001/F-002: default hook `ErrorPrepareStackTrace` (:168), realm callback consulting `Error.prepareStackTrace` (:136-156), core's own save/restore of `stackTraceLimit` (:181-188, :416-419) |
| $NODEJS_SOURCE lib/internal/source_map/prepare_stack_trace.js | `rg -n "prepareStackTrace"` | source-map stacks flow through the same global hook; grounds the depd#36/#39 conflict |
| dougwilson/nodejs-depd | issues #32, #36, #39 (closed), #50 (open) | corroborate F-001 real-world impact; #32 quotes `getStack()` verbatim |
| pillarjs/cookies | issues #122 (open), #144 (closed); `git log -S 'OutgoingMessage.prototype.setHeader' -- index.js` | C-001 context; usage predates 2017 file rename; no mutation discussed |
| Runtime reproduction | `node repro/repro.js "$PACKAGE_ROOT"` on Node v24.19.0 | import-time trap log: 2 set/restore cycles of `Error.prepareStackTrace` + limit 10 in force during captures (sentinel 3); runtime cycle on deprecated API; signed-cookie HTTP round trip verified (`value123`, `session.sig` emitted and validated); zero permanent diffs across all tracked surfaces |

## Coverage and limitations

- Entry points covered: `$PACKAGE_ROOT/index.js` (every line; sole shipped file per `files`), depd@2.0.0 `index.js` (every line) and conditional `lib/browser/index.js`, keygrip@1.1.0 `index.js` (every line), tsscmp@1.0.6 `lib/index.js` (every line). `tsscmp/test/**` excluded (unreachable from entrypoint, out of scope).
- Node.js baseline files inspected (read-only, bounded per skill table): lib/http.js, lib/internal/http/outgoing.js, lib/_http_outgoing.js, lib/internal/errors.js, lib/internal/source_map/prepare_stack_trace.js at `d44625a4b80`.
- Runtime branches exercised: non-deprecated constructor (`{keys}`) over real HTTP with signed set/get/verify; deprecated keys-array constructor (triggers depd log path). Not exercised: `secureProxy` option, `maxage` accessor access, Keygrip-instance constructor argument, `process.noDeprecation`/`NO_DEPRECATION` branches — all statically read and none contains additional writes; an untested branch cannot prove universal absence, but every write found in the scoped source is accounted for in the ledger.
- Note on baseline discrepancy: static core baseline is `main @ d44625a4b80`; reproduction ran on released Node v24.19.0. The observed default `ErrorPrepareStackTrace` exists in both; no finding depends on behavior that differs between them.
- Repro instrumentation caveat: `Error.stackTraceLimit` writes cannot be observed via accessor (V8 requires a data property — an accessor trap verifiably disables stack capture), so F-002's dynamic evidence is value-sampling at capture time plus sentinel restoration, not a per-assignment log. The static write/restore pair at depd/index.js:387/:396 is unambiguous.
- What would change the verdict: nothing within this scope — all candidates resolved. A different dependency resolution (e.g., a future depd major removing `getStack()`, or an added runtime dependency) would require re-audit.

## Changes since the previous audit

First audit (pass B of a blind two-pass protocol; no prior pass-b report existed and no other audit artifacts were read).
