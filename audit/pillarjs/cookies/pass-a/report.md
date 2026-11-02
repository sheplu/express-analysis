# Node.js patch audit: cookies

- Verdict: **confirmed patching** (one transient, self-restoring shared-global mutation, transitive via depd; no permanent patch and no instance/application override found)
- Status: complete
- Input: issue sheplu/express-analysis#21 — `cookies` (signed and unsigned cookies based on Keygrip), https://github.com/pillarjs/cookies
- Library: cookies@0.9.2, default branch `master` @ 6e35de1524bb55d5deac3edcf67c2ac374d658d0, git checkout at `$PACKAGE_ROOT` with runtime deps installed via `npm install --ignore-scripts --omit=dev`; no local modifications
- Node.js baseline: `$NODEJS_SOURCE` main @ d44625a4b80c672215b469906ce583ce7eeeebaf (read-only)
- Reproduction runtime: Node v24.19.0 (`node repro-error-prepare.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: runtime entrypoint `$PACKAGE_ROOT/index.js` (sole shipped file, `files: ["index.js"]`, default main) plus resolved runtime dependency entrypoints: depd@2.0.0 (`index.js`, plus conditional `browser` entrypoint `lib/browser/index.js`), keygrip@1.1.0 (`index.js`), tsscmp@1.0.6 (`lib/index.js`). Tests, examples, docs, devDependencies out of scope.
- Coverage: source — full (all five runtime files read end-to-end; six skill pattern groups plus a supplemental Error/assignment sweep, see `searches.md`); upstream — corroborated against dougwilson/nodejs-depd issues; runtime — single-version reproduction on Node v24.19.0.

## Patching verdict

Patching is demonstrated: **1 confirmed finding (F-001)**, a shared core/global mutation — depd's `getStack()` replaces `Error.prepareStackTrace` and raises `Error.stackTraceLimit` on the global `Error` constructor, then synchronously restores both saved originals. It is **transitive** (cookies -> depd@2.0.0), reachable unconditionally at `require('cookies')` time and again on every deprecation-warning emission, and **transient** (save/swap/restore within one synchronous function; restoration is unconditional in normal control flow but not exception-guarded). On modern Node the swapped function is one that Node core itself installed at bootstrap, so this is a genuine (if momentary) replacement of a core-installed API, not a write to an empty slot.

Instance/application overrides: 0 confirmed. Core module interception: none (zero hits). Core source rewrites: none. Install scripts: none. Unresolved candidates: 0; 10 candidates rejected (see ledger). The verdict is limited to the inspected runtime scope described above.

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` transient swap in depd `getStack()`

- Category: shared core mutation (global `Error` constructor properties), transient with synchronous restore
- Library site(s): `node_modules/depd/index.js:381-399` — writes at :386 (`Error.prepareStackTrace = prepareObjectStackTrace`) and :387 (`Error.stackTraceLimit = Math.max(10, limit)`); saves at :382/:384; restores at :395/:396. Pinned source: https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js#L381-L399
- Origin: transitive — cookies@0.9.2 -> depd@2.0.0 (`$PACKAGE_ROOT/index.js:10` `require('depd')('cookies')`)
- Core baseline: Node installs the default `Error.prepareStackTrace` at bootstrap — `$NODEJS_SOURCE lib/internal/bootstrap/realm.js:503-510` (`setupPrepareStackTrace`, value `ErrorPrepareStackTrace` from `lib/internal/errors.js:168`); `lib/internal/errors.js:136-160` shows core invoking any user-assigned `Error.prepareStackTrace` in place of default stack formatting; `Error.stackTraceLimit` default 10 is a documented core-honored property (`doc/api/errors.md`). Verified present on Node v24.19.0 at runtime (own data property, function `ErrorPrepareStackTrace`).
- Exact mutation: on the global `Error` constructor, plain assignment replaces the `prepareStackTrace` data property with depd's `prepareObjectStackTrace` (returns the raw V8 CallSite array instead of a formatted string) and sets `stackTraceLimit` to at least 10; both prior values are captured first and written back after `Error.captureStackTrace(obj)` + `obj.stack` materialization.
- Execution chain: `require('cookies')` -> `$PACKAGE_ROOT/index.js:10` `depd('cookies')` -> depd/index.js:108 `getStack()` -> writes; again via `$PACKAGE_ROOT/index.js:252` `deprecate.property(...)` -> wrapproperty (depd/index.js:455) -> `getStack()`; thereafter on every deprecation log (`log()` -> depd/index.js:199 `getStack()`), e.g. when a caller uses the deprecated array-`keys` argument or the `maxage`/`secureProxy` options.
- Activation: unconditional at module load (no env guard reaches the writes; `NO_DEPRECATION` only suppresses later log output, and the two load-time `getStack()` calls run regardless). Production code path.
- Scope and restoration: process-wide globals shared by all consumers of `Error`. Mutation window is a few synchronous statements inside depd's own code; both properties are restored to the saved originals before `getStack()` returns. No try/finally — an exception between swap and restore would leave the custom `prepareStackTrace` installed process-wide (not observed; the window contains only non-throwing operations in normal use).
- Resulting behavior: during the window, any stack materialized yields a CallSite array rather than Node's default formatted string, and stack depth capture is forced to >= 10 frames; after restore, behavior is identical to before. Practical effect in-process is nil under normal single-threaded execution, but the pattern is a known interference point with other `prepareStackTrace` consumers (Node's `--enable-source-maps`, APM/error-reporting tools) if they observe or race the same global.
- Evidence: static — full source of `getStack()` (depd/index.js:381-399) and core baseline above; dynamic — `node repro-error-prepare.js "$PACKAGE_ROOT"` on Node v24.19.0 recorded exactly 4 writes during `require('cookies')` and 2 more on a deprecated call (3 swap/restore pairs: `prepareObjectStackTrace` then the saved core `ErrorPrepareStackTrace` each time), with `Error.stackTraceLimit` 10 -> 10 (restored) and `http.OutgoingMessage.prototype.setHeader` identity unchanged.
- Upstream: dougwilson/nodejs-depd#32 "Why is this library overwriting Error type?" (closed; quotes this exact `getStack()` code); dougwilson/nodejs-depd#36 "Incompatible with --enable-source-maps node 12 option" (closed) and #39 "compatibility with Node.js' source-map implementation" (closed; opened by the Node source-maps implementer, referencing nodejs/node commit 521b2224c3b06de811f3d8353cce5e4a69239864) document real-world interference between this swap and Node's source-map stack preparation. Behavior still present and shipped in depd@2.0.0 as resolved here.

