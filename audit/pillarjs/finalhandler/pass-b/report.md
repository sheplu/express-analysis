# Node.js patch audit: finalhandler

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#28 — `finalhandler` (Node.js final http responder, https://github.com/pillarjs/finalhandler); pass B of a two-pass blind audit
- Library: finalhandler 2.1.1, git `master` @ `1e0227c67128dfcd0a7725c81beb4af3405a3419` (clean checkout); runtime deps installed via `npm install --ignore-scripts --omit=dev`: debug@4.4.3, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, ms@2.1.3, on-finished@2.4.2, parseurl@1.3.3, statuses@2.0.2
- Node.js baseline: `$NODEJS_SOURCE` main @ `d44625a4b80c672215b469906ce583ce7eeeebaf` (read-only)
- Reproduction runtime: Node v24.19.0 (`node repro/repro.js "$PACKAGE_ROOT"`)
- Scope: production/runtime only — `$PACKAGE_ROOT/index.js` (the only shipped file per package.json `files`) and all code reachable from it, plus every resolved runtime dependency's entrypoint/initialization (all eight checked individually). Tests, examples, docs, devDependencies excluded.
- Coverage: source — complete read of all 12 runtime JS files in scope; upstream — spot-checked jshttp/on-finished issues/PRs for the assignSocket branch; runtime — full before/after snapshot + exercised 404, 500-with-headers, and error-after-headers-sent paths on a real `http.createServer`.

## Patching verdict

No patching of Node.js core was demonstrated anywhere in the inspected runtime
scope, direct or transitive.

- Shared core mutations (prototypes, globals, module loading, core source): **0**.
  All six candidate pattern groups and follow-up traces found no write to any
  core prototype, core module export, global, `require` machinery, or binding.
- Instance/application overrides: **0 reachable**. The single mechanism in the
  tree that *would* override a core-backed instance method — on-finished's
  `patchAssignSocket` (transitive, node.js 0.8 legacy) — is statically dead on
  every Node version the package supports (`engines >= 18`) and on the audited
  baseline, and was runtime-verified never to fire (C-001).
- Unresolved candidates: **0**. Rejected candidates: **14** (C-001…C-014).

Runtime reproduction corroborates the static result: zero identity or
descriptor changes across `http.{OutgoingMessage,ServerResponse,IncomingMessage}.prototype`,
`net.Socket.prototype` (incl. `destroy`), `events.EventEmitter.prototype`,
`Object/Array/String/Function.prototype` key sets, `Object.assign`,
`Module._load`, `Module._resolveFilename`, `require.extensions`,
`require.cache` builtin entries, `process.binding`, global keys, and
`Error.prepareStackTrace`/`Error.stackTraceLimit` (accessor-trapped during
require: zero writes) — before require vs. after require vs. after exercising
all representative paths.

## Confirmed Node.js patches

None. No reachable write or replacement of core APIs, globals, shared
prototypes, core-backed instances, core module loading, or core source was
found. The dormant on-finished branch below is deliberately *not* promoted to a
finding because it is unreachable in the inspected scope; see C-001 and
supporting context.

## Candidate ledger and unresolved questions

Full ledger with evidence: [candidates.md](candidates.md). Summary:

