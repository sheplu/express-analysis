# Pass A — Raw Search Results

Package: accepts v2.0.0, commit 19db02a  
Search root: `$PACKAGE_ROOT/`

## Group 1: require/import/from/node:

```
index.js:15:var Negotiator = require('negotiator')
index.js:16:var mime = require('mime-types')
node_modules/negotiator/lib/charset.js:11:var parseAccept = require('./accept');
node_modules/mime-db/index.js:12:module.exports = require('./db.json')
node_modules/negotiator/lib/mediaType.js:11:var contentType = require('content-type');
node_modules/negotiator/lib/mediaType.js:12:var parseAcceptHeader = require('./accept');
node_modules/negotiator/lib/language.js:11:var contentType = require('content-type');
node_modules/negotiator/lib/language.js:12:var parseAccept = require('./accept');
node_modules/mime-types/index.js:15:var db = require('mime-db')
node_modules/mime-types/index.js:16:var extname = require('path').extname
node_modules/mime-types/index.js:17:var mimeScore = require('./mimeScore')
node_modules/negotiator/index.js:11:var preferredCharsets = require('./lib/charset')
node_modules/negotiator/index.js:12:var preferredEncodings = require('./lib/encoding')
node_modules/negotiator/index.js:13:var preferredLanguages = require('./lib/language')
node_modules/negotiator/index.js:14:var preferredMediaTypes = require('./lib/mediaType')
node_modules/negotiator/lib/encoding.js:11:var parseAccept = require('./accept');
node_modules/negotiator/lib/accept.js:9:var contentType = require('content-type');
```

Non-production hits (README.md, package-lock.json) excluded from analysis.

## Group 2: Buffer/process/globalThis/global/extends/inherits

Production file hits: **NONE**

All hits were in package-lock.json (devDep references) and mime-db/db.json (MIME type strings like "message/global"). No production JS code references Buffer, process, globalThis, global, extends, or inherits.

## Group 3: .prototype/defineProperty/Object.assign/__proto__/setPrototypeOf

### Production file hits:

```
index.js:83:Accepts.prototype.type =
index.js:84:Accepts.prototype.types = function (types_) {
index.js:127:Accepts.prototype.encoding =
index.js:128:Accepts.prototype.encodings = function (encodings_) {
index.js:160:Accepts.prototype.charset =
index.js:161:Accepts.prototype.charsets = function (charsets_) {
index.js:193:Accepts.prototype.lang =
index.js:194:Accepts.prototype.langs =
index.js:195:Accepts.prototype.language =
index.js:196:Accepts.prototype.languages = function (languages_) {

node_modules/negotiator/index.js:38:Negotiator.prototype.charset = function charset(available) {
node_modules/negotiator/index.js:43:Negotiator.prototype.charsets = function charsets(available) {
node_modules/negotiator/index.js:47:Negotiator.prototype.encoding = function encoding(available, opts) {
node_modules/negotiator/index.js:52:Negotiator.prototype.encodings = function encodings(available, options) {
node_modules/negotiator/index.js:57:Negotiator.prototype.language = function language(available) {
node_modules/negotiator/index.js:62:Negotiator.prototype.languages = function languages(available) {
node_modules/negotiator/index.js:66:Negotiator.prototype.mediaType = function mediaType(available) {
node_modules/negotiator/index.js:71:Negotiator.prototype.mediaTypes = function mediaTypes(available) {
node_modules/negotiator/index.js:76-83: Negotiator.prototype.preferredCharset = ... (backwards compat aliases)

node_modules/content-type/dist/index.js:7:Object.defineProperty(exports, "__esModule", { value: true });
node_modules/content-type/dist/index.js:29:    C.prototype = Object.create(null);
```

## Group 4: monkey?patch/patch/wrap/shim/polyfill/override

Production file hits: **NONE**

All hits were in package-lock.json (devDep names like wrap-ansi, spawn-wrap, es-shim-unscopables) and mime-db data files (MIME types like "application/json-patch+json"). No production JS code contains these keywords.

## Group 5: require.cache/require.extensions/Module._*

Production file hits: **NONE**

## Group 6: process.binding/_linkedBinding/internalBinding/_http_/internal/

Production file hits: **NONE**
