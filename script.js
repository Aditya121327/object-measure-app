const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const captureTopBtn = document.getElementById("captureTop");
const captureSideBtn = document.getElementById("captureSide");
const resetBtn = document.getElementById("reset");

const result = document.getElementById("result");
const instructions = document.getElementById("instructions");

const MARKER_SIZE_CM = 5.0; // printed marker size in cm

let L = null, W = null, H = null;

// ---------------- CAMERA ----------------
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => video.srcObject = stream)
.catch(err => alert("Camera error: " + err.message));

// ---------------- BUTTONS ----------------
captureTopBtn.onclick = () => captureAndProcess("top");
captureSideBtn.onclick = () => captureAndProcess("side");

resetBtn.onclick = () => {
  L = W = H = null;
  result.innerText = "";
  canvas.style.display = "none";
  video.style.display = "block";

  captureTopBtn.disabled = false;
  captureSideBtn.disabled = true;

  instructions.innerText =
    "STEP 1: Place object + marker (5cm) and capture TOP view.";
};

// ---------------- MAIN CAPTURE ----------------
function captureAndProcess(mode) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  video.style.display = "none";
  canvas.style.display = "block";

  result.innerText = `Processing ${mode.toUpperCase()} view...`;

  waitForOpenCV(() => {
    const measurement = measureUsingMarker(mode);

    if (!measurement) return;

    if (mode === "top") {
      L = measurement.longSide;
      W = measurement.shortSide;

      result.innerText =
        `✅ TOP View Complete\nLength: ${L} cm\nWidth: ${W} cm\n\nNow take SIDE photo.`;

      instructions.innerText =
        "STEP 2: Place marker beside object (SIDE view) and capture SIDE view.";

      captureTopBtn.disabled = true;
      captureSideBtn.disabled = false;

    } else {
      H = measurement.longSide;

      result.innerText =
        `✅ FINAL MEASUREMENT\nLength: ${L} cm\nWidth : ${W} cm\nHeight: ${H} cm`;

      instructions.innerText =
        "✅ Done! Next we will calculate wrapping paper + fold/tape guide.";

      captureSideBtn.disabled = true;
    }
  });
}

// ---------------- OPENCV READY ----------------
function waitForOpenCV(cb) {
  if (typeof cv !== "undefined" && cv.Mat) cb();
  else setTimeout(() => waitForOpenCV(cb), 100);
}

// ---------------- MEASUREMENT CORE ----------------
function measureUsingMarker(mode) {
  let src = cv.imread(canvas);

  // Center crop to reduce wide-angle lens distortion
  let cropX = Math.floor(src.cols * 0.1);
  let cropY = Math.floor(src.rows * 0.1);
  let cropW = Math.floor(src.cols * 0.8);
  let cropH = Math.floor(src.rows * 0.8);
  let roi = src.roi(new cv.Rect(cropX, cropY, cropW, cropH));

  let gray = new cv.Mat();
  cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);

  const marker = detectMarker(gray);
  if (!marker) {
    result.innerText = "❌ Marker not detected. Keep marker clear & visible.";
    cleanup(src, roi, gray);
    return null;
  }

  const markerPixels = (marker.width + marker.height) / 2;
  const pixelsPerCm = markerPixels / MARKER_SIZE_CM;

  const obj = detectObject(gray, marker);
  if (!obj) {
    result.innerText = "❌ Object not detected. Keep object clear.";
    cleanup(src, roi, gray);
    return null;
  }

  // Compute cm sizes
  const objWcm = (obj.width / pixelsPerCm).toFixed(2);
  const objHcm = (obj.height / pixelsPerCm).toFixed(2);

  // Determine long and short (for rectangle)
  const longSide = Math.max(parseFloat(objWcm), parseFloat(objHcm)).toFixed(2);
  const shortSide = Math.min(parseFloat(objWcm), parseFloat(objHcm)).toFixed(2);

  // Draw debug rectangles on captured image
  drawRectOnCanvas(cropX + marker.x, cropY + marker.y, marker.width, marker.height, "lime");
  drawRectOnCanvas(cropX + obj.x, cropY + obj.y, obj.width, obj.height, "yellow");

  cleanup(src, roi, gray);

  return { longSide, shortSide };
}

// ---------------- MARKER DETECTION (BEST SQUARE) ----------------
function detectMarker(gray) {
  let blur = new cv.Mat();
  let edges = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 50, 150);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let best = null;
  let bestScore = 0;

  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;

    // ignore tiny / huge areas
    if (area < 2000 || area > 200000) continue;

    // square test
    let ratio = rect.width / rect.height;
    ratio = ratio > 1 ? ratio : 1 / ratio;
    if (ratio > 1.2) continue;

    // marker should have inner pattern => high variance inside box
    let region = gray.roi(rect);
    let mean = new cv.Mat();
    let stddev = new cv.Mat();
    cv.meanStdDev(region, mean, stddev);

    let varianceScore = stddev.doubleAt(0, 0); // stronger pattern => higher stddev

    // score based on square + pattern richness + moderate size
    let score = varianceScore + (area / 5000);

    if (score > bestScore) {
      bestScore = score;
      best = rect;
    }

    region.delete();
    mean.delete();
    stddev.delete();
  }

  cleanup(blur, edges, contours, hierarchy);
  return best;
}

// ---------------- OBJECT DETECTION ----------------
function detectObject(gray, markerRect) {
  let blur = new cv.Mat();
  let edges = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 50, 150);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let best = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;

    if (area < 5000) continue;

    // ignore marker region (overlap)
    if (rectOverlap(rect, markerRect)) continue;

    if (area > bestArea) {
      bestArea = area;
      best = rect;
    }
  }

  cleanup(blur, edges, contours, hierarchy);
  return best;
}

// ---------------- HELPERS ----------------
function rectOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    a.x > b.x + b.width ||
    a.y + a.height < b.y ||
    a.y > b.y + b.height
  );
}

function drawRectOnCanvas(x, y, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);
}

function cleanup(...mats) {
  mats.forEach(m => {
    try { m.delete(); } catch {}
  });
}
