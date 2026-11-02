# Node.js patch audit: path-to-regexp (Pass A)

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#24 — `path-to-regexp` (https://github.com/pillarjs/path-to-regexp), audit whether it or its resolved runtime dependencies patch/monkeypatch Node.js core
- Library: path-to-regexp 9.0.0; git default branch `master` @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20` (commit "9.0.0", clean working tree) at `$PACKAGE_ROOT`; published npm artifact `path-to-regexp-9.0.0.tgz` extracted at `$NPM_ARTIFACT` (registry integrity `sha512-kfo5HIFCfEH24bcHSWEFIfrwiCsm/DXR+j1fc0696VIdWkICdAcKH2LxRClvz5HQcG4iCQpb4qBZ7pttGPG/dA==`, shasum `f6b516e6b5dbfbe9034a6fc1289bc687b26b70c7`, verified against the local tarball byte-for-byte). No local changes to either.
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80c672215b469906ce583ce7eeeebaf`, read-only. No core lib file comparison was required (see Patching verdict): the library imports no Node.js module and touches only ECMAScript intrinsics, read-only.
- Reproduction runtime: Node v24.19.0 (dynamic intrinsic-snapshot verification; static proof is primary).
- Scope: production/runtime code only — `$PACKAGE_ROOT/src/index.ts` (source of truth at the git ref) and `$NPM_ARTIFACT/dist/index.js` (the exact file consumers load via `main`/`exports`). Zero runtime dependencies (`dependencies` absent from package.json; verified in both git and artifact package.json). Tests (`src/*.spec.ts`), bench, docs, configs, devDependencies, `dist/index.d.ts` (types, not executed), and `dist/index.js.map` (source map, not executed) are out of scope.
- Coverage: source — complete (both runtime files read in full, all six skill pattern groups plus seven domain-specific searches run, exhaustive property-write scan); upstream — registry integrity corroborated, bounded git history checked; runtime — optional dynamic verification executed twice, clean. No limitations material to the verdict (see Coverage and limitations for one provenance note).

## Patching verdict

**No patching was demonstrated anywhere in the inspected scope.**

- Shared core mutations: **0**. Instance/application overrides: **0**. Core
  module interceptions: **0**. Core source rewrites: **0**.
- Direct origin: the package itself contains no patch site. Transitive origin:
  not applicable — path-to-regexp 9.0.0 has **zero runtime dependencies**, so
  no dependency can apply a patch on its behalf.
- Unresolved candidates: **0**. All 8 ledger candidates were traced to their
  actual target object and rejected (see `candidates.md`).
- The strongest structural fact: the runtime code contains **no import of any
  kind** — no `require`, no ESM `import`, no `node:` specifier, no dynamic
  `import()` (search group 1, zero hits in both files). It therefore never
  obtains a reference to any Node.js core module, loader, binding, or internal.
  Its entire interaction with the platform is read-only use of ECMAScript
  intrinsics: `RegExp` (construction), `TypeError`/`Error` (subclass +
  throw), `Array.isArray`, `Object.create(null)`, `encodeURIComponent`,
  `decodeURIComponent`, and standard String/Array instance methods on values it
  owns.
- Domain-specific checks requested for this package all came back negative:
  no `RegExp.prototype` or `String.prototype` mutation (pattern group 3 and
  dynamic snapshot), no RegExp subclassing (the returned regexp is a plain
  `RegExp` instance with no added own properties), no `exec` override (only a
  call at src/index.ts:417 / dist/index.js:213), and no well-known-symbol
  (`Symbol.match` etc.) definitions (`Symbol` has zero occurrences).
- The exhaustive assignment scan found exactly three property writes in the
  whole runtime code, all to library-owned values (`PathError` instance field,
  two local array `length` truncations).

## Confirmed Node.js patches

None. No candidate survived tracing; nothing qualifies for this section, and no
private API usage or extension point was promoted into it.

