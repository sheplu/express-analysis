# Pass A — Raw Search Results

## Library
- http-assert v1.5.0
- Commit: 3ae22e131825155672ddc19dac5c1485cc0f9996

## Search 1: require/import/from

Production hits (excluding README, HISTORY, package-lock.json):

```
index.js:1:var createError = require('http-errors')
index.js:2:var eql = require('deep-equal')
node_modules/http-errors/index.js:15:var deprecate = require('depd')('http-errors')
node_modules/http-errors/index.js:16:var setPrototypeOf = require('setprototypeof')
node_modules/http-errors/index.js:17:var statuses = require('statuses')
node_modules/http-errors/index.js:18:var inherits = require('inherits')
node_modules/http-errors/index.js:19:var toIdentifier = require('toidentifier')
node_modules/inherits/inherits.js:2:  var util = require('util');
node_modules/inherits/inherits.js:8:  module.exports = require('./inherits_browser.js');
node_modules/deep-equal/index.js:2:var objectKeys = require('./lib/keys.js');
node_modules/deep-equal/index.js:3:var isArguments = require('./lib/is_arguments.js');
node_modules/statuses/index.js:15:var codes = require('./codes.json')
node_modules/depd/index.js:11:var callSiteToString = require('./lib/compat').callSiteToString
node_modules/depd/index.js:12:var eventListenerCount = require('./lib/compat').eventListenerCount
node_modules/depd/index.js:13:var relative = require('path').relative
node_modules/depd/lib/compat/index.js:14:var EventEmitter = require('events').EventEmitter
node_modules/depd/lib/compat/index.js:42:  return stack[0].toString ? toString : require('./callsite-tostring')
node_modules/depd/lib/compat/index.js:46:  return EventEmitter.listenerCount || require('./event-listener-count')
```

All standard module requires. No dynamic or unusual require patterns.

## Search 2: Globals/builtins (Buffer, process, globalThis, global, extends, inherits)

Production hits:

```
node_modules/http-errors/index.js:123:  inherits(HttpError, Error)
node_modules/http-errors/index.js:166:  inherits(ClientError, HttpError)
node_modules/http-errors/index.js:235:  inherits(ServerError, HttpError)
node_modules/depd/index.js:25:var basePath = process.cwd()
node_modules/depd/index.js:137:  if (process.noDeprecation) {
node_modules/depd/index.js:142:  var str = process.env.NO_DEPRECATION || ''
node_modules/depd/index.js:154:  if (process.traceDeprecation) {
node_modules/depd/index.js:159:  var str = process.env.TRACE_DEPRECATION || ''
node_modules/depd/index.js:170:  var haslisteners = eventListenerCount(process, 'deprecation') !== 0
node_modules/depd/index.js:235:    process.emit('deprecation', err)
node_modules/depd/index.js:240:  var format = process.stderr.isTTY
node_modules/depd/index.js:244:  process.stderr.write(output + '\n', 'utf8')
```

- `inherits()` calls: all on library-owned constructors (HttpError, ClientError, ServerError), not core
- `process.cwd()`: read-only call
- `process.env.*`: read-only access
- `process.noDeprecation`, `process.traceDeprecation`: read-only access
- `process.emit('deprecation', err)`: emitting a custom event, not patching process itself
- `process.stderr`: read-only access to write

## Search 3: prototype/defineProperty/setPrototypeOf

Production hits:

