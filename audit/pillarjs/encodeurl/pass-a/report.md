# Node.js patch audit: encodeurl

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#31 — `encodeurl` ("Encode a URL to a percent-encoded form, excluding already-encoded sequences", https://github.com/pillarjs/encodeurl); two-pass blind audit, pass A
- Library: encodeurl 3.0.0. Git clone `$PACKAGE_ROOT` at `master` @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b` (verified `git log -1`). Release tag `v3.0.0` @ `0dc3870`; `git diff v3.0.0..HEAD` touches only `README.md` (3 lines, coverage badge) — all runtime files identical between tag and HEAD. Published npm tarball `encodeurl-3.0.0.tgz` extracted at `$NPM_ARTIFACT` (= `$PACKAGE_ROOT/../npm-artifact/package`). No local changes to either tree.
- Node.js baseline: `$NODEJS_SOURCE` at `main` @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (clean). Not materially consulted: the library references no Node.js core module or Node-specific global; its entire API surface is ECMAScript intrinsics implemented in V8 (`encodeURI`, `String.prototype.search/replace/toWellFormed`, a module-private `RegExp` literal), none of which live in Node's `lib/`.
- Reproduction runtime: Node.js v24.19.0 (satisfies the package's `engines: node >=22`).
- Scope: production/runtime code only. Sole runtime entrypoint: `exports`/`main` = `./dist/index.js` (ESM, `"type": "module"`), audited at `$NPM_ARTIFACT/dist/index.js` (the exact file consumers load) together with its git source `$PACKAGE_ROOT/src/index.ts`. **Zero runtime dependencies** (no `dependencies` field in git or artifact `package.json`; `npm view encodeurl@3.0.0 dependencies` is empty; the runtime module contains no `import`/`require` statements at all). Tests (`src/index.spec.ts`), benchmarks (`src/index.bench.ts`), docs, configs, and devDependencies out of scope.
- Coverage: source and shipped artifact fully read (runtime surface is one 37-line module exporting one function); all six skill candidate pattern groups plus three domain-specific supplementary searches run over both trees with zero runtime hits; registry integrity and src-dist correspondence verified; runtime before/after identity reproduction executed. No limitations material to the verdict.

## Patching verdict

No patching was demonstrated. Confirmed shared core mutations: **0**. Confirmed instance/application overrides: **0**. Core module interceptions: **0**. Core source rewrites: **0**. Direct and transitive origins both empty (the package has no runtime dependencies, so no transitive channel exists). No unresolved candidates and no excluded runtime branches: the entire runtime consists of one module-level `const` RegExp literal and one exported pure function (`encodeUrl`) with no imports, no writes to any object it does not own, no global/prototype/descriptor operations, no `Symbol` overrides, and no install-time code path reaching consumers.

The runtime module in full (`$NPM_ARTIFACT/dist/index.js:11,29-34`, matching `$PACKAGE_ROOT/src/index.ts:12-13,31-36`): defines `ENCODE_CHARS_REGEXP` and `encodeUrl(url)`, which calls `url.search(...)`, `url.toWellFormed()`, and `url.replace(ENCODE_CHARS_REGEXP, encodeURI)`. All intrinsic usage is read/invoke-only; `encodeURI` is passed by reference as a replacer callback, never assigned.

## Confirmed Node.js patches

None. No candidate survived tracing to an actual write/replacement of a core API, global, shared prototype, core-backed instance, core module loading mechanism, or core source. (Private API usage and extension points are not promoted here; see supporting context.)

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | `$PACKAGE_ROOT/src/index.ts:12-13` / `$NPM_ARTIFACT/dist/index.js:11` — module-level shared `g`-flag RegExp `ENCODE_CHARS_REGEXP` (regex `lastIndex` state) | rejected as patch | The regex is a module-private `const`, not exported and not a core/intrinsic object; mutating a library-owned regex's `lastIndex` cannot patch core. Per ECMA-262, `String.prototype.search` (via `RegExp.prototype[Symbol.search]`) saves and restores `lastIndex`, and `String.prototype.replace` with the `g` flag resets `lastIndex` to 0 on entry and when matching completes, so no cross-call state leak exists either. Runtime check confirmed no observable mutation across calls. |
| C-002 | `$PACKAGE_ROOT/src/index.ts:35` / `$NPM_ARTIFACT/dist/index.js:33` — global intrinsic `encodeURI` | rejected as patch | Read-only reference passed as the replacer callback to `String.prototype.replace`. No assignment, no `defineProperty`, no descriptor change (search groups S3/S8 zero hits). Reproduction confirmed `encodeURI` identity and own-property descriptor on `globalThis` unchanged after import and after calls. |
| C-003 | `$PACKAGE_ROOT/src/index.ts:33-35` / `$NPM_ARTIFACT/dist/index.js:30-33` — `String.prototype.search` / `toWellFormed` / `replace` | rejected as patch | Invocation only on the caller-supplied string; no write to `String.prototype` or `RegExp.prototype` anywhere in either tree (group S3 zero hits over git repo and artifact). Reproduction confirmed method identities and full own-property key sets of `String.prototype`, `RegExp.prototype`, and `Object.prototype` unchanged. |
| C-004 | `$NPM_ARTIFACT/package.json` `scripts.prepare` = `ts-scripts install && npm run build` | rejected as patch | `prepare` does not execute on consumer installs from a registry tarball (only on `npm pack`/publish from the repo or git-dependency installs); no `preinstall`/`install`/`postinstall` scripts exist. The script is devDependency build tooling, out of runtime scope, and installs nothing into consumers' runtimes. |
| C-005 | `$NPM_ARTIFACT/dist/index.js.map` | rejected as patch | Non-executable source-map metadata; its embedded `sourcesContent` is byte-identical to `$PACKAGE_ROOT/src/index.ts` at `v3.0.0` (and HEAD), corroborating src-dist correspondence rather than concealing divergent code. |

No unresolved candidates.

## Supporting context

- Src-dist correspondence (both directions verified): `$NPM_ARTIFACT/dist/index.js` is a faithful `tsc` transpilation of `$PACKAGE_ROOT/src/index.ts` — the only differences are removed TypeScript type annotations, statement formatting, and the appended `sourceMappingURL` line. The map's `sourcesContent[0]` is byte-identical to `git show v3.0.0:src/index.ts` and to `src/index.ts` at HEAD (`diff` clean). Artifact `package.json` is byte-identical to the git `package.json`. No divergence found; nothing finding-worthy.
- Registry integrity: local `encodeurl-3.0.0.tgz` sha1 `3e6cdb0e25c24382b62ab06c115e9bf6044b87bd` and sha512-base64 `4McP5wRMkyFkj2+U0GfnZVjUQBSu+6kqbNhZsRqO1UeDVsdY8GDloc1bfAGHJ4MAVgJjo5RHveJA4fUZQMSMMA==` both match `npm view encodeurl@3.0.0 dist.shasum` / `dist.integrity`. The extracted `$NPM_ARTIFACT` directory is byte-identical (`diff -r`) to a fresh extraction of the tarball. Tarball contains only `package.json`, `README.md`, `LICENSE`, and `dist/` (no hidden executables).
- The 3.x line is ESM-only (`"type": "module"`, single `exports` entry) with `engines: node >=22`; `String.prototype.toWellFormed` (ES2024, Node >= 20) is used natively, not polyfilled — no compatibility shim exists in the package.
- No `Symbol.replace`/`Symbol.search` or other well-known-symbol overrides anywhere in either tree; the library relies entirely on default intrinsic behavior.
- Node.js core verification table from the skill: no row applies — the package imports no core module and touches no Node-specific global (`Buffer`, `process`, `globalThis` all zero hits in runtime code), so no `$NODEJS_SOURCE lib/` file is a patch target. `$NODEJS_SOURCE` was used only to pin the baseline ref.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` (git) | `git log -1` | `6545e6a324edc62c6e7dcbd1205a51b480cfe20b`, `master`/`origin/master` HEAD, "Update coverage badge (#39)" — matches tasked provenance |
| `$PACKAGE_ROOT` tag vs HEAD | `git diff v3.0.0..HEAD --stat` | Only `README.md` (3 insertions/3 deletions); all runtime files identical to the released tag `0dc3870` |
| `$PACKAGE_ROOT` + `$NPM_ARTIFACT` | Six skill candidate pattern groups via `rg -n --no-ignore` (see `searches.md`) | Zero hits in runtime code; only test/doc/config hits (out of scope) in groups 1-2; groups 3-6 zero hits everywhere |
| `$PACKAGE_ROOT` + `$NPM_ARTIFACT` | Supplementary searches S7-S9: `encodeURI` usage, assignments to global intrinsics, `lastIndex|Symbol|toWellFormed|delete|freeze|defineProperty` | Only read-only `encodeURI` replacer usage at `src/index.ts:35` / `dist/index.js:33`; zero assignment/descriptor hits |
| npm registry | `npm view encodeurl@3.0.0 dist.shasum dist.integrity version main exports type dependencies scripts` | shasum/integrity match local tarball; `dependencies` empty; no install hooks beyond non-consumer `prepare` |
| `$NPM_ARTIFACT` vs tarball | `tar -xzf encodeurl-3.0.0.tgz` + `diff -r` | Extracted audit copy identical to fresh extraction |
| dist vs src | `diff` of map `sourcesContent[0]` vs `git show v3.0.0:src/index.ts` and vs HEAD `src/index.ts`; `diff` artifact vs git `package.json` | All identical — shipped artifact corresponds exactly to the audited git source |
| Runtime reproduction | `node check-globals.mjs "$NPM_ARTIFACT/dist/index.js"` (script beside this report) | `PASS: no global/prototype/intrinsic mutation detected after import or call`; behavior samples (space, `%foo`, `%20`, unpaired surrogate) all correct; sole export `encodeUrl`; Node v24.19.0 |
| `$NODEJS_SOURCE` | `git log -1` | `d44625a4b80c672215b469906ce583ce7eeeebaf` (`main`, clean); baseline pinned, no lib/ file needed as patch target |
| Upstream repo | PRs pillarjs/encodeurl#36 (TypeScript/ESM rewrite) and #37 (perf/size: `search` fast path + `toWellFormed`), both merged pre-3.0.0; visible in `git log --oneline` | Explain the current implementation's shape; neither introduces core interaction. No code comment or candidate referenced any upstream issue alleging core patching, so no broader issue sweep was warranted |

