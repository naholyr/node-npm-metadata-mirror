# npm metadata mirror

Monitor NPM changes and keep an up-to-date mirror of modules metadata (not the whole data, i.e. including attachments info, but not attachments body).

This module is intended to be part of a wider project, so it may not be as generic as it could, but feel free to use it for your own needs.

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
// Start mirroring to memory
// Each time you start this, it will restart mirrorring from nothing
// Which means loading 6000+ modules in memory
// Again and again
// You're really sure you want to do this ?
mirror({
  "store": new mirror.store.Memory
});
```

### Command line

```bash
npm-sync [options]
```

Options are all the available options passed to `mirror` function. Except for the `store` option, as it's the initialization of an object:

* `--store.engine` the standard engine used, can be "Memory" or "Redis", default is "Redis".
* `--store.module` the engine class will be loaded from this module, instead of default `mirror.store`.
* `--store.options` the options passed to the engine constructor.

Example:

```bash
# Redis is installed on a special port
npm-sync --store.engine=Redis --store.engine.options.port=12093
```

## TODO

* Add options to Redis engine: host, port, authentication...
* Add tests.
* Add doc (like all the options available, how to build a custom engine, etc...).
* Use log4js

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
