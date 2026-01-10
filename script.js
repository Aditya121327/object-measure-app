let video, canvas, ctx, resultBox, instructions;
let btnTop, btnSide1, btnSide2, btnReset;

let btnShowGuide, btnPrevStep, btnNextStep, wrapMethod;

let cvReady = false;

// ✅ marker size in cm (change this to 10.0 if you use 10×10 marker)
const MARKER_SIZE_CM = 5.0;

// ✅ Indian market wrap sheet sizes (cm)
const INDIAN_WRAP_SIZES = [
  { name: "Small sheet", w: 50, h: 70 },
  { name: "Medium sheet", w: 70, h: 100 },
  { name: "Large sheet", w: 100, h: 150 },
  { name: "XL sheet", w: 120, h: 180 }
];

// store results
let topData = null;   // {L,W}
let side1Data = null; // {H,W}
let side2Data = null; // {H,L}

// final dimensions
let finalDims = null; // {L,W,H}

// guide state
let guideStep = 0;
let guideActive = false;

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

  // wrapping guide controls
  btnShowGuide = document.getElementById("btnShowGuide");
  btnPrevStep = document.getElementById("btnPrevStep");
  btnNextStep = document.getElementById("btnNextStep");
  wrapMethod = document.getElementById("wrapMethod");

  await startCamera();

  btnTop.onclick = () => captureAndMeasure("top");
  btnSide1.onclick = () => captureAndMeasure("side1");
  btnSide2.onclick = () => captureAndMeasure("side2");
  btnReset.onclick = resetAll;

  btnShowGuide.onclick = startGuide;
  btnPrevStep.onclick = () => changeStep(-1);
  btnNextStep.onclick = () => changeStep(1);

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
  finalDims = null;

  guideActive = false;
  guideStep = 0;
  btnPrevStep.disabled = true;
  btnNextStep.disabled = true;

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

  // Disable guide while measuring
  guideActive = false;
  btnPrevStep.disabled = true;
  btnNextStep.disabled = true;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  showStatus(`⏳ Processing ${mode.toUpperCase()} photo...`);

  setTimeout(() => {
    const obj = analyzeImage();
    if (!obj) return;

    const longSide = Math.max(obj.wCm, obj.hCm);
    const shortSide = Math.min(obj.wCm, obj.hCm);

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
      instructions.innerText = "✅ All photos captured. Final result calculated.";
    }

    computeFinal();
    showProgress();
  }, 80);
}

function computeFinal() {
  if (!(topData && side1Data && side2Data)) return;

  const L = side2Data.L;
  const W = side1Data.W;
  const H = (side1Data.H + side2Data.H) / 2;

  finalDims = { L, W, H };
}

// ✅ Analysis (marker scale + object contour)
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
    showStatus("❌ Marker not detected.\nKeep marker clear, not blurred.");
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return null;
  }

  const markerPx = (markerRect.width + markerRect.height) / 2;
  const pxPerCm = markerPx / MARKER_SIZE_CM;

  const wCm = objectRect.width / pxPerCm;
  const hCm = objectRect.height / pxPerCm;

  // draw debug rectangles
  cv.rectangle(src,
    new cv.Point(objectRect.x, objectRect.y),
    new cv.Point(objectRect.x + objectRect.width, objectRect.y + objectRect.height),
    new cv.Scalar(0, 255, 0, 255),
    4
  );

  cv.rectangle(src,
    new cv.Point(markerRect.x, markerRect.y),
    new cv.Point(markerRect.x + markerRect.width, markerRect.y + markerRect.height),
    new cv.Scalar(255, 0, 0, 255),
    4
  );

  cv.imshow(canvas, src);

  cleanup(src, gray, blur, edges, contours, hierarchy);
  return { wCm, hCm };
}

