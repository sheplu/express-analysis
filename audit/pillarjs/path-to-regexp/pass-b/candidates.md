# Pass B candidate ledger — path-to-regexp@9.0.0

Line references: `src` = `$PACKAGE_ROOT/src/index.ts` (git v9.0.0 @
`32292b9d13239c7fa3ed23e89c59c10264f9fe20`); `dist` = `$NPM_ARTIFACT/dist/index.js`
(npm tarball 9.0.0). Both files verified to correspond 1:1.

Confirmed: **0**. Rejected: **8**. Unresolved: **0**.

| ID | Site and core target | Status | Evidence / rejection reason |
| --- | --- | --- | --- |
| C-001 | src:128 / dist:21 — `class PathError extends TypeError` (target: `TypeError` intrinsic) | rejected as patch | Ordinary ES subclassing: creates a new library-owned class whose `[[Prototype]]` chain references `TypeError.prototype`; it writes nothing to `TypeError` or `TypeError.prototype`. Constructor assigns only `this.originalPath` (own instance property). Repro: `TypeError.prototype` key set unchanged (3 keys) before/after import and a thrown/caught `PathError`; `e instanceof TypeError === true` as designed. |
| C-002 | src:452,454,476 / dist:236,239,253 — nested `function process(path)` inside `pathToRegexp` (target: global `process`) | rejected as patch | Local function declaration that merely shadows the identifier `process` within `pathToRegexp`'s scope; the global `process` object is never referenced, read, or written anywhere in the runtime code. Repro: `process.binding`, `process._linkedBinding`, `process.dlopen` identities/descriptors unchanged. |
| C-003 | src:481 / dist:256 — `return { regexp: new RegExp(pattern, sensitive ? "" : "i"), keys }` (target: `RegExp` constructor/instances handed to consumers) | rejected as patch | Constructs a fresh native `RegExp` via the global constructor and returns it inside a plain object alongside a separate `keys` array. No subclass, no `Object.defineProperty`, no expando assignment, no `Symbol.*` override on the instance or on `RegExp`/`RegExp.prototype`. Repro: returned regexps for param/wildcard/array/quoted-name inputs have own keys `[lastIndex]` only — identical to the intrinsic baseline captured before import; `Object.getPrototypeOf(r) === RegExp.prototype` and `r.constructor === RegExp` for all. `keys` is a sibling property of the result object, not attached to the RegExp (the v0/v1-era `re.keys` expando was removed in path-to-regexp 2.0.0 per `$PACKAGE_ROOT/History.md`, "Remove `keys` list attached to the `RegExp` output"). |
| C-004 | src:417 / dist:213 — `const m = regexp.exec(input)` (target: `RegExp.prototype.exec`) | rejected as patch | Read-only invocation of the intrinsic `exec` on a library-created instance inside the `match` closure. No assignment to `exec` anywhere; repro shows `RegExp.prototype.exec` (and `test`, `toString`, `compile`, flag getters, `Symbol.match/matchAll/replace/split/search`) identity and descriptor unchanged after exercising `match()`. |
| C-005 | src:260,406 / dist:122,203 — `encode = encodeURIComponent`, `decode = decodeURIComponent` defaults (target: global URI functions) | rejected as patch | Destructuring-default **reads** of the globals as option fallbacks; never reassigned. Repro: `globalThis.encodeURIComponent` / `decodeURIComponent` identities unchanged. |
| C-006 | `$NPM_ARTIFACT/package.json` `scripts.prepare` = `ts-scripts install && npm run build` (target: install-time execution) | rejected as patch | `prepare` does not run when consumers install the published registry tarball (dist/ ships prebuilt; npm runs `prepare` for git deps and local dev checkouts). Even where it runs, it invokes devDependency build tooling to emit `dist/`; it rewrites no Node core source and installs no hooks. No `install`/`postinstall` scripts exist. |
| C-007 | src:323,501 / dist:157,267 — `missing.length = len`, `result.length = len` (target: `Array` instances) | rejected as patch | Length truncation of **library-local arrays** (the `missing` params accumulator and the `flatten` work buffer). Not shared objects, not `Array.prototype`. Repro: `Array.prototype` key set unchanged (42 keys). |
| C-008 | `$NPM_ARTIFACT/dist/index.d.ts`, `$NPM_ARTIFACT/dist/index.js.map` | rejected as patch | Non-executable artifacts (type declarations and source map). Content scan of the `.d.ts` found declarations only. |

## Notes

- Candidate generation: skill's six mandatory pattern groups plus ten
  domain-specific patterns (see `searches.md`); every hit was traced to the
  actual object written or read. All writes in the runtime code target local
  variables, local arrays, local accumulator strings, or `this` within the
  library-owned `PathError` constructor.
- No runtime dependencies exist, so no transitive candidates were possible.
- No unresolved candidates remain; the runtime snapshot diff (0 changes across
  ~200 monitored properties/key sets) corroborates every rejection.
