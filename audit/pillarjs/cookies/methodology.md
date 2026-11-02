# cookies — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/cookies (default branch `master`, HEAD `6e35de1524bb55d5deac3edcf67c2ac374d658d0`, version 0.9.2) into the package worktree (`cookies/upstream/cookies`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (depd@2.0.0, keygrip@1.1.0, tsscmp@1.0.6).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js` (:10 depd import, :167-168 setHeader borrow, :244-252 Cookie.prototype definitions, :299-300 middleware expandos), `depd/index.js:380-400` (`getStack()`), and Node baselines (`realm.js:504-511`, `errors.js:136-170`) directly; merged into final report.

## Scope

- In scope: `index.js` (library root) and all three resolved runtime dependencies — depd (index.js + browser variant), keygrip, tsscmp. All 5 runtime files read in full by both passes.
- Out of scope: tests, examples, docs, devDependencies.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups (core imports; globals/Buffer/process; prototype & descriptor mutation; patch vocabulary; loader interception; internals/bindings) over the 5 runtime files, plus supplemental Error/core-assignment sweeps. Loader-interception and internals/bindings groups returned **zero hits** in both passes.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:504-511` — bootstrap installs the default `Error.prepareStackTrace` (writable data property)
- `$NODEJS_SOURCE/lib/internal/errors.js:168` (default impl), `:136-156` (V8 callback honoring userland assignment)
- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:813` (`setHeader` baseline for the index.js:167 borrow)

## Runtime reproduction

- Node v24.19.0. Pass A: `pass-a/repro-error-prepare.js` (instrumented accessor on `Error.prepareStackTrace`). Pass B: `pass-b/repro/repro.js` -> `results.json`, `summary.txt`.
- Observed: swap/restore cycles of `prepareStackTrace` at `require('cookies')` (2 cycles) and during a deprecated-API call (1 cycle); sentinel `stackTraceLimit=3` seen as 10 inside depd captures and restored afterwards; signed-cookie HTTP round trip (set + `.sig` + get/verify) succeeded.
- Before/after diffs: http OutgoingMessage/IncomingMessage/ServerResponse method identities and descriptors, crypto functions, `Object.assign`, `Module._load/_resolveFilename`, `require.extensions`, builtin `require.cache` entries, `process.binding`, Object/Array/String/Function/Error prototype key sets, global keys — **all unchanged**; `Error` state ends at baseline.
- Methodology note: V8 requires `Error.stackTraceLimit` to be a data property (accessor traps disable capture), so the limit write is evidenced by sampling + the unambiguous static swap/restore pair.

## Reconciliation outcome

- Verdicts identical: **confirmed patching** (transitive, transient, via depd@2.0.0; own code clean).
- Disagreements: **none**. One granularity difference: pass A reported one finding covering both property writes; pass B split them (F-001 prepareStackTrace, F-002 stackTraceLimit). Merged as a single site-level finding (F-001) documenting both mutations, matching the per-site convention.
- Ledgers consistent: pass A 12 entries / pass B 13 entries, same sites, 0 unresolved.
- Orchestrator spot-check matched all claims (depd getStack lines, cookies call sites, setHeader borrow semantics, Node bootstrap baseline).

## Limitations

- Exception-leak path in `getStack()` (throw between swap and restore) statically reasoned, not fault-injected.
- Reproduction on Node v24.19.0 only; the writes are version-independent, but what they displace differs on ancient runtimes (pre-bootstrap-default: `undefined` instead of a core function).
- Verdict pinned to resolved dep versions (depd@2.0.0, keygrip@1.1.0, tsscmp@1.0.6); cookies declares `~2.0.0`/`~1.1.0`.
- Node baseline is main; the bootstrap-installed `prepareStackTrace` default exists in all current release lines.
