// Usage: node check-patching.js "$PACKAGE_ROOT"
// Compares core function identities/descriptors before and after loading cors
// and after exercising the middleware (preflight + simple request paths).
'use strict';
var path = require('path');
var http = require('http');
var Module = require('module');

var pkgRoot = process.argv[2];
if (!pkgRoot) { console.error('usage: node check-patching.js "$PACKAGE_ROOT"'); process.exit(2); }

function snapshot() {
  return {
    'http.ServerResponse.prototype.setHeader': http.ServerResponse.prototype.setHeader,
    'http.ServerResponse.prototype.getHeader': http.ServerResponse.prototype.getHeader,
    'http.ServerResponse.prototype.end': http.ServerResponse.prototype.end,
    'http.ServerResponse.prototype.writeHead': http.ServerResponse.prototype.writeHead,
    'http.ServerResponse.prototype.statusCode': Object.getOwnPropertyDescriptor(http.ServerResponse.prototype, 'statusCode') && Object.getOwnPropertyDescriptor(http.ServerResponse.prototype, 'statusCode').value,
    'http.OutgoingMessage.prototype.setHeader': http.OutgoingMessage.prototype.setHeader,
    'http.createServer': http.createServer,
    'Object.assign': Object.assign,
    'Object.prototype.hasOwnProperty': Object.prototype.hasOwnProperty,
    'Object.prototype.propertyIsEnumerable': Object.prototype.propertyIsEnumerable,
    'String.prototype keys count': Object.getOwnPropertyNames(String.prototype).length,
    'Module._load': Module._load,
    'Module._resolveFilename': Module._resolveFilename,
    'require.extensions[.js]': require.extensions['.js'],
    'process.binding': process.binding,
    'Object.prototype keys': Object.getOwnPropertyNames(Object.prototype).join(',')
  };
}

function diff(a, b, label) {
  var changed = [];
  Object.keys(a).forEach(function (k) {
    if (a[k] !== b[k]) changed.push(k);
  });
  console.log(label + ': ' + (changed.length ? 'CHANGED -> ' + changed.join('; ') : 'no changes'));
  return changed.length;
}

var before = snapshot();
var cors = require(path.join(pkgRoot, 'lib', 'index.js'));
var afterLoad = snapshot();
var n1 = diff(before, afterLoad, 'after require(cors)');

// Exercise middleware with mock req/res (both preflight and simple paths)
function mockRes() {
  var headers = {};
  return {
    setHeader: function (k, v) { headers[k.toLowerCase()] = v; },
    getHeader: function (k) { return headers[k.toLowerCase()]; },
    end: function () { this.ended = true; },
    headers: headers
  };
}
var mw = cors({ origin: 'https://example.com', credentials: true, maxAge: 600 });
mw({ method: 'OPTIONS', headers: { origin: 'https://example.com', 'access-control-request-headers': 'X-Test' } }, mockRes(), function () {});
mw({ method: 'GET', headers: { origin: 'https://example.com' } }, mockRes(), function () {});
var mw2 = cors(); // defaults path
mw2({ method: 'OPTIONS', headers: { origin: 'https://other.example' } }, mockRes(), function () {});

// Exercise against a REAL core ServerResponse instance to check instance-level overrides
var req = new http.IncomingMessage(null);
req.method = 'OPTIONS';
req.headers = { origin: 'https://example.com' };
var res = new http.ServerResponse(req);
var instBeforeKeys = Object.getOwnPropertyNames(res);
var protoSetHeader = res.setHeader;
mw({ method: 'OPTIONS', headers: req.headers }, res, function () {});
var n3 = 0;
if (res.setHeader !== protoSetHeader) { console.log('instance setHeader REPLACED'); n3++; }
if (res.end !== http.ServerResponse.prototype.end) { console.log('instance end REPLACED'); n3++; }
var instAfterKeys = Object.getOwnPropertyNames(res).filter(function (k) { return instBeforeKeys.indexOf(k) === -1; });
console.log('new own props on real ServerResponse instance: ' + (instAfterKeys.length ? instAfterKeys.join(', ') : 'none'));

var afterCalls = snapshot();
var n2 = diff(afterLoad, afterCalls, 'after middleware calls');

console.log('node ' + process.version);
process.exit((n1 + n2 + n3) ? 1 : 0);
