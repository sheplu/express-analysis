// Usage: node check-extensions.js "$PACKAGE_ROOT"
// Compares the CJS loader extension registry before/after loading the ejs
// dependency resolved inside the audited package, then demonstrates the
// behavior change for require() of a .ejs file.
'use strict';
var Module = require('module');
var path = require('path');
var fs = require('fs');

var packageRoot = process.argv[2];
if (!packageRoot) { console.error('missing PACKAGE_ROOT arg'); process.exit(2); }

var before = Object.keys(Module._extensions).sort();
var hadEjsBefore = Object.prototype.hasOwnProperty.call(require.extensions, '.ejs');

console.log('node version         :', process.version);
console.log('identity check       : require.extensions === Module._extensions ->',
  require.extensions === Module._extensions);
console.log('registry before      :', before.join(' '));
console.log('.ejs key before      :', hadEjsBefore);

var ejs = require(path.join(packageRoot, 'node_modules', 'ejs'));

var after = Object.keys(Module._extensions).sort();
console.log('registry after       :', after.join(' '));
console.log('.ejs key after       :', typeof Module._extensions['.ejs']);

// Behavior demo: require() a .ejs file now compiles it as an EJS template.
var fixture = path.join(__dirname, 'fixtures', 'demo.ejs');
fs.writeFileSync(fixture, 'Hello <%= who %>!');
var tpl = require(fixture);
console.log('require(demo.ejs)    : typeof export ->', typeof tpl,
  '| render ->', JSON.stringify(tpl({ who: 'audit' })));

// Resolution demo: extensionless require now resolves to the .ejs file.
var resolved;
try {
  resolved = require.resolve(path.join(__dirname, 'fixtures', 'demo'));
} catch (e) {
  resolved = 'NOT RESOLVED: ' + e.code;
}
console.log('resolve(demo)        :', typeof resolved === 'string' && resolved.endsWith('demo.ejs')
  ? 'resolved to demo.ejs' : resolved);
console.log('ejs version loaded   :', ejs.VERSION);
