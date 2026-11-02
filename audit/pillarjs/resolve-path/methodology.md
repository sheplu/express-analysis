# resolve-path — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/resolve-path (default branch `master`, HEAD `4b98ecfd39a342fbf8b909844a9ec13fe2fa8cc5`, version 1.4.0); installed runtime deps with `npm install --ignore-scripts --omit=dev` — resolving the **older dependency generation**: http-errors@1.6.3, path-is-absolute@1.0.1, depd@1.1.2, setprototypeof@1.1.0, statuses@1.5.0, inherits@2.0.3 (nested under http-errors). Orchestrator verified tree self-containment (`inherits` nested, UNMET entries = devDeps correctly omitted) before launching passes.
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output. Briefs flagged the old-generation versions as requiring independent assessment (no assumptions from newer majors).
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `depd/index.js:363-384` (getStack), `:8-13` (compat require), `:108-112`/`:400-415` (getStack callers + eval wrapper), `lib/compat/index.js:21-43` (lazy detection swap), `http-errors/index.js:15,245-250` (chain + teapot wrap); merged into final report.

## Scope

- In scope: `index.js` plus all resolved runtime dependencies' runtime files (each entrypoint checked before exclusion; browser-field files excluded as unreachable under Node).
- Out of scope: tests, docs, devDependencies, legacy fallback branches dead on modern Node (statically cleared).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups plus eval/stack-machinery sweeps. Groups 5 (loader interception) and 6 (bindings/internals) returned **zero hits** in both passes; the eval hit was ledgered and classified (library-owned target).

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/errors.js:136-166` (prepareStackTrace delegation/baseline), `:181-188` (core's own transient stackTraceLimit idiom — tempering context)
- `$NODEJS_SOURCE/lib/util.js:344-363` (`util.inherits` contract — mutates only passed ctors)

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `probe-transient-writes.js` (accessor spy) + `probe-identities.js` (before/after identity probe). Pass B: `repro/repro.js` -> `repro/repro-output.txt`.
- Result: exactly **3 `Error.prepareStackTrace` swap/restore pairs during require** (compat lazy detection with `stackTraceLimit = 2`; two `getStack()` calls with limit raised to 10 — the second via http-errors' import-time `deprecate.function` wrap of `"I'mateapot"`), **0 swaps** while exercising success/403 traversal/400 NUL/400 absolute paths; full restoration verified.
- Before/after diffs empty across: path exports (incl. `isAbsolute` identity), Error/Object/Array/String/Function prototype keys, `Object.assign`/`setPrototypeOf`, `Module._load/_resolveFilename/_compile`, `require.extensions`, `process.binding`, global keys.
- Methodology note: `Error.stackTraceLimit` cannot be accessor-trapped — V8 reads it with data-property semantics; the attempted trap disabled stack capture and crashed depd's own feature detection (itself evidence of the intrinsic coupling). Transient values were logged at `prepareStackTrace` set events instead.

## Reconciliation outcome

- Verdicts identical: **confirmed patching** (transient, transitive via http-errors@1.6.3 -> depd@1.1.2; own code clean).
- Finding granularity reconciled to the site convention: F-001 = `getStack()` site, F-002 = compat lazy-detection site (pass A had split by property across both sites; pass B by site — substance identical: same 4 write lines, same chains, same 3 require-time windows).
- Both passes independently: counted 3 import-time swap/restore pairs; classified the eval wrapper as library-owned (not core) while flagging the hardening-flags incompatibility; verified setprototypeof identity === native; verified path-is-absolute never touches `path`.
- Ledgers consistent: pass A 20 / pass B 16 entries, same substantive sites, 0 unresolved.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims.

## Limitations

- Repro on v24.19.0 only; restoration argument static/synchronous, version-independent.
- Unexecuted branches statically cleared (legacy fallbacks, wrapproperty, browser files, runtime log windows — same mechanism as demonstrated).
- Node baseline is main, not a release tag; consulted baselines stable across lines.
- Verdict pinned to resolved versions (`~1.6.3` keeps this package on the old depd line until upstream updates).
