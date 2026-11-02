# proxy-addr v2.0.8 -- Pass A Summary Report

Package: proxy-addr 2.0.8
Commit: a11ad82545698af5c33e59f3ed0b52eab79bf610
Auditor: Pass A (automated regex search + manual classification)
Date: 2026-11-01

## Verdict

**CLEAN -- No monkeypatching detected.**

All 6 search groups were executed across all 3 production files (proxy-addr
index.js, forwarded/index.js, ipaddr.js/lib/ipaddr.js). A total of 27 candidate
hits were identified from production code and classified. Every candidate was
determined to be NOT A PATCH.

## Production Files Analyzed

| File | Lines | Candidates |
|------|------:|:----------:|
| `$PACKAGE_ROOT/index.js` | 360 | 3 |
| `$PACKAGE_ROOT/node_modules/forwarded/index.js` | 91 | 0 |
| `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js` | 673 | 24 |

## Search Group Results

| # | Pattern Category | Production Hits | Patches Found |
|---|------------------|:---------------:|:-------------:|
| 1 | require/import/from/node: | 2 | 0 |
| 2 | Buffer/process/global/extends/inherits | 1 | 0 |
| 3 | .prototype/defineProperty/Object.assign | 24 | 0 |
| 4 | monkeypatch/patch/wrap/shim/polyfill/override | 0 | 0 |
| 5 | require.cache/Module._load/extensions | 0 | 0 |
| 6 | process.binding/internalBinding/internal/ | 0 | 0 |

## Key Observations

1. **forwarded/index.js** is entirely self-contained. It defines and exports a
   single function with two helpers. No require calls, no prototype writes, no
   globals access. Zero search hits.

2. **ipaddr.js/lib/ipaddr.js** produced the bulk of hits (24 of 27). All are
   the library defining methods on its own `IPv4` and `IPv6` constructor
   prototypes using standard pre-ES6 class patterns inside an IIFE. Neither
   constructor is a Node.js built-in. Two `Object.defineProperty` calls target
   freshly-created local arrays, not shared prototypes.

3. **ipaddr.js UMD wrapper** (lines 1-12, 673): The IIFE wraps the entire
   library with `(function() { ... }).call(this)`. In the Node.js branch, it
   sets `module.exports = ipaddr`. The fallback branch (`root['ipaddr'] = ipaddr`)
   only executes in non-CommonJS environments (browsers). This is standard UMD
   boilerplate and does not write to Node.js globals.

4. **proxy-addr index.js** has only standard `require()` calls and one
   read-only `Object.prototype.hasOwnProperty.call()` borrow.

5. **No hits** in search groups 4, 5, or 6 across any production file. There is
   no manipulation of the module loader, no shimming/polyfilling, and no access
   to Node.js internal bindings.

## Conclusion

proxy-addr v2.0.8 and its two production dependencies (forwarded, ipaddr.js)
do not monkeypatch Node.js runtime behavior, prototypes, globals, the module
system, or internal bindings.
