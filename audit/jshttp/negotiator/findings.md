# Detailed findings: negotiator v1.1.0

## Summary

**No confirmed patches found.** All 5 candidates were traced and rejected as library-internal operations.

## Search group results

| Group | Description | Production Hits | Patch-Relevant |
|-------|-------------|-----------------|----------------|
| 1 | Imports/requires | 11 | 0 |
| 2 | Globals/builtins | 0 | 0 |
| 3 | Prototype/property | 18 | 0 |
| 4 | Patching keywords | 0 | 0 |
| 5 | Module system hooks | 0 | 0 |
| 6 | Internal bindings | 0 | 0 |

Total regex hits in production files: 29. Candidates requiring tracing: 5. Confirmed patches: 0.

## Production file inventory

| # | File | Lines | Description |
|---|------|-------|-------------|
| 1 | `$PACKAGE_ROOT/index.js` | 84 | Entry point, Negotiator class |
| 2 | `$PACKAGE_ROOT/lib/accept.js` | 55 | Accept header parser |
| 3 | `$PACKAGE_ROOT/lib/charset.js` | 146 | Accept-Charset negotiation |
| 4 | `$PACKAGE_ROOT/lib/encoding.js` | 185 | Accept-Encoding negotiation |
| 5 | `$PACKAGE_ROOT/lib/language.js` | 159 | Accept-Language negotiation |
| 6 | `$PACKAGE_ROOT/lib/mediaType.js` | 177 | Accept (media type) negotiation |
| 7 | `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` | 176 | Content-Type parser (dep) |

## Candidate details

### C-001: Negotiator.prototype writes
- **Location:** `$PACKAGE_ROOT/index.js:38-83`
- **Pattern:** `.prototype` (Group 3)
- **Verdict:** NOT A PATCH
- **Detail:** 16 assignments to `Negotiator.prototype` defining the library's public API. `Negotiator` is the library's own constructor. All writes target this library-owned object exclusively.

### C-002: Object.defineProperty on exports
- **Location:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js:7`
- **Pattern:** `defineProperty` (Group 3)
- **Verdict:** NOT A PATCH
- **Detail:** Standard TypeScript CJS interop marker on module's own `exports` object.

### C-003: NullObject prototype factory
- **Location:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js:27-31`
- **Pattern:** `.prototype`, `Object.create` (Group 3)
- **Verdict:** NOT A PATCH
- **Detail:** Local IIFE creating null-prototype constructor for internal use. Never exported, never touches existing prototype chain.

### C-004: require('content-type')
- **Location:** `$PACKAGE_ROOT/lib/accept.js:9`, `lib/language.js:11`, `lib/mediaType.js:11`
- **Pattern:** `require()` (Group 1)
- **Verdict:** NOT A PATCH
- **Detail:** Declared runtime dependency. content-type v2.1.0 audited inline — clean.

### C-005: Local module requires
- **Location:** `$PACKAGE_ROOT/index.js:11-14`, `lib/*.js`
- **Pattern:** `require()` (Group 1)
- **Verdict:** NOT A PATCH
- **Detail:** Internal module wiring using relative paths.
