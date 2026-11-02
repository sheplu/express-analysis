# Pass B — Candidate Ledger

## Candidate List

### C-001: Negotiator.prototype writes (index.js:38-83)
- **Source**: `$PACKAGE_ROOT/index.js` lines 38-83
- **Pattern**: `.prototype` (Group 3)
- **Description**: 16 lines writing methods to `Negotiator.prototype` — `charset`, `charsets`, `encoding`, `encodings`, `language`, `languages`, `mediaType`, `mediaTypes`, plus 8 backwards-compat aliases (`preferredCharset`, etc.)
- **Trace**: `Negotiator` is a constructor function defined at line 30 of the same file. All prototype writes target this library-owned constructor. No Node.js built-in prototype is touched.
- **Verdict**: NOT A PATCH — library defining its own API on its own class.

### C-002: Object.defineProperty(exports, "__esModule") (content-type/dist/index.js:7)
- **Source**: `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 7
- **Pattern**: `definePropert(y|ies)` (Group 3)
- **Description**: `Object.defineProperty(exports, "__esModule", { value: true })` — standard TypeScript CJS interop marker.
- **Trace**: Writes to the module's own `exports` object. The `exports` object is a per-module local, not a shared global. This is standard tsc output.
- **Verdict**: NOT A PATCH — standard module metadata on own exports.

### C-003: C.prototype = Object.create(null) (content-type/dist/index.js:29)
- **Source**: `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 29
- **Pattern**: `.prototype`, `Object.create` (Group 3)
- **Description**: Inside the `NullObject` IIFE: creates a private constructor function `C`, sets `C.prototype = Object.create(null)`, returns `C` for use as a lightweight null-prototype object factory.
- **Trace**: `C` is a locally scoped function, never exported. The `.prototype` assignment is on this local function, not on any built-in. `Object.create(null)` creates a fresh object; no existing object is modified. Used internally to create parameter objects without inherited properties.
- **Verdict**: NOT A PATCH — internal performance optimization on a private local constructor.

### C-004: require('content-type') (accept.js:9, language.js:11, mediaType.js:11)
- **Source**: `$PACKAGE_ROOT/lib/accept.js:9`, `$PACKAGE_ROOT/lib/language.js:11`, `$PACKAGE_ROOT/lib/mediaType.js:11`
- **Pattern**: `require\s*\(` (Group 1)
- **Description**: Three files import the declared runtime dependency `content-type`.
- **Trace**: `content-type` is a pure parser (verified — its single production file `dist/index.js` contains only string parsing functions `format()` and `parse()`, with no imports of Node.js core modules, no global access, no prototype mutation of built-ins). The dependency has zero transitive dependencies.
- **Verdict**: NOT A PATCH — importing a safe, pure-parser dependency.

### C-005: Local module requires (index.js:11-14, charset.js:11, encoding.js:11, language.js:12, mediaType.js:12)
- **Source**: Various files
- **Pattern**: `require\s*\(` (Group 1)
- **Description**: Local requires of `./lib/charset`, `./lib/encoding`, `./lib/language`, `./lib/mediaType`, `./accept`.
- **Trace**: All are relative paths to files within the library itself. No core modules required.
- **Verdict**: NOT A PATCH — internal module wiring.

## Summary

| ID    | Location                           | Pattern         | Verdict   |
|-------|-------------------------------------|-----------------|-----------|
| C-001 | index.js:38-83                     | .prototype      | NOT PATCH |
| C-002 | content-type/dist/index.js:7       | defineProperty  | NOT PATCH |
| C-003 | content-type/dist/index.js:29      | .prototype      | NOT PATCH |
| C-004 | accept.js:9, language.js:11, etc.  | require()       | NOT PATCH |
| C-005 | Various local requires             | require()       | NOT PATCH |

All 5 candidates traced to library-internal operations. Zero candidates involve mutation of Node.js core objects, prototypes, globals, or module system.
