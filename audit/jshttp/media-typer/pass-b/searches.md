# media-typer v2.0.0 -- Pass B Raw Search Results

- **Package**: media-typer v2.0.0
- **Commit**: `102bab110bdbc87c76bc0bd585a5f5e754204b13`
- **Production files scanned**: `$PACKAGE_ROOT/src/index.ts` (95 lines; sole production file)
- **Exclusions**: test*, benchmark*, dotfiles, nested node_modules

---

## Group 1: Import/require patterns

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' ...
```

**Hits (all outside production scope):**

| File | Line | Content | In scope? |
|------|------|---------|-----------|
| `$PACKAGE_ROOT/src/index.bench.ts` | 1 | `import { bench, describe } from "vitest";` | No (benchmark) |
| `$PACKAGE_ROOT/src/index.bench.ts` | 2 | `import * as typer from "./index.js";` | No (benchmark) |
| `$PACKAGE_ROOT/src/index.spec.ts` | 1 | `import { describe, expect, it } from "vitest";` | No (test) |
| `$PACKAGE_ROOT/src/index.spec.ts` | 2 | `import * as typer from "./index.js";` | No (test) |
| `$PACKAGE_ROOT/README.md` | 31 | `import * as typer from "media-typer";` | No (docs) |

**Production file hits: 0**

---

## Group 2: Node.js globals/builtins

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' ...
```

**Hits (all outside production scope):**

| File | Line | Content | In scope? |
|------|------|---------|-----------|
| `$PACKAGE_ROOT/tsconfig.json` | 2 | `"extends": "@borderless/ts-scripts/configs/tsconfig.json",` | No (config JSON) |
| `$PACKAGE_ROOT/tsconfig.build.json` | 2 | `"extends": "./tsconfig.json",` | No (config JSON) |

**Production file hits: 0**

---

## Group 3: Prototype/property manipulation

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' ...
```

**No matches.** (exit code 1)

---

## Group 4: Patching keywords

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' ...
```

**Hits (all outside production scope):**

| File | Line | Content | In scope? |
|------|------|---------|-----------|
| `$PACKAGE_ROOT/package-lock.json` | multiple | References to `wrap-ansi` package name | No (lockfile) |

**Production file hits: 0**

---

## Group 5: Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks' ...
```

**No matches.** (exit code 1)

---

## Group 6: Internal Node.js bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' ...
```

**No matches.** (exit code 1)

---

## Summary

Across all six search groups, **zero hits were found in the production source file** (`$PACKAGE_ROOT/src/index.ts`). All matches came from test files, benchmark files, config files, documentation, or the lockfile -- none of which are production code.
