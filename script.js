let video;
let canvasPhoto, canvasOverlay;
let ctxPhoto, ctxOverlay;

let resultBox, instructions;
let btnTop, btnSide1, btnSide2, btnReset;
let btnShowGuide, btnPrevStep, btnNextStep;

let step1, step2, step3;

let cvReady = false;

// Marker size in cm
const MARKER_SIZE_CM = 10.0;

// Indian market sheets
const INDIAN_WRAP_SIZES = [
  { name: "Small sheet", w: 50, h: 70 },
  { name: "Medium sheet", w: 70, h: 100 },
  { name: "Large sheet", w: 100, h: 150 },
  { name: "XL sheet", w: 120, h: 180 }
];

// Measurement state
let topData = null;
let side1Data = null;
let side2Data = null;
let finalDims = null;

// Guide state
let guideStep = 0;
let lastCapturedImage = null; // store last captured image for guide

function onOpenCvReady() {
  cvReady = true;
  init();
}

async function init() {
  video = document.getElementById("video");

  canvasPhoto = document.getElementById("canvasPhoto");
  canvasOverlay = document.getElementById("canvasOverlay");

  ctxPhoto = canvasPhoto.getContext("2d");
  ctxOverlay = canvasOverlay.getContext("2d");

  resultBox = document.getElementById("result");
  instructions = document.getElementById("instructions");

  btnTop = document.getElementById("btnTop");
  btnSide1 = document.getElementById("btnSide1");
  btnSide2 = document.getElementById("btnSide2");
  btnReset = document.getElementById("btnReset");

  btnShowGuide = document.getElementById("btnShowGuide");
  btnPrevStep = document.getElementById("btnPrevStep");
  btnNextStep = document.getElementById("btnNextStep");

  step1 = document.getElementById("step1");
  step2 = document.getElementById("step2");
  step3 = document.getElementById("step3");

  await startCamera();

  btnTop.onclick = () => captureAndMeasure("top");
  btnSide1.onclick = () => captureAndMeasure("side1");
  btnSide2.onclick = () => captureAndMeasure("side2");
  btnReset.onclick = resetAll;

  btnShowGuide.onclick = startGuide;
  btnPrevStep.onclick = () => changeGuideStep(-1);
  btnNextStep.onclick = () => changeGuideStep(1);

  updateStepper(1);
  showStatus("✅ Camera ready. Capture TOP view first.");
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    showStatus("❌ Camera permission error. Open on HTTPS (GitHub Pages).");
  }
}

function resetAll() {
  topData = null;
  side1Data = null;
  side2Data = null;
  finalDims = null;

  guideStep = 0;
  btnPrevStep.disabled = true;
  btnNextStep.disabled = true;

  btnTop.disabled = false;
  btnSide1.disabled = true;
  btnSide2.disabled = true;

  updateStepper(1);
  instructions.innerText = "STEP 1: Keep marker near object and capture TOP view.";

  clearOverlay();
  showStatus("🔄 Reset done.\nCapture TOP view first.");
}

function captureAndMeasure(mode) {
  if (!cvReady) {
    showStatus("⏳ OpenCV still loading...");
    return;
  }

  // capture frame
  canvasPhoto.width = video.videoWidth;
  canvasPhoto.height = video.videoHeight;
  canvasOverlay.width = video.videoWidth;
  canvasOverlay.height = video.videoHeight;

  ctxPhoto.drawImage(video, 0, 0, canvasPhoto.width, canvasPhoto.height);
  lastCapturedImage = ctxPhoto.getImageData(0, 0, canvasPhoto.width, canvasPhoto.height);

  clearOverlay();
  showStatus(`⏳ Processing ${mode.toUpperCase()}...`);

  setTimeout(() => {
    const measured = analyzeImage();

    if (!measured) return;

    const longSide = Math.max(measured.wCm, measured.hCm);
    const shortSide = Math.min(measured.wCm, measured.hCm);

    if (mode === "top") {
      topData = { L: longSide, W: shortSide };
      btnTop.disabled = true;
      btnSide1.disabled = false;
      instructions.innerText = "STEP 2: Capture SIDE 1 view (marker visible).";

    } else if (mode === "side1") {
      side1Data = { H: longSide, W: shortSide };
      btnSide1.disabled = true;
      btnSide2.disabled = false;
      instructions.innerText = "STEP 3: Rotate object 90° and capture SIDE 2 view.";

    } else if (mode === "side2") {
      side2Data = { H: longSide, L: shortSide };
      btnSide2.disabled = true;
      instructions.innerText = "✅ Done! Measurement complete.";
    }

    computeFinal();
    showProgress();

    if (finalDims) {
      updateStepper(2); // measurement complete
    }
  }, 80);
}

