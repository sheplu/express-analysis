# Pass B — Raw Search Results

## Search Group 1: require/import/from/node:

Production file hits only (excluding README, package-lock.json):

```
$PACKAGE_ROOT/index.js:15:var Negotiator = require('negotiator')
$PACKAGE_ROOT/index.js:16:var mime = require('mime-types')
$PACKAGE_ROOT/node_modules/mime-db/index.js:12:module.exports = require('./db.json')
$PACKAGE_ROOT/node_modules/mime-types/index.js:15:var db = require('mime-db')
$PACKAGE_ROOT/node_modules/mime-types/index.js:16:var extname = require('path').extname
$PACKAGE_ROOT/node_modules/mime-types/index.js:17:var mimeScore = require('./mimeScore')
$PACKAGE_ROOT/node_modules/negotiator/index.js:11:var preferredCharsets = require('./lib/charset')
$PACKAGE_ROOT/node_modules/negotiator/index.js:12:var preferredEncodings = require('./lib/encoding')
$PACKAGE_ROOT/node_modules/negotiator/index.js:13:var preferredLanguages = require('./lib/language')
$PACKAGE_ROOT/node_modules/negotiator/index.js:14:var preferredMediaTypes = require('./lib/mediaType')
$PACKAGE_ROOT/node_modules/negotiator/lib/accept.js:9:var contentType = require('content-type');
$PACKAGE_ROOT/node_modules/negotiator/lib/charset.js:11:var parseAccept = require('./accept');
$PACKAGE_ROOT/node_modules/negotiator/lib/encoding.js:11:var parseAccept = require('./accept');
$PACKAGE_ROOT/node_modules/negotiator/lib/language.js:11:var contentType = require('content-type');
$PACKAGE_ROOT/node_modules/negotiator/lib/language.js:12:var parseAccept = require('./accept');
$PACKAGE_ROOT/node_modules/negotiator/lib/mediaType.js:11:var contentType = require('content-type');
$PACKAGE_ROOT/node_modules/negotiator/lib/mediaType.js:12:var parseAcceptHeader = require('./accept');
```

## Search Group 2: Buffer/process/globalThis/global/extends/inherits

Production file hits: NONE

All hits were in package-lock.json (devDependency metadata) or mime-db/db.json (MIME type names containing "global" in the string, e.g., "message/global"). No production JS code hits.

## Search Group 3: .prototype/defineProperty/Object.assign/__proto__/setPrototypeOf

Production file hits:

```
$PACKAGE_ROOT/index.js:83:Accepts.prototype.type =
$PACKAGE_ROOT/index.js:84:Accepts.prototype.types = function (types_) {
$PACKAGE_ROOT/index.js:127:Accepts.prototype.encoding =
$PACKAGE_ROOT/index.js:128:Accepts.prototype.encodings = function (encodings_) {
$PACKAGE_ROOT/index.js:160:Accepts.prototype.charset =
$PACKAGE_ROOT/index.js:161:Accepts.prototype.charsets = function (charsets_) {
$PACKAGE_ROOT/index.js:193:Accepts.prototype.lang =
$PACKAGE_ROOT/index.js:194:Accepts.prototype.langs =
$PACKAGE_ROOT/index.js:195:Accepts.prototype.language =
$PACKAGE_ROOT/index.js:196:Accepts.prototype.languages = function (languages_) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:38:Negotiator.prototype.charset = function charset(available) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:43:Negotiator.prototype.charsets = function charsets(available) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:47:Negotiator.prototype.encoding = function encoding(available, opts) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:52:Negotiator.prototype.encodings = function encodings(available, options) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:57:Negotiator.prototype.language = function language(available) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:62:Negotiator.prototype.languages = function languages(available) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:66:Negotiator.prototype.mediaType = function mediaType(available) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:71:Negotiator.prototype.mediaTypes = function mediaTypes(available) {
$PACKAGE_ROOT/node_modules/negotiator/index.js:76-83: Negotiator.prototype.preferredCharset = ... (alias assignments)
$PACKAGE_ROOT/node_modules/content-type/dist/index.js:7:Object.defineProperty(exports, "__esModule", { value: true });
$PACKAGE_ROOT/node_modules/content-type/dist/index.js:29:    C.prototype = Object.create(null);
```

## Search Group 4: monkey?patch/patch/wrap/shim/polyfill/override

Production file hits: NONE

All hits were in package-lock.json (devDependency package names like "es-shim-unscopables", "spawn-wrap", "wrap-ansi") or mime-db data (MIME types like "application/json-patch+json"). No production JS code hits.

## Search Group 5: require.cache/require.extensions/Module._*/syncBuiltinESMExports/registerHooks

Production file hits: NONE

## Search Group 6: process.binding/_linkedBinding/internalBinding/_http_/internal/

Production file hits: NONE
