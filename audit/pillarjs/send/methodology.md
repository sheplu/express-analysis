# send — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/send (default branch `master`, HEAD `092f3fc77f0e796519ac328c543c11cced8f2244`, version 1.2.1) into the package worktree (`send/upstream/send`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (17 packages, flat tree verified; versions listed in report.md).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:15,690`, `http-errors/index.js:15`, `depd/index.js:105-112,195-202,380-400`, `on-finished/index.js:185-199`, `debug/src/node.js:200-212`, and Node baselines (`outgoing.js:187,304`) directly; merged into final report.

## Scope

- In scope: `index.js` plus all 17 resolved runtime dependencies' runtime files (every entrypoint checked individually before exclusion; browser-only variants excluded as unreachable under Node).
- Out of scope: tests, examples, docs, devDependencies.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups across the full runtime scope plus supplemental sweeps (assignment-to-core, env writes, descriptor machinery callers). Groups 5 (loader interception) and 6 (bindings/internals) returned **zero hits** in both passes.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` (`this[kSocket] = null` at construction), `:304` (prototype `socket` accessor) — dormancy proof for on-finished's `patchAssignSocket`
- `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:492-511`, `lib/internal/errors.js:136-170` — `Error.prepareStackTrace` baseline (F-001)
- `$NODEJS_SOURCE/lib/internal/http/server.js`, `lib/util.js` (inherits), stream/fs files along observed API usage

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `pass-a/repro-check.js`; Pass B: `pass-b/repro/repro.js` -> `results.txt`.
- Required `send`, then served real HTTP through `send(req, path).pipe(res)`: 200, Range 206, and 404 error path.
- Accessor trap on `Error.prepareStackTrace`: exactly 2 writes, both during require (swap to `prepareObjectStackTrace`, faithful restore of core `ErrorPrepareStackTrace`); none during serving.
- Zero steady-state descriptor/identity/key diffs: http OutgoingMessage/ServerResponse/IncomingMessage/ClientRequest prototypes, `fs.createReadStream`/ReadStream, stream Readable/Writable/Stream, EventEmitter, Object/Array/String/Function prototypes, `Object.assign`, `Module._load/_resolveFilename`, `require.extensions`/`require.cache`, `process.binding`, global keys.
- Confirmed no own `assignSocket` property on served responses (dormancy of C-02).

## Reconciliation outcome

- Verdicts identical: **confirmed patching** (transitive transient via http-errors -> depd; own code clean).
- Disagreements: **none**. One granularity difference: pass A one finding covering both Error-property writes, pass B two findings — merged as a single site-level finding (F-001), consistent with the cookies audit convention.
- Both passes independently discovered, analyzed, and rejected the on-finished `patchAssignSocket` dormant override with matching guard analysis and runtime confirmation.
- Ledgers consistent: 25 entries each, same sites, 0 unresolved.
- Orchestrator spot-check matched all claims (chain, depd lines, on-finished guard semantics vs core `kSocket`/accessor baseline, debug env writes).

## Limitations

- F-001 exception-leak path (throw between swap and restore) statically reasoned, not fault-injected.
- Untested send branches (HEAD/redirect/412/416) share the exercised res API surface; statically accounted.
- depd `wrapfunction`/`wrapproperty` capability exported but proven uncalled in this tree.
- Node baseline is main; repro runtime v24.19.0 — key facts confirmed on both.
- Verdict pinned to resolved dep versions; send uses `^` ranges so future resolutions may drift.
