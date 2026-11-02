# vary v1.1.2 — Pass B Candidate Ledger

**Commit:** 1220b9c
**Production file:** `$PACKAGE_ROOT/index.js`
**Date:** 2026-11-01

---

## Candidate Table

| ID | File | Line | Search Group | Pattern Matched | Disposition |
|----|------|------|-------------|-----------------|-------------|
| — | — | — | — | — | — |

**No candidates were generated.** All six regex search groups returned zero hits against the production file.

---

## Notes

The library has zero runtime dependencies and a single production file (`$PACKAGE_ROOT/index.js`). The file:

- Does not `require` or `import` any modules (Node.js core or otherwise).
- Does not reference `Buffer`, `process`, `globalThis`, `global`, or any Node.js globals.
- Does not touch any `.prototype`, `__proto__`, `defineProperty`, `Object.assign`, or `Reflect` APIs.
- Contains no patching, shimming, polyfill, or override keywords.
- Does not interact with the module system (`require.cache`, `require.extensions`, `Module._*`).
- Does not use internal bindings (`process.binding`, `internalBinding`, `_http_*`, `internal/*`).

The only interaction with Node.js core is calling `res.getHeader()` and `res.setHeader()` on a response object passed in by the caller. This is standard API usage, not monkeypatching.
