# Node.js patch audit: iconv-lite (pass B, blind)

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#22 — `iconv-lite` (https://github.com/pillarjs/iconv-lite)
- Library: iconv-lite 1.0.0-alpha.3, `master` @ `8601be45b43c1677914a2ff7733c52841d987c3f`, git checkout at `$PACKAGE_ROOT`, no local changes, zero runtime dependencies (`dependencies: {}`)
- Node.js baseline: main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (`$NODEJS_SOURCE`, read-only)
- Reproduction runtime: Node v24.19.0 (`repro/repro.mjs`, exit 0)
- Scope: all Node-resolvable entrypoints and reachable runtime code — exports `.` (node condition → `lib/index-node.js`; browser/default conditions → `lib/index-web.js`), `./web` → `lib/index-web.js`, `./encodings/*.js` subpath exports, plus legacy `main` (`lib/index-node.js`) and `browser` field map; i.e. the full shipped `lib/`, `backends/`, `encodings/` trees. Excluded: `generation/`, `test/`, `performance/`, `types/` tooling, eslint config, devDependencies, and the `node_modules/iconv-lite-generators` devtool (verified unreachable from runtime, C-016). No install/postinstall scripts exist.
- Coverage: source complete (every runtime file enumerated; all 6 skill pattern groups + 9 supplementary searches over the full runtime tree); upstream corroborated from the package's own git history and Changelog; runtime reproduction executed covering every entrypoint family and the sbcs/dbcs/utf16/internal codecs plus Node-stream and Web-stream APIs.

## Patching verdict

No patching was demonstrated, and the evidence is strong that none exists in
this scope. Counts:

- Shared core mutations: **0**
- Instance/application overrides of core objects: **0**
- Core module interception (loader/cache/extensions/bindings): **0** (pattern groups G5/G6 returned zero hits)
- Core source rewrites / on-disk patches: **0**
- Direct vs transitive: no transitive surface exists — the package has zero runtime dependencies
- Candidates: 17 examined, 0 confirmed, 17 rejected, **0 unresolved**

The library touches Node core only by (a) importing `node:stream` once
(`lib/iconv-node.js:3`) and subclassing `Transform` through its documented
`_transform`/`_flush` hooks, and (b) calling public `Buffer` statics from
`backends/node.js`. Everything it writes to is a library-owned instance,
subclass prototype, or freshly created object. A before/after runtime snapshot
of Buffer, string_decoder, stream prototypes, intrinsic prototypes,
module-loading internals, and 33 pinned function identities showed zero
differences after importing every entrypoint and exercising representative
encode/decode and streaming paths.

The historical `extendNodeEncodings()` mechanism (which in 0.4.x monkeypatched
`Buffer.prototype` and `Readable.prototype`) is confirmed absent at this ref —
see Supporting context.

## Confirmed Node.js patches

None. No reachable write or replacement of core APIs, globals, shared
prototypes, core-backed instances, core module loading, or core source was
found. (Private API usage: none found either — the library uses only public,
documented Node and WHATWG APIs.)

## Candidate ledger and unresolved questions

Full ledger with evidence in [`candidates.md`](./candidates.md). Summary:

