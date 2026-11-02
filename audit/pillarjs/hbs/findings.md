# hbs — findings detail (files, lines, issues)

Library: hbs 4.4.0 (master @ `c07c01ed7333d10a139c96a63bead7733c3df30f`)
Verdict: **confirmed patching** — 2 confirmed patches, both transitive via handlebars@4.7.10 (1 active everywhere, 1 version-gated legacy).

## F-001 — handlebars registers `.handlebars`/`.hbs` require() handlers (active)

| Item | Detail |
|---|---|
| Patch site | `node_modules/handlebars/lib/index.js:23-25` (handler fn :17-21) |
| Trigger chain | `require('hbs')` -> `lib/hbs.js:371` `module.exports = new Instance()` -> `lib/hbs.js:16` `require('handlebars').create()` -> handlebars module body |
| Core object mutated | `Module._extensions` — shared CJS loader extension table (`require.extensions` is its deprecated alias, `$NODEJS_SOURCE/lib/internal/modules/helpers.js:379`; table at `cjs/loader.js:399`) |
| Mutation | adds keys `'.handlebars'` and `'.hbs'` -> `extension(module, filename)` = `module.exports = handlebars.compile(fs.readFileSync(filename, 'utf8'))` |
| Scope | process-wide, permanent, unconditional on `require('hbs')` (no opt-in/out) |
| Observable effects | (1) `require('./tpl.hbs')` anywhere in the process returns a compiled template function; (2) `Module._findPath` extension guessing (`loader.js:868,877`) now probes `.handlebars`/`.hbs` for extensionless requires; (3) bundlers emit warnings on the dynamic pattern (upstream #953/#1174/#2046) |
| What it does NOT do | does not replace `.js`/`.json`/`.node` handlers; additive only |

## F-002 — handlebars no-conflict `globalThis` polyfill (legacy Node < 12 only)

| Item | Detail |
|---|---|
| Patch site | `node_modules/handlebars/dist/cjs/handlebars/no-conflict.js:9-16` |
| Trigger chain | `require('hbs')` -> `handlebars/lib/index.js:8` -> `dist/cjs/handlebars.js` body (`inst = create(); _handlebarsNoConflict2['default'](inst)`) -> polyfill IIFE |
| Guard | `if (typeof globalThis === 'object') return;` — **no-op on Node ≥ 12** (verified empirically on Node v24.19.0) |
| Mutation (when active) | `Object.prototype.__defineGetter__('__magic__', ...)` (transient; deleted same tick) + creation of permanent `globalThis` global |
| Reachability | hbs `package.json:31` declares `engines: node >= 0.8`, so the active branch is inside the package's own declared support range |
| Origin | handlebars PR #1894 (v4.7.8+), replacing CSP-unsafe `new Function('return this')` |
| Adjudication | pass A rejected (dead on supported baseline), pass B confirmed (version-gated patch); reconciled as confirmed, version-gated, inert on audited baseline |

## hbs own-code monkeypatch (NOT Node core — supporting context)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `lib/hbs.js` | 349-369 | `localsAsTemplateData(app)` reassigns `app.render = (function(render){ return function(...){...} })(app.render)` | monkeypatch of an **Express** application object (third-party), opt-in; tracked for Express-compat, not a Node patch |

## Other core-object interactions (verified in-contract)

| File | Line(s) | Interaction | Classification |
|---|---|---|---|
| `lib/hbs.js` | 1-2 | `require('fs')`, `require('path')` | read-only API use (`readFile`, `readFileSync`, `path.join` etc.); no property of `fs`/`path` ever written |
| `walk/lib/node-type-emitter.js` | (emitter body) | writes `name`/`error`/`type`/`flag` expandos on `fs.Stats` instances | instance metadata; no core `Stats` prototype/member shadowed (`$NODEJS_SOURCE/lib/internal/fs/utils.js`) |
| `handlebars/dist/cjs/handlebars/exception.js` | prototype setup | `Exception.prototype = new Error()` | ordinary inheritance; `Error` itself untouched |
| `source-map` (loaded transitively at require time) | entry tree | own-object/exports writes only | no core interaction |

## Runtime-reachable scope (established empirically, both passes)

- Loaded by `require('hbs')`: hbs `lib/hbs.js`+`lib/async.js`, handlebars `lib/index.js` + full `dist/cjs` runtime, source-map, walk, foreachasync.
- CLI-only (never loaded at runtime; entrypoints still checked clean): neo-async, uglify-js (optional dep of handlebars), minimist, wordwrap, handlebars precompiler (`bin/handlebars`).
- `walk/lib/walk-async-only.js` (historical `Array.prototype`-patching path via `futures`) unreachable: dependency not installed, file not required by main entry.

## Negative sweeps (both passes, zero hits in runtime scope)

- Internals/bindings: `process.binding`, `internalBinding`, `'internal/...'`, `'_http_...'` — zero hits
- Prototype/descriptor mutation against core: `setPrototypeOf`, `__proto__` writes, `defineProperty/ies` on core objects, `Reflect.*` — zero hits beyond ledgered sites
- Module interception beyond F-001: `require.cache` writes, `Module._load/_resolveFilename/_compile` writes, `syncBuiltinESMExports`, `registerHooks` — zero hits
- No install scripts, no native code in the runtime-reachable set

## Node.js-change risk

1. **`require.extensions` removal/freezing (F-001)** — the API has been deprecated (Stability 0) since Node 0.10 (`$NODEJS_SOURCE/doc/api/modules.md:930-954`). If Node removes the alias or freezes `Module._extensions`, `require('hbs')` still works but `.hbs`/`.handlebars` compile-on-require silently stops registering (or throws, depending on mechanism). Direct require of templates and extensionless-probe behavior would break. This is the concrete exposure to track for this package.
2. **`Module._findPath` probing semantics** — any core change to how `ObjectKeys(Module._extensions)` feeds extension guessing (`loader.js:868,877`) changes hbs/handlebars-dependent resolution of extensionless paths.
3. F-002 is a legacy-only concern; no forward Node.js risk (guard keys on `globalThis` existing).
