# Pass A -- Regex Search Results

Package: http-errors v2.0.1 | Commit: 814207e1f69eab337d82794c8f4e552805d02047

## Search 1: require/import/node:
Production hits: index.js:15-19 (5 requires: depd, setprototypeof, statuses, inherits, toidentifier), depd/index.js:11 (require path), inherits/inherits.js:2,8 (require util, fallback), statuses/index.js:15 (require codes.json). All local deps or Node builtins. No node: prefix, no dynamic imports.

## Search 2: Buffer/process/globalThis/global/extends/inherits
Production hits: index.js:117,160,229 (inherits calls on library classes). depd/index.js:23,154,159,170,175,186,251,256,260 (process.cwd, process.env reads, process.emit, process.stderr). All reads or standard API usage except process.emit which emits a custom event.

## Search 3: prototype/defineProperty/setPrototypeOf
Production hits: index.js:16,139,142,150,163-165,208,211,219,232-234,249. depd/index.js:62,485,496-521. inherits_browser.js:6,22-24. setprototypeof/index.js:3,6,12. statuses/index.js:96,109. All operate on library-owned instances, new prototypes, or are read-only hasOwnProperty calls.

## Search 4: patch/wrap/shim/polyfill/override
Production hits: depd/index.js:469,477 (comments only: "wrap getter", "wrap setter"). inherits_browser.js:17 (comment: "old school shim"). No actual patching code.

## Search 5: Module system hooks
No production hits.

## Search 6: process.binding/internalBinding
No hits.

## Additional: Error.prepareStackTrace/stackTraceLimit/captureStackTrace
depd/index.js:382,384,386,387,390,395,396 -- getStack() function with transient swap. index.js:89,136,205 -- standard captureStackTrace usage.
