# Search log — iconv-lite pass A

Scope for all package searches unless noted: `$PACKAGE_ROOT` runtime tree only
(`lib/`, `encodings/`, `backends/`), `*.d.ts` excluded where noted. Out of scope:
`generation/`, `test/`, `performance/`, `types/`, eslint config, devDependencies.

Package: iconv-lite 1.0.0-alpha.3 @ `8601be45b43c1677914a2ff7733c52841d987c3f` (branch master).
Node.js baseline: `$NODEJS_SOURCE` @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (main), read-only, file-scoped greps only.

## Skill candidate pattern groups (six mandatory groups)

| # | Pattern | Scope | Result |
| --- | --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | lib, encodings, backends | HITS: all static ESM imports of sibling library files; exactly one core import in whole runtime tree: `lib/iconv-node.js:3` `import * as stream from "node:stream"`. No `require()`, no dynamic `import()`, no `require.cache`. |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | lib, encodings, backends | HITS: `backends/node.js` read-only calls to `Buffer.from/alloc/concat/isBuffer`; comments/types; `extends` at `lib/streams.js:4,45` (subclass `streamModule.Transform`), `lib/iconv-node.js:7` (`NodeIconv extends Iconv`, library class), `encodings/internal.js:87` (library class). No `process`, `global`, or `globalThis` usage in runtime JS. No `inherits(`. |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | lib, encodings, backends | HITS: `encodings/dbcs-codec.js:125` (`Object.prototype.hasOwnProperty.call` — read); `encodings/utf7.js:146-147` (`typeof Uint8Array.prototype.toBase64` — feature-detect read); `encodings/index.js:14` (`Object.assign({ __proto__: null }, ...)` — new library object); `lib/iconv.js:11,168` (`{ __proto__: null }` literals); `lib/iconv.js:27` (`Object.defineProperty(this, "backend", ...)` — library instance). No `setPrototypeOf`, no `Reflect.*`. |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | lib, encodings, backends | HITS: comments/typedoc only (`lib/index.d.ts:22,32` "Override the default endianness" — an options doc; `encodings/utf32.js:237,307` comments; `encodings/dbcs-data.js:151` comment about an MS IE patch). No code hits. |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | lib, encodings, backends | ZERO HITS. |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | lib, encodings, backends | ZERO HITS. |

## Supplementary candidate searches

| Pattern / check | Scope | Result |
| --- | --- | --- |
| `(Buffer\|Transform\|Readable\|Writable\|Duplex\|stream\|StringDecoder\|TextDecoder\|TextEncoder\|TransformStream\|Uint8Array\|globalThis\|process)\s*(\.\|\[)...\s*=[^=]` (writes to core-named receivers) | runtime JS, no `.d.ts` | ZERO HITS. |
| `\bdelete\s` and `Object.defineProperty(` on non-`this` receiver (PCRE) | runtime JS | One hit: `lib/iconv.js:166` `delete this.backend` — own property of library instance. |
| `^\s*[A-Z]\w*\.\w+(\.\w+)*\s*=[^=]` (any assignment to a capitalized global's property) | runtime JS | One hit: `encodings/utf7.js:322` `UTF7_NONDIRECT.lastIndex = cursor` — library-owned module-level RegExp. |
| `Object\.(freeze\|seal\|preventExtensions)` | runtime JS | ZERO HITS. |
| `string_decoder\|StringDecoder` | runtime JS | ZERO HITS (lib/streams.js does not use StringDecoder; decoding is done by library codecs). |
| `from "node:` / `from 'node:` / dynamic `import(node:` | runtime JS | One hit: `lib/iconv-node.js:3` `node:stream`. The only core module import in runtime scope. |
| `\beval\b\|new Function\|Function(\|setTimeout\s*\(\s*['"]` (hidden dynamic code) | runtime JS | ZERO HITS. |
| `extendNodeEncodings\|undoExtendNode\|extend-node\|supportsNodeEncodingsExtension` | entire repo incl. tests/docs (hidden files, `.git` excluded) | HITS only in `Changelog.md:213,326,391` (historical notes). No code. |
| `git log --all -S 'extendNodeEncodings'` | package git history | Mechanism removed in commit `b7288dfa87cec46a58079fa39f3a7ba1590fe09e` (2020-06-08, released as 0.6.0): deleted `lib/extend-node.js` (217 lines), `test/extend-node-test.js`, README section. |
| `generation\|iconv-lite-generators` | lib, encodings, backends | One hit: comment at `encodings/sbcs-data-generated.js:1`. No runtime import of the devtool. `node_modules/iconv-lite-generators` is a workspace symlink to `generation/` — not reachable from any runtime entrypoint; excluded. |
| `(streamModule\|backend\|iconv)\s*(\.\|\[)...=[^=]` (writes through injected receivers) | runtime JS | ZERO HITS. |
| `globalThis` | runtime JS | ZERO HITS. |
| `function\|=>\|class\|require\|import` in `encodings/tables/*.js` | tables | Only the uniform lazy `export default function getTable ()` wrapper; pure data otherwise. |
| `"(pre\|post)?install"` in package.json | package.json | No install/postinstall scripts. |
| Entrypoint enumeration (package.json `main`, `exports`, `browser`) | package.json | `.` node → `lib/index-node.js`; `.` browser/default → `lib/index-web.js`; `./web` → `lib/index-web.js`; `./encodings/*.js` wildcard → `encodings/*.js`; legacy `browser` map `lib/index-node.js` → `lib/index-web.js`. All included in scope. |

## Node.js core baseline lookups (file-scoped, no tree scans)

| File | Query | Result |
| --- | --- | --- |
| `$NODEJS_SOURCE/lib/stream.js` | `Transform` | line 106: `Stream.Transform = require('internal/streams/transform')`. |
| `$NODEJS_SOURCE/lib/internal/streams/transform.js` | `_transform\|_flush` | lines 113-116 accept `options.transform/flush`; line 162 `Transform.prototype._transform` throws `ERR_METHOD_NOT_IMPLEMENTED` — i.e. subclasses implementing `_transform`/`_flush` is the documented extension contract. |
| `$NODEJS_SOURCE/lib/buffer.js` | static definitions | `Buffer.from` :351, `Buffer.alloc` :454, `Buffer.isBuffer` :658, `Buffer.concat` :684 — public statics; iconv-lite only calls them. |
| `$NODEJS_SOURCE/lib/internal/streams/writable.js` | `decodeStrings` | line 321: documented constructor option; iconv-lite sets it on its own options object. |
| `$NODEJS_SOURCE/lib/internal/streams/readable.js` | `defaultEncoding\|setEncoding` | encoding is a documented Readable option; iconv-lite sets `options.encoding` on its own options object. |

## Runtime reproduction

`node repro-no-mutation.mjs "$PACKAGE_ROOT"` (script beside this file), Node v24.19.0:
snapshots own-property descriptors and function identities of Buffer (statics),
Buffer.prototype, Uint8Array.prototype, stream.Transform (+.prototype),
Readable.prototype, Writable.prototype, Object.prototype, String.prototype,
TextDecoder/TextEncoder/TransformStream prototypes before import, then imports
both Node-resolvable entrypoints (`lib/index-node.js`, `lib/index-web.js`) and
exercises internal/sbcs/dbcs/utf16/utf32/utf7/base64/hex codecs plus Node
streams and Web streams. Result: **PASS — no core object mutations detected.**
