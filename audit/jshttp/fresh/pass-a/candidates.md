# Candidate ledger -- fresh Pass A

## Candidates

No candidates were generated. All six regex search groups returned zero hits in production code (`index.js`).

The only tangential finding was:

### C-001: Date.parse defensive guard (index.js:93-99)

- **Location:** `$PACKAGE_ROOT/index.js`, lines 93-99, function `parseHttpDate`
- **Pattern:** Calls `Date.parse(date)` and checks `typeof timestamp === 'number'`
- **Comment in code:** `// istanbul ignore next: guard against date.js Date.parse patching`
- **Status:** REJECTED
- **Reason:** This code *consumes* `Date.parse` as a standard API call. It does not write to, replace, or modify `Date.parse` or any other global/prototype. The `typeof` guard is a defensive read that accommodates the possibility that a *different* library has patched `Date.parse`. This is normal API usage, not monkeypatching.

## Ledger summary

| ID    | Site and core target                  | Status   | Evidence/reason                                              |
|-------|---------------------------------------|----------|--------------------------------------------------------------|
| C-001 | `Date.parse` call in `parseHttpDate`  | REJECTED | Read-only call; defensive guard against external patching, not a mutation |