| ID | Site and core target | Status | Reason (short) |
| --- | --- | --- | --- |
| C-001 | `lib/iconv-node.js:3`, `node:stream` import | rejected | read-only namespace import |
| C-002 | `lib/streams.js:4,45`, `extends streamModule.Transform` | rejected | documented subclass hooks (`$NODEJS_SOURCE/lib/internal/streams/transform.js:162`) |
| C-003 | `lib/streams.js:36,77`, `collect()` | rejected | defined on library subclass, not `Readable.prototype` |
| C-004 | `backends/node.js:6-42`, Buffer statics | rejected | call-only use of public API (`$NODEJS_SOURCE/lib/buffer.js:351,454,658,684`) |
| C-005 | `lib/iconv.js:27`, `Object.defineProperty(this, "backend", …)` | rejected | library instance, not core |
| C-006 | `lib/iconv.js:166`, `delete this.backend` | rejected | own accessor on library instance |
| C-007 | `encodings/index.js:14`, `Object.assign` | rejected | fresh null-prototype target; `assign` called, not replaced |
| C-008 | `lib/iconv.js:11,168`, `{ __proto__: null }` | rejected | object-literal creation, no setPrototypeOf |
| C-009 | `encodings/utf7.js:112,147`, `backends/web.js:29,34,114,132`, Uint8Array hex/base64 APIs | rejected | feature detection + fallback, no polyfill installed |
| C-010 | `encodings/dbcs-codec.js:125`, `Object.prototype.hasOwnProperty.call` | rejected | read-only borrow |
| C-011 | `backends/web.js:7,8`, `encodings/internal.js:51`, `encodings/utf16.js:90`, `encodings/utf7.js:92-142`, TextEncoder/TextDecoder/atob/btoa | rejected | instantiation/calls only |
| C-012 | `lib/web-streams.js:33,37`, `new TransformStream(…)` | rejected | documented constructor usage |
| C-013 | `lib/iconv.js:148,162`, `typeof TransformStream` | rejected | capability read |
| C-014 | `lib/iconv.js:172-176`, import-time `console.error` guard | rejected | log call, no mutation |
| C-015 | historical `extendNodeEncodings()` / `lib/extend-node.js` | rejected (absent) | removed upstream in v0.6.0 (commit `b7288df`); no code remnant at this ref |
| C-016 | `node_modules/iconv-lite-generators` | rejected (out of scope) | devtool unreachable from runtime entrypoints |
| C-017 | codec-internal property writes (`encodings/*.js`) | rejected | all writes target `this`/locals/library-allocated arrays |

Unresolved: none.

## Supporting context

