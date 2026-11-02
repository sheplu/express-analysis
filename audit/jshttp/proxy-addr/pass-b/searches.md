# proxy-addr Pass B -- Raw Search Results

Package: proxy-addr 2.0.8
Commit: a11ad82545698af5c33e59f3ed0b52eab79bf610
Date: 2026-11-01

Production files examined:
- `$PACKAGE_ROOT/index.js`
- `$PACKAGE_ROOT/node_modules/forwarded/index.js`
- `$PACKAGE_ROOT/node_modules/ipaddr.js/lib/ipaddr.js`

Non-production files (package-lock.json, README.md, HISTORY.md, .d.ts, .min.js)
are excluded from candidate classification below.

---

## Group 1: Imports / require / dynamic import / node: protocol

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ...
```

Production hits:
```
./index.js:23:var forwarded = require('forwarded')
./index.js:24:var ipaddr = require('ipaddr.js')
```

Non-production hits (excluded):
```
./package-lock.json:470:        "resolve-from": "^5.0.0"
./package-lock.json:532:    "node_modules/@istanbuljs/load-nyc-config/node_modules/resolve-from": {
./package-lock.json:2825:        "resolve-from": "^4.0.0"
./package-lock.json:4081:        "resolve-from": "^5.0.0",
./package-lock.json:4163:    "node_modules/nyc/node_modules/resolve-from": {
./package-lock.json:4842:    "node_modules/resolve-from": {
./node_modules/ipaddr.js/README.md:28:var ipaddr = require('ipaddr.js');
./README.md:24:var proxyaddr = require('proxy-addr')
./node_modules/forwarded/README.md:24:var forwarded = require('forwarded')
```

## Group 2: Globals (Buffer, process, globalThis, global, extends, inherits)

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ...
```

Production hits:
```
./node_modules/ipaddr.js/lib/ipaddr.js:663:  ipaddr.process = function(string) {
```

Non-production hits (excluded):
```
./package-lock.json:4027:        "process-on-spawn": "^1.0.0"
./package-lock.json:4080:        "process-on-spawn": "^1.0.0",
./package-lock.json:4665:    "node_modules/process-on-spawn": {
./package-lock.json:4667:      "resolved": "https://registry.npmjs.org/process-on-spawn/-/process-on-spawn-1.1.0.tgz",
./node_modules/ipaddr.js/lib/ipaddr.js.d.ts:22:        export function process(addr: string): IPv4 | IPv6;
./node_modules/ipaddr.js/lib/ipaddr.js.d.ts:26:        export class IPv4 extends IP {
./node_modules/ipaddr.js/lib/ipaddr.js.d.ts:46:        export class IPv6 extends IP {
./node_modules/ipaddr.js/README.md:24:ipaddr.js defines one object in the global scope: `ipaddr`. In CommonJS,
./node_modules/ipaddr.js/README.md:31: (multiple hits, all documentation text)
./HISTORY.md:137:  * Fix a global leak when multiple subnets are trusted
```

## Group 3: Prototype / defineProperty / Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|...' ...
```

Production hits:
```
./index.js:102:    if (!Object.prototype.hasOwnProperty.call(IP_RANGES, val)) {
./node_modules/ipaddr.js/lib/ipaddr.js:71:    IPv4.prototype.kind = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:75:    IPv4.prototype.toString = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:79:    IPv4.prototype.toNormalizedString = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:83:    IPv4.prototype.toByteArray = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:87:    IPv4.prototype.match = function(other, cidrRange) {
./node_modules/ipaddr.js/lib/ipaddr.js:98:    IPv4.prototype.SpecialRanges = {
./node_modules/ipaddr.js/lib/ipaddr.js:109:    IPv4.prototype.range = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:113:    IPv4.prototype.toIPv4MappedAddress = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:117:    IPv4.prototype.prefixLengthFromSubnetMask = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:224:    IPv6.prototype.kind = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:228:    IPv6.prototype.toString = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:232:    IPv6.prototype.toRFC5952String = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:250:    IPv6.prototype.toByteArray = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:262:    IPv6.prototype.toNormalizedString = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:281:    IPv6.prototype.toFixedLengthString = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:300:    IPv6.prototype.match = function(other, cidrRange) {
./node_modules/ipaddr.js/lib/ipaddr.js:311:    IPv6.prototype.SpecialRanges = {
./node_modules/ipaddr.js/lib/ipaddr.js:325:    IPv6.prototype.range = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:329:    IPv6.prototype.isIPv4MappedAddress = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:333:    IPv6.prototype.toIPv4Address = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:342:    IPv6.prototype.prefixLengthFromSubnetMask = function() {
./node_modules/ipaddr.js/lib/ipaddr.js:537:        Object.defineProperty(parsed, 'toString', {
./node_modules/ipaddr.js/lib/ipaddr.js:611:        Object.defineProperty(parsed, 'toString', {
```

Non-production hits (excluded): package-lock.json references to
array.prototype.*, string.prototype.*, function.prototype.name,
regexp.prototype.flags, arraybuffer.prototype.slice (all are package names).

## Group 4: Monkeypatch keywords (patch, wrap, shim, polyfill, override)

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ...
```

Production hits: **NONE**

Non-production hits (excluded): package-lock.json references to
es-shim-unscopables, wrap-ansi, spawn-wrap, word-wrap (all package names).

## Group 5: Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|...)' ...
```

Production hits: **NONE**
Non-production hits: **NONE**

## Group 6: Node.js internal bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|...' ...
```

Production hits: **NONE**
Non-production hits: **NONE**