No other patches were confirmed. In particular, cookies' own code performs no write to any core object: its use of `http.OutgoingMessage.prototype.setHeader` is read-and-invoke only (see C-003).

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md` (same directory). Summary:

| ID | Site and core target | Status | Evidence / reason |
| --- | --- | --- | --- |
| C-001 | depd/index.js:386/:395, `Error.prepareStackTrace` | confirmed -> F-001 | Write replacing core-installed global function; save/restore verified statically and at runtime |
| C-002 | depd/index.js:387/:396, `Error.stackTraceLimit` | confirmed -> F-001 | Same site/mechanism; raised to >=10 then restored |
| C-003 | index.js:167, `http.OutgoingMessage.prototype.setHeader` | rejected as patch | Read-only borrow invoked via `.call(res, ...)`; no assignment; core identity unchanged at runtime |
| C-004 | index.js:300, `req.cookies`/`res.cookies` on core-backed instances | rejected as patch | Adds new library-owned metadata properties; no core member replaced; optional middleware path |
| C-005 | index.js:246-252, `Cookie.prototype.maxage` | rejected as patch | Library-owned prototype, not core |
| C-006 | depd/index.js:439-486/:49-65, wrapproperty/convertDataDescriptorToAccessor | rejected as patch | Generic descriptor rewriter; only activation in scope targets library-owned `Cookie.prototype` |
| C-007 | depd/index.js:413-433, wrapfunction (`new Function`) | rejected as patch | Returns wrapper, assigns nothing; never called in scope |
| C-008 | depd/index.js process usage incl. :251 `process.emit('deprecation')` | rejected as patch | Reads and public EventEmitter calls only; no process property assigned |
| C-009 | depd/index.js:492-538, DeprecationError | rejected as patch | defineProperty on a fresh library-owned Error instance; Error.prototype untouched |
| C-010 | tsscmp/lib/index.js:17-18/:31, crypto usage | rejected as patch | Feature-detect read and calls (incl. deprecated `pseudoRandomBytes`); no writes |
| C-011 | keygrip/index.js:30-47 | rejected as patch | Instance methods and statics on its own exported constructor |
| C-012 | depd/lib/browser/index.js | rejected as patch | No-op browser variant; zero writes; never resolved by Node |

Unresolved: none.

## Supporting context

- **Borrowed core method to bypass framework wrappers (C-003):** `$PACKAGE_ROOT/index.js:167-168` selects the raw `http.OutgoingMessage.prototype.setHeader` ($NODEJS_SOURCE lib/internal/http/outgoing.js:813) whenever the response has a framework `res.set` (e.g. Express), and invokes it with the response as receiver. This deliberately sidesteps framework-level `setHeader` overrides but mutates nothing in core; it is a supported invocation of a public API.
- **Deprecated core API call:** tsscmp calls `crypto.pseudoRandomBytes(32)` (tsscmp/lib/index.js:31), a deprecated Node API, and feature-detects `crypto.timingSafeEqual` (:17). Compatibility usage, not patching.
- **Private-ish instance reads:** `$PACKAGE_ROOT/index.js:280-284` reads `req.socket.encrypted` / `req.connection.encrypted` (undocumented TLS marker) and `req.protocol` (framework property). Reads only.
- **Patch-capable helpers not aimed at core:** depd's `wrapproperty`/`wrapfunction` could redefine properties on any object a caller passes (including core objects), but within this package's runtime scope the only target is the library-owned `Cookie.prototype` (C-005/C-006).
- `process.emit('deprecation', err)` (depd/index.js:251) emits a library-defined event through the public EventEmitter API on `process`; Node core attaches no semantics to that event name.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime files (5) | `rg -n --no-ignore <skill groups 1-6 + supplemental>` from `$PACKAGE_ROOT` (full log in `searches.md`) | Groups 5 (loader interception) and 6 (bindings/internals) zero hits; all other hits dispositioned in ledger |
| `$PACKAGE_ROOT` dependency metadata | `package.json` of depd/keygrip/tsscmp; `package-lock.json`; `find node_modules -type f -name '*.js'` | No install scripts; dep closure = depd@2.0.0, keygrip@1.1.0, tsscmp@1.0.6; exactly five runtime JS files |
| `$NODEJS_SOURCE lib/http.js`, `lib/_http_outgoing.js`, `lib/internal/http/outgoing.js` | `rg -n "OutgoingMessage" lib/http.js`; `rg -n "setHeader" lib/internal/http/outgoing.js` | `setHeader` defined at lib/internal/http/outgoing.js:813, exported through lib/http.js:269; baseline for C-003 |
| `$NODEJS_SOURCE lib/internal/errors.js`, `lib/internal/bootstrap/realm.js`, `lib/internal/source_map/prepare_stack_trace.js`, `doc/api/errors.md` | bounded `rg -n "prepareStackTrace|stackTraceLimit" <file>`; realm.js:480-520 read | Core installs default `Error.prepareStackTrace` (realm.js:503-510, errors.js:168) and honors user assignment (errors.js:149-156); baseline for F-001 |
| Runtime reproduction | `node repro-error-prepare.js "$PACKAGE_ROOT"` (Node v24.19.0) | 6 recorded writes (3 swap/restore pairs), both globals restored, `setHeader` identity unchanged, 1 deprecation event |
| Upstream depd | https://github.com/dougwilson/nodejs-depd/issues/32 (closed), /issues/36 (closed), /issues/39 (closed), /issues/50 (open), /pull/48 (open) | #32 questions this exact global swap; #36/#39 document interference with Node's source-map stack preparation; confirms behavior is known and intentional upstream |

## Coverage and limitations

- Entry points: cookies has a single shipped file (`index.js`, sha256 35e26a70dd5771a238fa78df657b8f1c112ab292eaa84527a4cc4389c4ba50fb). Dependencies read end-to-end: depd/index.js (4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91), depd/lib/browser/index.js (10b4d4a4e9d14e9e6a5ab7ced64405ef90e6bec94d479a8e223cbba88828ad79), keygrip/index.js (4a38fe59a5424e779823bd749d4dd790e0d58faca993886a43bb1f68161fc382), tsscmp/lib/index.js (8a48bb471b338cccf04fd9538ff405534c24a3e57ae508f29b5a6ed0bb5536f7).
- Node.js files consulted (only, no tree scans): lib/http.js, lib/_http_outgoing.js, lib/internal/http/outgoing.js, lib/internal/errors.js, lib/internal/bootstrap/realm.js, lib/internal/source_map/prepare_stack_trace.js, doc/api/errors.md — all at main @ d44625a4b80c672215b469906ce583ce7eeeebaf.
- Reproduction ran on Node v24.19.0 only; on much older Node (no bootstrap-installed `prepareStackTrace`), F-001's swap replaces an `undefined` slot rather than a core-installed function — the global write itself is version-independent, only the displaced value differs.
- The exception-leak path in `getStack()` (swap without try/finally) was reasoned statically, not fault-injected.
- Tests, examples, docs, devDependencies, and the never-installed dev lockfile tree were not audited (out of scope by instruction). The `browser` entrypoint of depd was inspected but is unreachable under Node resolution.
- What would change the verdict: nothing found suggests additional patch sites; removing F-001 would require depd to adopt a different stack-capture approach upstream.

## Changes since the previous audit

First audit (pass A of a two-pass blind protocol); no previous findings to revalidate.
