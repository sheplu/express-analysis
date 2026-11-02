# Candidate ledger: method-override 3.0.0 (pass A)

Target: `$PACKAGE_ROOT` = method-override @ 4df570e14dddc88b9464808f4cab3b2a73fc6dc8 (v3.0.0).
Core baseline: `$NODEJS_SOURCE` @ d44625a4b80c672215b469906ce583ce7eeeebaf.
Every candidate site surfaced by the searches in `searches.md` is accounted for below.
Final tally: 1 confirmed, 10 rejected, 0 unresolved.

## C-001 — CONFIRMED (-> F-001)
- Site: `$PACKAGE_ROOT/index.js:75` — `req.method = method.toUpperCase()`
- Writes/modifies: value of the own data property `method` on a live `http.IncomingMessage` instance; core assigned it in `parserOnHeadersComplete` (`$NODEJS_SOURCE/lib/internal/http/common.js:118`; initialized `$NODEJS_SOURCE/lib/internal/http/incoming.js:96`).
- Status: confirmed — instance/application override of core-assigned state. Node docs mark `message.method` "Read only" (`$NODEJS_SOURCE/doc/api/http.md:2987`); no documented mutation API exists, so this is not conventional mutable API usage. Per-request scope, permanent for the request lifetime, no restoration (original kept only in library-owned `req.originalMethod`). Verified by reproduction (descriptor before/after; POST -> DELETE).

## C-002 — REJECTED
- Site: `$PACKAGE_ROOT/index.js:61` — `req.originalMethod = req.originalMethod || req.method`
- Writes/modifies: adds a new library-owned property `originalMethod` to the request instance.
- Status: rejected as patch — property does not exist in core (`rg "originalMethod"` over `$NODEJS_SOURCE/lib/internal/http/*.js`, `lib/_http_incoming.js`, `lib/_http_common.js` -> no match). Adding request metadata does not replace core state (skill rule).

## C-003 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/parseurl/index.js:54` — `return (req._parsedUrl = parsed)` (read at :43)
- Writes/modifies: adds/overwrites library-convention cache property `_parsedUrl` on the request instance.
- Status: rejected as patch — `_parsedUrl` absent from core http sources (same grep as C-002); it is parseurl's own memoization key, underscore-named but library-owned. `req.url` (the core property) is only read, never written.

## C-004 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/parseurl/index.js:84` — `return (req._parsedOriginalUrl = parsed)`
- Writes/modifies: library-owned cache property `_parsedOriginalUrl`.
- Status: rejected as patch — same reasoning as C-003; additionally dead in this target: method-override calls only `parseurl(req)` (`$PACKAGE_ROOT/index.js:102`), never `parseurl.original`.

## C-005 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/vary/index.js:140,147` — `res.getHeader('Vary')` / `res.setHeader('Vary', val)`; activated from `$PACKAGE_ROOT/index.js:117` (header-getter path only)
- Writes/modifies: the response's Vary header via the public setter.
- Status: rejected as patch — `OutgoingMessage.getHeader/setHeader` are documented public APIs; mutating a response header through them is supported usage, not a replacement of any core function/property. Duck-type guard (`index.js:131-134` in vary) throws rather than patching when the API is missing.

## C-006 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/methods/index.js:30` — `http.METHODS && http.METHODS.map(lowerCaseMethod)` (module-load time, `module.exports = getCurrentNodeMethods() || getBasicNodeMethods()` at :22)
- Writes/modifies: nothing on core — `.map` allocates a new array.
- Status: rejected as patch — read-only consumption of `http.METHODS` (`$NODEJS_SOURCE/lib/http.js:264`). Fallback list (:40-68) is a standalone snapshot of Node 0.10 verbs, copied data, replaces nothing.

## C-007 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:149` (`delete process.env.DEBUG`) and :151 (`process.env.DEBUG = namespaces`), inside `save()`; reached at module load via `exports.enable(load())` (`src/node.js:186`) -> `enable()` -> `exports.save(namespaces)` (`src/debug.js:153`). Loaded by `$PACKAGE_ROOT/index.js:16`.
- Writes/modifies: `process.env.DEBUG` — process-global, core-backed env object.
- Status: rejected as patch — `process.env` is documented as mutable ("It is possible to modify this object"); no core API/behavior is replaced. The load-time write is idempotent: it rewrites `DEBUG` to its current value, or deletes a key that is already unset. Runtime `debug.enable()/disable()` would mutate it meaningfully, but method-override never calls them. Noted in supporting context as a process-global side effect.

## C-008 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:29` — `var supportsColor = require('supports-color')` in try/catch
- Writes/modifies: nothing; would only read terminal color capability.
- Status: rejected as patch — `supports-color` is not installed in the resolved tree (`ls node_modules` -> debug, methods, ms, parseurl, vary only); require throws and is swallowed (:38-40). Inert.

## C-009 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/debug/src/browser.js:133` — `Function.prototype.apply.call(console.log, console, arguments)`
- Writes/modifies: nothing — invocation via `.call`, no assignment to `Function.prototype` or `console`.
- Status: rejected as patch — read/invoke only; moreover the browser entrypoint is not loaded under Node (`debug/src/index.js:6-9` selects `./node.js` when `typeof process !== 'undefined' && process.type !== 'renderer'`).

## C-010 — REJECTED
- Site: `$PACKAGE_ROOT/index.js:19` (`require('querystring')`), :103 (`querystring.parse(url.query || '')`)
- Writes/modifies: nothing on core — function call on a core module export.
- Status: rejected as patch — read-only use; no reassignment of `querystring` exports.

## C-011 — REJECTED
- Site: `$PACKAGE_ROOT/node_modules/debug/src/node.js:135` — `process.stderr.write(util.format.apply(util, arguments) + '\n')`
- Writes/modifies: writes bytes to stderr via the documented stream API.
- Status: rejected as patch — documented stdio usage; `util.format` applied, not replaced.

## Negative sweeps (no candidate sites produced)
- Module loading interception: `require.cache|require.extensions|Module._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks` -> 0 hits in runtime files.
- Internals/bindings: `process.(binding|_linkedBinding)|internalBinding|'_http_'|'internal/'` -> 0 hits in runtime files.
- Prototype/descriptor mutation: `.prototype` writes, `__proto__`, `setPrototypeOf`, `defineProperty/ies`, `Reflect.(set|defineProperty|setPrototypeOf)`, `Object.assign` -> only hit was C-009 (invocation, browser file).
- `inherits(`/`extends`/class subclassing of core -> 0 hits (no core subclassing anywhere in the runtime tree).
- No install/postinstall scripts in method-override or any dependency package.json.
