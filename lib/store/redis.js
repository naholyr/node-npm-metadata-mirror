var redis = require('redis');

module.exports = RedisStore;

function RedisStore (options) {

  var client = redis.createClient(options);

  this.has = function (key, cb) {
    client.exists("module:"+key, cb);
  };

  this.get = function (key, cb) {
    client.get("module:"+key, function (err, json) {
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
    client.getset("module:"+key, JSON.stringify(data), function (err, old_data) {
      if (cb) cb(err, !old_data, data);
    });
  };

  this.remove = function (key, cb) {
    client.get("module:"+key, function (err, json) {
      if (err) {
        cb(err, false);
      } else {
        client.set("module/deleted:"+key, json);
        client.del("module:"+key, function (err, nb) {
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
      client.set("last_seq", value, function (err) {
        cb(err, value);
      });
    } else {
      client.get("last_seq", function (err, last_seq) {
        cb(err, last_seq || 0);
      });
    }
  };

  function getMany (emit, deleted) {
    client.keys("module" + (deleted ? "/deleted" : "") + ":*", function (err, keys) {
      if (err) {
        emit(err);
      } else {
        client.mget(keys, function (err, jsons) {
          var data;
          for (var i=0; i<jsons.length; i++) {
            err = data = null;
            try {
              data = JSON.parse(jsons[i]);
            } catch (e) {
              err = e;
            }
            emit(err, data || jsons[i]);
          }
        });
      }
    });
  }

  this.getAll = function (emit) {
    getMany(emit, false);
  };

  this.getGraveyard = function (emit) {
    getMany(emit, true);
  };

}
