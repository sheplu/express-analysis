# Audit progress — expressjs org (umbrella issue #57)

Protocol per library: clone default branch -> two blind audits (pass-a, pass-b) -> reconcile -> final report.

| # | Package | Issue | State | Verdict |
|---|---------|-------|-------|---------|
| 1 | express | #1 | **complete** (v5.3.0 @ 1c6f1b0; passes A/B converged, 0 disagreements) | confirmed patching — instance/application overrides only (per-request setPrototypeOf on req/res; transitive depd transient Error.prepareStackTrace swap) |
| 2 | cors | #2 | **complete** (v2.8.6 @ 5317ebe; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (no core module imported; only documented res API usage) |
| 3 | express-generator | #3 | **complete** (v4.16.1 @ a1f3841; passes A/B converged, 0 disagreements) | confirmed patching — 1 transitive patch: ejs@2.6.2 writes require.extensions['.ejs'] (shared CJS loader registry) at CLI startup |
| 4 | compression | #4 | **complete** (v1.8.2 @ 0f97074; A/B converged, 1 classification divergence adjudicated) | confirmed patching — instance overrides only: res.write/end/on shadows (index.js:101/115/142), on-headers res.writeHead wrap; destroy@1.2.0 legacy zlib-internal writes unreachable on Node ≥ 10.15.1 |
| 5 | body-parser | #5 | **complete** (v2.4.0 @ 151a0d9; A/B converged, 0 disagreements) | confirmed patching — 1 transitive transient finding: depd swaps Error.prepareStackTrace/stackTraceLimit at require time (restored synchronously); own code clean |
| 6 | basic-auth-connect | #6 | **complete** (v1.1.0 @ 856183e; A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (expando req metadata + documented res API only; note: deprecated `new Buffer()` usage at index.js:79) |
| 7 | multer | #7 | **complete** (v2.5.0 @ 2c380d0; A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (note: busboy calls undocumented Buffer.prototype *Slice methods — private-API usage to track) |
| 8 | serve-favicon | #8 | **complete** (v2.5.1 @ 1d9a8e7; A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (parseurl req._parsedUrl = library cache key; safe-buffer = pure re-export) |
| 9 | response-time | #9 | **complete** (v2.3.4 @ 3bd2651; A/B converged, 0 disagreements) | confirmed patching — 2 transitive: on-headers res.writeHead instance wrapper (per response); depd transient Error.prepareStackTrace swap (at require) |
| 10 | morgan | #10 | **complete** (v1.12.1 @ b1272e7; A/B converged, 0 disagreements) | confirmed patching — 2 transitive: on-headers res.writeHead instance wrapper; depd transient Error swap (×2 at require). Dormant on-finished assignSocket wrap tracked (would awaken if core socket init became undefined) |
| 11 | cookie-parser | #11 | **complete** (v1.4.7 @ 1f2a3a2; A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (additive req.cookies/signedCookies/secret metadata; pure deps) |
| 12 | express-session | #12 | **complete** (v1.19.0 @ 8947e16; A/B converged, 0 disagreements) | confirmed patching — direct res.end instance wrap (index.js:269) + on-headers writeHead wrap + depd transient Error swap; direct use of core-private res._implicitHeader/_header |
| 13 | cookie-session | #13 | **complete** (v2.1.1 @ 75f53bb; A/B converged, 1 count discrepancy resolved) | confirmed patching — 2 transitive: on-headers res.writeHead instance wrapper (index.js:114); depd transient Error swap ×2 at require (via cookies@0.9.1) |
| 14 | errorhandler | #14 | **complete** (v1.5.2 @ 1922d04; A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (documented res API; one private-API READ of res._header noted) |
| 15 | method-override | #15 | **complete** (v3.0.0 @ 4df570e; A/B converged incl. identical judgment rationale) | confirmed patching — 1 direct instance override: req.method rewrite (index.js:75) of a core-assigned, documented-read-only property |
| 16 | connect-timeout | #16 | **complete** (v1.9.1 @ 7377def; A/B converged, 1 classification divergence adjudicated) | confirmed patching — 2 transitive active (on-headers writeHead wrapper; depd@1.1.2 transient Error swap ×3 cycles at require) + dormant on-finished@2.3.0 assignSocket wrap (legacy-gated) |
| 17 | vhost | #17 | **complete** (v3.0.2 @ f41a9ec; A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero requires, zero deps; only req.vhost metadata) |
| 18 | serve-index | #18 | **complete** (v1.9.2 @ fc0c0ab; A/B converged on depd, 1 divergence adjudicated) | confirmed patching — 1 transitive transient: depd@1.1.2 Error swap ×3 at require (via http-errors@1.8.1); debug DEBUG_FD path adjudicated to supporting context |
| 19 | serve-static | #19 | **complete** (v2.2.1 @ 6e3606f; A/B converged, 0 disagreements) | confirmed patching — 1 transitive transient: depd Error swap at require (via send→http-errors); cleanest large tree (no method wrapping, no private core access) |

**All 19 investigations complete.** See [README.md](README.md) for the index of verdicts.
