# Node.js patch audit: serve-static

- Verdict: confirmed patching (one transient, self-restoring shared-global mutation in a transitive dependency; no persistent patch and no instance override in the inspected scope)
- Status: complete
- Input: npm package `serve-static` 2.2.1, local clone at `$PACKAGE_ROOT` (https://github.com/expressjs/serve-static, branch master, commit 6e3606f2892df213e8fa738b51a36ba711e86ce8)
- Library: serve-static 2.2.1; runtime surface `index.js` (208 lines, `files: ["LICENSE", "index.js"]`); resolved runtime dependencies installed at `$PACKAGE_ROOT/node_modules` (19 packages, see Coverage); no install/postinstall scripts anywhere in the tree
- Node.js baseline: main branch, commit d44625a4b80c672215b469906ce583ce7eeeebaf, at `$NODEJS_SOURCE` (unmodified)
- Reproduction runtime: Node v24.19.0 (`node repro-check.js "$PACKAGE_ROOT"`, script beside this report)
- Scope: production/runtime code only; tests, docs, `scripts/version-history.js` (dev-only npm `version` hook), and browser variants (`debug/src/browser.js`, `depd/lib/browser`, `inherits/inherits_browser.js`) out of scope
- Coverage: full read of `index.js` and of every resolved runtime dependency entrypoint (send read in full); all skill candidate patterns run over the runtime tree; targeted Node.js baseline reads; upstream tags pinned via GitHub API; reproduction executed

## Patching verdict

Patching was demonstrated, but only in the narrowest sense: exactly one
confirmed mutation of a shared global, and it is transient and
self-restoring. `require('serve-static')` triggers — via the chain
serve-static -> send@1.2.1 -> http-errors@2.0.1 -> depd@2.0.0 — a single
synchronous swap/restore cycle of `Error.prepareStackTrace` and
`Error.stackTraceLimit` inside depd's `getStack()` (F-001). Both values are
restored before `getStack()` returns; reproduction confirmed exactly 2 writes
to `Error.prepareStackTrace` during require (set to depd's
`prepareObjectStackTrace`, then set back to the saved original — on the test
runtime that original was Node's own installed `ErrorPrepareStackTrace`) and
full value restoration.

Counts:

- Shared core mutations: 1 confirmed (F-001; transitive, transient, restored synchronously, fires once at module load; zero additional cycles on serve-static/send production request paths).
- Instance/application overrides of core-backed objects: 0 confirmed. The one candidate (`on-finished` `patchAssignSocket`, which would wrap `res.assignSocket` on a live ServerResponse) is statically unreachable on any Node version this package supports (C-002).
- Core module loading interception: none found (all searches negative).
- Core source rewrites / native binding use: none found.
- Unresolved candidates: none.

serve-static's own `index.js` performs no patching: it only calls documented
`res` APIs (`setHeader`, `statusCode`, `end`) and attaches listeners to
send's own event emitter. send never reassigns or wraps any method of `req`,
`res`, or the `fs.ReadStream` it creates — it calls `res.setHeader`/`getHeader`/
`removeHeader`/`getHeaderNames`/`end`, reads the public `res.headersSent`
getter (not `res._header`), never calls or touches `_implicitHeader` or
`writeHead`, and uses only public stream APIs (`fs.createReadStream`,
`stream.pipe(res)`, `stream.destroy()`).

## Confirmed Node.js patches

### F-001: `Error.prepareStackTrace` / `Error.stackTraceLimit` — transient swap and restore in depd `getStack()`

- Category: shared core mutation (transient; synchronously restored)
- Library site(s): `$PACKAGE_ROOT/node_modules/depd/index.js:381-399` (`getStack()`: save at :382/:384, swap at :386-:387, restore at :395-:396); trigger at `$PACKAGE_ROOT/node_modules/depd/index.js:108` (`depd()` calls `getStack()`); import chain entry `$PACKAGE_ROOT/node_modules/http-errors/index.js:15`. Pinned source: https://github.com/dougwilson/nodejs-depd/blob/6d59c85d093092e65ec77033576417d743079fa0/index.js#L381-L399 (tag v2.0.0)
- Origin: transitive — serve-static -> send@1.2.1 -> http-errors@2.0.1 -> depd@2.0.0
- Core baseline: `Error.prepareStackTrace`/`Error.stackTraceLimit` are the documented V8 stack-trace customization API on the shared `Error` global; Node core itself installs and honors a user-set `Error.prepareStackTrace` (`$NODEJS_SOURCE/lib/internal/errors.js:136-150`, `prepareStackTraceCallback` delegates to `globalThis.Error.prepareStackTrace` when it is a function). On the reproduction runtime the pre-existing value was Node's own `ErrorPrepareStackTrace`.
- Exact mutation: `Error.prepareStackTrace = prepareObjectStackTrace` (returns the structured CallSite array) and `Error.stackTraceLimit = Math.max(10, limit)`; after `Error.captureStackTrace(obj)` and reading `obj.stack`, both are assigned back to the saved originals.
- Execution chain: `require('serve-static')` (`$PACKAGE_ROOT/index.js:20`) -> `require('send')` (`node_modules/send/index.js:15`) -> `require('http-errors')` (`node_modules/http-errors/index.js:15`) -> `require('depd')('http-errors')` -> `depd()` (`depd/index.js:108`) -> `getStack()` swap/restore.
- Activation: module load — exactly one swap/restore cycle per process (http-errors is the only depd consumer in this tree, and `depd()` is called once). Additional cycles would occur only if `deprecate()` runs (`depd/index.js:199` via `http-errors/index.js:73`), which requires `createError()` with a status outside 400-599; serve-static/send only produce 400/403/404/412/416/500, so per-request activation is 0. `deprecate.function`/`deprecate.property` (which would `defineProperty` on caller objects) are never invoked in this tree.
- Scope and restoration: process-wide `Error` global; mutation window is synchronous with no yield points, both properties restored before `getStack()` returns. No lasting change.
- Resulting behavior: during the window, any stack-trace formatting would use depd's `prepareObjectStackTrace` and the raised stack limit; since no other code runs inside the window, there is no observable steady-state effect. A concurrent writer's value set before the swap is preserved by the save/restore.
- Evidence: static — full read of `depd/index.js`; reproduction — `node repro-check.js "$PACKAGE_ROOT"` on Node v24.19.0 reported `Error.prepareStackTrace writes during require: 2 ["fn:prepareObjectStackTrace","fn:ErrorPrepareStackTrace"]`, `Error.prepareStackTrace restored: true`, `Error.stackTraceLimit value restored: true` (the limit was snapshot-checked by value: instrumenting it with an accessor disables V8 stack capture, which itself confirms V8 treats it as a plain data property).
- Upstream: depd v2.0.0, https://github.com/dougwilson/nodejs-depd (tag v2.0.0 = 6d59c85d093092e65ec77033576417d743079fa0). This is depd's documented mechanism for locating deprecation call sites; it has shipped unchanged across the jshttp/expressjs ecosystem.

No other confirmed patches. In particular there are no persistent mutations
of core prototypes, no replacement of methods on live `req`/`res`/stream
instances, and no module-loading interception anywhere in the runtime tree.

## Candidate ledger and unresolved questions

Full ledger with rejection reasoning in `candidates.md` beside this report. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `depd/index.js:381-399`, `Error.prepareStackTrace`/`stackTraceLimit` | confirmed -> F-001 | transient swap/restore; fires once at require |
| C-002 | `on-finished/index.js:189-199`, `res.assignSocket` instance wrap | rejected as patch (unreachable) | guard `msg.socket === undefined` (:128) never true: `$NODEJS_SOURCE/lib/internal/http/outgoing.js:187` sets `this[kSocket] = null` with a `socket` accessor, so it is `null`, never `undefined`; send also calls `onFinished(res, ...)` mid-request when the socket is assigned, taking the early return at :119-123. Dormant Node 0.8 legacy code |
| C-003 | `on-finished/index.js:147`, `msg.__onFinished` on live res | rejected as patch | library-owned metadata key; core defines no `__onFinished` (negative grep over `$NODEJS_SOURCE/lib/internal/http/*.js`) |
| C-004 | `parseurl/index.js:54,84`, `req._parsedUrl`/`req._parsedOriginalUrl` | rejected as patch | library-owned cache keys on live IncomingMessage; core defines neither |
| C-005 | `$PACKAGE_ROOT/index.js:192-193`, mutates cached `originalUrl` object | rejected as patch | data mutation of the legacy `url.Url` instance parseurl cached on `req._parsedOriginalUrl`; no core API replaced (see supporting context) |
| C-006 | `setprototypeof/index.js:3-8`, `Object.setPrototypeOf` polyfill | rejected as patch | feature-detecting export; on Node >= 18 re-exports the native function unchanged; fallbacks only touch objects passed in (library-created errors) |
| C-007 | `http-errors/index.js:117,139-165,208-234`, prototypes/defineProperty | rejected as patch | `inherits`/`setPrototypeOf`/`defineProperty` on library-created Error instances and library-owned ClientError/ServerError constructors; `Error` global untouched |
| C-008 | `depd/index.js:413-433,439-486`, `wrapfunction`/`wrapproperty` | rejected as patch (not activated) | exported helpers that mutate caller-designated objects; never called in this tree (http-errors only calls `deprecate(message)` at :73) |
| C-009 | `depd/index.js:492-538`, DeprecationError defineProperty | rejected as patch | properties defined on a library-created error object |
| C-010 | `debug/src/node.js:203-211` via `common.js:287`, `process.env.DEBUG` write/delete at load | rejected as patch | round-trips its own env key (rewrites the value just read, or deletes an unset key); configuration write, no core API behavior replaced |
| C-011 | `debug/src/common.js:122-139`, `node.js:18` | rejected as patch | `defineProperty`/`util.deprecate` on debug's own function objects |
| C-012 | `send/index.js:155,165-768`, `SendStream.prototype.*`, `util.inherits(SendStream, Stream)` | rejected as patch | supported extension: methods (incl. names `pipe`/`setHeader`) defined on send's own constructor prototype; `Stream.prototype` untouched (verified by reproduction identity check) |
| C-013/C-014 | `send/index.js:184,273,386,564`; `$PACKAGE_ROOT/index.js:78,200`, `res.statusCode =` | rejected as patch | documented settable property; shadows the prototype default 200 (`$NODEJS_SOURCE/lib/internal/http/server.js:285`) exactly as core intends |
| C-015..C-021 | etag `fs.Stats` instanceof; inherits re-export; mime-types/statuses load-time own-map builds; `Error.captureStackTrace` calls; on-finished AsyncResource bind; ee-first listener add/remove | rejected as patch | read-only core use, own-object initialization, or public listener APIs; details in `candidates.md` |

No unresolved candidates.

## Supporting context

- Cross-middleware shared state (not a patch): parseurl memoizes parsed URLs on `req._parsedUrl`/`req._parsedOriginalUrl` (ecosystem-conventional keys), and serve-static's redirect listener (`$PACKAGE_ROOT/index.js:192-193`) mutates the cached `_parsedOriginalUrl` object (`path = null`, `pathname` rewritten). Later middleware calling `parseurl.original(req)` observes the mutated object. This changes library-cached request metadata, not Node.js behavior.
- on-finished attaches listeners to the live response and its socket (`'end'`/`'finish'`/`'error'`/`'close'` via ee-first) and reads the public `writableEnded` getter (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:1014`) with a `finished` fallback for older runtimes. Observation only.
- MIME handling: send@1.2.1 uses mime-types@3.0.2 + mime-db@1.54.0 (not the `mime` package). At first require it builds its own `types`/`extensions` maps from the mime-db JSON (`mime-types/index.js:42`, `populateMaps`), including a `_extensionConflicts` diagnostic list — load-time CPU/memory on its own exports, no global or core mutation.
- debug@4.4.3 at load reads `DEBUG*` env vars, builds `inspectOpts`, and calls `enable(load())`, which writes `process.env.DEBUG` back to its just-read value (or deletes the unset key) — an effective no-op round-trip on its own env key.
- All `res` writes by serve-static/send go through the documented OutgoingMessage API surface: `setHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`), `getHeader` (:914), `getHeaderNames` (:927), `removeHeader` (:973), `headersSent` getter (:1007), `end` (:1289), and the settable `statusCode`. send does not use `res._header`, `_implicitHeader`, or `writeHead` at all.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | `find node_modules -name '*.js'` + per-package `package.json` read | 19 runtime deps resolved; single-file entrypoints; no install scripts (`grep '"preinstall"\|"postinstall"\|"install"' node_modules/*/package.json` negative) |
| Candidate patterns (skill set) | `rg -n` over `index.js` + `node_modules` (tests/docs/browser excluded): requires/imports; globals/Buffer/inherits; `.prototype`/`__proto__`/`setPrototypeOf`/`defineProperty`/`Object.assign`; `monkey.?patch|patch|wrap|shim|polyfill|override`; `require.cache|require.extensions|Module._*|syncBuiltinESMExports|registerHooks`; `process.binding|internalBinding|'_http_'|'internal/'` | Module-interception and bindings/internal patterns: zero hits. Other hits enumerated in `candidates.md`; full command log in `searches.md` |
| Full file reads | `$PACKAGE_ROOT/index.js`; send, depd, on-finished, http-errors, parseurl, ee-first, setprototypeof, inherits, mime-db, mime-types(+mimeScore), debug (index/common/node), encodeurl, escape-html, etag, fresh, ms, range-parser, statuses, toidentifier | every runtime file read in full; no additional candidates beyond ledger |
| Node baseline (targeted) | `$NODEJS_SOURCE/lib/_http_outgoing.js`, `lib/_http_server.js` (now deprecation shims re-exporting `lib/internal/http/{outgoing,server}.js`); `lib/internal/http/outgoing.js:130-315,813-1289`; `lib/internal/http/server.js:280-330`; `lib/internal/errors.js:91-150`; `lib/fs.js:3943` (`createReadStream`); `lib/internal/fs/streams.js:189,324` | confirmed: `kSocket = null` + `socket` accessor (patchAssignSocket unreachable); `assignSocket` baseline at server.js:312; public header APIs; `prepareStackTrace` is the honored V8 customization hook; fs stream APIs public |
| Core negative checks | `grep -n "_parsedUrl\|__onFinished" $NODEJS_SOURCE/lib/internal/http/{incoming,outgoing,server}.js` | zero hits — those keys are library-owned |
| Upstream pinning | `gh api repos/expressjs/serve-static/git/ref/tags/v2.2.1` -> 76312e12c2754c226a685201ff43d785455d0590; `gh api repos/pillarjs/send/git/ref/tags/1.2.1` -> 096a6148bea0b82ca974fe0016e6eac280869249; `gh api repos/dougwilson/nodejs-depd/git/ref/tags/v2.0.0` -> 6d59c85d093092e65ec77033576417d743079fa0 | version provenance pinned; audited working tree (master@6e3606f) is a few commits past the v2.2.1 tag but `package.json` version and shipped `index.js` are 2.2.1 |
| Reproduction | `node repro-check.js "$PACKAGE_ROOT"` (Node v24.19.0) | 2 instrumented writes to `Error.prepareStackTrace` during require, fully restored; `stackTraceLimit` value restored; all checked http/fs/stream core function identities unchanged after require |

File hashes (SHA-256, `$PACKAGE_ROOT`-relative):

```
a40e84c100c19237f992c943cbce0f3c137466648df3505bd72ad1c0be38b5d0  index.js
17d2352806284e6ff6880542c54e9086cc471ea8b69c4ff44eabe21bce978db7  node_modules/send/index.js
4d587a5662e20a7bb9bfe6555afe5987e1b80303a819b447394f37a93297ee91  node_modules/depd/index.js
ecd342e4d92b4f4df3e1af6a1ee4028ced17421702e0ec93fe2dd5afff3a4807  node_modules/on-finished/index.js
33bda88afcd1a83566eb4ebb305f852b701e19aad5e1d92cb3a11161d35c50f0  node_modules/http-errors/index.js
811223d4a19492ccc642384dc84f0af4ad935557dfe8f63750d7ffd673e40f17  node_modules/parseurl/index.js
3e3495ca7ae72a7f0ca459f47dd3d97ae3a48fa4b1a669a31672be778cc97a5f  node_modules/setprototypeof/index.js
d7b26d7c92f8ea7794b77ce11f3c11cd18c9084df7c357e3c7025344fa28aac6  node_modules/debug/src/node.js
dbe83d2bb5837f3c4d7fe537b8004c585987270eceed5b06b8e078deb0ae214a  node_modules/debug/src/common.js
7de0cc894fd1d45cc9e4d0b5ad76d00aca6cb04966bed947bdfbf7d710c61c06  node_modules/mime-types/index.js
```

## Coverage and limitations

- Entry points: `$PACKAGE_ROOT/index.js` (sole shipped runtime file). Resolved runtime dependencies (all read): send@1.2.1, debug@4.4.3, depd@2.0.0, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, etag@1.8.1, fresh@2.0.0, http-errors@2.0.1, inherits@2.0.4, mime-db@1.54.0, mime-types@3.0.2, ms@2.1.3, on-finished@2.4.2, parseurl@1.3.3, range-parser@1.3.0, setprototypeof@1.2.0, statuses@2.0.2, toidentifier@1.0.1.
- Branches excluded: browser variants (`debug/src/browser.js`, `depd/lib/browser/index.js`, `inherits/inherits_browser.js` — unreachable under Node per `debug/src/index.js:6-9` and successful `util.inherits` feature test); `supports-color` optional require in `debug/src/node.js:32` is not installed and the failure is swallowed (exercised at reproduction); setprototypeof's `__proto__`/mixin fallbacks are dead on Node >= 18 (native `Object.setPrototypeOf` exists); on-finished's `patchAssignSocket` and `process.nextTick` defer fallback are dead on the baseline.
- Node.js baseline is the main branch (d44625a4b80), ahead of any release line; file locations verified at that ref (`_http_*.js` are now deprecation shims over `lib/internal/http/`). On release lines >= 18 the same contracts hold under the pre-move paths (`lib/_http_outgoing.js`, `lib/_http_server.js`); `this.socket = null`-style initialization (vs `undefined`) has been true since Node 0.10, so the C-002 reachability conclusion is not baseline-sensitive. Reproduction ran on Node v24.19.0 only; the F-001 swap/restore is version-independent synchronous JS.
- What would change the verdict: evidence that `deprecate()`/`deprecate.function`/`deprecate.property` becomes reachable with an exception thrown between depd's swap and restore (would leave `Error.prepareStackTrace` patched); a dependency resolution that swaps in different package code than the pinned versions; or a Node runtime where `OutgoingMessage#socket` is `undefined` at construction (would arm C-002).
- Out-of-scope by instruction: other audit outputs were neither sought nor read.

## Changes since the previous audit

First audit at this path (independent pass; no prior report read or updated).
