var http = require('http'),
    streamToJSON = require('./util').streamToJSON,
    EventEmitter = require('events').EventEmitter;

module.exports = monitor;

function monitor (options) {
  var last_seq = options.last_seq, // Current DB revision
      ev = new EventEmitter(),     // Event driven API
      stopped = true;              // Working status

  if (!last_seq && last_seq !== 0) {
    last_seq = null;
  }

  ev.options = options;
  ev.connected = false;

  ev.stop = function () {
    stopped = true;
    this.emit("end");
    return this;
  };

  ev.start = function () {
    stopped = false;
    ev.emit("start");
    poll();
    return this;
  };

  function next_poll () {
    console.log('[MONITOR] Next poll!');
    setTimeout(poll, options.delay);
  }

  function poll () {
    var path = '/' + encodeURIComponent(options.couch.db) + '/_changes?feed=longpoll';
    if (last_seq !== null) {
      path += '&since=' + encodeURIComponent(last_seq);
    }
    ev.connected = false;
    ev.emit("poll", last_seq);
    http.request({
      "host": options.couch.host,
      "port": options.couch.port || 80,
      "path": path
    }, function (res) {
      ev.connected = true;
      console.log('[MONITOR] Got response, status = %s', res.statusCode);
      if (res.statusCode == 200) {
        streamToJSON(res, function (err, changes) {
          if (err) {
            ev.emit("error", err);
            next_poll();
          } else {
            process(changes, next_poll);
          }
        });
      } else {
        console.log('[MONITOR] Unexpected response status %s', res.statusCode);
        streamToJSON(res, function (err, response) {
          if (err) {
            console.log('[MONITOR] Unexpected response is not valid JSON!', err);
            console.log(response);
          } else {
            console.log('[MONITOR] Unexpected response: %s', JSON.stringify(response));
          }
          next_poll();
        });
      }
    }).on('error', function (err) {
      ev.connected = false;
      ev.emit("error", err);
      console.log('[MONITOR] ERROR', err);
      next_poll();
    }).end();
  }

  function process (changes, next) {
    if (changes.last_seq) {
      last_seq = changes.last_seq;
    }
    if (changes.results) {
      for (var i=0; i<changes.results.length; ++i) {
        if (changes.results[i].deleted) {
          ev.emit("delete", changes.results[i].id);
        } else {
          ev.emit("update", changes.results[i].id, metadata_getter(changes.results[i].id));
        }
      }
    }
    ev.emit("rev", last_seq, changes.results ? changes.results.length : 0);
    next();
  }

  function metadata_getter (id) {
    return function (rev, cb) {
      if (typeof rev === 'function') {
        cb = rev;
        rev = null;
      }
      path = '/' + encodeURIComponent(options.couch.db) + '/' + encodeURIComponent(id);
      if (rev) {
        path += '?rev=' + rev;
      } else {
        path += '?revs_info=true';
      }
      http.request({
        "host": options.couch.host,
        "port": options.couch.port || 80,
        "path": path
      }, function (res) {
        if (res.statusCode == 200) {
          streamToJSON(res, cb);
        } else {
          // TODO provide a way to read response body for debugging purpose ?
          cb(new Error("Invalid response status " + res.statusCode));
        }
      }).on("error", function (err) { cb(err); }).end();
    };
  }

  return ev;
}
