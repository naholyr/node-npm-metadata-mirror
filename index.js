var mirror = require('./lib/mirror');

module.exports = function mirror (options) { return mirror(fix_options(options)); };
module.exports.store = mirror.store;
module.exports.monitor = function monitor (options) { return mirror.monitor(fix_options(options)); };

function fix_options (options) {
  options = options || {};

  // Default CouchDB information = official registry
  options.couch = options.couch || {};
  options.couch.host = options.couch.host || 'isaacs.iriscouch.com';
  options.couch.db = options.couch.db || 'registry';

  // Default store = Redis
  options.store = options.store || new (mirror.store.Redis)();

  return options;
}
