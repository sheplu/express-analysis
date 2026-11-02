# Pass B — Candidate Ledger

**Package:** mime-db v1.54.0
**Commit:** ba120a7f71bc8ab7d5299e88c0049063239029a7

## Candidates

### C-001: require('./db.json') in index.js

- **Source:** `$PACKAGE_ROOT/index.js`, line 12
- **Search group:** 1 (require/import)
- **Match:** `module.exports = require('./db.json')`
- **Analysis:** This is the sole executable line in the entire library. It loads a local JSON data file (`db.json`) and re-exports it as the module's value. The `require()` call targets a relative path to a local JSON file — not a Node.js core module. The JSON file contains only static MIME type data (key-value pairs of MIME type strings to metadata objects). There is no mutation, no assignment to any prototype, no interaction with Node.js internals.
- **Classification:** FALSE POSITIVE — benign local file require, no core interaction

## Confirmed Patches

None.

## Summary

| ID | File | Pattern | Classification |
|----|------|---------|----------------|
| C-001 | index.js:12 | `require('./db.json')` | FALSE POSITIVE |

Total candidates: 1
Confirmed patches: 0
