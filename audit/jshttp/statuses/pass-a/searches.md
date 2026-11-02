# Pass A — Raw Search Results

**Library:** statuses v2.0.2  
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5  
**Production files:** `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/codes.json`  
**Runtime dependencies:** None

## Search Group 1: require/import/from

```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```

**Production file hits:**
- `$PACKAGE_ROOT/index.js:15`: `var codes = require('./codes.json')`

**Non-production hits (excluded):**
- `README.md:35` — documentation example
- `package-lock.json` — multiple `resolve-from` references (devDependency metadata)

## Search Group 2: Buffer/process/globalThis/global/extends/inherits

```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```

**Production file hits:** None

**Non-production hits (excluded):**
- `package-lock.json` — references to `process-on-spawn` (devDependency metadata)

## Search Group 3: prototype/defineProperty/Object.assign

```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```

**Production file hits:**
- `$PACKAGE_ROOT/index.js:96`: `if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {`
- `$PACKAGE_ROOT/index.js:109`: `if (!Object.prototype.hasOwnProperty.call(status.message, code)) {`

**Non-production hits (excluded):**
- `package-lock.json` — many references to prototype-related npm packages (devDependencies)
- `HISTORY.md:4` — changelog mentioning `String.prototype.slice()`
- `HISTORY.md:9` — changelog mentioning `Object.prototype`

## Search Group 4: monkeypatch/patch/wrap/shim/polyfill/override

```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```

**Production file hits:** None

**Non-production hits (excluded):**
- `package-lock.json` — references to `es-shim-unscopables`, `wrap-ansi`, `spawn-wrap`, `word-wrap` (all devDependency metadata)

## Search Group 5: Module system hooks

```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks'
```

**Production file hits:** None  
**Non-production hits:** None  
**Exit code:** 1 (no matches at all)

## Search Group 6: Internal bindings

```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/'
```

**Production file hits:** None  
**Non-production hits:** None  
**Exit code:** 1 (no matches at all)
