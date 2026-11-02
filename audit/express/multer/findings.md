# multer — findings detail (files, lines, issues)

Library: multer 2.5.0 (main @ `2c380d06cdaacc68bbef8b36244493a3d33d6b88`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `lib/make-middleware.js` | 66 | `req.pipe(busboy)` | documented Readable call (`$NODEJS_SOURCE/lib/internal/streams/readable.js:978`) |
| `lib/make-middleware.js` | 136 | `req.body = Object.create(null)` | library-owned metadata key; **null-prototype** container (closes pollution path) |
| `lib/make-middleware.js` | 160, 231 | `req.unpipe(busboy)` | documented call (`readable.js:1180`) |
| `lib/make-middleware.js` | 168–169 | `req.resume()` | documented call (`readable.js:1327`) |
| `lib/make-middleware.js` | 294 | `appendField(req.body, fieldname, value)` | writes into the null-prototype body |
| `lib/file-appender.js` | 13–14, 57 | `req.files` / `req.file` writes | library metadata keys; no core member shadowed (`$NODEJS_SOURCE/lib/_http_incoming.js`) |
| `storage/disk.js` | — | `fs.createWriteStream`, `mkdir`, `unlink` | documented fs calls; fs module untouched |

## Dependency analysis

| Dependency | Key mechanism | Finding |
|---|---|---|
| busboy@1.6.0 | Multipart/URLEncoded Writable subclasses, FileStream Readable subclass | documented `_write`/`_destroy`/`_final`/`_read` contract (`writable.js:837,1166`, `readable.js:974`); `_writecb`/`_readcb`/`_bparser` are busboy-owned fields on busboy-owned instances |
| streamsearch@1.1.0 | pattern matcher | plain class mutating only its own lookbehind buffer |
| append-field@1.0.0 | `lib/set-value.js` property assembly | writes land on the caller-passed context (multer's null-prototype body) or its own `Object.create(null)` intermediates; `__proto__`/`constructor` keys inert — reproduced; installed artifact byte-identical to registry |
| type-is / media-typer / mime-types / mime-db | load-time table building | own exports only |

## Supporting context — forward-compat exposure worth tracking (not a patch)

**busboy uses undocumented core Buffer.prototype methods at 18 sites:**

| File | Sample lines | Methods |
|---|---|---|
| `node_modules/busboy/lib/types/multipart.js` | 63, 73, 112, … | `chunk.latin1Slice(start, pos)`, `utf8Slice`, `ucs2Slice`, `base64Slice` |

These are **calls to private core APIs** that Node installs on `Buffer.prototype` itself (`$NODEJS_SOURCE/lib/internal/buffer.js:1071-1076`) — reads, not mutations. Risk: these methods are undocumented; if Node.js removes/renames them (they are not part of the public API contract), busboy — and therefore multer's multipart parsing — breaks at runtime. Upstream discussion: mscdex/busboy#319 (closed). This is the single most relevant item in this package for the "future Node.js changes" tracking goal.

Also noted: multer carries a library-level workaround for busboy bug mscdex/busboy#6 (no core involvement).

## Negative sweeps (both passes, zero hits)

- Method/prototype reassignment on req/streams: none anywhere in scope (`req.pipe = `, `_events` access: zero)
- `setPrototypeOf`/`__proto__` writes to shared objects, `defineProperty` on core: none
- Loader interception (`require.cache`, `require.extensions`, `Module._*`, `registerHooks`): none
- `process.binding`/`internalBinding`/`internal/` imports: none
- Install scripts / native code: none

## Runtime corroboration

- Pass A (Node v24.19.0): 26 core identities (fs/stream/EventEmitter/Buffer/Object/Error) unchanged after require + a full multipart middleware run including `__proto__`-shaped field names; `Object.prototype` unpolluted.
- Pass B: identity snapshot across load/instantiation — unchanged.
