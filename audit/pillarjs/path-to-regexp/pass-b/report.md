# Node.js patch audit: path-to-regexp (pass B, blind)

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#24 — `path-to-regexp` ("turn a path string such as /user/:name into a regular expression", https://github.com/pillarjs/path-to-regexp)
- Library: 9.0.0; git tag `v9.0.0` @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20` (`master` HEAD of `$PACKAGE_ROOT`, verified with `git log -1`; NOTE: the orchestrator briefing cited `32292b9be8e42afdb63bb749ab05c4252cbd201e` — shared 7-hex prefix but not the actual HEAD; the verified hash above governs). Artifacts audited: TypeScript source `$PACKAGE_ROOT/src/index.ts` (sha256 `9d50a60ede1bb97efc9118aeb490b565894b895430f2aa8fb2b9f31e27d95cce`) and published npm build `$NPM_ARTIFACT/dist/index.js` (sha256 `033dfd75db5ffc587fc2741d6331ac4907494b87f353e792b1505dadfb86d706`). npm tarball `path-to-regexp-9.0.0.tgz`: sha1 `f6b516e6b5dbfbe9034a6fc1289bc687b26b70c7`, integrity `sha512-kfo5HIFCfEH24bcHSWEFIfrwiCsm/DXR+j1fc0696VIdWkICdAcKH2LxRClvz5HQcG4iCQpb4qBZ7pttGPG/dA==` — both match `npm view path-to-regexp@9.0.0`; extracted `dist/index.js` is byte-identical to the tarball member. No local changes to either checkout.
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only. No Node core `lib/` file is an applicable baseline because the library imports no Node module (see Sources); the domain-relevant core objects are V8 JS intrinsics (RegExp/String/Object/Array/Function prototypes, well-known symbols), verified live in the reproduction.
- Reproduction runtime: Node v24.19.0 (`repro/snapshot-diff.cjs`, exit 0).
- Scope: production/runtime code only — the single entrypoint `dist/index.js` (`package.json` `main`/`exports`) and its source of truth `src/index.ts`. **Zero runtime dependencies** (`dependencies` absent), so no dependency tree exists to audit. Tests, benchmarks, docs, configs, devDependencies out of scope. Blind pass: no other audit output consulted.
- Coverage: source 100% of runtime files (696-line `index.ts`, 430-line `dist/index.js`, read in full); upstream corroboration via `$PACKAGE_ROOT/History.md` and registry metadata; runtime verified by before/after intrinsic snapshot. No material gaps.

## Patching verdict

**No patching was demonstrated.** Shared core mutations: 0. Instance/application
overrides: 0. Core module interception: 0. Core source rewrites: 0. Origin
analysis is trivial: the package has no runtime dependencies and its sole module
contains **no import/require of any kind** — it cannot even reach a Node core
module, let alone patch one. Eight candidates were raised and all eight were
rejected with static traces plus a runtime before/after snapshot that monitored
~200 core properties/key sets and recorded **zero changes** after importing the
exact published `dist/index.js` and exercising `parse`/`compile`/`match`/
`pathToRegexp` across params, wildcards, groups, arrays, and quoted custom
parameter names. No unresolved candidates or excluded branches limit this
verdict; the only untestable dimension is the universal one (a dynamic test
cannot prove absence on inputs not exercised — static reading of the full 696
lines covers that).

Domain-specific checks requested for this package all came back clean:

- The library does **not** subclass or mutate `RegExp`/`RegExp.prototype`; it
  returns fresh `new RegExp(...)` instances inside a plain `{ regexp, keys }`
  object (src/index.ts:481, dist/index.js:256).
- Returned RegExp instances carry **no expando properties**: own keys are
  exactly `[lastIndex]`, matching the intrinsic baseline captured before import;
  `[[Prototype]] === RegExp.prototype` and `constructor === RegExp`. The
  historical `re.keys` expando of path-to-regexp 0.x/1.x was removed in 2.0.0
  (History.md: "Remove `keys` list attached to the `RegExp` output") and is
  absent in 9.0.0.
- `String.prototype` is never touched; no `Symbol.match/matchAll/replace/split/
  search/species` definitions or overrides exist; `exec` is only *called*, never
  assigned.

## Confirmed Node.js patches

None. No candidate survived tracing; private-API usage is also zero. (Nothing
was promoted from normal extension points: there are none in use.)

## Candidate ledger and unresolved questions

Full ledger with evidence in `candidates.md`. Summary (0 confirmed, 8 rejected,
0 unresolved):

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | src/index.ts:128, dist/index.js:21 — `class PathError extends TypeError` | rejected as patch | Ordinary subclassing; writes only `this.originalPath`; `TypeError.prototype` unchanged in repro. |
| C-002 | src/index.ts:452, dist/index.js:236 — local `function process(path)` | rejected as patch | Identifier shadowing inside `pathToRegexp`; global `process` never referenced; `process.binding/_linkedBinding/dlopen` identities unchanged. |
| C-003 | src/index.ts:481, dist/index.js:256 — `new RegExp(pattern, flags)` returned to consumers | rejected as patch | Fresh native instances; no expandos (own keys `[lastIndex]` = intrinsic baseline), no subclass, `keys` returned as sibling property of a plain object. |
| C-004 | src/index.ts:417, dist/index.js:213 — `regexp.exec(input)` | rejected as patch | Read-only intrinsic call on library-owned instance; `RegExp.prototype.exec` identity/descriptor unchanged. |
| C-005 | src/index.ts:260,406; dist/index.js:122,203 — `encodeURIComponent`/`decodeURIComponent` defaults | rejected as patch | Reads of globals as option defaults; never reassigned; identities unchanged. |
| C-006 | `$NPM_ARTIFACT/package.json` `scripts.prepare` | rejected as patch | Not run on registry-tarball installs; build-only devDependency tooling; no install/postinstall scripts exist. |
| C-007 | src/index.ts:323,501; dist/index.js:157,267 — `missing.length`/`result.length` writes | rejected as patch | Truncation of library-local arrays, not shared objects; `Array.prototype` unchanged. |
| C-008 | `$NPM_ARTIFACT/dist/index.d.ts`, `dist/index.js.map` | rejected as patch | Non-executable type declarations / source map. |

## Supporting context

- **src vs dist correspondence (anomaly check: none found).** `dist/index.js`
  is a faithful type-stripped compilation of `src/index.ts`: identical constant
  tables, function order, comments, and logic; the only structural differences
  are erased TypeScript types and the class-field emit of `originalPath`.
  Spot-checked logic sites matched line-for-line (e.g. `pathToRegexp` return at
  src:481 ↔ dist:256, `match` exec loop at src:416–432 ↔ dist:212–226,
  `negate` at src:612–619 ↔ dist:358–368). The tarball additionally matches the
  npm registry integrity hash, so the audited dist file is the exact bytes
  consumers load.
- **Historical note (not current behavior).** path-to-regexp ≤1.x attached a
  `keys` array as an expando on the RegExp it returned — an instance-level,
  library-owned annotation on a library-created object (still not a core patch).
  History.md records its removal in 2.0.0; v7+ returns `{ regexp, keys }`, and
  the 9.0.0 repro confirms zero expandos.
- `Object.create(null)` (src/index.ts:421) builds the params result with a null
  prototype — defensive construction, the opposite of prototype mutation.
- The commit hash cited in the audit briefing (`32292b9be8...`) does not match
  the clone's verified HEAD (`32292b9d13...`, tag v9.0.0). Treated as a
  briefing typo; all evidence is pinned to the verified hash.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` provenance | `git log -1` | HEAD `32292b9d13239c7fa3ed23e89c59c10264f9fe20`, tag `v9.0.0`, matches package.json version 9.0.0. |
