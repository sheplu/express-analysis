# Pass A — Candidate Ledger

Package: accepts v2.0.0, commit 19db02a

## Candidate Analysis

### C-001: Accepts.prototype writes (index.js:83-196)

**Source:** `$PACKAGE_ROOT/index.js` lines 83-196
**Pattern:** `.prototype` (Group 3)
**Code:**
```js
Accepts.prototype.type = ...
Accepts.prototype.types = function (types_) { ... }
Accepts.prototype.encoding = ...
Accepts.prototype.encodings = function (encodings_) { ... }
Accepts.prototype.charset = ...
Accepts.prototype.charsets = function (charsets_) { ... }
Accepts.prototype.lang = ...
Accepts.prototype.langs = ...
Accepts.prototype.language = ...
Accepts.prototype.languages = function (languages_) { ... }
```
**Analysis:** All writes are to `Accepts.prototype` — the library's OWN constructor defined at line 32 of the same file. This is standard JavaScript class definition, not core patching.
**Verdict:** NOT PATCHING

---

### C-002: Negotiator.prototype writes (negotiator/index.js:38-83)

**Source:** `$PACKAGE_ROOT/node_modules/negotiator/index.js` lines 38-83
**Pattern:** `.prototype` (Group 3)
**Code:**
```js
Negotiator.prototype.charset = function charset(available) { ... }
// ... (8 method definitions + 8 backwards-compat aliases)
```
**Analysis:** All writes are to `Negotiator.prototype` — the library's OWN constructor defined at line 30 of the same file. Backwards compatibility aliases (preferredCharset, etc.) are also on the same library-owned prototype. Standard class definition.
**Verdict:** NOT PATCHING

---

### C-003: Object.defineProperty in content-type (content-type/dist/index.js:7)

**Source:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 7
**Pattern:** `defineProperty` (Group 3)
**Code:**
```js
Object.defineProperty(exports, "__esModule", { value: true });
```
**Analysis:** This is a standard TypeScript/Babel CJS interop marker. It sets `exports.__esModule = true` on the module's OWN exports object. Does not touch any Node.js core prototype or global.
**Verdict:** NOT PATCHING

---

### C-004: C.prototype = Object.create(null) in content-type (content-type/dist/index.js:29)

**Source:** `$PACKAGE_ROOT/node_modules/content-type/dist/index.js` line 29
**Pattern:** `.prototype`, `Object.create` (Group 3)
**Code:**
```js
const NullObject = (() => {
    const C = function () { };
    C.prototype = Object.create(null);
    return C;
})();
```
**Analysis:** Creates a local, anonymous constructor `C` whose prototype is a null-prototype object, used purely internally as a NullObject optimization for parameter storage. `C` is library-private, not a Node.js built-in. Does not touch any core prototype.
**Verdict:** NOT PATCHING

---

### C-005: require('path').extname in mime-types (mime-types/index.js:16)

**Source:** `$PACKAGE_ROOT/node_modules/mime-types/index.js` line 16
**Pattern:** `require` (Group 1)
**Code:**
```js
var extname = require('path').extname
```
**Analysis:** Standard read-only import of Node.js core `path` module. Accesses `extname` function by reference. No modification to the `path` module or its exports.
**Verdict:** NOT PATCHING

---

### C-006: require('content-type') in negotiator modules

**Source:** `$PACKAGE_ROOT/node_modules/negotiator/lib/accept.js:9`, `language.js:11`, `mediaType.js:11`
**Pattern:** `require` (Group 1)
**Code:**
```js
var contentType = require('content-type');
```
**Analysis:** Standard import of the `content-type` npm package (a runtime dependency). Read-only use. Not a core module.
**Verdict:** NOT PATCHING

## Summary

| ID    | Location                        | Pattern           | Verdict       |
|-------|---------------------------------|-------------------|---------------|
| C-001 | index.js:83-196                 | .prototype        | NOT PATCHING  |
| C-002 | negotiator/index.js:38-83       | .prototype        | NOT PATCHING  |
| C-003 | content-type/dist/index.js:7    | defineProperty    | NOT PATCHING  |
| C-004 | content-type/dist/index.js:29   | .prototype        | NOT PATCHING  |
| C-005 | mime-types/index.js:16          | require('path')   | NOT PATCHING  |
| C-006 | negotiator/lib/*.js             | require           | NOT PATCHING  |

**Total candidates: 6**
**Confirmed patches: 0**
