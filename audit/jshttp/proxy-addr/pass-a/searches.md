# proxy-addr v2.0.8 -- Pass A Raw Search Results

Package: proxy-addr 2.0.8
Commit: a11ad82545698af5c33e59f3ed0b52eab79bf610
Date: 2026-11-01

Production files searched:
- `$PACKAGE_ROOT/index.js` (360 lines)
- `$PACKAGE_ROOT/node_modules/forwarded/index.js` (91 lines)
- `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js` (673 lines)

Non-production files excluded from classification: package-lock.json, README.md,
HISTORY.md, .d.ts type declarations, ipaddr.min.js (minified duplicate of source).

---

## Group 1 -- require / import / from / node:

Production hits:

```
$PACKAGE_ROOT/index.js:23:var forwarded = require('forwarded')
$PACKAGE_ROOT/index.js:24:var ipaddr = require('ipaddr.js')
```

Non-production hits (excluded): README.md, package-lock.json references.

---

## Group 2 -- Buffer / process / globalThis / global / extends / inherits

Production hits:

```
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:663:  ipaddr.process = function(string) {
```

Non-production hits (excluded): ipaddr.js.d.ts (TypeScript declarations mentioning
`process`, `extends`), ipaddr.min.js (minified duplicate), README.md, HISTORY.md,
package-lock.json.

---

## Group 3 -- .prototype / __proto__ / setPrototypeOf / defineProperty / Object.assign

Production hits:

```
$PACKAGE_ROOT/index.js:102:    if (!Object.prototype.hasOwnProperty.call(IP_RANGES, val)) {

$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:71:    IPv4.prototype.kind = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:75:    IPv4.prototype.toString = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:79:    IPv4.prototype.toNormalizedString = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:83:    IPv4.prototype.toByteArray = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:87:    IPv4.prototype.match = function(other, cidrRange) {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:98:    IPv4.prototype.SpecialRanges = {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:109:    IPv4.prototype.range = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:113:    IPv4.prototype.toIPv4MappedAddress = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:117:    IPv4.prototype.prefixLengthFromSubnetMask = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:224:    IPv6.prototype.kind = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:228:    IPv6.prototype.toString = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:232:    IPv6.prototype.toRFC5952String = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:250:    IPv6.prototype.toByteArray = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:262:    IPv6.prototype.toNormalizedString = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:281:    IPv6.prototype.toFixedLengthString = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:300:    IPv6.prototype.match = function(other, cidrRange) {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:311:    IPv6.prototype.SpecialRanges = {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:325:    IPv6.prototype.range = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:329:    IPv6.prototype.isIPv4MappedAddress = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:333:    IPv6.prototype.toIPv4Address = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:342:    IPv6.prototype.prefixLengthFromSubnetMask = function() {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:537:        Object.defineProperty(parsed, 'toString', {
$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js:611:        Object.defineProperty(parsed, 'toString', {
```

Non-production hits (excluded): package-lock.json references to npm packages with
"prototype" in the name (array.prototype.flat, etc.), ipaddr.min.js (duplicate).

---

## Group 4 -- monkeypatch / patch / wrap / shim / polyfill / override

Production hits: **NONE**

Non-production hits (excluded): package-lock.json references to packages
(wrap-ansi, spawn-wrap, es-shim-unscopables, word-wrap).

---

## Group 5 -- require.cache / require.extensions / Module._load / etc.

Production hits: **NONE**

Non-production hits: **NONE**

---

## Group 6 -- process.binding / internalBinding / _http_ / internal/

Production hits: **NONE**

Non-production hits: **NONE**
