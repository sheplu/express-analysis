# Audit Report: accepts

## Package Information

| Field          | Value                                      |
|----------------|--------------------------------------------|
| Package        | accepts                                    |
| Version        | 2.0.0                                      |
| Commit         | 19db02a05c325e1814833c1b6fde58acdb5ba96a   |
| Entrypoint     | `$PACKAGE_ROOT/index.js`                   |
| Production files | 1 (index.js)                             |
| Runtime deps   | negotiator (^1.0.0), mime-types (^3.0.1)   |
| Transitive deps | mime-db, content-type                     |
| Node engines   | >= 18                                      |

## Verdict

**CLEAN** — No patching or monkeypatching of Node.js core detected.

## Confirmed Patches

None.

## Candidate Summary

Two independent audit passes were performed. Pass A identified 6 candidates; Pass B identified 13 candidates (finer-grained breakdown of the same code). All candidates across both passes were traced to their actual write/mutation targets and ruled NOT PATCHING.

Every candidate falls into one of these categories:

1. **Standard `require()` imports** of npm dependencies or local modules (no mutation)
2. **Read-only access** to Node.js core `path` module (`require('path').extname`)
3. **Prototype writes on library-owned constructors** (`Accepts.prototype`, `Negotiator.prototype`) — standard JS class definition, not core patching
4. **TypeScript CJS interop** (`Object.defineProperty(exports, "__esModule", ...)`) — module's own exports
5. **Library-internal constructor setup** (`C.prototype = Object.create(null)` in content-type) — private to the module

## Key Observations

- The library requires only `negotiator` and `mime-types`. The sole core module accessed is `path` (read-only, in mime-types).
- `content-type` is a transitive runtime dependency (via negotiator), not listed in accepts' direct deps. It was audited in both passes and is clean.
- Search groups 4-6 (patch/wrap/shim keywords, module system hooks, internal bindings) returned **zero** production code hits across all files.
- No file in the entire dependency tree touches any Node.js built-in prototype, global object, or module loading mechanism.

## Sources and Verification

- Full source reviewed: `$PACKAGE_ROOT/index.js` (240 lines)
- All runtime dependency source files reviewed (negotiator: 6 files, mime-types: 3 files, mime-db: 1 file + db.json, content-type: 1 file)
- 6 regex search groups executed across all production files in both passes
- Reconciliation found zero disagreements between passes
