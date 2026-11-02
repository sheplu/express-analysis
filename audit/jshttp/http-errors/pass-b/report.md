# Pass B -- Audit Report

Package: http-errors v2.0.1 | Commit: 814207e1f69eab337d82794c8f4e552805d02047

## Confirmed: 1

### F-001: Transient swap of Error.prepareStackTrace and Error.stackTraceLimit (via depd)
Origin: http-errors -> depd@2.0.0. Site: depd/index.js:386-387 (write), 395-396 (restore). Transient, restored synchronously.

## Rejected: 8 (C-002 through C-009)
All library-internal, standard API, or never invoked.

## Verdict
One confirmed core patch: transient swap of Error.prepareStackTrace and Error.stackTraceLimit via depd. No permanent mutations.
