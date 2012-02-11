var streamToJSON = require('../util').streamToJSON;

module.exports = require('./base')('continuous', function (res, ev, logger, process, next) {
  res.on('data', function (change) {
    var json;
    try {
      json = JSON.parse(change.toString());
    } catch (e) {
      json = null;
      ev.emit("error", e);
    }
    if (json !== null) {
      process(json, function (err) {
        if (err) {
          ev.emit("error", err);
        }
      });
    }
  }).on('error', function (err) {
    ev.emit('error', err);
    next();
  }).on('close', function () {
    next();
  });
});
