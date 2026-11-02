# mime-db Audit — Detailed Findings

## Package Under Audit

- **Name:** mime-db
- **Version:** 1.54.0
- **Commit:** ba120a7f71bc8ab7d5299e88c0049063239029a7
- **Repository:** jshttp/mime-db

## Production File Inventory

The `package.json` `"files"` field declares exactly two shipped files:

| File       | Lines | Type        | Description                                      |
|------------|-------|-------------|--------------------------------------------------|
| `$PACKAGE_ROOT/index.js` | 12 | JavaScript | Single `module.exports = require('./db.json')` |
| `$PACKAGE_ROOT/db.json`  | 9,613 | Static JSON | MIME type database (type names to metadata)  |

### index.js (complete)

```js
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module exports.
 */

module.exports = require('./db.json')
```

### db.json (structure sample)

```json
{
  "application/json": {
    "charset": "UTF-8",
    "compressible": true,
    "extensions": ["json", "map"],
    "source": "iana"
  }
}
```

Pure key-value data. No executable content.

## Search Results — All 6 Groups

### Group 1: require/import/from/node:

**Production hits:** 1
- `$PACKAGE_ROOT/index.js:12` — `module.exports = require('./db.json')`

**Analysis:** Standard CommonJS require loading a local JSON data file. Does not load any Node.js core module.

### Group 2: Buffer/process/globalThis/global/extends/inherits

**Production hits:** 6 (all in db.json)
- `$PACKAGE_ROOT/db.json:5973` — `"application/vnd.stardivision.writer-global"`
- `$PACKAGE_ROOT/db.json:6025` — `"application/vnd.sun.xml.writer.global"`
- `$PACKAGE_ROOT/db.json:8429` — `"message/global"`
- `$PACKAGE_ROOT/db.json:8433` — `"message/global-delivery-status"`
- `$PACKAGE_ROOT/db.json:8437` — `"message/global-disposition-notification"`
- `$PACKAGE_ROOT/db.json:8441` — `"message/global-headers"`

**Analysis:** All matches are IANA-registered MIME type names as JSON keys. Not code.

### Group 3: prototype/defineProperty/Object.assign

**Production hits:** 0

### Group 4: patch/wrap/shim/polyfill/override

**Production hits:** 8 (all in db.json)
- `$PACKAGE_ROOT/db.json:478` — `"application/dash-patch+xml"`
- `$PACKAGE_ROOT/db.json:937` — `"application/json-patch+json"`
- `$PACKAGE_ROOT/db.json:941` — `"application/json-patch-query+json"`
- `$PACKAGE_ROOT/db.json:1149` — `"application/merge-patch+json"`
- `$PACKAGE_ROOT/db.json:1378` — `"application/patch-ops-error+xml"`
- `$PACKAGE_ROOT/db.json:7220` — `"application/xml-patch+xml"`
- `$PACKAGE_ROOT/db.json:7272` — `"application/yang-patch+json"`
- `$PACKAGE_ROOT/db.json:7276` — `"application/yang-patch+xml"`

**Analysis:** All matches are MIME type names containing "patch" as a data format descriptor. Static data.

### Group 5: require.cache/Module hooks

**Production hits:** 0

### Group 6: process.binding/internalBinding

**Production hits:** 0

## Confirmed Findings

**None.** Zero confirmed patches or monkeypatches of Node.js core.

## Structural Assessment

mime-db is architecturally incapable of patching Node.js core:

1. Its only executable statement loads a local JSON file
2. JSON files cannot contain executable code
3. The loaded data is exported directly without transformation
4. No Node.js core modules are imported
5. No functions are defined anywhere in production code
6. No runtime dependencies exist that could introduce patches transitively
