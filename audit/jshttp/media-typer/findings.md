# media-typer v2.0.0 — Detailed Findings

## Production Source Analysis

### File: `$PACKAGE_ROOT/src/index.ts` (95 lines)

The entire production surface consists of:

- **3 private regex constants** (`subtypeNameRegExp`, `typeNameRegExp`, `typeRegExp`)
  for validating RFC 6838 media type components
- **1 TypeScript interface** (`MediaType`) with `type`, `subtype`, and optional `suffix` fields
- **3 exported pure functions:**
  - `format(obj: MediaType): string` — serializes a MediaType object to a string
  - `parse(str: string): MediaType` — parses a media type string into an object
  - `test(str: string): boolean` — validates a media type string against the RFC regex

### Characteristics

- No side effects at import time
- No state mutation
- No interaction with the runtime environment
- No I/O operations
- No use of `this` or class-based patterns
- All functions are referentially transparent

## Search Results Summary

All 6 regex search groups returned zero hits against production code.

| # | Category | Hits |
|---|----------|------|
| 1 | Import/require patterns | 0 |
| 2 | Node.js globals/builtins | 0 |
| 3 | Prototype/property manipulation | 0 |
| 4 | Patching keywords | 0 |
| 5 | Module system hooks | 0 |
| 6 | Internal Node.js bindings | 0 |

### Non-Production False Positives (excluded)

Both passes noted incidental hits in non-production files, all correctly excluded:

- `tsconfig.json` / `tsconfig.build.json`: `"extends"` keyword in JSON config
- `README.md`: documentation example with `import ... from` syntax
- `package-lock.json`: `wrap-ansi` package name substring matches
- `index.spec.ts` / `index.bench.ts`: test and benchmark imports

None of these are in production code paths.

## Runtime Dependency Analysis

- `package.json` lists zero `dependencies` (only `devDependencies`)
- No `node_modules` directory present
- No transitive patching risk

## Confirmed Findings

| ID | Description | Status |
|----|-------------|--------|
| (none) | No findings | N/A |

## Coverage and Limitations

- The `dist/` directory was not present (not built), so the audit was performed
  against the TypeScript source (`src/index.ts`). The build step (`ts-scripts build`)
  is a straightforward TypeScript compilation; no code injection or transform
  beyond standard TS-to-JS transpilation is expected.
- The `sideEffects: false` flag in `package.json` confirms the author's intent
  that importing the module produces no observable side effects.
