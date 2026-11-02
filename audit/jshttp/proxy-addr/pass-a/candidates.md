# proxy-addr v2.0.8 -- Pass A Candidate Ledger

Package: proxy-addr 2.0.8
Commit: a11ad82545698af5c33e59f3ed0b52eab79bf610
Date: 2026-11-01

---

## C-001  require('forwarded')
- **File:** `$PACKAGE_ROOT/index.js:23`
- **Matched text:** `var forwarded = require('forwarded')`
- **Search group:** 1 (require/import)
- **Classification:** NOT A PATCH
- **Reasoning:** Standard CommonJS require loading a third-party module. No
  manipulation of the module system; the return value is assigned to a local
  variable.

## C-002  require('ipaddr.js')
- **File:** `$PACKAGE_ROOT/index.js:24`
- **Matched text:** `var ipaddr = require('ipaddr.js')`
- **Search group:** 1 (require/import)
- **Classification:** NOT A PATCH
- **Reasoning:** Standard CommonJS require loading a third-party module. No
  manipulation of the module system; the return value is assigned to a local
  variable.

## C-003  ipaddr.process method definition
- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:663`
- **Matched text:** `ipaddr.process = function(string) {`
- **Search group:** 2 (matched `\bprocess\b`)
- **Classification:** NOT A PATCH
- **Reasoning:** False positive on the word "process". This defines a method
  named `process` on the library's own `ipaddr` namespace object. It is not a
  reference to the Node.js `process` global. The method parses an IP string and
  converts IPv4-mapped IPv6 addresses to IPv4 -- purely library-internal logic.

## C-004  Object.prototype.hasOwnProperty.call (read-only borrow)
- **File:** `$PACKAGE_ROOT/index.js:102`
- **Matched text:** `if (!Object.prototype.hasOwnProperty.call(IP_RANGES, val)) {`
- **Search group:** 3 (matched `.prototype`)
- **Classification:** NOT A PATCH
- **Reasoning:** Read-only access to `Object.prototype.hasOwnProperty` via the
  safe `.call()` pattern. Does not write to or modify `Object.prototype`.

## C-005 through C-013  IPv4.prototype method definitions
- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`
- **Lines:** 71, 75, 79, 83, 87, 98, 109, 113, 117
- **Matched text (representative):** `IPv4.prototype.kind = function() { ... }`
- **Search group:** 3 (matched `.prototype`)
- **Classification:** NOT A PATCH
- **Reasoning:** All writes are to `IPv4.prototype`, which is the library's own
  constructor function defined at line 57 of ipaddr.js inside an IIFE. IPv4 is
  not a Node.js built-in; it is created locally by the ipaddr.js library. These
  are standard prototype-based class definitions on library-owned objects.

  Individual lines:
  - C-005: L71  `IPv4.prototype.kind`
  - C-006: L75  `IPv4.prototype.toString`
  - C-007: L79  `IPv4.prototype.toNormalizedString`
  - C-008: L83  `IPv4.prototype.toByteArray`
  - C-009: L87  `IPv4.prototype.match`
  - C-010: L98  `IPv4.prototype.SpecialRanges`
  - C-011: L109 `IPv4.prototype.range`
  - C-012: L113 `IPv4.prototype.toIPv4MappedAddress`
  - C-013: L117 `IPv4.prototype.prefixLengthFromSubnetMask`

## C-014 through C-024  IPv6.prototype method definitions
- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`
- **Lines:** 224, 228, 232, 250, 262, 281, 300, 311, 325, 329, 333, 342
- **Matched text (representative):** `IPv6.prototype.kind = function() { ... }`
- **Search group:** 3 (matched `.prototype`)
- **Classification:** NOT A PATCH
- **Reasoning:** All writes are to `IPv6.prototype`, which is the library's own
  constructor function defined at line 200 of ipaddr.js inside an IIFE. IPv6 is
  not a Node.js built-in; it is created locally by the ipaddr.js library. These
  are standard prototype-based class definitions on library-owned objects.

  Individual lines:
  - C-014: L224 `IPv6.prototype.kind`
  - C-015: L228 `IPv6.prototype.toString`
  - C-016: L232 `IPv6.prototype.toRFC5952String`
  - C-017: L250 `IPv6.prototype.toByteArray`
  - C-018: L262 `IPv6.prototype.toNormalizedString`
  - C-019: L281 `IPv6.prototype.toFixedLengthString`
  - C-020: L300 `IPv6.prototype.match`
  - C-021: L311 `IPv6.prototype.SpecialRanges`
  - C-022: L325 `IPv6.prototype.range`
  - C-023: L329 `IPv6.prototype.isIPv4MappedAddress`
  - C-024: L333 `IPv6.prototype.toIPv4Address`
  - C-025: L342 `IPv6.prototype.prefixLengthFromSubnetMask`

## C-026  Object.defineProperty on local array (IPv4 CIDR)
- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:537`
- **Matched text:** `Object.defineProperty(parsed, 'toString', {`
- **Search group:** 3 (matched `definePropert`)
- **Classification:** NOT A PATCH
- **Reasoning:** The target `parsed` is a local array created on line 536
  (`parsed = [this.parse(match[1]), maskLength]`). This adds a non-enumerable
  `toString` method to that specific array instance. It does not modify
  `Array.prototype`, `Object.prototype`, or any shared/global object.

## C-027  Object.defineProperty on local array (IPv6 CIDR)
- **File:** `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:611`
- **Matched text:** `Object.defineProperty(parsed, 'toString', {`
- **Search group:** 3 (matched `definePropert`)
- **Classification:** NOT A PATCH
- **Reasoning:** Identical pattern to C-026 but inside `ipaddr.IPv6.parseCIDR`.
  The target `parsed` is a local array created on line 610. This adds a
  non-enumerable `toString` to that specific array instance only. Does not
  modify any shared prototype or global.

---

## Summary

| ID        | Classification    | File                                     |
|-----------|-------------------|------------------------------------------|
| C-001     | NOT A PATCH       | `$PACKAGE_ROOT/index.js:23`              |
| C-002     | NOT A PATCH       | `$PACKAGE_ROOT/index.js:24`              |
| C-003     | NOT A PATCH       | `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:663` |
| C-004     | NOT A PATCH       | `$PACKAGE_ROOT/index.js:102`             |
| C-005..13 | NOT A PATCH       | `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js` (IPv4.prototype) |
| C-014..25 | NOT A PATCH       | `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js` (IPv6.prototype) |
| C-026     | NOT A PATCH       | `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:537` |
| C-027     | NOT A PATCH       | `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:611` |

**CONFIRMED PATCH count: 0**
**NEEDS INVESTIGATION count: 0**
**NOT A PATCH count: 27**
