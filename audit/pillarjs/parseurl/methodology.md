# parseurl — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/parseurl (default branch `master`, HEAD `97cab2ffdba7bdab88061bd2f415b9dfa193b9d5`, version 1.3.3); zero runtime dependencies to install; `index.js` is the sole shipped runtime file.
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output. Both were tasked to settle two classification questions: the `req._parsedUrl` memoization expandos and the legacy `Url` fast-path usage.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:13-17,48-56,78-86,125-140`; re-ran the core-baseline name sweep (`_parsedUrl|_parsedOriginalUrl|_raw` → zero hits in `incoming.js`/`url.js`); merged into final report.

## Scope

- In scope: `index.js` (full read, both passes).
- Out of scope: tests, benchmarks, docs, devDependencies.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups scoped to `index.js` (plus a package-wide sweep including out-of-scope dirs for completeness). Only group-1 hit: `require('url')`. Groups 2-6: zero hits. Supplementary: write-target sweeps, url-export mutation sweeps (zero hits).

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/http/incoming.js` — full IncomingMessage own-property (:77-106) and prototype (:115-571) member enumeration (note: implementation moved here; `lib/_http_incoming.js` is a re-export shim at this ref)
- `$NODEJS_SOURCE/lib/url.js` — `Url` constructor own props (:77-91), class export (:1025+), `Url.prototype` methods; `_raw` absence
- `lib/internal/streams/readable.js`, `lib/stream.js`, `lib/events.js` — chain-wide zero-hit name sweeps

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `pass-a/verify.js` (PASS). Pass B: `pass-b/repro/repro.js` -> `repro/results.json`.
- Real `IncomingMessage` via `http.createServer`; exercised fast path, memoized repeat (`p1 === p2`), changed-url re-parse, absolute-URL slow path (`url.parse`), `parseurl.original` + repeat.
- Zero identity/descriptor/key diffs across url exports + `Url.prototype`, IncomingMessage prototype, Object/Array/String/Function prototypes, `Object.assign`, `Module._load/_resolveFilename`, `require.extensions`, `process.binding`, global keys. Expandos verified instance-own only; no prototype/own-member shadowing; cached object is a genuine core `Url` instance.

## Reconciliation outcome

- Verdicts identical: **no confirmed patching in the inspected scope**.
- Both classification questions resolved identically and independently: expandos = library-owned cache keys (not overrides); `Url` usage = construction of the exported class + own-prop population (not mutation).
- Ledgers consistent: pass A 7 entries / pass B 6 entries, same sites, all rejected, 0 unresolved.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims (sites re-read; core name sweep re-run).

## Limitations

- Node baseline is current main; parseurl supports node >= 0.8 — ancient-Node member sets could differ, but the rejection logic (no writes to shared objects in any branch) is version-independent.
- `Url === undefined` fallback branch statically proven harmless (plain `{}`), not runtime-reachable on modern Node.
- Repro on v24.19.0; npm tarball equivalence not separately verified (single-file package pinned by git clone).
