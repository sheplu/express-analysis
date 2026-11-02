# serve-favicon — findings detail (files, lines, issues)

Library: serve-favicon 2.5.1 (master @ `1d9a8e7261557ec9a40463fd54e99b601016598c`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 73, 216, 222 | `res.statusCode = 405/304/200` | documented writable instance property (prototype default at `$NODEJS_SOURCE/lib/internal/http/server.js:285`) |
| `index.js` | various | `res.setHeader(...)`, `res.end(...)` | documented API calls (`outgoing.js:813`, `:1289`) |
| `index.js` | — | `fs.readFileSync(path)` | documented call; fs untouched |
| `node_modules/parseurl/index.js` | 54 | `req._parsedUrl = parsed` | library-owned cache key on the live IncomingMessage; key absent from core (`lib/internal/http/incoming.js`) |
| `node_modules/parseurl/index.js` | 84 | `req._parsedOriginalUrl = parsed` | same |
| `node_modules/parseurl/index.js` | 128–141 | `url.path/href/pathname/query/search = …` | writes to a **freshly constructed local** `new Url()`; `Url.prototype` and the url module untouched |
| `node_modules/safe-buffer/index.js` | 13 | `module.exports = buffer` (modern branch) | pure re-export; `require('safe-buffer') === require('buffer')` verified at runtime |
| `node_modules/safe-buffer/index.js` | 16–27 (legacy, dead ≥ Node 4.5) | `copyProps(buffer, exports)`, `SafeBuffer.prototype = Object.create(Buffer.prototype)` | copies core → own object; reads `Buffer.prototype`, never writes it |
| `node_modules/etag/index.js` | 29 | saved `Object.prototype.toString` reference | read-only alias |
| `node_modules/etag/index.js` | 138–145 | EISDIR-shaped error construction | library-owned Error object |
| `node_modules/fresh`, `node_modules/ms` | — | — | import no core modules at all |

## Negative sweeps (both passes, zero hits)

- Patch vocabulary (monkeypatch/wrap/shim/polyfill/override)
- Loader interception (`require.cache`, `require.extensions`, `Module._*`, `registerHooks`, `syncBuiltinESMExports`)
- Internals (`process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'`)
- `defineProperty`/`delete`/`setPrototypeOf` against core objects
- Install scripts / nested deps / entrypoint remapping: none

## Runtime corroboration (both passes, Node v24.19.0)

Identity/descriptor/own-property snapshots of Buffer + buffer module, url + `Url.prototype`, http IncomingMessage/ServerResponse prototypes, fs, module loader, `Date.parse`, `Object.prototype` — zero diffs after require + middleware exercise (favicon hit, 304 path, 405 path). Only request expando added: `_parsedUrl`.

## Node.js-change risk

- None material. The library relies solely on documented stable API (`statusCode`, `setHeader`, `end`, `fs.readFileSync`) plus the legacy-but-public `url.Url` class in parseurl's slow path. parseurl's fast path is a local copy of unmerged joyent/node PR #7878 logic — self-contained, unaffected by core changes.
- Ecosystem convention note: `req._parsedUrl` is a parseurl/express convention; a hypothetical core property of the same name would collide (no indication Node.js plans one).
