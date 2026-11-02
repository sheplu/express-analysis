# Audit progress — jshttp org (umbrella issue #59)

Protocol per library: clone default branch -> two blind audits (pass-a, pass-b) -> reconcile -> final report.

| # | Package | Issue | State | Verdict |
|---|---------|-------|-------|---------|
| 1 | fresh | #35 | **complete** (v2.0.0 @ ee73673; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, pure JS function, no core interaction) |
| 2 | forwarded | #54 | **complete** (v0.2.0 @ b3097d8; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, pure parsing function, no core interaction) |
| 3 | content-type | #55 | **complete** (v3.1.1 @ 5d8c14e; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, self-contained parser, local-only prototype usage) |
| 4 | methods | #37 | **complete** (v1.1.2 @ f89e491; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (read-only http.METHODS access, no core writes) |
| 5 | range-parser | #36 | **complete** (v1.2.1 @ f4bf173; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, pure string parser, no core interaction) |
| 6 | media-typer | #49 | **complete** (v2.0.0 @ 102bab1; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, pure ESM TypeScript, no core interaction) |
| 7 | basic-auth | #38 | **complete** (v3.0.0 @ 301fe41; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (Buffer.from read-only usage, zero deps, no core writes) |
| 8 | etag | #50 | **complete** (v1.8.1 @ 5df2cfd; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (read-only crypto/fs.Stats/Buffer usage, zero deps) |
| 9 | vary | #48 | **complete** (v1.1.2 @ 1220b9c; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, pure string manipulation, duck-typed res usage) |
| 10 | statuses | #44 | **complete** (v2.0.2 @ 770a97d; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (pure data-lookup, zero core imports, zero deps) |
| 11 | mime-db | #51 | **complete** (v1.54.0 @ ba120a7; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (pure data package, single-line re-export of JSON) |
| 12 | compressible | #39 | **complete** (v2.0.18 @ 9a7ea07; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (pure data lookup via mime-db, no core interaction) |
| 13 | cookie | #34 | **complete** (v2.0.1 @ 51c4854; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (self-contained ESM, zero imports, defensive NullObject only) |
| 14 | negotiator | #33 | **complete** (v1.1.0 @ 14b0a7b; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (pure parser, content-type dep also clean, no core imports) |
| 15 | mime-types | #45 | **complete** (v3.0.2 @ 3a1187e; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (read-only path.extname import, mime-db dep clean, pure data lookup) |
| 16 | on-headers | #47 | **complete** (v1.1.0 @ 691b687; passes A/B converged, 0 disagreements) | confirmed patching — per-instance res.writeHead override via createWriteHead() wrapper (F-001) |
| 17 | on-finished | #40 | **complete** (v2.4.2 @ 9a73f9c; passes A/B converged, 1 minor disagreement adjudicated) | confirmed patching — F-001: per-instance res.assignSocket override (dormant on modern Node, Node 0.8 only); F-002: msg.__onFinished expando (active, not overriding core property) |
| 18 | http-assert | #41 | **complete** (v1.5.0 @ 3ae22e1; passes A/B converged, 0 disagreements) | confirmed patching — 2 transitive transient findings via depd: Error.prepareStackTrace + Error.stackTraceLimit swaps (restored synchronously); own code clean |
| 19 | accepts | #42 | **complete** (v2.0.0 @ 19db02a; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (all deps clean: negotiator, mime-types, mime-db, content-type) |
| 20 | type-is | #43 | **complete** (v3.0.0 @ 74fc347; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (ESM, sole dep content-type clean, zero core imports) |
| 21 | proxy-addr | #46 | **complete** (v2.0.8 @ a11ad82; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (forwarded + ipaddr.js deps clean, own-constructor prototype writes only) |
| 22 | http-errors | #52 | **complete** (v2.0.1 @ 814207e; passes A/B converged, 0 disagreements) | confirmed patching — 1 transitive transient finding via depd@2.0.0: Error.prepareStackTrace + Error.stackTraceLimit swaps (restored synchronously); own code clean |
| 23 | content-disposition | #53 | **complete** (v3.0.0 @ 1a542fe; passes A/B converged, 0 disagreements) | no confirmed patching in the inspected scope (zero imports, self-contained ESM, pure string processing) |

## Summary

**All 23 jshttp libraries audited.** Each received a double-blind audit (two independent passes + reconciliation).

### Aggregate results

| Category | Count | Libraries |
|----------|-------|-----------|
| **No confirmed patching** | 19 | fresh, forwarded, content-type, methods, range-parser, media-typer, basic-auth, etag, vary, statuses, mime-db, compressible, cookie, negotiator, mime-types, accepts, type-is, proxy-addr, content-disposition |
| **Confirmed patching (direct)** | 2 | on-headers (per-instance res.writeHead wrapper), on-finished (dormant res.assignSocket + active msg.__onFinished expando) |
| **Confirmed patching (transitive via depd)** | 2 | http-errors, http-assert (both: transient Error.prepareStackTrace + Error.stackTraceLimit swaps, restored synchronously) |

### Key findings

1. **on-headers** — wraps `res.writeHead` per-instance with a listener-invoking closure. Active on every call. Per-instance only (prototype untouched).
2. **on-finished** — contains dormant `patchAssignSocket` (unreachable on modern Node.js, Node 0.8 only) + active `msg.__onFinished` expando property.
3. **http-errors** and **http-assert** — both inherit transient `Error.prepareStackTrace`/`Error.stackTraceLimit` swaps from their `depd` dependency. Swaps are restored synchronously within the same function call. Own code is clean.
4. **19 libraries are fully clean** — no core module patching of any kind, direct or transitive.

### Common patterns observed across clean libraries
- 13 of 19 clean libraries have **zero runtime dependencies**
- 10 of 19 clean libraries have **zero imports** of any kind (completely self-contained)
- Several use defensive `NullObject` patterns (`C.prototype = Object.create(null)`) for prototype-pollution protection — these are NOT patches
- Libraries that import core modules (`http`, `crypto`, `path`, `fs`) use them read-only
