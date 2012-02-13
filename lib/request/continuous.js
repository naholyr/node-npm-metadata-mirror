var streamToJSON = require('../util').streamToJSON;

module.exports = require('./base')('continuous', function (res, ev, logger, emit, next) {

  var emit_change = function (string) {
    var json;
    try {
      json = JSON.parse(string);
    } catch (e) {
      json = null;
      ev.emit("error", e);
    }
    if (json !== null) {
      emit(json, function (err) {
        if (err) {
          ev.emit("error", err);
        }
      });
    }
  };

  var buffered = null;
  res.on('data', function (chunk) {
    var string = chunk.toString();
    if (buffered !== null) {
      string = buffered + string;
      buffered = null;
    }
    if (string.charCodeAt(string.length-1) !== 10) {
      buffered = string;
    } else {
      emit_change(string);
    }
  }).on('error', function (err) {
    ev.emit('error', err);
    next();
  }).on('close', function () {
    next();
  });

});
