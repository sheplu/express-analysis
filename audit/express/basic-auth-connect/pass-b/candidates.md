# Candidate ledger: basic-auth-connect 1.1.0 (pass-b)

Target: `$PACKAGE_ROOT` = basic-auth-connect @ 856183e95f7bea8579c4ee07f225b2e3edb8b8b8 (v1.1.0).
Runtime scope: `index.js` + `node_modules/tsscmp/lib/index.js` (tsscmp@1.0.6).
Node.js baseline: `$NODEJS_SOURCE` @ d44625a4b80c672215b469906ce583ce7eeeebaf (main, v28.0.0-pre).

Every candidate site surfaced by the searches in searches.md is listed, with the
exact object/key written or touched and its classification against the Node.js
HTTP/Buffer/crypto contracts.

Totals: 13 candidates — 0 confirmed, 13 rejected, 0 unresolved.

| ID | Site | What it writes/does | Object / key | Status | Reason |
| --- | --- | --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/index.js:1` | `var timingSafeCompare = require('tsscmp')` | local binding only | rejected | Plain import; dependency audited separately (C-010..C-013). No mutation. |
| C-002 | `$PACKAGE_ROOT/index.js:2` | `var http = require('http')` | local binding; `http` module object never written | rejected | Core import. Sole subsequent use is the read `http.STATUS_CODES[code]` (C-009). No property assignment/deletion on the module object anywhere in the file. |
| C-003 | `$PACKAGE_ROOT/index.js:79` | `new Buffer(parts[1], 'base64').toString()` | constructs a new Buffer; writes nothing on `Buffer`/`Buffer.prototype` | rejected | Deprecated DEP0005 constructor *call*. Baseline `$NODEJS_SOURCE/lib/buffer.js:320-330` shows it delegates to `Buffer.from`. Deprecated usage of supported core, not a patch. Listed as supporting context in report.md. |
| C-004 | `$PACKAGE_ROOT/index.js:94` | `req.user = req.remoteUser = user` (async-callback branch) | live `http.IncomingMessage` instance, keys `user` and `remoteUser` | rejected | Core-backed instance write, but both keys are new expando properties: `rg -n 'remoteUser\|\.user\b' $NODEJS_SOURCE/lib/internal/http/incoming.js` returns nothing. No core property, accessor, or method is shadowed/overridden; this is library/application metadata (standard Connect middleware convention). |
| C-005 | `$PACKAGE_ROOT/index.js:100` | `req.user = req.remoteUser = user` (sync-callback branch) | same as C-004 | rejected | Identical object/keys and reasoning as C-004. |
| C-006 | `$PACKAGE_ROOT/index.js:118` | `res.statusCode = 401` | live `http.ServerResponse` instance, key `statusCode` | rejected | Documented settable API. Baseline `$NODEJS_SOURCE/lib/internal/http/server.js:285` defines `ServerResponse.prototype.statusCode = 200` as a plain prototype data property whose intended use is per-instance shadowing; core reads `this.statusCode` at `server.js:420` when flushing headers. Instance-level documented usage, not an override of core behavior (prototype untouched). |
| C-007 | `$PACKAGE_ROOT/index.js:119` | `res.setHeader('WWW-Authenticate', 'Basic realm="..."')` | method call; writes into the response's own header store via core code | rejected | Call to documented `OutgoingMessage.prototype.setHeader` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:813`). The method itself is never reassigned/wrapped. Header state mutation is the API's documented purpose. |
| C-008 | `$PACKAGE_ROOT/index.js:120` | `res.end('Unauthorized')` | method call | rejected | Documented core/stream API call; no assignment. |
| C-009 | `$PACKAGE_ROOT/index.js:134` | `http.STATUS_CODES[code]` inside `new Error(msg \|\| ...)` | indexed **read** of the exported map | rejected | Read-only. `STATUS_CODES` exported at `$NODEJS_SOURCE/lib/http.js:54,265` (from `lib/internal/http/server.js`). No key written or deleted. |
| C-010 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:9` | `var crypto = require('crypto')` | local binding; `crypto` module object never written | rejected | Core import; all subsequent uses are reads/calls (C-011..C-013). |
| C-011 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:17-18` | `if (crypto.timingSafeEqual) { return crypto.timingSafeEqual(a, b); }` | property read + call | rejected | Feature detection only. The old-Node fallback (lines 20-25) is a local byte loop; nothing is assigned to `crypto`, so no polyfill is installed. Export confirmed at `$NODEJS_SOURCE/lib/crypto.js:239`. |
| C-012 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:31` | `crypto.pseudoRandomBytes(32)` | deprecated alias call | rejected | DEP0115 alias of `randomBytes` (`$NODEJS_SOURCE/lib/crypto.js:309,387`, `getRandomBytesAlias`). Call into supported core, no mutation. Supporting context in report.md. |
| C-013 | `$PACKAGE_ROOT/node_modules/tsscmp/lib/index.js:32-33` | `crypto.createHmac('sha256', key).update(s).digest()` | documented calls | rejected | `createHmac` defined/exported at `$NODEJS_SOURCE/lib/crypto.js:173,201`. Plain API usage. |

## Negative sweeps (no candidates produced)

- Prototype/descriptor mutation patterns (`.prototype`, `__proto__`,
  `setPrototypeOf`, `defineProperty/ies`, `Reflect.set/defineProperty/
  setPrototypeOf`, `Object.assign`): no matches in runtime scope.
- Patch vocabulary (`monkey?patch`, `patch`, `wrap`, `shim`, `polyfill`,
  `override`): no matches.
- Module-loading interception (`require.cache`, `require.extensions`,
  `Module._load/_resolveFilename/_extensions/_compile`,
  `syncBuiltinESMExports`, `registerHooks`): no matches.
- Internal/binding access (`process.binding`, `process._linkedBinding`,
  `internalBinding`, `'_http_'`, `'internal/'`): no matches.
- Globals / inheritance (`process`, `global`, `globalThis`, `extends`,
  `inherits(`): no matches (only `Buffer` matched → C-003).
- `delete` / `getOwnPropertyDescriptor` / `freeze` / `seal`: no matches.
- Whole-tsscmp-package sweep (incl. out-of-scope tests, as a safety net) for
  prototype/defineProperty/module-interception patterns: no matches.
- Install/lifecycle scripts (`preinstall`/`install`/`postinstall`/`prepare`) in
  both package.json files: none.

## Unresolved

None.
