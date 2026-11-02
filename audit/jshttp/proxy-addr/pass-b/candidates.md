# proxy-addr Pass B -- Candidate Ledger

Package: proxy-addr 2.0.8
Commit: a11ad82545698af5c33e59f3ed0b52eab79bf610
Date: 2026-11-01

---

## C-001 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/index.js`, lines 23-24
- **Match (Group 1):**
  ```js
  var forwarded = require('forwarded')
  var ipaddr = require('ipaddr.js')
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** Standard `require()` calls to load first-party dependencies.
  No manipulation of `require.cache`, `require.extensions`, or the
  `Module` loader. Pure consumption.

---

## C-002 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/index.js`, line 102
- **Match (Group 3):**
  ```js
  if (!Object.prototype.hasOwnProperty.call(IP_RANGES, val)) {
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** Read-only access to `Object.prototype.hasOwnProperty` via
  `.call()`. The code does not assign to, delete from, or redefine any
  property on `Object.prototype`. This is the standard safe pattern for
  property-existence checks. No mutation occurs.

---

## C-003 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, line 663
- **Match (Group 2):**
  ```js
  ipaddr.process = function(string) {
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** The regex matched the word `process`, but this is a method
  named `process` being defined on the library's own local `ipaddr` object
  (created on line 4 as `ipaddr = {}`). It does not reference or mutate the
  Node.js `process` global. The method converts IPv4-mapped IPv6 addresses
  to IPv4. No global mutation.

---

## C-004 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, lines 71-342
  (22 hits across IPv4 and IPv6 class definitions)
- **Match (Group 3):** Assignments to `IPv4.prototype.*` and `IPv6.prototype.*`
  ```
  IPv4.prototype.kind = function() { ... }
  IPv4.prototype.toString = function() { ... }
  IPv4.prototype.toNormalizedString = function() { ... }
  IPv4.prototype.toByteArray = function() { ... }
  IPv4.prototype.match = function(other, cidrRange) { ... }
  IPv4.prototype.SpecialRanges = { ... }
  IPv4.prototype.range = function() { ... }
  IPv4.prototype.toIPv4MappedAddress = function() { ... }
  IPv4.prototype.prefixLengthFromSubnetMask = function() { ... }
  IPv6.prototype.kind = function() { ... }
  IPv6.prototype.toString = function() { ... }
  IPv6.prototype.toRFC5952String = function() { ... }
  IPv6.prototype.toByteArray = function() { ... }
  IPv6.prototype.toNormalizedString = function() { ... }
  IPv6.prototype.toFixedLengthString = function() { ... }
  IPv6.prototype.match = function(other, cidrRange) { ... }
  IPv6.prototype.SpecialRanges = { ... }
  IPv6.prototype.range = function() { ... }
  IPv6.prototype.isIPv4MappedAddress = function() { ... }
  IPv6.prototype.toIPv4Address = function() { ... }
  IPv6.prototype.prefixLengthFromSubnetMask = function() { ... }
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** All prototype assignments target `IPv4` and `IPv6`, which are
  the library's own constructor functions defined locally within the IIFE
  (line 58: `function IPv4(octets)`, line 195: `function IPv6(parts, zoneId)`).
  These are NOT Node.js built-in prototypes. This is standard CoffeeScript-
  compiled class definition. No built-in or global prototypes are touched.

---

## C-005 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, line 537
- **Match (Group 3):**
  ```js
  Object.defineProperty(parsed, 'toString', {
    value: function() {
      return this.join('/');
    }
  });
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** `Object.defineProperty` is called on `parsed`, a freshly
  created local array (`parsed = [this.parse(match[1]), maskLength]` on
  line 536). This adds a `toString` own-property to that specific array
  instance. It does not modify `Array.prototype`, `Object.prototype`, or
  any other shared prototype. The property is non-enumerable by default,
  affecting only this one array.

---

## C-006 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, line 611
- **Match (Group 3):**
  ```js
  Object.defineProperty(parsed, 'toString', {
    value: function() {
      return this.join('/');
    }
  });
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** Identical pattern to C-005, but in `IPv6.parseCIDR`. The
  `parsed` variable is a freshly created local array (`parsed = [this.parse(match[1]), maskLength]`
  on line 610). `defineProperty` is called on this local array instance only.
  No prototype or global is mutated.

---

## C-007 | NOT A PATCH

- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`, lines 1, 6, 8-12, 673
- **Match (manual review of IIFE module wrapper):**
  ```js
  (function() {
    ...
    root = this;                              // line 6
    if ((typeof module !== "undefined" && module !== null) && module.exports) {
      module.exports = ipaddr;                // line 9
    } else {
      root['ipaddr'] = ipaddr;                // line 11
    }
    ...
  }).call(this);                              // line 673
  ```
- **Classification:** NOT A PATCH
- **Reasoning:** This is a standard UMD-style module wrapper. In Node.js
  CommonJS, `this` at module top-level is the `exports` object. The `if`
  branch on line 8 detects Node.js (`module` exists and `module.exports`
  is truthy) and sets `module.exports = ipaddr` -- the standard export
  mechanism. The `else` branch (line 11), which would write `ipaddr` as a
  property on `root` (for browser globals), is **never reached** in Node.js.
  No global object is mutated in Node.js runtime. This pattern is defensive,
  not a monkeypatch.

---

## Summary

| ID    | File                                    | Classification | Category                      |
|-------|-----------------------------------------|----------------|-------------------------------|
| C-001 | `$PACKAGE_ROOT/index.js:23-24`          | NOT A PATCH    | Standard require() calls      |
| C-002 | `$PACKAGE_ROOT/index.js:102`            | NOT A PATCH    | Read-only prototype access    |
| C-003 | `ipaddr.js/lib/ipaddr.js:663`           | NOT A PATCH    | Own method named "process"    |
| C-004 | `ipaddr.js/lib/ipaddr.js:71-342`        | NOT A PATCH    | Own class prototype setup     |
| C-005 | `ipaddr.js/lib/ipaddr.js:537`           | NOT A PATCH    | defineProperty on local array |
| C-006 | `ipaddr.js/lib/ipaddr.js:611`           | NOT A PATCH    | defineProperty on local array |
| C-007 | `ipaddr.js/lib/ipaddr.js:1,6,8-12,673` | NOT A PATCH    | UMD module wrapper            |

**Confirmed patches: 0**
**Needs investigation: 0**
