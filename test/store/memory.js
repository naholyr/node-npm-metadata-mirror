var MemoryStore = require('../..').store.Memory;

describe('Memory Store', require('../lib/store')(function initMemoryStore (done) {
  done(new MemoryStore());
}));
