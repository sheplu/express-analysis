# Node.js patch audit: methods

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: methods (https://github.com/jshttp/methods)
- Library: v1.1.2, commit `f89e491ab3f2a1e8c418648b890da2e96ef15edb`
- Node.js baseline: commit `d44625a4b80c672215b469906ce583ce7eeeebaf`
- Scope: `$PACKAGE_ROOT/index.js` (sole production file, 70 lines)
- Coverage: 100% of production source; zero runtime dependencies confirmed
- Protocol: two full independent blind audits (pass-a/, pass-b/) reconciled

## Patching verdict

**No monkeypatching detected.** The `methods` library is a pure data accessor. It imports Node.js core `http` via `require('http')`, reads the public `http.METHODS` array, produces a new lowercased copy via `.map()`, and exports it. A hardcoded fallback list is used when `http.METHODS` is unavailable (Node.js < 0.12). No property is written on any core object, no prototype is touched, no global is mutated, and no module-loader hook is installed.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Two regex leads were identified across both independent passes. Both were unanimously dismissed.

| ID    | File                    | Line | Match               | Category          | Verdict              | Reason                                                              |
|-------|-------------------------|------|----------------------|-------------------|----------------------|---------------------------------------------------------------------|
| C-001 | `$PACKAGE_ROOT/index.js` | 15   | `require('http')`    | Core module import | Not monkeypatching  | Standard read-only import; `http.METHODS` is only read (line 30), never written |
| C-002 | `$PACKAGE_ROOT/index.js` | 65   | `'patch'`            | Keyword match      | False positive       | String literal for the HTTP PATCH method name in a static array     |

No unresolved questions remain.

## Supporting context

### What the module does

```
var http = require('http')
module.exports = getCurrentNodeMethods() || getBasicNodeMethods()
```

1. `getCurrentNodeMethods()` reads `http.METHODS` (a frozen array in modern Node.js), maps each entry to lowercase, and returns a **new** array. The original `http.METHODS` is never mutated.
2. `getBasicNodeMethods()` returns a hardcoded array of 26 HTTP method names as a fallback for Node.js versions that lack `http.METHODS`.
3. The module exports whichever array is produced.

### Runtime dependencies

Zero. The `package.json` lists only `devDependencies`. No `node_modules/` directory exists in the package. The `browser` field maps `http` to `false` for bundler compatibility, which is metadata only.

### Search coverage

Six regex groups were executed across the sole production file:

| Group | Pattern focus                        | Hits | Outcome         |
|-------|--------------------------------------|------|-----------------|
| 1     | require/import/from                  | 1    | C-001 (dismissed) |
| 2     | Buffer/process/globalThis/global     | 0    | Clean           |
| 3     | prototype/defineProperty/Object.assign | 0  | Clean           |
| 4     | patch/wrap/shim/polyfill/override    | 1    | C-002 (dismissed) |
| 5     | require.cache/Module._load/extensions | 0   | Clean           |
| 6     | process.binding/internalBinding      | 0    | Clean           |

## Sources and verification

- Library source: `$PACKAGE_ROOT/index.js` (70 lines, sole production file per `package.json` `files` field)
- Library commit: `f89e491ab3f2a1e8c418648b890da2e96ef15edb`
- Node.js baseline commit: `d44625a4b80c672215b469906ce583ce7eeeebaf`
- Pass A report: `pass-a/report.md`, `pass-a/candidates.md`, `pass-a/searches.md`
- Pass B report: `pass-b/report.md`, `pass-b/candidates.md`, `pass-b/searches.md`

## Coverage and limitations

- **Covered**: 100% of production source code (1 file, 70 lines). All 6 regex search categories applied. Zero runtime dependencies to audit.
- **Not covered**: The library does not ship any native addons, WASM, or secondary entrypoints. The `browser` field is metadata only and does not affect Node.js behavior.
- **Confidence**: High. The codebase is trivially small and fully inspected by both passes with identical conclusions.
