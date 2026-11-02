# Node.js patch audit: fresh

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: fresh (https://github.com/jshttp/fresh)
- Library: v2.0.0, commit ee7367318cf86a77e8259c63ee014ff0f8853437
- Node.js baseline: v24.19.0 (from `$NODEJS_SOURCE`)
- Scope: `$PACKAGE_ROOT/index.js` (138 lines, the sole production file)
- Coverage: 100% of shipped runtime code; zero runtime dependencies
- Protocol: two full independent blind audits (pass-a/, pass-b/) reconciled

## Patching verdict

**No confirmed patching.** The library is a single pure-function module that exports one function (`fresh`) for HTTP cache freshness checking. It contains:

- Zero `require()` or `import` statements — no Node.js built-in modules are loaded
- Zero references to Node.js globals (`process`, `Buffer`, `global`, `globalThis`)
- Zero prototype manipulation (`__proto__`, `setPrototypeOf`, `defineProperty`, etc.)
- Zero module system interaction (`require.cache`, `Module._load`, etc.)
- Zero internal Node.js API access (`process.binding`, `internalBinding`, etc.)
- Only standard JavaScript built-ins used: `Date.parse()`, `String.prototype.substring()`, `String.prototype.charCodeAt()`, `RegExp.prototype.test()`, `Array.prototype.push()`, `typeof`

The library has zero runtime dependencies and no `node_modules` directory.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

All candidates from both passes were independently rejected. No unresolved questions remain.

| ID | Site and core target | Status | Evidence/reason |
|----|---------------------|--------|-----------------|
| C-001 | `Date.parse()` call in `parseHttpDate` (`$PACKAGE_ROOT/index.js:94`) | REJECTED | Read-only call to standard JS API. The comment "guard against date.js Date.parse patching" refers to a *different* library that may patch `Date.parse`; fresh itself never mutates it. Defensive coding, not patching. |
| C-002 | `require('fresh')` in `$PACKAGE_ROOT/README.md` | REJECTED | Documentation example only. README.md is not shipped (not in `files` field) and is not production code. |
| C-003 | `require('http')` in `$PACKAGE_ROOT/README.md` | REJECTED | Documentation example only. Not production code. |
| C-004 | `require('http').createServer` in `$PACKAGE_ROOT/README.md` | REJECTED | Documentation example only. Not production code. |

## Supporting context

- The library's `package.json` `files` field explicitly limits the published package to `HISTORY.md`, `LICENSE`, and `index.js`.
- The `parseHttpDate` function includes a defensive type-check on `Date.parse()` return value, with a comment noting that `date.js` (a third-party library) may patch `Date.parse`. This is a consumer-side defense, not a patch by fresh itself.
- The `module.exports = fresh` assignment is standard CommonJS module export pattern, not a mutation of shared state.

## Sources and verification

| Source | Command/query | Result |
|--------|--------------|--------|
| Package metadata | `cat $PACKAGE_ROOT/package.json` | v2.0.0, single entrypoint `index.js`, zero runtime deps |
| Git commit | `cd $PACKAGE_ROOT && git rev-parse HEAD` | ee7367318cf86a77e8259c63ee014ff0f8853437 |
| File inventory | `find $PACKAGE_ROOT -type f ...` | Only `index.js` and `package.json` |
| Runtime deps | `ls $PACKAGE_ROOT/node_modules/` | No node_modules directory |
| Node.js version | `node -e "console.log(process.version)"` from `$NODEJS_SOURCE` | v24.19.0 |
| Search group 1 (imports) | `rg -n 'require\s*\(...'` | Zero hits in index.js |
| Search group 2 (globals) | `rg -n '\bBuffer\b\|\bprocess\b\|...'` | Zero hits |
| Search group 3 (prototypes) | `rg -n '\.prototype\b\|__proto__\|...'` | Zero hits |
| Search group 4 (patch terms) | `rg -n 'monkey.?patch\|\bpatch\b\|...'` | Zero hits in index.js |
| Search group 5 (module loader) | `rg -n 'require\.cache\|...'` | Zero hits |
| Search group 6 (internals) | `rg -n 'process\.(binding\|...)\|...'` | Zero hits |

## Coverage and limitations

- **Entry points checked:** `index.js` (the sole production file, as declared by `files` in `package.json`)
- **Dependencies checked:** None exist (zero runtime dependencies)
- **What would change the verdict:** If the library gained runtime dependencies, or if the `files` field were expanded to include additional JavaScript files, those would need to be audited. The current audit is exhaustive for the shipped code.
