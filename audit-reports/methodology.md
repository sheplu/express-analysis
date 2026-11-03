# Monkeypatch Audit Methodology

## Purpose

This audit identifies every instance where Express.js and its dependency tree modify objects they do not own — specifically Node.js built-in prototypes, instances, and globals. The results inform Express v6 planning (issue [#7502](https://github.com/expressjs/express/issues/7502)).

## Definition of "Monkeypatch"

Seven categories, labeled A–G:

### Category A — Prototype Chain Manipulation
Changing the prototype chain of objects the module does not own at runtime.
- `Object.setPrototypeOf(foreignObj, newProto)`
- `obj.__proto__ = ...` assignments

### Category B — Prototype Extension
Adding methods, getters, or setters to a prototype chain derived from a foreign class.
- Adding `req.get()` to an object whose prototype is `http.IncomingMessage.prototype`
- `Object.defineProperty` on an object in a foreign prototype chain

### Category C — Instance Property Injection
Writing properties onto individual object instances the module does not own.
- `req.body = parsed`, `req.res = res`, `req._parsedUrl = ...`
- Both public and underscore-prefixed private properties

### Category D — Property Descriptor Copying
Using `merge-descriptors` or similar to bulk-copy property descriptors between objects, blending prototype boundaries.
- `mixin(app, EventEmitter.prototype, false)`

### Category E — Global Prototype Pollution
Adding properties to built-in JavaScript prototypes.
- `Function.prototype.once = ...`
- `Object.prototype.xxx = ...`

### Category F — Method Wrapping / Interception
Replacing a method on an object you don't own with a wrapper that calls the original.
- Wrapping `res.assignSocket` or `res.end` to detect completion

### Category G — Internal/Private Property Access (Informational)
Reading Node.js internal/private properties without modifying them.
- Accessing `stream._readableState`, `res._headers`
- Documented as informational findings, not blocking

## What is NOT a Monkeypatch

- Calling standard APIs: `res.setHeader()`, `res.end()`, `res.write()`
- Reading properties via standard getters: `req.headers`, `req.url`
- Adding event listeners via `.on()` / `.once()` / `.addListener()`
- Setting properties on objects the module itself created (e.g., `this.stack = []` inside a Router constructor)

## Audit Process per Package

1. **Identify source files**: `find <pkg> -name "*.js" -not -path "*/test/*"`
2. **Automated pattern scan**: grep for `Object.setPrototypeOf`, `Object.defineProperty`, `__defineGetter__`, `__proto__`, `.prototype.`, `Object.create`, property assignments to `req`/`res`/`msg` parameters
3. **Manual code review**: read every source file for patterns the grep missed
4. **Classify** each finding into categories A–G
5. **Cross-reference** with Node.js source at `/Users/sheplu/code/nodejs/node`
6. **Triple-check** every finding (see below)

## Triple-Check Verification

Every finding must pass all three checks:

1. **Automated pattern match**: the grep patterns must flag the line
2. **Manual code reading**: confirm the object is foreign, the code path is reachable, and it runs in production
3. **Call-chain tracing**: trace from Express entry points to confirm the mutation occurs in real usage

## Severity Levels

- **Critical**: Modifies global prototypes or affects all instances of a Node.js class
- **High**: Runtime prototype swapping on live Node.js objects per request
- **Medium**: Instance property injection on objects not owned by the module
- **Low**: Indirect interaction via wrapping or descriptor copying
- **Informational**: Private property reads, latent code paths not triggered by Express
