var streamToJSON = require('../util').streamToJSON,
    async = require('async');

module.exports = require('./base')('longpoll', function (res, ev, logger, emit, next) {

  streamToJSON(res, function (err, changes) {
    if (err) {
      ev.emit("error", err);
      next();
    } else {
      if (changes.results) {
        async.forEach(changes.results, emit, function (err) {
          if (err) {
            ev.emit("error", err);
          } else {
            next();
          }
        });
      } else {
        next();
      }
    }
  });

});
