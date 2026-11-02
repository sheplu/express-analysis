# on-headers -- Audit Methodology and Reconciliation

**Library:** on-headers v1.1.0  
**Commit:** `691b687710ece2eef62e6a6d1bdcf3a3fcab932a`  
**Audit date:** 2026-11-01  

## Methodology

A double-blind audit was performed in two independent passes (Pass A and Pass B),
each running the same 6 regex search groups and performing independent source
analysis and Node.js core cross-referencing. The passes were run by separate agent
instances with no access to each other's results. A reconciliation step compared
both passes and produced the final report.

## Scope Establishment

Prior to both passes, scope was established:
- **Package version:** 1.1.0
- **Entrypoint:** `index.js` (declared in `package.json` "files" field)
- **Production files:** 1 (`index.js`, 181 lines)
- **Runtime dependencies:** 0 (only devDependencies in `package.json`)
- **node_modules:** Directory does not exist

## Search Groups Executed

Both passes ran identical regex searches on all production files:

1. **Imports/requires:** `require`, `from`, `import()`, `node:` prefixes
2. **Globals/builtins:** `Buffer`, `process`, `globalThis`, `global`, `extends`, `inherits`
3. **Prototype/property manipulation:** `.prototype`, `__proto__`, `setPrototypeOf`, `defineProperty`, `Object.assign`
4. **Patch keywords:** `monkeypatch`, `patch`, `wrap`, `shim`, `polyfill`, `override`
5. **Module system hooks:** `require.cache`, `require.extensions`, `Module._*`
6. **Internal bindings:** `process.binding`, `internalBinding`, `_http_`, `internal/`

## Reconciliation

### Agreement

Both passes **fully agreed** on:

1. **Single confirmed finding (F-001):** Per-instance `res.writeHead` override at `index.js:71`
2. **Core baseline location:** `$NODEJS_SOURCE/lib/internal/http/server.js:423-523`
3. **Execution chain:** `onHeaders()` -> `createWriteHead()` -> own-property assignment -> wrapper intercepts `writeHead()` calls -> fires listener -> delegates to original
4. **Scope:** Per-instance only, prototype never modified
5. **Activation:** On first `res.writeHead()` call per wrapper, guarded by `fired` boolean
6. **Non-findings:** No prototype mutations, no globals, no module hooks, no internal bindings
7. **Feature detection at line 19:** Read-only, not a patch
8. **Zero runtime dependencies**

### Minor Differences (Complementary, Not Conflicting)

| Aspect | Pass A | Pass B | Resolution |
|---|---|---|---|
| Candidate count | 2 candidates (C-001 confirmed, C-002 dismissed) | 3 candidates (C-001 confirmed, C-002 and C-003 dismissed) | Pass B additionally catalogued `require('http')` as a candidate before dismissing it. Both agree it is not a patch. Final report includes both dismissed candidates for completeness. |
| Restorability | Noted original retained in `prevWriteHead` closure | Additionally noted `delete res.writeHead` as manual restore mechanism | Complementary. Final report includes both observations. |
| Header forwarding | Noted "header pre-processing duplication" | More specific: "headers stripped from forwarded args (lines 140-145)" | Pass B's description is more precise. Final report uses the detailed description. |
| Stacking order | "outermost-first" | "last-registered listener fires first" | Same observation, different phrasing. Both correct. Final report uses both phrasings. |

### Disagreements

**None.** Both passes reached identical conclusions through independent analysis.

## Pass Output Files

- Pass A: `$AUDIT_ROOT/pass-a/report.md`, `$AUDIT_ROOT/pass-a/candidates.md`, `$AUDIT_ROOT/pass-a/searches.md`
- Pass B: `$AUDIT_ROOT/pass-b/report.md`, `$AUDIT_ROOT/pass-b/candidates.md`, `$AUDIT_ROOT/pass-b/searches.md`
- Final: `$AUDIT_ROOT/report.md`, `$AUDIT_ROOT/findings.md`, `$AUDIT_ROOT/methodology.md`

## Confidence

**High.** Single production file of 181 lines, zero dependencies, fully deterministic
analysis. Both passes converged on identical findings with zero disagreements.
The library's purpose (intercept header writes) aligns exactly with the single
confirmed patch. No hidden or surprising behavior was found.
