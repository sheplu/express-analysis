# Node.js patch audit: basic-auth-connect

- Verdict: **no confirmed patching in the inspected scope**
- Status: complete
- Input: issue sheplu/express-analysis#6 (`basic-auth-connect`, https://github.com/expressjs/basic-auth-connect)
- Library: basic-auth-connect 1.1.0, git master @ `856183e95f7bea8579c4ee07f225b2e3edb8b8b8`, sole runtime dependency `tsscmp@1.0.6` installed (`--ignore-scripts --omit=dev`)
- Node.js baseline: main @ `d44625a4b80` (`$NODEJS_SOURCE`)
- Reproduction runtime: Node v24.19.0 (pass A: 17 identity/descriptor/key-set snapshots across require + 12 middleware invocations — all unchanged)
- Scope: production/runtime code (`index.js`, 136 lines; `tsscmp/lib/index.js`, 38 lines) — both read line-by-line in full by both passes. test.js/Makefile/docs excluded.
- Coverage: source complete; runtime reproduction done (pass A); upstream corroborated
- Protocol: two full independent blind audits (`pass-a/`, `pass-b/`) reconciled by the orchestrator; **identical verdict, consistent ledgers, zero disagreements**; key sites re-verified directly during reconciliation.

## Patching verdict

basic-auth-connect does not patch or monkeypatch Node.js core, directly or via tsscmp. Every interaction with core is a documented call or an in-contract instance write:

- `req.user = req.remoteUser = user` (`index.js:94,100`) — library-owned expando metadata; core `IncomingMessage` (`$NODEJS_SOURCE/lib/internal/http/incoming.js:62-106`) defines neither name, so nothing is shadowed.
- `res.statusCode = 401` (`index.js:118`) — documented writable instance property (core prototype default `200` at `lib/internal/http/server.js:285` exists specifically to be instance-shadowed).
- `res.setHeader` / `res.end` (`index.js:119-120`) — calls only (`outgoing.js:813`, `:1289` intact).
- `new Buffer(parts[1], 'base64')` (`index.js:79`) — deprecated constructor **call** (DEP0005, delegates to `Buffer.from`), not a mutation of `Buffer` or its prototype.
- tsscmp — `crypto.timingSafeEqual` feature-detect + call (`lib/index.js:17-18`); pre-v6.6.0 fallback is a local loop never assigned onto the crypto module; `crypto.pseudoRandomBytes` (DEP0115 alias) and `createHmac` are plain invocations (`:31-33`).

0 confirmed patches; 0 unresolved candidates.

## Confirmed Node.js patches

None.

## Candidate ledger and unresolved questions

Full per-pass ledgers: `pass-a/candidates.md` (10 entries), `pass-b/candidates.md` (13 entries) — same substance, all rejected, 0 unresolved.

| ID | Site and core target | Status | Reason |
| --- | --- | --- | --- |
| R-01 | `index.js:94,100` `req.user`/`req.remoteUser` | rejected | expando metadata; no such core properties |
| R-02 | `index.js:118` `res.statusCode = 401` | rejected | documented instance assignment |
| R-03 | `index.js:119-120` `setHeader`/`end` | rejected | calls only |
| R-04 | `index.js:79` `new Buffer(...)` | rejected | deprecated constructor call (DEP0005); no Buffer mutation |
| R-05 | `index.js:134` `http.STATUS_CODES[code]` | rejected | read-only |
| R-06 | `index.js:135` `err.status` | rejected | library-created Error object |
| R-07 | `tsscmp/lib/index.js:17-25` timingSafeEqual feature-detect | rejected | read + call; fallback loop local, no polyfill installed on crypto |
| R-08 | `tsscmp/lib/index.js:31-33` pseudoRandomBytes/createHmac | rejected | plain invocations |
| R-09 | all mutation sweeps (prototype/defineProperty/`__proto__`, patch vocabulary, loader interception, bindings) | negative | zero hits in both packages |

## Supporting context

- tsscmp was added (commit `bac1e6a`) to fix CVE-2024-47178 / GHSA-7p89-p6hx-q4fw (timing attack, fixed in 1.1.0) — a security fix that *uses* core crypto, not a patch of it.
- `new Buffer(...)` (DEP0005) is deprecated-API usage worth a modernization PR, but not patching; it would break only if Node removes the constructor alias (currently delegates to `Buffer.from`, `$NODEJS_SOURCE/lib/buffer.js:320`).
- Open unmerged PR expressjs/basic-auth-connect#10 (2.0.0 proposal) would drop tsscmp; not in audited source.
- No install/lifecycle scripts in either package; dependency pinned by lockfile with integrity hash.

Reconciliation note: passes A and B fully blind; identical verdict; ledgers match in substance (10 vs 13 entries — B itemized a few reads separately). Zero disagreements. Orchestrator re-read `index.js:76-136` and `tsscmp/lib/index.js:14-35` — all claims match.

Limitations: tsscmp's pre-v6.6.0 fallback branch analyzed statically (cannot execute on Node ≥ 6.6.0; loop-only code, cannot patch core); reproduction used mock req/res while snapshotting real core modules; Node baseline is main (HTTP under `lib/internal/http/`; legacy `_http_*.js` verified as re-export shims).
