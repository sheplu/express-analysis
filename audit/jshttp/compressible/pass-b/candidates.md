# Pass B -- Candidate Ledger

**Package:** compressible v2.0.18 (commit 9a7ea07)
**Source:** `$PACKAGE_ROOT` = `compressible/upstream/compressible/`
**Date:** 2026-11-01

Only hits in production files are given candidate IDs.
Production files: `index.js`, `node_modules/mime-db/index.js`, `node_modules/mime-db/db.json`,
`node_modules/mime-db/package.json`.

---

## Candidates from Search 1 (require/import)

### C-001
- **File:** `$PACKAGE_ROOT/index.js` line 16
- **Hit:** `var db = require('mime-db')`
- **Analysis:** Standard `require()` call loading the declared dependency `mime-db`. The result
  is assigned to a local variable `db`. No mutation of `require`, no hooking of the module
  system, no side effects beyond loading a JSON data file.
- **Verdict:** DISMISSED -- standard dependency import

### C-002
- **File:** `$PACKAGE_ROOT/node_modules/mime-db/index.js` line 12
- **Hit:** `module.exports = require('./db.json')`
- **Analysis:** Standard `require()` loading the local `db.json` file, assigned to
  `module.exports`. This is the canonical Node.js module export pattern. No mutation of
  `require`, `Module`, or any global state.
- **Verdict:** DISMISSED -- standard module export

---

## Candidates from Search 2 (Buffer/process/globalThis/global/extends/inherits)

### C-003
- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` lines 5763, 5815, 8174, 8178, 8182, 8186
- **Hits:** MIME type name strings containing the substring "global":
  - `"application/vnd.stardivision.writer-global"`
  - `"application/vnd.sun.xml.writer.global"`
  - `"message/global"`
  - `"message/global-delivery-status"`
  - `"message/global-disposition-notification"`
  - `"message/global-headers"`
- **Analysis:** These are static JSON object keys -- MIME type name strings registered by IANA.
  They are inert data. The word "global" here refers to internationalized email MIME types and
  StarDivision/Sun document types, not the JavaScript `global` object. This file is a pure
  JSON data file (`db.json`) containing no executable code whatsoever.
- **Verdict:** DISMISSED -- inert data strings in a static JSON file, no code execution

---

## Candidates from Search 4 (monkeypatch/patch/wrap/shim/polyfill/override)

### C-004
- **File:** `$PACKAGE_ROOT/node_modules/mime-db/db.json` lines 439, 889, 1082, 1311, 6977, 7028, 7032
- **Hits:** MIME type name strings containing the substring "patch":
  - `"application/dash-patch+xml"`
  - `"application/json-patch+json"`
  - `"application/merge-patch+json"`
  - `"application/patch-ops-error+xml"`
  - `"application/xml-patch+xml"`
  - `"application/yang-patch+json"`
  - `"application/yang-patch+xml"`
- **Analysis:** Same situation as C-003. These are IANA-registered MIME type names that happen
  to contain "patch" (as in RFC 5261 XML Patch, RFC 6902 JSON Patch, etc.). They are static
  JSON data, not executable code. No patching, shimming, or mutation occurs.
- **Verdict:** DISMISSED -- inert data strings in a static JSON file, no code execution

---

## Candidates from Searches 3, 5, 6

No hits in any production file. No candidates to evaluate.

---

## Summary

| ID    | File                           | Pattern    | Verdict   | Reason                           |
|-------|--------------------------------|------------|-----------|----------------------------------|
| C-001 | index.js:16                    | require    | DISMISSED | Standard dependency import       |
| C-002 | node_modules/mime-db/index.js:12 | require  | DISMISSED | Standard module export           |
| C-003 | node_modules/mime-db/db.json   | global     | DISMISSED | Inert MIME type name strings     |
| C-004 | node_modules/mime-db/db.json   | patch      | DISMISSED | Inert MIME type name strings     |

**Confirmed monkeypatches: 0**
