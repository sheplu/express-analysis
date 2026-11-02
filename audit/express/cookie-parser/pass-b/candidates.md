# Candidate ledger — cookie-parser 1.4.7 patch audit (pass-b)

Target: `$PACKAGE_ROOT` = cookie-parser@1.4.7 (commit 1f2a3a2037c4efe01605e064e7cc326008be7287)
with cookie@0.7.2 and cookie-signature@1.0.6 at `$PACKAGE_ROOT/node_modules`.
Every candidate site produced by the search passes in `searches.md` is listed.
Statuses: confirmed (patch) / rejected (not a patch) / unresolved. Result: 0 confirmed, 11 rejected, 0 unresolved.

## C-001 — module loading (cookie-parser)
- Sites: `index.js:15` `var cookie = require('cookie')`; `index.js:16` `var signature = require('cookie-signature')`
- Writes/modifies: nothing; loads the two runtime dependencies via ordinary CJS `require`.
- Status: **rejected**. No `require.cache`/`require.extensions`/`Module._*`/loader-hook usage anywhere in scope (pattern P5 negative). Not module interception.

## C-002 — own exports (cookie-parser)
- Sites: `index.js:23-27` `module.exports = cookieParser`, `module.exports.JSONCookie/JSONCookies/signedCookie/signedCookies = ...`
- Writes/modifies: the package's own `module.exports` object.
- Status: **rejected**. Library-owned module object; no core module touched.

## C-003 — `req.secret` write on core-backed request instance
- Site: `index.js:51` `req.secret = secrets[0]` (inside the returned middleware).
- Writes/modifies: adds own property `secret` to the per-request `http.IncomingMessage` instance (as passed by Express/connect).
- Core baseline: `$NODEJS_SOURCE/lib/internal/http/incoming.js` at d44625a4b80 (via `lib/_http_incoming.js` re-export). Constructor-assigned members: socket, httpVersion*, complete, rawHeaders, rawTrailers, joinDuplicateHeaders, aborted, upgrade, url, method, statusCode, statusMessage, client, _consuming, _dumped. Prototype members: setTimeout, _read, _destroy, _addHeaderLines, _addHeaderLine, _addHeaderLineDistinct, _dumpAndCloseReadable, _dump (plus accessors). No member named `secret`.
- Status: **rejected**. No core member shadowed; library metadata addition = documented extension, not a patch (skill: adding request metadata does not establish a core patch). Repro confirmed own-instance property, prototype unchanged.

## C-004 — `req.cookies` writes
- Sites: `index.js:52` `req.cookies = Object.create(null)`; `index.js:60` `req.cookies = cookie.parse(cookies, options)`; `index.js:69` `req.cookies = JSONCookies(req.cookies)`
- Writes/modifies: adds/reassigns own property `cookies` on the request instance; value is a fresh null-prototype object or the fresh plain object returned by `cookie.parse`.
- Core baseline: same as C-003; no `cookies` member on core IncomingMessage (the core `kCookie` entries at internal/http/incoming.js:394,419 concern the `cookie` *header name* inside `req.headers`, which cookie-parser only reads at index.js:49).
- Status: **rejected**. Library-owned, documented API (`req.cookies`); no core shadowing.

## C-005 — `req.signedCookies` writes
- Sites: `index.js:53` `req.signedCookies = Object.create(null)`; `index.js:64` `= signedCookies(req.cookies, secrets)`; `index.js:65` `= JSONCookies(req.signedCookies)`
- Writes/modifies: adds/reassigns own property `signedCookies` on the request instance; values are fresh plain objects created in this package.
- Status: **rejected**. Same reasoning as C-003/C-004; no such core member.

## C-006 — mutations of cookie-value objects
- Sites: `index.js:113` `obj[key] = val` (JSONCookies); `index.js:176` `ret[key] = dec` and `index.js:177` `delete obj[key]` (signedCookies).
- Writes/modifies: keys of the plain objects created at C-004/C-005 (`cookie.parse` result / `Object.create(null)`), replacing `j:`-prefixed strings with parsed JSON and moving validly signed entries from `req.cookies` to `req.signedCookies`.
- Status: **rejected**. Targets are library-created plain objects, not core-backed objects.

## C-007 — own exports (cookie)
- Sites: `node_modules/cookie/index.js:15-16` `exports.parse = parse; exports.serialize = serialize;`
- Status: **rejected**. Own module exports.

## C-008 — `Object.prototype` references at load time (cookie)
- Sites: `node_modules/cookie/index.js:23` `var __toString = Object.prototype.toString`; `:24` `var __hasOwnProperty = Object.prototype.hasOwnProperty`
- Writes/modifies: nothing — read-only capture of built-in prototype methods into module locals (used at index.js:134 and :318 as uncurried calls, a prototype-pollution-hardening idiom).
- Status: **rejected**. Reads, not writes; no defineProperty/descriptor change anywhere (pattern P3 shows these two lines as the only prototype-related hits).

## C-009 — parse result population (cookie)
- Site: `node_modules/cookie/index.js:144` `obj[key] = tryDecode(val, dec);`
- Writes/modifies: keys of the fresh `var obj = {}` created at line 105 inside `parse`.
- Status: **rejected**. Library-created plain object.

## C-010 — core crypto usage (cookie-signature)
- Sites: `node_modules/cookie-signature/index.js:5` `var crypto = require('crypto');`; `:19-23` `crypto.createHmac('sha256', secret).update(val).digest('base64')`; `:50` `crypto.createHash('sha1').update(str).digest('hex')`
- Writes/modifies: nothing on the `crypto` module — these are plain factory **calls** into documented core API; no member of `crypto` is assigned, wrapped, or deleted (verified: `rg "crypto\.\w+\s*=[^=]"` negative).
- timingSafeEqual check (per task): `crypto.timingSafeEqual` is absent from 1.0.6 entirely — no call, no polyfill. `unsign` (index.js:36-43) compares `sha1(mac) == sha1(val)`. Upstream versions 1.1.0/1.2.0 switched to a direct `crypto.timingSafeEqual` call (verified via GitHub tags); not present in this tree.
- Status: **rejected**. Documented API calls; no mutation.

## C-011 — own exports (cookie-signature)
- Sites: `node_modules/cookie-signature/index.js:16` `exports.sign = function...`; `:36` `exports.unsign = function...`
- Status: **rejected**. Own module exports.

## Negative sweeps (no candidate sites produced)
- Buffer / process / global / globalThis / extends / inherits: zero hits in all three files (P2).
- monkeypatch/patch/wrap/shim/polyfill/override keywords (case-insensitive): zero hits (P4).
- require.cache / require.extensions / Module._load/_resolveFilename/_extensions/_compile / syncBuiltinESMExports / registerHooks: zero hits (P5).
- process.binding / internalBinding / '_http_' / 'internal/' imports: zero hits (P6).
- Install/lifecycle scripts: none in any of the three package.json files.
- Other runtime files: none — complete runtime JS inventory is the three index.js files (plus out-of-scope test/cookieParser.js).
