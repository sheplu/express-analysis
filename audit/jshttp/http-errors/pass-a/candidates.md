# Pass A -- Candidate Ledger

## C-001: depd getStack() swaps Error.prepareStackTrace and Error.stackTraceLimit [CONFIRMED]
- File: $PACKAGE_ROOT/node_modules/depd/index.js:382-396
- Category: transient swap of core globals
- Execution chain: require('http-errors') -> index.js:15 require('depd')('http-errors') -> depd():108 getStack() -> lines 386-387 write, 395-396 restore
- Also triggered at deprecation time: log():199 -> getStack()
- Verdict: CONFIRMED

## C-002: setPrototypeOf on library Error instances [REJECTED]
- File: $PACKAGE_ROOT/index.js:139, 208
- Operates on freshly created Error instances targeting library-owned subclass prototypes
- Verdict: REJECTED -- library-owned instances

## C-003: Object.defineProperty on library instances [REJECTED]
- File: $PACKAGE_ROOT/index.js:142-155, 211-224, 249
- All operate on freshly created Error instances or library constructor functions
- Verdict: REJECTED -- library-owned instances

## C-004: inherits(HttpError, Error) [REJECTED]
- File: $PACKAGE_ROOT/index.js:117
- Creates new prototype chain, does not modify Error.prototype
- Verdict: REJECTED -- standard subclassing

## C-005: process.emit('deprecation', err) [REJECTED]
- File: $PACKAGE_ROOT/node_modules/depd/index.js:251
- Standard EventEmitter API, custom event type, no listeners added
- Verdict: REJECTED -- standard API usage

## C-006: depd wrapfunction/wrapproperty [REJECTED]
- File: $PACKAGE_ROOT/node_modules/depd/index.js:413-486
- Never invoked by http-errors (only deprecate(msg) is used at index.js:73)
- Verdict: REJECTED -- not invoked

## C-007: Error.captureStackTrace in http-errors [REJECTED]
- File: $PACKAGE_ROOT/index.js:89, 136, 205
- Standard V8 API for stack capture on new Error instances
- Verdict: REJECTED -- standard API usage

## C-008: setprototypeof __proto__ fallback [REJECTED]
- File: $PACKAGE_ROOT/node_modules/setprototypeof/index.js:3-7
- Utility wrapper, called on library instances only
- Verdict: REJECTED -- no core patching
