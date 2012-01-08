var monitor = require('./lib/monitor');
var store = require('./lib/store');

/**
 * Simplified access to internal monitor, with couch host being already defined
 */
module.exports = function (options) {
  options = options || {};
  options.couch = options.couch || {};
  options.couch.host = options.couch.host || 'isaacs.iriscouch.com';
  options.couch.db = options.couch.db || 'registry';
  options.store = options.store || new (store.Redis)();

  monitor(options);
};

module.exports.store = store;