## Candidate ledger and unresolved questions

Full ledger with evidence in `candidates.md`. Summary:

| ID | Site and core target | Status | Evidence, rejection reason, or next check |
| --- | --- | --- | --- |
| C-001 | src/index.ts:128 / dist/index.js:21 — `PathError extends TypeError` | rejected as patch | Ordinary subclassing; `TypeError`/prototype only read, never written; verified unchanged dynamically |
| C-002 | src/index.ts:452,476 / dist/index.js:236,253 — local `process` | rejected as patch | Lexical helper shadowing the name; Node `process` global never referenced |
| C-003 | src/index.ts:417 / dist/index.js:213 — `regexp.exec(input)` | rejected as patch | Call on library-created instance; `RegExp.prototype.exec` identity unchanged |
| C-004 | src/index.ts:481 / dist/index.js:256 — `new RegExp(...)` returned | rejected as patch | Plain instance; prototype is `RegExp.prototype`; only own key `lastIndex`; `keys` returned separately, not attached |
| C-005 | dist/index.js:27; src:323/501 — the only 3 property writes | rejected as patch | All on library-owned instance/local arrays |
| C-006 | src/index.ts:338,421,453 — `Array.isArray`, `Object.create(null)` | rejected as patch | Read-only intrinsic use |
| C-007 | src/index.ts:43,256,… — TypeScript `extends` | rejected as patch | Type-level only, erased in dist |
| C-008 | src/index.ts:260,406 — `encodeURIComponent`/`decodeURIComponent` defaults | rejected as patch | Reads of globals; identities verified unchanged |

Unresolved: none.

## Supporting context

- **src vs dist correspondence (required check): confirmed.** `dist/index.js`
  is a type-erased compilation of `src/index.ts` with identical logic and
  comments. All 6 runtime exports correspond one-to-one (`PathError` src:128 /
  dist:21, `parse` src:144 / dist:33, `compile` src:256 / dist:121, `match`
  src:402 / dist:202, `pathToRegexp` src:438 / dist:231, `stringify` src:624 /
  dist:372); every other src export is type-only and correctly absent from
  dist. Spot-checked bodies (parser loop, `toRegExpSource`, `negate`,
  `stringifyName`) match statement-for-statement. No divergence — no anomaly to
  report. Artifact provenance: extracted `$NPM_ARTIFACT/dist/index.js` is
  byte-identical to the tarball member, and the tarball's sha512 matches the
  npm registry `dist.integrity` for 9.0.0 exactly.
