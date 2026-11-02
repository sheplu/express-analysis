# Node.js patch audit: forwarded

- Verdict: no confirmed patching in the inspected scope
- Status: complete
- Input: forwarded (https://github.com/jshttp/forwarded)
- Library: v0.2.0, commit b3097d832aea409b1a1934fd60ecba8129116edc
- Node.js baseline: commit d44625a4b80c672215b469906ce583ce7eeeebaf
- Scope: `$PACKAGE_ROOT/index.js` (single production file, 91 lines)
- Coverage: 100% of shipped runtime code; zero runtime dependencies
- Protocol: two full independent blind audits (pass-a/, pass-b/) reconciled

## Patching verdict

**No monkeypatching of Node.js core detected.** Both independent audit passes reached the same conclusion with high confidence.

The library exports a single pure function that:
1. Reads `req.headers['x-forwarded-for']` (read-only property access)
2. Reads `req.socket.remoteAddress` or `req.connection.remoteAddress` (read-only property access)
3. Parses the header string using a manual character-by-character loop
4. Returns a newly constructed array

The production code contains:
- Zero `require()` or `import` calls (no external modules loaded)
- Zero references to `Buffer`, `process`, `globalThis`, or `global`
- Zero prototype manipulation (`__proto__`, `setPrototypeOf`, `defineProperty`, etc.)
- Zero module loader hooks (`require.cache`, `require.extensions`, `Module._*`)
- Zero internal binding access (`process.binding`, `internalBinding`)
- Zero shim/polyfill/wrap/override patterns

The library creates only new objects (arrays, strings) and never mutates any object it receives.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

| ID | Site and core target | Status | Evidence/reason |
|----|---------------------|--------|-----------------|
| C-001 | `$PACKAGE_ROOT/scripts/version-history.js:3-4` - `require('fs')`, `require('path')` | Rejected | Dev-only build script, not shipped in published package (`files` field in package.json limits to `["LICENSE", "HISTORY.md", "README.md", "index.js"]`). Normal built-in module usage, not patching. |
| C-002 | `$PACKAGE_ROOT/scripts/version-history.js:8,15,20,28` - `process.env`, `process.exit()` | Rejected | Dev-only build script, not shipped. Read-only `process.env` access and `process.exit()` calls are standard API usage, not patching. |

No unresolved questions remain.

## Supporting context

- The library is designed for a single purpose: parsing the `X-Forwarded-For` HTTP header and combining it with the socket remote address.
- It uses only basic JavaScript string operations (`charCodeAt`, `substring`) and array operations (`push`, `concat`).
- The `module.exports = forwarded` assignment is the standard CommonJS export pattern and does not modify any shared state.
- The `files` field in `package.json` explicitly limits the published package to `["LICENSE", "HISTORY.md", "README.md", "index.js"]`, confirming that `scripts/` is development-only.

## Sources and verification

| Source | Command/query | Result |
|--------|--------------|--------|
| Version and entrypoints | `cat $PACKAGE_ROOT/package.json` | v0.2.0, single entrypoint `index.js`, `files` field confirms shipped files |
| Git commit | `cd $PACKAGE_ROOT && git rev-parse HEAD` | b3097d832aea409b1a1934fd60ecba8129116edc |
| Node.js baseline | `cd $NODEJS_SOURCE && git rev-parse HEAD` | d44625a4b80c672215b469906ce583ce7eeeebaf |
| Runtime dependencies | `ls $PACKAGE_ROOT/node_modules/` | No `node_modules` directory exists |
| Production files | `find` excluding test/benchmark/dotfiles | `index.js` only (plus package.json, package-lock.json, scripts/) |
| Search group 1 (imports) | `rg -n 'require\s*\(|...'` | Zero hits in production code |
| Search group 2 (globals) | `rg -n '\bBuffer\b|\bprocess\b|...'` | Zero hits in production code |
| Search group 3 (prototypes) | `rg -n '\.prototype\b|...'` | Zero hits in production code |
| Search group 4 (patch keywords) | `rg -n 'monkey.?patch|...'` | Zero hits anywhere |
| Search group 5 (module loader) | `rg -n 'require\.cache|...'` | Zero hits anywhere |
| Search group 6 (internals) | `rg -n 'process\.(binding|...)'` | Zero hits anywhere |

## Coverage and limitations

- **Entry points checked:** `$PACKAGE_ROOT/index.js` (the sole production file)
- **Dependencies checked:** None exist (zero runtime dependencies confirmed)
- **What was covered:** 100% of shipped production code
- **What would change the verdict:** If the library added runtime dependencies, new source files, or dynamic code generation (eval, Function constructor), a re-audit would be needed. The current codebase is trivially verifiable.
