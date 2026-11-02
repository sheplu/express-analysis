# encodeurl — findings detail (files, lines, issues)

Library: encodeurl 3.0.0 (master @ `6545e6a324edc62c6e7dcbd1205a51b480cfe20b`; runtime identical to tag v3.0.0; shipped dist audited from the registry-verified npm tarball)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches; no transitive surface (zero runtime deps).

## Why encodeurl cannot monkeypatch core

The entire runtime is one 37-line ESM module (`dist/index.js`, source `src/index.ts`) with **no import/require of any kind** — no handle to any Node module, loader, binding, or internal ever exists. It exports a single pure function:

```js
export function encodeUrl(url) {
  const index = url.search(ENCODE_CHARS_REGEXP);
  if (index === -1) return url;
  return url.toWellFormed().replace(ENCODE_CHARS_REGEXP, encodeURI);
}
```

## All intrinsic interactions (verified read/invoke-only)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `src/index.ts` / `dist/index.js` | 12-13 / 11 | `const ENCODE_CHARS_REGEXP = /.../g` | library-private module const; never exported; spec-managed `lastIndex` via search/replace (no cross-call leakage, runtime-verified) |
| `src/index.ts` | 33 | `url.search(...)` | String.prototype method **call** |
| `src/index.ts` | 35 | `url.toWellFormed().replace(..., encodeURI)` | method calls + read-only reference to global `encodeURI` as replacer |

## Shipped-artifact verification

- Tarball sha1 `3e6cdb0e25c24382b62ab06c115e9bf6044b87bd` + sha512 integrity match `npm view encodeurl@3.0.0` exactly; extracted `$NPM_ARTIFACT` byte-identical to fresh extraction.
- Source map `sourcesContent[0]` byte-identical to `git show v3.0.0:src/index.ts` and to HEAD (git runtime files identical to the tag; only README differs).
- Tarball ships package.json/README/LICENSE/dist only — **no install hooks reach consumers** (`prepare` is build-time).

## Negative sweeps (both passes, zero hits)

- Imports/requires in runtime code (group 1): zero — structural impossibility of core access
- Prototype/descriptor writes, patch vocabulary, module interception, internals/bindings (groups 3–6): zero hits **repository-wide**
- Supplementary: intrinsic assignments, `lastIndex`/Symbol/descriptor ops, encodeURI usage — only the read-only replacer reference

## Runtime reproduction (both passes, Node v24.19.0, clean)

Before/after import + exercising plain, already-encoded, mixed, malformed-percent (`%foo` → `%25foo`), and unpaired-surrogate inputs (each twice, outputs stable): identities and descriptors of `encodeURI`/`encodeURIComponent`/`decodeURI`, `String.prototype.replace`, `RegExp.prototype.exec`/`[Symbol.replace]`, `Object.assign`, `Module._load/_resolveFilename`, `process.binding`; own-key sets of String/RegExp/Object/Array/Function prototypes and globalThis; `require.extensions` keys — **all unchanged**. `require.cache` gained only the artifact's own entry; zero `node:*` builtin cache entries.

## Node.js-change risk

None through patched surfaces. Dependencies are ECMAScript intrinsics only: `encodeURI` semantics, `String.prototype.search/replace`, and `String.prototype.toWellFormed` (ES2024; sets the effective floor at Node ≥ 20). No Node-specific API is referenced at all, so Node-side refactors cannot affect it short of V8 language-level changes.
