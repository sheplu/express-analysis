# Pass A -- Search Evidence

- **Package**: forwarded v0.2.0
- **Commit**: b3097d832aea409b1a1934fd60ecba8129116edc
- **Source**: `$PACKAGE_ROOT/index.js` (91 lines, single production file)
- **Date**: 2026-11-01
- **Auditor**: Pass A (automated)

---

## Search 1 -- require / import / from

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**

```
./README.md:24:var forwarded = require('forwarded')
./scripts/version-history.js:3:var fs = require('fs')
./scripts/version-history.js:4:var path = require('path')
./package-lock.json:489:        "resolve-from": "^5.0.0"
./package-lock.json:551:    "node_modules/@istanbuljs/load-nyc-config/node_modules/resolve-from": {
./package-lock.json:2740:        "resolve-from": "^4.0.0"
./package-lock.json:3895:        "resolve-from": "^5.0.0",
./package-lock.json:3977:    "node_modules/nyc/node_modules/resolve-from": {
./package-lock.json:4584:    "node_modules/resolve-from": {
```

**Analysis:** No hits in `index.js`. The production file contains zero `require()` or `import` calls. All hits are from README (documentation example), `scripts/` (dev tooling), and `package-lock.json` (lockfile metadata). No runtime dependencies.

---

## Search 2 -- Global / builtin references

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
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

**Analysis:** No hits in `index.js`. All `process` references are in `scripts/version-history.js` (dev script, not production code) and `package-lock.json` (lockfile metadata for dev dependency names). No Buffer, globalThis, global, extends, or inherits usage anywhere in production code.

---

## Search 3 -- Prototype / property manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
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

**Analysis:** No hits in `index.js`. All hits are package names inside `package-lock.json` -- these are dev dependencies used by eslint and its plugins, not production code. Zero prototype manipulation in the library itself.

---

## Search 4 -- Monkeypatch keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
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
./package-lock.json:5491:    "node_modules/word-wrap": {
./package-lock.json:5493:      "resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
./package-lock.json:5508:    "node_modules/wrap-ansi": {
./package-lock.json:5510:      "resolved": "https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz",
./package-lock.json:5523:        "url": "https://github.com/chalk/wrap-ansi?sponsor=1"
```

**Analysis:** No hits in `index.js`. All hits are dev dependency names in `package-lock.json` (`es-shim-unscopables`, `wrap-ansi`, `spawn-wrap`, `word-wrap`). None of these are runtime dependencies; they are transitive dev dependencies used by eslint and nyc. No monkeypatching keywords in production code.

---

## Search 5 -- Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**

```
(no output -- zero matches)
```

**Analysis:** No hits anywhere. The library does not interact with the Node.js module system internals.

---

## Search 6 -- Internal Node.js bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules' .
```

**Output:**

```
(no output -- zero matches)
```

**Analysis:** No hits anywhere. The library does not access any internal Node.js bindings or private modules.
