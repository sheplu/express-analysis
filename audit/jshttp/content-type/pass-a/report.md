# Node.js patch audit: content-type (Pass A)

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: content-type (https://github.com/jshttp/content-type)
- Library: 3.1.1, commit 5d8c14e
- Node.js baseline: commit d44625a
- Scope: src/index.ts (sole production file, no dist/ built)
- Coverage: single source file, zero runtime dependencies
- Protocol: Pass A of two-pass blind audit

## Patching verdict

No monkeypatching of Node.js core detected. The library is a pure string parser/formatter for Content-Type headers. It has zero imports (no `require`, no `import`, no `node:` modules), does not reference any Node.js globals (`Buffer`, `process`, `globalThis`), does not touch any shared prototypes, and does not interact with the module loading system or internal bindings.

The only regex hits came from Group 3 (prototype/defineProperty patterns): a comment mentioning `__proto__: null` (line 51) and a `C.prototype = Object.create(null)` assignment (line 55). Both are part of a local `NullObject` constructor IIFE that creates dictionary objects with null prototypes for performance. The constructor `C` is entirely local and freshly created -- it does not modify any Node.js built-in prototype or global.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

| ID    | Site and core target                                    | Status   | Evidence/reason                                                                                          |
|-------|---------------------------------------------------------|----------|----------------------------------------------------------------------------------------------------------|
| C-001 | Line 51: `__proto__: null` in comment; no core target   | Rejected | Code comment only, no executable code                                                                    |
| C-002 | Lines 53-57: `C.prototype = Object.create(null)`; local constructor | Rejected | `C` is a locally-scoped, freshly created function inside an IIFE. Setting its prototype to `null` affects only local `NullObject` instances. No Node.js built-in, global, or shared prototype is modified. Standard JS perf pattern. |

No unresolved questions remain.

## Supporting context

The library exports four items: `format()`, `parse()`, `isTypeValid()`, `isTokenValid()`, plus TypeScript interfaces `ContentType` and `ParseOptions`. All functions operate on plain strings and return plain objects. The library is entirely self-contained -- it imports nothing from Node.js or any external package. Its `package.json` lists zero `dependencies`.

The `NullObject` pattern (lines 53-57) is a documented performance optimization used in place of `Object.create(null)`. It creates a reusable constructor whose instances have a null prototype chain, used internally to store parsed Content-Type parameters without inheriting from `Object.prototype`.

## Sources and verification

| Source | Command/query | Result |
|--------|---------------|--------|
| `$PACKAGE_ROOT/src/index.ts` | Group 1: imports/require/node: | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Group 2: Buffer/process/globalThis/global/extends/inherits | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Group 3: .prototype/__proto__/setPrototypeOf/defineProperty/Object.assign | 2 matches (lines 51, 55) -- both rejected |
| `$PACKAGE_ROOT/src/index.ts` | Group 4: monkeypatch/patch/wrap/shim/polyfill/override | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Group 5: require.cache/require.extensions/Module._*/syncBuiltinESMExports/registerHooks | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Group 6: process.binding/internalBinding/_http_/internal/ | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Full file read (383 lines) | Manually reviewed; confirmed pure string parser |

## Coverage and limitations

- **Entry points:** The sole production source `src/index.ts` was fully read and searched (383 lines). The compiled `dist/` directory does not exist (not built), so the TypeScript source is the authoritative code.
- **Dependencies:** Zero runtime dependencies (`dependencies` field absent or empty in package.json). No `node_modules` to audit.
- **What would change the verdict:** If `dist/` were built and contained post-compilation injections not present in source, or if a future version added dependencies or Node.js imports, the verdict would need re-evaluation. Neither condition exists in the inspected commit.
