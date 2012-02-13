[![Build Status](https://secure.travis-ci.org/naholyr/node-npm-metadata-mirror.png)](http://travis-ci.org/naholyr/node-npm-metadata-mirror)

# npm metadata mirror

Monitor NPM changes and keep an up-to-date mirror of modules metadata (not the whole data, i.e. including attachments info, but not attachments body).

Note that as for today, the metadata Redis DB is around 35M for only 1 rev / module (it should raise to 200M or 300M with all revisions), while the official CouchDB repository is around 7GB. You can imagine why you may want to mirror only metadata without attachment body.

This module is intended to be part of a specific project, so it may not be as generic as it could, but feel free to use it for your own needs.

**Warning**: API is still not stable. Wait for version `1.x` which should come as soon as I write unit tests, before considering intensively using this module. Public API should remain as documented here, but there is no guarantee (you can't imagine how it changed between 0.0.2 and 0.0.3 already :P).

## Installation

Install this like any other node module.

If you don't know how to do it, you don't need a npm metadata mirror, do you ?

## Usage

### Module

Load module:

```javascript
var mirror = require('npm-metadata-mirror');
```

Standard usage:

```javascript
// Start mirroring to local Redis database
mirror();
```

Don't have Redis installed ? Oh dear, you should :-\ You can still store data in-memory, but that's not a very good idea:

```javascript
// Start mirroring to memory.
// Each time you start this, it will restart mirrorring from nothing.
// Which means loading 6000+ modules in memory.
// Again and again.
// You're really sure you want to do this?
mirror({
  "store": new (mirror.store.Memory)()
});
```

Only want to monitor changes, and handle all the operations yourself ? A monitoring module is used internally, and publicly exposed to provide you this facility.

```javascript
var monitor = mirror.monitor({
  "delay":    5000, // delay between two monitoring requests
  "last_seq": null  // ask for CouchDB changes since this revision, or null for "from now"
  // "couch": ...   // connection information, the same as mirror()
})
monitor.on("delete", function (id) {
  // Module "id" deleted
})
monitor.on("update", function (id, metadata) {
  // Module "id" added or updated.
  // "metadata" is the CouchDB metadata
})
monitor.on("new", function (id, metadata) {
  // Same as the "update" event, but for modules published for the first time
})
monitor.on("rev", function (last_seq, nb_changes) {
  // Current DB revision fetched is "last_seq" (shouldn't be null)
})
monitor.on("poll", function (last_seq) {
  // Started polling DB for changes since rev "last_seq" (can be null)
})
monitor.on("error", function (err) {
  // An error occurred, note that this doesn't stop the monitoring
  // but you can here, by manually calling "this.stop()".
  // You can also test "this.connected" to check if connection is active or not.
})
monitor.on("end", function () {
  // monitoring is stopped
})
monitor.on("start", function () {
  // started monitoring
  // example: plan stop monitoring after 30 seconds (lazy dude!)
  setTimeout(function () {
    monitor.stop() // will trigger "end"
  }, 30000)
})
monitor.start() // Will trigger "start"

// Properties: monitor.options = passed options. You can modify them "on the fly" if you need to.
```

Or maybe you even want to access the internal monitor running during a mirrorring process? A bit greedy? OK:

```javascript
mirror(options, function (err, monitor, last_seq) {
  // You can access the running monitor, and add your own processes attached to its events
  monitor.stop() // or do dumb things
})
```

You may also want to access some other internals, I know it's comfortable so I expose them all:

```javascript
// Configure logging using log4js module
// See https://github.com/csausdev/log4js-node
mirror.log4js.addAppender(log4js.fileAppender('logs/mirror.log'), 'npm-metadata-mirror')
mirror.log4js.addAppender(log4js.fileAppender('logs/monitor.log'), 'npm-metadata-monitor')

// Starting a mirror returns some of his internals
var mirror_internals = mirror(options)

// Use the logger:
mirror_internals.logger.info('Hello, I\'ll add info in mirror log file :)')
// This is the same:
mirror.log4js.getLogger('npm-metadata-mirror').info('...')

// Access the internal monitor...
mirror_internals.monitor.on("end", function () {
  // ... who also exposes its own logger, of course
  this.logger.fatal("Oh no! I should never end, I'm so cool :(")
})
```

### Command line

```
npm-metadata-mirror [options]
```

Options are all the available options passed to `mirror` function. See the next section "Options" for a comprehensive list of all available options.

Example:

```bash
# Redis is installed on a special port
npm-metadata-mirror --store.engine=Redis --store.engine.options.port=12093
```

## Options

Supported options:

```javascript
{
  // Common options (monitor & mirror)
  "delay":    0,      // Delay (ms) before retrying in case of error
  "last_seq": null,   // CouchDB revision since start of the mirroring
  "concurrency": 10,  // Max parallel queries to CouchDB host
  "mode": "longpoll", // Request mode: continuous or longpoll

  // Mirror options
  "couch": // CouchDB server information
  {
    "host":   "isaacs.iriscouch.com",
    "db":     "registry",
    "port":   80
  },
  "store": // Store engine parameters
  // Can be a direct instance of Store, or a hash
  {
    "engine": "MongoDB",          // Name of the class in the default stores
    "module": "./path/to/module", // Path to module in case of a custom engine
    // Note that "engine" and "module" are exclusive
    "options": {}                 // Options for the engine constructor
  }
}
```

### Redis

Supported options:

```javascript
{
  "client": null, // Instance of Redis client (use module "redis")
  // Following options are ignored if you passed your own client instance
  "host": "127.0.0.1",
  "port": 6379,
  "db": 0
}
```

Authentication is not supported yet. If you need it, feel free to contribute, or simply initialize your own Redis client.

### MongoDB

Supported options:

```javascript
{
  "client": null, // Instance of Db client (use module "mongodb")
  // Following options are ignored if you passed you own client instance
  "host": "127.0.0.1",
  "port": 27017,
  "db":   "test"
}
```

Like Redis, authentication is not supported yet. Feel free to contribute or use your own client instance.

## Storage engines

### Available engines

* In memory: `mirror.store.Memory`. This engine is not advised as it won't persist your data, but it requires no dependency.
* Redis: `mirror.store.Memory`. This engine will be super fast, but the metadata is stored as a JSON string, hard to query.
* Mongo DB: `mirror.store.MongoDB`. As Mongo DB directly supports JSON, you'll be able to query your metadata mirror more easily.

### Write your own

Write a store engine as a module, which should expose a class extending base `Store` class provided in `mirror.store`. Here is a bootstrap:

```javascript
var BaseStore = require('npm-metadata-mirror').store.Store,
    util = require('util');

// Your store engine
function MyStore (options) {
  // extend BaseStore: your engine is an event emitter and implements the "ready(cb)" method
  BaseStore.call(this, options);

  // Initialize your store, then emit the "ready" event to notify you're ready to work
  this.emit("ready");
}

// Check if a module exists
// has( "module name", [ function (error, exists) ] )
MyStore.prototype.has = function (key, cb);

// Retrieve module metadata
// get ( "module name", [ function (error, metadata) ] )
MyStore.prototype.get = function (key, cb);

// Insert or update module metadata
// put ( "module name", metadata, [ function (error, inserted, metadata) ] )
MyStore.prototype.put = function (key, data, cb);

// Remove a module
// remove ( "module name", [ function (error, found) ] )
MyStore.prototype.remove = function (key, cb);

// Update or retrieve last_seq so that next calls to mirror will know where to start
// lastSeq ( [ value ], [ function (error, value) ])
MyStore.prototype.lastSeq = function (value, cb);

  function getMany (emit, done, deleted);
          emit(null, id, modules[id]);
    if (done) done();
  }

// Retrieve all active modules: first callback is called once for each module, second one is called at end
// getAll ( function (error, "module name", metadata), function (error) )
MyStore.prototype.getAll = function (emit, done);

// Retrieve all deleted modules: same callbacks as getAll()
// getAll ( function (error, "module name", metadata), function (error) )
MyStore.prototype.getGraveyard = function (emit, done);

// Close your engine connection
// close ( function () )
MyStore.prototype.close = function (cb);

// Extend BaseStore
util.inherits(MemoryStore, BaseStore);

// Expose your class
module.exports = MyStore;
```

See [https://github.com/naholyr/node-npm-metadata-mirror/blob/master/lib/store/memory.js](`lib/store/memory.js`) for a simple example.

## TODO

* Retrieve all versions of a module at first load.
* Support authentication in Redis and MongoDB engines.
* Add auto-retry when retrieving metadata in monitor.
* Unit test the monitor and the mirror public API (should I mock the target CouchDB ?…).

## License: MIT

```
Copyright (c) 2011 Nicolas Chambrier

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