| ID | Site and core target | Status | Reason (abridged) |
| --- | --- | --- | --- |
| C-001 | on-finished `index.js:188-199` — instance write `res.assignSocket = wrapper` over core `ServerResponse.prototype.assignSocket` (`$NODEJS_SOURCE lib/internal/http/server.js:312`) | rejected as reachable patch (dormant legacy override) | Guard `msg.socket === undefined` (`index.js:128`) is always false on modern Node: `IncomingMessage` ctor sets `this.socket = socket` (`lib/internal/http/incoming.js:77`); `OutgoingMessage` ctor sets `this[kSocket] = null` behind a prototype accessor (`lib/internal/http/outgoing.js:187,303-315`); core only ever sets `.socket` to a socket or `null` (`lib/internal/http/server.js:211,318,327`). finalhandler also only calls `onFinished(req, …)` where `req.socket` is set. Runtime: no own `assignSocket` appeared on req/res in any scenario. |
| C-002 | on-finished `index.js:147` `msg.__onFinished` expando | rejected | Library-owned listener queue added to the instance; `__onFinished` absent from core (`lib/internal/http/incoming.js`: zero hits); shadows nothing. |
| C-003 | parseurl `index.js:54,84` `req._parsedUrl` / `req._parsedOriginalUrl` expandos | rejected | Library-owned memoization keys; absent from core; classified independently as cache metadata, not behavior replacement. |
| C-004 | debug `src/common.js:287` + `src/node.js:203-211` import-time `process.env.DEBUG` write/delete | rejected | Documented mutable env surface, idempotent at import (writes back the loaded value or deletes an unset/empty var); not an API replacement. Runtime-verified unchanged. |
| C-005 | debug `src/common.js:122` `Object.defineProperty(debug,'enabled',…)` | rejected | Define on library-created function, not core. |
| C-006 | debug `src/node.js:18` `util.deprecate(() => {}, …)` | rejected | Wraps library's own no-op; call into core, no write. |
| C-007 | finalhandler `index.js:120-122` `req.socket.destroy()` | rejected | Documented method call on the live socket; `net.Socket.prototype.destroy` identity unchanged (runtime-verified while the path fired, client saw ECONNRESET). |
| C-008 | finalhandler `index.js:250-281` `res.statusCode/statusMessage` writes, `removeHeader`/`setHeader`/`end` | rejected | Documented per-response instance API; v2.1.1 removes only Content-Encoding/-Language/-Range (no full `getHeaderNames()` sweep in this version). |
| C-009 | finalhandler `index.js:290-294` `req.unpipe()`, `onFinished(req, write)`, `req.resume()` | rejected | Documented Readable stream API calls. |
| C-010 | on-finished `index.js:126` + ee-first `index.js:43,62` listener attach/remove | rejected | Ordinary EventEmitter usage; `EventEmitter.prototype` unchanged. |
| C-011 | parseurl `index.js:15-17,128-139` legacy `url.parse` / `new Url()` field population | rejected | Instantiates legacy core class and populates the library-owned instance; deprecated-API usage, not mutation. |
| C-012 | statuses `index.js:96,109` `Object.prototype.hasOwnProperty.call` | rejected | Read-only borrow; statuses is pure data otherwise. |
| C-013 | on-finished `index.js:206-212,220-235` `AsyncResource` wrap | rejected | Documented async_hooks usage binding the library's own callback. |
| C-014 | debug `src/browser.js` (shipped, conditionally loaded) | rejected | Not loaded under Node (`src/index.js:6-9`); touches browser globals only. |

encodeurl, escape-html, and ms contain no core interaction at all (pure string/
number functions over module-local regexes/constants); each entrypoint was read
in full before exclusion.

## Supporting context

- **Dormant 0.8 compatibility override (C-001).** on-finished@2.4.2 retains
  `patchAssignSocket` (`node_modules/on-finished/index.js:188-199`), which — on
  Node 0.8 only — would shadow `assignSocket` on an individual `ServerResponse`
  with a wrapper that calls the saved original then notifies the listener
  (`res.on('socket')` was broken there, per the code comment). It is marked
  `istanbul ignore: node.js 0.8 patch` and is unreachable behind
  `msg.socket === undefined` on the audited baseline and on all Node versions
  satisfying finalhandler's `engines: >= 18`. If it ever fired it would be a
  transient per-instance override (original preserved and still called), not a
  shared prototype mutation.
- **Library-owned expandos on core-backed instances (C-002, C-003).** After the
  404 path, `req` gains `_parsedUrl` (parseurl cache) and `__onFinished`
  (on-finished queue); after the 500 path, only `__onFinished`; after the
  error-after-headers path, neither (early return destroys the socket before
  `send()`). Runtime diff against a control request confirmed these are the
  only additions and that neither shadows any prototype-chain member. This is
  request metadata, not a core patch.
- **Private/underscore property reads:** on-finished reads documented
  `writableEnded`/`complete`/`readable`; parseurl uses runtime-deprecated
  `url.parse`/`url.Url`. Reads and deprecated-API usage, not mutations.
- **debug import-time behavior:** env scan + `tty.isatty(process.stderr.fd)`
  are read-only; the only write surface is `process.env.DEBUG` via the public
  enable/disable API (idempotent at import), see C-004.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime files (12) | six skill pattern groups + follow-ups, `rg -n --no-ignore` (see [searches.md](searches.md)) | G5/G6 zero hits; G1–G4 hits all traced; no core write found |