| `$PACKAGE_ROOT/src/index.ts`, `$NPM_ARTIFACT/dist/index.js` | full read + 16 `rg -n` patterns (six skill groups + ten domain-specific; log in `searches.md`) | Zero imports; zero prototype/descriptor/loader/binding/global writes; all assignments local. |
| npm artifact | `tar -tzf`/`-O ... \| diff`; `shasum -a1/-a512`; `npm view path-to-regexp@9.0.0 dist.shasum dist.integrity` | Tarball contents = extracted tree; sha1/sha512 match registry; no install hooks shipped. |
| `$PACKAGE_ROOT/History.md` | read releases ≤3.0.0 (newer notes moved to GitHub Releases) | 2.0.0: "Remove `keys` list attached to the `RegExp` output" — corroborates expando removal long before 9.0.0. |
| `$NODEJS_SOURCE` | `git log -1` (read-only) | main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`; no lib file applicable (no core module imported); no tree scans performed. |
| Runtime | `node repro/snapshot-diff.cjs "$NPM_ARTIFACT"` (Node v24.19.0) | Exit 0; `TOTAL CORE SURFACE CHANGES: 0`; full sanitized output in `repro/result.txt`. |

## Coverage and limitations

- Entry points: single export `./dist/index.js` (ESM, `type: module`); audited
  together with its source `src/index.ts`. Both read in full. File hashes
  recorded above. No conditional or optional entrypoints exist.
- Dependencies: none at runtime (`dependencies` absent; `package-lock.json`
  present only for devDependencies). devDependencies, tests (`*.spec.ts`),
  benchmarks, and configs excluded per scope.
- Node.js core: no baseline file comparison applicable — the library performs
  no `require`/`import` of any module. JS-intrinsic surfaces (RegExp statics,
  RegExp/String/Object/Array/Function/TypeError prototypes, well-known symbols,
  `Object.assign`, `Module._load`/`_resolveFilename`/`Module.prototype._compile`,
  `require.extensions`, `require.cache`, `process.binding`, globalThis key set,
  `encodeURIComponent`/`decodeURIComponent`) verified live, before/after, on
  Node v24.19.0.
- Limitations: (1) the runtime check exercises representative inputs (named
  params, wildcards, optional groups, arrays, quoted custom names, encode/
  decode paths, error path) — a dynamic test cannot prove universal absence,
  but the complete static read closes that gap; (2) upstream GitHub Releases
  notes for 7.x–9.x were not fetched (History.md stops at 3.0.0) — immaterial,
  since the audited code itself was read in full; (3) the briefing's commit
  hash discrepancy noted above. What would change the verdict: any future
  release reintroducing instance expandos or adding runtime dependencies.

## Changes since the previous audit

First audit (pass B, blind; no prior report read or updated per protocol).