function showProgress() {
  let msg = "";

  if (topData) msg += `✅ TOP VIEW\nL: ${topData.L.toFixed(2)} cm\nW: ${topData.W.toFixed(2)} cm\n\n`;
  else msg += "📌 TOP VIEW pending...\n\n";

  if (side1Data) msg += `✅ SIDE 1\nH: ${side1Data.H.toFixed(2)} cm\nW: ${side1Data.W.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 1 pending...\n\n";

  if (side2Data) msg += `✅ SIDE 2\nH: ${side2Data.H.toFixed(2)} cm\nL: ${side2Data.L.toFixed(2)} cm\n\n`;
  else msg += "📌 SIDE 2 pending...\n\n";

  if (finalDims) {
    msg += `🎯 FINAL DIMENSIONS\nL×W×H = ${finalDims.L.toFixed(2)} × ${finalDims.W.toFixed(2)} × ${finalDims.H.toFixed(2)} cm\n\n`;
    msg += `✅ You can now click "Show Wrapping Guide"\n`;
  }

  showStatus(msg);
}

function showStatus(text) {
  resultBox.innerText = text;
}

// ------------------- WRAPPING GUIDE -------------------

function startGuide() {
  if (!finalDims) {
    showStatus("❌ First complete measurement (TOP + SIDE1 + SIDE2).");
    return;
  }

  if (wrapMethod.value !== "japaneseB") {
    showStatus("⚠️ Only Japanese Fold (Method B) is enabled right now.");
    return;
  }

  guideActive = true;
  guideStep = 0;

  btnPrevStep.disabled = false;
  btnNextStep.disabled = false;

  drawJapaneseGuide();
}

function changeStep(delta) {
  guideStep += delta;
  if (guideStep < 0) guideStep = 0;
  if (guideStep > 5) guideStep = 5;

  if (guideActive) drawJapaneseGuide();
}

function drawJapaneseGuide() {
  const { L, W, H } = finalDims;

  // Required paper size for cuboid wrap
  const margin = 3; // cm extra overlap
  const paperW = W + 2 * H + margin;
  const paperL = L + 2 * H + margin;

  // Indian market recommendations
  const bestSheet = getBestIndianWrap(paperL, paperW);
  const roll = suggestWrapRoll(paperL, paperW);

  // draw template
  drawDiagram(paperL, paperW, L, W, H, guideStep);

  const stepText = [
    "Step 1: Place box at center of paper.",
    "Step 2: Fold left and right long sides inward.",
    "Step 3: Make diagonal corner tucks (triangle folds).",
    "Step 4: Fold bottom side upward and align edges.",
    "Step 5: Fold top side downward and tuck-lock flap.",
    "Step 6: Apply minimal tape at marked positions."
  ];

  let sheetText = "";
  if (bestSheet) {
    sheetText =
      `🛒 Suggested wrap size (India): ${bestSheet.name} (${bestSheet.w}×${bestSheet.h} cm)\n` +
      `Waste estimate: ${bestSheet.waste.toFixed(0)} cm²`;
  } else {
    sheetText = "❌ No standard sheet fits. Use roll or bigger custom sheet.";
  }

  let rollText = "";
  if (roll) {
    rollText = `📏 Roll option: Buy ${roll.rollWidth} cm roll, cut length ≈ ${roll.cutLength.toFixed(1)} cm`;
  }

  showStatus(
    `🎌 Japanese Wrapping Guide (Method B)\n\n` +
    `Required paper: ${paperL.toFixed(1)} × ${paperW.toFixed(1)} cm\n` +
    `${sheetText}\n` +
    `${rollText}\n\n` +
    stepText[guideStep]
  );
}

// ------------------- DRAWING -------------------

function drawDiagram(paperL, paperW, boxL, boxW, boxH, step) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pad = 30;
  const maxDrawW = canvas.width - pad * 2;
  const maxDrawH = canvas.height - pad * 2;

  const scale = Math.min(maxDrawW / paperL, maxDrawH / paperW);

  const pw = paperL * scale;
  const ph = paperW * scale;

  const x0 = (canvas.width - pw) / 2;
  const y0 = (canvas.height - ph) / 2;

  // Paper outline
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, pw, ph);

  // Box placement (center)
  const boxX = x0 + (pw - boxL * scale) / 2;
  const boxY = y0 + (ph - boxW * scale) / 2;
  const bw = boxL * scale;
  const bh = boxW * scale;

  ctx.strokeStyle = "#007bff";
  ctx.lineWidth = 3;
  ctx.strokeRect(boxX, boxY, bw, bh);

  // Fold lines at H distance
  const foldLeft = boxX - boxH * scale;
  const foldRight = boxX + bw + boxH * scale;
  const foldTop = boxY - boxH * scale;
  const foldBottom = boxY + bh + boxH * scale;

  // dashed fold lines
  ctx.setLineDash([10, 7]);
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;

  // vertical folds
  drawLine(foldLeft, y0, foldLeft, y0 + ph);
  drawLine(foldRight, y0, foldRight, y0 + ph);

  // horizontal folds
  drawLine(x0, foldTop, x0 + pw, foldTop);
  drawLine(x0, foldBottom, x0 + pw, foldBottom);

  ctx.setLineDash([]);

  // Corner triangles
  if (step >= 2) {
    ctx.strokeStyle = "orange";
    ctx.lineWidth = 3;

    drawLine(foldLeft, foldTop, boxX, boxY);
    drawLine(foldRight, foldTop, boxX + bw, boxY);
    drawLine(foldLeft, foldBottom, boxX, boxY + bh);
    drawLine(foldRight, foldBottom, boxX + bw, boxY + bh);
  }

  // Tape points
  if (step >= 5) {
    ctx.fillStyle = "red";
    drawDot(boxX + bw / 2, boxY - 15);
    drawDot(boxX + bw / 2, boxY + bh + 15);
  }

  // Arrows
  if (step === 1) {
    drawArrow(foldLeft - 20, boxY + bh / 2, boxX + 10, boxY + bh / 2);
    drawArrow(foldRight + 20, boxY + bh / 2, boxX + bw - 10, boxY + bh / 2);
  }

  if (step === 3) drawArrow(boxX + bw / 2, foldBottom + 30, boxX + bw / 2, boxY + bh - 10);
  if (step === 4) drawArrow(boxX + bw / 2, foldTop - 30, boxX + bw / 2, boxY + 10);
}

function drawLine(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawDot(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawArrow(x1, y1, x2, y2) {
  ctx.strokeStyle = "green";
  ctx.lineWidth = 4;
  drawLine(x1, y1, x2, y2);

  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 15;

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = "green";
  ctx.fill();
}

// ------------------- MARKET SIZE HELPERS -------------------

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
        best = {
          ...sheet,
          waste,
          sheetArea,
          usedArea,
          rotated: fitsRotated && !fitsNormal
        };
      }
    }
  }

  return best;
}

function suggestWrapRoll(reqL, reqW) {
  const rollWidths = [50, 70, 100];

  for (let rw of rollWidths) {
    const fits = (rw >= reqW) || (rw >= reqL);
    if (fits) {
      const cutLength = rw >= reqW ? reqL : reqW;
      return { rollWidth: rw, cutLength };
    }
  }

  return null;
}

// cleanup OpenCV mats
function cleanup(...mats) {
  mats.forEach(m => {
    if (m && typeof m.delete === "function") m.delete();
  });
}
