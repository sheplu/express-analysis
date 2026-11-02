# Reconciliation / Methodology

Package: http-errors v2.0.1 | Commit: 814207e1f69eab337d82794c8f4e552805d02047

## Double-Blind Protocol

Two independent audit passes (A and B) were conducted. Both used the same 6 regex
search groups on all production files, including runtime dependencies.

### Pass A
- Identified 8 candidates (C-001 through C-008)
- Confirmed 1: C-001 (depd getStack transient swap of Error.prepareStackTrace/stackTraceLimit)
- Rejected 7: C-002 through C-008

### Pass B
- Identified 9 candidates (C-001 through C-009)
- Confirmed 1: C-001 (depd getStack transient swap of Error.prepareStackTrace/stackTraceLimit)
- Rejected 8: C-002 through C-009

### Reconciliation

**Agreement on C-001 (confirmed):** Both passes independently identified and confirmed the
same finding -- depd's `getStack()` function transiently swaps `Error.prepareStackTrace`
and `Error.stackTraceLimit`. Both passes traced the identical execution chain:
`require('http-errors')` -> `depd('http-errors')` -> `getStack()` -> swap/restore.
Both documented the same line numbers (depd/index.js:386-387 write, 395-396 restore),
the same transient scope, and the same activation triggers (require-time and deprecation-time).

**Difference in candidate count (reconciled):** Pass B identified one additional rejected
candidate that Pass A folded into a parent candidate:
- Pass B C-008 (depd `convertDataDescriptorToAccessor`): Pass A folded this into C-006
  (wrapproperty), since `convertDataDescriptorToAccessor` is only reachable via `wrapproperty`.
  Both passes correctly noted this code is never invoked by http-errors.
- Pass B C-009 (setprototypeof module as a standalone candidate): Pass A covered this as
  C-008 (setprototypeof `__proto__` fallback). Same analysis -- utility wrapper called on
  library-owned instances only, no global polyfill installation.

**No substantive disagreements.** The difference is purely organizational (granularity of
candidate grouping). Both passes reached the same conclusion for every piece of code examined.

## Search Coverage

| Search Group | Description | Hits (prod files) | Candidates Generated |
|-------------|-------------|-------------------|---------------------|
| 1 | require/import statements | ~9 | 0 (informational) |
| 2 | Buffer/process/global/inherits | ~12 | C-005 (process.emit) |
| 3 | prototype/defineProperty/setPrototypeOf | ~20+ | C-002, C-003, C-004, C-008/C-009 |
| 4 | patch/wrap/shim/polyfill | ~3 | C-006 |
| 5 | Module hooks (require.cache, extensions) | 0 | 0 |
| 6 | process.binding/internalBinding | 0 | 0 |
| +  | Targeted Error globals search | ~10 | C-001 (confirmed), C-007 |

## Verdict

Both passes independently confirmed one finding (F-001) and rejected all other
candidates. The reconciled verdict is: **one confirmed transient core patch via
depd@2.0.0 dependency**.
