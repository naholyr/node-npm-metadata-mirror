var http = require('http'),
    async = require('async'),
    store = require('./store'),
    monitor = require('./monitor'),
    log4js = require('log4js');

module.exports = mirror;
module.exports.store = store;
module.exports.monitor = monitor;

function mirror (options, cb) {
  var base_delay, // Copy of options.delay to restore it (as original delay can increase due to errors)
      task_queue, // Our queue handling mirror updates tasks
      logger = log4js.getLogger('npm-metadata-mirror');

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
        logger.debug('Pushing back task to update last_seq later');
      } else {
        logger.debug('Pushing back task to update module "%s" later', task.key);
      }
      queue.push(task, cb);
    } else {
      if (task.type == "last_seq") {
        logger.debug('A task to update last_seq already exist, let it run instead of retrying');
      } else {
        logger.debug('A task to update module "%s" already exist, let it run instead of retrying', task.key);
      }
    }
  }

  // The main work is done here: tasks that maintain mirror
  task_queue = async.queue(function pop (task, cb) {
    logger.debug('EXECUTE TASK %s (remain %d)', JSON.stringify(task), task_queue.tasks.length);
    function try_again () {
      push_back(task, cb);
    }
    if (task.type === "last_seq") {
      update_last_seq(options.store, logger, task.data, cb, try_again);
    } else if (task.type === "module") {
      if (task.deleted) {
        delete_module(options.store, logger, task.key, cb, try_again);
      } else {
        task.get_metadata(function (err, metadata) {
          if (err) {
            logger.error('Failed retrieving metadata for module "%s"', task.key);
            try_again();
          } else {
            update_module(options.store, logger, task.key, metadata, cb, try_again);
          }
        });
      }
    } else {
      logger.fatal('UNKNOWN TASK TYPE %s', task.type);
      cb();
    }
  }, options.concurrency || 10);
  task_queue.has = queue_has;
  task_queue.purge = queue_purge;

  mon = monitor(options).on("delete", function (id) {
    logger.debug('Detected module "%s" deleted', id);
    // Module "id" deleted
    options.delay = base_delay;
    task_queue.push({"type": "module", "key": id, "deleted": true});
  }).on("update", function (id, get_metadata) {
    logger.debug('Detected module "%s" added or updated', id);
    // Module "id" added or updated
    options.delay = base_delay;
    task_queue.push({"type": "module", "key": id, "get_metadata": get_metadata});
  }).on("rev", function (last_seq, nb_changes) {
    logger.debug('New last_seq = %s', last_seq);
    logger.debug('Found %d changes for last_seq %d', nb_changes, last_seq);
    task_queue.push({"type": "last_seq", "data": last_seq});
  }).on("error", function (err) {
    // Error occurred: delay next call
    logger.error('Monitoring error: %s', err.toString());
    logger.trace(err);
    this.delay += base_delay;
  }).on("end", function () {
    // End of monitoring
    logger.info('Terminated monitoring');
  }).on("start", function () {
    // Monitoring started (connection successful)
    logger.info('Started monitoring');
  });

  logger.info('Start mirrorring "%s:%d/%s" using engine "%s"...', options.couch.host, options.couch.port || 80, options.couch.db, options.store.constructor.name);
  options.store.lastSeq(function start (err, last_seq) {
    if (err) {
      logger.fatal('Failed retrieving current last_seq: %s', err.toString());
      logger.trace(err);
    } else {
      last_seq = last_seq || 0;
      logger.info('Monitoring for changes since seq=%s', options.last_seq);
      mon.start(last_seq);
    }
    if (cb) cb(err, mon, last_seq);
  });

  return {"logger": logger, "monitor": mon};
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
function update_last_seq (store, logger, new_rev, ok, try_again) {
  // Update last_seq
  store.lastSeq(function (err, last_seq) {
    if (err) {
      logger.error('Failed retrieving current last_seq: %s', err.toString());
      logger.trace(err);
      try_again();
    } else if (last_seq < new_rev) {
      store.lastSeq(new_rev, function (err) {
        if (err) {
          logger.error('Failed updating last_seq to %d: %s', new_rev, err.toString());
          logger.trace(err);
          try_again();
        } else {
          logger.info('Successfully updated last_seq to %d', new_rev);
          ok();
        }
      });
    } else {
      if (last_seq != new_rev) {
        logger.fatal('Ignore updating last_seq to %d, as mirror already tells his last_seq is %d. This should not happen!', new_rev, last_seq);
        // Nothing particular to do here, but we log it as fatal as some things should be checked by the server
        // Should we stop monitoring here ?
      }
      ok();
    }
  });
}

function delete_module (store, logger, id, ok, try_again) {
  store.remove(id, function (err) {
    if (err) {
      logger.console.log('[UPDMOD]  Failed removing module "%s": error!', id, err);
      try_again();
    } else {
      console.log('[UPDMOD]  Successfully removed module "%s"', id);
      ok();
    }
  });
}

function update_module (store, logger, id, metadata, ok, try_again) {
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
