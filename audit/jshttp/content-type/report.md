# Node.js patch audit: content-type

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: content-type (https://github.com/jshttp/content-type)
- Library: 3.1.1, commit 5d8c14e1a238e1841f621145c6426bf2cd20a72c
- Node.js baseline: commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Scope: `$PACKAGE_ROOT/src/index.ts` (sole production file; `dist/` not built)
- Coverage: single source file (383 lines), zero runtime dependencies, no `node_modules/`
- Protocol: two full independent blind audits (pass-a/, pass-b/) reconciled

## Patching verdict

**No confirmed patching.** Both independent audit passes reached identical conclusions.

The library is entirely self-contained: it has zero imports (`require`, `import`, `from`, or `node:` protocol), zero runtime dependencies, and makes no references to any Node.js globals (`Buffer`, `process`, `globalThis`, `global`), core modules, internal bindings, or module-loading hooks. All exported functions (`format`, `parse`, `isTypeValid`, `isTokenValid`) operate exclusively on plain strings and locally-created objects. No HTTP request/response objects, streams, or other Node.js APIs are referenced anywhere.

Two regex hits were found (search group 3: prototype/defineProperty), both conclusively rejected as normal, safe API usage:

1. A code comment mentioning `__proto__: null` as a comparison point (not executable code).
2. A `C.prototype = Object.create(null)` assignment inside a locally-scoped IIFE that creates a `NullObject` constructor for dictionary-like parameter objects. This modifies only a freshly created local function's prototype -- no Node.js built-in, global, or shared prototype is touched.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence/reason |
|----|---------------------|--------|-----------------|
| C-001 | `$PACKAGE_ROOT/src/index.ts:51` -- `__proto__` in comment | REJECTED | Appears inside a JSDoc/inline comment (`__proto__: null`). Not executable code. No mutation occurs. |
| C-002 | `$PACKAGE_ROOT/src/index.ts:53-57` -- `C.prototype = Object.create(null)` | REJECTED | Sets prototype of a freshly created, locally-scoped constructor `C` inside a pure IIFE. Creates a `NullObject` class for dictionary objects. No Node.js built-in, global, or shared prototype is modified. Standard JS performance pattern. |

No unresolved questions remain.

## Supporting context

- The library is a pure Content-Type header parser/serializer conforming to RFC 9110.
- The `NullObject` pattern (C-002) is a well-known optimization for creating objects without `Object.prototype` in the chain, avoiding prototype pollution risks and improving property lookup. It is equivalent to `Object.create(null)` but structured as a constructor for faster instantiation.
- The library requires Node.js >= 22 (per `engines` field) and uses ESM (`"type": "module"`).
- All private API usage is limited to standard ECMAScript builtins (`Object.create`, `Object.keys`, `Uint8Array`, `String.prototype` methods). None of these are modified.

## Sources and verification

| Source | Command/query | Result |
|--------|--------------|--------|
| Package metadata | `cat $PACKAGE_ROOT/package.json` | v3.1.1, ESM, zero `dependencies`, `exports: "./dist/index.js"` |
| Git commit | `git rev-parse HEAD` in `$PACKAGE_ROOT` | 5d8c14e1a238e1841f621145c6426bf2cd20a72c |
| Node.js baseline | `git rev-parse HEAD` in `$NODEJS_SOURCE` | d44625a4b80c672215b469906ce583ce7eeeebaf |
| File listing | `find` excluding tests/benchmarks/docs | Single production file: `src/index.ts` |
| Runtime deps | `ls node_modules/` | No `node_modules/` directory |
| Search group 1 (imports) | `rg -n 'require\|from\|import\|node:'` | 0 matches |
| Search group 2 (globals) | `rg -n 'Buffer\|process\|globalThis\|global\|extends\|inherits'` | 0 matches |
| Search group 3 (prototype) | `rg -n '.prototype\|__proto__\|setPrototypeOf\|defineProperty\|Object.assign'` | 2 matches (both rejected) |
| Search group 4 (patching keywords) | `rg -n 'monkey.?patch\|patch\|wrap\|shim\|polyfill\|override'` | 0 matches |
| Search group 5 (module hooks) | `rg -n 'require.cache\|require.extensions\|Module._'` | 0 matches |
| Search group 6 (internal bindings) | `rg -n 'process.binding\|internalBinding\|_http_\|internal/'` | 0 matches |

## Coverage and limitations

- **Entry points covered:** `$PACKAGE_ROOT/src/index.ts` is the sole source file. The `dist/` directory (declared in `files` and `exports`) was not built, so the TypeScript source was audited directly. The compiled output would be a strict subset (no type annotations, same logic).
- **Dependencies:** Zero runtime dependencies confirmed (no `dependencies` in `package.json`, no `node_modules/` directory).
- **What would change the verdict:** If a `dist/` build introduced injected code (e.g., via a build plugin) beyond straight TypeScript compilation, that could differ from what was audited here. However, the build tooling (`@borderless/ts-scripts`) is a devDependency and standard TS transpiler -- this is extremely unlikely.
