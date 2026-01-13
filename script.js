let video;
let canvasPhoto, canvasOverlay;
let ctxPhoto, ctxOverlay;

let resultBox, instructions;
let btnTop, btnSide1, btnSide2, btnCleanTop, btnReset;
let btnShowGuide, btnPrevStep, btnNextStep;
let btnDownloadGuide, btnDownloadSummary;
let wrapMethod;

let step1, step2, step3;

let cvReady = false;

// ✅ Marker size in cm
const MARKER_SIZE_CM = 10.0;

// ✅ Indian market standard wrap sheets (cm)
const INDIAN_WRAP_SIZES = [
  { name: "Small sheet", w: 50, h: 70 },
  { name: "Medium sheet", w: 70, h: 100 },
  { name: "Large sheet", w: 100, h: 150 },
  { name: "XL sheet", w: 120, h: 180 }
];

// Measurement data
let topData = null;
let side1Data = null;
let side2Data = null;
let finalDims = null;

// Captured images
let topMarkerImage = null;     // TOP with marker
let cleanTopImage = null;      // TOP without marker
let cleanTopObjectRect = null; // object bounding rect detected in clean photo

let guideStep = 0;
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
  btnCleanTop = document.getElementById("btnCleanTop");
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

  btnTop.onclick = () => captureMeasurePhoto("top");
  btnSide1.onclick = () => captureMeasurePhoto("side1");
  btnSide2.onclick = () => captureMeasurePhoto("side2");

  btnCleanTop.onclick = captureCleanTop;
  btnReset.onclick = resetAll;

  btnShowGuide.onclick = startGuide;
  btnPrevStep.onclick = () => changeGuideStep(-1);
  btnNextStep.onclick = () => changeGuideStep(1);

  btnDownloadGuide.onclick = downloadGuidePNG;
  btnDownloadSummary.onclick = downloadSummaryPNG;

  updateStepper(1);
  showStatus("✅ Camera ready. Capture TOP (marker) view first.");
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

  topMarkerImage = null;
  cleanTopImage = null;
  cleanTopObjectRect = null;

  guideStep = 0;
  guideReady = false;

  btnPrevStep.disabled = true;
  btnNextStep.disabled = true;
  btnDownloadGuide.disabled = true;
  btnDownloadSummary.disabled = true;

  btnTop.disabled = false;
  btnSide1.disabled = true;
  btnSide2.disabled = true;
  btnCleanTop.disabled = true;

  updateStepper(1);
  instructions.innerText = "STEP 1: Keep marker near object and capture TOP view.";
  clearOverlay();
  showStatus("🔄 Reset done. Capture TOP (marker) view first.");
}

function captureFrameToCanvas() {
  canvasPhoto.width = video.videoWidth;
  canvasPhoto.height = video.videoHeight;
  canvasOverlay.width = video.videoWidth;
  canvasOverlay.height = video.videoHeight;

  ctxPhoto.drawImage(video, 0, 0, canvasPhoto.width, canvasPhoto.height);
  return ctxPhoto.getImageData(0, 0, canvasPhoto.width, canvasPhoto.height);
}

