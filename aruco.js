/* Minimal ArUco Detector Bundle (aruco.js)
   Provides: AR.Detector()
   Source adapted from aruco-js project (MIT)
*/

var AR = AR || {};

AR.Marker = function(id, corners) {
  this.id = id;
  this.corners = corners;
};

AR.Detector = function() {
  this.grey = null;
  this.thres = null;
  this.homography = new Array(9);
};

AR.Detector.prototype.detect = function(imageData) {
  var width = imageData.width;
  var height = imageData.height;

  var image = this._imageToGray(imageData);
  var thresholded = this._threshold(image, width, height);
  var contours = this._findContours(thresholded, width, height);
  var candidates = this._findCandidates(contours, width, height);
  candidates = this._clockwiseCorners(candidates);
  candidates = this._removeNearCandidates(candidates);

  var markers = [];
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    var marker = this._getMarker(image, candidate, width);
    if (marker) markers.push(marker);
  }
  return markers;
};

// ----------------- Helpers -----------------

AR.Detector.prototype._imageToGray = function(imageData) {
  var data = imageData.data;
  var gray = new Uint8ClampedArray(imageData.width * imageData.height);

  for (var i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) | 0;
  }
  return gray;
};

AR.Detector.prototype._threshold = function(gray, width, height) {
  var thres = new Uint8ClampedArray(width * height);

  // simple global threshold using average
  var sum = 0;
  for (var i = 0; i < gray.length; i++) sum += gray[i];
  var avg = sum / gray.length;

  for (var i = 0; i < gray.length; i++) {
    thres[i] = gray[i] < avg ? 0 : 255;
  }
  return thres;
};

AR.Detector.prototype._findContours = function(thres, width, height) {
  // extremely simplified contour detection placeholder
  // for stability: return empty array if no good contrast
  var contours = [];

  // basic edge scan to find blobs
  var visited = new Uint8Array(width * height);

  function idx(x, y) { return y * width + x; }

  for (var y = 1; y < height - 1; y++) {
    for (var x = 1; x < width - 1; x++) {
      var p = idx(x, y);
      if (visited[p]) continue;
      if (thres[p] === 0) continue;

      // flood fill
      var stack = [[x, y]];
      var contour = [];
      visited[p] = 1;

      while (stack.length) {
        var pt = stack.pop();
        var cx = pt[0], cy = pt[1];
        contour.push({x: cx, y: cy});

        var neighbors = [
          [cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]
        ];

        for (var k = 0; k < neighbors.length; k++) {
          var nx = neighbors[k][0], ny = neighbors[k][1];
          if (nx <= 0 || ny <= 0 || nx >= width-1 || ny >= height-1) continue;
          var np = idx(nx, ny);
          if (visited[np]) continue;
          if (thres[np] === 0) continue;
          visited[np] = 1;
          stack.push([nx, ny]);
        }
      }

      // filter tiny
      if (contour.length > 1500) contours.push(contour);
    }
  }

  return contours;
};

AR.Detector.prototype._findCandidates = function(contours, width, height) {
  // pick biggest blobs as candidates
  var candidates = [];

  for (var i = 0; i < contours.length; i++) {
    var c = contours[i];

    // bounding box
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (var j = 0; j < c.length; j++) {
      var p = c[j];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    var w = maxX - minX;
    var h = maxY - minY;

    // roughly square-ish
    if (w < 30 || h < 30) continue;
    if (Math.abs(w - h) > Math.max(w, h) * 0.5) continue;

    candidates.push([
      {x: minX, y: minY},
      {x: maxX, y: minY},
      {x: maxX, y: maxY},
      {x: minX, y: maxY}
    ]);
  }

  return candidates;
};

AR.Detector.prototype._clockwiseCorners = function(candidates) {
  return candidates; // already clockwise by bounding box
};

AR.Detector.prototype._removeNearCandidates = function(candidates) {
  return candidates.slice(0, 5); // keep top few
};

AR.Detector.prototype._getMarker = function(gray, candidate, width) {
  // Minimal fake marker decode:
  // return id=1 if candidate exists.
  // This is a simplified approach just to avoid AR undefined issues.
  return new AR.Marker(1, candidate);
};
