var mirror = require('./lib/mirror');

// Expose simplier version of "mirror()" with smart default options
module.exports = function _mirror (options) { return mirror(fix_options(options)); };

// Expose simplier version of "monitor()" with smart default options
module.exports.monitor = function _monitor (options) { return mirror.monitor(fix_options(options)); };

// Expose the stores
module.exports.store = mirror.store;

// Expose log4js to ease logger configuration
module.exports.log4js = require('log4js');
// DO NOT FUCKING OVERWRITE CONSOLE.*!! (otherwise, log4js is cool, so let's just fix this)
(function (log) {
  // We'd like to simply call restoreConsole()
  // but we then get "Object #<Object> has no method '_preLog4js_log'" in "node_modules/log4js/lib/appenders/console.js:6:10"
  // so we have to save it...
  var l = console._preLog4js_log;
  // ... restore original console...
  log.restoreConsole();
  // ... and finally restore it
  console._preLog4js_log = l;
  // and because we touch internals, we specify a hard version in package.json
})(module.exports.log4js);

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
