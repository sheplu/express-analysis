# express — findings detail (files, lines, issues)

Library: express 5.3.0 (master @ `1c6f1b0fe4000977b9a7b4f34097e4d527dd9824`)
Verdict: confirmed patching — instance/application overrides only. No shared core mutation.

## Finding F-001 — per-request prototype rewiring of core req/res instances

| File | Line(s) | What happens |
|---|---|---|
| `lib/application.js` | 169–170 | `Object.setPrototypeOf(req, this.request)` / `Object.setPrototypeOf(res, this.response)` on every request — replaces the `[[Prototype]]` of the live core `http.IncomingMessage` / `http.ServerResponse` instances with express's per-app layer objects |
| `lib/application.js` | 233–234 | mounted sub-app completion handler restores the parent app's layers (`orig.request` / `orig.response`) |
| `lib/request.js` | 30 | `var req = Object.create(http.IncomingMessage.prototype)` — express's request layer inherits from the core prototype (core prototype itself never written) |
| `lib/response.js` | 43 | `var res = Object.create(http.ServerResponse.prototype)` — same pattern for the response layer |
| `lib/express.js` | 45–52 | per-app layer objects created with the app as additional prototype link |

**Issue / Node.js-change risk:** express does not use Node's documented `http.createServer({ IncomingMessage, ServerResponse })` extension point; it rewires instance prototypes after creation. Any future Node.js change that (a) caches methods or relies on instance `[[Prototype]]` identity for req/res, (b) freezes those instances, or (c) adds a core prototype method/property whose name collides with an express layer property (currently zero collisions, verified) would interact with this mechanism.

## Finding F-002 — transient `Error.prepareStackTrace` / `Error.stackTraceLimit` swap (depd, transitive)

| File | Line(s) | What happens |
|---|---|---|
| `node_modules/depd/index.js` | 386–387 | `Error.prepareStackTrace = prepareObjectStackTrace; Error.stackTraceLimit = Math.max(10, limit)` — writes two process-wide globals |
| `node_modules/depd/index.js` | 395–396 | synchronous restore of both saved values after `Error.captureStackTrace` |
| `lib/response.js` | 17 | `deprecate` import — reaches depd at `require('express')`; also reached via router and http-errors |

**Issue / Node.js-change risk:** mutation is process-global but restored synchronously in the same tick, so currently unobservable to other code. A V8/Node change that defers or caches `prepareStackTrace` invocation would expose the swap.

## Rejected candidates worth tracking (not patches today)

| File | Line(s) | Why it was flagged | Why rejected |
|---|---|---|---|
| `node_modules/on-finished/index.js` | 189–199 | wraps `res.assignSocket`/`removeSocket` on the instance | Node ≤0.8 branch; guard `msg.socket === undefined` is unreachable — core initializes `socket` to `null` (`$NODEJS_SOURCE/lib/internal/http/outgoing.js:187`) |
| `node_modules/once/once.js` | 5–19 | `Object.defineProperty(Function.prototype, 'once'/'onceStrict')` | only inside `once.proto()`, never invoked anywhere in the runtime tree |
| `node_modules/safer-buffer/*` | — | `process.binding('buffer')` | private API **read** only |
| router / express internals | various | `req.url` rewriting, `req.body`, `req.params`, `req._parsedUrl`, `res.locals`, `msg.__onFinished` | instance metadata / documented API state; nothing core replaced |
| `node_modules/setprototypeof`, `dunder-proto` | — | prototype-manipulation helpers | shims for ancient engines; `dunder-proto/set` never imported |

Module-loading interception (`require.cache`, `Module._load`, `require.extensions`, ESM loader hooks, `syncBuiltinESMExports`): **zero hits** in express and its entire resolved runtime dependency tree.
