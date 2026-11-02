# media-typer v2.0.0 -- Pass A Raw Search Results

- **Package**: media-typer v2.0.0
- **Commit**: `102bab110bdbc87c76bc0bd585a5f5e754204b13`
- **Production files scanned**: `$PACKAGE_ROOT/src/index.ts` (95 lines)
- **Exclusions applied**: `test*`, `benchmark*`, dotfiles, nested `node_modules`

---

## Group 1 -- Import / require patterns

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ...
```

**Hits (3):**

| File | Line | Content |
|------|------|---------|
| `$PACKAGE_ROOT/README.md` | 31 | `import * as typer from "media-typer";` |
| `$PACKAGE_ROOT/src/index.bench.ts` | 1 | `import { bench, describe } from "vitest";` |
| `$PACKAGE_ROOT/src/index.bench.ts` | 2 | `import * as typer from "./index.js";` |

**Production file hits: 0** -- All matches are in documentation or benchmark files. `src/index.ts` contains zero import/require statements.

---

## Group 2 -- Node.js globals / builtins

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ...
```

**Hits (2):**

| File | Line | Content |
|------|------|---------|
| `$PACKAGE_ROOT/tsconfig.build.json` | 2 | `"extends": "./tsconfig.json",` |
| `$PACKAGE_ROOT/tsconfig.json` | 2 | `"extends": "@borderless/ts-scripts/configs/tsconfig.json",` |

**Production file hits: 0** -- Matches are the JSON `"extends"` key in TypeScript configuration files, not code.

---

## Group 3 -- Prototype / property manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' ...
```

**Hits: 0** -- No matches anywhere in the repository (excluding test/benchmark).

---

## Group 4 -- Patching keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ...
```

**Hits (16+):**

All matches are in `$PACKAGE_ROOT/package-lock.json`, referring to the `wrap-ansi` and `wrap-ansi-cjs` dev-dependency package names. Examples:

| File | Line | Content |
|------|------|---------|
| `$PACKAGE_ROOT/package-lock.json` | 582 | `"wrap-ansi": "^8.1.0",` |
| `$PACKAGE_ROOT/package-lock.json` | 583 | `"wrap-ansi-cjs": "npm:wrap-ansi@^7.0.0"` |
| ... (14 more lines, all `wrap-ansi` references) | | |

**Production file hits: 0** -- All matches are package name strings in the lockfile for dev dependencies.

---

## Group 5 -- Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' ...
```

**Hits: 0** -- No matches anywhere in the repository (excluding test/benchmark).

---

## Group 6 -- Internal Node.js bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' ...
```

**Hits: 0** -- No matches anywhere in the repository (excluding test/benchmark).

---

## Summary

| Group | Description | Production hits |
|-------|-------------|-----------------|
| 1 | Import/require patterns | 0 |
| 2 | Node.js globals/builtins | 0 |
| 3 | Prototype/property manipulation | 0 |
| 4 | Patching keywords | 0 |
| 5 | Module system hooks | 0 |
| 6 | Internal Node.js bindings | 0 |

**Total production-file hits across all 6 groups: 0**
