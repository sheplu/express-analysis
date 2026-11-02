# Pass B: Raw Search Results

**Library:** http-assert v1.5.0 (commit 3ae22e131825155672ddc19dac5c1485cc0f9996)
**Date:** 2026-11-01
**Auditor:** Pass B (independent)

## Search 1: requires/imports
```
rg -n 'require\s*\(|\bfrom\s*['"'"'"]|\bimport\s*\(|\bnode:' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'
```

Production-relevant hits only:
- `index.js:1`: `var createError = require('http-errors')`
- `index.js:2`: `var eql = require('deep-equal')`
- `node_modules/http-errors/index.js:15`: `var deprecate = require('depd')('http-errors')`
- `node_modules/http-errors/index.js:16`: `var setPrototypeOf = require('setprototypeof')`
- `node_modules/http-errors/index.js:17`: `var statuses = require('statuses')`
- `node_modules/http-errors/index.js:18`: `var inherits = require('inherits')`
- `node_modules/http-errors/index.js:19`: `var toIdentifier = require('toidentifier')`
- `node_modules/depd/index.js:11`: `var callSiteToString = require('./lib/compat').callSiteToString`
- `node_modules/depd/index.js:12`: `var eventListenerCount = require('./lib/compat').eventListenerCount`
- `node_modules/depd/index.js:13`: `var relative = require('path').relative`
- `node_modules/depd/lib/compat/index.js:14`: `var EventEmitter = require('events').EventEmitter`
- `node_modules/depd/lib/compat/index.js:42`: `require('./callsite-tostring')`
- `node_modules/depd/lib/compat/index.js:46`: `require('./event-listener-count')`
- `node_modules/statuses/index.js:15`: `var codes = require('./codes.json')`
- `node_modules/deep-equal/index.js:2`: `var objectKeys = require('./lib/keys.js')`
- `node_modules/deep-equal/index.js:3`: `var isArguments = require('./lib/is_arguments.js')`
- `node_modules/inherits/inherits.js:2`: `var util = require('util')`
- `node_modules/inherits/inherits.js:8`: `require('./inherits_browser.js')`

No `node:` prefixed imports. No dynamic `import()`. All standard CJS requires.

## Search 2: globals/builtins
```
rg -n '\bBuffer\b|\bprocess\b|\bglobalThis\b|\bglobal\b|\bextends\b|\binherits\s*\(' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'
```

Production-relevant hits:
- `node_modules/http-errors/index.js:123`: `inherits(HttpError, Error)`
- `node_modules/http-errors/index.js:166`: `inherits(ClientError, HttpError)`
- `node_modules/http-errors/index.js:235`: `inherits(ServerError, HttpError)`
- `node_modules/depd/index.js:25`: `var basePath = process.cwd()`
- `node_modules/depd/index.js:137`: `if (process.noDeprecation)`
- `node_modules/depd/index.js:142`: `var str = process.env.NO_DEPRECATION || ''`
- `node_modules/depd/index.js:154`: `if (process.traceDeprecation)`
- `node_modules/depd/index.js:159`: `var str = process.env.TRACE_DEPRECATION || ''`
- `node_modules/depd/index.js:170`: `eventListenerCount(process, 'deprecation')`
- `node_modules/depd/index.js:235`: `process.emit('deprecation', err)`
- `node_modules/depd/index.js:240`: `process.stderr.isTTY`
- `node_modules/depd/index.js:244`: `process.stderr.write(output + '\n', 'utf8')`

No Buffer usage, no globalThis/global mutations.

## Search 3: prototype/defineProperty
```
rg -n '\.prototype\b|__proto__|setPrototypeOf|definePropert(y|ies)|Reflect\.(set|defineProperty|setPrototypeOf)|Object\.assign' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'
```

Production-relevant hits:
- `node_modules/setprototypeof/index.js:3`: `module.exports = Object.setPrototypeOf || ...`
- `node_modules/setprototypeof/index.js:6`: `obj.__proto__ = proto`
- `node_modules/setprototypeof/index.js:12`: `Object.prototype.hasOwnProperty.call(obj, prop)`
- `node_modules/http-errors/index.js:145`: `setPrototypeOf(err, ClientError.prototype)`
- `node_modules/http-errors/index.js:148`: `Object.defineProperty(err, 'message', ...)`
- `node_modules/http-errors/index.js:156`: `Object.defineProperty(err, 'name', ...)`
- `node_modules/http-errors/index.js:169-171`: `ClientError.prototype.status/statusCode/expose = ...`
- `node_modules/http-errors/index.js:214`: `setPrototypeOf(err, ServerError.prototype)`
- `node_modules/http-errors/index.js:217`: `Object.defineProperty(err, 'message', ...)`
- `node_modules/http-errors/index.js:225`: `Object.defineProperty(err, 'name', ...)`
- `node_modules/http-errors/index.js:238-240`: `ServerError.prototype.status/statusCode/expose = ...`
- `node_modules/http-errors/index.js:255`: `Object.defineProperty(func, 'name', desc)`
- `node_modules/depd/lib/compat/index.js:57`: `Object.defineProperty(obj, prop, ...)` (lazyProperty helper, obj=module.exports)
- `node_modules/depd/lib/compat/index.js:66`: `Object.defineProperty(obj, prop, ...)` (lazyProperty helper, obj=module.exports)
- `node_modules/depd/index.js:64`: `Object.defineProperty(obj, prop, descriptor)` (convertDataDescriptorToAccessor)
- `node_modules/depd/index.js:469`: `Object.defineProperty(obj, prop, descriptor)` (wrapproperty)
- `node_modules/depd/index.js:480-505`: `Object.defineProperty(error, ...)` (DeprecationError properties)
- `node_modules/deep-equal/index.js:1`: `var pSlice = Array.prototype.slice` (READ only)
- `node_modules/deep-equal/index.js:48`: `a.prototype !== b.prototype` (READ only)
- `node_modules/deep-equal/lib/is_arguments.js:2,9`: `Object.prototype.toString.call(...)` (READ only)
- `node_modules/deep-equal/lib/is_arguments.js:17-18`: `Object.prototype.hasOwnProperty/propertyIsEnumerable.call(...)` (READ only)
- `node_modules/inherits/inherits_browser.js:6,22-24`: prototype chain setup on library-owned constructors

No Reflect usage. No Object.assign.

## Search 4: patch/wrap/shim
```
rg -n 'monkey.?patch|\bpatch\b|\bwrap\b|\bshim\b|\bpolyfill\b|\boverride\b' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'
```

Production-relevant hits:
- `node_modules/setprototypeof/package.json:24`: `"polyfill"` (keyword, not code)
- `node_modules/deep-equal/lib/keys.js:2,4,5`: `shim` function for Object.keys fallback (does NOT replace Object.keys)
- `node_modules/depd/index.js:453,461`: `// wrap getter` / `// wrap setter` (wraps on caller-specified objects)
- `node_modules/inherits/inherits_browser.js:17`: `// old school shim for old browsers` (comment)

No monkeypatch hits. No override hits in production code.

## Search 5: require.cache/Module
```
rg -n 'require\.cache|require\.extensions|Module\._(load|resolveFilename|extensions|compile)|syncBuiltinESMExports|registerHooks' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'
```

No production hits.

## Search 6: internal bindings
```
rg -n 'process\.(binding|_linkedBinding)|internalBinding|['"'"'"]_http_|['"'"'"]internal/' --no-ignore -g '!test*' -g '!benchmark*' -g '!.*' -g '!node_modules/**/node_modules'
```

No hits.
