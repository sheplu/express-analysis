# Monkeypatch Audit: Transitive Dependencies

## Overview

This report covers all transitive dependencies of Express's direct dependencies that were NOT already audited in individual reports (00–12). Each was scanned with automated grep patterns and manually verified.

## Methodology

1. Ran `npm ls --all` to identify the full dependency tree
2. Excluded packages already covered in reports 00–12
3. Grep-scanned remaining packages for monkeypatch patterns
4. Manually verified all hits

## Results

### Already Covered in Individual Reports

| Package | Covered In |
|---------|------------|
| `path-to-regexp@8.4.2` | `02-router.md` |
| `is-promise@4.0.0` | `02-router.md` |
| `raw-body@3.0.2` | `03-body-parser.md` |
| `iconv-lite@0.7.3` | `03-body-parser.md` |
| `bytes@3.1.2` | `03-body-parser.md` |
| `unpipe@1.0.0` | `03-body-parser.md` |
| `ee-first@1.1.1` | `05-on-finished.md` |
| `setprototypeof@1.2.0` | `10-http-errors.md` |
| `inherits@2.0.4` | `10-http-errors.md` |
| `toidentifier@1.0.1` | `10-http-errors.md` |
| `wrappy@1.0.2` | `11-once.md` |

### Newly Scanned — All Clean (0 Findings)

| Package | Version | Files | Grep Hits | Verdict |
|---------|---------|-------|-----------|---------|
| `negotiator` | 1.1.0 | 6 | 1 | **Clean** — `.prototype.` hits are own-class definitions (`Negotiator.prototype.charset`, etc.) |
| `ms` | 2.1.3 | 1 | 0 | **Clean** — pure string-to-milliseconds converter |
| `bytes` | 3.1.2 | 1 | 0 | **Clean** — pure byte string parser |
| `safer-buffer` | 2.1.2 | 3 | 0 | **Clean** — Buffer polyfill, no prototype modification |
| `unpipe` | 1.0.0 | 1 | 0 | **Clean** — calls `stream.unpipe()` standard API |
| `mime-db` | 1.54.0 | 1 | 0 | **Clean** — JSON database of MIME types |
| `forwarded` | 0.2.0 | 1 | 0 | **1 finding** — uses deprecated `req.connection` fallback (DEP0066) |
| `ipaddr.js` | 1.9.1 | 3 | 2 | **Clean** — `.prototype.` hits are own-class definitions (`IPv4.prototype.kind`, `IPv6.prototype.toString`, etc.) |
| `media-typer` | 1.1.1 | 1 | 0 | **Clean** — pure media type parser |
| `es-define-property` | 1.0.1 | 1 | 1 | **Clean** — exports `Object.defineProperty` reference, does not call it on foreign objects |
| `side-channel` | 1.1.1 | 1 | 0 | **Clean** — factory for side-channel storage |
| `es-errors` | 1.3.0 | 7 | 0 | **Clean** — exports Error constructors |
| `object-inspect` | 1.13.4 | 7 | 1 | **Clean** — reads `.prototype.forEach` etc. for feature detection, does not modify them |
| `side-channel-list` | 1.0.1 | 1 | 0 | **Clean** — linked list implementation |
| `side-channel-map` | 1.0.1 | 1 | 1 | **Clean** — `callBound('Map.prototype.get')` binds methods safely without modifying Map |
| `call-bound` | 1.0.4 | 1 | 1 | **Clean** — utility to safely bind prototype methods, does not modify them |
| `get-intrinsic` | 1.3.0 | 1 | 1 | **Clean** — caches references to built-in methods (`%Function.prototype.call%`), no modification |
| `call-bind-apply-helpers` | 1.0.2 | 6 | 2 | **Clean** — exports `Function.prototype.apply` and `.call` references, does not modify them |
| `es-object-atoms` | 1.1.2 | 4 | 0 | **Clean** — exports Object constructor reference |
| `function-bind` | 1.1.2 | 2 | 2 | **Clean** — polyfill exports `Function.prototype.bind`, references `Object.prototype.toString` for type checking only |
| `get-proto` | 1.0.1 | 3 | 0 | **Clean** — exports `Object.getPrototypeOf` reference |
| `dunder-proto` | 1.0.1 | 2 | 2 | **Clean** — utility for `__proto__` access; uses `Object.getOwnPropertyDescriptor(Object.prototype, '__proto__')` for feature detection, does not modify any prototypes |
| `gopd` | 1.2.0 | 2 | 0 | **Clean** — exports `Object.getOwnPropertyDescriptor` reference |
| `has-symbols` | 1.1.0 | 2 | 1 | **Clean** — `Object.prototype.toString.call(sym)` and `Object.prototype.propertyIsEnumerable.call()` for Symbol feature detection only |
| `hasown` | 2.0.4 | 1 | 1 | **Clean** — binds `Object.prototype.hasOwnProperty` for safe usage, does not modify it |
| `math-intrinsics` | 1.1.0 | 15 | 0 | **Clean** — exports Math method references |
| `side-channel-weakmap` | 1.0.2 | 1 | 1 | **Clean** — `callBound('WeakMap.prototype.get')` binds methods safely without modifying WeakMap |

## Findings in Transitive Dependencies

### forwarded@0.2.0 (transitive dependency of proxy-addr)

#### Finding 1: Deprecated `req.connection` usage
- **Category**: G (Deprecated API Access)
- **File**: `node_modules/forwarded/index.js`
- **Line(s)**: 52
- **Code**:
  ```js
  function getSocketAddr (req) {
    return req.socket
      ? req.socket.remoteAddress
      : req.connection.remoteAddress
  }
  ```
- **What it does**: Falls back to `req.connection.remoteAddress` when `req.socket` is not available. `req.connection` is deprecated (DEP0066) — the modern equivalent is `req.socket`.
- **Object affected**: `http.IncomingMessage` instance (`req`)
- **Deprecation**: DEP0066 — `message.connection` deprecated since Node.js v13.0.0
- **Modern replacement**: Use `req.socket.remoteAddress` exclusively (the `req.socket` check is already the primary path)
- **Severity**: Low — this is a fallback path that is rarely hit on modern Node.js

## Summary

- **27 transitive packages scanned** (beyond those already in individual reports)
- **1 finding** (deprecated API usage in `forwarded`)
- All other grep hits were verified as false positives: own-class prototype definitions, safe method binding, or feature detection reads
- The `qs` sub-dependency tree (`side-channel`, `get-intrinsic`, `call-bound`, etc.) is notably careful — it accesses built-in prototypes through safe binding patterns without ever modifying them
