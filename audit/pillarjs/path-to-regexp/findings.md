# path-to-regexp — findings detail (files, lines, issues)

Library: path-to-regexp 9.0.0 (master @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20`, tag v9.0.0; shipped dist audited from the registry-verified npm tarball)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches; no transitive surface (zero runtime deps).

## Why path-to-regexp cannot monkeypatch core

The runtime module (`src/index.ts`, 696 lines -> `dist/index.js`, ~431 lines) contains **no import/require of any kind** — not a single module load, `node:` specifier, or dynamic import. There is no code path by which it could obtain a Node core module, the CJS loader, a binding, or an internal. Its world is JS intrinsics only.

## All intrinsic interactions (verified read-only / fresh instances)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `src/index.ts` / `dist/index.js` | 481 / 256 | `new RegExp(pattern, sensitive ? "" : "i")` returned in plain `{ regexp, keys }` | fresh native instance; own keys exactly `[lastIndex]`; prototype `=== RegExp.prototype`; **no expando** |
| `src/index.ts` / `dist/index.js` | 417 / 213 | `regexp.exec(path)` | read-only call; `RegExp.prototype.exec` identity unchanged |
| `src/index.ts` | 128 | `class PathError extends TypeError` | ordinary subclassing; intrinsic untouched |
| `src/index.ts` | 452 | nested `function process(path)` | local identifier shadow; global `process` never referenced |
| option defaults | — | `encodeURIComponent` / `decodeURIComponent` references | read-only |

Only 3 property assignments exist in the entire runtime code, all library-owned: `missing.length`, `result.length`, `this.originalPath` (own `PathError` instances).

## Shipped-artifact verification

- npm tarball for 9.0.0: sha1 `f6b516e6...`, integrity `sha512-kfo5HIFC...` — both match `npm view path-to-regexp@9.0.0`; extracted `dist/index.js` byte-identical to tarball member; tarball ships only LICENSE/Readme/package.json/dist.
- `dist/index.js` is a faithful type-stripped 1:1 compile of `src/index.ts` (6 runtime exports match statement-for-statement).
- `scripts.prepare` (TS build) is build-time only; registry installs run no scripts from this package (none ship).

## Historical patching — confirmed absent

Versions ≤ 1.x attached a `keys` array as an expando on the returned RegExp instance (instance augmentation of a core-backed object). Removed in 2.0.0 (`History.md`: "Remove `keys` list attached to the RegExp output"). At 9.0.0, `keys` is a sibling property of the plain result object; runtime repro confirmed the returned RegExp matches the pre-import intrinsic baseline exactly.

## Negative sweeps (both passes, zero hits)

- Pattern group 1 (imports/requires/node:/dynamic import): **zero hits** — the structural proof
- Prototype/descriptor mutation (`.prototype` writes, `__proto__`, `defineProperty`, `setPrototypeOf`, `Reflect.*`): zero beyond ledgered library-owned sites
- Patch vocabulary, loader interception (`require.cache/extensions`, `Module._*`), internals/bindings (`process.binding`, `internalBinding`): zero hits
- No `Symbol` usage at all (no well-known-symbol overrides); no install hooks; no native code

## Runtime reproduction (both passes, Node v24.19.0, exit 0)

~200-property before/after snapshot — RegExp statics + prototype (incl. `exec`/`test` and `Symbol.match/matchAll/replace/split/search` descriptors), String/Object/Array/Function/TypeError prototype key sets, `Object.assign`, `Module._load/_resolveFilename/_compile`, `require.extensions`, `require.cache`, `process.binding`, globalThis keys — after importing the exact published dist and exercising `pathToRegexp`/`match`/`compile`/`parse`/`stringify` with params, wildcards, optional groups, arrays, and quoted custom param names: **0 core surface changes**.

## Node.js-change risk

None through patched surfaces. The package depends only on ECMAScript intrinsics (`RegExp`, `TypeError`, `encodeURIComponent`): Node.js-side changes cannot break it except via V8 RegExp semantics themselves. The one ecosystem-relevant behavior to track is its own API evolution (e.g. the 2.0.0 removal of RegExp expandos), not core compatibility.
