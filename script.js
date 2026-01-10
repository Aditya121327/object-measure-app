let video, canvas, ctx, resultBox, instructions;
let btnTop, btnSide1, btnSide2, btnReset;

let cvReady = false;

// ✅ marker size in cm (change if you printed 10cm marker)
const MARKER_SIZE_CM = 5.0;

// store results
let topData = null;   // {L,W}
let side1Data = null; // {H,W}
let side2Data = null; // {H,L}

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
  instructions = document.getElementById("instructions");

  btnTop = document.getElementById("btnTop");
  btnSide1 = document.getElementById("btnSide1");
  btnSide2 = document.getElementById("btnSide2");
  btnReset = document.getElementById("btnReset");

  await startCamera();

  btnTop.onclick = () => captureAndMeasure("top");
  btnSide1.onclick = () => captureAndMeasure("side1");
  btnSide2.onclick = () => captureAndMeasure("side2");
  btnReset.onclick = resetAll;

  showStatus("✅ Camera ready.\nCapture TOP view first.");
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    console.error(err);
    showStatus("❌ Camera error: " + err.message + "\nUse HTTPS (GitHub Pages).");
  }
}

function resetAll() {
  topData = null;
  side1Data = null;
  side2Data = null;

  btnTop.disabled = false;
  btnSide1.disabled = true;
  btnSide2.disabled = true;

  instructions.innerText = "STEP 1: Keep marker near object and capture TOP view.";
  showStatus("🔄 Reset done.\nCapture TOP view first.");
}

function captureAndMeasure(mode) {
  if (!cvReady) {
    showStatus("⏳ OpenCV still loading...");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  showStatus(`⏳ Processing ${mode.toUpperCase()} photo...`);

  setTimeout(() => {
    const obj = analyzeImage();

    if (!obj) return;

    // obj = {wCm, hCm}
    let longSide = Math.max(obj.wCm, obj.hCm);
    let shortSide = Math.min(obj.wCm, obj.hCm);

    if (mode === "top") {
      topData = { L: longSide, W: shortSide };

      btnTop.disabled = true;
      btnSide1.disabled = false;

      instructions.innerText = "STEP 2: Capture SIDE 1 view (marker visible).";

      showProgress();

    } else if (mode === "side1") {
      side1Data = { H: longSide, W: shortSide };

      btnSide1.disabled = true;
      btnSide2.disabled = false;

      instructions.innerText = "STEP 3: Rotate object 90° and capture SIDE 2 view.";

      showProgress();

    } else if (mode === "side2") {
      side2Data = { H: longSide, L: shortSide };

      btnSide2.disabled = true;

      instructions.innerText = "✅ All photos captured. Final result calculated.";
      showProgress();
    }
  }, 80);
}

// ✅ Main analysis (marker scale + object contour)
function analyzeImage() {
  let src = cv.imread(canvas);

  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 50, 150);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() < 2) {
    showStatus("❌ Marker/Object not detected.\nKeep marker visible & improve lighting.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // collect candidates
  let items = [];
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;
    if (area < 2500) continue;
    items.push({ rect, area });
  }

  if (items.length < 2) {
    showStatus("❌ Not enough objects detected.\nMove closer to marker.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // sort big->small
  items.sort((a, b) => b.area - a.area);

  // object = biggest
  let objectRect = items[0].rect;

  // marker = most square-like contour
  let markerRect = null;
  let bestSquareScore = Infinity;

  for (let i = 0; i < items.length; i++) {
    const r = items[i].rect;
    if (r.width < 30 || r.height < 30) continue;
    const ratio = r.width / r.height;
    const score = Math.abs(1 - ratio);
    if (score < bestSquareScore) {
      bestSquareScore = score;
      markerRect = r;
    }
  }

  if (!markerRect) {
    showStatus("❌ Marker not detected.\nKeep marker clear, not blurred.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // scale
  const markerPx = (markerRect.width + markerRect.height) / 2;
  const pxPerCm = markerPx / MARKER_SIZE_CM;

  const wCm = objectRect.width / pxPerCm;
  const hCm = objectRect.height / pxPerCm;

  // Draw rectangles
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
  return { wCm, hCm };
}

// ✅ Display Progress + Final
function showProgress() {
  let msg = "";

  if (topData) {
    msg += `✅ TOP VIEW\nL: ${topData.L.toFixed(2)} cm\nW: ${topData.W.toFixed(2)} cm\n\n`;
  } else msg += `📌 TOP VIEW pending...\n\n`;

  if (side1Data) {
    msg += `✅ SIDE 1\nH: ${side1Data.H.toFixed(2)} cm\nW: ${side1Data.W.toFixed(2)} cm\n\n`;
  } else msg += `📌 SIDE 1 pending...\n\n`;

  if (side2Data) {
    msg += `✅ SIDE 2\nH: ${side2Data.H.toFixed(2)} cm\nL: ${side2Data.L.toFixed(2)} cm\n\n`;
  } else msg += `📌 SIDE 2 pending...\n\n`;

  if (topData && side1Data && side2Data) {
    // Final dims
    const L = side2Data.L;          // length from side2
    const W = side1Data.W;          // width from side1
    const H = (side1Data.H + side2Data.H) / 2; // avg height

    msg += `🎯 FINAL DIMENSIONS\n`;
    msg += `L × W × H = ${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)} cm\n\n`;

    // wrapping estimate
    const surfaceArea = 2 * (L * W + L * H + W * H);
    msg += `📦 Paper Needed Estimate\n`;
    msg += `Surface Area ≈ ${surfaceArea.toFixed(2)} cm²\n`;
    msg += `(add 10% margin)\n`;
  }

  showStatus(msg);
}

function showStatus(text) {
  resultBox.innerText = text;
}

function cleanup(...mats) {
  mats.forEach(m => {
    if (m && typeof m.delete === "function") m.delete();
  });
}
