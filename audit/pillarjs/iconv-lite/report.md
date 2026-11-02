# Node.js patch audit: iconv-lite

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#22 (`iconv-lite`, https://github.com/pillarjs/iconv-lite)
- Library: iconv-lite 1.0.0-alpha.3 (ESM rewrite), git master @ `8601be45b43c1677914a2ff7733c52841d987c3f`, cloned repository; **zero runtime dependencies** (`dependencies: {}`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; pass A descriptor/identity diff over 12 core objects; pass B 33 pinned identities + full prototype/global diff — both PASS, no differences)
- Scope: production/runtime code — full runtime tree (~4,100 lines): `lib/`, `encodings/`, `backends/`, every Node-resolvable entrypoint from the `exports` map (`.` node -> `lib/index-node.js`; `.` browser/default and `./web` -> `lib/index-web.js`; `./encodings/*.js` wildcard; legacy `browser` field). `generation/`, `test/`, `performance/`, types tooling and devDependencies excluded; `node_modules/iconv-lite-generators` verified unreachable from any runtime entrypoint (symlinked dev workspace tool) before exclusion.
- Coverage: source complete (full read by both passes); runtime reproduction done (both passes, all entrypoint families exercised); upstream history consulted for the historical patch mechanism
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements; key sites re-verified directly during reconciliation.

## Patching verdict

iconv-lite at this ref does **not** patch or monkeypatch Node.js core. There is no transitive surface at all (zero runtime dependencies). The entire runtime tree imports exactly **one** core module — `node:stream` (`lib/iconv-node.js:3`) — used solely to subclass `Transform` through the documented `_transform`/`_flush` contract (core baseline `$NODEJS_SOURCE/lib/internal/streams/transform.js:162,113-116`), with the stream module dependency-injected into `lib/streams.js` to keep the web entrypoint stream-free. `backends/node.js` only **calls** public Buffer statics (`$NODEJS_SOURCE/lib/buffer.js:351,454,658,684` — `alloc`, `from`, etc., never reassigned). Every write in the package targets library-owned objects.

Notably, the infamous historical mechanism is gone: **`extendNodeEncodings()` is absent at this ref** (see supporting context).

0 confirmed patches; 0 unresolved candidates; zero hits for module-loading interception, internals/bindings access, global mutation, or core prototype writes anywhere in scope.

## Confirmed Node.js patches

None. No candidate survived verification; nothing is promoted from documented extension points or library-owned writes.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (16 entries), `pass-b/candidates.md` (17 entries) — same sites, slightly different granularity, all rejected/excluded, none unresolved. Key entries:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `lib/iconv-node.js:3` `import * as stream from "node:stream"` | rejected | read-only namespace import; injected into streams.js; never mutated |
| R-02 | `lib/streams.js:4,45` `class ... extends streamModule.Transform` | rejected | documented subclassing via `_transform`/`_flush` (`$NODEJS_SOURCE/lib/internal/streams/transform.js:162`); core prototype untouched |
| R-03 | `lib/streams.js:7,48` `options.decodeStrings = false` / `options.encoding = "utf8"` | rejected | writes to caller/fresh options object (documented stream options), not core state |
| R-04 | `lib/iconv.js:27` `Object.defineProperty(this, "backend", ...)` / `lib/iconv.js:166` `delete this.backend` | rejected | library-owned instance property management |
| R-05 | `encodings/index.js:14` `Object.assign({ __proto__: null }, ...)` | rejected | merge into fresh null-prototype object |
| R-06 | `backends/node.js` Buffer usage | rejected | call-only public statics (`buffer.js:351,454,658,684`); no assignment to `Buffer`/`Buffer.prototype` |
| R-07 | `encodings/utf7.js:147` `Uint8Array.prototype.toBase64` | rejected | feature-detect **read** (Node 25+/ES proposal fast path); never written |
| R-08 | `encodings/utf7.js:322` `UTF7_NONDIRECT.lastIndex = ...` | rejected | library-owned RegExp instance |
| R-09 | `backends/web.js`, `lib/web-streams.js` TextDecoder/TextEncoder/TransformStream | rejected | instantiation/calls of web-platform globals only; no global writes |
| R-10 | `node_modules/iconv-lite-generators` (-> `generation/`) | excluded | dev workspace tool; unreachable from every runtime entrypoint (only reference: comment at `encodings/sbcs-data-generated.js:1`) |
| R-11 | historical `extendNodeEncodings()` | rejected (absent) | removed upstream in 0.6.0; zero code occurrences at this ref (Changelog prose only) |

