# Search log: express-session 1.19.0 patch audit (pass-b)

All commands run from `$PACKAGE_ROOT` unless noted; `$NODEJS_SOURCE` commands noted explicitly.
Dependency file set used below ("DEPS"): cookie/index.js cookie-signature/index.js
debug/src/{index,node,debug,browser,inspector-log}.js ms/index.js depd/index.js
parseurl/index.js random-bytes/index.js safe-buffer/index.js uid-safe/index.js
on-headers/index.js (all under `$PACKAGE_ROOT/node_modules`, scanned with `--no-ignore`).

## Scope establishment

| Command | Result |
| --- | --- |
| `cat package.json` | main entry index.js (default); `files: ["session/", "index.js"]`; 8 runtime deps; no install/postinstall scripts |
| `ls`, `ls session/`, `ls node_modules/` | runtime tree = index.js + session/{cookie,memory,session,store}.js; 10 installed packages (8 direct + ms via debug + random-bytes via uid-safe) |
| `git log -1 --format='%H %s'` | 8947e169ae838b22cc1af198e50e370e6fc09f96 (matches briefing) |
| per-dep `node -e "require('./node_modules/<n>/package.json')..."` | versions/entrypoints: cookie@0.7.2, cookie-signature@1.0.7, debug@2.6.9 (main ./src/index.js), depd@2.0.0, ms@2.0.0, on-headers@1.1.0, parseurl@1.3.3, random-bytes@1.0.0, safe-buffer@5.2.1, uid-safe@2.1.5 |
| `find <dep> -name "*.js" -not -path "*/node_modules/*"` per dep | shipped JS inventory; extra files only in debug (src/*, karma.conf.js [test config, skipped]) and depd (lib/browser/index.js) |

## Skill candidate pattern set — target runtime files (index.js, session/)

| Pattern | Command | Result |
| --- | --- | --- |
| P1 imports | `rg -n "require\s*\(\|\bfrom\s*['\"]\|\bimport\s*\(\|\bnode:" index.js session/` | 21 hits: core crypto/events/util; deps safe-buffer, cookie, debug, depd, on-headers, parseurl, cookie-signature, uid-safe; local session/* requires. All CommonJS; no dynamic/computed requires |
| P2 globals/inheritance | `rg -n "\bBuffer\b\|\bprocess\b\|\bglobalThis\b\|\bglobal\b\|\bextends\b\|\binherits\s*\(" index.js session/` | Buffer reads (index.js:16,307-308), process.env/nextTick reads (33,67; memory.js:27), util.inherits x2 (store.js:40, memory.js:49 -> C-012) |
| P3 prototype/defineProperty | `rg -n "\.prototype\b\|__proto__\|setPrototypeOf\|definePropert(y\|ies)\|Reflect\.(set\|defineProperty\|setPrototypeOf)\|Object\.assign" index.js session/` | defineProperty on sess (index.js:428,435 -> C-008) and Session instances/prototype (session.js:25,26,137 -> C-014); library prototypes Cookie/MemoryStore/Store only. No core prototype on the left-hand side anywhere |
| P4 patch keywords | `rg -n "monkey.?patch\|\bpatch\b\|\bwrap\b\|\bshim\b\|\bpolyfill\b\|\boverride\b" index.js session/` | 1 hit: comment "wrap session methods" (index.js:412) |
| P5 module interception | `rg -n "require\.cache\|require\.extensions\|Module\._(load\|resolveFilename\|extensions\|compile)\|syncBuiltinESMExports\|registerHooks" index.js session/` | negative |
| P6 bindings/internals | `rg -n "process\.(binding\|_linkedBinding)\|internalBinding\|['\"]_http_\|['\"]internal/" index.js session/` | negative |

## Targeted write searches — target

| Command | Result |
| --- | --- |
| `rg -n "\b(res\|req)\.[A-Za-z_$]+\s*=[^=]" index.js session/` | req.sessionID (159, 232), req.session (160; store.js:100), req.sessionStore (229), **res.end (269 -> C-001/F-001)**. No res.write/res.writeHead/req-method reassignment in the target itself |
| `rg -n "\bdelete\b" index.js session/` | memory.js:94,181 (own sessions map); session.js:110 (`delete this.req.session` -> C-015) |
| `rg -n "_header\|_implicitHeader\|\._[a-z]" index.js session/` | res._header read + res._implicitHeader() call (index.js:294-295 -> C-004); cookie.js `this._expires` (library state) |
| `rg -n "deprecate\.(function\|property)" index.js session/` | **negative** — depd wrapfunction/wrapproperty never activated (C-033 rejected) |
| `rg -n "deprecate\(" index.js session/` | 6 message-only call sites (index.js:122,127,147,614,627; cookie.js:89) — F-003 activation paths |

## Skill candidate pattern set — dependencies (DEPS, `rg -n --no-ignore`)

| Pattern | Result |
| --- | --- |
| P1 imports | crypto (cookie-signature, random-bytes), buffer (safe-buffer), url (parseurl), http (on-headers), tty/util/fs/net (debug node.js), path (depd), stream (debug inspector-log), ms (debug). No dynamic loading |
| P2 globalThis/global/extends/inherits | `global.Promise` reads only (uid-safe:50, random-bytes:47 -> C-043) |
| P3 prototype/defineProperty | safe-buffer:24 `SafeBuffer.prototype = Object.create(Buffer.prototype)` (read of core proto -> C-041); on-headers:19 appendHeader typeof read (C-031); cookie:23-24 Object.prototype aliases (C-044); depd:62,485 defineProperty in convertDataDescriptorToAccessor/wrapproperty (C-033), depd:496-521 DeprecationError own descriptors (C-034); debug browser.js:123 Function.prototype.apply.call read (C-039) |
| P4 patch keywords | debug node.js:56 comment; depd:469,477 "wrap getter/setter" comments (inside C-033) |
| P5 module interception | **negative across all deps** |
| P6 bindings/internals | debug node.js:169 `process.binding('tty_wrap')` (C-037, env-gated) — only hit |

## Dependency-specific traces

| Command | Result |
| --- | --- |
| full read `node_modules/on-headers/index.js` | **index.js:71 `res.writeHead = createWriteHead(res.writeHead, listener)` -> C-030/F-002**; wrapper 30-52; header re-application 119-180 |
| full read `node_modules/depd/index.js` | **getStack() 381-399 writes/restores Error.prepareStackTrace + Error.stackTraceLimit -> C-032/F-003**; wrapfunction/wrapproperty 413-486 (inactive); DeprecationError 492-538 (own instance) |
| full read `node_modules/debug/src/{index,node,debug}.js` | load chain index.js -> node.js -> debug.js; `exports.enable(load())` at node.js:248 -> save() writes process.env.DEBUG (C-036); DEBUG_FD path 61-69/167-226 (C-037) |
| `rg -n "inspector-log" node_modules/debug/src/ node_modules/debug/package.json` | negative — inspector-log.js unreachable (C-038); full read shows transient console._stdout swap if ever invoked |
| full reads: safe-buffer, parseurl, uid-safe, random-bytes, cookie-signature; `head -40 ms/index.js`; cookie non-local-write scan `rg -n "=[^=]" cookie/index.js` (filtered) | only own-exports writes and local string building; parseurl req._parsedUrl/_parsedOriginalUrl writes (C-042) |
| `rg -n "browser" node_modules/depd/package.json`; `sed -n 1,40p node_modules/depd/lib/browser/index.js` | browser build is a no-op deprecate; non-Node path (C-039) |

## Node.js baseline verification ($NODEJS_SOURCE @ d44625a4b80, targeted reads only)

| Command | Result |
| --- | --- |
| `cat lib/_http_outgoing.js`; `head -30 lib/_http_server.js` | both are deprecated re-export shims (DEP0199) over lib/internal/http/* on main |
| `rg -n "OutgoingMessage\.prototype\.(end\|write)\|'_header'\|_implicitHeader" lib/internal/http/outgoing.js` | `write` :1027, `end` :1289, `_implicitHeader` :1003 (base throws) — F-001 baseline |
| `rg -n "writeHead\|_implicitHeader" lib/internal/http/server.js` | `ServerResponse.prototype._implicitHeader` :419 (calls this.writeHead), `ServerResponse.prototype.writeHead = writeHead` :423-424 — F-002/C-004 baseline |
| `rg -n "_header" lib/internal/http/outgoing.js` | `this._header = null` own state in constructor :188; internal use sites — C-004 is a private-state read |
| `rg -n "appendHeader" lib/internal/http/server.js` | writeHead's own array path uses appendHeader :468 — confirms on-headers mirrors core behavior |
| `rg -n "session\|_parsedUrl" lib/_http_incoming.js` | **negative** — req augmentation shadows no core member (C-005/C-042) |
| `rg -n "^module.exports" lib/events.js`; `rg -n "function inherits" lib/util.js` | EventEmitter export :212; inherits :344 — C-012 documented inheritance |
| `rg -n "prepareStackTrace" lib/internal/errors.js` | :145-150 core honors `globalThis.Error.prepareStackTrace` when set — F-003 baseline |

## Upstream corroboration (read-only)

| Query | Result |
| --- | --- |
| `git log -n 5 --format='%h %ad %s' -S 'res.end = function' -- index.js` (in $PACKAGE_ROOT) | single hit: e21cc9b 2014-02-15 "init" — res.end proxy present since repo import |
| `head -15 node_modules/on-headers/HISTORY.md` | 1.0.2 "Fix `res.writeHead` patch missing return value" (upstream names it a patch); 1.1.0 (2025-07-17) fixes CVE-2025-7339 / GHSA-76c9-3jph-rj3q |

## Reproduction

| Command | Result |
| --- | --- |
| `node repro/instance-override-check.js "$PACKAGE_ROOT"` (Node v24.19.0) | after require: all shared prototypes + Error globals unchanged; after fired deprecation: Error globals restored; during request: res has own end/writeHead differing from prototypes, prototypes still original; req has own session/sessionStore. Full output in repro/instance-override-check.out.txt |

## Negative results summary

- No `require.cache` / `require.extensions` / `Module._*` / loader-hook usage anywhere in scope.
- No `setPrototypeOf` / `__proto__` writes anywhere in scope.
- No writes to `http.*`, `events.*`, `util.*`, `crypto.*`, `url.*`, `buffer.*` module objects or their prototypes in any scanned file.
- No `process.binding` in the target; one env-gated read in debug (never activated here).
- `res.write` is captured but never reassigned; `res.end` is the only `res.*` method the target itself replaces.
- express-session never calls `deprecate.function` / `deprecate.property`.
