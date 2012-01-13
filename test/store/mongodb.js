var mongo = require('mongodb'),
    Db = mongo.Db,
    Server = mongo.Server,
    MongoStore = require('../..').store.MongoDB;

describe('MongoDB Store', require('../lib/store')(function initRedisStore (done) {
  var client = new Db('test_npmmetadatamirror', new Server('127.0.0.1', 27017, {}), {});
  client.open(function (err) {
    if (err) return done(err);
    client.dropDatabase(function (err) {
      if (err) return done(err);
      done(new MongoStore({"client": client}));
    });
  });
}));
