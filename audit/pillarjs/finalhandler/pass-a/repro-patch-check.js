'use strict'
// Reproduction: does finalhandler (or its runtime deps) patch Node.js core?
// Usage: PACKAGE_ROOT=<path-to-finalhandler-checkout> node repro-patch-check.js
// Output is sanitized: no machine paths are printed.

const path = require('path')
const assert = require('assert')
const http = require('http')
const net = require('net')
const stream = require('stream')
const events = require('events')

const PACKAGE_ROOT = process.env.PACKAGE_ROOT
if (!PACKAGE_ROOT) {
  console.error('Set PACKAGE_ROOT to the finalhandler checkout root')
  process.exit(2)
}

function snapshotProtos () {
  const targets = {
    'http.ServerResponse.prototype': http.ServerResponse.prototype,
    'http.IncomingMessage.prototype': http.IncomingMessage.prototype,
    'http.OutgoingMessage.prototype': http.OutgoingMessage.prototype,
    'net.Socket.prototype': net.Socket.prototype,
    'stream.Readable.prototype': stream.Readable.prototype,
    'events.EventEmitter.prototype': events.EventEmitter.prototype
  }
  const snap = {}
  for (const [name, obj] of Object.entries(targets)) {
    snap[name] = new Map()
    for (const key of Reflect.ownKeys(obj)) {
      const d = Object.getOwnPropertyDescriptor(obj, key)
      // Compare data properties by value (undefined included) and accessors
      // by getter/setter identity.
      snap[name].set(key, 'value' in d
        ? { kind: 'data', v: d.value }
        : { kind: 'accessor', v: d.get, s: d.set })
    }
  }
  return snap
}

function diffSnapshots (before, after) {
  const diffs = []
  for (const name of Object.keys(before)) {
    const b = before[name]
    const a = after[name]
    for (const [key, val] of b) {
      if (!a.has(key)) { diffs.push(`${name}[${String(key)}] REMOVED`); continue }
      const cur = a.get(key)
      const same = cur.kind === val.kind && cur.v === val.v && cur.s === val.s
      if (!same) diffs.push(`${name}[${String(key)}] REPLACED`)
    }
    for (const key of a.keys()) {
      if (!b.has(key)) diffs.push(`${name}[${String(key)}] ADDED`)
    }
  }
  return diffs
}

const envDebugBefore = process.env.DEBUG

// 1. Snapshot before import
const before = snapshotProtos()

// 2. Import finalhandler (pulls debug, encodeurl, escape-html, on-finished,
//    parseurl, statuses, ms, ee-first; debug runs import-time env/tty logic)
const finalhandler = require(path.join(PACKAGE_ROOT, 'index.js'))

const afterImport = snapshotProtos()
const importDiffs = diffSnapshots(before, afterImport)
console.log('[1] core prototype diffs after import:', importDiffs.length ? importDiffs : 'none')
console.log('[1] process.env.DEBUG unchanged:', process.env.DEBUG === envDebugBefore)

// 3. Exercise a full request/response cycle: 404 path and error path
const server = http.createServer(function (req, res) {
  const done = finalhandler(req, res)
  if (req.url === '/boom') done(new Error('boom'))
  else done() // 404
})

server.listen(0, '127.0.0.1', function () {
  const port = server.address().port
  http.get({ host: '127.0.0.1', port, path: '/missing' }, function (res1) {
    res1.resume()
    res1.on('end', function () {
      http.get({ host: '127.0.0.1', port, path: '/boom' }, function (res2) {
        res2.resume()
        res2.on('end', function () {
          server.close(function () {
            const afterRun = snapshotProtos()
            const runDiffs = diffSnapshots(before, afterRun)
            console.log('[2] 404 status:', res1.statusCode, '| error status:', res2.statusCode)
            console.log('[2] core prototype diffs after request cycle:', runDiffs.length ? runDiffs : 'none')

            // 4. patchAssignSocket dormancy: on-finished applied directly to a
            //    socketless ServerResponse on modern Node (res.socket === null)
            const onFinished = require(path.join(PACKAGE_ROOT, 'node_modules', 'on-finished'))
            const fakeReq = { method: 'GET', url: '/', httpVersionMajor: 1, httpVersionMinor: 1 }
            const res = new http.ServerResponse(fakeReq)
            console.log('[3] fresh ServerResponse socket value:', res.socket === null ? 'null' : typeof res.socket)
            onFinished(res, function () {})
            const own = Object.prototype.hasOwnProperty.call(res, 'assignSocket')
            console.log('[3] res has OWN assignSocket after on-finished (patchAssignSocket fired?):', own)
            console.log('[3] ServerResponse.prototype.assignSocket identity unchanged:',
              http.ServerResponse.prototype.assignSocket === afterImport['http.ServerResponse.prototype'].get('assignSocket').v)

            assert.strictEqual(importDiffs.length, 0)
            assert.strictEqual(runDiffs.length, 0)
            assert.strictEqual(own, false)
            console.log('RESULT: no core prototype/global mutation observed; patchAssignSocket dormant')
          })
        })
      })
    })
  })
})
