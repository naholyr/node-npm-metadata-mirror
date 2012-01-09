var mirror = require('./lib/mirror');

module.exports = easy_mirror;
module.exports.store = mirror.store;
module.exports.monitor = mirror.monitor;

/**
 * Simplified access to internal monitor, with couch host being already defined
 */
function easy_mirror (options) {
  options = options || {};

  // Default CouchDB information = official registry
  options.couch = options.couch || {};
  options.couch.host = options.couch.host || 'isaacs.iriscouch.com';
  options.couch.db = options.couch.db || 'registry';

  // Default store = Redis
  options.store = options.store || new (mirror.store.Redis)();

  // Start mirroring
  return mirror(options);
}
