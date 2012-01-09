var http = require('http'),
    async = require('async'),
    store = require('./store'),
    monitor = require('./monitor');

module.exports = mirror;
module.exports.store = store;
module.exports.monitor = monitor;

function mirror (options, cb) {
  var base_delay, // Copy of options.delay to restore it (as original delay can increase due to errors)
      task_queue; // Our queue handling mirror updates tasks

  if (!options) {
    throw new Error('Expected options');
  }
  if (!options.couch || !options.couch.db || !options.couch.host) {
    throw new Error('Invalid options: missing "couch.db" and/or "couch.host"');
  }
  if (!options.store) {
    throw new Error('Invalid options: missing "store"');
  }

  base_delay = options.delay = options.delay || 0;

  // Note that our queue is a bit special: it queues back failed tasks to be sure no data is lost
  // TODO: ideal situation would be to update mirror's last_seq only if all tasks for this revision have been successfully executed
  function push_back (task, cb) {
    var query = {"type": task.type};
    if (task.type == "module") {
      query.key = task.key;
    }
    if (!task_queue.has(query)) {
      if (task.type == "last_seq") {
        console.log('[UPDDB]   Pushing back task to update last_seq later');
      } else {
        console.log('[UPDDB]   Pushing back task to update module "%s" later', task.key);
      }
      queue.push(task, cb);
    } else {
      if (task.type == "last_seq") {
        console.log('[UPDDB]   A task to update last_seq already exist, let it run instead of retrying');
      } else {
        console.log('[UPDDB]   A task to update module "%s" already exist, let it run instead of retrying', task.key);
      }
    }
  }

  // The main work is done here: tasks that maintain mirror
  task_queue = async.queue(function pop (task, cb) {
    console.log('EXECUTE TASK %s (remain %s)', JSON.stringify(task), task_queue.tasks.length);
    function try_again () {
      push_back(task, cb);
    }
    if (task.type === "last_seq") {
      update_last_seq(options.store, task.data, cb, try_again);
    } else if (task.type === "module") {
      if (task.deleted) {
        delete_module(options.store, task.key, cb, try_again);
      } else {
        task.get_metadata(function (err, metadata) {
          if (err) {
            console.log('Failed retrieving metadata for module "%s"', task.key);
            try_again();
          } else {
            update_module(options.store, task.key, metadata, cb, try_again);
          }
        });
      }
    } else {
      console.log('UNKNOWN TASK TYPE %s', task.type);
      cb();
    }
  }, options.concurrency || 10);
  task_queue.has = queue_has;
  task_queue.purge = queue_purge;

  options.store.lastSeq(function start (err, last_seq) {
    var mon;
    if (err) {
      console.log('[MONITOR] ERROR', err);
    } else {
      options.last_seq = last_seq || 0;
      console.log('[MONITOR] Monitoring for changes since seq=%s', options.last_seq);
      mon = monitor(options).on("delete", function (id) {
        console.log("-%s", id);
        // Module "id" deleted
        options.delay = base_delay;
        task_queue.push({"type": "module", "key": id, "deleted": true});
      }).on("update", function (id, get_metadata) {
        console.log("+%s", id);
        // Module "id" added or updated
        options.delay = base_delay;
        task_queue.push({"type": "module", "key": id, "get_metadata": get_metadata});
      }).on("rev", function (last_seq, nb_changes) {
        console.log('[UPDDB]   Last seq = %s', last_seq);
        task_queue.push({"type": "last_seq", "data": last_seq});
        if (nb_changes > 0) {
          console.log('[UPDDB]   %s change(s)', nb_changes);
        }
      }).on("error", function (err) {
        // Error occurred: delay next call
        console.log('[MONITOR] ERROR', err);
        this.delay += base_delay;
      }).on("end", function () {
        // End of monitoring
      }).on("start", function () {
        // Monitoring started (connection successful)
      }).start();
    }
    if (cb) cb(err, mon, last_seq);
  });
}

function queue_match (queue, query, match, end) {
  for (var i=0; i<queue.tasks.length; i++) {
    var found = true;
    for (var p in query) {
      if (query[p] !== queue.tasks[i].data[p]) {
        found = false;
        break;
      }
    }
    if (found) {
      var options = {"index": i};
      var res = match.call(queue, i);
      if (typeof res != 'undefined') {
        return res;
      }
      i = options.index;
    }
  }
  return end.call(queue);
}

function queue_has (queue, query) {
  return queue_match(queue, query, function () { return true; }, function () { return false; });
}

function queue_purge (queue, query) {
  var nb_removed = 0;
  return queue_match(queue, query, function (o) {
    nb_removed++;
    this.tasks.splice(o.index--, 1);
  }, function () { return nb_removed; });
}

// Update mirror's last_seq
function update_last_seq (store, new_rev, ok, try_again) {
  // Update last_seq
  store.lastSeq(function (err, last_seq) {
    if (err) {
      console.log('[UPDDB]   Failed retrieving current last_seq! Try again...', err);
      try_again();
    } else if (last_seq < new_rev) {
      store.lastSeq(new_rev, function (err) {
        if (err) {
          console.log('[UPDDB]   Failed updating last_seq to %s! Try again...', new_rev, err);
          try_again();
        } else {
          console.log('[UPDDB]   Successfully updated last_seq to %s', new_rev);
          ok();
        }
      });
    } else {
      if (last_seq != new_rev) {
        console.log('[UPDDB]   Ignore updating last_seq to %s, as mirror already tells his last_seq is %s. This should not happen!', new_rev, last_seq);
      }
      ok();
    }
  });
}

function delete_module (store, id, ok, try_again) {
  store.remove(id, function (err) {
    if (err) {
      console.log('[UPDMOD]  Failed removing module "%s": error!', id, err);
      try_again();
    } else {
      console.log('[UPDMOD]  Successfully removed module "%s"', id);
      ok();
    }
  });
}

function update_module (store, id, metadata, ok, try_again) {
  store.put(id, metadata, function (err) {
    if (err) {
      console.log('[UPDMOD]  Failed updating module "%s": error!', id);
      try_again();
    } else {
      console.log('[UPDMOD]  Successfully updated module "%s"', id);
      ok();
    }
  });
}
