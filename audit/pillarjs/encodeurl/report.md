# Node.js patch audit: encodeurl

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#31 (`encodeurl`, https://github.com/pillarjs/encodeurl)
- Library: encodeurl 3.0.0, git master @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b` (runtime files identical to the v3.0.0 tag — only README differs); shipped artifact audited from the published npm tarball (`$NPM_ARTIFACT`: sha1 `3e6cdb0e25c24382b62ab06c115e9bf6044b87bd`, sha512 integrity — both match `npm view encodeurl@3.0.0`; extracted dir byte-identical to the tarball). **Zero runtime dependencies** (confirmed in git package.json, artifact package.json, and the registry).
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`) — provenance only; no Node lib file applies (domain is V8/ECMAScript intrinsics)
- Reproduction runtime: Node v24.19.0 (both passes, clean exits)
- Scope: production/runtime code — `src/index.ts` (git) and `$NPM_ARTIFACT/dist/index.js` (the exact consumer-loaded file, 37 lines); both read in full by both passes. Tests, benchmarks, docs, configs, devDependencies excluded.
- Coverage: source complete; shipped-artifact provenance cross-checked against the registry; runtime reproduction done (both passes)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements; runtime file re-read in full during reconciliation.

## Patching verdict

encodeurl does **not** patch or monkeypatch Node.js core — and structurally cannot: the entire runtime is a single 37-line ESM module containing **no import or require of any kind**, exporting one pure function. Its complete behavior is `url.search(regex)` / `url.toWellFormed()` / `url.replace(regex, encodeURI)` on the caller's string, with one module-private `const` RegExp. All intrinsic usage (`encodeURI`, `String.prototype.search/replace/toWellFormed`) is read/invoke-only.

0 confirmed patches in every category; 0 unresolved candidates; no transitive surface; groups 3–6 of the skill's pattern searches zero-hit across the entire repository.

## Confirmed Node.js patches

None. No candidate survived verification.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (5 entries), `pass-b/candidates.md` (5 entries) — identical sites, all rejected/resolved, none unresolved:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `src/index.ts:12-13` / `dist/index.js:11` shared g-flag `ENCODE_CHARS_REGEXP` | rejected | library-private const, never exported; `search`/`replace` manage `lastIndex` per spec — no observable state leakage across repeated calls (runtime-verified, repeated invocations stable) |
| R-02 | `src/index.ts:35` `encodeURI` as replacer | rejected | read-only global function reference; never assigned |
| R-03 | `src/index.ts:33-35` `String.prototype.search/toWellFormed/replace` calls | rejected | invoke-only; zero prototype-write hits anywhere |
| R-04 | package.json `prepare` script | rejected | build-time lifecycle; not run on registry installs; tarball ships no install hooks |
| R-05 | dist-not-in-git divergence risk | resolved | source map `sourcesContent[0]` byte-identical to `git show v3.0.0:src/index.ts` (and HEAD); registry sha1/sha512 match; no tampering |

## Supporting context

- `String.prototype.toWellFormed` (unpaired-surrogate repair) is a recent ECMAScript addition (Node ≥ 20) — the only modern-runtime requirement; usage is invoke-only.
- 1.x/2.x CJS majors are different codebases, out of scope for this ref.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `src/index.ts` + `$NPM_ARTIFACT/dist/index.js` (full read) | skill's six candidate pattern groups over both scopes + 3 supplementary sweeps (logs: `pass-a/searches.md`, `pass-b/searches.md`) | group 1 (imports): zero hits in runtime code; groups 3–6 zero hits repository-wide |
| npm registry | `npm view encodeurl@3.0.0 dist.shasum dist.integrity dependencies` | hashes match local tarball exactly; dependencies empty |
| git | `git diff v3.0.0..HEAD` | only README.md differs — runtime identical to the release tag |
| Reproduction | `node pass-a/check-globals.mjs`; `node pass-b/repro/snapshot-diff.cjs` (Node v24.19.0) | before/after import + exercising plain/already-encoded/mixed/malformed-percent/unpaired-surrogate inputs (each twice): identities of `encodeURI`/`encodeURIComponent`/`decodeURI`, `String.prototype.replace`, `RegExp.prototype.exec`/`[Symbol.replace]` (values + descriptors), `Object.assign`, `Module._load/_resolveFilename`, `process.binding`; own-key sets of String/RegExp/Object/Array/Function prototypes and globalThis; `require.extensions` — **all unchanged**; `require.cache` gained only the artifact's own module |

## Coverage and limitations

- Runtime tested on one Node version; static proof is version-independent (every shipped runtime line read).
- `$NODEJS_SOURCE` intentionally not consulted beyond confirming no Node lib API is referenced.
- Verdict pinned to the integrity-verified 3.0.0 artifact; it would change only if a different artifact were deployed or a future release added runtime deps/install scripts.

## Changes since the previous audit

First audit of encodeurl in this workspace.
