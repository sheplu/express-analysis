# Node.js patch audit: parseurl

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#26 (`parseurl`, https://github.com/pillarjs/parseurl)
- Library: parseurl 1.3.3, git master @ `97cab2ffdba7bdab88061bd2f415b9dfa193b9d5`, cloned repository; **zero runtime dependencies**; sole runtime file `index.js`; no install scripts
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; real `IncomingMessage` via `http.createServer`)
- Scope: production/runtime code — `index.js` read in full by both passes. Tests, benchmarks, docs, devDependencies excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream corroboration for the copied fast-path regex (joyent/node#7878)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements; key sites re-verified directly during reconciliation.

## Patching verdict

parseurl does **not** patch or monkeypatch Node.js core. Its entire core interaction is: one read-only `require('url')` capture (`index.js:15-17` — `url.parse` and `url.Url` into locals, never assigned back), instantiation of the **exported** legacy `Url` class in its fast path, and two **library-owned cache expandos** on the request instance. Both domain-specific questions resolved identically in both passes:

1. **Memoization expandos — library-owned cache keys, not overrides.** `req._parsedUrl = parsed` (`index.js:54`) and `req._parsedOriginalUrl = parsed` (`index.js:84`) are plain own data properties. Neither name — nor `_raw` — exists anywhere in core at the baseline (`$NODEJS_SOURCE/lib/internal/http/incoming.js` own props :77-106 and prototype :115-571, `lib/url.js`, the Readable/Stream/EventEmitter chain: zero hits). No core member is shadowed or replaced; core's `req.url` is only read.
2. **Legacy `Url` usage — construction, not mutation.** `fastparse` (`index.js:95-142`) does `new Url()` (public export, `lib/url.js:1025+`) and hand-populates `path/href/pathname/query/search` — own properties the `Url` constructor null-initializes (`lib/url.js:77-91`) — on a fresh, library-held instance; `Url.prototype` and the `url` module exports are never touched. The cached object is a genuine core `Url` instance (prototype verified `=== url.Url.prototype`).

0 confirmed patches; 0 unresolved candidates; no transitive surface.

## Confirmed Node.js patches

None. No candidate survived verification.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (7 entries), `pass-b/candidates.md` (6 entries) — same sites, all rejected, none unresolved:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:54` `req._parsedUrl = parsed` | rejected | library-owned own data property; name absent from core (incoming.js/stream chain); writable/enumerable/configurable; unrelated instances unaffected (runtime-verified) |
| R-02 | `index.js:84` `req._parsedOriginalUrl = parsed` | rejected | same classification |
| R-03 | `index.js:52,82` `parsed._raw = url` | rejected | freshness tag on the library-held parse result; `_raw` absent from `lib/url.js` |
| R-04 | `index.js:128-139` `new Url()` + own-prop population | rejected | fresh instance of the exported class; same own props the ctor null-initializes; `Url.prototype` untouched |
| R-05 | `index.js:15-17` export capture (`url.parse`, `url.Url`) | rejected | read-only; nothing assigned back to module exports (identity-verified at runtime) |
| R-06 | `index.js` reads of `req.url` / `req.originalUrl` | rejected | reads only (`originalUrl` is an Express-layer property) |
| R-07 | fast-path regex copied from joyent/node#7878 | rejected | upstream PR **closed/unmerged**; standalone copy living in library code; no core rewrite (gh-corroborated) |

## Supporting context

- Bypassing `Url.prototype.parse` by hand-populating a `new Url()` is legacy/private-API-*shaped* usage worth tracking (the object relies on `Url`'s internal shape), but involves no mutation of shared state.
- `url.parse` is runtime-deprecated (DEP0169) — consumption-side exposure, not a patch; the repro surfaced the deprecation warning.
- The `Url === undefined` fallback (`index.js:128-131`) builds a plain `{}` — harmless, unreachable on modern Node.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `index.js` (sole runtime file, full read) | skill's six candidate pattern groups scoped to it (logs: `pass-a/searches.md`, `pass-b/searches.md`) | only group-1 hit is `require('url')`; groups 2-6 zero-hit; package-wide sweep also clean |
| `$NODEJS_SOURCE/lib/internal/http/incoming.js` (own props :77-106, prototype :115-571), `lib/url.js` (:77-91 ctor, :1025+ export), `lib/_http_incoming.js` (re-export shim), stream/events chain | direct reads at `d44625a4b80` | full member-set enumeration: `_parsedUrl`/`_parsedOriginalUrl`/`_raw` absent from core; nothing shadowed |
| Reproduction | `node pass-a/verify.js "$PACKAGE_ROOT"`; `node pass-b/repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | fast/slow/memoized (`p1 === p2`)/changed-url/original paths on a real IncomingMessage: zero identity/descriptor/key diffs across url exports + `Url.prototype`, IncomingMessage prototype, Object/Array/String/Function prototypes, `Object.assign`, Module._*, `require.extensions`, `process.binding`, global keys; only `require.cache` gained the library's own entry |
| Upstream | joyent/node#7878 | fast-path regex source PR: closed/unmerged; standalone copy, no implemented core accommodation |

## Coverage and limitations

- Node baseline is current main while parseurl supports node >= 0.8 — member names could differ on ancient Node, but the rejection logic is version-independent (no writes to any shared object under any branch).
- Repro on v24.19.0 only; static proof suffices for all claims.
- npm tarball vs git tag equivalence not separately checked (audit pinned to the git clone; single-file package).

## Changes since the previous audit

First audit of parseurl in this workspace. (Consistent with the expressjs-org run's serve-favicon audit, which classified `req._parsedUrl` as a library cache key from the consumer side.)
