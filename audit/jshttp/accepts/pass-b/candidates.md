# Pass B — Candidate Ledger

## C-001: require('negotiator') — index.js:15
- **Category**: Module import
- **Code**: `var Negotiator = require('negotiator')`
- **Analysis**: Standard require of an npm dependency. Loads the `negotiator` package. No mutation of Node.js core.
- **Verdict**: NOT PATCHING

## C-002: require('mime-types') — index.js:16
- **Category**: Module import
- **Code**: `var mime = require('mime-types')`
- **Analysis**: Standard require of an npm dependency. Loads the `mime-types` package. No mutation of Node.js core.
- **Verdict**: NOT PATCHING

## C-003: require('path').extname — mime-types/index.js:16
- **Category**: Module import (core module)
- **Code**: `var extname = require('path').extname`
- **Analysis**: Read-only access to the `path` core module. Reads the `extname` function. Does not modify `path` or its prototype.
- **Verdict**: NOT PATCHING

## C-004: require('mime-db') — mime-types/index.js:15
- **Category**: Module import
- **Code**: `var db = require('mime-db')`
- **Analysis**: Standard require of npm dependency. No mutation.
- **Verdict**: NOT PATCHING

## C-005: require('./mimeScore') — mime-types/index.js:17
- **Category**: Module import (local)
- **Code**: `var mimeScore = require('./mimeScore')`
- **Analysis**: Local module import. No mutation.
- **Verdict**: NOT PATCHING

## C-006: require('./db.json') — mime-db/index.js:12
- **Category**: Module import (local JSON)
- **Code**: `module.exports = require('./db.json')`
- **Analysis**: Loading a local JSON file. No mutation.
- **Verdict**: NOT PATCHING

## C-007: require('./lib/*') — negotiator/index.js:11-14
- **Category**: Module import (local)
- **Code**: `var preferredCharsets = require('./lib/charset')` (and 3 more)
- **Analysis**: Standard local imports within negotiator. No mutation.
- **Verdict**: NOT PATCHING

## C-008: require('content-type') — negotiator/lib/accept.js:9, language.js:11, mediaType.js:11
- **Category**: Module import
- **Code**: `var contentType = require('content-type');`
- **Analysis**: Standard require of npm dependency. No mutation.
- **Verdict**: NOT PATCHING

## C-009: require('./accept') — negotiator/lib/charset.js:11, encoding.js:11, language.js:12, mediaType.js:12
- **Category**: Module import (local)
- **Code**: `var parseAccept = require('./accept');`
- **Analysis**: Standard local module imports. No mutation.
- **Verdict**: NOT PATCHING

## C-010: Accepts.prototype.* — index.js:83-196
- **Category**: Prototype assignment on library-owned constructor
- **Code**: `Accepts.prototype.type = ...`, `Accepts.prototype.types = function ...`, etc.
- **Analysis**: All assignments are to the library's own `Accepts` constructor prototype. `Accepts` is defined in this file at line 32. These do NOT touch any Node.js core prototype (e.g., `http.IncomingMessage.prototype`, `Object.prototype`).
- **Verdict**: NOT PATCHING (library-owned constructor)

## C-011: Negotiator.prototype.* — negotiator/index.js:38-83
- **Category**: Prototype assignment on library-owned constructor
- **Code**: `Negotiator.prototype.charset = function charset(available) { ... }`, etc.
- **Analysis**: All assignments are to the library's own `Negotiator` constructor prototype. `Negotiator` is defined in the same file at line 30. The alias assignments (lines 76-83) also target `Negotiator.prototype` only. These do NOT touch any Node.js core prototype.
- **Verdict**: NOT PATCHING (library-owned constructor)

## C-012: Object.defineProperty(exports, "__esModule", ...) — content-type/dist/index.js:7
- **Category**: TypeScript CJS interop boilerplate
- **Code**: `Object.defineProperty(exports, "__esModule", { value: true });`
- **Analysis**: Standard TypeScript compiler output. Sets `__esModule` flag on the module's own exports object. Does not touch any Node.js core object.
- **Verdict**: NOT PATCHING

## C-013: C.prototype = Object.create(null) — content-type/dist/index.js:29
- **Category**: Internal constructor setup
- **Code**: `C.prototype = Object.create(null);`
- **Analysis**: Creates a local constructor `C` (an anonymous function) and sets its prototype to a null-prototype object. This is a performance optimization for creating objects with no inherited properties. The constructor `C` is private to the `content-type` module (assigned to const `NullObject`). Does not modify any Node.js core prototype.
- **Verdict**: NOT PATCHING (library-internal constructor)

## Summary

All 13 candidates traced. Zero confirmed patches or monkeypatches of Node.js core.
