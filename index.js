var mirror = require('./lib/mirror');

// Expose simplier version of "mirror()" with smart default options
module.exports = function _mirror (options) { return mirror(fix_options(options)); };

// Expose simplier version of "monitor()" with smart default options
module.exports.monitor = function _monitor (options) { return mirror.monitor(fix_options(options)); };

// Expose the stores
module.exports.store = mirror.store;

// Expose log4js to ease logger configuration
module.exports.log4js = require('log4js');
// Default log4js configuration
module.exports.log4js.configure({
  "doNotReplaceConsole": true
});

// Fill options with smart defaults
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
