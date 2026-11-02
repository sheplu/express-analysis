# Recap — pillarjs org monkeypatch investigations (umbrella issue #58)

12 packages audited, one by one, against the question: **does the library (or its resolved runtime dependencies) patch/monkeypatch Node.js core?**
Protocol per package: clone default branch → two fully independent blind audit passes → orchestrator reconciliation → final report. Node.js baseline: main @ `d44625a4b80`. Production/runtime code only (tests out of scope). Verdict consistency verified across report/findings/pass-a/pass-b/STATUS for all 12 (0 mismatches).

## At a glance

| Package | Issue | Version @ ref | Verdict |
|---|---|---|---|
| hbs | #20 | 4.4.0 @ `c07c01e` | 🔴 **confirmed patching** |
| cookies | #21 | 0.9.2 @ `6e35de1` | 🔴 **confirmed patching** |
| iconv-lite | #22 | 1.0.0-alpha.3 @ `8601be4` | 🟢 clean |
| send | #23 | 1.2.1 @ `092f3fc` | 🔴 **confirmed patching** |
| path-to-regexp | #24 | 9.0.0 @ `32292b9` | 🟢 clean |
| multiparty | #25 | 4.3.1 @ `dcec0ec` | 🔴 **confirmed patching** |
| parseurl | #26 | 1.3.3 @ `97cab2f` | 🟢 clean |
| resolve-path | #27 | 1.4.0 @ `4b98ecf` | 🔴 **confirmed patching** |
| finalhandler | #28 | 2.1.1 @ `1e0227c` | 🟢 clean |
| csrf | #29 | 3.1.0 @ `33536b8` | 🟢 clean |
| router | #30 | 2.2.0 @ `098ea78` | 🔴 **confirmed patching** |
| encodeurl | #31 | 3.0.0 @ `6545e6a` | 🟢 clean |

**Total: 6 confirmed patching / 6 clean.** "Clean" = *no confirmed patching in the inspected scope*.

## Confirmed patching — what exactly, and how bad

| Package | Patch(es) | Origin | Persistence |
|---|---|---|---|
| **hbs** | handlebars writes `require.extensions['.handlebars'/'.hbs']` → permanent process-wide mutation of the shared CJS loader table (`Module._extensions`), fired by a plain `require('hbs')`. Secondary: legacy `globalThis` polyfill (transient `Object.prototype` getter) — inert on Node ≥ 12 | transitive (handlebars@4.7.10) | **permanent** (loader table) |
| **cookies** | depd `getStack()` swaps `Error.prepareStackTrace` + `Error.stackTraceLimit`, restores synchronously; fires at require + per deprecation log | transitive (depd@2.0.0) | transient |
| **send** | same depd swap | transitive (http-errors@2.0.1 → depd@2.0.0) | transient |
| **multiparty** | same depd swap | transitive (http-errors@2.0.0 → depd@2.0.0) | transient |
| **resolve-path** | **old depd@1.1.2**: getStack swap (fires 2× at import) **plus** a second swap site in its compat module (`stackTraceLimit` clamped to 2) — 3 swap/restore windows per require. Also runs an `eval`-built wrapper at import: `require('resolve-path')` **fails under `--disallow-code-generation-from-strings` / `--frozen-intrinsics`** | transitive (http-errors@1.6.3 → depd@1.1.2) | transient (eval issue = load-time hard failure under hardening flags) |
| **router** | (1) depd swap as a **direct** dependency — fires 2× at `require('router')` (lib/param.js + lib/layer.js); (2) rewrites the **core-assigned `req.url`** on live requests during mounted dispatch — restored on `next()`, left trimmed if a handler terminates the response | direct (depd@2.0.0; own dispatch code) | transient |

In all six cases the **library's own code is clean of shared-core mutations** except router's `req.url` rewrite; the dominant vector is depd.

## Clean packages — one-line basis

| Package | Why clean |
|---|---|
| **iconv-lite** | zero deps; single `node:stream` import for documented Transform subclassing; historical `extendNodeEncodings()` Buffer/stream patch confirmed removed since 0.6.0, no remnant |
| **path-to-regexp** | runtime code contains **no import of any kind** — structurally cannot reach core; returns plain unaugmented RegExps (expandos gone since 2.0.0) |
| **parseurl** | `req._parsedUrl`/`_parsedOriginalUrl` are library-owned cache expandos shadowing nothing in core; legacy `Url` fast path builds fresh instances, never touches `Url.prototype` |
| **finalhandler** | depd-free tree; documented req/res teardown API only; on-finished's dormant `patchAssignSocket` triple-contained |
| **csrf** | pure crypto consumer; the `crypto.pseudoRandomBytes` descriptor flip was proven (control run) to be Node core's own DEP0115 lazy-alias mechanism, not a library write |
| **encodeurl** | 37-line zero-import module; `encodeURI`/`String.prototype` calls only; dist↔src↔registry verified byte-for-byte |

## Top Node.js-compatibility exposures to track (across the 12)

1. **depd's `Error.prepareStackTrace`/`stackTraceLimit` swap** — behind 5 of the 6 confirmed verdicts (cookies, send, multiparty, router, resolve-path). If Node froze the property, made it an accessor, or changed callsite-array semantics, all five break **at import time**. Known interference with `--enable-source-maps` (depd#36/#39). One upstream depd fix would clear the whole family.
2. **`require.extensions` deprecation (hbs/handlebars)** — the only *permanent* patch in the set relies on a Stability-0 API; removal/freezing of `Module._extensions` aliasing breaks `.hbs`/`.handlebars` compile-on-require.
3. **`req.url` writability (router)** — Express 5 mounted routing depends on `IncomingMessage#url` remaining a plain writable own data property that core never re-reads post-dispatch. Arguably the most load-bearing core-contract assumption in the stack.
4. **Old depd 1.x line (resolve-path via http-errors ~1.6.3)** — import-time `eval` makes the package incompatible with runtime hardening flags; bumping to http-errors ≥ 2 removes both the extra swap site and the eval.
5. **`crypto.pseudoRandomBytes` removal (csrf via tsscmp)** — clean verdict, but token `verify()` calls the DEP0115 alias on every invocation; alias removal breaks csrf at call time.
6. **on-finished `patchAssignSocket` dormancy (send, finalhandler)** — reactivates only if core ever leaves `msg.socket === undefined` on live messages; zero current effect, worth a core-side regression guard.
7. **Private-internals reads** — multiparty reads `req._readableState`/`req._decoder` (corruption guard silently disabled if ReadableState fields are renamed); parseurl consumes the runtime-deprecated legacy `url.parse`/`Url` (DEP0169).

## Artifact map

Each package folder contains: `report.md` (verdict-first, skill template), `findings.md` (files/lines/issues + Node-change risk), `methodology.md` (protocol + reconciliation outcome), `pass-a/` and `pass-b/` (blind-pass reports, candidate ledgers, search logs, repro scripts/results). Progress table: `STATUS.md`. All artifacts use `$PACKAGE_ROOT`/`$NODEJS_SOURCE` aliases; verified free of machine paths.