```
node_modules/http-errors/index.js:16:var setPrototypeOf = require('setprototypeof')
node_modules/http-errors/index.js:145:    setPrototypeOf(err, ClientError.prototype)
node_modules/http-errors/index.js:148:    Object.defineProperty(err, 'message', {...})
node_modules/http-errors/index.js:156:    Object.defineProperty(err, 'name', {...})
node_modules/http-errors/index.js:169:  ClientError.prototype.status = code
node_modules/http-errors/index.js:170:  ClientError.prototype.statusCode = code
node_modules/http-errors/index.js:171:  ClientError.prototype.expose = true
node_modules/http-errors/index.js:214:    setPrototypeOf(err, ServerError.prototype)
node_modules/http-errors/index.js:217:    Object.defineProperty(err, 'message', {...})
node_modules/http-errors/index.js:225:    Object.defineProperty(err, 'name', {...})
node_modules/http-errors/index.js:238:  ServerError.prototype.status = code
node_modules/http-errors/index.js:239:  ServerError.prototype.statusCode = code
node_modules/http-errors/index.js:240:  ServerError.prototype.expose = false
node_modules/http-errors/index.js:255:    Object.defineProperty(func, 'name', desc)
node_modules/setprototypeof/index.js:3:module.exports = Object.setPrototypeOf || ...
node_modules/setprototypeof/index.js:6:  obj.__proto__ = proto
node_modules/setprototypeof/index.js:12:    if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
node_modules/inherits/inherits_browser.js:6:      ctor.prototype = Object.create(superCtor.prototype, {...})
node_modules/inherits/inherits_browser.js:22-24: TempCtor.prototype chain setup
node_modules/deep-equal/lib/is_arguments.js:2:  return Object.prototype.toString.call(arguments)
node_modules/deep-equal/lib/is_arguments.js:9:  return Object.prototype.toString.call(object) == '[object Arguments]';
node_modules/deep-equal/lib/is_arguments.js:17:    Object.prototype.hasOwnProperty.call(object, 'callee') &&
node_modules/deep-equal/lib/is_arguments.js:18:    !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
node_modules/deep-equal/index.js:1:var pSlice = Array.prototype.slice;
node_modules/deep-equal/index.js:48:  if (a.prototype !== b.prototype) return false;
node_modules/depd/index.js:64:  Object.defineProperty(obj, prop, descriptor)
node_modules/depd/index.js:469:  Object.defineProperty(obj, prop, descriptor)
node_modules/depd/index.js:480-505:  Object.defineProperty(error, ...) [constructor, message, name, namespace, stack]
node_modules/depd/lib/compat/index.js:57:    Object.defineProperty(obj, prop, {...})
node_modules/depd/lib/compat/index.js:66:  Object.defineProperty(obj, prop, {...})
```

- All http-errors hits: operate on library-owned Error subclasses — NOT core patching
- setprototypeof: exports a function, does not modify Object itself
- inherits: sets up prototype chain on library-owned constructors — NOT core patching
- deep-equal: READS from Array.prototype.slice and Object.prototype methods — does NOT modify them
- depd defineProperty: operates on library-owned objects (DeprecationError instances, module.exports) — NOT core patching

## Search 4: patch/wrap/shim/polyfill/override

Production hits:

```
node_modules/setprototypeof/package.json:4:  "description": "A small polyfill for Object.setprototypeof"
node_modules/deep-equal/lib/keys.js:2:  ? Object.keys : shim;
node_modules/deep-equal/lib/keys.js:4:exports.shim = shim;
node_modules/deep-equal/lib/keys.js:5:function shim (obj) {
node_modules/depd/index.js:453:  // wrap getter
node_modules/depd/index.js:461:  // wrap setter
```

- setprototypeof: describes itself as a "polyfill" but only exports a function; does NOT modify Object
- deep-equal keys.js: provides a shim for Object.keys if absent, but ONLY exports it — does NOT replace Object.keys
- depd wrap: wraps user-provided getter/setter for deprecation warnings on user-provided objects — NOT core patching

## Search 5: require.cache/Module internals

No production code hits. Only a README example mentioning Module._compile.

## Search 6: process.binding/internalBinding/internal modules

No hits.

## Targeted search: Error.prepareStackTrace/stackTraceLimit mutations

```
node_modules/depd/index.js:366:  var limit = Error.stackTraceLimit
node_modules/depd/index.js:368:  var prep = Error.prepareStackTrace
node_modules/depd/index.js:370:  Error.prepareStackTrace = prepareObjectStackTrace    ← WRITE
node_modules/depd/index.js:371:  Error.stackTraceLimit = Math.max(10, limit)           ← WRITE
node_modules/depd/index.js:374:  Error.captureStackTrace(obj)
node_modules/depd/index.js:379:  Error.prepareStackTrace = prep                        ← RESTORE
node_modules/depd/index.js:380:  Error.stackTraceLimit = limit                         ← RESTORE

node_modules/depd/lib/compat/index.js:24:  var prep = Error.prepareStackTrace
node_modules/depd/lib/compat/index.js:30:  Error.prepareStackTrace = prepareObjectStackTrace  ← WRITE
node_modules/depd/lib/compat/index.js:31:  Error.stackTraceLimit = 2                           ← WRITE
node_modules/depd/lib/compat/index.js:34:  Error.captureStackTrace(obj)
node_modules/depd/lib/compat/index.js:39:  Error.prepareStackTrace = prep                      ← RESTORE
node_modules/depd/lib/compat/index.js:40:  Error.stackTraceLimit = limit                       ← RESTORE
```

Both are transient save-swap-restore patterns.
