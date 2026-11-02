# type-is v3.0.0 — Methodology & Reconciliation Notes

## Audit Protocol

A double-blind audit was performed with two independent passes (Pass A and Pass B), each running 6 regex search groups across all production source files, followed by reconciliation.

## Scope

- **Package:** type-is v3.0.0 (ESM)
- **Commit:** `74fc347aab35175c5cca0bb8142e95e033e506cd`
- **Production files:** 2 files (514 total lines)
  - `$PACKAGE_ROOT/src/index.ts` (223 lines) — main library source
  - `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` (291 lines) — sole runtime dependency
- **Excluded:** test files (`src/index.spec.ts`, `src/index.bench.ts`), `node_modules/**/node_modules/`

### Note on source format

The package ships as ESM with `"type": "module"`. The source is TypeScript (`src/index.ts`) compiled to `dist/index.js` at build time. The `dist/` directory was not present (unbuilt), so the TypeScript source was audited directly. The TypeScript source is a strict superset of the compiled output — any patch present in compiled JS would necessarily originate in the TS source.

## Search Groups Executed

1. **Imports/requires/node:** — `require\s*\(`, `from\s*['"]`, `import\s*\(`, `node:`
2. **Globals:** — `Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits\s*\(`
3. **Prototype/property manipulation:** — `.prototype`, `__proto__`, `setPrototypeOf`, `defineProperty`, `defineProperties`, `Reflect.set`, `Object.assign`
4. **Patching keywords:** — `monkey.?patch`, `patch`, `wrap`, `shim`, `polyfill`, `override`
5. **Module loader hooks:** — `require.cache`, `require.extensions`, `Module._*`, `syncBuiltinESMExports`, `registerHooks`
6. **Internal bindings:** — `process.binding`, `process._linkedBinding`, `internalBinding`, `_http_`, `internal/`

## Pass Comparison

| Aspect | Pass A | Pass B |
|--------|--------|--------|
| Verdict | CLEAN | CLEAN |
| Total candidates | 4 | 4 |
| Confirmed patches | 0 | 0 |
| Candidate IDs | C-001 through C-004 | C-001 through C-004 |
| Search hits (by group) | 1, 1, 2, 0, 0, 0 | 1, 1, 2, 0, 0, 0 |

## Reconciliation

**Disagreements: None.**

Both passes produced identical results:
- Same 4 candidates identified from the same source locations
- Same dismissal reasoning for each candidate
- Same CLEAN verdict
- Identical search hit counts across all 6 groups

No adjudication was necessary. The final verdict is the unanimous agreement of both passes.

## Dependency Chain

```
type-is@3.0.0
  └── content-type@3.1.1 (zero runtime deps)
```

- `content-type` v3.1.1: audited within this investigation and previously audited as CLEAN
- `mime-types`: listed as a dependency in prior intelligence but NOT present in this v3.0.0 release — the package.json shows only `content-type` as a runtime dependency

## Coverage & Limitations

- All production source code was read in full (514 lines across 2 files)
- 6 regex search groups cover: imports, globals, prototype manipulation, patching keywords, module loader hooks, and internal bindings
- The `dist/` directory was not present; TypeScript source was audited instead (the TS source is strictly more expressive than compiled JS output)
- No dynamic code generation patterns (`eval`, `new Function`) were observed
- The library performs no I/O, no network access, and no file system operations

## Final Verdict

**CLEAN** — type-is v3.0.0 does not patch or monkeypatch Node.js core in any way.
