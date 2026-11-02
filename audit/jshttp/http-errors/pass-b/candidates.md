# Pass B -- Candidate Ledger

## C-001: depd getStack() transient swap of Error.prepareStackTrace/stackTraceLimit [CONFIRMED]
File: $PACKAGE_ROOT/node_modules/depd/index.js:380-398. Transient swap of core globals. Activated at require time via depd() factory and at deprecation time via log().

## C-002: setPrototypeOf on library instances [REJECTED] - library-owned
## C-003: Object.defineProperty on library instances [REJECTED] - library-owned
## C-004: inherits(HttpError, Error) [REJECTED] - standard subclassing
## C-005: process.emit('deprecation') [REJECTED] - standard API
## C-006: depd wrapproperty/wrapfunction [REJECTED] - not invoked by http-errors
## C-007: Error.captureStackTrace [REJECTED] - standard API
## C-008: depd convertDataDescriptorToAccessor [REJECTED] - not invoked
## C-009: setprototypeof module [REJECTED] - utility wrapper, no global patching
