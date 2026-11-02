# iconv-lite — findings detail (files, lines, issues)

Library: iconv-lite 1.0.0-alpha.3 (master @ `8601be45b43c1677914a2ff7733c52841d987c3f`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches; no transitive surface (zero runtime deps).

## Why iconv-lite cannot monkeypatch core at this ref

The whole runtime tree (~4,100 lines: `lib/`, `encodings/`, `backends/`) imports exactly one Node core module: `node:stream` at `lib/iconv-node.js:3`. That namespace object is dependency-injected into `lib/streams.js` (deliberate architecture, see comment `lib/streams.js:1-2`) and used only to **extend** `Transform`. The web entrypoint (`lib/index-web.js`) loads no core module at all. There is no dependency tree to carry a transitive patch.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `lib/iconv-node.js` | 3 | `import * as stream from "node:stream"` | read-only namespace import |
| `lib/streams.js` | 4, 45 | `class IconvLite{Encoder,Decoder}Stream extends streamModule.Transform` with `_transform`/`_flush` | documented extension contract (`$NODEJS_SOURCE/lib/internal/streams/transform.js:162,113-116`); core prototypes untouched |
| `lib/streams.js` | 7, 48 | `options.decodeStrings = false`, `options.encoding = "utf8"` | writes to fresh/caller options objects (documented stream options) |
| `backends/node.js` | throughout | `Buffer.alloc/from/concat/byteLength...` calls (`$NODEJS_SOURCE/lib/buffer.js:351,454,658,684`) | call-only public statics; never reassigned |
| `encodings/utf7.js` | 147 | `Uint8Array.prototype.toBase64` existence check | feature-detect **read** (ES base64 proposal / Node 25+); never written |

## Library-owned writes (rejected candidates)

| File | Line(s) | Write | Target |
|---|---|---|---|
| `lib/iconv.js` | 27 | `Object.defineProperty(this, "backend", {configurable getter that throws})` | library instance (helpful unconfigured-backend error) |
| `lib/iconv.js` | 166 | `delete this.backend; this.backend = backend` | library instance (setBackend) |
| `encodings/index.js` | 14 | `Object.assign({ __proto__: null }, ...tables)` | fresh null-prototype object |
| `encodings/utf7.js` | 322 | `UTF7_NONDIRECT.lastIndex = ...` | library-owned RegExp |
| `backends/web.js`, `lib/web-streams.js` | — | TextDecoder/TextEncoder/TransformStream instantiation | web-platform global **usage**, no global writes |

## Historical patch mechanism — confirmed absent

- `iconv.extendNodeEncodings()` (0.4.x, opt-in) patched `Buffer.prototype.toString`/`write`, `SlowBuffer.prototype`, `Buffer.isEncoding`/`byteLength`, `Readable.prototype.setEncoding`/`collect`.
- Deprecated 0.4.12 (2015); **removed in 0.6.0** (2020-06-08), upstream commit `b7288dfa87cec46a58079fa39f3a7ba1590fe09e` (deleted `lib/extend-node.js`, 217 lines).
- At this ref: zero code occurrences (`rg` full-tree sweep; Changelog prose only at `Changelog.md:213,326,391`). The 0.4.x `string_decoder` shim is also gone (`Changelog.md:195`, ashtuchkin/iconv-lite#331); `string_decoder` never referenced.
- Pass B's repro pinned every historically-patched identity (Buffer statics/prototype, StringDecoder, Readable prototype) — all unchanged after import + exercise.

## Excluded after reachability verification

- `node_modules/iconv-lite-generators` — symlink to `generation/` (dev workspace codegen tool). Not reachable from any runtime entrypoint; only reference is a comment at `encodings/sbcs-data-generated.js:1`. `generation/`, `test/`, `performance/` out of scope.

## Negative sweeps (both passes, zero hits in runtime scope)

- Module-loading interception: `require.cache`, `require.extensions`, `Module._load/_resolveFilename/_extensions/_compile`, `syncBuiltinESMExports`, `registerHooks`, loader hooks
- Internals: `process.binding`, `internalBinding`, `'internal/...'` specifiers
- Mutation primitives against core: `setPrototypeOf`/`__proto__` writes, `defineProperty/ies` on core objects, `Reflect.*` writes, deletions on core objects
- No install scripts, no native code, no bundled dist entrypoints

## Runtime reproduction (both passes, Node v24.19.0, PASS)

- Imported all Node-resolvable entrypoint families (`lib/index-node.js`, `lib/index-web.js`, `encodings/*` subpath) and exercised: win1251 (sbcs), gbk + shift-jis (dbcs), utf16-be, utf8/base64/hex, `encodeStream`/`decodeStream` round trips, `decodeWebStream`, web backend.
- Diffed before/after: Buffer statics + prototype, StringDecoder, Transform/Duplex/Readable/Writable/PassThrough prototypes, Object/Array/String/Function/Uint8Array prototypes, `Object.assign`, `Module._load/_resolveFilename/_extensions`, `require.extensions`, non-file `require.cache` entries, `process.binding`, global keys, 33 pinned function identities: **no differences**.

## Node.js-change risk

Minimal and documented-surface only:
1. **Transform subclass contract** — relies on documented `_transform`/`_flush` hooks and constructor options (`decodeStrings`, `encoding`). Only a breaking change to the public stream extension API would affect it.
2. **Public Buffer statics** — `alloc/from/concat/byteLength` call-only usage.
3. **`Uint8Array.prototype.toBase64` fast path** (`encodings/utf7.js:147`) — tracks the ES base64 proposal; behavior falls back gracefully where absent, but semantic changes to the proposal implementation in V8/Node would silently change which path runs.
4. The 0.6.x line (not this ref) remains the one deployed by most dependents; this master rewrite has no patching code to regress.