- **`extendNodeEncodings()` outcome (task-mandated check).** In iconv-lite
  0.4.x, the opt-in `iconv.extendNodeEncodings()` (in `lib/extend-node.js`)
  monkeypatched `Buffer.prototype.toString`, `Buffer.prototype.write`,
  `SlowBuffer.prototype.toString/write`, `Buffer.isEncoding`,
  `Buffer.byteLength`, `Readable.prototype.setEncoding`, and added
  `Readable.prototype.collect`, keeping originals for an undo call. At the
  audited ref the mechanism is **completely removed**: no `extend-node.js`
  file, no occurrence of the symbol in any code (only Changelog prose), and no
  successor mechanism. Upstream corroboration: package git history commit
  `b7288df` ("Removed extendNodeEncodings mechanism. It didn't work in Node
  v4+ and was deprecated 5 years ago in v0.4.12"), shipped in v0.6.0
  (2020-06-08), recorded at `Changelog.md:213` and deprecation note at
  `Changelog.md:326` (v0.4.12). Even historically it was opt-in, never applied
  on plain import. The runtime reproduction additionally pins the identities of
  every method the old mechanism patched — all unchanged.
- **Backend injection, not patching.** The 1.x architecture moves all
  platform-specific byte work behind an injected backend object
  (`backends/node.js` uses `Buffer` statics; `backends/web.js` uses
  TextEncoder/TextDecoder/typed arrays). `setBackend()` mutates only the
  library's own `Iconv` instance (`lib/iconv.js:164-169`). The `node:stream`
  module is dependency-injected into `lib/streams.js` to keep it out of
  browser bundles; the module object itself is never modified.
- **Feature detection without polyfills.** Newer platform APIs
  (`Uint8Array.fromHex/fromBase64`, `toHex/toBase64`, Node >= 25 / modern
  browsers) are detected with `typeof` and used opportunistically; pure-JS
  fallbacks run otherwise. Nothing is installed onto globals or prototypes.
- The old 0.4.x-era `StringDecoder` compatibility shims are also gone
  (`Changelog.md:195`, upstream PR ashtuchkin/iconv-lite#331); `string_decoder`
  is not referenced anywhere in the current code.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (`lib/`, `backends/`, `encodings/`) | skill pattern groups G1-G6 (`rg -n …`, see `searches.md`) | G5/G6 zero hits; G1-G4 hits all resolved to reads, instance writes, or documented extension points |
| `$PACKAGE_ROOT` whole repo | `rg -i "extendNodeEncodings|StringDecoder|string_decoder" --hidden --glob '!.git'`; `find . -name "*extend*"` | code hits zero; Changelog prose only; no `extend-node.js` |
| `$PACKAGE_ROOT` git history (read-only) | `git log --all -- lib/extend-node.js`; `git log -S 'extendNodeEncodings' -- lib/` | removal commit `b7288df` (v0.6.0, 2020-06-08) corroborates deliberate upstream removal |
| Upstream changelog | https://github.com/pillarjs/iconv-lite/blob/8601be45b43c1677914a2ff7733c52841d987c3f/Changelog.md (lines 195, 213, 326) | documents 0.4.12 deprecation, 0.6.0 removal of `extendNodeEncodings`, and removal of the StringDecoder.end compat check (ashtuchkin/iconv-lite#331) |
| `$NODEJS_SOURCE/lib/internal/streams/transform.js:116-128,162` @ `d44625a4b80` | `grep -n "Transform.prototype._transform|_flush"` | `_transform`/`_flush` are the documented implementer hooks; subclassing is supported extension, not patching |
| `$NODEJS_SOURCE/lib/buffer.js:351,454,658,684` @ `d44625a4b80` | `grep -n "Buffer.from|Buffer.alloc|Buffer.concat|Buffer.isBuffer"` | the Buffer statics used by `backends/node.js` are public API, called read-only |
| Runtime reproduction | `node repro/repro.mjs "$PACKAGE_ROOT"` (Node v24.19.0) | exit 0; "NO DIFFERENCES DETECTED" across all snapshotted core surfaces; see `repro/results.txt` |

## Coverage and limitations

- Entrypoints covered: exports `.` node condition (`lib/index-node.js`),
  browser/default conditions and `./web` (`lib/index-web.js`), the
  `./encodings/*.js` subpath exports (same files as the transitively loaded
  `encodings/` tree; one also imported directly in the repro), legacy `main`
  and `browser` fields. Every file under `lib/`, `backends/`, `encodings/`
  (30 runtime JS files, ~5.4k lines) was either read or covered by all
  mutation-pattern searches; every search hit was resolved.
- Dependencies: `dependencies` is empty; `node_modules` contains only the
  private `iconv-lite-generators` devtool, verified unreachable from runtime
  (C-016). No transitive runtime surface exists. No lifecycle scripts.
- Node.js core files consulted (read-only, per skill table): `lib/stream.js`,
  `lib/internal/streams/transform.js`, `lib/buffer.js` at `d44625a4b80`.
  `string_decoder` baseline inspection was unnecessary — the library never
  references it. No whole-tree Node scans were performed.
- Reproduction (Node v24.19.0) exercised: sbcs (win1251), dbcs (gbk,
  shiftjis), utf16-be, internal utf8/base64/hex, `encodeStream`/`decodeStream`
  (Node Transform), `decodeWebStream` (WHATWG), and the web backend via
  `lib/index-web.js`. Not exercised: utf32/utf7 conversion paths and the
  `invalidCharHandler` option at runtime (their code was read and
  pattern-searched statically; utf7 module load was exercised), and
  non-little-endian platforms. A tested branch cannot prove universal absence,
  but no untested branch contains any candidate mutation site.
- Blind-pass constraint honored: no other audit artifacts were read.
- What would change the verdict: a demonstrated write to a core object
  reachable from a runtime entrypoint — none was found by six pattern groups,
  nine supplementary searches, file reads, or runtime diffing.

## Changes since the previous audit

First audit (pass B, blind; no prior report existed in this folder).
