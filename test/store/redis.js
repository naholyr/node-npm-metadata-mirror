var redis = require('redis'),
    RedisStore = require('../..').store.Redis;

describe('Redis Store', require('../lib/store')(function initRedisStore (done) {
  var client = redis.createClient();
  client.keys('npm:testnpmmetadatamirror:*', function (err, keys) {
    if (err) throw err;
    if (keys.length > 0) {
      client.del(keys, function (err) {
        if (err) throw err;
        ok();
      });
    } else {
      ok();
    }
    function ok () {
      done(new RedisStore({"client": client, "prefix": 'npm:testnpmmetadatamirror:'}));
    }
  });
}));
