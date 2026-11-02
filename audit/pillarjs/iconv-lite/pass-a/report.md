# Node.js patch audit: iconv-lite

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#22 — `iconv-lite` (convert character encodings in pure javascript), https://github.com/pillarjs/iconv-lite
- Library: iconv-lite 1.0.0-alpha.3, default branch `master` @ `8601be45b43c1677914a2ff7733c52841d987c3f`, git checkout at `$PACKAGE_ROOT` (unmodified)
- Node.js baseline: main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, `$NODEJS_SOURCE` (read-only, file-scoped lookups only)
- Reproduction runtime: Node v24.19.0 (package `engines` requires >=22)
- Scope: all Node-resolvable entrypoints and reachable runtime code — `exports` "." node condition → `lib/index-node.js` (also `main`); "." browser/default conditions and `./web` subpath → `lib/index-web.js`; `./encodings/*.js` wildcard subpath → `encodings/*.js`; legacy `browser` field map. Shipped runtime tree: `lib/`, `encodings/`, `backends/` (node + web backends). Zero runtime dependencies (`dependencies: {}`); no install scripts. Out of scope: `generation/`, `test/`, `performance/`, `types/` tooling, eslint config, devDependencies.
- Coverage: source — complete (every runtime JS file read or line-scanned; six skill pattern groups plus supplementary write-pattern sweeps, all logged in `searches.md`); upstream — git history checked for the historical `extendNodeEncodings` mechanism; runtime — descriptor/identity diff over 12 core objects across both entrypoints, PASS.

## Patching verdict

No patching was demonstrated. **Confirmed shared core mutations: 0. Confirmed instance/application overrides of core objects: 0. Direct or transitive: none (the package has zero runtime dependencies). Unresolved candidates: 0.**

The entire runtime tree imports exactly one Node core module — `node:stream` at `lib/iconv-node.js:3` — and uses it solely to subclass `Transform` through its documented extension contract. The Node backend (`backends/node.js`) only *calls* public `Buffer` statics; the web backend and codecs only instantiate/call `TextEncoder`, `TextDecoder`, `TransformStream`, `atob`/`btoa` and feature-detect `Uint8Array` base64/hex helpers. No assignment, deletion, descriptor change, prototype replacement, module interception, loader hook, or binding access targets any core object. The historical 0.4.x `extendNodeEncodings()` Buffer/stream monkeypatch is confirmed absent at this ref (see below).

A runtime check (import of both Node-resolvable entrypoints plus exercising internal/sbcs/dbcs/utf16/utf32/utf7/base64/hex codecs, Node streams, and Web streams) found zero own-property or descriptor changes on `Buffer` (statics), `Buffer.prototype`, `Uint8Array.prototype`, `stream.Transform` (+ prototype), `Readable.prototype`, `Writable.prototype`, `Object.prototype`, `String.prototype`, and the `TextDecoder`/`TextEncoder`/`TransformStream` prototypes.

## Confirmed Node.js patches

None. No candidate rose to a confirmed patch; no private-API usage or extension point is promoted into this section.

## Candidate ledger and unresolved questions

Full ledger with evidence in [`candidates.md`](candidates.md). Summary:

| ID | Site and core target | Status | Reason (abridged) |
| --- | --- | --- | --- |
| C-001 | `lib/index-node.js:4` `iconv.setBackend(...)` | rejected as patch | mutates library-owned Iconv instance |
| C-002 | `lib/streams.js:4,45` `extends streamModule.Transform` | rejected as patch | documented subclass contract (`$NODEJS_SOURCE/lib/internal/streams/transform.js:162,113-116`); methods only on subclass prototypes |
| C-003 | `lib/streams.js:7,48` writes to `options` | rejected as patch | caller-provided plain object; documented constructor options |
| C-004 | `lib/iconv.js:27` `Object.defineProperty(this, "backend", ...)` | rejected as patch | library instance |
| C-005 | `lib/iconv.js:166` `delete this.backend` | rejected as patch | own property of library instance |
| C-006 | `backends/node.js` Buffer static usage | rejected as patch | read-only calls to public API (`$NODEJS_SOURCE/lib/buffer.js:351,454,658,684`) |
| C-007 | `encodings/utf7.js:147`, `backends/web.js:31,36,110,131` feature detection | rejected as patch | reads only |
| C-008 | `encodings/utf7.js:322` `UTF7_NONDIRECT.lastIndex =` | rejected as patch | library-owned RegExp |
| C-009 | `encodings/dbcs-codec.js:125` `Object.prototype.hasOwnProperty.call` | rejected as patch | non-mutating intrinsic call |
| C-010 | `encodings/index.js:14`, `lib/iconv.js:11,168` `__proto__: null` literals | rejected as patch | creates new null-proto library objects |
| C-011 | `lib/web-streams.js`, `backends/web.js`, `encodings/internal.js:51`, `encodings/utf7.js:141` web-platform globals | rejected as patch | instantiation/calls only; runtime prototype diff clean |
| C-012 | `lib/iconv.js:15-24`, `lib/iconv-node.js:14-16` method binding on `this` | rejected as patch | library instances |
| C-013 | `lib/iconv.js:172-175` import-time `console.error` warning | rejected as patch | side effect, no mutation |
| C-014 | historical `extendNodeEncodings()` (Buffer.prototype / stream internals monkeypatch) | rejected — absent at this ref | removed upstream in 0.6.0; zero code remnants |
| C-015 | `node_modules/iconv-lite-generators` → `generation/` | excluded | dev-only workspace tool, unreachable from runtime entrypoints (verified) |
| C-016 | codec/table state writes across `encodings/` | rejected as patch | library-owned instances, module locals, lazy pure-data tables |

