# Node.js patch audit: encodeurl

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#31 — `encodeurl` (encode a URL to a percent-encoded form, excluding already-encoded sequences), https://github.com/pillarjs/encodeurl — pass B of a two-pass blind audit
- Library: encodeurl 3.0.0; git clone `$PACKAGE_ROOT` at `master` @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b` (one README-only commit past the `v3.0.0` tag; `src/index.ts` and `package.json` identical to the tag); published npm artifact `$NPM_ARTIFACT` extracted from `encodeurl-3.0.0.tgz` (SHA-1 `3e6cdb0e25c24382b62ab06c115e9bf6044b87bd`, SHA-512 integrity `sha512-4McP5wRMkyFkj2+U0GfnZVjUQBSu+6kqbNhZsRqO1UeDVsdY8GDloc1bfAGHJ4MAVgJjo5RHveJA4fUZQMSMMA==`, both matching `npm view encodeurl@3.0.0`). No local modifications to either checkout.
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80` — available but not materially consulted: the runtime code imports **no** Node builtin module; every platform API it touches is an ECMAScript intrinsic implemented by V8 (`String.prototype.search/.toWellFormed/.replace`, global `encodeURI`), so there is no Node `lib/` file for a candidate to target.
- Reproduction runtime: Node v24.19.0 (`repro/snapshot-diff.cjs`, exit 0)
- Scope: production/runtime code only — single entrypoint `dist/index.js` (`package.json` `main`/`exports`; ESM, `type: module`), built from `src/index.ts`. **Zero runtime dependencies** (no `dependencies` field; lockfile pins devDependencies only). Tests, benchmarks, docs, configs, devDependencies out of scope. No conditional/optional entrypoints; `files` ships `dist/` only; no install-time scripts run on consumer installs.
- Coverage: source — complete (entire runtime surface is one 37-line file, read in full in both src and dist forms); upstream — registry integrity and git provenance verified, implementation history inspected (PRs #36, #37); runtime — snapshot/diff reproduction executed on the exact shipped artifact.

## Patching verdict

No patching was demonstrated and no candidate survived triage. Shared core
mutations: **0**. Instance/application overrides: **0**. Core module
interceptions: **0**. Core source rewrites: **0**. Direct and transitive origins
both nil — the package has no runtime dependencies, so the audited file is the
entire runtime closure. Unresolved candidates: **0**; no excluded branches limit
the verdict (the single exported function has one trivial early-return branch,
and both branches were exercised at runtime).

The entire runtime behavior is: one module-private regex constant, then
`url.search(re)` / `url.toWellFormed()` / `url.replace(re, encodeURI)` on the
caller's string (`src/index.ts:32-36`, `$NPM_ARTIFACT/dist/index.js:29-34`).
There is no assignment, deletion, descriptor operation, prototype access,
global write, loader hook, or builtin import anywhere in shipped code. Domain
attention items from the task (writes to `String.prototype`/`RegExp.prototype`,
global function replacement such as `encodeURI`, shared-regex `lastIndex`
state, `Symbol` overrides) were each checked and are negative — see the ledger.

## Confirmed Node.js patches

None. No finding qualified for this section; nothing was promoted from private
API usage or extension points because the code contains neither.

## Candidate ledger and unresolved questions

Full ledger with reasons in `candidates.md`. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `src/index.ts:12-13` / `dist/index.js:11` — shared `g`-flag regex `ENCODE_CHARS_REGEXP` (lastIndex state) | rejected as patch | Library-owned, module-private, never exported; not a core object. No observable cross-call state: repeat calls byte-identical in repro. |
| C-002 | `src/index.ts:35` / `dist/index.js:33` — global `encodeURI` used as replacer | rejected as patch | Read-only reference; no write to any global. Identity unchanged in repro. |
| C-003 | `src/index.ts:33-35` — calls to `String.prototype.search/toWellFormed/replace` | rejected as patch | Plain invocations; `String.prototype` key set and `replace` identity/descriptor unchanged in repro. |
| C-004 | `package.json` `scripts.prepare` | rejected as patch | Build-time only; never runs on registry-tarball consumer installs; no (pre/post)install scripts. |
| C-005 | `dist/` build output absent from git (divergence risk) | resolved — no divergence | Source map `sourcesContent` byte-identical to git `src/index.ts`; tarball hashes match registry; extracted dir matches tarball. |

Unresolved: none.

## Supporting context

- The implementation relies on ECMAScript intrinsics only, including the ES2024
  `String.prototype.toWellFormed` (hence `engines.node >= 22`); it **uses** the
  intrinsic rather than polyfilling it — search group G4 (shim/polyfill/patch
  vocabulary) had zero hits repo-wide.
- History: PR pillarjs/encodeurl#36 rewrote the package in TypeScript/ESM; PR
  pillarjs/encodeurl#37 (`716b0fd`, "Improve perf and package size") produced
  the current single-regex + `toWellFormed()` implementation, replacing an
  earlier two-regex, two-pass `.replace` version. Both before and after
  versions are pure string transforms; no patching at any inspected ref.
- The repro observed `require()` of the ESM artifact adds exactly one entry to
  `require.cache` (`$NPM_ARTIFACT/dist/index.js` itself) and zero `node:*`
  builtin entries — expected loader bookkeeping, not interception.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` (git) | `git log -1` | `6545e6a324edc62c6e7dcbd1205a51b480cfe20b` — matches tasked provenance |
| `$PACKAGE_ROOT` tag drift | `git diff v3.0.0 HEAD --name-only` | README.md only; runtime source identical to the released tag |
| Runtime src + dist, 6 pattern groups | `rg -n` per `searches.md` | zero hits in runtime files for all six groups; whole-repo hits confined to tests/bench/docs/tsconfig |
| src ↔ dist correspondence | compare `dist/index.js.map` `sourcesContent[0]` vs `src/index.ts` | byte-identical; dist is a faithful type-stripped transpile |
| Registry integrity | `npm view encodeurl@3.0.0 dist.shasum dist.integrity` vs local `shasum`/`shasum -a 512` of `encodeurl-3.0.0.tgz`; `diff -r` tarball vs `$NPM_ARTIFACT` | exact match on SHA-1 and SHA-512; extracted artifact matches tarball — no tampering, no divergence |
| Implementation history | `git show 716b0fd -- src/index.ts` (PR #37); `git show fcf5703 --stat` (PR #36) | provenance of current code; no patch-like change in either diff |
| Runtime reproduction | `node repro/snapshot-diff.cjs "$NPM_ARTIFACT"` on Node v24.19.0 | exit 0; all tracked identities (`encodeURI`, `encodeURIComponent`, `decodeURI`, `String.prototype.replace`, `RegExp.prototype.exec`, `RegExp.prototype[Symbol.replace]`, `Object.assign`, `Module._load`, `Module._resolveFilename`, `process.binding`), own-key sets (`String`/`RegExp`/`Object`/`Array`/`Function` prototypes, `globalThis`, `require.extensions`), and descriptors unchanged before vs after require + exercising plain / already-encoded / mixed / malformed-percent / unpaired-surrogate inputs; output in `repro/result.txt` |
| `$NODEJS_SOURCE` | main @ `d44625a4b80` | held read-only; not consulted beyond confirming no candidate targeted a Node `lib/` API (runtime code imports no builtins) |

## Coverage and limitations

- Entry points: the sole export (`encodeUrl`) via the sole entrypoint
  `dist/index.js`; both branches of the function exercised at runtime.
  `dist/index.d.ts` (types) and `dist/index.js.map` (map) ship alongside but
  contain no executable code.
- Resolved dependencies: none at runtime; devDependencies (TypeScript/vitest/
  ts-scripts toolchain) excluded as non-runtime per scope.
- Node.js files: none selected — no Node core API appears in the runtime code;
  the patch-target table in the skill has no applicable row. Core verification
  is therefore trivially satisfied rather than skipped.
- Runtime testing covers Node v24.19.0 only; the static result (zero write
  sites of any kind in a fully-read 34-line shipped file) does not depend on
  runtime version. A tested branch cannot prove universal absence, but here the
  untested surface is nil: every line of shipped runtime code was read.
- What would change the verdict: a different published artifact than the one
  verified against registry integrity, or a future release adding runtime
  dependencies or install scripts.
- Blind-pass constraint honored: nothing outside `pass-b/` under the audit root
  was read.

## Changes since the previous audit

First audit (pass B of the two-pass blind protocol; no prior pass-b report
existed).
