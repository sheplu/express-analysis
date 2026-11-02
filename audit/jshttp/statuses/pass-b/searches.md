# Pass B — Raw Search Results

**Library:** statuses v2.0.2
**Commit:** 770a97d931c1bb40ebbfefdbb77f0419601890b5
**Production files searched:** `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/codes.json`
**Runtime dependencies:** None

## Search Group 1: require/import/from

**Hits:**
- `$PACKAGE_ROOT/index.js:15`: `var codes = require('./codes.json')`

## Search Group 2: Buffer/process/globalThis/global/extends/inherits

**Hits:** None (exit code 1)

## Search Group 3: prototype/defineProperty/Object.assign

**Hits:**
- `$PACKAGE_ROOT/index.js:96`: `if (!Object.prototype.hasOwnProperty.call(status.code, msg)) {`
- `$PACKAGE_ROOT/index.js:109`: `if (!Object.prototype.hasOwnProperty.call(status.message, code)) {`

## Search Group 4: monkeypatch/patch/wrap/shim/polyfill/override

**Hits:** None (exit code 1)

## Search Group 5: Module system hooks

**Hits:** None (exit code 1)

## Search Group 6: Internal bindings

**Hits:** None (exit code 1)
