# Pass A -- Audit Report

Package: http-errors v2.0.1 | Commit: 814207e1f69eab337d82794c8f4e552805d02047

## Confirmed Findings: 1

### F-001: Transient swap of Error.prepareStackTrace and Error.stackTraceLimit (via depd)
- Origin: http-errors -> depd@2.0.0
- Site: $PACKAGE_ROOT/node_modules/depd/index.js:386-387 (write), 395-396 (restore)
- Activation: once at require time, again each time a deprecation is logged
- Scope: transient, restored synchronously

## Rejected Candidates: 7 (C-002 through C-008)
All involve library-internal operations on owned instances/prototypes, standard API usage, or capabilities never exercised by http-errors.

## Verdict
One confirmed core patch: transient swap of Error.prepareStackTrace and Error.stackTraceLimit via the depd dependency. No permanent core mutations found.
