const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const captureTopBtn = document.getElementById("captureTop");
const captureSideBtn = document.getElementById("captureSide");
const resetBtn = document.getElementById("reset");

const result = document.getElementById("result");
const instructions = document.getElementById("instructions");

// Marker real size in cm (IMPORTANT: your printed marker must be 5cm x 5cm)
const MARKER_SIZE_CM = 5.0;

let L = null, W = null, H = null;

// ---------------- CAMERA START ----------------
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  video.srcObject = stream;
})
.catch(err => {
  alert("Camera error: " + err.message);
});

// ---------------- RESET ----------------
resetBtn.onclick = () => {
  L = W = H = null;
  result.innerText = "";
  canvas.style.display = "none";
  video.style.display = "block";

  captureTopBtn.disabled = false;
  captureSideBtn.disabled = true;

  instructions.innerText =
    "STEP 1: Place object + ArUco marker (5cm) and capture TOP view.";
};

// ---------------- BUTTONS ----------------
captureTopBtn.onclick = () => captureAndProcess("top");
captureSideBtn.onclick = () => captureAndProcess("side");

// ---------------- CAPTURE ----------------
function captureAndProcess(mode) {
  // take photo from video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // show captured
  video.style.display = "none";
  canvas.style.display = "block";

  result.innerText = `Processing ${mode.toUpperCase()} view...`;

  waitForOpenCV(() => {
    // 1) detect marker scale using js-aruco
    const pixelsPerCm = detectMarkerScaleUsingJsAruco();

    if (!pixelsPerCm) {
      result.innerText =
        "❌ ArUco marker not detected clearly.\nKeep marker near object, fully visible, good lighting.";
      return;
    }

    // 2) detect object size using OpenCV
    const measured = detectObjectSize(pixelsPerCm);

    if (!measured.wCm || !measured.hCm) {
      result.innerText = "❌ Object not detected clearly.";
      return;
    }

    // width/height from object in this photo
    const longSide = Math.max(measured.wCm, measured.hCm);
    const shortSide = Math.min(measured.wCm, measured.hCm);

    if (mode === "top") {
      // TOP photo provides L and W
      L = longSide.toFixed(2);
      W = shortSide.toFixed(2);

      result.innerText =
        `✅ TOP View Done\nLength: ${L} cm\nWidth: ${W} cm\n\nNow capture SIDE view.`;

      instructions.innerText =
        "STEP 2: Capture SIDE view with marker visible (marker beside object).";

      captureTopBtn.disabled = true;
      captureSideBtn.disabled = false;

    } else {
      // SIDE photo provides H
      H = longSide.toFixed(2);

      result.innerText =
        `✅ FINAL MEASUREMENT\nLength: ${L} cm\nWidth : ${W} cm\nHeight: ${H} cm`;

      instructions.innerText =
        "✅ Measurement complete. Next step: wrapping paper & fold guide.";

      captureSideBtn.disabled = true;
    }
  });
}

// ---------------- WAIT FOR OPENCV ----------------
function waitForOpenCV(cb) {
  if (typeof cv !== "undefined" && cv.Mat) cb();
  else setTimeout(() => waitForOpenCV(cb), 100);
}

// ======================================================
// ✅ 1) MARKER SCALE USING js-aruco (CORNER DETECTION)
// ======================================================
function detectMarkerScaleUsingJsAruco() {
  // read raw pixels from canvas
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // detect marker
  const detector = new AR.Detector();
  const markers = detector.detect(imageData);

  if (!markers || markers.length === 0) return null;

  // use first detected marker
  const m = markers[0];
  const c = m.corners; // 4 corners

  // average marker side length in pixels
  const s1 = dist(c[0], c[1]);
  const s2 = dist(c[1], c[2]);
  const s3 = dist(c[2], c[3]);
  const s4 = dist(c[3], c[0]);

  const avgSidePixels = (s1 + s2 + s3 + s4) / 4;

  // px per cm
  const pixelsPerCm = avgSidePixels / MARKER_SIZE_CM;

  // debug print (optional)
  // result.innerText = "px/cm = " + pixelsPerCm.toFixed(2);

  return pixelsPerCm;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ======================================================
// ✅ 2) OBJECT SIZE USING OPENCV CONTOURS
// ======================================================
function detectObjectSize(pixelsPerCm) {
  let src = cv.imread(canvas);

  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 60, 150);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() === 0) {
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return {};
  }

  // pick largest contour as object
  let maxArea = 0;
  let bestRect = null;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);

    if (area > maxArea) {
      maxArea = area;
      bestRect = cv.minAreaRect(cnt); // rotated tight rectangle
    }
  }

  if (!bestRect) {
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return {};
  }

  const wPx = bestRect.size.width;
  const hPx = bestRect.size.height;

  const wCm = wPx / pixelsPerCm;
  const hCm = hPx / pixelsPerCm;

  cleanup(src, gray, blur, edges, contours, hierarchy);

  return { wCm, hCm };
}

// ---------------- CLEANUP ----------------
function cleanup(...mats) {
  mats.forEach(m => {
    try { m.delete(); } catch {}
  });
}
