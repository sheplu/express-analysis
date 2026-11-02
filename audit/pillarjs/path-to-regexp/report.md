# Node.js patch audit: path-to-regexp

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#24 (`path-to-regexp`, https://github.com/pillarjs/path-to-regexp)
- Library: path-to-regexp 9.0.0, git master @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20` (tag `v9.0.0`, clean tree); shipped artifact audited from the published npm tarball (`$NPM_ARTIFACT`: sha1 `f6b516e6...`, integrity `sha512-kfo5HIFC...` — both match `npm view path-to-regexp@9.0.0`; extracted `dist/index.js` byte-identical to the tarball member). **Zero runtime dependencies.**
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`) — provenance only; no core lib file applicable (see verdict)
- Reproduction runtime: Node v24.19.0 (both passes, clean runs)
- Scope: production/runtime code — `src/index.ts` at the git ref (696 lines) and `$NPM_ARTIFACT/dist/index.js` (the exact runtime file consumers load, ~431 lines); both read in full by both passes. Tests, benchmarks, docs, configs, devDependencies excluded.
- Coverage: source complete; shipped-artifact provenance cross-checked against the npm registry; runtime reproduction done (both passes)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements; key sites and provenance re-verified directly during reconciliation.

## Patching verdict

path-to-regexp does **not** patch or monkeypatch Node.js core — and structurally cannot, in its current form: the entire runtime module contains **no import or require of any kind** (skill pattern group 1: zero hits in both src and dist), so it never obtains a reference to any Node core module, loader, binding, or internal. Its interaction surface is limited to JS intrinsics, all used read-only:

- `new RegExp(pattern, flags)` produces fresh native instances returned inside a plain `{ regexp, keys }` object (`src/index.ts:481` / `dist/index.js:256`) — **no expando properties** on the returned RegExp (own keys exactly `[lastIndex]`, prototype `=== RegExp.prototype`), unlike the pre-2.0 era (see supporting context).
- `regexp.exec(path)` is a read-only call (`src/index.ts:417` / `dist/index.js:213`); no Symbol well-known-symbol overrides anywhere (no `Symbol` usage at all).
- The only property assignments in the whole runtime code (3 total) target library-local values (`missing.length`, `result.length`, `this.originalPath` in its own `PathError`).

0 confirmed patches in every category; 0 unresolved candidates; no transitive surface (zero runtime dependencies, no install hooks shipped).

## Confirmed Node.js patches

None. No candidate survived verification.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (8 entries), `pass-b/candidates.md` (8 entries) — same sites, all rejected, none unresolved:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `src/index.ts:128` `class PathError extends TypeError` | rejected | ordinary subclassing; `TypeError`/intrinsics verified unwritten (static + runtime descriptor check) |
| R-02 | `src/index.ts:452` nested `function process(path)` | rejected | shadows the identifier locally; Node's global `process` never referenced |
| R-03 | `src/index.ts:481` / `dist/index.js:256` `new RegExp(...)` in `{ regexp, keys }` | rejected | fresh native instances; keys returned as sibling property, not attached to the RegExp |
| R-04 | `src/index.ts:417` `regexp.exec(path)` | rejected | read-only call; `RegExp.prototype.exec` identity verified unchanged |
| R-05 | `encodeURIComponent`/`decodeURIComponent` as option defaults | rejected | read-only references; identities unchanged |
| R-06 | 3 dotted-member writes in runtime code | rejected | all library-owned (`missing.length`, `result.length`, `this.originalPath`) |
| R-07 | `scripts.prepare` (TS build) | rejected | build-time only; not run on registry installs; no install/postinstall hooks ship |
| R-08 | Symbol.match/matchAll/replace/split/search overrides | rejected (absent) | no `Symbol` usage at all in runtime code |

## Supporting context

- **Historical note:** path-to-regexp ≤ 1.x attached a `keys` expando to the returned RegExp instance; removed in 2.0.0 (`History.md`: "Remove `keys` list attached to the RegExp output"). At 9.0.0 the result is a plain object with the RegExp untouched — no instance augmentation of a core-backed object remains.
- src↔dist correspondence: `dist/index.js` is a faithful 1:1 type-stripped compile of `src/index.ts` (6 runtime exports match: `PathError`, `parse`, `compile`, `match`, `pathToRegexp`, `stringify`; bodies match statement-for-statement). No divergence anomaly.
- Provenance note: the orchestrator's briefing contained a mis-expanded full hash sharing the `32292b9` prefix; both passes independently verified the true HEAD (`32292b9d13239c7fa3ed23e89c59c10264f9fe20`, tag v9.0.0) and the registry integrity cross-check anchors the audited artifact regardless.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `src/index.ts` + `$NPM_ARTIFACT/dist/index.js` (full read) | skill's six candidate pattern groups + exhaustive dotted-member write scan (logs: `pass-a/searches.md`, `pass-b/searches.md`) | group 1 (imports) zero-hit in both files — structural impossibility of core access; groups 3-6 zero-hit |
| npm registry | `npm view path-to-regexp@9.0.0 dist.integrity dist.shasum` | matches local tarball exactly |
| Reproduction | `node pass-a/verify-no-mutation.mjs`; `node pass-b/repro/snapshot-diff.cjs` (Node v24.19.0) | ~200-property snapshot (RegExp statics/prototype incl. Symbol descriptors, String/Object/Array/Function/TypeError prototypes, `Object.assign`, Module._*, require.extensions/cache, process.binding, global keys): **0 changes** after import + exercising params/wildcards/optional groups/arrays/custom names; returned RegExp classified clean against pre-import intrinsic baseline |
| Upstream | `History.md` (2.0.0 entry) | corroborates removal of the historical `keys` expando |

## Coverage and limitations

- Dynamic test covers representative inputs only — closed by full static read of all runtime lines in both files.
- GitHub release notes for 7.x–9.x not fetched (History.md ends at 3.0.0); immaterial given full code read.
- No `$NODEJS_SOURCE` lib file applicable: nothing is imported; the relevant core objects are V8 JS intrinsics, verified live in the repros.

## Changes since the previous audit

First audit of path-to-regexp in this workspace.
