# Candidate ledger — fresh Pass B

## Candidates

### C-001: README.md require('fresh') (line 24)

- **File:** `$PACKAGE_ROOT/README.md` (non-production)
- **Pattern hit:** Search 1 — `require\s*\(`
- **Code:** `var fresh = require('fresh')`
- **Status:** REJECTED
- **Reason:** Documentation usage example. Not production code. README.md is not in the `files` field of package.json and is not shipped. Even if it were shipped, a `require()` call in a Markdown file is inert text, not executable code. No mutation of any runtime, prototype, or module system.

### C-002: README.md require('fresh') (line 75)

- **File:** `$PACKAGE_ROOT/README.md` (non-production)
- **Pattern hit:** Search 1 — `require\s*\(`
- **Code:** `var fresh = require('fresh')`
- **Status:** REJECTED
- **Reason:** Same as C-001. Documentation example in a non-production Markdown file.

### C-003: README.md require('http') (line 76)

- **File:** `$PACKAGE_ROOT/README.md` (non-production)
- **Pattern hit:** Search 1 — `require\s*\(`
- **Code:** `var http = require('http')`
- **Status:** REJECTED
- **Reason:** Same as C-001/C-002. Documentation example showing standard usage of the Node.js `http` module. Not executable production code. No mutation occurs.

## Summary

| ID | File | Core target | Status | Evidence/reason |
|---|---|---|---|---|
| C-001 | README.md:24 | require('fresh') | REJECTED | Non-production documentation example |
| C-002 | README.md:75 | require('fresh') | REJECTED | Non-production documentation example |
| C-003 | README.md:76 | require('http') | REJECTED | Non-production documentation example |

**Production candidates: 0**
**Confirmed patches: 0**
**Unresolved candidates: 0**
