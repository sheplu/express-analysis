# Node.js patch audit: content-type (Pass B)

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: content-type (https://github.com/jshttp/content-type)
- Library: 3.1.1, commit 5d8c14e
- Node.js baseline: commit d44625a
- Scope: src/index.ts (sole production file, no dist/ built)
- Coverage: single source file, zero runtime dependencies
- Protocol: Pass B of two-pass blind audit

## Patching verdict

**No monkeypatching detected.** The library is a pure, self-contained content-type header parser and formatter. It has zero imports (no `require`, no `import`, no `from` statements), uses no Node.js globals (`Buffer`, `process`, `global`, `globalThis`), touches no shared prototypes, installs no module-loader hooks, and accesses no internal Node.js bindings.

The only regex hits (2 total, both from Search 3) relate to a local `NullObject` constructor whose prototype is set to `Object.create(null)` for performance. This is a standard dictionary-object pattern that mutates only a locally-created function's prototype -- it does not modify any Node.js built-in, global, or shared prototype.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

| ID    | Site and core target                                      | Status   | Evidence/reason                                             |
|-------|-----------------------------------------------------------|----------|-------------------------------------------------------------|
| C-001 | Line 51: `__proto__` in JSDoc comment -- no core target   | REJECTED | Comment text, not executable code                           |
| C-002 | Line 55: `C.prototype = Object.create(null)` -- no core target | REJECTED | Local constructor IIFE; only the locally-created `C.prototype` is set; no shared or Node.js prototype is touched |

No unresolved candidates remain.

## Supporting context

- The library exports four items: `format()`, `parse()`, `isTypeValid()`, `isTokenValid()`, plus the `ContentType` and `ParseOptions` TypeScript interfaces.
- All logic operates on plain strings and locally-created objects. No HTTP request/response objects, streams, or Node.js APIs are referenced.
- The `NullObject` pattern (lines 53-57) is used solely to create the `parameters` dictionary returned by `parse()`. It is equivalent to `Object.create(null)` but uses a cached constructor for speed. The `@__PURE__` annotation confirms the author considers it side-effect-free.
- The `CHAR_MAP` (line 27) is a local `Uint8Array(0x100)` used as a lookup table for character classification. It is not exported and does not interact with any global state.

## Sources and verification

| Source | Command/query | Result |
|--------|--------------|--------|
| `$PACKAGE_ROOT/src/index.ts` | Search 1: imports / require / node: | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Search 2: Buffer / process / globalThis / global / extends / inherits | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Search 3: .prototype / __proto__ / setPrototypeOf / defineProperty / Object.assign | 2 matches (lines 51, 55) -- both rejected |
| `$PACKAGE_ROOT/src/index.ts` | Search 4: monkeypatch / patch / wrap / shim / polyfill / override | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Search 5: require.cache / require.extensions / Module._ hooks / registerHooks | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Search 6: process.binding / internalBinding / _http_ / internal/ | No matches |
| `$PACKAGE_ROOT/src/index.ts` | Full file read (383 lines) | Confirmed zero imports, pure string-processing library |

## Coverage and limitations

- **Entry points checked:** `src/index.ts` is the sole production source file. The `dist/` directory referenced by `package.json` `"exports"` does not exist (not built), so `src/index.ts` is the authoritative source.
- **Dependencies checked:** `package.json` declares zero runtime dependencies. No `node_modules/` directory exists. The source file contains zero import/require statements, confirming complete self-containment.
- **What would change the verdict:** (1) If `dist/` were built and contained generated code differing from `src/index.ts`, that output would need separate inspection. (2) If runtime dependencies were added in a future version, their transitive trees would require auditing. Neither condition applies to the inspected version (3.1.1, commit 5d8c14e).
