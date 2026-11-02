# errorhandler — findings detail (files, lines, issues)

Library: errorhandler 1.5.2 (master @ `1922d04b78ed575ace5499b3d6f5591f2325f70b`)
Verdict: **no confirmed patching in the inspected scope** — 0 confirmed patches.

## All core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `index.js` | 89, 94, 99 | `res.statusCode = err.statusCode / err.status / 500` | documented writable instance property (prototype default at `$NODEJS_SOURCE/lib/internal/http/server.js:285`) |
| `index.js` | 109 | `if (res._header)` | **read-only** private-API use (flush state, `outgoing.js:188`; public equivalent `headersSent` at `:1011`); introduced 2014 (commit `8c95711`) |
| `index.js` | 110 | `req.socket.destroy()` | documented call |
| `index.js` | 142–143 | `var error = {message, stack}; for (var prop in err) error[prop] = err[prop]` | copies err props into a **fresh object**; the error is never mutated |
| `index.js` | various | `res.setHeader(...)`, `res.end(...)` | documented API calls |
| `index.js` | — | `fs.readFileSync` (template load) | documented call |

## Dependency analysis (all rejected)

| Dependency | Mechanism | Finding |
|---|---|---|
| accepts@1.3.8 / negotiator@0.6.3 | wrap `req` in their own objects (`new Accepts(req)` / `new Negotiator(req)`) | prototype assignments on library-owned constructors; only `req.headers` **reads**; zero writes to req |
| mime-types@2.1.35 / mime-db@1.52.0 | load-time `populateMaps` | fills mime-types' own `Object.create(null)` maps from static JSON |
| escape-html@1.0.3 | pure string function | zero requires |

## Negative sweeps (both passes, zero hits)

Loader interception (`require.cache`/`require.extensions`/`Module._*`), `defineProperty`/`__proto__`/`setPrototypeOf`/`Object.assign` against core, `delete`, builtin-global writes, `extends`/`inherits` of core classes, `process.binding`/`internalBinding`, install scripts.

## Runtime corroboration (both passes, Node v24.19.0)

Core function identities and Object/Error prototype key sets unchanged after require and after exercising all three negotiated branches (html/json/text); 13/13 checks passed; error object confirmed unmutated at runtime.

## Node.js-change risk

- **`res._header` legacy alias** (`index.js:109`): if Node.js drops the `_header` alias, the "cannot actually respond" guard silently stops detecting flushed responses (degradation, not crash). The public `headersSent` getter is the modern replacement — easy upstream fix. This is the package's only private-API touchpoint.
- Everything else uses stable documented API.
