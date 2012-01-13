var BaseStore = require('./index').Store,
    util = require('util');

function MemoryStore (options) {
  BaseStore.call(this, options);

  var modules = {};
  var last_seq = null;

  this.emit("ready");

  this.has = function (key, cb) {
    cb(null, !!modules[key] && !modules[key].deleted);
  };

  this.get = function (key, cb) {
    cb(null, modules[key] || null);
  };

  this.put = function (key, data, cb) {
    var insert = !modules[key] || modules[key].deleted;
    modules[key] = data;
    if (cb) cb(null, insert, data);
  };

  this.remove = function (key, cb) {
    var found = false;
    if (modules[key]) {
      modules[key].deleted = true;
      found = true;
    }
    if (cb) cb(null, found);
  };

  this.lastSeq = function (value, cb) {
    if (typeof value === 'function') {
      cb = value;
      value = null;
    }
    if (typeof value === 'number') {
      last_seq = value;
    }
    if (cb) cb(null, last_seq || 0);
  };

  function getMany (emit, done, deleted) {
    if (emit) {
      for (var id in modules) {
        if ((!deleted && !modules[id].deleted) || (deleted && modules[id].deleted)) {
          emit(null, id, modules[id]);
        }
      }
    }
    if (done) done();
  }

  this.getAll = function (emit, done) {
    getMany(emit, done, false);
  };

  this.getGraveyard = function (emit, done) {
    getMany(emit, done, true);
  };

  this.close = function (cb) {
    modules = {};
    last_seq = null;
    if (cb) cb();
  };

}

util.inherits(MemoryStore, BaseStore);

module.exports = MemoryStore;
