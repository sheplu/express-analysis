# Express.js Monkeypatch Audit — Complete Report Index

**Issue**: [expressjs/express#7502](https://github.com/expressjs/express/issues/7502)
**Date**: 2026-10-03
**Express Version**: 5.2.1
**Node.js Source**: cross-referenced against `node/lib/_http_incoming.js`, `_http_server.js`, `_http_outgoing.js`

---

## Executive Summary

**95 monkeypatch findings** across Express core and 27 direct dependencies (+ their transitive deps).

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 2 | Per-request `Object.setPrototypeOf` on live `req`/`res` objects |
| **High** | 6 | Prototype chain construction, global prototype pollution (latent), descriptor copying |
| **Medium** | 66 | Methods/getters added to Node.js prototype chains, instance property injection, process.env mutation |
| **Low** | 15 | Redundant overwrites, internal prototype chains, dead code, wrapping utilities, deprecated API usage |
| **Informational** | 6 | Private property reads, own-object modifications, undocumented flag reads |

### Key Finding

Express's architecture relies on **2 `Object.setPrototypeOf` calls per request** (application.js lines 169–170) to transform plain Node.js `IncomingMessage`/`ServerResponse` instances into Express-enhanced `req`/`res` objects. This is the fundamental monkeypatch that enables all of Express's API — `req.query`, `req.ip`, `res.send()`, `res.json()`, etc. — and it has performance implications (V8 deoptimizes objects after prototype chain changes).

---

## Findings by Package

| # | Report | Package | Risk | Findings | Critical | High | Medium | Low | Info |
|---|--------|---------|------|----------|----------|------|--------|-----|------|
| 00 | [Express Core](00-express-core.md) | `express@5.2.1` | **CORE** | 58 | 2 | 4 | 46 | 6 | 0 |
| 01 | [merge-descriptors](01-merge-descriptors.md) | `merge-descriptors@2.0.0` | HIGH | 1 | 0 | 1 | 0 | 0 | 0 |
| 02 | [router](02-router.md) | `router@2.2.0` | MEDIUM | 9 | 0 | 0 | 8 | 1 | 0 |
| 03 | [body-parser](03-body-parser.md) | `body-parser@2.3.0` | MEDIUM | 3 | 0 | 0 | 3 | 0 | 0 |
| 04 | [parseurl](04-parseurl.md) | `parseurl@1.3.3` | MEDIUM | 3 | 0 | 0 | 2 | 1 | 0 |
| 05 | [on-finished](05-on-finished.md) | `on-finished@2.4.1` | MEDIUM | 4 | 0 | 0 | 2 | 1 | 1 |
| 06 | [finalhandler](06-finalhandler.md) | `finalhandler@2.1.1` | LOW | 0 | 0 | 0 | 0 | 0 | 0 |
| 07 | [send](07-send.md) | `send@1.2.1` | LOW | 0 | 0 | 0 | 0 | 0 | 0 |
| 08 | [serve-static](08-serve-static.md) | `serve-static@2.2.1` | LOW | 0 | 0 | 0 | 0 | 0 | 0 |
| 09 | [depd](09-depd.md) | `depd@2.0.0` | LOW | 7 | 0 | 0 | 2 | 3 | 2 |
| 10 | [http-errors](10-http-errors.md) | `http-errors@2.0.1` | LOW | 5 | 0 | 0 | 1 | 1 | 3 |
| 11 | [once](11-once.md) | `once@1.4.0` | LOW | 2 | 0 | 1* | 0 | 1 | 0 |
| — | [debug (in Pure Utilities)](12-pure-utilities.md) | `debug@4.4.3` | LOW | 2 | 0 | 0 | 2 | 0 | 0 |
| 12 | [Pure Utilities](12-pure-utilities.md) | 16 packages | NONE | 0 | 0 | 0 | 0 | 0 | 0 |
| 99 | [Transitive Deps](99-transitive-dependencies.md) | 27 packages | — | 1 | 0 | 0 | 0 | 1 | 0 |

\* `once.proto` is High severity but **latent** — Express never calls it. It exports `Function.prototype.once` pollution that would activate only if user code calls `require('once').proto`.

---

## Findings by Category

| Category | Name | Count | Primary Packages |
|----------|------|-------|-----------------|
| **A** | Prototype Chain Manipulation | 8 | Express core (6), router (1), http-errors (1) |
| **B** | Prototype Extension | 39 | Express core (7 methods + 12 getters on req, 20 methods on res) |
| **C** | Instance Property Injection | 32 | Express core (5), router (8), body-parser (3), parseurl (3), on-finished (2), depd (3), debug (2), http-errors (1), wrappy (1), and more |
| **D** | Property Descriptor Copying | 2 | Express core → merge-descriptors |
| **E** | Global Prototype Pollution | 1 | once (latent) |
| **F** | Method Wrapping / Interception | 1 | on-finished (legacy, dead code on modern Node.js) |
| **G** | Private Property Access / Deprecated API | 7 | on-finished, http-errors, depd, forwarded |

---

## The Monkeypatch Chain — How It Works

```
1. Module load time (request.js / response.js):
   req = Object.create(http.IncomingMessage.prototype)  ← Cat B: 19 methods/getters added
   res = Object.create(http.ServerResponse.prototype)    ← Cat B: 20 methods added

2. App creation (express.js):
   mixin(app, EventEmitter.prototype)   ← Cat D: descriptor copy
   mixin(app, applicationProto)         ← Cat D: descriptor copy
   app.request = Object.create(req, {app: ...})   ← adds `app` reference
   app.response = Object.create(res, {app: ...})  ← adds `app` reference

3. Every incoming request (application.js handle()):
   Object.setPrototypeOf(req, this.request)  ← Cat A: CRITICAL — rewrites prototype chain
   Object.setPrototypeOf(res, this.response) ← Cat A: CRITICAL — rewrites prototype chain
   req.res = res                              ← Cat C: instance injection
   res.req = req                              ← Cat C: instance injection (redundant w/ Node.js)
   res.locals = Object.create(null)           ← Cat C: instance injection

4. Middleware (router, body-parser, parseurl):
   req.params = {...}          ← Cat C: router
   req.route = route           ← Cat C: router
   req.baseUrl = mountpath     ← Cat C: router
   req.body = parsed           ← Cat C: body-parser
   req._parsedUrl = cached     ← Cat C: parseurl
```

---

## v6 Recommendations

### Critical — Must Address

1. **Eliminate per-request `Object.setPrototypeOf`**: This is the single most impactful monkeypatch. V8 deoptimizes objects whose prototype chain is changed after construction. Consider:
   - Using a wrapper/decorator pattern instead of prototype swapping
   - Creating custom `IncomingMessage`/`ServerResponse` subclasses passed to `http.createServer`
   - Using composition (attach an Express context object) rather than prototype injection

2. **Remove `req.res` / `res.req` cross-references**: These create circular references on every request. `res.req` is redundant with Node.js's own `ServerResponse.req` (set at `_http_server.js:224`).

### High — Should Address

3. **Replace `merge-descriptors` mixin pattern**: The `app` object blends `EventEmitter.prototype` and application methods onto a plain function via descriptor copying. Consider making the app a proper class that extends `EventEmitter`.

4. **Audit `once.proto`**: While Express doesn't call it, the exported `once.proto` function pollutes `Function.prototype`. Consider replacing `once` with a simpler implementation or using native alternatives.

### Medium — Consider Addressing

5. **Reduce instance property injection**: Properties like `req.params`, `req.body`, `req.baseUrl`, `req._parsedUrl` are injected by various middleware. Consider a dedicated request context object (`req.ctx` or similar) to namespace Express-specific data.

6. **Formalize the req/res extension API**: Instead of ad-hoc property injection by middleware, provide a documented, typed API for extending request/response objects.

---

## Supporting Documents

- [Methodology](methodology.md) — Categories A–G, audit process, triple-check verification
- [Node.js IncomingMessage Map](cross-reference/node-incoming-message.md) — Complete prototype map from Node.js source
- [Node.js ServerResponse Map](cross-reference/node-server-response.md) — Complete prototype map from Node.js source

---

## Verification

- All 95 findings triple-checked: automated pattern match → manual code reading → call-chain tracing
- Second pass verified 0 false positives across all existing findings, and discovered 10 additional findings
- 16 pure-utility packages confirmed clean (debug reclassified from NONE to LOW with 2 process.env findings)
- 27 transitive dependencies scanned; 1 finding in `forwarded` (deprecated `req.connection` usage)
- All other grep hits in transitive deps verified as false positives (own-prototype definitions, safe method binding, feature detection)
- Nothing committed or pushed — all output in `audit-reports/`
