# Pass A - Search Results

## Library
- **Package:** content-disposition v3.0.0
- **Commit:** 1a542fe19e982569c5fb0162b3a1997ad02da1fe
- **Production files searched:** `$PACKAGE_ROOT/src/index.ts` (520 lines)
- **Module type:** ESM (`"type": "module"`)
- **Runtime dependencies:** None

---

## Search 1: Imports / Requires
```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:'
```
**Production hits:** None

---

## Search 2: Globals / Builtins
```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\('
```
**Production hits:** None

---

## Search 3: Prototype / Property Manipulation
```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign'
```
**Production hits:**
- `$PACKAGE_ROOT/src/index.ts:19`: Comment mentioning `__proto__: null` as alternative
- `$PACKAGE_ROOT/src/index.ts:23`: `C.prototype = Object.create(null);`

---

## Search 4: Patching Keywords
```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b'
```
**Production hits:** None

---

## Search 5: Module System Hooks
```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|_extensions|_compile)|syncBuiltinESMExports|registerHooks'
```
**Production hits:** None

---

## Search 6: Internal Bindings
```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|'"'"'_http_|'"'"'internal/'
```
**Production hits:** None