- **Historical, not current:** very old path-to-regexp versions attached a
  `keys` array as a property of the RegExp object they returned (History.md:
  "Attach keys to the generated regexp", later "Remove `keys` list attached to
  the `RegExp` output"). That was augmentation of a library-created instance —
  never a core/shared-prototype patch — and is entirely absent from 9.0.0,
  which returns `{ regexp, keys }`. Bounded history (`git log -S 'prototype'`
  and `-S 'defineProperty'` over `src/index.ts`) shows no commit ever
  introduced prototype or descriptor manipulation in this file.
- Defensive detail: match params use `Object.create(null)` (src/index.ts:421),
  i.e. the library deliberately avoids the shared `Object.prototype` for
  user-facing param objects — the opposite of pollution.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` git ref | `git log -1`; `git status --porcelain` | HEAD `32292b9d13239c7fa3ed23e89c59c10264f9fe20` ("9.0.0"), clean tree |
| Runtime files | Full read of `src/index.ts` (696 lines) and `$NPM_ARTIFACT/dist/index.js` (431 lines) | Entire runtime surface inspected line-by-line |
| Candidate searches | Six skill pattern groups + seven extras, `rg -n --no-ignore` on both runtime files (full log in `searches.md`) | Groups 1,3,4,5,6 zero hits; group 2 and extras only benign hits, all ledgered |
| npm registry | `npm view path-to-regexp@9.0.0 version dist.integrity dist.shasum` | Matches local tarball sha512 exactly; artifact is the authentic 9.0.0 publish |
| Tarball vs extracted dir | `tar -tzf` / `tar -xzf -O ... \| shasum -a 256` | dist/index.js identical (`033dfd75…d706`); tarball ships exactly one runtime file |
| Upstream history | `git log -n 10 -S 'prototype' -- src/index.ts` (and `defineProperty`) | Zero commits; no historical patch sites in this file |
| Node.js baseline | `git -C "$NODEJS_SOURCE" log -1` (read-only) | `d44625a4b80c672215b469906ce583ce7eeeebaf` (main). No lib/* comparison needed: zero core imports in the target (search group 1), and the touched objects (RegExp/String/TypeError intrinsics) are ECMAScript/V8 built-ins, not Node lib modules |
| Dynamic verification | `node verify-no-mutation.mjs "$NPM_ARTIFACT/dist/index.js"` (script and sanitized output beside this report) | NO MUTATION DETECTED (2 runs, node v24.19.0): descriptors/prototypes of globalThis, RegExp(+proto), String(+proto), Object(+proto), Array(+proto), Function.prototype, Error/TypeError(+protos), Symbol unchanged after import + full API exercise; `encodeURIComponent`/`decodeURIComponent`/`RegExp.prototype.exec`/`String.prototype.replace`/`String.prototype.split` identities unchanged; returned regexp plain and unaugmented |

File hashes (sha256, relative to the upstream root):
`path-to-regexp/src/index.ts` = `9d50a60ede1bb97efc9118aeb490b565894b895430f2aa8fb2b9f31e27d95cce`;
`npm-artifact/package/dist/index.js` = `033dfd75db5ffc587fc2741d6331ac4907494b87f353e792b1505dadfb86d706`;
`npm-artifact/package/package.json` = `5d576ee5ceaac0f60537aeef68bc1831d79581d533eaf58dac01cc30f9b34013`.

## Coverage and limitations

- Entry points: single entrypoint `dist/index.js` (`main`, `exports`,
  ESM `"type": "module"`); no conditional exports, no bin, no install/prepare
  scripts in the published artifact (the git `prepare` script is a dev-time
  build hook, not shipped behavior for consumers installing from the registry
  tarball; the tarball itself was verified to contain only LICENSE, Readme,
  package.json, and dist/*).
- Resolved runtime dependencies: none (`dependencies` absent). devDependencies
  out of scope by instruction; they cannot execute in a consumer install of the
  published tarball.
- Node.js files: none read beyond ref verification — justified because the
  package performs no Node module/binding/loader access whatsoever; the
  relevant baseline (RegExp/String/TypeError and their prototypes) consists of
  JS language intrinsics, which the dynamic snapshot verified directly.
- Branches tested: full public API exercised dynamically (`parse`, `compile`,
  `match`, `pathToRegexp` with array input/options, `stringify`, `PathError`
  throw path). Untested dynamic branches (e.g. every parser error arm) are
  covered statically: the exhaustive property-write scan proves no code path in
  either file can write to a non-library object.
- Provenance note: the orchestrator-supplied commit hash for `master`
  (`32292b9be8e42afdb63bb749ab05c4252cbd201e`) does not match the actual HEAD
  (`32292b9d13239c7fa3ed23e89c59c10264f9fe20`) beyond the shared `32292b9`
  prefix; the verified local HEAD (tagged commit "9.0.0") is authoritative for
  this audit, and the artifact cross-check against the npm registry integrity
  anchors the audited code to the real 9.0.0 publish regardless.
- What would change the verdict: a different shipped artifact (other version or
  tampered tarball), or future versions adding dependencies or imports — none
  applicable to 9.0.0 as audited.

## Changes since the previous audit

First audit (Pass A of the two-pass blind protocol); no previous report at this
path.
