# iconv-lite pass B — search log

All searches run with `rg -n` (ripgrep) from `$PACKAGE_ROOT` unless noted.
Runtime scope globs: `lib/ backends/ encodings/ --glob '!*.d.ts'` (all
Node-resolvable entrypoints and everything reachable from them; `generation/`,
`test/`, `performance/`, `types/`, eslint config excluded per task scope).

## Skill candidate pattern groups

| # | Pattern | Scope | Result |
| --- | --- | --- | --- |
| G1 | `require\s*\(\|\bfrom\s*['"]\|\bimport\s*\(\|\bnode:` | runtime scope | HITS: all static ESM imports. Only ONE core-module import in the whole runtime tree: `node:stream` at `lib/iconv-node.js:3`. All other imports are package-relative. No `require()`, no dynamic `import()`, no computed specifiers. No runtime import of `generation/` or `iconv-lite-generators`. |
| G2 | `\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(` | runtime scope | HITS: `Buffer` static method *calls* only (`backends/node.js:6,9,13,20,24,25,28,35,42`); `extends streamModule.Transform` (`lib/streams.js:4,45` — injected module, library subclasses); internal class inheritance (`lib/iconv-node.js:7`, `encodings/internal.js:87`); remainder are comments/doc strings. Zero assignments to `Buffer`, `process`, `global`, `globalThis`. `process` and `globalThis` never referenced in runtime code at all. |
| G3 | `\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign` | runtime scope | HITS: `{ __proto__: null }` object literals (`lib/iconv.js:11,168`); `Object.defineProperty(this, "backend", …)` on the library's own instance (`lib/iconv.js:27`); `Object.assign` into a fresh null-prototype target (`encodings/index.js:14`); read-only feature detection `typeof Uint8Array.prototype.toBase64` (`encodings/utf7.js:147`); `Object.prototype.hasOwnProperty.call` read (`encodings/dbcs-codec.js:125`). Zero writes to any core/builtin prototype. No `setPrototypeOf`, no `Reflect.*` mutators. |
| G4 | `monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b` (case-insensitive) | runtime scope | HITS: comments only (`encodings/utf32.js:237,307`, `encodings/dbcs-data.js:151`). No code. |
| G5 | `require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks` | runtime scope | ZERO HITS. |
| G6 | `process\.(binding\|_linkedBinding)\|internalBinding\|['"]_http_\|['"]internal/` | runtime scope | ZERO HITS. |

## Supplementary searches

| # | Pattern / command | Scope | Result |
| --- | --- | --- | --- |
| S1 | `extendNodeEncodings\|disableCodersPatch\|_charsWritten\|StringDecoder\|string_decoder` (case-insensitive) | whole repo incl. test/generation (`--hidden --glob '!.git'`) | HITS only in `Changelog.md` (lines 195, 213, 326, 391 — historical notes). No code anywhere references the mechanism, `string_decoder`, or `StringDecoder`. |
| S2 | `find . -name "*extend*"` (excluding .git) | whole repo | ZERO HITS — `lib/extend-node.js` does not exist at this ref. |
| S3 | `(Buffer\|TextDecoder\|TextEncoder\|TransformStream\|Uint8Array\|Object\|Array\|String\|Function\|process\|globalThis\|global)\s*(\.\s*\w+\s*)?=[^=]` | runtime scope | 1 false positive (`encodings/sbcs-codec.js:18` — local `var asciiString = ""`, substring match). Zero real assignments to core globals or their properties. |
| S4 | `\bdelete\b` | runtime scope | 1 hit: `lib/iconv.js:166` — `delete this.backend` (own accessor on library instance). |
| S5 | `iconv-lite-generators\|generation/\|node_modules` | runtime scope | 1 hit: a comment in `encodings/sbcs-data-generated.js:1`. The `node_modules/iconv-lite-generators` devtool is not reachable from any runtime entrypoint (only via the `generation` npm workspace's own scripts). |
| S6 | global identifiers in runtime code: `TextDecoder\|TextEncoder\|TransformStream\|atob\|btoa\|structuredClone\|queueMicrotask\|WeakRef\|FinalizationRegistry\|fetch\|console` | runtime scope | All hits are instantiations/calls/feature detection (`backends/web.js:7,8,114,132`; `encodings/utf7.js`, `encodings/utf16.js:90`, `encodings/internal.js:51`; `lib/web-streams.js:33,37`; `lib/iconv.js:148,162,175`). No assignments, no prototype writes, no polyfill installation. |
| S7 | `git log --all -- lib/extend-node.js`; `git log -S 'extendNodeEncodings' -- lib/` | package git history (read-only) | Commit `b7288df` "Removed extendNodeEncodings mechanism…" (released in v0.6.0, 2020-06-08) deleted the 0.4.x Buffer/stream patching code. Confirms absence at audited ref is a deliberate upstream removal. |
| S8 | `grep -n "Transform.prototype._transform\|_flush"` | `$NODEJS_SOURCE/lib/internal/streams/transform.js` | Confirms `_transform`/`_flush` are the documented subclass implementer hooks (`transform.js:162,116-128`). |
| S9 | `grep -n "Buffer.from\|Buffer.alloc\|Buffer.concat\|Buffer.isBuffer"` | `$NODEJS_SOURCE/lib/buffer.js` | Confirms the statics called by `backends/node.js` are public API (`buffer.js:351,454,658,684`); library only reads/calls them. |

No search scoped to the whole Node.js tree was run (skill prohibition); core
verification was limited to `lib/stream.js`, `lib/internal/streams/transform.js`,
and `lib/buffer.js` at `$NODEJS_SOURCE` main @ `d44625a4b80`.