Confirmed: 0 · Rejected: 15 · Excluded after reachability check: 1 · Unresolved: 0.

## Supporting context

- **`extendNodeEncodings` (historical, explicitly checked):** iconv-lite 0.4.x shipped `lib/extend-node.js`, which monkeypatched `Buffer.prototype` (e.g. `toString`/`write`) and Node stream internals to add iconv-lite encodings to native APIs. At this ref the mechanism is entirely gone: a full-tree search for `extendNodeEncodings|undoExtendNode|extend-node|supportsNodeEncodingsExtension` hits only historical notes in `Changelog.md:213,326,391`. Upstream corroboration: deprecated in 0.4.12 (2015), removed in release 0.6.0 by commit `b7288dfa87cec46a58079fa39f3a7ba1590fe09e` (2020-06-08, "Removed `extendNodeEncodings` mechanism. It didn't work in Node v4+ and was deprecated 5 years ago in v0.4.12."), deleting `lib/extend-node.js` (217 lines) and its tests (https://github.com/ashtuchkin/iconv-lite/commit/b7288dfa87cec46a58079fa39f3a7ba1590fe09e, repo since moved to pillarjs/iconv-lite). No successor mechanism exists.
- **Supported stream extension:** `lib/streams.js` dependency-injects `node:stream` (comment: to avoid bundling it in browsers) and subclasses `Transform`, implementing `_transform`/`_flush` and a library-owned `collect` helper on its own subclass prototypes — the documented extension pattern, not an override of core behavior.
- **Backend abstraction:** `backends/node.js` (global `Buffer`) and `backends/web.js` (`TextEncoder`/`TextDecoder`/typed arrays) are pure call-through adapters; `setBackend` swaps them on the library's own `Iconv` instance.
- **Import-time side effects:** the only ones are `iconv.setBackend(backend)` on the library singleton (`lib/index-node.js:4`), module-local constant setup, and a `console.error` warning (`lib/iconv.js:172-175`) if source files were loaded in a non-UTF8 encoding. None touches core state.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree | six skill pattern groups + 12 supplementary sweeps (full log in `searches.md`) | G5 (module interception) and G6 (bindings/internals) zero-hit; all other hits traced in `candidates.md`; no write to any core object |
| `$PACKAGE_ROOT/package.json` | entrypoint/exports/scripts review | enumerated all conditional entrypoints; `dependencies: {}`; no install scripts |
| `$PACKAGE_ROOT` git history | `git log --all -S 'extendNodeEncodings'` | mechanism removed at `b7288dfa87cec46a58079fa39f3a7ba1590fe09e` (0.6.0); absent at audited ref |
| `$NODEJS_SOURCE/lib/stream.js:106`, `lib/internal/streams/transform.js:113-116,162` | file-scoped grep | confirms `_transform`/`_flush` subclass contract — C-002 is a supported extension |
| `$NODEJS_SOURCE/lib/buffer.js:351,454,658,684` | file-scoped grep | confirms `Buffer.from/alloc/isBuffer/concat` are public statics only called by the package |
| `$NODEJS_SOURCE/lib/internal/streams/writable.js:321`, `lib/internal/streams/readable.js` | file-scoped grep | confirms `decodeStrings`/`encoding` are documented constructor options — C-003 |
| Runtime reproduction | `node repro-no-mutation.mjs "$PACKAGE_ROOT"` (script beside this report), Node v24.19.0 | PASS: no descriptor/identity change on 12 core objects after importing both entrypoints and exercising codecs + streams |
| Upstream repo | https://github.com/pillarjs/iconv-lite (history incl. ashtuchkin/iconv-lite) | removal commit of `extend-node.js` verified in local clone history |

## Coverage and limitations

- Entry points covered: `lib/index-node.js` (main; exports "." node), `lib/index-web.js` (exports "." browser/default, `./web`, legacy `browser` map), `encodings/*.js` (subpath wildcard — same files already in the reachable graph). Every runtime JS file under `lib/`, `encodings/`, `backends/` was read in full or covered by the logged content scans, including `encodings/tables/*.js` (verified pure lazy data).
- Resolved runtime dependencies: none (`dependencies: {}`). `node_modules` contains only the dev workspace symlink `iconv-lite-generators` → `generation/`, verified unreachable from runtime entrypoints before exclusion.
- Node baseline lookups were limited to the files named above at `d44625a4b80c672215b469906ce583ce7eeeebaf`; no recursive Node-tree scans.
- Reproduction ran on Node v24.19.0, so the `Uint8Array.prototype.toBase64`/`fromHex`/`fromBase64` fast paths (Node 25+) were not executed; static review shows those paths are read-only feature detection plus method calls, so this does not affect the verdict. Browser-only execution environments were not exercised (web entrypoint was exercised under Node, where it is also resolvable).
- What would change the verdict: discovery of a reachable write/descriptor change targeting a core global, core prototype, core-backed instance, or module loader — none was found by content scan or runtime diff.

## Changes since the previous audit

First audit (pass A of a two-pass blind protocol); no previous report at this path.
