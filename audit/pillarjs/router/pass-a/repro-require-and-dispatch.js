'use strict'

// Usage: node repro-require-and-dispatch.js "$PACKAGE_ROOT"
// Verifies, for router@2.2.0 (master 098ea78):
//  1. require('router') transiently swaps Error.prepareStackTrace /
//     Error.stackTraceLimit (depd getStack) and restores both.
//  2. require('debug') (via router) writes process.env.DEBUG back to its
//     prior value (idempotent round-trip).
//  3. No lasting mutation of core prototypes or globals after require and
//     after dispatching requests through the router.
//  4. req.url is trimmed inside mounted middleware and restored on next();
//     expandos (baseUrl, params, next, route, symbols, _parsedUrl) are
//     instance-scoped metadata on the request object only.
//  5. A deprecated (thenable, non-Promise) handler triggers depd log() at
//     runtime, which again transiently swaps Error.prepareStackTrace.

const http = require('node:http')

const packageRoot = process.argv[2]
if (!packageRoot) {
  console.error('usage: node repro-require-and-dispatch.js "$PACKAGE_ROOT"')
  process.exit(1)
}

// --- 1. instrument Error.prepareStackTrace ------------------------------
// Note: on recent Node (e.g. v24) core itself pre-installs a default
// Error.prepareStackTrace (ErrorPrepareStackTrace); restoration must be
// checked by identity against the initial value, not against undefined.
let setCount = 0
let sawHookFunction = false
let current = Error.prepareStackTrace
const initialPrepare = current
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  get () { return current },
  set (v) {
    setCount++
    if (typeof v === 'function' && v !== initialPrepare) sawHookFunction = true
    current = v
  }
})

const stackTraceLimitBefore = Error.stackTraceLimit
const hadDebugEnv = Object.prototype.hasOwnProperty.call(process.env, 'DEBUG')
const debugEnvBefore = process.env.DEBUG

// --- snapshot shared core objects ---------------------------------------
function snap (obj) { return Reflect.ownKeys(obj).map(String).sort().join(',') }
const snapshots = [
  ['http.IncomingMessage.prototype', http.IncomingMessage.prototype],
  ['http.ServerResponse.prototype', http.ServerResponse.prototype],
  ['http.OutgoingMessage.prototype', http.OutgoingMessage.prototype],
  ['Function.prototype', Function.prototype],
  ['Object.prototype', Object.prototype],
  ['Array.prototype', Array.prototype],
  ['process', process]
].map(([name, obj]) => [name, obj, snap(obj)])

// --- require the package -------------------------------------------------
const Router = require(packageRoot)

console.log('[require] prepareStackTrace assignments during require:', setCount)
console.log('[require] transient hook function observed:', sawHookFunction)
console.log('[require] prepareStackTrace restored to initial value:', Error.prepareStackTrace === initialPrepare)
console.log('[require] stackTraceLimit restored:', Error.stackTraceLimit === stackTraceLimitBefore)
const hasDebugEnvAfter = Object.prototype.hasOwnProperty.call(process.env, 'DEBUG')
console.log('[require] process.env.DEBUG presence/value unchanged:',
  hadDebugEnv === hasDebugEnvAfter && debugEnvBefore === process.env.DEBUG)

// --- 4. dispatch a request through mounted middleware --------------------
const router = new Router()
const observed = {}

router.use('/api', function (req, res, next) {
  observed.urlInsideMiddleware = req.url
  observed.baseUrlInsideMiddleware = req.baseUrl
  next()
})
router.get('/api/users/:id', function (req, res) {
  observed.urlInRoute = req.url
  observed.params = Object.assign({}, req.params)
  res.end('ok')
})
// deprecated thenable handler (not a native Promise)
router.get('/thenable', function (req, res, next) {
  next()
  return { then: function () {} } // triggers depd deprecation at runtime
})

function makeReq (method, url) {
  return { method, url, headers: {} }
}
function makeRes () {
  return {
    _headers: {},
    setHeader (k, v) { this._headers[k] = v },
    end (body) { this.ended = true; this.body = body }
  }
}
function dispatch (router, req, res) {
  return new Promise(resolve => { router.handle(req, res, err => resolve(err)) })
}

async function main () {
  // (a) matched route: handler ends response; done() never runs
  const req1 = makeReq('GET', '/api/users/42?x=1')
  const keysBefore1 = Reflect.ownKeys(req1).map(String)
  const res1 = makeRes()
  router.handle(req1, res1, () => {})
  await new Promise(r => setImmediate(r))
  console.log('[dispatch] url inside mounted middleware (trimmed):', observed.urlInsideMiddleware)
  console.log('[dispatch] baseUrl inside mounted middleware:', observed.baseUrlInsideMiddleware)
  console.log('[dispatch] url inside route (restored):', observed.urlInRoute)
  console.log('[dispatch] params in route:', JSON.stringify(observed.params))
  console.log('[dispatch] req.url after dispatch:', req1.url)
  const added1 = Reflect.ownKeys(req1).map(String).filter(k => !keysBefore1.includes(k))
  console.log('[dispatch] expandos left on req (handler ended response):', JSON.stringify(added1.sort()))

  // (b) no match: done() runs, restore() puts saved values back
  const req2 = makeReq('GET', '/nomatch')
  req2.params = { parent: '1' }
  req2.baseUrl = '/parent'
  const res2 = makeRes()
  const err2 = await dispatch(router, req2, res2)
  console.log('[restore] done(err):', err2 === undefined ? 'undefined' : String(err2))
  console.log('[restore] req.baseUrl restored:', req2.baseUrl === '/parent')
  console.log('[restore] req.params restored:', req2.params && req2.params.parent === '1')
  console.log('[restore] req.next restored to undefined:', req2.next === undefined)

  // (c) automatic OPTIONS response uses public res.setHeader/res.end only.
  // The options responder ends the response without calling the final
  // callback, so resolve when res.end is invoked.
  const req3 = makeReq('OPTIONS', '/api/users/7')
  const res3 = makeRes()
  await new Promise(resolve => {
    const origEnd = res3.end
    res3.end = function (body) { origEnd.call(this, body); resolve() }
    router.handle(req3, res3, () => resolve())
  })
  console.log('[options] Allow header:', res3._headers.Allow, '| ended:', res3.ended === true)

  // (d) runtime deprecation: thenable handler -> depd log() -> getStack again
  const depEvents = []
  process.on('deprecation', err => depEvents.push(err.namespace + ': ' + err.message))
  const setCountBeforeDep = setCount
  const req4 = makeReq('GET', '/thenable')
  const res4 = makeRes()
  await dispatch(router, req4, res4)
  console.log('[depd-runtime] deprecation events:', JSON.stringify(depEvents))
  console.log('[depd-runtime] extra prepareStackTrace assignments:', setCount - setCountBeforeDep)
  console.log('[depd-runtime] prepareStackTrace restored to initial value:', Error.prepareStackTrace === initialPrepare)
  console.log('[depd-runtime] stackTraceLimit restored:', Error.stackTraceLimit === stackTraceLimitBefore)

  // --- 3. compare shared core snapshots ----------------------------------
  let dirty = false
  for (const [name, obj, before] of snapshots) {
    const after = snap(obj)
    if (after !== before) {
      dirty = true
      console.log('[shared] MUTATED:', name)
    }
  }
  console.log('[shared] core prototypes/globals own-key sets unchanged:', !dirty)
  console.log('[runtime] node', process.version)
}

main().catch(err => { console.error('repro failed:', err && err.message); process.exit(1) })
