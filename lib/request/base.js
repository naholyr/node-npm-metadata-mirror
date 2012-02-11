var http = require('http'),
    streamToJSON = require('../util').streamToJSON;

module.exports = function (feed, onResponseOK) {
  return function (couch) {
    var base_path = '/' + encodeURIComponent(couch.db) + '/_changes?feed=' + feed;
    return function (last_seq, ev, logger, process, next) {
      var path = base_path + (last_seq !== null ? ('&since='+encodeURIComponent(last_seq)) : '');
      var url = 'http://' + couch.host + (((couch.port || 80) !== 80) ? (':' + couch.port) : '') + path;
      var request = http.request({
          "host": couch.host,
          "port": couch.port || 80,
          "path": path
        }, function (res) {
          ev.connected = true;
          res.on('close', function () {
            ev.connected = false;
          });
          logger.debug('Response status = %d', res.statusCode);
          if (res.statusCode == 200) {
            onResponseOK(res, ev, logger, process, next);
          } else {
            streamToJSON(res, function (err, response) {
              if (err) {
                logger.error('Unexpected response, and it is not even valid JSON. Are you sure you connect to CouchDB?');
                logger.trace(response);
                logger.trace(err);
              } else {
                logger.error('Unexpected response: %s', JSON.stringify(response));
              }
              next();
            });
          }
        }).on('error', function (err) {
          ev.connected = false;
          logger.error('Request error: %s', err.toString());
          logger.trace(err);
          ev.emit("error", err);
          next();
        });

      return {
        "url":    url,
        "start":  function () {
          request.end();
        }
      };
    };
  };
};
