
exports.streamToJSON = function streamToJSON (stream, cb) {
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
};
