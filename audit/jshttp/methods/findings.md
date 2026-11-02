# Detailed findings: methods v1.1.2

## Summary

No confirmed patches. Two candidates investigated; both dismissed.

## Candidate details

### C-001: `require('http')` at `$PACKAGE_ROOT/index.js:15`

- **Matched pattern group**: Group 1 (require/import/from)
- **Raw match**: `var http = require('http')`
- **Analysis**: Standard CommonJS import of the Node.js built-in `http` module. The imported binding `http` is used exactly once, at line 30: `http.METHODS && http.METHODS.map(...)`. This is a pure read operation. The `.map()` call creates a new array; it does not mutate `http.METHODS`. No other property of `http` is accessed, and no property is ever assigned to `http` or any of its sub-objects.
- **Verdict**: Not monkeypatching. Normal read-only API usage.
- **Pass A**: Dismissed (same reasoning)
- **Pass B**: Dismissed (same reasoning)

### C-002: `'patch'` at `$PACKAGE_ROOT/index.js:65`

- **Matched pattern group**: Group 4 (patch/wrap/shim/polyfill/override)
- **Raw match**: `'patch',` (inside a hardcoded array literal)
- **Analysis**: The word "patch" here is the HTTP PATCH method name (RFC 5789), appearing as a string element in the fallback methods list. It is not related to code patching, wrapping, or shimming in any way.
- **Verdict**: False positive. String literal for HTTP method name.
- **Pass A**: Dismissed (same reasoning)
- **Pass B**: Dismissed (same reasoning)

## Search groups with zero hits

| Group | Pattern focus                            | Production hits |
|-------|------------------------------------------|-----------------|
| 2     | Buffer, process, globalThis, global      | 0               |
| 3     | prototype, defineProperty, Object.assign | 0               |
| 5     | require.cache, Module._load, extensions  | 0               |
| 6     | process.binding, internalBinding         | 0               |
