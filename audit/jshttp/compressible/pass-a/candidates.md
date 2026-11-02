# Pass A -- Candidate Ledger

**Package:** compressible v2.0.18 (commit 9a7ea07)
**Source:** `$PACKAGE_ROOT` = `compressible/upstream/compressible/`
**Date:** 2026-11-01
**Auditor:** Pass A (independent, double-blind)

---

## Candidate evaluation criteria

A candidate is any search hit in a production file that could represent:
- A write/mutation to a Node.js built-in prototype (e.g. `String.prototype.x = ...`)
- A modification of a Node.js global object (e.g. `global.x = ...`, `process.x = ...`)
- A hook into the module loading system (e.g. `require.extensions`, `Module._load`)
- A polyfill or shim that replaces built-in behavior
- Use of internal/private Node.js APIs

Standard `require()` calls to load dependencies and `module.exports` assignments are NOT patches.

---

## Candidates from Search 1 (require / import)

### C-001
- **File:** `$PACKAGE_ROOT/index.js` line 16
- **Hit:** `var db = require('mime-db')`
- **Analysis:** Standard CommonJS require to load declared dependency `mime-db`. No dynamic require, no path manipulation, no conditional loading of internal modules.
- **Verdict:** DISMISSED -- standard dependency import

### C-002
- **File:** `$PACKAGE_ROOT/node_modules/mime-db/index.js` line 12
- **Hit:** `module.exports = require('./db.json')`
- **Analysis:** Standard CommonJS require to load a local JSON data file. The module re-exports the parsed JSON object. No manipulation of require internals.
- **Verdict:** DISMISSED -- standard dependency import and re-export

---

## Candidates from Search 2 (Buffer / process / globalThis / global)

### C-003
- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` lines 5763, 5815, 8174, 8178, 8182, 8186
- **Hit:** MIME type name strings containing the word "global" (e.g. `"message/global"`, `"application/vnd.stardivision.writer-global"`)
- **Analysis:** These are static string values inside a JSON data file representing MIME type names registered with IANA. There is no executable code in db.json. The word "global" is part of the MIME type name, not a reference to the JavaScript `global` object.
- **Verdict:** DISMISSED -- static data strings in JSON, not executable code

---

## Candidates from Search 3 (prototype / defineProperty / Object.assign)

No hits in production files. No candidates to evaluate.

---

## Candidates from Search 4 (monkeypatch / patch / wrap / shim / polyfill / override)

### C-004
- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` lines 439, 889, 1082, 1311, 6977, 7028, 7032
- **Hit:** MIME type name strings containing the word "patch" (e.g. `"application/json-patch+json"`, `"application/merge-patch+json"`)
- **Analysis:** These are static string values inside a JSON data file representing MIME type names. "patch" here refers to RFC 6902 JSON Patch and similar IETF specifications, not code patching. There is no executable code in db.json.
- **Verdict:** DISMISSED -- static data strings in JSON, not executable code

---

## Candidates from Search 5 (require.cache / Module internals)

No hits in any files. No candidates to evaluate.

---

## Candidates from Search 6 (process.binding / internalBinding / internal modules)

No hits in any files. No candidates to evaluate.

---

## Ledger Summary

| ID    | File                           | Pattern      | Verdict   | Reason                              |
|-------|--------------------------------|--------------|-----------|-------------------------------------|
| C-001 | `index.js:16`                  | require()    | DISMISSED | Standard dependency import          |
| C-002 | `mime-db/index.js:12`          | require()    | DISMISSED | Standard dependency import/re-export|
| C-003 | `mime-db/db.json` (6 lines)    | "global"     | DISMISSED | Static MIME type name strings       |
| C-004 | `mime-db/db.json` (7 lines)    | "patch"      | DISMISSED | Static MIME type name strings       |

**Confirmed patches: 0**
**Dismissed candidates: 4**
