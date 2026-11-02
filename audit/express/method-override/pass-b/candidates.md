# Candidate ledger: method-override 3.0.0 (pass-b)

Target: `$PACKAGE_ROOT` = method-override @ 4df570e14dddc88b9464808f4cab3b2a73fc6dc8 (v3.0.0).
Node.js baseline: `$NODEJS_SOURCE` @ d44625a4b80c672215b469906ce583ce7eeeebaf.
Every candidate site surfaced by the skill pattern sets and the targeted write
sweep is listed, including rejected ones. Statuses: confirmed / rejected / unresolved.

## C-001 — `req.method = method.toUpperCase()` — CONFIRMED -> F-001

- Site: `$PACKAGE_ROOT/index.js:75` (guard at :74 `supports(method)`; default
  getter reads `X-HTTP-Method-Override` header, `index.js:112-134`).
- What it writes: overwrites the own data property `method` on the live
  `http.IncomingMessage` instance for the current request.
- Core target: `IncomingMessage.method`, assigned by core at
  `$NODEJS_SOURCE/lib/internal/http/incoming.js:96` (constructor,
  `this.method = null`) and `$NODEJS_SOURCE/lib/internal/http/common.js:118`
  (`parserOnHeadersComplete`: `incoming.method = allMethods[method]`,
  `allMethods` from `internalBinding('http_parser')`). Documented "Read only"
  at `$NODEJS_SOURCE/doc/api/http.md:2977-2987`.
- Status: confirmed as an instance/application override (core-state instance
  override). Rationale: the property is core-owned and core-populated, its
  documented contract is read-only, and the write changes what all downstream
  consumers of the request observe as the HTTP method. It is NOT a shared
  mutation: prototype, constructor, `http.METHODS`, globals, and module cache
  were snapshot-compared before/after require and request handling — no diffs
  (repro-output.txt, Node v24.19.0). Descriptor confirmed as plain
  writable/enumerable/configurable data property before and after.
- Activation: per-request middleware call; only when incoming method is in
  `opts.methods` (default `['POST']`) and the override value passes
  `supports()` (membership in `methods` list derived from `http.METHODS`).
- Restoration: none automatic; wire value preserved in library-owned
  `req.originalMethod`.

## C-002 — `req.originalMethod = req.originalMethod || req.method` — REJECTED

- Site: `$PACKAGE_ROOT/index.js:61`.
- What it writes: adds a new library-owned property to the request instance.
- Reason rejected: `originalMethod` does not exist anywhere in core http
  implementation (rg negative over `$NODEJS_SOURCE/lib/internal/http/incoming.js`
  and `server.js`). Adding request metadata does not replace or shadow any core
  symbol — per the skill, not a patch.

## C-003 — `req._parsedUrl = parsed` (parseurl) — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/parseurl/index.js:54`; reached from
  `$PACKAGE_ROOT/index.js:102` (`parseurl(req)` in query getter).
- What it writes: caches a parsed-URL object on the request instance under the
  ecosystem-conventional `_parsedUrl` key.
- Reason rejected: `_parsedUrl` is not a core property (rg negative in core
  http files). New metadata on the instance; nothing core-assigned is
  replaced. Underscore naming alone does not establish core ownership (skill
  guidance), and here core ownership is disproven.

## C-004 — `req._parsedOriginalUrl = parsed` (parseurl) — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/parseurl/index.js:84` (`originalurl()`).
- Reason rejected: same rationale as C-003, and additionally unreachable in
  this package — method-override imports `parseurl` and calls only
  `parseurl(req)`; `parseurl.original` is never invoked (rg for `original`
  over `$PACKAGE_ROOT/index.js`: only `originalMethod` hits).

## C-005 — `res.setHeader('Vary', val)` (vary) — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/vary/index.js:140,147`; reached from
  `$PACKAGE_ROOT/index.js:117` (`vary(res, str)` in header getter).
