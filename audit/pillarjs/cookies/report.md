# Node.js patch audit: cookies

- Verdict: **confirmed patching**
- Status: complete
- Input: issue sheplu/express-analysis#21 (`cookies`, https://github.com/pillarjs/cookies)
- Library: cookies 0.9.2, git master @ `6e35de1524bb55d5deac3edcf67c2ac374d658d0`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): depd@2.0.0, keygrip@1.1.0, tsscmp@1.0.6
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (pass A instrumented-accessor trace; pass B full before/after snapshots + signed-cookie HTTP round trip)
- Scope: production/runtime code — `index.js` (library root) plus all three resolved runtime dependencies (depd index.js + browser variant, keygrip index.js, tsscmp lib/index.js); all 5 runtime files read in full by both passes. Tests, examples, docs, devDependencies excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream corroboration found (dougwilson/nodejs-depd#32, #36, #39, #50)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements (one finding-granularity difference merged); key sites re-verified directly during reconciliation.

## Patching verdict

cookies **patches Node.js core transitively and transiently** through depd@2.0.0. cookies' own code patches nothing: its only core-backed writes are documented instance properties and library-owned objects. One confirmed patch site (two property writes, counted as one finding per site; pass B split them as F-001/F-002):

- **F-001:** depd's `getStack()` swaps two process-global properties of the `Error` constructor — `Error.prepareStackTrace` (replacing the core-bootstrap-installed default hook) and `Error.stackTraceLimit` — captures a stack, then synchronously restores both saved originals. Fires unconditionally during `require('cookies')` and again on every deprecation log. Shared core mutation, transitive origin, transient (same synchronous sequence; no async gap).

0 permanent mutations; 0 instance/application overrides; 0 module interception; 0 internals/bindings access; 0 unresolved candidates.

## Confirmed Node.js patches

### F-001: transient swap of `Error.prepareStackTrace` and `Error.stackTraceLimit` (depd `getStack()`)

- Category: shared core mutation (process-global `Error` constructor properties), transient
- Library site(s): `node_modules/depd/index.js:386` (`Error.prepareStackTrace = prepareObjectStackTrace`) and `:387` (`Error.stackTraceLimit = Math.max(10, limit)`); originals saved at `:382,:384`, restored at `:395-396` — https://github.com/dougwilson/nodejs-depd/blob/v2.0.0/index.js
- Origin: transitive — cookies -> depd@2.0.0
- Core baseline: Node's bootstrap itself installs the default hook — `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:504-511` (`ObjectDefineProperty(Error, 'prepareStackTrace', { value: ErrorPrepareStackTrace, writable: true, ... })`), default implementation `$NODEJS_SOURCE/lib/internal/errors.js:168`; userland assignment honored by the V8 callback at `errors.js:149-151`. `Error.stackTraceLimit` is the engine-level capture-depth control (default 10). So on modern Node the swap momentarily replaces a **core-installed function**, and `--enable-source-maps` stack translation flows through this same hook.
- Exact mutation: data-property writes on the global `Error` constructor: `prepareStackTrace` -> depd's `prepareObjectStackTrace` (returns raw callsite array), `stackTraceLimit` -> `max(10, current)`.
- Execution chain: `require('cookies')` -> `index.js:10` (`require('depd')('cookies')`, factory invokes `getStack()`) and `index.js:252` (`deprecate.property(Cookie.prototype, 'maxage', ...)` -> `getStack()`); thereafter once per deprecation log site.
- Activation: unconditional at import time (no guard, no opt-out; `process.env.NO_DEPRECATION` suppresses logging but not the import-time captures). Production path.
- Scope and restoration: process-wide while held; both originals restored synchronously at `:395-396` within the same tick — **not exception-guarded**, so a throw inside the window (e.g. from a user-installed throwing hook) would leak the swap (statically reasoned; not fault-injected).
- Resulting behavior: within each window, any stack captured anywhere in the process is formatted by depd's hook as a callsite array instead of core's string formatter, and capture depth is forced to ≥ 10; after restore, behavior returns to baseline. Observable interference documented upstream with `--enable-source-maps`.
- Evidence: static (sites and baselines above, re-verified by orchestrator); reproduction on Node v24.19.0 by both passes — pass A instrumented accessor: 4 writes during require + 2 during a deprecated call, 3 swap/restore pairs, full restoration after; pass B setter-trap + sentinel `stackTraceLimit=3`: observed limit 10 in force during captures, sentinel restored after (`restoredBySubject: true`), all other tracked surfaces unchanged (`pass-b/repro/results.json`). Note: V8 requires `stackTraceLimit` to be a data property, so dynamic evidence for the limit write is sampling-based; the static write/restore pair is unambiguous.
- Upstream: dougwilson/nodejs-depd#32 (quotes this exact code; "Why is this library overwriting Error type?"), #36/#39 (interference with `--enable-source-maps`), #50. No fix shipped as of depd 2.0.0.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (12 entries), `pass-b/candidates.md` (13 entries) — same sites, slightly different granularity, 0 unresolved in both. Key entries:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-01 | `depd/index.js:386-387` -> `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | transient swap/restore; fires at import and per log |
| C-02 | `index.js:167-168` `http.OutgoingMessage.prototype.setHeader` | rejected | **read + borrow**: `var setHeader = res.set ? http.OutgoingMessage.prototype.setHeader : res.setHeader; setHeader.call(res, ...)` — bypasses an Express-style `res.set` shadow by calling the core prototype method directly; no write; prototype identity verified unchanged at runtime (core baseline `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`) |
| C-03 | `index.js:299-300` `req.cookies = res.cookies = new Cookies(...)` | rejected | library-owned expando metadata on instances (connect/express middleware contract) |
| C-04 | `index.js:244-252` `Object.defineProperty`/`deprecate.property` on `Cookie.prototype` | rejected | targets library-owned prototype only |
| C-05 | depd `wrapproperty`/`wrapfunction` descriptor machinery | rejected | only invoked against library-owned objects in this scope |
| C-06 | keygrip index.js | rejected | writes only to its own exports; crypto API calls only |
| C-07 | tsscmp lib/index.js | rejected | feature-detects/calls crypto (incl. deprecated `pseudoRandomBytes` fallback) — call-only |
| C-08 | depd browser entrypoint (`lib/browser/index.js`) | rejected | write-free no-op; unreachable under Node resolution |

## Supporting context

- `index.js:167-168` is a deliberate **defensive borrow** of the core prototype method to sidestep framework-patched `res.set`/`res.setHeader` — it depends on `http.OutgoingMessage.prototype.setHeader` remaining callable against framework response objects, which is in-contract API usage, not a patch.
- tsscmp's fallback uses deprecated `crypto.pseudoRandomBytes` (call-only; private/deprecated API usage to track, not a patch).
- cookies declares `engines: node >= 18` at this ref; no legacy-only branches found.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (5 files) | skill's six candidate pattern groups via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 5 (loader interception) and 6 (internals/bindings) zero hits in both passes; all other hits ledgered |
| `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:504-511`, `lib/internal/errors.js:136-170` | direct read at `d44625a4b80` | default `prepareStackTrace` is core-installed and user-overridable; confirms F-001 replaces core behavior |
| `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` | direct read | `setHeader` baseline for the C-02 borrow; never reassigned |
| Reproduction | `node pass-b/repro/repro.js "$PACKAGE_ROOT"`; `node pass-a/repro-error-prepare.js "$PACKAGE_ROOT"` (Node v24.19.0) | swap/restore cycles observed at require + per-log; all other surfaces unchanged; signed-cookie HTTP round trip exercised |
| Upstream depd | dougwilson/nodejs-depd#32, #36, #39, #50 | corroborate the exact code and real-world interference (`--enable-source-maps`) |

## Coverage and limitations

- All 5 runtime files read in full by both passes; dependency closure enumerated from the installed tree (no install scripts, no native code).
- The exception-leak path of `getStack()` (throw between swap and restore) is reasoned statically, not fault-injected.
- Reproduction on Node v24.19.0 only; on very old pre-bootstrap-default Node versions the swap displaces `undefined` rather than a core function — the write itself is version-independent.
- Untested runtime branches (`secureProxy`, `maxage` accessor paths, `NO_DEPRECATION`) contain no additional writes statically.
- Node baseline is main (`d44625a4b80`); the `Error.prepareStackTrace` bootstrap default exists in all current release lines.

## Changes since the previous audit

First audit of cookies in this workspace.
