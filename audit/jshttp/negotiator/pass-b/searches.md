# Pass B — Raw Search Results

Package: negotiator v1.1.0
Commit: 14b0a7b88e7e7bb1cae38681195951bff29ca2fd
Runtime dep: content-type v2.1.0 (zero transitive deps)

Production files searched:
- `$PACKAGE_ROOT/index.js`
- `$PACKAGE_ROOT/lib/accept.js`
- `$PACKAGE_ROOT/lib/charset.js`
- `$PACKAGE_ROOT/lib/encoding.js`
- `$PACKAGE_ROOT/lib/language.js`
- `$PACKAGE_ROOT/lib/mediaType.js`
- `$PACKAGE_ROOT/node_modules/content-type/dist/index.js`

## Group 1: Imports/requires

Production-file hits only:

```
$PACKAGE_ROOT/index.js:11:var preferredCharsets = require('./lib/charset')
$PACKAGE_ROOT/index.js:12:var preferredEncodings = require('./lib/encoding')
$PACKAGE_ROOT/index.js:13:var preferredLanguages = require('./lib/language')
$PACKAGE_ROOT/index.js:14:var preferredMediaTypes = require('./lib/mediaType')
$PACKAGE_ROOT/lib/accept.js:9:var contentType = require('content-type');
$PACKAGE_ROOT/lib/charset.js:11:var parseAccept = require('./accept');
$PACKAGE_ROOT/lib/encoding.js:11:var parseAccept = require('./accept');
$PACKAGE_ROOT/lib/language.js:11:var contentType = require('content-type');
$PACKAGE_ROOT/lib/language.js:12:var parseAccept = require('./accept');
$PACKAGE_ROOT/lib/mediaType.js:11:var contentType = require('content-type');
$PACKAGE_ROOT/lib/mediaType.js:12:var parseAcceptHeader = require('./accept');
```

All requires are either local (`./lib/*`, `./accept`) or the declared dependency `content-type`.
No `node:` prefixed imports. No dynamic `import()`. No core module requires (http, fs, net, etc.).

## Group 2: Globals/builtins

Production-file hits: **NONE**

All hits were in examples/ (Buffer) and package-lock.json (process-on-spawn). Zero production code references to Buffer, process, globalThis, global, extends, or inherits.

## Group 3: Prototype/property mutation

Production-file hits:

```
$PACKAGE_ROOT/index.js:38:Negotiator.prototype.charset = function charset(available) {
$PACKAGE_ROOT/index.js:43:Negotiator.prototype.charsets = function charsets(available) {
$PACKAGE_ROOT/index.js:47:Negotiator.prototype.encoding = function encoding(available, opts) {
$PACKAGE_ROOT/index.js:52:Negotiator.prototype.encodings = function encodings(available, options) {
$PACKAGE_ROOT/index.js:57:Negotiator.prototype.language = function language(available) {
$PACKAGE_ROOT/index.js:62:Negotiator.prototype.languages = function languages(available) {
$PACKAGE_ROOT/index.js:66:Negotiator.prototype.mediaType = function mediaType(available) {
$PACKAGE_ROOT/index.js:71:Negotiator.prototype.mediaTypes = function mediaTypes(available) {
$PACKAGE_ROOT/index.js:76:Negotiator.prototype.preferredCharset = Negotiator.prototype.charset;
$PACKAGE_ROOT/index.js:77:Negotiator.prototype.preferredCharsets = Negotiator.prototype.charsets;
$PACKAGE_ROOT/index.js:78:Negotiator.prototype.preferredEncoding = Negotiator.prototype.encoding;
$PACKAGE_ROOT/index.js:79:Negotiator.prototype.preferredEncodings = Negotiator.prototype.encodings;
$PACKAGE_ROOT/index.js:80:Negotiator.prototype.preferredLanguage = Negotiator.prototype.language;
$PACKAGE_ROOT/index.js:81:Negotiator.prototype.preferredLanguages = Negotiator.prototype.languages;
$PACKAGE_ROOT/index.js:82:Negotiator.prototype.preferredMediaType = Negotiator.prototype.mediaType;
$PACKAGE_ROOT/index.js:83:Negotiator.prototype.preferredMediaTypes = Negotiator.prototype.mediaTypes;
$PACKAGE_ROOT/node_modules/content-type/dist/index.js:7:Object.defineProperty(exports, "__esModule", { value: true });
$PACKAGE_ROOT/node_modules/content-type/dist/index.js:29:    C.prototype = Object.create(null);
```

Also in source map comment (line 25): `__proto__: null` — but only as a comment string, not executable code.

## Group 4: Patching keywords

Production-file hits: **NONE**

All hits were in package-lock.json (wrap-ansi, spawn-wrap, word-wrap — all devDependencies). Zero production code references to patch, wrap, shim, polyfill, or override.

## Group 5: Module system hooks

**ZERO HITS** across all files (production and non-production).

## Group 6: Internal bindings

**ZERO HITS** across all files (production and non-production).
