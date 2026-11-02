# Pass A - Raw Search Results

## Scope
- Package: negotiator v1.1.0
- Commit: 14b0a7b88e7e7bb1cae38681195951bff29ca2fd
- Production files: `$PACKAGE_ROOT/index.js`, `$PACKAGE_ROOT/lib/accept.js`, `$PACKAGE_ROOT/lib/charset.js`, `$PACKAGE_ROOT/lib/encoding.js`, `$PACKAGE_ROOT/lib/language.js`, `$PACKAGE_ROOT/lib/mediaType.js`, `$PACKAGE_ROOT/node_modules/content-type/dist/index.js`

## Group 1: Imports/requires

Production-file hits only:

```
lib/charset.js:11:  var parseAccept = require('./accept');
lib/mediaType.js:11: var contentType = require('content-type');
lib/mediaType.js:12: var parseAcceptHeader = require('./accept');
lib/language.js:11:  var contentType = require('content-type');
lib/language.js:12:  var parseAccept = require('./accept');
lib/accept.js:9:     var contentType = require('content-type');
lib/encoding.js:11:  var parseAccept = require('./accept');
index.js:11: var preferredCharsets = require('./lib/charset')
index.js:12: var preferredEncodings = require('./lib/encoding')
index.js:13: var preferredLanguages = require('./lib/language')
index.js:14: var preferredMediaTypes = require('./lib/mediaType')
```

Non-production hits (excluded from analysis): examples/*.js, README.md, package-lock.json

## Group 2: Globals/builtins

Zero hits in production files.

All hits were in examples/charset.js (Buffer) and package-lock.json (process-on-spawn, a devDependency).

## Group 3: Prototype/property mutation

Production-file hits:

```
index.js:38:  Negotiator.prototype.charset = function charset(available) {
index.js:43:  Negotiator.prototype.charsets = function charsets(available) {
index.js:47:  Negotiator.prototype.encoding = function encoding(available, opts) {
index.js:52:  Negotiator.prototype.encodings = function encodings(available, options) {
index.js:57:  Negotiator.prototype.language = function language(available) {
index.js:62:  Negotiator.prototype.languages = function languages(available) {
index.js:66:  Negotiator.prototype.mediaType = function mediaType(available) {
index.js:71:  Negotiator.prototype.mediaTypes = function mediaTypes(available) {
index.js:76:  Negotiator.prototype.preferredCharset = Negotiator.prototype.charset;
index.js:77:  Negotiator.prototype.preferredCharsets = Negotiator.prototype.charsets;
index.js:78:  Negotiator.prototype.preferredEncoding = Negotiator.prototype.encoding;
index.js:79:  Negotiator.prototype.preferredEncodings = Negotiator.prototype.encodings;
index.js:80:  Negotiator.prototype.preferredLanguage = Negotiator.prototype.language;
index.js:81:  Negotiator.prototype.preferredLanguages = Negotiator.prototype.languages;
index.js:82:  Negotiator.prototype.preferredMediaType = Negotiator.prototype.mediaType;
index.js:83:  Negotiator.prototype.preferredMediaTypes = Negotiator.prototype.mediaTypes;
node_modules/content-type/dist/index.js:7:   Object.defineProperty(exports, "__esModule", { value: true });
node_modules/content-type/dist/index.js:25:  (comment) `{ __proto__: null }`
node_modules/content-type/dist/index.js:29:  C.prototype = Object.create(null);
```

## Group 4: Patching keywords

Zero hits in production files.

All hits were in package-lock.json referencing wrap-ansi, spawn-wrap, word-wrap (devDependencies).

## Group 5: Module system hooks

Zero hits across all files.

## Group 6: Internal bindings

Zero hits across all files.
