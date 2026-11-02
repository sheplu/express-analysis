# router — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/router (default branch `master`, HEAD `098ea782ee6dadbedda778470a177ccd813c95a0`, package version 2.2.0 — 21 commits ahead of the v2.2.0 tag); installed runtime deps with `npm install --ignore-scripts --omit=dev` (debug@4.4.3, depd@2.0.0, is-promise@4.0.0, ms@2.1.3, parseurl@1.3.3, path-to-regexp@8.4.2).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output. Briefs required explicit answers on (a) whether depd's getStack fires at require time and on which chain, and (b) classification of the req.url/params restoration machinery.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:14-16` (requires), `lib/param.js:9`, `lib/layer.js:18` (depd factories), `index.js:335-343` (trimPrefix), `:198-210` (restoration), `:712-729` (`restore()`), `:747-754` (OPTIONS); verified Node baselines (`incoming.js:95`, `common.js:105`); merged into final report. Origin for F-001 recorded as **direct** (depd is router's own dependency), correcting a loose "transitive" label in one pass summary.

## Scope

- In scope: `index.js` + the full `lib/` runtime set at this head (layer.js, route.js, param.js, symbols.js, tracing.js — the latter three beyond the brief's named files, discovered and audited by both passes) plus all 6 resolved runtime dependencies.
- Out of scope: tests, scripts/, eslint config, `index.d.ts`, devDependencies; `supports-color` absent from install.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups + supplemental req/res-write and env sweeps across the full runtime scope. Groups 5 (loader interception) and 6 (bindings/internals): **zero hits** in both passes.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/http/incoming.js:95` (`this.url = ''` ctor init) and `lib/internal/http/common.js:105` (`incoming.url = url` parser assignment) — F-002 baseline (core populates the property router rewrites)
- `$NODEJS_SOURCE/lib/internal/bootstrap/realm.js:503-511`, `lib/internal/errors.js:168` — F-001 baseline
- IncomingMessage member sets (expando classification)

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `repro-require-and-dispatch.js`. Pass B: `repro/repro.js` -> `repro/results.json`.
- Real http server: mounted sub-router with `:id` param (`/api` prefix), 404 final-handler fallthrough, automatic OPTIONS (`Allow: GET, HEAD, PUT` + 3 more headers + end), throwing route handled by error middleware.
- Error-hook accessor trap: **exactly 2 swap/restore cycles, all during `require('router')`** (chains: param.js:9, layer.js:18); none during dispatch; identity-exact restore of Node's `ErrorPrepareStackTrace`. (Accessor-trapping `stackTraceLimit` is infeasible — V8 data-property semantics; the attempt crashed depd at require, independently proving the import-time execution.)
- F-002 verified live: wire `/api/users/42?x=1` observed in-handler as `/users/42?x=1`; full restoration on the 404 continuation (`urlEqualsEntry: true`; baseUrl/next/params reverted).
- Zero diffs across before/afterRequire/afterExercise on http/EventEmitter/Object/Array/String/Function prototypes, `Object.assign/setPrototypeOf/defineProperty`, `Module._load/_resolveFilename`, `require.extensions`, builtin `require.cache`, `process.binding`, global keys; `process.env.DEBUG` unchanged.

## Reconciliation outcome

- Verdicts identical: **confirmed patching** — and, notably, **identical finding classifications** including the judgment call (req.url rewrite = transient instance-level override): no adjudication needed.
- Both passes independently answered the brief's two questions identically (depd fires 2x at require on the param/layer chains; restore() machinery = expando hygiene, distinct from the url rewrite).
- Ledgers consistent: pass A 22 / pass B 18 entries, same substantive sites, 0 unresolved.
- Disagreements: **none**. One origin-label correction at reconciliation (F-001 is a direct dependency patch).
- Orchestrator spot-check matched all claims.

## Limitations

- Master is ahead of the release tag (param split, tracing, listRoutes); both findings verified present in released 2.2.0 code paths as well.
- mergeParams/regexp-layer/listRoutes paths statically cleared, not runtime-exercised.
- `--enable-source-maps` interaction cited from upstream (depd#36), not re-reproduced.
- Node baseline is main; repro on v24.19.0.
