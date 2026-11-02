# range-parser v1.2.1 — Detailed Findings

**Library:** range-parser
**Version:** 1.2.1
**Commit:** f4bf1736f28a3e574430408c18779cf7fbaf3770
**Date:** 2026-11-01

---

## Findings

No findings. Zero confirmed patches (F-001, F-002, etc.) to report.

---

## Search Results Summary

All 6 regex search groups were executed against all non-test, non-benchmark files in `$PACKAGE_ROOT/`.

### Group 1: require/import/from/node: patterns
- **Production hits:** 0
- **Non-production hits:** README.md (doc example), package-lock.json (dev dep metadata)

### Group 2: Buffer/process/globalThis/global/extends/inherits
- **Production hits:** 0
- **Non-production hits:** 0

### Group 3: prototype/defineProperty/Object.assign
- **Production hits:** 0
- **Non-production hits:** package-lock.json (dev dep package names containing "prototype")

### Group 4: monkeypatch/patch/wrap/shim/polyfill/override
- **Production hits:** 0
- **Non-production hits:** package-lock.json (dev dep names: wrap-ansi, spawn-wrap, es-shim-unscopables, word-wrap)

### Group 5: require.cache/Module loader hooks
- **Production hits:** 0
- **Non-production hits:** 0

### Group 6: process.binding/internalBinding/internal modules
- **Production hits:** 0
- **Non-production hits:** 0

---

## Code Structure Analysis

`$PACKAGE_ROOT/index.js` exports a single function `rangeParser(size, str, options)` that:

1. Validates the `str` argument is a string
2. Finds the `=` separator in the Range header
3. Splits the range specifications on `,`
4. Parses each range's start/end positions using `parsePos()` (regex digit test + Number())
5. Handles suffix ranges (e.g., `-500`) and open-ended ranges (e.g., `500-`)
6. Optionally combines overlapping/adjacent ranges via `combineRanges()`

Internal helpers (all pure functions, no side effects):
- `parsePos(str)` — converts digit string to number or NaN
- `combineRanges(ranges)` — merges overlapping ranges
- `mapWithIndex(range, index)` — adds index property for sorting
- `mapWithoutIndex(range)` — strips index property after sorting
- `sortByRangeIndex(a, b)` — comparator by original index
- `sortByRangeStart(a, b)` — comparator by start position

No side effects. No global state. No closures over external state. No interaction with Node.js runtime internals.

---

## Dependency Analysis

- **Runtime dependencies:** 0
- **Dev dependencies:** 10 (eslint ecosystem + mocha + nyc for testing)
- **node_modules present:** No
- **Transitive runtime risk:** None
