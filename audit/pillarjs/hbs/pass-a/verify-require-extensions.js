// Pass-A verification: does require('hbs') mutate Node.js core state?
// Usage: node verify-require-extensions.js "$PACKAGE_ROOT"
// Compares core identities/descriptors before and after loading hbs.
'use strict';

var Module = require('module');
var fs = require('fs');

var packageRoot = process.argv[2];
if (!packageRoot) {
  console.error('usage: node verify-require-extensions.js "$PACKAGE_ROOT"');
  process.exit(1);
}

function snapshot() {
  return {
    extKeys: Object.keys(Module._extensions).slice(),
    extIsRequireExtensions: require.extensions === Module._extensions,
    objectProtoProps: Object.getOwnPropertyNames(Object.prototype).slice().sort(),
    arrayProtoProps: Object.getOwnPropertyNames(Array.prototype).slice().sort(),
    funcProtoProps: Object.getOwnPropertyNames(Function.prototype).slice().sort(),
    globalHandlebars: typeof globalThis.Handlebars,
    fsReadFile: fs.readFile,
    fsReadFileSync: fs.readFileSync,
    moduleLoad: Module._load,
    moduleResolve: Module._resolveFilename,
    moduleCompile: Module.prototype._compile,
    jsHandler: Module._extensions['.js'],
    jsonHandler: Module._extensions['.json']
  };
}

var before = snapshot();

var hbs = require(packageRoot); // loads lib/hbs.js -> handlebars -> walk ...

var after = snapshot();

function diff(a, b) {
  return b.filter(function (k) { return a.indexOf(k) === -1; });
}

var report = {
  addedExtensionKeys: diff(before.extKeys, after.extKeys),
  removedExtensionKeys: diff(after.extKeys, before.extKeys),
  requireExtensionsIsModuleExtensions: after.extIsRequireExtensions,
  hbsHandlerIsHandlebarsExtensionFn:
    typeof Module._extensions['.hbs'] === 'function' &&
    Module._extensions['.hbs'] === Module._extensions['.handlebars'],
  hbsHandlerSource: Module._extensions['.hbs']
    ? Module._extensions['.hbs'].toString().replace(/\s+/g, ' ').slice(0, 160)
    : null,
  objectProtoAdded: diff(before.objectProtoProps, after.objectProtoProps),
  arrayProtoAdded: diff(before.arrayProtoProps, after.arrayProtoProps),
  funcProtoAdded: diff(before.funcProtoProps, after.funcProtoProps),
  globalHandlebarsBefore: before.globalHandlebars,
  globalHandlebarsAfter: after.globalHandlebars,
  coreIdentitiesUnchanged: {
    'fs.readFile': before.fsReadFile === after.fsReadFile,
    'fs.readFileSync': before.fsReadFileSync === after.fsReadFileSync,
    'Module._load': before.moduleLoad === after.moduleLoad,
    'Module._resolveFilename': before.moduleResolve === after.moduleResolve,
    'Module.prototype._compile': before.moduleCompile === after.moduleCompile,
    "Module._extensions['.js']": before.jsHandler === after.jsHandler,
    "Module._extensions['.json']": before.jsonHandler === after.jsonHandler
  },
  hbsExportType: typeof hbs,
  nodeVersion: process.version
};

console.log(JSON.stringify(report, null, 2));
