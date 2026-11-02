# Node.js patch audit: parseurl

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#26 — `parseurl` (parse a url with memoization), https://github.com/pillarjs/parseurl
- Library: parseurl 1.3.3, default branch `master` @ `97cab2ffdba7bdab88061bd2f415b9dfa193b9d5`, git clone at `$PACKAGE_ROOT`, unmodified
- Node.js baseline: nodejs/node main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only checkout at `$NODEJS_SOURCE`, unmodified
- Reproduction runtime: Node v24.19.0 (`node repro/repro.js "$PACKAGE_ROOT"`)
- Scope: runtime/production code only. Sole entrypoint `index.js` (package.json `main` default; `files` ships only LICENSE, HISTORY.md, README.md, index.js). **Zero runtime dependencies** (no `dependencies` field). Tests, benchmarks, docs, devDependencies out of scope. No install/postinstall scripts.
- Coverage: source — complete (index.js read in full, 158 lines; six candidate pattern groups + manual assignment inventory); upstream — bounded history and in-code references checked; runtime — full before/after snapshot repro executed, all assertions passed.

## Patching verdict

No patching was demonstrated. Shared core mutations: **0**. Instance/application overrides: **0**. Transitive origin: not applicable (zero runtime dependencies). Unresolved candidates: **0**; rejected candidates: **6** (see ledger).

parseurl's entire interaction with Node core is: one read-only `require('url')` (index.js:15) capturing `url.parse` and `url.Url`; instantiation of the legacy `Url` class for its fast path; and two library-owned cache expandos written onto the caller-supplied request object. It never writes to a core module's exports, any shared prototype (`Url.prototype`, `IncomingMessage.prototype`, JS builtins), module loading machinery, process bindings, or globals, and it never shadows or replaces any core-defined member on the instances it touches.

### Domain question 1 — `req._parsedUrl` / `req._parsedOriginalUrl` expandos

Classification: **library-owned per-instance cache keys, not instance overrides of core behavior.**
index.js:54 and index.js:84 add own data properties `_parsedUrl` / `_parsedOriginalUrl` to the `IncomingMessage` instance. At the Node baseline, neither name exists anywhere on `IncomingMessage` (constructor own props: socket, httpVersion*, complete, rawHeaders/rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped; prototype: connection/headers/headersDistinct/trailers/trailersDistinct/signal accessors, setTimeout, _read, _destroy, _addHeaderLines, _addHeaderLine, _addHeaderLineDistinct, _dumpAndCloseReadable, _dump — `$NODEJS_SOURCE` lib/internal/http/incoming.js; `rg '_parsedUrl|_parsedOriginalUrl|originalUrl'` over lib/internal/http/incoming.js, lib/_http_incoming.js, lib/http.js, lib/url.js: zero hits). No core member is shadowed or replaced and no core code path consumes these keys; `req.originalUrl` (index.js:66) is only read and is an Express-layer property. Runtime repro confirms the only own properties added by the library are `_parsedUrl` and `_parsedOriginalUrl`, both plain writable/enumerable/configurable data properties, shadowing nothing (prototype-shadow and own-prop-shadow checks both returned empty lists).

### Domain question 2 — `url.parse` / `Url` usage

Classification: **read-only use of core exports plus instantiation of the exported legacy `Url` class; no mutation of the `url` module or `Url.prototype`.**
index.js:16-17 capture `url.parse`/`url.Url` by read. `fastparse` (index.js:95-142) either calls `parse(str)` (fresh `Url` instance per call) or constructs `new Url()` and assigns own properties `path`, `href`, `pathname`, `query`, `search` — the same own properties the `Url` constructor initializes to null (`$NODEJS_SOURCE` lib/url.js:77-91) and that `Url.prototype.parse` populates on its own instances. `Url.prototype` (parse/format/resolve/resolveObject/parseHost, lib/url.js:177-1003) is never touched. The `_raw` tag (index.js:52,82) is added to the freshly created, library-held result object and collides with nothing in lib/url.js. Runtime repro: `url.parse`, `url.Url`, `url.Url.prototype`, and all five prototype methods are identity- and descriptor-stable before/after require and exercise; the cached object is a genuine core `Url` instance (`Object.getPrototypeOf(req._parsedUrl) === url.Url.prototype`).

## Confirmed Node.js patches

None. No reachable write or replacement of core APIs, globals, shared prototypes, core-backed instance members defined by core, core module loading, or core source was found. (Private-API-shaped behavior and instance metadata are in Supporting context; they do not establish a patch.)

## Candidate ledger and unresolved questions

Full ledger with rejection rationale in `candidates.md`. Summary:

| ID | Site and core target | Status | Reason (abridged) |
| --- | --- | --- | --- |
| C-001 | index.js:54 `req._parsedUrl = parsed` (IncomingMessage instance) | rejected as patch | Library-owned cache key; name absent from core IncomingMessage; shadows nothing; no core consumer |
| C-002 | index.js:84 `req._parsedOriginalUrl = parsed` (IncomingMessage instance) | rejected as patch | Same as C-001; `originalUrl` only read, Express-layer property |
| C-003 | index.js:52,82 `parsed._raw = url` (fresh Url instance/plain object) | rejected as patch | Tag on freshly created, library-held object; `_raw` absent from lib/url.js |
| C-004 | index.js:128-139 `new Url()` + own-prop assignment | rejected as patch | Instantiates exported legacy class; own-prop writes on new instance only; `Url.prototype` untouched |
| C-005 | index.js:15-17 capture of `url.parse`/`url.Url` | rejected as patch | Read-only; export identities/descriptors verified stable at runtime |
| C-006 | index.js:24-25 `module.exports` writes | rejected as patch | Library's own module object only |

