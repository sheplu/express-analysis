# Detailed Findings: accepts

## Reconciled Candidate Ledger

All candidates from both passes are listed below with their final reconciled disposition.

### F-001: Accepts.prototype writes
- **Location**: `$PACKAGE_ROOT/index.js` lines 83-196
- **Pass A**: C-001 | **Pass B**: C-010
- **Pattern**: `.prototype` (Group 3)
- **Code**: `Accepts.prototype.type = ...`, `Accepts.prototype.types = function(types_) {...}`, etc. (10 property assignments total: type, types, encoding, encodings, charset, charsets, lang, langs, language, languages)
- **Analysis**: All assignments target the `Accepts` constructor defined at line 32 of the same file. This is the standard JavaScript prototype-based class definition pattern. No Node.js core prototype is referenced or modified.
- **Final Verdict**: NOT PATCHING

### F-002: Negotiator.prototype writes
- **Location**: `$PACKAGE_ROOT/node_modules/negotiator/index.js` lines 38-83
- **Pass A**: C-002 | **Pass B**: C-011
- **Pattern**: `.prototype` (Group 3)
- **Code**: `Negotiator.prototype.charset = function charset(available) {...}`, etc. (8 method definitions + backwards-compat aliases: preferredCharset, preferredCharsets, preferredEncoding, preferredEncodings, preferredLanguage, preferredLanguages, preferredMediaType, preferredMediaTypes)
- **Analysis**: All assignments target the `Negotiator` constructor defined at line 30 of the same file. Library-owned prototype. Not core patching.
- **Final Verdict**: NOT PATCHING

### F-003: Object.defineProperty on exports (content-type)
- **Location**: `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 7
- **Pass A**: C-003 | **Pass B**: C-012
- **Pattern**: `defineProperty` (Group 3)
- **Code**: `Object.defineProperty(exports, "__esModule", { value: true });`
- **Analysis**: Standard TypeScript/Babel CJS interop marker. Sets a flag on the module's own `exports` object. Does not touch any Node.js core object or prototype.
- **Final Verdict**: NOT PATCHING

### F-004: Null-prototype constructor (content-type)
- **Location**: `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 29
- **Pass A**: C-004 | **Pass B**: C-013
- **Pattern**: `.prototype`, `Object.create` (Group 3)
- **Code**: `const NullObject = (() => { const C = function() {}; C.prototype = Object.create(null); return C; })();`
- **Analysis**: Creates a local, anonymous constructor whose prototype is a null-prototype object. Used purely internally for parameter storage (performance optimization). The constructor `C` is module-private and is not exported. Not a Node.js built-in.
- **Final Verdict**: NOT PATCHING

### F-005: require('path').extname (mime-types)
- **Location**: `$PACKAGE_ROOT/node_modules/mime-types/index.js` line 16
- **Pass A**: C-005 | **Pass B**: C-003
- **Pattern**: `require` (Group 1)
- **Code**: `var extname = require('path').extname`
- **Analysis**: Read-only access to the `path` core module. Reads the `extname` function by reference. No modification to `path` or its exports. This is the only Node.js core module used in the entire dependency tree.
- **Final Verdict**: NOT PATCHING

### F-006: All other require() calls
- **Location**: Various files across the dependency tree
- **Pass A**: C-006 (grouped) | **Pass B**: C-001 through C-009 (individual)
- **Pattern**: `require` (Group 1)
- **Code**: Standard `require()` calls for npm dependencies and local modules
- **Analysis**: All are standard module imports with no side-effect mutations. Includes `require('negotiator')`, `require('mime-types')`, `require('mime-db')`, `require('content-type')`, `require('./accept')`, `require('./mimeScore')`, `require('./db.json')`, and negotiator's internal lib requires.
- **Final Verdict**: NOT PATCHING

## Search Groups with Zero Hits

| Group | Pattern | Production Hits |
|-------|---------|----------------|
| 2     | Buffer/process/globalThis/global/extends/inherits | 0 |
| 4     | monkey?patch/patch/wrap/shim/polyfill/override | 0 |
| 5     | require.cache/require.extensions/Module._* | 0 |
| 6     | process.binding/_linkedBinding/internalBinding/_http_/internal/ | 0 |

## Dependency Tree Audit

| Package      | Role               | Core Modules Used | Patches Found |
|--------------|--------------------|-------------------|---------------|
| accepts      | Main package       | None              | None          |
| negotiator   | Direct dependency  | None              | None          |
| mime-types    | Direct dependency  | path (read-only)  | None          |
| mime-db       | Transitive (via mime-types) | None       | None          |
| content-type  | Transitive (via negotiator) | None      | None          |

## Coverage and Limitations

- All production JS files in the dependency tree were searched with 6 regex groups
- JSON data files (mime-db/db.json) were excluded from prototype/global analysis as they contain only data
- Tests, benchmarks, examples, and docs were excluded per protocol
- The audit covers the source at commit 19db02a; future versions may differ