| `$NODEJS_SOURCE lib/internal/http/incoming.js` | `grep this.socket / _parsedUrl / __onFinished` | `:77` ctor sets socket; expandos absent from core |
| `$NODEJS_SOURCE lib/internal/http/outgoing.js` | `grep kSocket / get socket` | `:187` `this[kSocket] = null`; `:303-315` prototype `socket` accessor → never `undefined` |
| `$NODEJS_SOURCE lib/internal/http/server.js` | `grep assignSocket / .socket =` | `:312` core `assignSocket` baseline; `.socket` set only to socket or `null` (`:211,:318,:327`) |
| `$NODEJS_SOURCE lib/_http_{incoming,outgoing,server}.js` | read | DEP0199 shims re-exporting `lib/internal/http/*`; re-exports followed |
| Runtime reproduction | `node repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | zero core identity/descriptor/global/env diffs before/after require and after exercising 404, 500-with-headers (content headers removed, err.headers applied), and error-after-headersSent (socket destroyed, ECONNRESET); no `Error.prepareStackTrace`/`stackTraceLimit` writes trapped during require; results in [repro/results.json](repro/results.json) |
| Upstream (on-finished) | `gh search issues --repo jshttp/on-finished "assignSocket"` → https://github.com/jshttp/on-finished/issues/10 (closed) | historical socket-event context for the 0.8 branch; no open/merged change altering the analysis |
| Upstream pins | https://github.com/pillarjs/finalhandler/blob/1e0227c67128dfcd0a7725c81beb4af3405a3419/index.js ; https://github.com/jshttp/on-finished/blob/v2.4.2/index.js ; https://github.com/pillarjs/parseurl/blob/1.3.3/index.js ; https://github.com/debug-js/debug/blob/4.4.3/src/node.js | public source matching audited files |
| Dependency provenance (npm lockfile integrity) | debug@4.4.3 `sha512-RGwwWnwQvkVfavKVt22FGLw+…`; ee-first@1.1.1 `sha512-WMwm9LhRUo+WUaRN+vRuETqG…`; encodeurl@2.0.1 `sha512-Ev/hIyePLZtpL98x562lvPte…`; escape-html@1.0.3 `sha512-NiSupZ4OeuGwr68lGIeym/ks…`; ms@2.1.3 `sha512-6FlzubTLZG3J2a/NVCAleEhj…`; on-finished@2.4.2 `sha512-ATWUv387i+nLD49EiDoOft5s…`; parseurl@1.3.3 `sha512-CiyeOxFT/JZyN5m0z9PfXw4S…`; statuses@2.0.2 `sha512-DvEy55V3DB7uknRo+4iOGT5f…` | installed tree matches npm-published artifacts |
| Runtime file hashes (sha256, relative to `$PACKAGE_ROOT`) | `index.js 99f43394…`; `node_modules/on-finished/index.js ecd342e4…`; `node_modules/parseurl/index.js 811223d4…`; `node_modules/debug/src/node.js d7b26d7c…`; `node_modules/debug/src/common.js dbe83d2b…`; `node_modules/debug/src/index.js aa127ff1…`; `node_modules/ee-first/index.js 29d3cccd…`; `node_modules/encodeurl/index.js c5fcd7f1…`; `node_modules/escape-html/index.js 42a7f918…`; `node_modules/ms/index.js e5f0b6a9…`; `node_modules/statuses/index.js 96a0698e…`; `node_modules/statuses/codes.json d2daa083…` | audited-content fingerprints |

## Coverage and limitations

- Entry points covered: `$PACKAGE_ROOT/index.js` (sole shipped file) and the
  resolved entrypoints of all eight runtime deps, each read in full before
  exclusion. Conditional entrypoints covered: debug's browser.js branch (not
  loaded under Node, scanned anyway); debug's optional `supports-color` require
  (not installed in this tree → catch path; if installed it only *reads*
  terminal capabilities); on-finished's optional `async_hooks` require.
- No install scripts: tree installed with `--ignore-scripts`; none of the nine
  packages declare install/postinstall hooks in the lockfile-resolved versions.
- Node baseline is `main` (`d44625a4b80`), newer than any released line; the
  `socket`-never-`undefined` argument for C-001 also holds for all `>= 18`
  release lines (the `OutgoingMessage` ctor null-init and `IncomingMessage`
  ctor assignment long predate them), but per-release-line source diffing was
  not performed. Node 0.8, where C-001 would activate, is outside the package's
  supported engine range and outside this audit's runtime scope.
- Reproduction ran on Node v24.19.0 only, over HTTP/1.1 paths (404; 500 with
  pre-set content headers and `err.headers`; error after `headersSent` with
  socket destruction). Untested branches: HEAD-request short-circuit, HTTP/2
  compat (`req.httpVersionMajor >= 2` skips `statusMessage`), custom
  `opts.onerror`, and non-core (mock) req/res objects — all read statically;
  none contains additional writes. A tested branch cannot prove universal
  absence, but every code path in scope was read.
- What would change the verdict: evidence that `msg.socket === undefined` is
  reachable with a core-backed object on a supported Node (would make C-001 a
  confirmed transient instance override), or a different resolved dependency
  tree (e.g. a hijacked package name) — this audit binds to the integrity
  hashes above.

## Changes since the previous audit

First audit (pass B, blind; no prior report read or updated per protocol).
