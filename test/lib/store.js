module.exports = function (initialize) {
  return function (store) {

    // Clean all data and connect the store
    beforeEach(function (done) {
      initialize(function (_store) {
        var shouldCatchErrors = true;
        _store.on("error", function (err) {
          if (shouldCatchErrors) done(err);
        });
        _store.ready(function () {
          shouldCatchErrors = false;
          store = _store;
          done();
        });
      });
    });

    // Close connection
    afterEach(function (done) {
      store.close(done);
    });

    it('should be ready', function (done) {
      store.ready(done);
    });

    it('should have no module', function (done) {
      store.ready(function () {
        var count = 0;
        store.getAll(function (data) {
          count++;
        }, function (err) {
          count.should.eql(0);
          done(err);
        });
      });
    });

    it('should be able to retrieve and save last_seq', function (done) {
      store.ready(function () {
        store.lastSeq(function (err, value) {
          if (err) return done(err);
          if (value !== 0) return done(new Error("value should be 0"));
          store.lastSeq(1337, function (err, value) {
            if (err) return done(err);
            if (value !== 1337) return done(new Error("value defined by lastSeq() should be 1337"));
            store.lastSeq(function (err, value) {
              if (err) return done(err);
              if (value !== 1337) return done(new Error("value retrieved by lastSeq() should be 1337"));
              done();
            });
          });
        });
      });
    });

  };
};
