# Audit Report: vary v1.1.2

## Verdict: CLEAN

The `vary` library does **not** patch, monkeypatch, or modify any Node.js core
module, prototype, global, or runtime behavior.

## Package Identity

| Field       | Value                                      |
|-------------|--------------------------------------------|
| Name        | vary                                       |
| Version     | 1.1.2                                      |
| Commit      | `1220b9c487f9538a6dd509ef11b6a5042d85bd05` |
| License     | MIT                                        |
| Runtime deps| **0** (none)                               |
| Prod files  | 1 (`$PACKAGE_ROOT/index.js`, 150 lines)    |

## Confirmed Patches

**None.**

## Candidate Ledger

No candidates were generated. All six regex search groups returned zero matches
against the sole production file.

## Summary

`vary` is a pure-JavaScript string-manipulation utility that helps manage the
HTTP `Vary` response header. It exports two functions:

- **`vary(res, field)`** -- reads the current `Vary` header from a
  caller-provided response object via `res.getHeader('Vary')`, appends new
  field names, and writes the result back via `res.setHeader('Vary', val)`.
  This is standard instance-method invocation on a passed object (duck-typed),
  not monkeypatching.

- **`append(header, field)`** -- a pure function that takes a header string and
  field name(s), returns a new string with the field appended. No side effects.

The library contains:
- No `require()` or `import` calls (zero core module imports)
- No access to `process`, `Buffer`, `global`, or `globalThis`
- No prototype modifications or `Object.defineProperty` usage
- No module-loader hooks (`require.cache`, `Module._load`, etc.)
- No internal binding access (`process.binding`, `internalBinding`)
- No shims, polyfills, or wrapping of built-in functions

## Audit Methodology

Double-blind audit with two independent passes (A and B), both reaching
identical CLEAN verdicts with zero candidates. See `methodology.md` for
reconciliation details.

## Prior Intelligence Confirmation

The prior cors-audit finding (vary v1.1.2 = CLEAN, duck-typed getHeader/setHeader
on passed response instance, no core module imported) is **confirmed** to match
the current upstream HEAD, which is the same version (v1.1.2, same commit).
