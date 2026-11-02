// Reproduction: does require('ejs') (as resolved by express-generator) mutate
// the shared CJS extension registry (require.extensions === Module._extensions)?
// Usage: node repro-require-extensions.js "$PACKAGE_ROOT"
'use strict';
var Module = require('module');
var path = require('path');
var packageRoot = process.argv[2];
if (!packageRoot) { console.error('usage: node repro-require-extensions.js "$PACKAGE_ROOT"'); process.exit(2); }
var beforeKeys = Object.keys(require.extensions).slice();
var beforeHasEjs = Object.prototype.hasOwnProperty.call(require.extensions, '.ejs');
require(path.join(packageRoot, 'node_modules', 'ejs'));
var afterHasEjs = Object.prototype.hasOwnProperty.call(require.extensions, '.ejs');
console.log(JSON.stringify({
  node: process.version,
  sharedRegistry: require.extensions === Module._extensions,
  beforeKeys: beforeKeys,
  beforeHasEjs: beforeHasEjs,
  afterHasEjs: afterHasEjs,
  handlerType: typeof require.extensions['.ejs']
}, null, 2));