function computeFinal() {
  if (!(topData && side1Data && side2Data)) return;

  const L = side2Data.L;
  const W = side1Data.W;
  const H = (side1Data.H + side2Data.H) / 2;

  finalDims = { L, W, H };
}

// ----------- OPENCV ANALYSIS -----------
function analyzeImage() {
  let src = cv.imread(canvasPhoto);

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
    showStatus("❌ Marker/Object not detected.\nTry better lighting.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  let items = [];
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;
    if (area < 2500) continue;
    items.push({ rect, area });
  }

  if (items.length < 2) {
    showStatus("❌ Not enough objects detected.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // biggest = object
  items.sort((a, b) => b.area - a.area);
  let objectRect = items[0].rect;

  // marker = most square-like
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
    showStatus("❌ Marker not detected.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  const markerPx = (markerRect.width + markerRect.height) / 2;
  const pxPerCm = markerPx / MARKER_SIZE_CM;

  const wCm = objectRect.width / pxPerCm;
  const hCm = objectRect.height / pxPerCm;

  // draw debug rectangle on overlay
  clearOverlay();
  drawRect(markerRect, "rgba(0,150,255,0.9)", 4);
  drawRect(objectRect, "rgba(0,255,100,0.9)", 4);

  cleanup(src, gray, blur, edges, contours, hierarchy);
  return { wCm, hCm };
}

// ----------- UI TEXT -----------
function showProgress() {
  let msg = "";

  if (topData) msg += `✅ TOP\nL: ${topData.L.toFixed(2)} cm | W: ${topData.W.toFixed(2)} cm\n\n`;
  else msg += "📌 TOP pending...\n\n";

  if (side1Data) msg += `✅ SIDE 1\nH: ${side1Data.H.toFixed(2)} cm | W: ${side1Data.W.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 1 pending...\n\n";

  if (side2Data) msg += `✅ SIDE 2\nH: ${side2Data.H.toFixed(2)} cm | L: ${side2Data.L.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 2 pending...\n\n";

  if (finalDims) {
    msg += `🎯 FINAL\nL×W×H = ${finalDims.L.toFixed(2)} × ${finalDims.W.toFixed(2)} × ${finalDims.H.toFixed(2)} cm\n\n`;
    msg += `Click "Show Guide" for wrapping steps.`;
  }

  showStatus(msg);
}

function showStatus(text) {
  resultBox.innerText = text;
}

function updateStepper(stepNo) {
  step1.classList.remove("active");
  step2.classList.remove("active");
  step3.classList.remove("active");

  if (stepNo === 1) step1.classList.add("active");
  if (stepNo === 2) step2.classList.add("active");
  if (stepNo === 3) step3.classList.add("active");
}

// ----------- WRAPPING GUIDE (PHOTO OVERLAY) -----------
function startGuide() {
  if (!finalDims) {
    showStatus("❌ Complete measurement first.");
    return;
  }

  updateStepper(3);
  guideStep = 0;

  btnPrevStep.disabled = false;
  btnNextStep.disabled = false;

  drawGuideStep();
}

function changeGuideStep(delta) {
  guideStep += delta;
  if (guideStep < 0) guideStep = 0;
  if (guideStep > 5) guideStep = 5;
  drawGuideStep();
}

function drawGuideStep() {
  if (!finalDims) return;

  // restore photo
  if (lastCapturedImage) ctxPhoto.putImageData(lastCapturedImage, 0, 0);
  clearOverlay();

  const { L, W, H } = finalDims;
  const margin = 3;
  const paperW = W + 2 * H + margin;
  const paperL = L + 2 * H + margin;

  const bestSheet = getBestIndianWrap(paperL, paperW);

  const steps = [
    "Step 1: Place object at center of paper.",
    "Step 2: Fold left flap inward → then right flap inward.",
    "Step 3: Fold corner triangles (Japanese tuck).",
    "Step 4: Fold bottom flap upward.",
    "Step 5: Fold top flap downward and tuck-lock.",
    "Step 6: Apply tape (minimal points)."
  ];

  // Draw big overlay title box
  drawLabelBox(`Japanese Wrap Guide`, steps[guideStep]);

  // Draw arrows + tape points (approx)
  const w = canvasOverlay.width;
  const h = canvasOverlay.height;

  if (guideStep === 1) {
    drawArrow(40, h / 2, w / 2 - 20, h / 2);
    drawArrow(w - 40, h / 2, w / 2 + 20, h / 2);
  }

  if (guideStep === 2) {
    // corner diagonal arrows
    drawArrow(70, 180, 180, 70);
    drawArrow(w - 70, 180, w - 180, 70);
    drawArrow(70, h - 180, 180, h - 70);
    drawArrow(w - 70, h - 180, w - 180, h - 70);
  }

  if (guideStep === 3) {
    drawArrow(w / 2, h - 60, w / 2, h / 2 + 40);
  }

  if (guideStep === 4) {
    drawArrow(w / 2, 60, w / 2, h / 2 - 40);
  }

  if (guideStep === 5) {
    // tape points
    drawDot(w / 2, h / 2 - 60);
    drawDot(w / 2, h / 2 + 60);
  }

  let sheetText = "No standard sheet found.";
  if (bestSheet) {
    sheetText = `Suggested sheet: ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm)`;
  }

  showStatus(
    `🎌 Wrapping Guide (Method B)\n\n` +
    `Required paper: ${paperL.toFixed(1)} × ${paperW.toFixed(1)} cm\n` +
    `${sheetText}\n\n` +
    steps[guideStep]
  );
}

// ----------- DRAW HELPERS -----------
function clearOverlay() {
  ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
}

function drawRect(r, color, thickness) {
  ctxOverlay.strokeStyle = color;
  ctxOverlay.lineWidth = thickness;
  ctxOverlay.strokeRect(r.x, r.y, r.width, r.height);
}

function drawArrow(x1, y1, x2, y2) {
  ctxOverlay.strokeStyle = "rgba(0,255,0,0.9)";
  ctxOverlay.lineWidth = 6;

  ctxOverlay.beginPath();
  ctxOverlay.moveTo(x1, y1);
  ctxOverlay.lineTo(x2, y2);
  ctxOverlay.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 18;

  ctxOverlay.fillStyle = "rgba(0,255,0,0.9)";
  ctxOverlay.beginPath();
  ctxOverlay.moveTo(x2, y2);
  ctxOverlay.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
  ctxOverlay.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
  ctxOverlay.closePath();
  ctxOverlay.fill();
}

function drawDot(x, y) {
  ctxOverlay.fillStyle = "rgba(255,0,0,0.95)";
  ctxOverlay.beginPath();
  ctxOverlay.arc(x, y, 10, 0, Math.PI * 2);
  ctxOverlay.fill();
}

function drawLabelBox(title, stepText) {
  ctxOverlay.fillStyle = "rgba(0,0,0,0.55)";
  ctxOverlay.fillRect(10, 10, canvasOverlay.width - 20, 90);

  ctxOverlay.fillStyle = "white";
  ctxOverlay.font = "bold 18px Arial";
  ctxOverlay.fillText(title, 22, 38);

  ctxOverlay.font = "14px Arial";
  ctxOverlay.fillText(stepText, 22, 68);
}

// ----------- MARKET HELPERS -----------
function getBestIndianWrap(reqL, reqW) {
  let best = null;

  for (const sheet of INDIAN_WRAP_SIZES) {
    const fitsNormal = sheet.w >= reqW && sheet.h >= reqL;
    const fitsRotated = sheet.w >= reqL && sheet.h >= reqW;

    if (fitsNormal || fitsRotated) {
      const usedArea = reqL * reqW;
      const sheetArea = sheet.w * sheet.h;
      const waste = sheetArea - usedArea;

      if (!best || waste < best.waste) {
        best = { ...sheet, waste };
      }
    }
  }
  return best;
}

function cleanup(...mats) {
  mats.forEach(m => {
    if (m && typeof m.delete === "function") m.delete();
  });
}