Unresolved: none.

## Supporting context

- **Hand-built partial `Url` objects (C-004):** the fast path returns a `new Url()` populated with only `path`/`href`/`pathname` (+ `query`/`search`), relying on the constructor's null-initialization of the remaining fields. This depends on the shape of a deprecated legacy class (`DEP0169` warns on `url.parse` use at runtime) — private-API-shaped coupling, not a patch. The `Url === undefined ? {} : new Url()` guard targets environments without the `Url` export.
- **Copied core technique, not replaced core:** index.js:104 comment cites joyent/node#7878; the unrolled character loop reimplements the regexp that core itself still uses (`simplePathPattern`, `$NODEJS_SOURCE` lib/url.js:101,258). A standalone copy inside the library; core's implementation is unmodified.
- **Cache-freshness guard reads core class identity:** `fresh()` (index.js:153-158) uses `parsedUrl instanceof Url` and `parsedUrl._raw === url` — reads only; this is also why the cached value must be a real `Url` instance.
- **Node main refactor note:** on the audited Node main, the IncomingMessage implementation lives in lib/internal/http/incoming.js; lib/_http_incoming.js is a deprecated re-export shim (DEP0199). parseurl references neither — it only ever receives the request object as an argument.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| $PACKAGE_ROOT/index.js | full read + six pattern groups (`rg -n`, see searches.md) | Only core touchpoint: `require('url')` at :15; zero hits for prototype/descriptor/loader/binding/global patterns |
| $PACKAGE_ROOT (whole package, excl. node_modules) | combined mutation-pattern sweep | Zero hits, including out-of-scope test/ and benchmark/ |
| $PACKAGE_ROOT/package.json | read | v1.3.3; no `dependencies`; no install scripts; `files` ships index.js only |
| $NODEJS_SOURCE lib/url.js | targeted reads :70-110, :1025-1045 + `rg '_raw'` | `Url` constructor own props and prototype members enumerated; `_raw` absent; `parse`/`Url` exported |
| $NODEJS_SOURCE lib/internal/http/incoming.js (+ lib/_http_incoming.js, lib/http.js) | targeted `rg` member enumeration + expando-name search | IncomingMessage own/prototype members enumerated; `_parsedUrl`/`_parsedOriginalUrl`/`originalUrl` absent from core |
| Upstream history | `git log -n 8 -- index.js`, HISTORY.md | Perf/lint/compat commits only ("Fix Node.js 0.8 return value inconsistencies"); no patch-related history |
| Upstream reference | https://github.com/joyent/node/pull/7878 (cited in index.js:104) | Merged core fast-path regexp; parseurl copies the technique locally, does not modify core |
| Runtime | `node repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | Before/after snapshots identical on every monitored surface; see repro/results.json |

## Runtime reproduction summary (repro/)

Node v24.19.0. Script: `repro/repro.js`; sanitized output: `repro/results.json`.

Monitored before requiring parseurl and after requiring + exercising (real `http.IncomingMessage` from `http.createServer`; fast-path parse + memoized repeat, changed-url re-parse, absolute-URL slow path, `parseurl.original` + repeat):
identities/descriptors of `url.parse`, `url.Url`, `url.format`, `url.resolve`, `url.resolveObject`, `Url.prototype` and its 5 methods; `http.IncomingMessage` and prototype + 5 method identities and key/symbol lists; `Object`/`Array`/`String`/`Function` prototype key lists; `Object.assign`; `Module._load`; `Module._resolveFilename`; `require.extensions` keys; `require.cache` keys (builtin entries); `process.binding` identity; `globalThis` keys.

Results: **zero identity changes after require and after exercise; zero key-list diffs** except `require.cache` gaining exactly `$PACKAGE_ROOT/index.js` (the library itself; no `node:` entries). Behavior: fast path memoized (`p1 === p2` true), changed URL re-parsed, slow path returns `Url` instance with `host === 'example.com'`, `original()` memoized. Expando classification: library-added own props on req = `['_parsedOriginalUrl','_parsedUrl']`; shadowing of IncomingMessage prototype members = `[]`; shadowing of pre-existing own props = `[]`; cached object type = **core `Url` instance** (prototype is `url.Url.prototype`); parsed own props (all 12 constructor-initialized fields + `_raw`) shadow no `Url.prototype` member. Incidental observation: Node emits DEP0169 for `url.parse()` usage — deprecation, not a patch.

## Coverage and limitations

- Entry points: `index.js` only (verified sole shipped runtime file). Dependencies: none to audit. All branches of `parseurl`, `originalurl`, `fastparse`, `fresh` are static-read-covered; repro exercised fast path, memoized path, re-parse path, `url.parse` slow path, and `original` path. Untested at runtime: the `Url === undefined` fallback branch (index.js:128-131) — unreachable on any Node providing `url.Url`; it constructs a plain `{}` and cannot patch anything (static proof).
- Node baseline is main (`d44625a4b80`), which post-dates the library (2019); the member sets checked (`Url` constructor/prototype, IncomingMessage members) are long-stable, and the expando names also returned zero hits in the legacy-pathed files. Repro ran on Node v24.19.0, not on the baseline commit build — acceptable per skill (runtime version stated; static core verification done against the pinned checkout).
- Blind-pass constraint honored: nothing outside `audit/pillarjs/parseurl/pass-b/` was read under the audit root.
- What would change the verdict: a different shipped artifact (e.g. npm tarball differing from the git tag) containing extra runtime code — not checked; this audit pinned the git clone at `97cab2ff`.

## Changes since the previous audit

First audit (pass B, blind; no prior pass-b report existed).
