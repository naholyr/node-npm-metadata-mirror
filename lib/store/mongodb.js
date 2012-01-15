var mongo = require('mongodb'),
    Db = mongo.Db,
    Server = mongo.Server,
    BaseStore = require('./index').Store,
    util = require('util');

function MongoStore (options) {
  BaseStore.call(this, options);

  var closed = false;
  var exec = (function (self) {
    var client, collection = null, queue = [], ready_emitted = false, connecting = false;

    client = self.options.client || new Db(self.options.db || 'test', new Server(self.options.host || '127.0.0.1', parseInt(self.options.port, 10) || 27017, self.options.serverOptions || {}), self.options.dbOptions || {});

    var connect = function connect () {

      if (closed || connecting) return;
      connecting = true;

      function get_collection () {
        client.collection(self.options.collection || 'modules', function (err, coll) {
          if (err) {
            self.emit("error", err);
          } else {
            collection = coll;
            flush();
          }
        });
      }

      function flush () {
        if (!ready_emitted) {
          ready_emitted = true;
          self.emit("ready");
        }
        for (var i=0; i<queue.length; i++) {
          execInstant(queue[i][0], queue[i][1]);
        }
      }

      if (client.state != 'connected' && client.state != 'connecting') {
        client.open(function (err) {
          if (err) {
            self.emit("error", err);
          } else {
            get_collection();
          }
        });
      } else if (client.state == 'connected' && collection === null) {
        get_collection();
      } else if (collection !== null) {
        flush();
      }
    };

    client.on("close", function () {
      connecting = false;
      self.emit("end");
      connect();
    }).on("error", function (err) {
      connecting = false;
      self.emit("error", err);
      connect();
    });

    function execInstant (name, args) {
      if (name == 'close') {
        client[name].apply(client, args);
      } else {
        collection[name].apply(collection, args);
      }
    }

    connect();

    return function exec (name, args) {
      if (client.state == 'connected' && typeof collection !== 'undefined') {
        execInstant(name, args);
      } else {
        queue.push([name, args]);
      }
    };

  })(this);

  this.has = function (key, cb) {
    exec("findOne", [{"_id": key, "deleted": false}, function (err, result) { cb(err, !!result); }]);
  };

  this.get = function (key, cb) {
    exec("findOne", [{"_id": key, "deleted": false}, cb]);
  };

  this.put = function (key, data, cb) {
    this.has(key, function (err, exist) {
      if (err) {
        cb(err);
      } else {
        data.deleted = false;
        exec("update", [{"_id": key}, data, {"safe": true, "upsert": true}, function (err) { cb(err, !exist, data); }]);
      }
    });
  };

  this.remove = function (key, cb) {
    exec("update", [{"_id": key}, {"deleted": true}, {"safe": true}, cb]);
  };

  this.lastSeq = function (value, cb) {
    if (typeof value === 'function') {
      cb = value;
      value = null;
    }
    if (typeof value === 'number') {
      exec("save", [{"_id": "sequence:last_seq", "value": value}, {"safe": true, "upsert": true}, function (err) {
        cb(err, value);
      }]);
    } else {
      exec("findOne", [{"_id": "sequence:last_seq"}, function (err, result) {
        cb(err, result ? result.value : 0);
      }]);
    }
  };

  function getMany (emit, done, deleted) {
    exec("find", [{"_id": {"$ne": "sequence:last_seq"}, "deleted": deleted}, function (err, cursor) {
      if (err) {
        done(err);
      } else {
        cursor.toArray(function (err, results) {
          if (err) {
            done(err);
          } else {
            for (var i=0; i<results.length; i++) {
              emit(results[i]);
            }
            done(null, results.length);
          }
        });
      }
    }]);
  }

  this.getAll = function (emit, done) {
    getMany(emit, done, false);
  };

  this.getGraveyard = function (emit, done) {
    getMany(emit, done, true);
  };

  this.close = function (cb) {
    closed = true;
    exec("close");
    // instantly execute callback, as event handlers have been reseted by the close() method
    if (cb) cb();
  };

}

util.inherits(MongoStore, BaseStore);

module.exports = MongoStore;
module.exports.mongo = mongo;
