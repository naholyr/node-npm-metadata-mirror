var api = require('..');

describe('API', function () {

  it('should be a function', function () {
    api.should.be.a('function').and.have.lengthOf(1);
  });

  it('should expose monitor function', function () {
    api.should.have.ownProperty('monitor');
    api.monitor.should.be.a('function').and.have.lengthOf(1);
  });

  it('should expose stores', function () {
    api.should.have.ownProperty('store');
    describe('stores should contain', function () {
      it('base class', function () {
        api.store.should.have.ownProperty('Store');
      });
      it('memory', function () {
        api.store.should.have.ownProperty('Memory');
      });
      it('redis', function () {
        api.store.should.have.ownProperty('Redis');
      });
      it('mongodb', function () {
        api.store.should.have.ownProperty('MongoDB');
      });
    });
  });

  it('should expose log4js', function () {
    api.should.have.ownProperty('log4js');
    api.log4js.should.eql(require('../node_modules/log4js'));
  });

});