- What it writes: per-response `Vary` header via `res.getHeader`/`res.setHeader`.
- Reason rejected: invocation of documented public `http.ServerResponse`
  APIs; mutates response header state through the supported interface. No
  method replaced, no descriptor touched, no shared object modified.

## C-006 — `http.METHODS` read in methods package — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/methods/index.js:15,22,29-33`
  (`require('http')`; `http.METHODS && http.METHODS.map(...)` at module load).
- Reason rejected: `.map()` is non-mutating and returns a new lower-cased
  array; no assignment to `http.METHODS` or any `http.*` property anywhere in
  the file (rg `METHODS\s*=|http\.[A-Za-z]+\s*=` negative). Core additionally
  exposes a copied array (`$NODEJS_SOURCE/lib/http.js:264`,
  `METHODS: methods.toSorted()`), so even hypothetical mutation would not
  reach the parser. Fallback list at :40-69 is copied data, not a core
  replacement.

## C-007 — `process.env.DEBUG` write/delete in debug — REJECTED

- Sites: `$PACKAGE_ROOT/node_modules/debug/src/node.js:149`
  (`delete process.env.DEBUG`), :151 (`process.env.DEBUG = namespaces`),
  reached at module load via `node.js:186` (`exports.enable(load())`) ->
  `debug/src/debug.js:152-153` (`enable()` calls `exports.save(namespaces)`).
- What it writes: the `DEBUG` environment variable on the core `process.env`
  object.
- Reason rejected: `process.env` is documented mutable application state, not
  a core API surface being overridden. At load the value is round-tripped
  unchanged (`save(load())`): delete when unset is a no-op; reassignment when
  set writes back the identical string. A behavior-visible change occurs only
  if the application explicitly calls `debug.enable()/disable()`, and even
  then it is documented env-var usage, not a core behavior rewrite.

## C-008 — optional `require('supports-color')` in debug — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:28-41` (try/catch).
- Reason rejected: `supports-color` is not in the resolved tree (debug@3.1.0
  declares only `ms`; `ls node_modules` shows debug, methods, ms, parseurl,
  vary). The branch is inert in this install; when present it only reads
  terminal color support. Marked as an excluded branch in coverage.

## C-009 — `Function.prototype.apply.call(console.log, ...)` in debug browser build — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/debug/src/browser.js:133`.
- Reason rejected: a call through `Function.prototype.apply`, not an
  assignment to it (sole P3 pattern hit). The file loads only when
  `typeof process === 'undefined' || process.type === 'renderer'`
  (`debug/src/index.js:6-9`), i.e. never in a plain Node process.

## C-010 — debug mutating its own exports — REJECTED

- Sites: `$PACKAGE_ROOT/node_modules/debug/src/debug.js:19,25-26,34`
  (`exports.instances/names/skips/formatters` init), :129
  (`exports.instances.push(debug)` — runs at method-override load via
  `require('debug')('method-override')`), :155-156,172-175 (enable() resets);
  `node.js:15-26,49,83,95` (exports.init/log/colors/inspectOpts/formatters.o/O).
- Reason rejected: all writes target the debug module's own export object —
  library-owned state. No core module export, global, or prototype involved.

## C-011 — core module read-only use (querystring, url) — REJECTED

- Sites: `$PACKAGE_ROOT/index.js:19,103` (`querystring.parse`);
  `$PACKAGE_ROOT/node_modules/parseurl/index.js:15-17` (`require('url')`,
  saved refs to `url.parse` and `url.Url`), :97,124 (`parse(str)` calls),
  :128-130 (`new Url()` constructs a fresh instance).
- Reason rejected: reads and invocations only; no assignment to any core
  module export or prototype. Saving a reference to `url.parse` is not a wrap
  — the original is called directly and never reassigned.

## C-012 — `process.stderr.write(...)` in debug — REJECTED

- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:135` (`log()`).
- Reason rejected: documented method call on a core stream; nothing replaced.

## Unresolved

None.

## Totals

- Confirmed: 1 (C-001 -> F-001, instance/application override; direct origin)
- Rejected: 11 (C-002 .. C-012)
- Unresolved: 0
