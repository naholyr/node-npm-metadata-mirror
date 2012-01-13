var mongo = require('mongodb'),
    Db = mongo.Db,
    Server = mongo.Server,
    BaseStore = require('./index').Store,
    util = require('util');

function MongoStore (options) {
  BaseStore.call(this, options);

  var closed = false;
  var exec = (function (self) {
    var client, collection, queue = [];

    if (self.options.constructor && self.options.constructor.prototype && self.options.constructor.prototype.db) {
      client = options;
    } else {
      client = new Db(self.options.db || 'test', new Server(self.options.host || '127.0.0.1', self.options.port || 27017, self.options.serverOptions || {}), self.options.dbOptions || {});
    }

    var connect = function connect () {
      if (!closed && client.state != 'connected' && client.state != 'connecting') {
        client.open(function (err) {
          if (err) {
            self.emit("error", err);
          } else {
            client.collection(self.options.collection || 'modules', function (err, coll) {
              if (err) {
                self.emit("error", err);
              } else {
                collection = coll;
                for (var i=0; i<queue.length; i++) {
                  collection[queue[i][0]].apply(collection, queue[i][1]);
                }
              }
            });
          }
        });
      }
    };

    client.on("close", function () {
      self.emit("end");
      connect();
    }).on("error", function (err) {
      self.emit("error", err);
      connect();
    });

    self.emit("ready");

    return function exec (name, args) {
      if (client.state == 'connected' && typeof collection !== 'undefined') {
        if (name == 'close') {
          client[name].apply(client, args);
        } else {
          collection[name].apply(collection, args);
        }
      } else {
        queue.push([name, args]);
        connect();
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
      exec("save", [{"_id": "sequence:last_seq", "value": value}, {"safe": true, "upsert": true}, function (err, result) {
        cb(err, result.value);
      }]);
    } else {
      exec("findOne", [{"_id": "sequence:last_seq"}, function (err, result) {
        cb(err, result ? result.value : 0);
      }]);
    }
  };

  function getMany (emit, deleted) {
    exec("find", [{"_id": {"$ne": "sequence:last_seq"}, "deleted": deleted}, function (err, cursor) {
      if (err) {
        emit(err);
      } else {
        cursor.toArray(emit);
      }
    }]);
  }

  this.getAll = function (emit) {
    getMany(emit, false);
  };

  this.getGraveyard = function (emit) {
    getMany(emit, true);
  };

  this.close = function () {
    closed = true;
    exec("close");
  };

}

util.inherits(MongoStore, BaseStore);

module.exports = MongoStore;
module.exports.mongo = mongo;
