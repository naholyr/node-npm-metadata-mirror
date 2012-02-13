var http = require('http'),
    streamToJSON = require('./util').streamToJSON,
    EventEmitter = require('events').EventEmitter,
    log4js = require('log4js');

module.exports = monitor;

function monitor (options) {
  var last_seq = parseInt(options.last_seq, 10),  // Current DB revision
      ev = new EventEmitter(),                    // Event driven API
      stopped = true,                             // Working status
      logger = log4js.getLogger('npm-metadata-monitor'),
      request = require('./request/' + (options.mode || 'longpoll'))(options.couch);

  if (isNaN(last_seq)) {
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
    var delay = parseInt(options.delay, 10) || 0;
    logger.info('Next poll in %d ms', delay);
    setTimeout(poll, delay);
  }

  function poll () {
    ev.connected = false;
    var req = request(last_seq, ev, logger, process_change, next_poll, last_seq);
    ev.emit("poll", last_seq);
    logger.info('Polling URL: "%s"', req.url);
    req.start();
  }

  function process_change (change, cb) {
    var finish = function finish (err) {
      if (!err && change.seq && (last_seq === null || last_seq < change.seq)) {
        last_seq = change.seq;
        ev.emit("rev", last_seq);
      }
      process.nextTick(function () { cb(err); });
    };
    if (change.id) {
      if (change.deleted) {
        ev.emit("delete", change.id);
        finish();
      } else if (change.seq && change.changes && change.changes[0].rev) {
        get_metadata({
          "id":   change.id,
          "rev":  change.changes[0].rev,
          "seq":  change.seq
        }, function (err, metadata) {
          if (!err) {
            var mtime = metadata.mtime || (metadata.time || {}).modified;
            var ctime = metadata.ctime || (metadata.time || {}).created;
            ev.emit((mtime == ctime) ? "new" : "update", metadata._id, metadata);
          }
          finish(err);
        });
      } else {
        cb(new Error('Invalid data format for module change: ' + JSON.stringify(change)));
      }
    } else if (change.last_seq) {
      last_seq = change.last_seq;
      ev.emit("rev", last_seq);
    } else {
      cb(new Error('Invalid data format for generic change: ' + JSON.stringify(change)));
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
          cb(err, json);
        });
      } else {
        // TODO provide a way to read response body for debugging purpose ?
        var message = 'Failed retrieving metadata for "' + change.id + '" (response status = ' + res.statusCode + ')';
        logger.error(message);
        logger.trace(res);
        cb(new Error(message));
      }
    }).on("error", cb).end();
  }

  return ev;
}
