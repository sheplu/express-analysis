# csrf — audit methodology & reconciliation

## Protocol

1. Cloned https://github.com/pillarjs/csrf (default branch `master`, HEAD `33536b89609ea7354aeae2c0720087f6ff77eaa4`, version 3.1.0); installed runtime deps with `npm install --ignore-scripts --omit=dev` (rndm@1.2.0, tsscmp@1.0.6, uid-safe@2.1.5, random-bytes@1.0.0).
2. Two **fully independent, blind** audit passes (`pass-a/`, `pass-b/`), each following `.agent/skill/audit-nodejs-dependency/SKILL.md` end-to-end; `$NODEJS_SOURCE` = Node.js main @ `d44625a4b80`. Neither pass saw the other's output.
3. Orchestrator reconciliation: compared verdicts/ledgers; re-read `index.js:45,79-124,151-159`, `tsscmp/lib/index.js:15-33`, `random-bytes/index.js:21`, and `$NODEJS_SOURCE/lib/crypto.js:304-390` (lazy alias) directly; merged into final report.

## Scope

- In scope: `index.js` + sole entrypoints of all four runtime deps (5 files, read in full by both passes; SHA-256 hashes recorded in `pass-b/report.md`).
- Out of scope: tests, docs, devDependencies, tsscmp's shipped test/ dir (unreachable from its main), `index.d.ts` (types-only).

## Searches run (full logs in `pass-a/searches.md`, `pass-b/searches.md`)

The skill's six candidate pattern groups over the 5 runtime files plus supplementary core-namespace-assignment and delete/descriptor sweeps. Groups 4 (patch keywords), 5 (loader interception), 6 (bindings/internals): **zero hits** in both passes.

## Node.js core files consulted

- `$NODEJS_SOURCE/lib/crypto.js:304-340` (`getRandomBytesAlias` self-redefining lazy getter), `:384-389` (aliases installed: prng/pseudoRandomBytes/rng) — DEP0115 mechanism, baseline for the one subtle candidate

## Runtime reproduction (both passes, Node v24.19.0)

- Pass A: `verify-no-mutation.js` **with a no-library control run** (proves the pseudoRandomBytes descriptor flip happens without any library code — core-owned).
- Pass B: `repro/snapshot-diff.js` -> `snapshot-diff.result.json` + `repro/lazy-alias-note.js` -> `lazy-alias-note.result.json` (isolates the alias transition; resolved value `===` pristine `randomBytes`).
- Exercised: `new Tokens()`, factory, `secret()` promise + callback, `secretSync()`, `create()`, `verify()` true/false.
- Results: 15/15 identity checks intact; 0 descriptor/prototype/global/require.extensions/builtin-cache diffs; require.cache grew by exactly the 5 library files. **No core mutation observed.**

## Reconciliation outcome

- Verdicts identical: **no confirmed patching in the inspected scope**.
- Ledgers identical in substance: 11 entries each, same sites, all rejected, 0 unresolved.
- The lazy-alias subtlety (R-05) was independently discovered, investigated, and attributed to core by **both** passes with complementary proofs (control run vs isolated transition script).
- Disagreements: **none**.
- Orchestrator spot-check matched all claims (Tokens ctor/prototype, hash chain, tsscmp feature detect + pseudoRandomBytes call, random-bytes init read, crypto.js lazy-alias source).

## Limitations

- Legacy branches statically cleared only (tsscmp pre-6.6.0 loop, random-bytes retry path) — write-free by inspection.
- Core reading limited to targeted `lib/crypto.js` sections.
- Repro on v24.19.0; static proof sufficient throughout.
