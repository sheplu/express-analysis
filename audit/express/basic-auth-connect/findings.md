# basic-auth-connect — findings detail (files, lines, issues)

Library: basic-auth-connect 1.1.0 (master @ `856183e95f7bea8579c4ee07f225b2e3edb8b8b8`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 79 | `new Buffer(parts[1], 'base64')` | deprecated constructor **call** (DEP0005; delegates to `Buffer.from`, `$NODEJS_SOURCE/lib/buffer.js:320`); no mutation of Buffer/prototype |
| `index.js` | 94, 100 | `req.user = req.remoteUser = user` | library-owned expando metadata on the live IncomingMessage; neither name exists on core (`$NODEJS_SOURCE/lib/internal/http/incoming.js:62-106`) |
| `index.js` | 118 | `res.statusCode = 401` | documented writable instance property (core prototype default at `lib/internal/http/server.js:285`) |
| `index.js` | 119–120 | `res.setHeader('WWW-Authenticate', …)` / `res.end('Unauthorized')` | documented API calls (`outgoing.js:813`, `:1289`) |
| `index.js` | 134 | `http.STATUS_CODES[code]` | read-only lookup |
| `index.js` | 135 | `err.status = code` | property on library-created Error |

## Dependency: tsscmp@1.0.6 (sole runtime dep)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `lib/index.js` | 17–18 | `if (crypto.timingSafeEqual) return crypto.timingSafeEqual(a, b)` | feature-detect read + call; nothing assigned to `crypto` |
| `lib/index.js` | 20–25 | byte-compare fallback loop | local code, never installed as polyfill (pre-Node-6.6.0 path, dead on supported Node) |
| `lib/index.js` | 31–33 | `crypto.pseudoRandomBytes(32)` (DEP0115 alias), `crypto.createHmac('sha256', …)` | plain invocations |

## Negative sweeps (both passes, zero hits)

- Prototype/descriptor mutation: `setPrototypeOf`, `__proto__`, `defineProperty/ies`, `Reflect.*`
- Patch vocabulary: monkeypatch/patch/wrap/shim/polyfill/override
- Loader interception: `require.cache`, `require.extensions`, `Module._*`, `registerHooks`, `syncBuiltinESMExports`
- Internals: `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'`
- No install/lifecycle scripts; no native code

## Runtime corroboration (pass A)

Node v24.19.0: 17 identity/descriptor/key-set snapshots (http, crypto, Buffer, Module, require.extensions, globalThis) unchanged across `require` + 12 middleware invocations covering async-callback, sync-callback, and user/pass modes; only observed writes were `user`/`remoteUser` on the caller-supplied req.

## Node.js-change risk

- `index.js:79` uses the deprecated `new Buffer(string, encoding)` (DEP0005). If Node.js ever removes the constructor alias, **this middleware throws at auth time**. Low effort fix: `Buffer.from(parts[1], 'base64')`. This is the only forward-compat exposure; it is API deprecation, not patching.
- tsscmp calls `crypto.pseudoRandomBytes` (DEP0115, alias of `randomBytes`); same class of exposure, same remedy upstream.
