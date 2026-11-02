# Node.js patch audit: parseurl

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#26 — `parseurl` (parse a url with memoization), https://github.com/pillarjs/parseurl
- Library: parseurl 1.3.3, default branch `master` @ `97cab2ffdba7bdab88061bd2f415b9dfa193b9d5`, git clone of upstream; no local changes. Runtime artifact: `index.js` only (npm `files`: LICENSE, HISTORY.md, README.md, index.js; sha256 index.js `224745e74c44c27457c078da8cf22ad39f6203beff603b08e0c948a435ca4e84`, package.json `76d0dc303504cdfdd2a75ed9c01095d17b24c088beba6f9367abf2826074c053`)
- Node.js baseline: main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` ($NODEJS_SOURCE, read-only, unmodified)
- Reproduction runtime: node v24.19.0 (`node verify.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only — `$PACKAGE_ROOT/index.js` read in full; **zero runtime dependencies** (no `dependencies`/`optionalDependencies`/`peerDependencies`, no install/lifecycle scripts). Tests, benchmarks, docs, devDependencies out of scope per the audit brief.
- Coverage: source — complete (entire runtime file read; all six skill candidate pattern groups plus targeted searches run); upstream — joyent/node#7878 reference corroborated via gh; runtime — verify.js passed on node 24.19.0. This is pass A of a blind two-pass protocol.

## Patching verdict

No patching was demonstrated. Shared core mutations: **0**. Instance/application
overrides of core behavior: **0**. All code is direct (no dependencies, so no
transitive origin is possible). 7 candidates were traced to exact writes and all
were rejected as patches; 0 unresolved. parseurl's only writes are (a) two
library-owned cache expandos on the caller-supplied request object
(`req._parsedUrl`, `req._parsedOriginalUrl`), (b) a library-owned `_raw`
freshness tag on `Url` instances the library itself creates per call, and
(c) own-property population of a freshly constructed legacy `Url` instance. It
never assigns to the `url` module's exports, `Url`, `Url.prototype`,
`IncomingMessage.prototype`, any global, module loading machinery, or core
source. Dynamic before/after comparison confirms core identities and prototype
key sets are unchanged after load and exercise.

### Domain-specific classifications requested by the brief

1. **`req._parsedUrl` / `req._parsedOriginalUrl` expandos — classified as
   library-owned cache keys, not instance overrides of core behavior.**
   Exactly what is written: `req._parsedUrl = parsed` (index.js:54) and
   `req._parsedOriginalUrl = parsed` (index.js:84), where `parsed` is a legacy
   `Url`-shaped object carrying an added own `_raw` string (index.js:52, 82).
   Plain own-data-property assignments (no `defineProperty`, no accessor). At
   the Node baseline, `IncomingMessage` defines own properties `socket`,
   `httpVersionMajor/Minor`, `httpVersion`, `complete`, `rawHeaders`,
   `rawTrailers`, `joinDuplicateHeaders`, `aborted`, `upgrade`, `url`, `method`,
   `statusCode`, `statusMessage`, `client`, `_consuming`, `_dumped`
   ($NODEJS_SOURCE lib/internal/http/incoming.js:77-106) and prototype members
   `connection`, `headers`, `headersDistinct`, `trailers`, `trailersDistinct`,
   `signal`, `setTimeout`, `_read`, `_destroy`, `_addHeaderLines`,
   `_addHeaderLine`, `_addHeaderLineDistinct`, `_dumpAndCloseReadable`, `_dump`
   (lib/internal/http/incoming.js:115-571). Neither expando name exists
   anywhere on the instance, its prototype, or the Readable/Stream/EventEmitter
   chain (targeted zero-hit searches; verify.js prototype-chain assertion), so
   **no core-defined member is shadowed or replaced** and no core code reads
   these keys. The core-defined `req.url` (lib/internal/http/incoming.js:95) is
   only read, never written (index.js:36). This is "merely adding request
   metadata / defining library-owned" state per the skill — not a patch.

2. **`url.parse` / `Url` usage — classified as read-only legacy-API consumption
   plus library-owned construction; no mutation.** index.js:15-17 captures
   `url.parse` and `url.Url` into locals; nothing is ever assigned back to the
   module exports or to `Url.prototype` (zero hits; verify.js identity checks
   pass). The fast path (index.js:128-139) instantiates core's **publicly
   exported** legacy `Url` class (`new Url()`, index.js:129; export at
   $NODEJS_SOURCE lib/url.js:1025+) and hand-populates `path`, `href`,
   `pathname`, `query`, `search` — own data properties the `Url` constructor
   itself initializes to `null` (lib/url.js:77-89) — on a fresh instance the
   library owns, bypassing `Url.prototype.parse`. That bypass is
   legacy/private-API-shaped usage (supporting context), not a patch: no shared
   object is mutated. The slow path calls `parse(str)` (index.js:97, 124),
   which returns a fresh `Url` per call. `instanceof Url` in `fresh()`
   (index.js:156) is a read-only check, guarded for environments where
   `url.Url` is undefined.

## Confirmed Node.js patches

None. No reachable write or replacement of core APIs, globals, shared
prototypes, core-backed instance behavior, core module loading, or core source
was found. (Private API usage and the copied fast-path algorithm are in
supporting context below, per the skill.)

## Candidate ledger and unresolved questions

