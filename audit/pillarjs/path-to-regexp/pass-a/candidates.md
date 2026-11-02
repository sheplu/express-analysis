# Pass A candidate ledger: path-to-regexp@9.0.0

Every lead from the searches in `searches.md`, traced to the object actually
written or read. File references: `src` = `$PACKAGE_ROOT/src/index.ts`
(git @ `32292b9d13239c7fa3ed23e89c59c10264f9fe20`), `dist` =
`$NPM_ARTIFACT/dist/index.js` (published 9.0.0).

| ID | Site and core target | Status | Evidence / rejection reason |
| --- | --- | --- | --- |
| C-001 | src:128 / dist:21 — `class PathError extends TypeError` (JS intrinsic `TypeError`) | rejected as patch | Ordinary subclassing. `TypeError` and `TypeError.prototype` are only read (as superclass); nothing is assigned onto them. The subclass constructor writes only `this.originalPath` (own field on library-owned instances, dist:27) and calls `super(...)`. Dynamic check: `TypeError`/`TypeError.prototype`/`Error.prototype` descriptors unchanged after import and after throwing/catching a `PathError`. Skill explicitly classifies ordinary inheritance as non-patch. |
| C-002 | src:452,454,476 / dist:236,239,253 — identifier `process` (Node global `process`?) | rejected as patch | Lexical shadowing only: `function process(path)` is a local helper declared inside `pathToRegexp` and called recursively; it never references, reads, or writes Node's `process` global. No `process.*` member access exists anywhere in runtime code. |
| C-003 | src:417 / dist:213 — `regexp.exec(input)` (`RegExp.prototype.exec`) | rejected as patch | Call expression, not an assignment. Invoked on the RegExp instance the library itself constructed in `pathToRegexp`. No write to `exec`, no `Symbol.match`/`Symbol.replace`/`Symbol.split` definitions anywhere (Symbol: zero hits). Dynamic check confirmed `RegExp.prototype.exec` identity unchanged after import and use. |
| C-004 | src:481 / dist:256 — `new RegExp(pattern, flags)` returned to consumers (patched RegExp instances?) | rejected as patch | Constructs a plain `RegExp` and returns it in `{ regexp, keys }`; `keys` is a separate array, not attached to the instance (unlike path-to-regexp <8.0.0, which attached a `keys` property to its own output regexp — itself never a core patch; removed per History.md "Remove `keys` list attached to the `RegExp` output"). Dynamic check: returned object's prototype is exactly `RegExp.prototype` and its own keys are only the standard `lastIndex`. |
| C-005 | dist:27 `this.originalPath = ...`; src:323/dist:157 `missing.length = len`; src:501/dist:267 `result.length = len` | rejected as patch | The only property assignments in the entire runtime code (exhaustive dotted-member write scan, searches.md #13). All three write to library-owned values: an own field of a `PathError` instance and length-truncation of local arrays created within the library. No shared or core object is reachable from these writes. |
| C-006 | src:338,453 / dist:169,237 `Array.isArray(...)`; src:421 / dist:217 `Object.create(null)` | rejected as patch | Read-only use of intrinsic statics. `Object.create(null)` creates a fresh null-prototype object for match params (defensive, avoids prototype pollution); nothing is mutated on `Object`, `Array`, or their prototypes. |
| C-007 | src:43,256,278,379,387,392,402 — `extends` in TypeScript interfaces/generic constraints | rejected as patch | Type-level syntax only (interface extension and generic bounds); erased by compilation and absent from dist runtime output. |
| C-008 | src:260,406 / dist:122,203 — `encodeURIComponent` / `decodeURIComponent` defaults | rejected as patch | Reads of global intrinsic functions used as default option values; never reassigned. Dynamic check confirmed both global identities unchanged after import and use. |

Confirmed candidates: **0**. Unresolved candidates: **0**. Rejected: **8**.

No candidate reached any Node.js core module (none is imported — search group 1
had zero hits), any shared prototype, any global, any module loader hook, or any
on-disk core source. Therefore no Node core baseline file comparison was
required; see report.md "Sources and verification".
