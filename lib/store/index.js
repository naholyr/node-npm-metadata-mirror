var EventEmitter = require('events').EventEmitter,
    util = require('util');

function Store (options) {
  EventEmitter.call(this);

  this.options = options || {};

  // Handle the "ready" event
  (function () {
    var ready = false, queue = [];
    function exec (cb) {
      try {
        cb.call(this);
      } catch (err) {
        this.emit("error", err);
      }
    }
    this.on("ready", function () {
      ready = true;
      while (queue.length > 0) {
        exec.call(this, queue.pop());
      }
    });
    this.ready = function (cb) {
      if (ready) {
        exec.call(this, cb);
      } else {
        queue.push(cb);
      }
    };
  }).call(this);
}

util.inherits(Store, EventEmitter);

exports.Store = Store;

exports.Redis = safe_require('./redis');
exports.Memory = safe_require('./memory');
exports.MongoDB = safe_require('./mongodb');

function safe_require (path) {
  try {
    return require(path);
  } catch (e) {
    return null;
  }
}
