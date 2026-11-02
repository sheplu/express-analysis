// Reproduction: verify vhost does not mutate Node.js core prototypes/globals
// and only adds a library-owned own-property `vhost` to the live request.
// Usage: node repro-no-mutation.js "$PACKAGE_ROOT"
'use strict'

var path = require('path')
var http = require('http')

var packageRoot = process.argv[2]
if (!packageRoot) {
  console.error('usage: node repro-no-mutation.js "$PACKAGE_ROOT"')
  process.exit(2)
}

function snap (obj) {
  return Object.getOwnPropertyNames(obj).sort().join(',')
}

var targets = {
  'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
  'http.ServerResponse.prototype': http.ServerResponse.prototype,
  'http.Server.prototype': http.Server.prototype,
  'Object.prototype': Object.prototype,
  'Function.prototype': Function.prototype,
  'String.prototype': String.prototype,
  'RegExp.prototype': RegExp.prototype
}

var before = {}
for (var name in targets) before[name] = snap(targets[name])
var headersDescBefore = Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, 'headers')

// load and exercise the middleware
var vhost = require(path.join(packageRoot, 'index.js'))
var mw = vhost('*.example.com', function handle (req, res, next) {})

var req = new http.IncomingMessage(null)
req.headers = { host: 'api.example.com:8080' }
var reqKeysBefore = Object.getOwnPropertyNames(req).sort()
mw(req, {}, function next () {})
var reqKeysAfter = Object.getOwnPropertyNames(req).sort()

var failed = false
for (var name2 in targets) {
  if (snap(targets[name2]) !== before[name2]) {
    console.log('MUTATED:', name2)
    failed = true
  }
}
var headersDescAfter = Object.getOwnPropertyDescriptor(http.IncomingMessage.prototype, 'headers')
if (headersDescBefore.get !== headersDescAfter.get || headersDescBefore.set !== headersDescAfter.set) {
  console.log('MUTATED: IncomingMessage.prototype headers accessor')
  failed = true
}

var added = reqKeysAfter.filter(function (k) { return reqKeysBefore.indexOf(k) === -1 })
console.log('own properties added to live req:', JSON.stringify(added))
console.log('req.vhost:', JSON.stringify(req.vhost))
console.log('core IncomingMessage.prototype has own "vhost":',
  Object.prototype.hasOwnProperty.call(http.IncomingMessage.prototype, 'vhost'))
console.log(failed ? 'RESULT: MUTATION DETECTED' : 'RESULT: no core prototype/global mutation detected')
process.exit(failed ? 1 : 0)
