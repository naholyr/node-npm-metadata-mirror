var http = require('http'),
    async = require('async'),
    streamToJSON = require('./util').streamToJSON,
    EventEmitter = require('events').EventEmitter,
    log4js = require('log4js');

module.exports = monitor;

function monitor (options) {
  var last_seq = options.last_seq, // Current DB revision
      ev = new EventEmitter(),     // Event driven API
      stopped = true,              // Working status
      logger = log4js.getLogger('npm-metadata-monitor');

  if (!last_seq && last_seq !== 0) {
    last_seq = null;
  }

  ev.logger = logger;
  ev.options = options;
  ev.connected = false;

  ev.stop = function () {
    if (stopped) {
      var message = 'Cannot stop: monitoring is already stopped';
      ev.emit("error", new Error(message));
      logger.error(message);
    } else {
      logger.debug('Stopping monitoring');
      stopped = true;
      // TODO really stop operations now
      this.emit("end");
    }
    return this;
  };

  ev.start = function (since) {
    if (!stopped) {
      var message = 'Cannot start: monitoring is already started';
      ev.emit("error", new Error(message));
      logger.error(message);
    } else {
      logger.debug('Started monitoring%s', (typeof since != 'undefined') ? (' since ' + since) : '');
      stopped = false;
      ev.emit("start");
      if (typeof since != 'undefined') {
        last_seq = since;
      }
      poll();
    }
    return this;
  };

  function next_poll () {
    logger.info('Next poll in %d ms', options.delay);
    setTimeout(poll, options.delay);
  }

  function poll () {
    var path = '/' + encodeURIComponent(options.couch.db) + '/_changes?feed=longpoll';
    if (last_seq !== null) {
      path += '&since=' + encodeURIComponent(last_seq);
    }
    ev.connected = false;
    ev.emit("poll", last_seq);
    logger.info('Polling URL: "http://%s:%d/%s"', options.couch.host, options.couch.port || 80, path);
    http.request({
      "host": options.couch.host,
      "port": options.couch.port || 80,
      "path": path
    }, function (res) {
      ev.connected = true;
      logger.debug('Response status = %d', res.statusCode);
      if (res.statusCode == 200) {
        streamToJSON(res, function (err, changes) {
          if (err) {
            ev.emit("error", err);
            next_poll();
          } else {
            logger.debug('Response JSON', changes);
            process(changes, next_poll);
          }
        });
      } else {
        streamToJSON(res, function (err, response) {
          if (err) {
            logger.error('Unexpected response, and it is not even valid JSON. Are you sure you connect to CouchDB?');
            logger.trace(response);
            logger.trace(err);
          } else {
            logger.error('Unexpected response: %s', JSON.stringify(response));
          }
          next_poll();
        });
      }
    }).on('error', function (err) {
      ev.connected = false;
      logger.error('Request error: %s', err.toString());
      logger.trace(err);
      ev.emit("error", err);
      next_poll();
    }).end();
  }

  function process (changes, next) {
    if (changes.last_seq) {
      last_seq = changes.last_seq;
    }
    function finish () {
      ev.emit("rev", last_seq, changes.results ? changes.results.length : 0);
      next();
    }
    if (changes.results) {
      var module_changes = [];
      for (var i=0; i<changes.results.length; ++i) {
        if (changes.results[i].deleted) {
          ev.emit("delete", changes.results[i].id);
        } else {
          module_changes.push({"id": changes.results[i].id, "rev": changes.results[i].changes[0].rev, "seq": changes.results[i].seq});
        }
      }
      async.map(module_changes, get_metadata, function (err, metadatas) {
        if (err) {
          ev.emit("error", err);
        } else {
          for (var i=0; i<metadatas.length; i++) {
            // TODO Ignore if there is no attachment for this version: it means it's a "free" update, we only want the ones with true .tar.gz
            ev.emit(metadatas[i].time.modified == metadatas[i].time.created ? "new" : "update", metadatas[i]._id, metadatas[i]);
          }
          finish();
        }
      });
    } else {
      finish();
    }
  }

  function get_metadata (change, cb) {
    path = '/' + encodeURIComponent(options.couch.db) + '/' + encodeURIComponent(change.id) + '?rev=' + change.rev;
    http.request({
      "host": options.couch.host,
      "port": options.couch.port || 80,
      "path": path
    }, function (res) {
      if (res.statusCode == 200) {
        streamToJSON(res, function (err, json) {
          if (!err) logger.debug('Response JSON', json);
          cb(err, json);
        });
      } else {
        // TODO provide a way to read response body for debugging purpose ?
        var message = 'Failed retrieving metadata for "' + id + '" (response status = ' + res.statusCode + ')';
        logger.error(message);
        logger.trace(res);
        cb(new Error(message));
      }
    }).on("error", cb).end();
  }

  return ev;
}
