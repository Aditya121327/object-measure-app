let video;
let canvasPhoto, canvasOverlay;
let ctxPhoto, ctxOverlay;

let resultBox, instructions;
let btnTop, btnSide1, btnSide2, btnReset;
let btnShowGuide, btnPrevStep, btnNextStep;
let btnDownloadGuide, btnDownloadSummary;
let wrapMethod;

let step1, step2, step3;

let cvReady = false;

// ✅ Marker size in cm (change to 10.0 if 10×10 marker)
const MARKER_SIZE_CM = 10.0;

// ✅ Indian market standard wrap sheets (cm)
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
let lastCapturedImage = null;
let guideReady = false;

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

  btnDownloadGuide = document.getElementById("btnDownloadGuide");
  btnDownloadSummary = document.getElementById("btnDownloadSummary");

  wrapMethod = document.getElementById("wrapMethod");

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

  btnDownloadGuide.onclick = downloadGuidePNG;
  btnDownloadSummary.onclick = downloadSummaryPNG;

  updateStepper(1);
  showStatus("✅ Camera ready. Capture TOP view first.");
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
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
  guideReady = false;

  btnPrevStep.disabled = true;
  btnNextStep.disabled = true;
  btnDownloadGuide.disabled = true;
  btnDownloadSummary.disabled = true;

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
      instructions.innerText = "✅ Measurement completed. Generate wrapping guide.";
    }

    computeFinal();
    showProgress();

    if (finalDims) {
      updateStepper(2);
      guideReady = true;
      btnDownloadGuide.disabled = false;
      btnDownloadSummary.disabled = false;
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
    showStatus("❌ Marker/Object not detected.\nTry better lighting and keep marker clear.");
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
    showStatus("❌ Not enough objects detected. Move closer.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // biggest = object
  items.sort((a, b) => b.area - a.area);
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
    showStatus("❌ Marker not detected.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  const markerPx = (markerRect.width + markerRect.height) / 2;
  const pxPerCm = markerPx / MARKER_SIZE_CM;

  const wCm = objectRect.width / pxPerCm;
  const hCm = objectRect.height / pxPerCm;

  // overlay debug rectangles
  clearOverlay();
  drawRect(markerRect, "rgba(0,150,255,0.95)", 5);
  drawRect(objectRect, "rgba(0,255,100,0.95)", 5);

  cleanup(src, gray, blur, edges, contours, hierarchy);
  return { wCm, hCm };
}

// ----------- DISPLAY MEASUREMENT -----------
function showProgress() {
  let msg = "";

  if (topData) msg += `✅ TOP\nL: ${topData.L.toFixed(2)} cm | W: ${topData.W.toFixed(2)} cm\n\n`;
  else msg += "📌 TOP pending...\n\n";

  if (side1Data) msg += `✅ SIDE 1\nH: ${side1Data.H.toFixed(2)} cm | W: ${side1Data.W.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 1 pending...\n\n";

  if (side2Data) msg += `✅ SIDE 2\nH: ${side2Data.H.toFixed(2)} cm | L: ${side2Data.L.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 2 pending...\n\n";

  if (finalDims) {
    const { L, W, H } = finalDims;

    const paper = getRequiredPaper(L, W, H);
    const bestSheet = getBestIndianWrap(paper.paperL, paper.paperW);
    const roll = suggestWrapRoll(paper.paperL, paper.paperW);

    const sheetText = bestSheet
      ? `🛒 Best sheet: ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm) | Waste: ${bestSheet.wastePct.toFixed(1)}%`
      : "🛒 Best sheet: Not found (use roll)";

    const rollText = roll
      ? `📏 Roll option: ${roll.rollWidth} cm roll, cut length ≈ ${roll.cutLength.toFixed(1)} cm`
      : "";

    const tape = estimateTape(L, W, H);
    const score = materialSaverScore(bestSheet?.wastePct ?? 50);

    msg += `🎯 FINAL DIMENSIONS\nL×W×H = ${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)} cm\n\n`;
    msg += `📄 Required Paper: ${paper.paperL.toFixed(1)} × ${paper.paperW.toFixed(1)} cm\n`;
    msg += `${sheetText}\n${rollText}\n\n`;
    msg += `🏆 Material Saver Score: ${score}/100\n`;
    msg += `🧻 Tape Minimizer: ${tape.strips} strips (~${tape.totalLengthCm.toFixed(1)} cm)\n\n`;
    msg += `✅ Click "Generate Guide" to view folding steps.`;
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

// ----------- GUIDE -----------
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
  const paper = getRequiredPaper(L, W, H);

  const bestSheet = getBestIndianWrap(paper.paperL, paper.paperW);

  let methodName = wrapMethod.value === "japaneseB" ? "Japanese Fold (Method B)" : "Simple Fold (Method A)";

  const stepsB = [
    "Step 1: Place object at center of wrapping sheet.",
    "Step 2: Fold left flap inward → then right flap inward.",
    "Step 3: Make corner triangle folds (tuck in).",
    "Step 4: Fold bottom flap upward tightly.",
    "Step 5: Fold top flap downward and tuck-lock.",
    "Step 6: Apply tape at marked points (minimum)."
  ];

  const stepsA = [
    "Step 1: Place object at center of wrapping sheet.",
    "Step 2: Fold left flap over the object.",
    "Step 3: Fold right flap over and overlap slightly.",
    "Step 4: Fold bottom flap upward.",
    "Step 5: Fold top flap downward.",
    "Step 6: Tape the seam and 1 edge."
  ];

  const steps = wrapMethod.value === "japaneseB" ? stepsB : stepsA;

  drawLabelBox("WrapIt Guide", methodName, steps[guideStep]);

  // Nice pseudo AR overlay
  const w = canvasOverlay.width;
  const h = canvasOverlay.height;

  // Draw fold zones shading (looks pro)
  if (guideStep >= 1) {
    shadeRegion(0, 0, w * 0.20, h, "rgba(0,255,255,0.10)");
    shadeRegion(w * 0.80, 0, w * 0.20, h, "rgba(0,255,255,0.10)");
  }

  if (guideStep >= 3) {
    shadeRegion(0, h * 0.78, w, h * 0.22, "rgba(255,255,0,0.10)");
  }

  if (guideStep >= 4) {
    shadeRegion(0, 0, w, h * 0.22, "rgba(255,255,0,0.10)");
  }

  // arrows depending on step
  if (guideStep === 1) {
    drawArrow(30, h / 2, w / 2 - 30, h / 2);
    drawArrow(w - 30, h / 2, w / 2 + 30, h / 2);
    drawText("Fold sides", w / 2 - 45, h / 2 - 20);
  }

  if (guideStep === 2 && wrapMethod.value === "japaneseB") {
    drawArrow(80, 180, 200, 80);
    drawArrow(w - 80, 180, w - 200, 80);
    drawArrow(80, h - 180, 200, h - 80);
    drawArrow(w - 80, h - 180, w - 200, h - 80);
    drawText("Fold corners", 18, 130);
  }

  if (guideStep === 3) {
    drawArrow(w / 2, h - 40, w / 2, h / 2 + 60);
    drawText("Fold up", w / 2 - 30, h - 50);
  }

  if (guideStep === 4) {
    drawArrow(w / 2, 40, w / 2, h / 2 - 60);
    drawText("Fold down", w / 2 - 35, 35);
  }

  if (guideStep === 5) {
    drawDot(w / 2, h / 2 - 60);
    drawDot(w / 2, h / 2 + 60);
    drawText("Tape here", w / 2 - 35, h / 2 - 75);
  }

  let sheetText = bestSheet
    ? `Best sheet: ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm), Waste ~${bestSheet.wastePct.toFixed(1)}%`
    : "Best sheet not found (use roll).";

  showStatus(
    `📦 Wrapping Plan Ready\n\n` +
    `Method: ${methodName}\n` +
    `Paper Required: ${paper.paperL.toFixed(1)} × ${paper.paperW.toFixed(1)} cm\n` +
    `${sheetText}\n\n` +
    steps[guideStep]
  );
}

// ----------- NOVELTY CALCULATIONS -----------
function materialSaverScore(wastePct) {
  // Lower waste = higher score
  let score = Math.max(0, 100 - wastePct);
  return Math.round(score);
}

function estimateTape(L, W, H) {
  // Prototype model: 2 strips for Japanese fold, 3 for simple fold
  const strips = wrapMethod?.value === "simpleA" ? 3 : 2;

  // estimate each tape strip length ~ (W/3 + 2cm)
  const avgStrip = (Math.min(L, W) / 3) + 2;
  return {
    strips,
    totalLengthCm: strips * avgStrip
  };
}

function getRequiredPaper(L, W, H) {
  const margin = 3; // cm overlap
  const paperW = W + 2 * H + margin;
  const paperL = L + 2 * H + margin;
  return { paperL, paperW, margin };
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
      const wasteArea = sheetArea - usedArea;
      const wastePct = (wasteArea / sheetArea) * 100;

      if (!best || wastePct < best.wastePct) {
        best = { ...sheet, wasteArea, wastePct };
      }
    }
  }

  return best;
}

function suggestWrapRoll(reqL, reqW) {
  const rollWidths = [50, 70, 100, 120];

  for (let rw of rollWidths) {
    const fits = (rw >= reqW) || (rw >= reqL);
    if (fits) {
      const cutLength = rw >= reqW ? reqL : reqW;
      return { rollWidth: rw, cutLength };
    }
  }
  return null;
}

// ----------- DOWNLOAD FEATURES -----------
function downloadGuidePNG() {
  if (!guideReady) return;
  const merged = mergeCanvases();
  downloadCanvas(merged, "wrapit_guide.png");
}

function downloadSummaryPNG() {
  if (!finalDims) return;

  // create summary card canvas
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 520;
  const g = c.getContext("2d");

  // background
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);

  g.fillStyle = "#2b6fff";
  g.fillRect(0, 0, c.width, 90);

  g.fillStyle = "#fff";
  g.font = "bold 34px Arial";
  g.fillText("WrapIt Summary Card", 24, 58);

  const { L, W, H } = finalDims;
  const paper = getRequiredPaper(L, W, H);
  const bestSheet = getBestIndianWrap(paper.paperL, paper.paperW);
  const score = materialSaverScore(bestSheet?.wastePct ?? 50);

  g.fillStyle = "#000";
  g.font = "bold 26px Arial";
  g.fillText(`Object Dimensions: ${L.toFixed(1)} × ${W.toFixed(1)} × ${H.toFixed(1)} cm`, 24, 150);

  g.font = "22px Arial";
  g.fillText(`Required Paper: ${paper.paperL.toFixed(1)} × ${paper.paperW.toFixed(1)} cm`, 24, 205);

  if (bestSheet) {
    g.fillText(`Suggested Sheet (India): ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm)`, 24, 255);
    g.fillText(`Estimated Waste: ${bestSheet.wastePct.toFixed(1)}%`, 24, 305);
  } else {
    g.fillText(`Suggested Sheet: Use roll / custom large sheet`, 24, 255);
  }

  g.font = "bold 26px Arial";
  g.fillText(`Material Saver Score: ${score}/100`, 24, 370);

  g.font = "18px Arial";
  g.fillStyle = "#444";
  g.fillText(`Prototype note: Measurement uses 3-view marker calibration + contour detection.`, 24, 440);

  downloadCanvas(c, "wrapit_summary.png");
}

function mergeCanvases() {
  const c = document.createElement("canvas");
  c.width = canvasPhoto.width;
  c.height = canvasPhoto.height;
  const g = c.getContext("2d");
  g.drawImage(canvasPhoto, 0, 0);
  g.drawImage(canvasOverlay, 0, 0);
  return c;
}

function downloadCanvas(canvasEl, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvasEl.toDataURL("image/png");
  link.click();
}

// ----------- OVERLAY DRAWING -----------
function clearOverlay() {
  ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
}

function drawRect(r, color, thickness) {
  ctxOverlay.strokeStyle = color;
  ctxOverlay.lineWidth = thickness;
  ctxOverlay.strokeRect(r.x, r.y, r.width, r.height);
}

function drawArrow(x1, y1, x2, y2) {
  ctxOverlay.strokeStyle = "rgba(0,255,0,0.92)";
  ctxOverlay.lineWidth = 7;

  ctxOverlay.beginPath();
  ctxOverlay.moveTo(x1, y1);
  ctxOverlay.lineTo(x2, y2);
  ctxOverlay.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 20;

  ctxOverlay.fillStyle = "rgba(0,255,0,0.92)";
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
  ctxOverlay.arc(x, y, 11, 0, Math.PI * 2);
  ctxOverlay.fill();
}

function shadeRegion(x, y, w, h, fill) {
  ctxOverlay.fillStyle = fill;
  ctxOverlay.fillRect(x, y, w, h);
}

function drawText(text, x, y) {
  ctxOverlay.fillStyle = "rgba(0,0,0,0.75)";
  ctxOverlay.font = "bold 16px Arial";
  ctxOverlay.fillText(text, x, y);
}

function drawLabelBox(title, methodName, stepText) {
  ctxOverlay.fillStyle = "rgba(0,0,0,0.55)";
  ctxOverlay.fillRect(10, 10, canvasOverlay.width - 20, 120);

  ctxOverlay.fillStyle = "white";
  ctxOverlay.font = "bold 20px Arial";
  ctxOverlay.fillText(title, 22, 40);

  ctxOverlay.font = "bold 14px Arial";
  ctxOverlay.fillText(methodName, 22, 66);

  ctxOverlay.font = "14px Arial";
  ctxOverlay.fillText(stepText, 22, 96);
}

// ----------- STEPPER -----------
function updateStepper(stepNo) {
  step1.classList.remove("active");
  step2.classList.remove("active");
  step3.classList.remove("active");

  if (stepNo === 1) step1.classList.add("active");
  if (stepNo === 2) step2.classList.add("active");
  if (stepNo === 3) step3.classList.add("active");
}

// ----------- CLEANUP -----------
function cleanup(...mats) {
  mats.forEach(m => {
    if (m && typeof m.delete === "function") m.delete();
  });
}