## Supporting context

- **Historical patching, confirmed removed:** iconv-lite ≤ 0.4.x shipped opt-in `iconv.extendNodeEncodings()`, which monkeypatched `Buffer.prototype.toString`/`write`, `SlowBuffer.prototype`, `Buffer.isEncoding`/`byteLength`, and `Readable.prototype.setEncoding`/`collect`. Deprecated in 0.4.12 (2015), removed in 0.6.0 (2020-06-08) by upstream commit `b7288dfa87cec46a58079fa39f3a7ba1590fe09e` (deleted `lib/extend-node.js`, 217 lines). At `8601be45` a full-tree sweep finds only Changelog prose (`Changelog.md:213,326,391`); no remnant or successor mechanism. The 0.4.x `string_decoder` compat shim is also gone (`Changelog.md:195`, ashtuchkin/iconv-lite#331); `string_decoder` is never referenced. Pass B's repro pins all historically-patched identities and confirms them unchanged today.
- `encodings/utf7.js:147` reads `Uint8Array.prototype.toBase64` as a feature detect for the ES base64 proposal (Node 25+ fast path) — private-ish bleeding-edge API **usage** to track, not a patch.
- The stream module is dependency-injected (`lib/streams.js:1-3` comment: avoids hard dependency for browser builds) — an architecture that structurally prevents import-time core side effects on the web path.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (full read) | skill's six candidate pattern groups + 12 supplementary write-pattern sweeps via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | G5 (loader interception) and G6 (bindings/internals) zero hits in both passes; all other hits ledgered and rejected |
| `exports` map enumeration | package.json direct read | all Node-resolvable entrypoints covered (node/browser/default/`./web`/encodings wildcard) |
| `$NODEJS_SOURCE/lib/internal/streams/transform.js:162,113-116`; `lib/buffer.js:351,454,658,684` | direct read at `d44625a4b80` | documented Transform extension contract; public Buffer statics never reassigned |
| Reproduction | `node pass-a/repro-no-mutation.mjs` / `node pass-b/repro/repro.mjs` (Node v24.19.0) | both PASS: no descriptor/identity/global diffs after importing all entrypoint families and exercising sbcs/dbcs/utf16/utf8/base64/hex codecs, encodeStream/decodeStream, decodeWebStream, web backend |
| Upstream history | commit `b7288dfa87cec46a58079fa39f3a7ba1590fe09e` (v0.6.0), Changelog.md:195,213,326,391, ashtuchkin/iconv-lite#331 | corroborates removal of the historical Buffer/stream patches |

## Coverage and limitations

- utf32/utf7 conversion paths and `invalidCharHandler` statically read but not runtime-exercised (no mutation sites in them).
- Node 25+ fast paths (`Uint8Array.prototype.toBase64/fromHex/fromBase64`) not executed on the v24.19.0 repro runtime — statically verified read-only.
- Browser-only execution not exercised (web entrypoint exercised under Node); little-endian platform only.
- Node baseline is main (`d44625a4b80`); file-scoped lookups only (stream/transform/buffer), no tree scans.
- This audits the 1.0.0-alpha ESM rewrite on master — the widely-deployed 0.6.x line (used by body-parser et al.) is a different codebase; its 0.6.x entry file was not re-audited here beyond the historical-removal verification above.

## Changes since the previous audit

First audit of iconv-lite in this workspace.
