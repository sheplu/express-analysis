# cookie-parser — findings detail (files, lines, issues)

Library: cookie-parser 1.4.7 (master @ `1f2a3a2037c4efe01605e064e7cc326008be7287`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 49 | `var cookies = req.headers.cookie` | read-only use of public headers |
| `index.js` | 51 | `req.secret = secrets[0]` | library-owned metadata key; absent from core IncomingMessage |
| `index.js` | 52–53 | `req.cookies = Object.create(null)` / `req.signedCookies = Object.create(null)` | library metadata; null-prototype containers (pollution-safe) |
| `index.js` | 60, 64–65, 69 | reassignment of `req.cookies`/`req.signedCookies` with parsed values | same keys, same classification |
| `index.js` | 177 | `delete` on parse output | library-owned object |

Core baseline: `$NODEJS_SOURCE/lib/internal/http/incoming.js` (via the DEP0199 `lib/_http_incoming.js` re-export) — defines none of `secret`, `cookies`, `signedCookies`.

## Dependency analysis

| Dependency | Key sites | Finding |
|---|---|---|
| cookie@0.7.2 | `index.js:23-24` | read-only captures of `Object.prototype.toString`/`hasOwnProperty`; otherwise pure string/regex parse/serialize; **imports no core module** |
| cookie-signature@1.0.6 | `index.js:5,16-24` | `require('crypto')` + plain `createHmac`/`createHash` calls; no member reassignment; no `timingSafeEqual` in this version (sha1-digest comparison in unsign) |

## Negative sweeps (both passes, zero hits)

- Patch vocabulary; loader interception (`require.cache`, `Module._*`, `require.extensions`, `registerHooks`); bindings/internals (`process.binding`, `internalBinding`); prototype/descriptor mutation (`setPrototypeOf`, `__proto__` writes, `defineProperty` on core); Buffer/process/global writes; install scripts; native code.

## Runtime corroboration (both passes, Node v24.19.0)

13 core-state checkpoints (IncomingMessage prototype, crypto/Buffer/Module/JSON identities, `Object.prototype`, globalThis key set) identical before/after `require('cookie-parser')` and after middleware execution on a real `http.IncomingMessage`; added request fields confirmed as own instance properties.

## Node.js-change risk

None material. The library depends only on the public `req.headers` getter and stable crypto APIs. The theoretical collision — Node.js adding `cookies`/`signedCookies`/`secret` members to IncomingMessage — would conflict with half the Express ecosystem and is tracked as an ecosystem-wide convention issue, not a patch.