Full ledger with evidence in [candidates.md](candidates.md); summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | index.js:54 `req._parsedUrl = parsed` on core-backed IncomingMessage | rejected as patch | Library-owned cache expando; name absent from core baseline (lib/internal/http/incoming.js, full member enumeration); instance-own only (verify.js) |
| C-002 | index.js:84 `req._parsedOriginalUrl = parsed` | rejected as patch | Same as C-001; trigger property `originalUrl` is Express-defined, read-only here |
| C-003 | index.js:52,82 `parsed._raw = url` on legacy `Url` instance | rejected as patch | Own prop on per-call library-created object; `_raw` absent from lib/url.js; `Url.prototype` untouched |
| C-004 | index.js:128-139 `new Url()` + manual field population | rejected as patch | Fresh instance of publicly exported class; own-prop writes over constructor-initialized `null` fields; no shared-state mutation |
| C-005 | index.js:15-17 capture of `url.parse` / `url.Url` | rejected as patch | Read-only; no assignment to module exports; identities unchanged after load (verify.js) |
| C-006 | index.js:36 / index.js:66 reads of `req.url` / `req.originalUrl` | rejected as patch | Reads only; core `req.url` never written |
| C-007 | index.js:104 regex copied from joyent/node#7878 | rejected as patch | Standalone copy of an unmerged core PR's approach inside library code; no core rewrite |

Unresolved: none.

## Supporting context

- **Legacy/deprecated core API usage:** parseurl is built on the legacy
  `url.parse`/`Url` API (runtime emits DEP0169 on node 24.19.0). The fast path
  depends on the `Url` object shape (own fields `path`/`href`/`pathname`/
  `query`/`search`) and constructs `Url` instances without calling
  `Url.prototype.parse`. If core ever removed or reshaped the exported `Url`,
  the library degrades (its `Url !== undefined` guards at index.js:128 and
  index.js:156 fall back to a plain object / skip the `instanceof` check) — a
  compatibility concern, not a patch.
- **Copied core-proposal algorithm (C-007):** the fast-path character loop
  unrolls the regex from joyent/node#7878 ("Add fast path for simple URL
  parsing", CLOSED/unmerged). A standalone reimplementation in library code;
  it does not replace `url.parse` for anyone else.
- **Ecosystem contract on the expandos:** `req._parsedUrl` is a de-facto
  Express-ecosystem convention (set here, read by other pillarjs/express
  middleware), scoped per request instance. It is ecosystem-shared state on the
  request, not Node core state.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/index.js | read in full; six skill pattern groups + targeted searches (see [searches.md](searches.md)) | Only core touchpoints: `require('url')` (index.js:15), request expando writes (54, 84), `Url` instance writes (52, 82, 128-139). G2-G6 zero hits |
| $PACKAGE_ROOT/package.json | read; entrypoint/lifecycle search | No runtime deps, no install scripts, no exports/main overrides; entrypoint = index.js |
| $NODEJS_SOURCE lib/http.js:33, lib/_http_incoming.js:32 | re-export trace | IncomingMessage resolved to lib/internal/http/incoming.js at this ref |
| $NODEJS_SOURCE lib/internal/http/incoming.js | member enumeration + name search | `_parsedUrl`/`_parsedOriginalUrl`/`originalUrl`/`_raw` absent; `this.url` own prop at line 95 |
| $NODEJS_SOURCE lib/internal/streams/readable.js, lib/stream.js, lib/events.js | expando-name search | zero hits — no prototype-chain collision |
| $NODEJS_SOURCE lib/url.js | Url constructor (77-89), prototype (177, 634, 724, 733, 1003), exports (1025+); `_raw` search | `Url` and `parse` publicly exported; `_raw` not core-defined |
| nodejs/node-v0.x-archive PR 7878 | https://github.com/nodejs/node-v0.x-archive/pull/7878 | "Add fast path for simple URL parsing" — CLOSED, unmerged; provenance of copied regex only |
| Reproduction | `node verify.js "$PACKAGE_ROOT"` (node v24.19.0) | PASS: `url.parse`/`url.Url` identities, `url` module keys, `Url.prototype` keys, `IncomingMessage.prototype` keys unchanged; expandos instance-own only; unrelated instances unaffected; memoization returns cached object |

## Coverage and limitations

- Entry points: single entrypoint `index.js` (implicit main), read in full. No
  conditional/optional entrypoints, no bundled/dist output, no install scripts.
- Dependencies: none at runtime; nothing transitive to inspect.
- Node.js files selected per the skill table from the observed API surface:
  lib/url.js and the http IncomingMessage implementation
  (lib/http.js -> lib/internal/http/incoming.js at d44625a4b80), plus bounded
  expando-name checks in the IncomingMessage prototype-chain files. No
  recursive scan of the Node tree.
- Baseline skew: the Node baseline is current main (d44625a4b80); parseurl
  supports node >= 0.8. Member names could differ at very old Node versions,
  but the rejection logic (library-owned names absent from core; no writes to
  shared objects) is version-independent: the library performs no prototype,
  export, or loader writes under any branch. Both `Url`-undefined fallback
  branches (index.js:128-130, 156) were read statically; the fallback path
  (plain `{}`) touches no core object at all. Dynamic run covered fast path,
  slow path (`#` in URL), memoized hit, and `original` path on node 24.19.0
  only; this cannot prove universal absence across all runtimes, but static
  proof suffices here.
- Blind-pass constraint honored: nothing outside `audit/pillarjs/parseurl/pass-a/`
  under the audit root was read.
- What would change the verdict: discovery of a shipped file outside `files`
  executed at install/require time (none exists), or a core-defined
  `_parsedUrl`/`_parsedOriginalUrl`/`_raw` member at some Node version (none
  found at the baseline; names are ecosystem-originated).

## Changes since the previous audit

First audit (pass A of blind two-pass protocol); no previous report.
