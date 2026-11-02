# parseurl — findings detail (files, lines, issues)

Library: parseurl 1.3.3 (master @ `97cab2ffdba7bdab88061bd2f415b9dfa193b9d5`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches; no transitive surface (zero runtime deps; `index.js` is the only runtime file).

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 15-17 | `var url = require('url'); var parse = url.parse; var Url = url.Url` | read-only export capture; never assigned back (runtime identity-verified) |
| `index.js` | 54 | `req._parsedUrl = parsed` | **library-owned cache expando** on the request instance; name absent from core IncomingMessage own/prototype members and the whole stream/events chain |
| `index.js` | 84 | `req._parsedOriginalUrl = parsed` | same classification |
| `index.js` | 52, 82 | `parsed._raw = url` | freshness tag on library-held parse result; `_raw` absent from `lib/url.js` |
| `index.js` | 128-139 | `new Url()` (fallback `{}`) + writes to `path/href/pathname/query/search` | fresh instance of the **exported** legacy class; same own props the ctor null-initializes (`$NODEJS_SOURCE/lib/url.js:77-91`); `Url.prototype` untouched |
| `index.js` | reads | `req.url`, `req.originalUrl` | reads only |

## Core baseline enumeration (why the expandos shadow nothing)

- `$NODEJS_SOURCE/lib/internal/http/incoming.js` — IncomingMessage constructor own properties (:77-106) and prototype members (:115-571): no `_parsedUrl`, `_parsedOriginalUrl`, `_raw`, or `originalUrl`.
- `lib/_http_incoming.js` is a re-export shim at this ref.
- Readable/Stream/EventEmitter chain (`lib/internal/streams/readable.js`, `lib/stream.js`, `lib/events.js`): zero hits for those names.
- Runtime check: shadowing of prototype members = `[]`; shadowing of pre-existing own props = `[]`; cached object's prototype `=== url.Url.prototype`; unrelated instances unaffected.

## Negative sweeps (both passes, zero hits)

- Module-loading interception (group 5) and internals/bindings (group 6): zero hits
- Prototype/descriptor mutation against shared objects: zero (all writes are to `req` expandos or the fresh parse result)
- No install scripts, no native code, no additional entrypoints

## Runtime reproduction (both passes, Node v24.19.0, clean)

Exercised on a real `IncomingMessage` from `http.createServer`: fast path, memoized repeat (`p1 === p2` confirmed), changed-url re-parse, absolute-URL `url.parse` slow path, `parseurl.original(req)` + repeat. Before/after diffs across url exports + `Url.prototype` methods, IncomingMessage prototype keys + identities, Object/Array/String/Function prototype keys, `Object.assign`, `Module._load/_resolveFilename`, `require.extensions`, `process.binding`, globalThis keys: **zero changes** (only the library's own `require.cache` entry appeared). Incidental: DEP0169 deprecation warning for `url.parse`.

## Node.js-change risk

1. **Legacy `url.parse`/`Url` lifecycle (DEP0169)** — parseurl's primary exposure: it *consumes* the runtime-deprecated legacy API and its fast path hand-populates a `new Url()` assuming the constructor's own-property shape (`lib/url.js:77-91`). Removal or semantic change of `url.parse`/`Url` breaks parseurl outright (consumption breakage, not patch breakage).
2. **Expando tolerance on IncomingMessage** — the cache keys rely on requests being extensible and on core never claiming `_parsedUrl`/`_parsedOriginalUrl` names. If Node ever sealed request objects or introduced colliding members, memoization (and downstream consumers reading `req._parsedUrl`, e.g. serve-favicon) would break.
3. The copied fast-path regex from joyent/node#7878 (closed/unmerged) is a standalone snapshot — no core code exists to drift against; only spec-level URL parsing changes would matter.
