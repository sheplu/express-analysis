# compression — audit methodology & reconciliation

## Protocol

1. Confirmed repo from issue #4; cloned `master` @ `0f9707417bd53d41a319fce8bdb80dfa08b435c8` (v1.8.2, matches latest release) into `compression/upstream/compression`; installed runtime deps with `npm install --ignore-scripts --omit=dev` (10 packages: bytes, compressible, debug@2.6.9, destroy@1.2.0, mime-db, ms, negotiator, on-headers@1.1.0, safe-buffer, vary).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`) following `.agent/skill/audit-nodejs-dependency/SKILL.md`; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`.
3. Orchestrator reconciliation: compared verdicts/findings/ledgers; re-read `index.js:98-176`, `on-headers/index.js:60-80`, and the full `destroy/index.js` guard chain directly; adjudicated the one divergence; merged into final report.

## Scope

- In scope: `index.js` (read in full by both passes) + all 10 resolved runtime deps' entry/init paths.
- Out of scope: tests, examples, docs, devDependencies; debug's browser.js (Electron-only path).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

Skill's six candidate pattern groups over index.js + each dep. Assignment-sweep over `res\.\w+ *=` and stream-internal identifiers (`_binding|_handle|_needDrain|destroyed|_readableState`) produced the confirmed and legacy-gated findings; loader/global/prototype sweeps negative.

## Node.js core files consulted (targeted)

- `$NODEJS_SOURCE/lib/internal/http/outgoing.js` (`write` :1027, `end` :1289; no `flush` on prototype)
- `$NODEJS_SOURCE/lib/internal/http/server.js` (`writeHead` :423; `_implicitHeader` dispatch via `this.writeHead` :419-421)
- `$NODEJS_SOURCE/lib/events.js` (`on`/`addListener` :615-619)
- `$NODEJS_SOURCE/lib/zlib.js` (ZlibBase `_destroy` :529 — settles destroy@1.2.0 branch dispatch)

## Runtime reproduction

- Node v24.19.0; scripts beside each pass report (`pass-a/repro.js`, `pass-b/repro.js` + `repro-output.json`).
- Method: prototype identity + descriptor snapshots (OutgoingMessage, ServerResponse, EventEmitter, zlib classes) before/after `require('compression')` and after a full gzip-compressed request. Result: prototypes unchanged; the four own-property shadows observed on the live res instance only.

## Reconciliation outcome

- Verdicts identical: confirmed patching — instance/application overrides only; 0 shared core mutations.
- F-001–F-004: identical in both passes (same sites, lines, baselines).
- **Divergence (1):** destroy@1.2.0's legacy zlib-internal writes — pass A counted them as confirmed finding F-005 (flagged LEGACY-GATED); pass B recorded them as a boundary case, not counted. **Adjudication:** orchestrator re-read `destroy/index.js` dispatch: on Node ≥ 10.15.1 the taken branch is plain documented `stream.destroy()` (zlib owns `_destroy`); the internals-writing branches require EOL Node or legacy error paths. Final report keeps F-005 as a distinct finding explicitly marked unreachable on the audited baseline — the site stays tracked (shipped, dispatchable code within declared `engines >= 0.8.0`) without overstating modern impact.
- Ledgers: A 23 / B 21 entries, same substance; 0 unresolved.
- Upstream cross-checks: nodejs/node#23734 closed-unmerged (both passes agree); CVE-2025-7339 (on-headers < 1.1.0) — resolved version is fixed.

## Limitations

- Legacy (< Node 10) branches, brotli teardown, and debug `DEBUG_FD` path: static analysis only (cannot activate on the audited runtime).
- Reproduction on a single Node version (v24.19.0), gzip path.
- Node baseline is main; HTTP methods verified through `lib/internal/http/*` (public `_http_*.js` are re-export shims at this commit).
