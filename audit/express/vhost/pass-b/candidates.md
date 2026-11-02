# Candidate ledger: vhost 3.0.2 (pass-b, independent)

Scope: `$PACKAGE_ROOT/index.js` (sole runtime file, 164 lines). Node.js baseline: `$NODEJS_SOURCE` commit d44625a4b80c672215b469906ce583ce7eeeebaf.
Every write/mutation site produced by the skill pattern set and an exhaustive assignment scan is listed. Confirmed patches: 0. Rejected: 6. Unresolved: 0.

## C-001 — `module.exports = vhost`
- Site: `$PACKAGE_ROOT/index.js:15`
- Writes/modifies: the `exports` property of vhost's own CommonJS module object.
- Status: **rejected as patch**
- Reason: library-owned module object; standard export idiom. Does not touch `require.cache` entries of other modules, core module exports, or loader internals.

## C-002 — `req.vhost = vhostdata`
- Site: `$PACKAGE_ROOT/index.js:61` (inside the returned middleware closure, executed per matching request)
- Writes/modifies: adds an own data property `vhost` to the incoming request object — a core-backed `http.IncomingMessage` instance under plain Node, or a framework request object inheriting from it under Express/Connect.
- Status: **rejected as patch** (instance metadata, not core member shadowing)
- Reason: Negative searches for `vhost` in `$NODEJS_SOURCE/lib/internal/http/incoming.js`, `$NODEJS_SOURCE/lib/_http_incoming.js`, and `$NODEJS_SOURCE/lib/http.js` — no core property/accessor/method of that name exists, so nothing core-defined is shadowed, replaced, or altered. Write is per-instance (never on `IncomingMessage.prototype`), additive, applied only when the hostname regexp matches, and is the package's documented public API (`req.vhost` object with host/hostname/match captures, built on `Object.create(null)` at index.js:153). Skill contract: "Merely adding request metadata ... does not establish a core patch."

## C-003 — `Object.prototype.toString.call(val)`
- Site: `$PACKAGE_ROOT/index.js:102` (in `isregexp`)
- Writes/modifies: nothing — read-only `.call` on the intrinsic to brand-check a RegExp.
- Status: **rejected as patch**
- Reason: no assignment, `defineProperty`, delete, or descriptor change on `Object.prototype`; pure read.

## C-004 — `req.headers.host` reads (host-header read path)
- Sites: `$PACKAGE_ROOT/index.js:77` (`hostnameof`) and `$PACKAGE_ROOT/index.js:140` (`vhostof`)
- Writes/modifies: nothing — reads the `host` key of the headers object.
- Status: **rejected as patch**
- Reason: access goes through the documented lazy `headers` accessor defined on `IncomingMessage.prototype` (`$NODEJS_SOURCE/lib/internal/http/incoming.js:125`); `host` is a core-parsed known first-wins header field (`incoming.js:356`, `405-411`). vhost never assigns to `req.headers` (triggering the core setter) nor mutates any key of the headers object.

## C-005 — writes on `obj` (`obj.host`, `obj.hostname`, `obj.length`, `obj[i-1]`)
- Sites: `$PACKAGE_ROOT/index.js:155-160`
- Writes/modifies: properties on a freshly created `Object.create(null)` object (`index.js:153`).
- Status: **rejected as patch**
- Reason: library-owned, null-prototype, per-call object; no shared or core-backed object involved. Becomes the value assigned in C-002.

## C-006 — `handle(req, res, next)` dispatch
- Site: `$PACKAGE_ROOT/index.js:64`
- Writes/modifies: nothing — invokes the user-supplied handler with the original `req`/`res`/`next`.
- Status: **rejected as patch**
- Reason: no wrapping of `req`/`res` methods, no saved originals, no event-emitter interception, no proxying; vhost is a transparent pass-through once `req.vhost` (C-002) is set.

## Exhaustiveness notes
- Pattern groups with zero hits in the runtime file (hence no candidates generated): imports/`node:` specifiers; `Buffer`/`process`/`global`/`globalThis`/`extends`/`inherits`; patch/wrap/shim/polyfill/override keywords; `require.cache`/`require.extensions`/`Module._*`/`syncBuiltinESMExports`/`registerHooks`; `process.binding`/`internalBinding`/`'_http_'`/`'internal/'`.
- Remaining assignments in the full `=` scan are local `var` declarations and local string reassignments (`source`, index.js:119,124) — local scope only, not candidates.
- Transitive vector: none possible — `package.json` declares no `dependencies`; no node_modules present; no install scripts.
