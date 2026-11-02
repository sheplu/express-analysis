# Search log: method-override 3.0.0 audit (pass A)

All library commands run from `$PACKAGE_ROOT` (or `$PACKAGE_ROOT/node_modules` where shown);
core commands from `$NODEJS_SOURCE`. Runtime file set for sweeps:
`index.js node_modules/*/index.js node_modules/*/src/*.js` (covers every shipped runtime JS
file of the target and its five resolved dependencies; verified by per-package `find`).

## Scope establishment

1. `cat package.json` — v3.0.0; deps debug 3.1.0, methods ~1.1.2, parseurl ~1.3.2, vary ~1.1.2; `files` ships only index.js (+LICENSE/HISTORY); no install scripts; engines >=0.10.
2. `ls -la` — runtime surface is single `index.js` (3102 bytes); test/ and dotfiles out of scope.
3. `git log -1` — HEAD = 4df570e14dddc88b9464808f4cab3b2a73fc6dc8 (matches assignment).
4. `ls node_modules` — debug, methods, ms, parseurl, vary (ms is transitive via debug).
5. Per-dependency: `node -e "...require('./<dep>/package.json')..."` + `find <dep> -name '*.js' -not -path '*/node_modules/*'` — resolved entrypoints: debug@3.1.0 -> ./src/index.js (browser field ./src/browser.js), methods@1.1.2 -> index.js (browser maps http:false), ms@2.0.0 -> ./index, parseurl@1.3.3 -> index.js, vary@1.1.2 -> index.js. debug ships karma.conf.js and a root node.js shim (not resolved as main).
6. `shasum -a 256 index.js` -> 32a184f57f26efe5849cc4f413c3a66663073619a09ae7f31f9265f0fb412c11.

## Candidate pattern sweeps (skill section "Find actual writes and replacements")

S1. `rg -n --no-ignore "require\s*\(|\bfrom\s*['\"]|\bimport\s*\(|\bnode:" <runtime files>`
    HITS: index.js:16-20 (debug, methods, parseurl, querystring, vary); methods/index.js:15 (http); parseurl/index.js:15 (url); debug/src/node.js:5-6 (tty, util), :14 (./debug), :29 (supports-color, try/catch); debug/src/debug.js:14 (ms); debug/src/index.js:7,9 (browser/node select); debug/src/browser.js:7. No `node:` specifiers, no dynamic import.

S2. `rg -n --no-ignore "\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(" <runtime files>`
    HITS: all in debug — src/index.js:6 (process.type read), src/node.js:49,59 (env reads), :76 (process.stderr.fd read), :135 (process.stderr.write), :147-151 (process.env.DEBUG delete/assign -> C-007), :163,183 (env reads); src/browser.js:48,167-168 (browser-only env reads). NEGATIVE: no Buffer, no globalThis/global writes, no extends/inherits anywhere.

S3. `rg -n --no-ignore "\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign" <runtime files>`
    HITS: debug/src/browser.js:133 only (Function.prototype.apply.call — invocation, browser-only -> C-009). NEGATIVE otherwise: no prototype assignment, no descriptor APIs, no Object.assign in the runtime tree.

S4. `rg -n --no-ignore -i "monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b" <runtime files>`
    HITS: index.js comments/strings about "method override" (the feature name, lines 2,16,23,28,38,50,76); methods/index.js:65 ('patch' as an HTTP verb string). NEGATIVE: no patching vocabulary indicating core modification.

S5. `rg -n --no-ignore "require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks" <runtime files>`
    NEGATIVE: 0 hits — no module-loading interception.

S6. `rg -n --no-ignore "process\.(binding|_linkedBinding)|internalBinding|['\"]_http_|['\"]internal/" <runtime files>`
    NEGATIVE: 0 hits — no internal/binding access.

## Full-file reads (every runtime entrypoint read end-to-end)

