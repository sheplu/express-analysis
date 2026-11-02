# Monkeypatch Audit -- Search Evidence (Pass B)

**Library:** forwarded v0.2.0
**Commit:** b3097d832aea409b1a1934fd60ecba8129116edc
**Source:** `$PACKAGE_ROOT/`
**Date:** 2026-11-01

---

## Search Group 1: require / import / from

**Command:**
```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' \
  --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**
```
./scripts/version-history.js:3:var fs = require('fs')
./scripts/version-history.js:4:var path = require('path')
./README.md:24:var forwarded = require('forwarded')
./package-lock.json:489:        "resolve-from": "^5.0.0"
./package-lock.json:551:    "node_modules/@istanbuljs/load-nyc-config/node_modules/resolve-from": {
./package-lock.json:2740:        "resolve-from": "^4.0.0"
./package-lock.json:3895:        "resolve-from": "^5.0.0",
./package-lock.json:3977:    "node_modules/nyc/node_modules/resolve-from": {
./package-lock.json:4584:    "node_modules/resolve-from": {
```

**Exit code:** 0

**Analysis:**
- `scripts/version-history.js` lines 3-4: Dev-only build script (not in package.json `files`). Uses `require('fs')` and `require('path')` for file I/O. Normal Node.js built-in usage; no patching.
- `README.md` line 24: Documentation example. Not executable code.
- `package-lock.json`: Auto-generated lockfile entries. Not executable code.

---

## Search Group 2: Buffer / process / globalThis / global / extends / inherits

**Command:**
```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' \
  --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**
```
./scripts/version-history.js:8:var VERSION = process.env.npm_package_version
./scripts/version-history.js:15:  process.exit(1)
./scripts/version-history.js:20:  process.exit(1)
./scripts/version-history.js:28:    process.exit(1)
./package-lock.json:3841:        "process-on-spawn": "^1.0.0"
./package-lock.json:3894:        "process-on-spawn": "^1.0.0",
./package-lock.json:4409:    "node_modules/process-on-spawn": {
./package-lock.json:4411:      "resolved": "https://registry.npmjs.org/process-on-spawn/-/process-on-spawn-1.1.0.tgz",
```

**Exit code:** 0

**Analysis:**
- `scripts/version-history.js` lines 8, 15, 20, 28: Dev-only script reads `process.env.npm_package_version` and calls `process.exit(1)`. Read-only access to `process`; no mutation of global state.
- `package-lock.json`: Auto-generated lockfile entries. Not executable code.

---

## Search Group 3: prototype / defineProperty / Reflect / Object.assign

**Command:**
```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' \
  --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**
```
./package-lock.json:809:    "node_modules/array.prototype.flat": {
./package-lock.json:811:      "resolved": "https://registry.npmjs.org/array.prototype.flat/-/array.prototype.flat-1.3.3.tgz",
./package-lock.json:828:    "node_modules/array.prototype.flatmap": {
./package-lock.json:830:      "resolved": "https://registry.npmjs.org/array.prototype.flatmap/-/array.prototype.flatmap-1.3.3.tgz",
./package-lock.json:847:    "node_modules/arraybuffer.prototype.slice": {
./package-lock.json:849:      "resolved": "https://registry.npmjs.org/arraybuffer.prototype.slice/-/arraybuffer.prototype.slice-1.0.4.tgz",
./package-lock.json:1473:        "arraybuffer.prototype.slice": "^1.0.4",
./package-lock.json:1485:        "function.prototype.name": "^1.1.8",
./package-lock.json:1511:        "regexp.prototype.flags": "^1.5.4",
./package-lock.json:1517:        "string.prototype.trim": "^1.2.10",
./package-lock.json:1518:        "string.prototype.trimend": "^1.0.9",
./package-lock.json:1519:        "string.prototype.trimstart": "^1.0.8",
./package-lock.json:1841:        "array.prototype.flat": "^1.2.5",
./package-lock.json:2338:    "node_modules/function.prototype.name": {
./package-lock.json:2340:      "resolved": "https://registry.npmjs.org/function.prototype.name/-/function.prototype.name-1.2.0.tgz",
./package-lock.json:3812:        "array.prototype.flatmap": "^1.3.3",
./package-lock.json:4488:    "node_modules/regexp.prototype.flags": {
./package-lock.json:4490:      "resolved": "https://registry.npmjs.org/regexp.prototype.flags/-/regexp.prototype.flags-1.5.4.tgz",
./package-lock.json:4954:    "node_modules/string.prototype.trim": {
./package-lock.json:4956:      "resolved": "https://registry.npmjs.org/string.prototype.trim/-/string.prototype.trim-1.2.11.tgz",
./package-lock.json:4977:    "node_modules/string.prototype.trimend": {
./package-lock.json:4979:      "resolved": "https://registry.npmjs.org/string.prototype.trimend/-/string.prototype.trimend-1.0.10.tgz",
./package-lock.json:4996:    "node_modules/string.prototype.trimstart": {
./package-lock.json:4998:      "resolved": "https://registry.npmjs.org/string.prototype.trimstart/-/string.prototype.trimstart-1.0.8.tgz",
./package-lock.json:5423:        "function.prototype.name": "^1.1.6",
```

**Exit code:** 0

**Analysis:**
- All hits are in `package-lock.json`. These are dev dependency package names (eslint-related), not executable code. No prototype manipulation found in any source file.

---

## Search Group 4: monkeypatch / patch / wrap / shim / polyfill / override

**Command:**
```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' \
  --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**
```
./package-lock.json:798:        "es-shim-unscopables": "^1.1.0",
./package-lock.json:819:        "es-shim-unscopables": "^1.0.2"
./package-lock.json:838:        "es-shim-unscopables": "^1.0.2"
./package-lock.json:1192:        "wrap-ansi": "^7.0.0"
./package-lock.json:1602:    "node_modules/es-shim-unscopables": {
./package-lock.json:1604:      "resolved": "https://registry.npmjs.org/es-shim-unscopables/-/es-shim-unscopables-1.1.0.tgz",
./package-lock.json:3898:        "spawn-wrap": "^2.0.0",
./package-lock.json:3918:        "wrap-ansi": "^6.2.0"
./package-lock.json:3987:    "node_modules/nyc/node_modules/wrap-ansi": {
./package-lock.json:3989:      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-6.2.0.tgz",
./package-lock.json:4147:        "word-wrap": "^1.2.5"
./package-lock.json:4900:    "node_modules/spawn-wrap": {
./package-lock.json:4902:      "resolved": "https://registry.npmjs.org/spawn-wrap/-/spawn-wrap-2.0.0.tgz",
./package-lock.json:5491:    "node_modules/word-wrap": {
./package-lock.json:5493:      "resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
./package-lock.json:5508:    "node_modules/wrap-ansi": {
./package-lock.json:5510:      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
./package-lock.json:5523:        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
```

**Exit code:** 0

**Analysis:**
- All hits are in `package-lock.json`. These are dev dependency package names (es-shim-unscopables, wrap-ansi, spawn-wrap, word-wrap). Not executable code and not part of the production package.

---

## Search Group 5: require.cache / Module loader internals

**Command:**
```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' \
  --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**
```
(no output)
```

**Exit code:** 1 (no matches)

**Analysis:**
- No matches found. The library does not interact with the Node.js module loader.

---

## Search Group 6: process.binding / internalBinding / internal modules

**Command:**
```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' \
  --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**
```
(no output)
```

**Exit code:** 1 (no matches)

**Analysis:**
- No matches found. The library does not access Node.js internal bindings or private modules.
