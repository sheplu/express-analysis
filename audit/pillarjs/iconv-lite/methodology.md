# iconv-lite — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/iconv-lite (default branch `master`, HEAD `8601be45b43c1677914a2ff7733c52841d987c3f`, version 1.0.0-alpha.3 — the ESM rewrite); `npm install --ignore-scripts --omit=dev` installs nothing but the symlinked `iconv-lite-generators` workspace devtool (zero runtime dependencies).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output. Both were additionally tasked to settle the historical `extendNodeEncodings()` question at this ref.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `lib/iconv-node.js` (core import), `lib/streams.js` (Transform subclassing + options writes), `lib/iconv.js:24-30,163-168` (backend property management), `encodings/index.js:14`, and ran an independent `extendNodeEncodings`/`extend-node` sweep (zero hits outside Changelog); merged into final report.

## Scope

- In scope: full runtime tree (~4,100 lines) — `lib/`, `encodings/`, `backends/`; every Node-resolvable entrypoint from the `exports` map (node/browser/default conditions, `./web`, `./encodings/*.js` wildcard, legacy `browser` field).
- Excluded: `generation/` (+ its `iconv-lite-generators` symlink — verified unreachable from runtime entrypoints first), `test/`, `performance/`, types tooling, devDependencies, docs.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups over the full runtime tree; pass A added 12 supplementary write-pattern sweeps, pass B added targeted Error/global/assignment sweeps. Groups 5 (loader interception) and 6 (bindings/internals) returned **zero hits** in both passes. Both passes independently ran historical-mechanism sweeps for `extendNodeEncodings`.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/internal/streams/transform.js:162` (`_transform` contract), `:113-116` (`_flush`)
- `$NODEJS_SOURCE/lib/buffer.js:351,454,658,684` (public Buffer statics called by `backends/node.js`)
- (stream re-export path `lib/stream.js` followed to the internal implementation)

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `pass-a/repro-no-mutation.mjs` — descriptor/identity diff over 12 core objects (Buffer statics/prototype, Uint8Array.prototype, Transform + prototype, Readable/Writable/Object/String prototypes, TextDecoder/TextEncoder/TransformStream prototypes) before/after importing both entrypoints and exercising all codec families + Node streams + Web streams: **PASS, no mutations**.
- Pass B: `pass-b/repro/repro.mjs` -> `results.txt` — 33 pinned function identities plus prototype key sets, Module._* identities, `require.extensions`/`require.cache`, `process.binding`, global keys; all three entrypoint families imported; sbcs/dbcs/utf16/utf8/base64/hex, stream round trips, `decodeWebStream`: **PASS, no differences detected**. Also pinned every identity patched by the historical 0.4.x `extendNodeEncodings` (unchanged).

## Reconciliation outcome

- Verdicts identical: **no confirmed patching in the inspected scope**.
- Historical-mechanism outcome identical: `extendNodeEncodings` absent at this ref; removed upstream in 0.6.0 (commit `b7288dfa87cec46a58079fa39f3a7ba1590fe09e`); both passes found only Changelog prose.
- Ledgers consistent: pass A 16 entries (15 rejected, 1 excluded) / pass B 17 rejected, same sites, 0 unresolved, 0 confirmed.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims (core import, subclassing, instance writes, assign-to-fresh-object, sweep re-run).

## Limitations

- utf32/utf7 paths and `invalidCharHandler` statically verified only; Node 25+ `Uint8Array.prototype.toBase64/fromHex` fast paths not executed on v24.19.0 (read-only statically).
- Browser-only execution not exercised; little-endian platform only.
- Node baseline is main; consulted files stable across release lines.
- Master is the 1.0.0-alpha ESM rewrite; the deployed 0.6.x line is a different codebase (historical-removal verification covers why its patching predecessor is gone, but 0.6.x itself was not the audited ref).
