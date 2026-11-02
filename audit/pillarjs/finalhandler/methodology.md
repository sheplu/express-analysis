# finalhandler — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/finalhandler (default branch `master`, HEAD `1e0227c67128dfcd0a7725c81beb4af3405a3419`, version 2.1.1); installed runtime deps with `npm install --ignore-scripts --omit=dev` (8 packages, flat tree; versions in report.md).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output. Briefs required independent assessment of on-finished's dormant branch, parseurl's expandos, and debug's import-time env behavior.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:118-124,257-259,288-296` and `on-finished/index.js:125-132` directly; merged into final report.

## Scope

- In scope: `index.js` plus all 8 resolved runtime dependencies' runtime files (each entrypoint checked before exclusion; browser-field files unreachable under Node).
- Out of scope: tests, examples, docs, devDependencies; `supports-color` (optional, not installed; read-only if present).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups + assignment sweeps over the full runtime scope. Groups 5 (loader interception) and 6 (bindings/internals) returned **zero hits** in both passes.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/http/server.js:285-286` (statusCode/statusMessage defaults), `:312` (`assignSocket`)
- `$NODEJS_SOURCE/lib/internal/http/incoming.js:77` (ctor-assigned socket), `outgoing.js:187,303-315` (kSocket init + accessor)
- Node v18.0.0 `lib/_http_outgoing.js:134` via `git show v18.0.0:...` — guard argument pinned at the oldest supported engine

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `repro-patch-check.js` + `repro-output.txt`. Pass B: `repro/repro.js` + `repro/results.json`.
- Real `http.createServer` scenarios: control, 404 via `done()`, 500 via `done(err)` with pre-set content headers + `err.headers`, error after `headersSent`.
- Zero identity/descriptor/key diffs across http OutgoingMessage/ServerResponse/IncomingMessage prototypes, `net.Socket.prototype.destroy`, EventEmitter, Object/Array/String/Function prototype keys, `Object.assign`, `Module._load/_resolveFilename`, `require.extensions`, builtin `require.cache` entries, `process.binding`, global keys — after require AND after exercise; `process.env.DEBUG` unchanged.
- Accessor traps on `Error.prepareStackTrace`/`stackTraceLimit`: **zero writes during require** (no depd in this tree).
- Behavior checks: three content headers stripped, unrelated `X-Keep` retained, `err.headers` applied, CSP/nosniff set; post-headersSent → socket destroyed (client ECONNRESET); own `assignSocket` never appeared on any message.

## Reconciliation outcome

- Verdicts identical: **no confirmed patching in the inspected scope**.
- Ledgers consistent: pass A 16 / pass B 14 entries, same sites, all rejected, 0 unresolved.
- Both passes independently rejected on-finished's `patchAssignSocket` with the same core-baseline reasoning; pass A added the strongest containment fact (finalhandler attaches on-finished to the request only, `index.js:293`) and pinned the guard at v18.0.0 as well as main.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims (teardown sites, 3-header clear, guard code re-read).

## Limitations

- Node 0.8 activation path of the dormant branch assessed statically (EOL).
- HTTP/1.1 only in repro; HEAD/HTTP2-compat/onerror branches statically cleared.
- Node baseline is main (+ v18.0.0 pin for the guard); repro on v24.19.0.
- Verdict pinned to resolved dep versions; `^` ranges may drift future resolutions.
