var http = require('http'),
    async = require('async');

module.exports = monitor;

function streamToJSON (stream, cb) {
  var json = '';
  stream.resume();
  stream.on('data', function (chunk) { json += chunk.toString(); });
  stream.on('error', function (err) { cb(err, json); });
  stream.on('end', function () {
    var data = json, err = null;
    try {
      data = JSON.parse(data);
    } catch (e) {
      err = e;
    }
    cb(err, data);
  });
}

function monitor (options) {

  if (!options) {
    throw new Error('Expected options');
  }
  if (!options.couch || !options.couch.db || !options.couch.host) {
    throw new Error('Invalid options: missing "couch.db" and/or "couch.host"');
  }
  if (!options.store) {
    throw new Error('Invalid options: missing "store"');
  }

  options.delay = options.delay || 0;

  var last_seq;
  var base_delay = options.delay;

  // TODO Insister en cas d'erreur: on ne doit pas perdre de module, quite à réessayer 50 fois
  var task_queue = async.queue(function handleQueueTask (task, cb) {
    console.log('EXECUTE TASK %s (remain %s)', JSON.stringify(task), task_queue.tasks.length);
    function try_again_last_seq () {
      if (!task_queue.has({"type": "last_seq"})) {
        console.log('[UPDDB]   Trying to update last_seq later again');
        task_queue.push(task, cb);
      } else {
        console.log('[UPDDB]   A task to update last_seq already exist, let it run instead of retrying');
      }
    }
    function try_again_module () {
      if (!task_queue.has({"type": "module", "key": task.key})) {
        console.log('[UPDDB]   Trying to update module "%s" later again', task.key);
        task_queue.push(task, cb);
      } else {
        console.log('[UPDDB]   A task to update module "%s" already exist, let it run instead of retrying', task.key);
      }
    }
    if (task.type === "last_seq") {
      // Update last_seq
      options.store.lastSeq(function (err, last_seq) {
        if (err) {
          console.log('[UPDDB]   Failed retrieving current last_seq! Try again...', err);
          try_again_last_seq();
        } else {
          options.store.lastSeq(task.data, function (err) {
            if (err) {
              console.log('[UPDDB]   Failed updating last_seq to %s! Try again...', task.data, err);
              try_again_last_seq();
            } else {
              console.log('[UPDDB]   Successfully updated last_seq to %s', task.data);
              cb();
            }
          });
        }
      });
    } else if (task.type === "module") {
      // mise à jour du module
      options.store.has(task.key, function (err, exists) {
        if (err) {
          console.log('[UPDDB]   > FAILED retrieving "%s"! Try again...', task.key, err);
          try_again_module();
        } else if (!task.data.deleted) {
          if (exists) {
            console.log('[UPDDB]   > UPDATE "%s"', task.key);
          } else {
            console.log('[UPDDB]   > ADD "%s"', task.key);
          }
          update_module(task.key, function (err) {
            if (err) {
              console.log('[UPDDB]   > FAILED ADDING or UPDATING "%s"! Try again...', task.key, err);
              try_again_module();
            } else {
              if (exists) {
                console.log('[UPDDB]   > OK UPDATED "%s"', task.key);
              } else {
                console.log('[UPDDB]   > OK ADDED "%s"', task.key);
              }
              cb();
            }
          });
        } else if (exists) {
          console.log('[UPDDB]   > DELETE "%s"', task.key);
          store.remove(task.key, function (err) {
            if (err) {
              console.log('[UPDDB]   > FAILED DELETING "%s"! Try again...', task.key, err);
              try_again_module();
            } else {
              console.log('[UPDDB]   > OK DELETE "%s"', task.key);
              cb();
            }
          });
        } else {
          console.log('[UPDDB]   Nothing to do for "%s"', task.key);
          cb();
        }
      });
    } else {
      console.log('UNKNOWN TASK TYPE %s', task.type);
      cb();
    }
  }, options.concurrency || 10);
  task_queue.has = function (query) {
    for (var i=0; i<this.tasks.length; i++) {
      var match = true;
      for (var p in query) {
        if (query[p] !== this.tasks[i].data[p]) {
          match = false;
          break;
        }
      }
      if (match) { // Remove
        return true;
      }
    }
    return false;
  };
  task_queue.purge = function (query) {
    for (var i=0; i<this.tasks.length; i++) {
      var match = true;
      for (var p in query) {
        if (query[p] !== this.tasks[i].data[p]) {
          match = false;
          break;
        }
      }
      if (match) { // Remove
        self.tasks.splice(i--, 1);
      }
    }
  };
  task_queue.drain = next;

  function next () {
    console.log('[MONITOR] Planned next polling...');
    setTimeout(function () { monitor(options); }, options.delay);
  }

  function update_db (changes) {
    console.log('[UPDDB]   Update DB');
    var last_seq; // returned value
    if (changes.last_seq) {
      last_seq = changes.last_seq;
      console.log('[UPDDB]   Last seq = %s', last_seq);
    }
    if (changes.results) {
      console.log('[UPDDB]   %s change(s)', changes.results.length);
      changes.results.forEach(function (change) {
        // Remove waiting tasks for this module (they don't need to be executed anymore, only last change really matters)
        task_queue.purge({"type": "module", "key": change.id, "data": change});
        // Add task
        task_queue.push({"type": "module", "key": change.id, "data":change});
      });
    }
    if (last_seq) {
      if (!task_queue.has({"type": "last_seq", "data": last_seq})) {
        task_queue.push({"type": "last_seq", "data": last_seq});
      }
    }
    return last_seq;
  }

  function update_module (id, cb) {
    http.request({
      host: options.couch.host,
      port: options.couch.port || 80,
      path: '/' + encodeURIComponent(options.couch.db) + '/' + encodeURIComponent(id)
    }, function (res) {
      console.log('[UPDMOD]  Got response for module "%s", status = %s', id, res.statusCode);
      if (res.statusCode == 200) {
        streamToJSON(res, function (err, module) {
          if (err) {
            console.log('[UPDMOD]  Failed updating module "%s": invalid response!', id, err);
            cb(err);
          } else {
            console.log('[UPDMOD]  Response OK, updating module "%s"...', id);
            options.store.put(id, module, function (err) {
              if (err) {
                console.log('[UPDMOD]  Failed updating module "%s": error!', id, err);
                cb(err);
              } else {
                console.log('[UPDMOD]  Successfully updated module "%s"', id);
                cb();
              }
            });
          }
        });
      }
    }).end();
  }

  options.store.lastSeq(function (err, last_seq) {
    if (err) {
      console.log('[MONITOR] ERROR', err);
      next();
    } else {
      console.log('[MONITOR] Monitoring for changes since seq=%s', last_seq);
      http.request({
        host: options.couch.host,
        port: options.couch.port || 80,
        path: '/' + encodeURIComponent(options.couch.db) + '/_changes?since=' + encodeURIComponent(last_seq) + '&feed=longpoll'
      }, function (res) {
        console.log('[MONITOR] Got response, status = %s', res.statusCode);
        if (res.statusCode == 200) {
          // success, reset error delay
          options.delay = base_delay;
          streamToJSON(res, function (err, changes) {
            if (err) return req.emit('error', err);
            update_db(changes);
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
            next();
          });
        }
      }).on('error', function (err) {
        console.log('[MONITOR] ERROR', err);
        // each error = next monitor occurs later
        options.delay += base_delay;
        next();
      }).end();
    }
  });
}
