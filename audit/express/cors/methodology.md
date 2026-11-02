# cors — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/expressjs/cors (default branch `master`, HEAD `5317ebe670db2aaebc1d496eb5d33493deefb3ed`, version 2.8.6) into the package worktree (`cors/upstream/cors`); installed runtime deps with `npm install --ignore-scripts --omit=dev` (`object-assign@4.1.1`, `vary@1.1.2`).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `lib/index.js` (imports, preflight path, header application), `object-assign/index.js` (saved refs + export), `vary/index.js` (`vary()` function) directly; merged into final report.

## Scope

- In scope: `lib/index.js` (238 lines, read in full by both passes), both resolved runtime dependencies (read in full).
- Out of scope: tests, examples, docs, devDependencies.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups (core imports; globals/Buffer/process; prototype & descriptor mutation; patch vocabulary; loader interception; internals/bindings) plus pass B's supplemental exhaustive assignment sweep (`=` writes on non-local objects). All loader-interception, internals, and global-mutation sweeps returned **zero hits**.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/http/outgoing.js` (`setHeader` :813, `getHeader` :914, `end` :1289)
- `$NODEJS_SOURCE/lib/internal/http/server.js` (`statusCode` prototype default :285)
- Confirmed public `_http_*.js` files are re-export shims at this commit

## Runtime reproduction (pass B)

- Node v24.19.0, script in `pass-b/repro/`.
- Snapshot of HTTP prototype descriptors, `Object.assign` identity, `Object`/`String` prototypes, `Module._load`, `require.extensions`, `process.binding` before `require('cors')` and after exercising preflight + simple request paths: **no changes**; response instance gained only own `statusCode`/`statusMessage` data props.

## Reconciliation outcome

- Verdicts identical: no confirmed patching in the inspected scope.
- Ledgers consistent: pass A 13 entries / pass B 12 entries, same sites, all rejected, 0 unresolved.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims.

## Limitations

- Verdict pinned to resolved dep versions (`object-assign@4.1.1`, `vary@1.1.2`); cors declares `^4.1.1`/`^1.1.2`.
- `object-assign` legacy fallback branch assessed statically (dead on supported Node; local-target mutation only).
- Node baseline is main; classification is unchanged for release lines (documented API surface involved only).
