# Node.js patch audit: finalhandler

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#28 (`finalhandler`, https://github.com/pillarjs/finalhandler)
- Library: finalhandler 2.1.1, git master @ `1e0227c67128dfcd0a7725c81beb4af3405a3419`, cloned repository with runtime dependencies installed (`--ignore-scripts --omit=dev`): debug@4.4.3, ee-first@1.1.1, encodeurl@2.0.1, escape-html@1.0.3, ms@2.1.3, on-finished@2.4.2, parseurl@1.3.3, statuses@2.0.2 — **no depd/http-errors in this tree**
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes; real `http.createServer` — control, 404 via `done()`, 500 via `done(err)` with pre-set content headers + `err.headers`, error after `headersSent`)
- Scope: production/runtime code — `index.js` plus all 8 resolved runtime dependencies' runtime files. Tests, examples, docs, devDependencies, browser-field files excluded.
- Coverage: source complete; runtime reproduction done (both passes); upstream provenance for the dormant on-finished branch (jshttp/on-finished@`2792e5da14`, fixes jshttp/on-finished#10)
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **both passes reached the identical verdict**; 0 disagreements; key sites re-verified directly during reconciliation.

## Patching verdict

finalhandler does **not** patch or monkeypatch Node.js core, directly or through its runtime dependencies. Unlike several sibling pillarjs packages, its dependency tree contains **no depd** — accessor traps during require caught **zero** writes to `Error.prepareStackTrace`/`stackTraceLimit`. All interaction with core objects is documented instance API usage on req/res passed in by the host (`statusCode`/`statusMessage` assignment, `setHeader`/`removeHeader` — v2.1.1 removes exactly three content headers, no `getHeaderNames` sweep — `req.socket.destroy()`, `req.unpipe()`/`resume()`), plus library-owned instance expandos from deps.

The one genuine monkeypatch-shaped code in scope — on-finished's `patchAssignSocket` — was independently assessed by both passes and rejected as unreachable with **triple containment** (see ledger C-01).

0 confirmed patches; 0 unresolved candidates; groups 5 (loader interception) and 6 (bindings/internals) zero-hit across the entire runtime scope.

## Confirmed Node.js patches

None. No candidate survived verification.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (16 entries), `pass-b/candidates.md` (14 entries) — same sites, all rejected, none unresolved. Key entries:

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| C-01 | `on-finished/index.js:189-199` `patchAssignSocket` (own-property wrap shadowing `ServerResponse.prototype.assignSocket`, `$NODEJS_SOURCE/lib/internal/http/server.js:312`) | rejected — dormant | triple containment: (1) finalhandler passes only the **request** to onFinished (`index.js:293`), never the response; (2) guard `msg.socket === undefined` (`on-finished/index.js:128`) unsatisfiable on Node ≥ 18 — IncomingMessage ctor assigns a socket (`incoming.js:77`), OutgoingMessage initializes `kSocket = null` behind a prototype accessor (`outgoing.js:187,303-315`; also verified at v18.0.0 via `git show`); (3) `typeof assignSocket !== 'function'` bails for requests. Runtime-verified never to fire. Node-0.8-era workaround (upstream `2792e5da14`) |
| C-02 | `parseurl/index.js:54,84` `req._parsedUrl`/`_parsedOriginalUrl` | rejected | library-owned cache expandos; zero core-name collisions (`incoming.js` sweep) |
| C-03 | `on-finished/index.js:147` `msg.__onFinished` | rejected | library-owned listener-queue expando |
| C-04 | `debug/src/common.js:287` -> `src/node.js:203-211` import-time `enable(load())` writing `process.env.DEBUG` | rejected | documented mutable env map; value-preserving round-trip (verified unchanged in repro); tty/env access read-only |
| C-05 | `index.js` `res.statusCode`/`statusMessage` writes | rejected | documented writable instance properties (core defaults `$NODEJS_SOURCE/lib/internal/http/server.js:285-286`) |
| C-06 | `index.js:120-122` `req.socket.destroy()`; `:290-294` `req.unpipe()`/`onFinished(req, write)`/`req.resume()` | rejected | documented public API calls on passed instances |
| C-07 | `index.js:257-259` `removeHeader` x3 (+ `setHeader` for CSP/nosniff/err.headers) | rejected | documented header API; explicit three-header clear, no sweep in v2.1.1 |
| C-08 | `debug` `Object.defineProperty` sites | rejected | target its own function objects |
| C-09 | ms/encodeurl/escape-html/statuses/ee-first | rejected | pure computation or library-owned writes; entrypoints individually checked |

## Supporting context

- **on-finished `patchAssignSocket`** remains the ecosystem's canonical dormant instance-override: real wrapping code, kept for Node 0.8 pipelining (`jshttp/on-finished#10`), unreachable on any supported runtime. Reactivation would require Node to leave `msg.socket === undefined` on live messages — worth tracking in core.
- debug's import-time `process.env.DEBUG` round-trip is shared mutable *state* (visible to other env consumers), not an API patch.
- finalhandler v2.1.1's header clearing is three explicit `removeHeader` calls (`Content-Encoding`/`-Language`/`-Range`) — older versions' `getHeaderNames()` iteration no longer exists.

## Sources and verification

| Source or scope | Command/query or upstream link | Result and relevance |
| --- | --- | --- |
| `$PACKAGE_ROOT` runtime tree (9 packages) | skill's six candidate pattern groups + assignment sweep via scoped `rg -n` (logs: `pass-a/searches.md`, `pass-b/searches.md`) | groups 5/6 zero hits everywhere; all other hits ledgered |
| `$NODEJS_SOURCE/lib/internal/http/server.js:285-286,312`; `incoming.js:77`; `outgoing.js:187,303-315`; v18.0.0 `lib/_http_outgoing.js:134` via `git show` | direct reads | C-01 dormancy proof across the supported range; statusCode baseline |
| Reproduction | `node pass-a/repro-patch-check.js "$PACKAGE_ROOT"`; `node pass-b/repro/repro.js "$PACKAGE_ROOT"` (Node v24.19.0) | zero identity/descriptor/key diffs (http/net/stream/events prototypes, `net.Socket.prototype.destroy`, Module._*, require.extensions/cache, process.binding, globals) after import and after real 404/500/headersSent cycles; zero Error-hook writes at require; expandos matched static prediction (`req._parsedUrl` + `__onFinished` on 404; none after headersSent — socket destroyed); header behavior confirmed (3 removed, `X-Keep` retained, `err.headers` applied, CSP/nosniff set); no own `assignSocket` ever appeared |
| Upstream | jshttp/on-finished@`2792e5da14` (fixes jshttp/on-finished#10) | provenance of the dormant branch: Node 0.8 pipelined-request workaround |

## Coverage and limitations

- Node 0.8 activation of `patchAssignSocket` assessed statically only (EOL, outside `engines >= 18`).
- HTTP/1.1 exercised only; HEAD short-circuit, HTTP/2 compat branch, and `opts.onerror` read statically (no additional writes).
- `debug`'s optional `supports-color` not installed (read-only if present); `src/browser.js` unreachable under Node.
- Node baseline is main; C-01 guard argument additionally pinned at v18.0.0.
- Verdict pinned to resolved dep versions (`^` ranges in package.json may drift future resolutions).

## Changes since the previous audit

First audit of finalhandler in this workspace.