File hashes (sha256, provenance):

- `$PACKAGE_ROOT/src/index.ts` `eb40f2a0abe5df9f1eeea7c049f02476cd75bb7748eb486182f7ef73ab1922ae`
- `$NPM_ARTIFACT/dist/index.js` `89ad6e386afa3e330a1c449127e5dbce22427c03c9db9cd656251d04691c4710`
- `$NPM_ARTIFACT/dist/index.js.map` `7a212c325232b04e98fa29c3a9ca4c0d190e1aa9995b1436e23fd668c62d042e`
- `$NPM_ARTIFACT/package.json` `7f8b624752cf38ec143c801856fd9a634b4a9f2b5ed2219f3cb6aa17d3f3a6d5`

## Coverage and limitations

- Entry points: the single `exports`/`main` entrypoint `dist/index.js` fully read in both shipped form (`$NPM_ARTIFACT`) and source form (`$PACKAGE_ROOT/src/index.ts`). No conditional/optional entrypoints exist (single-string `exports`). No install scripts reach consumers.
- Dependencies: none at runtime — transitive patch channel structurally absent. `package-lock.json` in the git repo covers devDependencies only (build/test tooling, out of scope, not shipped).
- Node.js files: none selected as patch targets because no core API is referenced; this is a deliberate scope decision per the skill's "verify against only the relevant Node.js code", not a gap. Baseline ref pinned at `d44625a4b80c672215b469906ce583ce7eeeebaf`.
- Branches tested: both branches of `encodeUrl` (early-return fast path and encode path) exercised in the reproduction. There are no other runtime branches.
- Reproduction ran on Node v24.19.0 only; a single tested runtime cannot prove universal absence across all Node versions, but the static proof (zero write operations of any kind in 37 lines with no imports) is version-independent.
- What would change the verdict: a different published artifact than the one verified against the registry (ruled out for 3.0.0 by shasum/integrity match), or audit of a different major version (1.x/2.x are CommonJS and were not in scope for this pass).
- Blind-pass constraint honored: nothing outside `audit/pillarjs/encodeurl/pass-a/` under the audit root was read.

## Changes since the previous audit

First audit (pass A of the two-pass blind protocol); no previous report existed at this path.
