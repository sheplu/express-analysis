# Node.js patch audit: method-override

- Verdict: **confirmed patching — 1 direct per-request instance override** (`req.method` rewrite); zero shared core mutations
- Status: complete
- Input: issue sheplu/express-analysis#15 (`method-override`, https://github.com/expressjs/method-override)
- Library: method-override 3.0.0, git master @ `4df570e14dddc88b9464808f4cab3b2a73fc6dc8`, runtime dependencies installed (`--ignore-scripts --omit=dev`): debug@3.1.0, methods, ms, parseurl, vary
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (both passes: POST→DELETE descriptor flip on the live instance; zero shared-state diffs after require + request handling)
- Scope: production/runtime code (`index.js`, 144 lines) plus all five runtime dependencies (9 runtime files, 1,247 lines, all read in full). Tests/docs excluded.
- Coverage: source complete; runtime reproduction done; core doc contract verified
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, identical finding, and — notably — the identical classification rationale reached independently**; sites and the core doc line re-verified during reconciliation.

## Patching verdict

method-override's entire purpose is the finding: it overwrites the core-assigned `method` property on live `http.IncomingMessage` instances. There is nothing else — no shared prototype, global, loader, or core-source mutation anywhere in the tree, and no other core-backed write.

- 1 × **direct instance/application override** (F-001).
- 0 unresolved candidates.

Classification rationale (reached independently by both passes): mechanically, `method` is a plain writable own data property on the instance — but core owns and populates it (constructor init `$NODEJS_SOURCE/lib/internal/http/incoming.js:96`; parser assignment `lib/internal/http/common.js:118`), and Node's API documentation explicitly declares `message.method` **"Read only"** (`doc/api/http.md:2987`). Overwriting it is therefore an instance-level override of core-assigned state, not conventional mutable request state. Had the docs sanctioned mutation, the verdict would read "no confirmed patching" — both passes recorded this counterfactual explicitly.

## Confirmed Node.js patches

### F-001: `req.method` overwrite on the live IncomingMessage (direct)

- Category: instance/application override (core-assigned state)
- Library site(s): `$PACKAGE_ROOT/index.js:75` (`req.method = method.toUpperCase()`); wire value saved at `:61` into library-owned `req.originalMethod`
- Origin: direct
- Core baseline: `method` initialized in the IncomingMessage constructor (`$NODEJS_SOURCE/lib/internal/http/incoming.js:96`) and assigned the wire verb in `parserOnHeadersComplete` (`lib/internal/http/common.js:118`, verbs from `internalBinding('http_parser')`); documented "Read only" (`doc/api/http.md:2987`)
- Exact mutation: value replacement of the own data property (no descriptor change)
- Execution chain: middleware → `get(req, res)` (header getter by default, or user function/query getter) → `supports(method)` guard (`http.METHODS` membership) → write
- Activation: per request when an override value is present and the original method is in the allowed list (default: POST only); production path
- Scope and restoration: per-request, permanent for the request lifetime; no automatic restoration (original only in `req.originalMethod`)
- Resulting behavior: all downstream consumers (express routing, any core-adjacent code reading `req.method`) see the overridden verb — that is the package's documented contract
- Evidence: static + reproduction on Node v24.19.0 (own writable data property confirmed; POST→DELETE flip observed; prototypes/constructors/`http.METHODS` unchanged)

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (11 entries), `pass-b/candidates.md` (12 entries); 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| C-001 | `index.js:75` `req.method =` | confirmed → F-001 | core-assigned state overwrite |
| R-01 | `index.js:61` `req.originalMethod` | rejected | library-owned metadata addition |
| R-02 | parseurl `req._parsedUrl`/`_parsedOriginalUrl` | rejected | library cache keys; latter also unreachable here |
| R-03 | vary `res.getHeader`/`setHeader('Vary')` | rejected | documented API calls |
| R-04 | methods package | rejected | non-mutating read of `http.METHODS` (core exports a copy, `lib/http.js:264`) |
| R-05 | debug@3.1.0 load-time `process.env.DEBUG` round-trip | rejected | documented-mutable env state, value-preserving; never re-enabled at runtime |
| R-06 | debug browser-only `Function.prototype.apply.call` | rejected | invocation (not a write) in a file never loaded under Node |
| R-07 | loader hooks / bindings / prototype / global sweeps | negative | zero hits across all 9 runtime files |

## Supporting context

- The overwrite is the package's documented, deliberate feature (README) — that affects risk framing, not classification.
- `supports()` guards writes to verbs core recognizes, so the written value always belongs to `http.METHODS`.

**Node.js-change risk summary:** (a) if Node.js ever enforced its documented read-only contract (accessor or frozen instances), method-override breaks outright — this package is the canonical ecosystem blocker for such a change; (b) any core code that caches the method early (e.g. routing hints, strict parsers) would diverge from what downstream sees after the override.

Reconciliation note: passes A and B fully blind; identical verdict, finding, line numbers, and classification rationale (both independently cited `doc/api/http.md` "Read only" and recorded the same downgrade counterfactual). Zero disagreements. Orchestrator re-verified `index.js:58-78` and the doc line.

Limitations: reproduction exercised the default header-getter path (query/function getter paths verified statically — same write site); debug's browser entry excluded; baseline is main (classification independent of ref).
