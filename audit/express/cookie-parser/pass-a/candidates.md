# Candidate ledger: cookie-parser 1.4.7 (pass A)

Scope: `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/node_modules/cookie/index.js` (0.7.2),
`$PACKAGE_ROOT/node_modules/cookie-signature/index.js` (1.0.6). Every candidate site
surfaced by the searches in searches.md is accounted for below.
Node.js baseline: `$NODEJS_SOURCE` at d44625a4b80c672215b469906ce583ce7eeeebaf.

Final tally: 0 confirmed, 9 rejected, 0 unresolved.

## C-001 — `req.secret` write — REJECTED (not a patch)

- Site: `$PACKAGE_ROOT/index.js:51` — `req.secret = secrets[0]`
- What it writes: adds/overwrites the `secret` own property on the live request
  object (an `http.IncomingMessage` instance in a plain Node/Express server).
- Core comparison: no `secret` member exists on IncomingMessage — negative
  case-insensitive grep across `$NODEJS_SOURCE/lib/internal/http/incoming.js`
  (constructor own props lines 77-106, prototype methods 257-571, accessors 115-205).
- Verdict reasoning: additive library-owned request metadata on the instance; no
  core API, accessor, or method is shadowed or replaced. Per the skill, adding
  request metadata does not establish a core patch. Instance-scoped, per-request.
- Dynamic confirmation: repro shows `'secret' in http.IncomingMessage.prototype`
  is false after require and after a middleware run.

## C-002 — `req.cookies` writes — REJECTED (not a patch)

- Sites: `$PACKAGE_ROOT/index.js:52` (`req.cookies = Object.create(null)`),
  `index.js:60` (`req.cookies = cookie.parse(cookies, options)`),
  `index.js:69` (`req.cookies = JSONCookies(req.cookies)` — same object returned).
- What it writes: creates/replaces the `cookies` own property on the request instance.
- Core comparison: no `cookies` member on IncomingMessage at baseline (same negative
  grep as C-001). The guard at `index.js:45-47` (`if (req.cookies) return next()`)
  treats an existing `cookies` property as "already parsed" and does nothing.
- Verdict reasoning: library-owned own property, additive, instance-scoped;
  no core behavior altered. Rejected as patch.

## C-003 — `req.signedCookies` writes — REJECTED (not a patch)

- Sites: `$PACKAGE_ROOT/index.js:53` (`Object.create(null)`), `index.js:64-65`
  (result of `signedCookies()` then `JSONCookies()`).
- What it writes: creates/replaces the `signedCookies` own property on the instance.
- Core comparison: no `signedCookies` member on IncomingMessage at baseline.
- Verdict reasoning: same as C-002. Rejected as patch.

## C-004 — `req.headers.cookie` access — REJECTED (read, not a write)

- Site: `$PACKAGE_ROOT/index.js:49` — `var cookies = req.headers.cookie`
- What it touches: the core `headers` lazy accessor on
  `IncomingMessage.prototype` (`$NODEJS_SOURCE/lib/internal/http/incoming.js:125-143`,
  getter materializes a null-prototype object from rawHeaders into `kHeaders`).
- Verdict reasoning: documented public API, read-only. Dedicated searches (S7, S9)
  found no assignment to `req.headers` or to any header key in scope. Rejected.

## C-005 — cached `Object.prototype` method references — REJECTED (reads only)

- Sites: `$PACKAGE_ROOT/node_modules/cookie/index.js:23`
  (`var __toString = Object.prototype.toString`) and `:24`
  (`var __hasOwnProperty = Object.prototype.hasOwnProperty`).
- What it does: copies function references into module-local variables, later used
  as `__hasOwnProperty.call(obj, key)` (line 134) and `__toString.call(val)`
  (line 318). No property of `Object.prototype` is assigned, redefined, or deleted
  anywhere in scope (searches S3, S10 negative for writes).
- Verdict reasoning: defensive read of built-ins (robust against later tampering by
  other code), the inverse of patching. Rejected.

## C-006 — core `crypto` usage in cookie-signature — REJECTED (call-only)

- Sites: `$PACKAGE_ROOT/node_modules/cookie-signature/index.js:5`
  (`var crypto = require('crypto')`), `:19-23` (`crypto.createHmac('sha256', secret)
  .update(val).digest('base64')`), `:50` (`crypto.createHash('sha1')...` in the
  private `sha1()` helper used by `unsign`, lines 36-43).
- Core comparison: `createHash`/`createHmac` are public exported factories
  (`$NODEJS_SOURCE/lib/crypto.js:149,173`, export list 200-201).
- Verdict reasoning: the module only calls public crypto APIs on its own inputs;
  it never assigns to the `crypto` module object, `Hmac`/`Hash` prototypes, or any
  returned instance beyond chained calls. Repro confirms `crypto.createHmac` /
  `crypto.createHash` function identities unchanged after require and run. Rejected.

## C-007 — `Object.create(null)` usage — REJECTED (object creation, no mutation)

- Sites: `$PACKAGE_ROOT/index.js:52`, `index.js:53`, `index.js:167`
  (`var ret = Object.create(null)` in `signedCookies()`).
- Verdict reasoning: creates fresh library-owned null-prototype objects. Does not
  mutate any existing object, does not re-prototype `req`, and does not touch
  `Object.prototype`. Rejected.

## C-008 — `delete obj[key]` — REJECTED (library-owned object)

- Site: `$PACKAGE_ROOT/index.js:177` inside `signedCookies()`.
- What it deletes: a key from the cookies object passed in, which is the output of
  `cookie.parse` (plain object created at `node_modules/cookie/index.js:105`) that
  cookie-parser itself assigned to `req.cookies` at `index.js:60`. Removes verified
  signed entries from the plain-cookie map.
- Verdict reasoning: mutation of a library-produced data object, not of any
  core-owned structure. Rejected.

## C-009 — exports assignments — REJECTED (own module exports)

- Sites: `$PACKAGE_ROOT/index.js:23-27` (`module.exports = cookieParser` plus four
  named helpers), `node_modules/cookie/index.js:15-16` (`exports.parse`,
  `exports.serialize`), `node_modules/cookie-signature/index.js:16,36`
  (`exports.sign`, `exports.unsign`).
- Verdict reasoning: each module populates its own `module.exports`; no write to
  another module's exports, to `require.cache`, or to any core module object.
  Rejected.

## Negative sweeps (no candidate produced)

- No `__proto__` / `setPrototypeOf` / `Object.defineProperty` / `Reflect.*` /
  `Object.assign` writes anywhere in scope (search S3; only hits were the C-005 reads).
- No `Buffer` / `process` / `global` / `globalThis` / `extends` / `inherits` usage
  (search S2, zero hits).
- No monkeypatch/patch/wrap/shim/polyfill/override vocabulary (search S4, zero hits).
- No `require.cache` / `require.extensions` / `Module._load` / `_resolveFilename` /
  `_compile` / `syncBuiltinESMExports` / `registerHooks` (search S5, zero hits).
- No `process.binding` / `internalBinding` / `'_http_*'` / `'internal/*'` requires
  (search S6, zero hits).
- No writes to built-in globals (`JSON`, `Math`, `Date`, `String`, `Array`,
  `RegExp`, `encodeURIComponent`, `decodeURIComponent`) — search S10 hits were all
  local `var` declarations/regex literals in `cookie`.
- No lifecycle/install scripts in any of the three package.json files (search S11),
  and no alternative entrypoints (`main`/`exports`/`browser`/`bin`) beyond the three
  audited files (search S12).