- `$PACKAGE_ROOT/index.js` (144 lines) — writes: req.originalMethod (:61, C-002), req.method (:75, C-001). Reads: req.headers (:120), opts; calls parseurl (:102), querystring.parse (:103), vary (:117), methods list (:143).
- `node_modules/methods/index.js` — read-only http.METHODS.map at load (:22,:29-32, C-006); static fallback list (:40-68).
- `node_modules/vary/index.js` — res.getHeader (:140) / res.setHeader (:147) (C-005); pure string parsing otherwise.
- `node_modules/parseurl/index.js` — req._parsedUrl cache (:43,:54, C-003); req._parsedOriginalUrl (:84, C-004); url.parse/Url read-only; fastparse builds fresh Url objects.
- `node_modules/debug/src/index.js`, `src/node.js`, `src/debug.js` — load-time `exports.enable(load())` (node.js:186) -> save() env write (node.js:149,151 via debug.js:153, C-007); supports-color try/catch (node.js:29, C-008); stderr write (node.js:135, C-011); formatters/inspectOpts are module-local objects. `src/browser.js` read; not loaded under Node (index.js:6-9).
- `node_modules/ms/index.js` — pure parse/format helpers; no core references at all.

## Node.js core baseline (targeted reads only; no tree scans)

1. `git log -1` in `$NODEJS_SOURCE` -> d44625a4b80c672215b469906ce583ce7eeeebaf (2026-10-31).
2. `ls lib/_http_incoming.js lib/_http_common.js lib/internal/http/` — both legacy shims and new internal/http layout present.
3. `head -40 lib/_http_incoming.js` — re-exports IncomingMessage from `internal/http/incoming` (:33).
4. `rg -n "method" lib/internal/http/incoming.js` + `sed -n '85,105p'` — constructor: `this.method = null;` at :96, own data property, "request (server) only" comment.
5. `rg -n "\.method\s*=|parserOnHeadersComplete" lib/internal/http/common.js` + `sed -n '105,125p'` — `parserOnHeadersComplete` declared :77; server branch assigns `incoming.method = allMethods[method];` at :118; `rg -n "allMethods"` -> from `internalBinding('http_parser')` at :31.
6. `rg -n "METHODS" lib/http.js` — :264 `METHODS: methods.toSorted()` (fresh sorted array exported once).
7. `rg -n -A 12 "### \`message.method\`" doc/api/http.md` — :2977-2987: "Only valid for request obtained from http.Server. The request method as a string. Read only." Also read message.url heading (:3170-3176) for context.
8. `rg -n "_parsedUrl|originalMethod|originalUrl" lib/internal/http/*.js lib/_http_incoming.js lib/_http_common.js` — NEGATIVE (exit 1): these are library conventions, not core properties.
9. `git log -n 3 -S 'The request method as a string. Read only' -- doc/api/http.md` — wording carried through 0800c0aa727 "doc: git mv to .md" (2016-04-20): long-standing contract.

## Reproduction

- `node repro-method-override.js "$PACKAGE_ROOT"` (script beside report; Node v24.19.0):
  before middleware: method=POST, own descriptor {value:'POST', writable:true, enumerable:true, configurable:true}, prototype has no `method` accessor;
  after middleware (X-HTTP-Method-Override: DELETE): method=DELETE, originalMethod=POST, same descriptor shape, instanceof http.IncomingMessage = true.

## Upstream corroboration (read-only)

- `gh search issues --repo expressjs/method-override "req.method" --limit 5` — #8 "Why make the way to override method exclusive?" (closed), #7 "Possible Bug: Can't get override to recognize" (closed). Usage questions; nothing contradicting the mechanism.
- README.md (`rg -n -i "req\.method|originalMethod" README.md`) — :28-36 documents overriding `req.method` "as if it has originally been that value", original stored in `req.originalMethod`.
- HISTORY.md head — 3.0.0 (2018-07-11) pinned debug@3.1.0; no behavior change to the override mechanism.
