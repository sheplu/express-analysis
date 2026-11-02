# Pass B -- Regex Search Results

Package: http-errors v2.0.1 | Commit: 814207e1f69eab337d82794c8f4e552805d02047

Searches run on production files only.

## Search B1: require/import
index.js:15-19 (depd, setprototypeof, statuses, inherits, toidentifier), depd/index.js:11 (path), inherits.js:2,8 (util, fallback), statuses/index.js:15 (codes.json). No dynamic imports, no node: prefix.

## Search B2: globals
index.js:117,160,229 (inherits on library classes). depd/index.js:23,154,159,170,175,186,251,256,260 (process reads, emit custom event, stderr write).

## Search B3: prototype/defineProperty
index.js: setPrototypeOf on library instances (139,208), defineProperty on library instances (142,150,211,219,249), prototype on library classes (163-165,232-234). depd: defineProperty on library/user instances (62,485,496-521). inherits_browser: prototype chain on library classes (6,22-24). setprototypeof: utility wrapper (3,6,12). statuses: hasOwnProperty reads (96,109).

## Search B4: patch/wrap/shim
Comments only: depd (469,477), inherits_browser (17).

## Search B5: Module hooks - No hits.
## Search B6: process.binding - No hits.

## Search B7: Error global mutations
depd/index.js:382,384 (save), 386,387 (WRITE), 390 (use), 395,396 (RESTORE). index.js:89,136,205 (standard captureStackTrace).
