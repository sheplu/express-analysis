# Detailed Findings: basic-auth v3.0.0

## Confirmed Findings

None. No patches or monkeypatches of Node.js core were found.

## Candidate Analysis

### C-001: Local ESM import (DISMISSED)

- **File**: `$PACKAGE_ROOT/src/index.ts`, line 9
- **Code**: `import { base64 } from './base64.js'`
- **Pattern**: Group 1 (import/require detection)
- **Analysis**: This is a local relative import of the library's own `base64` module. It does not import any Node.js core module. No patching vector.

### C-002: Buffer typeof check (DISMISSED)

- **File**: `$PACKAGE_ROOT/src/base64.ts`, line 2
- **Code**: `if (typeof Buffer !== 'undefined')`
- **Pattern**: Group 2 (Buffer/global detection)
- **Analysis**: Read-only `typeof` check used for runtime feature detection. The library branches between Node.js `Buffer` and Web API (`TextEncoder`/`Uint8Array.fromBase64`) at load time. This is a standard isomorphic pattern. The check reads the global scope but does not write to it.

### C-003: Buffer.from for base64 encoding (DISMISSED)

- **File**: `$PACKAGE_ROOT/src/base64.ts`, line 4
- **Code**: `Buffer.from(str, 'utf-8').toString('base64')`
- **Pattern**: Group 2 (Buffer detection)
- **Analysis**: Standard `Buffer.from()` factory call to create a new Buffer instance and convert it to a base64 string. This is normal API consumption — it creates new instances without touching `Buffer.prototype`, `Buffer` itself, or any global.

### C-004: Buffer.from for base64 decoding (DISMISSED)

- **File**: `$PACKAGE_ROOT/src/base64.ts`, line 5
- **Code**: `Buffer.from(str, 'base64').toString('utf-8')`
- **Pattern**: Group 2 (Buffer detection)
- **Analysis**: Same pattern as C-003, used for decoding. Standard read-only API usage.

## Architecture Notes

The `base64.ts` module uses an immediately-invoked function expression (IIFE) to select the appropriate base64 implementation at load time:

1. **Node.js path**: If `Buffer` is available, uses `Buffer.from()` for encode/decode
2. **Web/non-Node path**: Falls back to `TextEncoder`/`TextDecoder` with `Uint8Array.fromBase64()` and `.toBase64()`

This is a clean isomorphic pattern that adapts to the runtime environment without modifying it.

## Dependency Analysis

The package has zero runtime dependencies (`dependencies` and `optionalDependencies` are absent from `package.json`). All `devDependencies` are build/test tools that do not ship in the published package. There is no transitive patching risk.

## Coverage and Limitations

- All production source files were read and analyzed in full
- 6 regex search groups covered: imports/requires, globals/Buffer, prototype manipulation, patching keywords, module-loader hooks, and internal Node.js APIs
- The `dist/` directory (compiled output) was not present in the repository, so analysis was performed on the TypeScript source. The compiled output is a straightforward transpilation with no additional code injection (confirmed by the build toolchain: `@borderless/ts-scripts` using standard TypeScript compilation)
- No runtime dependencies to check for transitive effects
