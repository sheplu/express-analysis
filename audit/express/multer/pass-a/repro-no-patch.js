// Reproduction: verify that loading and exercising multer does not mutate
// Node.js core APIs, shared prototypes, or globals.
// Usage: node repro-no-patch.js "$PACKAGE_ROOT"
'use strict'

const path = require('path')
const fs = require('fs')
const stream = require('stream')
const http = require('http')
const events = require('events')
const util = require('util')

const packageRoot = process.argv[2] || process.env.PACKAGE_ROOT
if (!packageRoot) {
  console.error('usage: node repro-no-patch.js "$PACKAGE_ROOT"')
  process.exit(2)
}

function snapshot () {
  return {
    'fs.createWriteStream': fs.createWriteStream,
    'fs.open': fs.open,
    'fs.fsync': fs.fsync,
    'fs.unlink': fs.unlink,
    'fs.mkdirSync': fs.mkdirSync,
    'stream.pipeline': stream.pipeline,
    'Readable.prototype.pipe': stream.Readable.prototype.pipe,
    'Readable.prototype.unpipe': stream.Readable.prototype.unpipe,
    'Readable.prototype.resume': stream.Readable.prototype.resume,
    'Readable.prototype.read': stream.Readable.prototype.read,
    'Readable.prototype.push': stream.Readable.prototype.push,
    'Readable.prototype._read': stream.Readable.prototype._read,
    'Writable.prototype.write': stream.Writable.prototype.write,
    'Writable.prototype._write': stream.Writable.prototype._write,
    'Writable.prototype.destroy': stream.Writable.prototype.destroy,
    'EventEmitter.prototype.emit': events.EventEmitter.prototype.emit,
    'EventEmitter.prototype.on': events.EventEmitter.prototype.on,
    'EventEmitter.prototype.removeAllListeners': events.EventEmitter.prototype.removeAllListeners,
    'IncomingMessage.prototype keys': Object.getOwnPropertyNames(http.IncomingMessage.prototype).sort().join(','),
    'Buffer.prototype keys': Object.getOwnPropertyNames(Buffer.prototype).sort().join(','),
    'Buffer.prototype.latin1Slice': Buffer.prototype.latin1Slice,
    'Buffer.prototype.utf8Slice': Buffer.prototype.utf8Slice,
    'Object.prototype keys': Object.getOwnPropertyNames(Object.prototype).sort().join(','),
    'Array.prototype keys length': Object.getOwnPropertyNames(Array.prototype).length,
    'Error.prototype keys': Object.getOwnPropertyNames(Error.prototype).sort().join(','),
    'util.inherits': util.inherits
  }
}

function compare (before, after, label) {
  let failed = 0
  for (const key of Object.keys(before)) {
    if (before[key] !== after[key]) {
      failed++
      console.log(`FAIL [${label}] ${key} changed`)
    }
  }
  if (failed === 0) console.log(`PASS [${label}] all ${Object.keys(before).length} core identities unchanged`)
  return failed
}

const before = snapshot()
const multer = require(path.join(packageRoot, 'index.js'))
const afterLoad = snapshot()
let failures = compare(before, afterLoad, 'after require(multer)')

// Exercise the middleware with a real multipart body, including
// prototype-pollution-shaped field names routed through append-field.
const boundary = 'xxBOUNDARYxx'
const body = Buffer.from([
  `--${boundary}`,
  'Content-Disposition: form-data; name="plain"',
  '',
  'value1',
  `--${boundary}`,
  'Content-Disposition: form-data; name="__proto__[polluted]"',
  '',
  'yes',
  `--${boundary}`,
  'Content-Disposition: form-data; name="a[__proto__][x]"',
  '',
  'yes',
  `--${boundary}`,
  'Content-Disposition: form-data; name="arr[2]"',
  '',
  'idx',
  `--${boundary}`,
  'Content-Disposition: form-data; name="upload"; filename="t.txt"',
  'Content-Type: text/plain',
  '',
  'file contents here',
  `--${boundary}--`,
  ''
].join('\r\n'))

const req = new stream.Readable({ read () {} })
req.headers = {
  'content-type': `multipart/form-data; boundary=${boundary}`,
  'content-length': String(body.length)
}
req.push(body)
req.push(null)

const upload = multer() // memory storage; no disk writes needed for the check
upload.any()(req, {}, function (err) {
  if (err) {
    failures++
    console.log('FAIL middleware errored: ' + err.message)
  } else {
    console.log('PASS middleware completed; files=' + req.files.length +
      ' body keys=' + Object.keys(req.body).join('|'))
  }

  const afterRun = snapshot()
  failures += compare(before, afterRun, 'after middleware run')

  if (({}).polluted !== undefined || Object.prototype.polluted !== undefined) {
    failures++
    console.log('FAIL Object.prototype polluted via append-field')
  } else {
    console.log('PASS Object.prototype not polluted by __proto__ field names')
  }

  if (Object.getPrototypeOf(req.body) !== null) {
    failures++
    console.log('FAIL req.body prototype is not null')
  } else {
    console.log('PASS req.body is a null-prototype object; nested writes stayed own-properties')
  }

  console.log('node ' + process.version + ' — ' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILURES'))
  process.exit(failures === 0 ? 0 : 1)
})
