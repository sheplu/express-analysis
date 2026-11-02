# proxy-addr Monkeypatch Audit -- Detailed Findings

## Reconciled Candidate Ledger

All candidates from both passes are reconciled below. None are confirmed patches.

### C-001: Standard require() calls
- **File**: `$PACKAGE_ROOT/index.js`, lines 23-24
- **Match**: `require('forwarded')`, `require('ipaddr.js')`
- **Classification**: NOT A PATCH
- **Reasoning**: Standard CommonJS dependency loading. No manipulation of the module system.

### C-002: Object.prototype.hasOwnProperty.call() borrow
- **File**: `$PACKAGE_ROOT/index.js`, line 102
- **Match**: `Object.prototype.hasOwnProperty.call(IP_RANGES, val)`
- **Classification**: NOT A PATCH
- **Reasoning**: Read-only method borrow via `.call()`. Does not modify `Object.prototype` or any built-in. This is an idiomatic safe property check.

### C-003: ipaddr.process method naming
- **File**: `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, line 663
- **Match**: `ipaddr.process = function(string) { ... }`
- **Classification**: NOT A PATCH
- **Reasoning**: Defines a method named `process` on the library's own `ipaddr` namespace object. This is **not** the Node.js `process` global. The word "process" in the IP context means "parse and normalize an IP address."

### C-004: IPv4/IPv6 prototype definitions (22 occurrences)
- **File**: `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, lines 71-382
- **Match**: `IPv4.prototype.kind`, `IPv4.prototype.toString`, `IPv4.prototype.match`, `IPv6.prototype.kind`, `IPv6.prototype.toString`, `IPv6.prototype.match`, etc.
- **Classification**: NOT A PATCH
- **Reasoning**: All prototype assignments target the library's own `IPv4` and `IPv6` constructor functions defined in the same IIFE scope. This is a standard pre-ES6 class pattern. No Node.js built-in prototypes are touched.

### C-005: Object.defineProperty on local array (IPv4.parseCIDR)
- **File**: `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, line 537
- **Match**: `Object.defineProperty(parsed, 'toString', { value: function() { return this.join('/'); } })`
- **Classification**: NOT A PATCH
- **Reasoning**: `parsed` is a freshly-created local array `[this.parse(match[1]), maskLength]`. The `defineProperty` adds a non-enumerable `toString` override on this single instance only. No shared prototype is modified.

### C-006: Object.defineProperty on local array (IPv6.parseCIDR)
- **File**: `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, line 611
- **Match**: `Object.defineProperty(parsed, 'toString', { value: function() { return this.join('/'); } })`
- **Classification**: NOT A PATCH
- **Reasoning**: Identical pattern to C-005. `parsed` is a freshly-created local array. Instance-level property, no prototype mutation.

### C-007: UMD wrapper global fallback
- **File**: `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, lines 1-12, 673
- **Match**: `root = this; ... root['ipaddr'] = ipaddr;`
- **Classification**: NOT A PATCH
- **Reasoning**: The IIFE wrapper follows the UMD (Universal Module Definition) pattern. Line 8 checks `typeof module !== "undefined" && module !== null && module.exports` and takes the CommonJS branch (`module.exports = ipaddr`). The `root['ipaddr'] = ipaddr` fallback in the `else` branch only executes in browser or non-CommonJS environments. In Node.js this code is unreachable.

## Search Group Results Summary

| Group | Pattern Focus                    | proxy-addr | forwarded | ipaddr.js | Total |
|-------|----------------------------------|------------|-----------|-----------|-------|
| 1     | require/import/from              | 2          | 0         | 0         | 2     |
| 2     | Buffer/process/global/extends    | 0          | 0         | 1         | 1     |
| 3     | .prototype/defineProperty        | 1          | 0         | 24        | 25    |
| 4     | monkeypatch/shim/polyfill        | 0          | 0         | 0         | 0     |
| 5     | require.cache/Module._load       | 0          | 0         | 0         | 0     |
| 6     | process.binding/internalBinding  | 0          | 0         | 0         | 0     |

## Coverage and Limitations

- All 1,124 lines of production code were read and analyzed
- The `ipaddr.min.js` minified file exists in the ipaddr.js package but is not the file loaded by `require('ipaddr.js')` (package.json `main` field points to `lib/ipaddr.js`)
- No transitive dependencies exist beyond forwarded and ipaddr.js (no nested `node_modules`)
- The audit covers runtime code only; test, benchmark, and example files were excluded by design