// -------------------- MEASUREMENT CAPTURE --------------------
function captureMeasurePhoto(mode) {
  if (!cvReady) return showStatus("⏳ OpenCV loading...");

  clearOverlay();
  const img = captureFrameToCanvas();

  if (mode === "top") topMarkerImage = img;

  showStatus(`⏳ Processing ${mode.toUpperCase()} (marker)...`);

  setTimeout(() => {
    const measured = analyzeMarkerObject();
    if (!measured) return;

    const longSide = Math.max(measured.wCm, measured.hCm);
    const shortSide = Math.min(measured.wCm, measured.hCm);

    if (mode === "top") {
      topData = { L: longSide, W: shortSide };
      btnTop.disabled = true;
      btnSide1.disabled = false;
      instructions.innerText = "STEP 2: Capture SIDE 1 (marker).";

    } else if (mode === "side1") {
      side1Data = { H: longSide, W: shortSide };
      btnSide1.disabled = true;
      btnSide2.disabled = false;
      instructions.innerText = "STEP 3: Rotate 90° and Capture SIDE 2 (marker).";

    } else if (mode === "side2") {
      side2Data = { H: longSide, L: shortSide };
      btnSide2.disabled = true;
      instructions.innerText = "✅ Measurement complete. Now capture CLEAN TOP (no marker).";
    }

    computeFinal();
    showProgress();

    if (finalDims) {
      updateStepper(2);
      btnCleanTop.disabled = false; // enable clean capture
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

// -------------------- CLEAN TOP CAPTURE (NO MARKER) --------------------
function captureCleanTop() {
  if (!cvReady) return showStatus("⏳ OpenCV loading...");

  clearOverlay();
  cleanTopImage = captureFrameToCanvas();

  showStatus("⏳ Detecting object from CLEAN TOP...");

  setTimeout(() => {
    cleanTopObjectRect = detectObjectRectFromCleanTop();
    if (!cleanTopObjectRect) {
      showStatus("⚠️ Clean object boundary not detected. Try better background/lighting.");
      return;
    }

    // show detected rect
    clearOverlay();
    drawRect(cleanTopObjectRect, "rgba(255,200,0,0.95)", 6);
    drawText("Object detected (CLEAN TOP)", cleanTopObjectRect.x + 10, cleanTopObjectRect.y - 10);

    instructions.innerText = "✅ Clean Top captured. Now generate wrapping guide.";
    showStatus("✅ CLEAN TOP captured successfully.\nNow click Generate Cuboid Guide.");
  }, 80);
}

// -------------------- OPENCV: MEASURE (marker+object) --------------------
function analyzeMarkerObject() {
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
    showStatus("❌ Marker/Object not detected.\nTry better lighting & clear marker.");
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

  items.sort((a, b) => b.area - a.area);
  let objectRect = items[0].rect;

  // marker: most square-like contour
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

  clearOverlay();
  drawRect(markerRect, "rgba(0,150,255,0.95)", 5);
  drawRect(objectRect, "rgba(0,255,100,0.95)", 5);

  cleanup(src, gray, blur, edges, contours, hierarchy);
  return { wCm, hCm };
}

// -------------------- OPENCV: DETECT OBJECT RECT FROM CLEAN TOP --------------------
function detectObjectRectFromCleanTop() {
  // Replace canvasPhoto with clean image temporarily
  if (!cleanTopImage) return null;

  ctxPhoto.putImageData(cleanTopImage, 0, 0);

  let src = cv.imread(canvasPhoto);
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
  cv.Canny(blur, edges, 40, 140);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() < 1) {
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  // choose biggest contour as object
  let bestRect = null;
  let bestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;

    // ignore small noise
    if (area < 6000) continue;

    if (area > bestArea) {
      bestArea = area;
      bestRect = rect;
    }
  }

  cleanup(src, gray, blur, edges, contours, hierarchy);

  if (!bestRect) return null;

  // slight padding
  const pad = 10;
  bestRect.x = Math.max(0, bestRect.x - pad);
  bestRect.y = Math.max(0, bestRect.y - pad);
  bestRect.width = Math.min(canvasPhoto.width - bestRect.x, bestRect.width + pad * 2);
  bestRect.height = Math.min(canvasPhoto.height - bestRect.y, bestRect.height + pad * 2);

  return bestRect;
}

// -------------------- GUIDE --------------------
function startGuide() {
  if (!finalDims) return showStatus("❌ Complete measurement first.");

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

  // Prefer clean top if available
  if (cleanTopImage) ctxPhoto.putImageData(cleanTopImage, 0, 0);
  else if (topMarkerImage) ctxPhoto.putImageData(topMarkerImage, 0, 0);

  clearOverlay();

  const { L, W, H } = finalDims;
  const paper = getRequiredPaper(L, W, H);

  const bestSheet = getBestIndianWrap(paper.paperL, paper.paperW);
  const tape = estimateTape(L, W, H);
  const score = materialSaverScore(bestSheet?.wastePct ?? 50);

  const stepsB = [
    "Step 1: Place cuboid at center of paper.",
    "Step 2: Fold left & right sides inward (H).",
    "Step 3: Fold corner triangles & tuck.",
    "Step 4: Fold bottom flap upward (H).",
    "Step 5: Fold top flap downward and lock tuck.",
    "Step 6: Tape at marked points (minimum)."
  ];

  const stepsA = [
    "Step 1: Place cuboid at center.",
    "Step 2: Fold left side over cuboid.",
    "Step 3: Fold right side overlap.",
    "Step 4: Fold bottom flap upward.",
    "Step 5: Fold top flap downward.",
    "Step 6: Tape seam and edge."
  ];

  const steps = wrapMethod.value === "japaneseB" ? stepsB : stepsA;

  drawLabelBox("Cuboid Wrapping Guide", steps[guideStep]);

  // IMPORTANT: fit overlay on object size in photo
  // if we have clean object rect => use it
  // else use center placement fallback
  drawCuboidOverlayOnPhoto(L, W, H, guideStep, wrapMethod.value);

  let sheetText = bestSheet
    ? `Best sheet: ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm), Waste ~${bestSheet.wastePct.toFixed(1)}%`
    : `Best sheet not found (use roll).`;

  showStatus(
    `📦 WrapIt Result (Cuboid)\n\n` +
    `L×W×H = ${L.toFixed(2)}×${W.toFixed(2)}×${H.toFixed(2)} cm\n` +
    `Paper Required = ${paper.paperL.toFixed(1)}×${paper.paperW.toFixed(1)} cm\n` +
    `${sheetText}\n\n` +
    `🏆 Material Saver Score: ${score}/100\n` +
    `🧻 Tape Minimizer: ${tape.strips} strips (~${tape.totalLengthCm.toFixed(1)} cm)\n\n` +
    steps[guideStep]
  );
}

// -------------------- OVERLAY FITTED TO OBJECT --------------------
function drawCuboidOverlayOnPhoto(L, W, H, step, method) {
  const cw = canvasOverlay.width;
  const ch = canvasOverlay.height;

  let base;

  if (cleanTopObjectRect) {
    // use detected object bounds
    base = {
      x: cleanTopObjectRect.x,
      y: cleanTopObjectRect.y,
      w: cleanTopObjectRect.width,
      h: cleanTopObjectRect.height
    };
  } else {
    // fallback center box
    const pad = Math.min(cw, ch) * 0.2;
    const bw = (cw - 2 * pad) * 0.5;
    const bh = bw * (W / L);
    base = {
      x: (cw - bw) / 2,
      y: (ch - bh) / 2,
      w: bw,
      h: Math.min(bh, ch * 0.5)
    };
  }

  // flap thickness proportional to base
  const flap = Math.min(base.w, base.h) * 0.35;

  const leftFlap = { x: base.x - flap, y: base.y, w: flap, h: base.h };
  const rightFlap = { x: base.x + base.w, y: base.y, w: flap, h: base.h };
  const topFlap = { x: base.x, y: base.y - flap, w: base.w, h: flap };
  const bottomFlap = { x: base.x, y: base.y + base.h, w: base.w, h: flap };

  // base outline
  drawBoxRect(base, "rgba(0,120,255,0.95)", 6);
  drawText("Object Base", base.x + 10, base.y - 10);

  // fold sides
  if (step >= 1) {
    shadeRegion(leftFlap, "rgba(0,255,255,0.14)");
    shadeRegion(rightFlap, "rgba(0,255,255,0.14)");
    drawArrow(leftFlap.x + 10, leftFlap.y + leftFlap.h / 2, base.x + 10, base.y + base.h / 2);
    drawArrow(rightFlap.x + rightFlap.w - 10, rightFlap.y + rightFlap.h / 2, base.x + base.w - 10, base.y + base.h / 2);
    drawText("Fold sides", base.x + base.w + 12, base.y + 24);
  }

  // corner tucks for Japanese
  if (method === "japaneseB" && step >= 2) {
    drawCornerTriangle(base.x, base.y, flap * 0.55, "TL");
    drawCornerTriangle(base.x + base.w, base.y, flap * 0.55, "TR");
    drawCornerTriangle(base.x, base.y + base.h, flap * 0.55, "BL");
    drawCornerTriangle(base.x + base.w, base.y + base.h, flap * 0.55, "BR");
    drawText("Corner tuck", base.x + 12, base.y + base.h + 28);
  }

  // fold bottom
  if (step >= 3) {
    shadeRegion(bottomFlap, "rgba(255,255,0,0.14)");
    drawArrow(bottomFlap.x + bottomFlap.w / 2, bottomFlap.y + bottomFlap.h - 10, base.x + base.w / 2, base.y + base.h - 10);
    drawText("Fold up", base.x + base.w / 2 - 22, bottomFlap.y + bottomFlap.h - 18);
  }

  // fold top
  if (step >= 4) {
    shadeRegion(topFlap, "rgba(255,255,0,0.14)");
    drawArrow(topFlap.x + topFlap.w / 2, topFlap.y + 10, base.x + base.w / 2, base.y + 10);
    drawText("Fold down", base.x + base.w / 2 - 32, topFlap.y + 22);
  }

  // tape points
  if (step >= 5) {
    drawDot(base.x + base.w / 2, base.y - 24);
    drawDot(base.x + base.w / 2, base.y + base.h + 24);
    drawText("Tape", base.x + base.w / 2 - 18, base.y - 34);
  }
}

// -------------------- CALCULATIONS --------------------
function materialSaverScore(wastePct) {
  return Math.round(Math.max(0, 100 - wastePct));
}

function estimateTape(L, W, H) {
  const strips = wrapMethod?.value === "simpleA" ? 3 : 2;
  const avgStrip = (Math.min(L, W) / 3) + 2;
  return { strips, totalLengthCm: strips * avgStrip };
}

function getRequiredPaper(L, W, H) {
  const margin = 3;
  const paperW = W + 2 * H + margin;
  const paperL = L + 2 * H + margin;
  return { paperL, paperW, margin };
}

// -------------------- MARKET HELPERS --------------------
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

// -------------------- DOWNLOADS --------------------
function downloadGuidePNG() {
  if (!guideReady) return;
  const merged = mergeCanvases();
  downloadCanvas(merged, "wrapit_clean_overlay_guide.png");
}

function downloadSummaryPNG() {
  if (!finalDims) return;

  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 540;
  const g = c.getContext("2d");

  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);

  g.fillStyle = "#2b6fff";
  g.fillRect(0, 0, c.width, 92);

  g.fillStyle = "#fff";
  g.font = "bold 34px Arial";
  g.fillText("WrapIt - Summary", 24, 60);

  const { L, W, H } = finalDims;
  const paper = getRequiredPaper(L, W, H);
  const bestSheet = getBestIndianWrap(paper.paperL, paper.paperW);
  const score = materialSaverScore(bestSheet?.wastePct ?? 50);

  g.fillStyle = "#000";
  g.font = "bold 26px Arial";
  g.fillText(`Cuboid Dimensions: ${L.toFixed(1)} × ${W.toFixed(1)} × ${H.toFixed(1)} cm`, 24, 160);

  g.font = "22px Arial";
  g.fillText(`Paper Required: ${paper.paperL.toFixed(1)} × ${paper.paperW.toFixed(1)} cm`, 24, 220);

  if (bestSheet) {
    g.fillText(`Suggested Wrap Sheet: ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm)`, 24, 275);
    g.fillText(`Waste Estimate: ${bestSheet.wastePct.toFixed(1)}%`, 24, 320);
  } else {
    g.fillText(`Suggested Wrap Sheet: Use roll / larger custom sheet`, 24, 275);
  }

  g.font = "bold 26px Arial";
  g.fillText(`Material Saver Score: ${score}/100`, 24, 390);

  g.font = "18px Arial";
  g.fillStyle = "#444";
  g.fillText(`Prototype: marker-calibrated 3-view measurement + clean overlay guide.`, 24, 465);

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

// -------------------- UI OUTPUT --------------------
function showProgress() {
  let msg = "";

  if (topData) msg += `✅ TOP (marker)\nL: ${topData.L.toFixed(2)} cm | W: ${topData.W.toFixed(2)} cm\n\n`;
  else msg += "📌 TOP pending...\n\n";

  if (side1Data) msg += `✅ SIDE 1 (marker)\nH: ${side1Data.H.toFixed(2)} cm | W: ${side1Data.W.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 1 pending...\n\n";

  if (side2Data) msg += `✅ SIDE 2 (marker)\nH: ${side2Data.H.toFixed(2)} cm | L: ${side2Data.L.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 2 pending...\n\n";

  if (finalDims) {
    const { L, W, H } = finalDims;
    msg += `🎯 FINAL DIMENSIONS\nL×W×H = ${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)} cm\n\n`;
    msg += `✅ Next: Capture CLEAN TOP (no marker) for best overlay.\n`;
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

// -------------------- DRAW HELPERS --------------------
function clearOverlay() {
  ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
}

function drawRect(r, color, thickness) {
  ctxOverlay.strokeStyle = color;
  ctxOverlay.lineWidth = thickness;
  ctxOverlay.strokeRect(r.x, r.y, r.width, r.height);
}

function drawBoxRect(r, color, thickness) {
  ctxOverlay.strokeStyle = color;
  ctxOverlay.lineWidth = thickness;
  ctxOverlay.strokeRect(r.x, r.y, r.w, r.h);
}

function shadeRegion(r, fill) {
  ctxOverlay.fillStyle = fill;
  ctxOverlay.fillRect(r.x, r.y, r.w, r.h);
}

function drawText(text, x, y) {
  ctxOverlay.fillStyle = "rgba(0,0,0,0.78)";
  ctxOverlay.font = "bold 16px Arial";
  ctxOverlay.fillText(text, x, y);
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

function drawCornerTriangle(x, y, size, type) {
  ctxOverlay.strokeStyle = "rgba(255,165,0,0.95)";
  ctxOverlay.lineWidth = 4;
  ctxOverlay.beginPath();

  if (type === "TL") {
    ctxOverlay.moveTo(x, y);
    ctxOverlay.lineTo(x - size, y);
    ctxOverlay.lineTo(x, y - size);
  }
  if (type === "TR") {
    ctxOverlay.moveTo(x, y);
    ctxOverlay.lineTo(x + size, y);
    ctxOverlay.lineTo(x, y - size);
  }
  if (type === "BL") {
    ctxOverlay.moveTo(x, y);
    ctxOverlay.lineTo(x - size, y);
    ctxOverlay.lineTo(x, y + size);
  }
  if (type === "BR") {
    ctxOverlay.moveTo(x, y);
    ctxOverlay.lineTo(x + size, y);
    ctxOverlay.lineTo(x, y + size);
  }

  ctxOverlay.closePath();
  ctxOverlay.stroke();
}

function drawLabelBox(title, stepText) {
  ctxOverlay.fillStyle = "rgba(0,0,0,0.55)";
  ctxOverlay.fillRect(10, 10, canvasOverlay.width - 20, 90);

  ctxOverlay.fillStyle = "white";
  ctxOverlay.font = "bold 20px Arial";
  ctxOverlay.fillText(title, 22, 40);

  ctxOverlay.font = "14px Arial";
  ctxOverlay.fillText(stepText, 22, 68);
}

// -------------------- CLEANUP --------------------
function cleanup(...mats) {
  mats.forEach(m => {
    if (m && typeof m.delete === "function") m.delete();
  });
}
