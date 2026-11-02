# express-generator — findings detail (files, lines, issues)

Library: express-generator 4.16.1 (master @ `a1f384101a59cbade670e09b4d6f267c0759e9f1`)
Verdict: **confirmed patching — 1 transitive patch** (via pinned ejs@2.6.2). The generator's own code patches nothing.

## Finding F-001 — ejs registers a `.ejs` handler on the shared CJS loader registry

| File | Line(s) | What happens |
|---|---|---|
| `bin/express-cli.js` | 3 | `var ejs = require('ejs')` — unconditional on every CLI invocation (even `--help`); this is what activates the patch |
| `node_modules/ejs/lib/ejs.js` | 917 | `if (require.extensions)` — always truthy in CJS Node |
| `node_modules/ejs/lib/ejs.js` | 918–927 | `require.extensions['.ejs'] = function (module, flnm) {…}` — writes to the live shared `Module._extensions` registry; handler compiles the file as an EJS template and injects it via core-private `module._compile('module.exports = ' + fn.toString() + ';', filename)` |

Node.js core baseline:

| File | Line(s) | Relevance |
|---|---|---|
| `$NODEJS_SOURCE/lib/internal/modules/helpers.js` | 379 | `require.extensions` is an alias of the live `Module._extensions` object — writes are process-wide |
| `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js` | 399 | the registry object itself |
| `$NODEJS_SOURCE/lib/internal/modules/cjs/loader.js` | 630–641 | default behavior without the patch: unknown extensions fall back to the `.js` handler |

**Effect:** process-wide and permanent for the process lifetime. `require('./x.ejs')` changes from compile-as-JS (normally SyntaxError) to returning a compiled EJS template function; extensionless `require()` can newly resolve `*.ejs` files via `Module._findPath`. Built-in `.js`/`.json`/`.node` handlers are not replaced (additive registration).

**Issue / Node.js-change risk:** `require.extensions` has been deprecated since Node v0.10.6 but is still live. If Node.js ever removes or freezes `require.extensions`/`Module._extensions`, or changes `module._compile`'s private signature, the express-generator CLI would be affected at startup (the registration itself is guarded by `if (require.extensions)`, so removal degrades gracefully, but the `module._compile` call inside the handler is unguarded private-API usage). Fix already exists upstream: ejs deprecated the hook in 2.7.0 (commit `cce319f40f`) and removed it in v3 — but express-generator pins `ejs@2.6.2`.

## Rejected candidates (not patches)

| File | Line(s) | Why flagged | Why rejected |
|---|---|---|---|
| `bin/express-cli.js` | exit()/around | empty-write draining of stdout/stderr then `process.exit(code)` | documented API usage; nothing wrapped or replaced |
| `bin/express-cli.js` | — | `process.stdin.destroy()`, `process.on(...)` listeners | method calls / event registration, not overrides |
| `node_modules/ejs/lib/ejs.js` | ~57 | `exports.fileLoader = fs.readFileSync` | copies a reference onto ejs's own exports; `fs` module untouched |
| `node_modules/ejs/lib/ejs.js` | inside F-001 handler | `module._compile(...)` | core-**private API usage** within the handler, not an additional mutation (supporting context) |
| ejs browser bundles | — | `window.ejs`, bundled process shim | browser-only artifacts, never loaded in Node |
| `node_modules/minimist` (1.2.5) | — | `__proto__`/prototype-pollution mentions | defensive guards (skip dangerous keys), no mutation |
| `node_modules/mkdirp` | — | `process.umask()` | read-only |
| `node_modules/minimatch`, ejs classes | — | own `.prototype` method definitions | library-owned prototypes |
| `templates/**` | — | template files reference app deps | copy-data; never executed by the generator (audited separately as their own packages) |

## Negative sweeps

- No other `require.extensions`/`Module._*`/`require.cache` writes anywhere in scope.
- No prototype/descriptor mutation of core objects; no global pollution; no `internalBinding`/`process.binding` writes; no install scripts; no native code.
