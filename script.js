let video, canvas, ctx, resultBox;
let btnTop, btnSide, btnReset;

let cvReady = false;

// --- store measurements ---
let topMeasurement = null;   // {lengthCm, widthCm}
let sideMeasurement = null;  // {heightCm}

// ✅ SET THIS SIZE AS PER YOUR PRINTED MARKER
// Example: marker printed as 5cm x 5cm
const MARKER_SIZE_CM = 5.0;

function onOpenCvReady() {
  cvReady = true;
  console.log("✅ OpenCV Loaded");
  init();
}

async function init() {
  video = document.getElementById("video");
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  resultBox = document.getElementById("result");

  btnTop = document.getElementById("btnTop");
  btnSide = document.getElementById("btnSide");
  btnReset = document.getElementById("btnReset");

  await startCamera();

  btnTop.addEventListener("click", () => captureAndMeasure("top"));
  btnSide.addEventListener("click", () => captureAndMeasure("side"));
  btnReset.addEventListener("click", resetAll);

  showStatus("✅ Camera ready. Capture TOP view first.");
}

// ✅ Back camera open
async function startCamera() {
  try {
    const constraints = {
      video: { facingMode: { ideal: "environment" } },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
  } catch (err) {
    console.error(err);
    showStatus("❌ Camera error: " + err.message + "\nUse HTTPS (GitHub Pages).");
  }
}

// ✅ Capture + measurement
function captureAndMeasure(mode) {
  if (!cvReady) {
    showStatus("⏳ OpenCV still loading...");
    return;
  }

  // capture frame
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  showStatus(`⏳ Processing ${mode.toUpperCase()} view...`);

  // analyze
  setTimeout(() => {
    const measurement = analyzeImage(mode);
    if (!measurement) return;

    if (mode === "top") topMeasurement = measurement;
    else sideMeasurement = measurement;

    showFinalIfReady();
  }, 80);
}

// ✅ Detect marker + object contour + convert to cm
function analyzeImage(mode) {
  let src = cv.imread(canvas);

  // preprocess
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 50, 150);

  // contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() < 2) {
    showStatus("❌ Not enough contours.\nKeep marker + object visible & clear.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // Step 1: collect candidates
  let contourData = [];
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;

    if (area < 3000) continue; // remove noise
    contourData.push({ rect, area });
  }

  if (contourData.length < 2) {
    showStatus("❌ Cannot detect marker + object properly.\nTry moving closer.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // sort biggest first
  contourData.sort((a, b) => b.area - a.area);

  // marker likely = smaller square-like contour, object likely = biggest
  // But object can be bigger, marker smaller. So:
  let objectRect = contourData[0].rect;
  let markerRect = null;

  // find marker as most "square-like"
  let bestScore = Infinity;
  for (let i = 0; i < contourData.length; i++) {
    const r = contourData[i].rect;
    const ratio = r.width / r.height;
    const score = Math.abs(1 - ratio); // close to 0 => square
    if (score < bestScore && r.width > 40 && r.height > 40) {
      bestScore = score;
      markerRect = r;
    }
  }

  if (!markerRect) {
    showStatus("❌ Marker not detected.\nMake marker clear in camera.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // compute px/cm using marker size
  const markerPx = (markerRect.width + markerRect.height) / 2; // avg px
  const pxPerCm = markerPx / MARKER_SIZE_CM;

  // compute object size in cm
  const objWcm = (objectRect.width / pxPerCm);
  const objHcm = (objectRect.height / pxPerCm);

  // draw rectangles
  cv.rectangle(
    src,
    new cv.Point(objectRect.x, objectRect.y),
    new cv.Point(objectRect.x + objectRect.width, objectRect.y + objectRect.height),
    new cv.Scalar(0, 255, 0, 255),
    4
  );

  cv.rectangle(
    src,
    new cv.Point(markerRect.x, markerRect.y),
    new cv.Point(markerRect.x + markerRect.width, markerRect.y + markerRect.height),
    new cv.Scalar(255, 0, 0, 255),
    4
  );

  cv.imshow(canvas, src);

  cleanup(src, gray, blur, edges, contours, hierarchy);

  // top view -> length/width
  if (mode === "top") {
    return {
      lengthCm: Math.max(objWcm, objHcm),
      widthCm: Math.min(objWcm, objHcm)
    };
  }

  // side view -> height (take longer side as height)
  return {
    heightCm: Math.max(objWcm, objHcm)
  };
}

function showFinalIfReady() {
  let msg = "";

  if (topMeasurement) {
    msg += `✅ TOP VIEW DONE\nLength: ${topMeasurement.lengthCm.toFixed(2)} cm\nWidth: ${topMeasurement.widthCm.toFixed(2)} cm\n\n`;
  } else {
    msg += "📌 Capture TOP view first.\n\n";
  }

  if (sideMeasurement) {
    msg += `✅ SIDE VIEW DONE\nHeight: ${sideMeasurement.heightCm.toFixed(2)} cm\n\n`;
  } else {
    msg += "📌 Now capture SIDE view.\n\n";
  }

  // show final
  if (topMeasurement && sideMeasurement) {
    const L = topMeasurement.lengthCm;
    const W = topMeasurement.widthCm;
    const H = sideMeasurement.heightCm;

    msg += `🎯 FINAL DIMENSIONS\n`;
    msg += `L × W × H = ${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)} cm\n\n`;

    // packaging paper estimate (prototype for rectangular box wrap)
    // surface area approx = 2(LW + LH + WH)
    const surfaceArea = 2 * (L*W + L*H + W*H);

    msg += `📦 Paper Needed (estimate)\n`;
    msg += `Surface Area ≈ ${surfaceArea.toFixed(2)} cm²\n`;
    msg += `(+ 10% margin recommended)\n`;
  }

  showStatus(msg);
}

function resetAll() {
  topMeasurement = null;
  sideMeasurement = null;
  showStatus("🔄 Reset done.\nCapture TOP view first.");
}

function showStatus(text) {
  resultBox.innerText = text;
}

function cleanup(...mats) {
  mats.forEach(m => {
    if (m && typeof m.delete === "function") m.delete();
  });
}
