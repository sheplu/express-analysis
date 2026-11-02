# encodeurl — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/encodeurl (default branch `master`, HEAD `6545e6a324edc62c6e7dcbd1205a51b480cfe20b`, version 3.0.0). As with path-to-regexp, `main` points to `dist/index.js` (TS build output not in git), so the published npm tarball for 3.0.0 was fetched beside the clone (`$NPM_ARTIFACT`), registry sha1/sha512 verified, giving both the source of truth (`src/index.ts`) and the exact consumer-loaded artifact. Zero runtime dependencies.
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read the full shipped runtime file and the src counterpart; merged into final report.

## Scope

- In scope: `src/index.ts` (git ref) and `$NPM_ARTIFACT/dist/index.js` (37 lines) — full read, both passes.
- Out of scope: tests, benchmarks, docs, tsconfigs, devDependencies, `prepare` script (build-time only), 1.x/2.x CJS majors.

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups over both scopes (git tree and npm artifact; pass B ran them across three scopes) plus supplementary sweeps (intrinsic assignments, `lastIndex`/Symbol/descriptor ops, encodeURI usage). Group 1 (imports): zero hits in runtime code. Groups 3–6: zero hits repository-wide.

## Node.js core files consulted

None applicable — the module references no Node API; its domain is V8/ECMAScript intrinsics (`encodeURI`, String/RegExp prototypes), verified live. `$NODEJS_SOURCE` used for provenance only.

## Artifact integrity verification (both passes)

- `npm view encodeurl@3.0.0 dist.shasum dist.integrity` — local tarball sha1 `3e6cdb0e...` and sha512 both match exactly.
- Source map `sourcesContent[0]` byte-identical to `git show v3.0.0:src/index.ts` and HEAD.
- `git diff v3.0.0..HEAD` — README.md only; runtime identical to release.
- Artifact package.json byte-identical to git package.json; tarball contains package.json/README/LICENSE/dist only.

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `check-globals.mjs`. Pass B: `repro/snapshot-diff.cjs` -> `repro/result.txt`.
- Exercised `encodeUrl` on plain, already-encoded, mixed, malformed-percent, and unpaired-surrogate inputs (each twice; outputs stable and correct, incl. `%foo` -> `%25foo` and U+FFFD repair).
- Before/after: `encodeURI`/`encodeURIComponent`/`decodeURI` identities, `String.prototype.replace`, `RegExp.prototype.exec`/`[Symbol.replace]` values + descriptors, `Object.assign`, `Module._load/_resolveFilename`, `process.binding`, String/RegExp/Object/Array/Function prototype key sets, globalThis keys, `require.extensions`: **no changes**; `require.cache` gained only the artifact's module.

## Reconciliation outcome

- Verdicts identical: **no confirmed patching in the inspected scope**.
- Ledgers identical: 5 entries each, same sites, all rejected/resolved, 0 unresolved, 0 confirmed.
- Integrity chain (git tag ↔ source map ↔ tarball ↔ registry) verified independently by both passes with matching hashes.
- Disagreements: **none**.
- Orchestrator spot-check matched all claims (full runtime file re-read; regex/`encodeURI` usage confirmed invoke-only).

## Limitations

- Repro on one Node version; static proof version-independent (every runtime line read).
- Node ≥ 20 effective floor via `String.prototype.toWellFormed` (consumption requirement, not a patch concern).
