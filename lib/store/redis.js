var redis = require('redis'),
    BaseStore = require('./index').Store,
    util = require('util');

function RedisStore (options) {
  BaseStore.call(this, options);

  var client = this.options.client || redis.createClient(this.options);

  var self = this;
  client.on("error", function (err) {
    self.emit("error", err);
  }).on("end", function () {
    self.emit("end");
  }).on("ready", function () {
    self.emit("ready");
  });
  if (client.ready) {
    self.emit("ready");
  }

  var _key = (function _key(id, ns) {
    return (this.options.prefix || '') + (ns || "module:") + id;
  }).bind(this);

  this.has = function (key, cb) {
    client.exists(_key(key), cb);
  };

  this.get = function (key, cb) {
    client.get(_key(key), function (err, json) {
      if (err) {
        cb(err);
      } else {
        var data;
        try {
          data = JSON.parse(json);
        } catch (e) {
          err = e;
        }
        cb(err, data);
      }
    });
  };

  this.put = function (key, data, cb) {
    client.getset(_key(key), JSON.stringify(data), function (err, old_data) {
      if (cb) cb(err, !old_data, data);
    });
  };

  this.remove = function (key, cb) {
    client.get(_key(key), function (err, json) {
      if (err) {
        cb(err, false);
      } else {
        client.set(_key(key, "module/deleted:"), json);
        client.del(_key(key), function (err, nb) {
          cb(err, nb === 1);
        });
      }
    });
  };

  this.lastSeq = function (value, cb) {
    if (typeof value === 'function') {
      cb = value;
      value = null;
    }
    if (typeof value === 'number') {
      client.set(_key("last_seq", "seq:"), value, function (err) {
        cb(err, parseInt(value, 10));
      });
    } else {
      client.get(_key("last_seq", "seq:"), function (err, last_seq) {
        cb(err, parseInt(last_seq || 0, 10));
      });
    }
  };

  function getMany (emit, done, deleted) {
    client.keys(_key('*', deleted ? 'module/deleted:' : undefined), function (err, keys) {
      if (err) {
        done(err);
      } else if (keys.length > 0 && emit) {
        client.mget(keys, function (err, jsons) {
          if (err) {
            done(err, keys.length);
          } else {
            var data;
            for (var i=0; i<jsons.length; i++) {
              err = data = null;
              try {
                data = JSON.parse(jsons[i]);
              } catch (e) {
                err = e;
              }
              if (!err) {
                emit(data);
              } else {
                done(err, keys.length);
                break;
              }
            }
          }
        });
      } else if (done) {
        done(null, keys.length);
      }
    });
  }

  this.getAll = function (emit, done) {
    getMany(emit, done, false);
  };

  this.getGraveyard = function (emit, done) {
    getMany(emit, done, true);
  };

  this.close = function (cb) {
    var self = this;
    client.end();
    if (cb) client.stream.on("end", cb);
  };

}

util.inherits(RedisStore, BaseStore);

module.exports = RedisStore;
module.exports.redis = redis;
