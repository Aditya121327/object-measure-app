const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureBtn = document.getElementById("capture");
const resetBtn = document.getElementById("reset");
const result = document.getElementById("result");

const gridCanvas = document.getElementById("grid");
const gridCtx = gridCanvas.getContext("2d");

const ctx = canvas.getContext("2d");

let streamRef = null;

// ----------------- CAMERA -----------------
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  streamRef = stream;
  video.srcObject = stream;
})
.catch(err => alert("Camera error: " + err.message));

// Draw grid overlay continuously
video.addEventListener("loadedmetadata", () => {
  gridCanvas.width = video.videoWidth;
  gridCanvas.height = video.videoHeight;
  drawGrid();
});

function drawGrid() {
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

  let w = gridCanvas.width;
  let h = gridCanvas.height;

  gridCtx.strokeStyle = "rgba(0,0,0,0.4)";
  gridCtx.lineWidth = 2;

  // vertical lines (3x3)
  gridCtx.beginPath();
  gridCtx.moveTo(w / 3, 0); gridCtx.lineTo(w / 3, h);
  gridCtx.moveTo((2 * w) / 3, 0); gridCtx.lineTo((2 * w) / 3, h);

  // horizontal lines (3x3)
  gridCtx.moveTo(0, h / 3); gridCtx.lineTo(w, h / 3);
  gridCtx.moveTo(0, (2 * h) / 3); gridCtx.lineTo(w, (2 * h) / 3);

  gridCtx.stroke();

  requestAnimationFrame(drawGrid);
}

// ----------------- CAPTURE -----------------
captureBtn.onclick = () => {
  result.innerText = "Capturing image...";

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Hide video, show captured image
  video.style.display = "none";
  gridCanvas.style.display = "none";
  canvas.style.display = "block";
  resetBtn.style.display = "inline-block";

  result.innerText = "Processing...";

  waitForOpenCV(() => {
    try {
      measureWithPerspectiveCorrection();
    } catch (e) {
      result.innerText = "Error: " + e.message;
    }
  });
};

// ----------------- RESET -----------------
resetBtn.onclick = () => {
  result.innerText = "";
  canvas.style.display = "none";
  video.style.display = "block";
  gridCanvas.style.display = "block";
  resetBtn.style.display = "none";
};

// ----------------- WAIT FOR OPENCV -----------------
function waitForOpenCV(cb) {
  if (typeof cv !== "undefined" && cv.Mat) cb();
  else setTimeout(() => waitForOpenCV(cb), 100);
}

// ----------------- MAIN: ACCURATE MEASUREMENT -----------------
function measureWithPerspectiveCorrection() {

  // Read image
  let src = cv.imread(canvas);

  // Center crop to reduce lens distortion impact
  let cropX = Math.floor(src.cols * 0.1);
  let cropY = Math.floor(src.rows * 0.1);
  let cropW = Math.floor(src.cols * 0.8);
  let cropH = Math.floor(src.rows * 0.8);

  let roi = src.roi(new cv.Rect(cropX, cropY, cropW, cropH));

  // Preprocess
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();

  cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, edges, 50, 150);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (contours.size() < 2) {
    result.innerText = "❌ A4 or object not detected. Ensure A4 fully visible.";
    cleanup(src, roi, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Find largest contour (A4)
  let maxArea = 0;
  let a4Contour = null;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      a4Contour = cnt;
    }
  }

  // Approximate A4 polygon (should be 4 corners)
  let peri = cv.arcLength(a4Contour, true);
  let approx = new cv.Mat();
  cv.approxPolyDP(a4Contour, approx, 0.02 * peri, true);

  if (approx.rows !== 4) {
    result.innerText = "❌ A4 corners not detected. Ensure all 4 corners visible.";
    cleanup(src, roi, gray, blur, edges, contours, hierarchy, approx);
    return;
  }

  // Extract 4 points
  let pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push({
      x: approx.intAt(i, 0),
      y: approx.intAt(i, 1)
    });
  }

  // Sort points (top-left, top-right, bottom-right, bottom-left)
  pts = sortCorners(pts);

  // Destination size: A4 in pixels (choose fixed target resolution)
  const dstW = 800;   // corresponds to 21 cm
  const dstH = 1131;  // corresponds to 29.7 cm

  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    pts[0].x, pts[0].y,
    pts[1].x, pts[1].y,
    pts[2].x, pts[2].y,
    pts[3].x, pts[3].y
  ]);

  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    dstW, 0,
    dstW, dstH,
    0, dstH
  ]);

  // Warp perspective
  let M = cv.getPerspectiveTransform(srcTri, dstTri);
  let warped = new cv.Mat();
  cv.warpPerspective(roi, warped, M, new cv.Size(dstW, dstH));

  // Now measure object inside warped image
  let warpedGray = new cv.Mat();
  let warpedBlur = new cv.Mat();
  let warpedEdges = new cv.Mat();

  cv.cvtColor(warped, warpedGray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(warpedGray, warpedBlur, new cv.Size(5, 5), 0);
  cv.Canny(warpedBlur, warpedEdges, 50, 150);

  let warpedContours = new cv.MatVector();
  let warpedHierarchy = new cv.Mat();
  cv.findContours(warpedEdges, warpedContours, warpedHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  if (warpedContours.size() < 2) {
    result.innerText = "❌ Object not detected in corrected view.";
    cleanup(src, roi, gray, blur, edges, contours, hierarchy, approx, srcTri, dstTri, M,
            warped, warpedGray, warpedBlur, warpedEdges, warpedContours, warpedHierarchy);
    return;
  }

  // Largest contour = A4 in warped view, second largest = object
  let objectData = [];
  for (let i = 0; i < warpedContours.size(); i++) {
    let rect = cv.boundingRect(warpedContours.get(i));
    let area = rect.width * rect.height;
    objectData.push({ rect, area });
  }

  objectData.sort((a, b) => b.area - a.area);

  let objRect = objectData[1].rect;

  // Convert pixels to cm (since dstW = 800 px is 21 cm)
  let pxPerCmX = dstW / 21.0;
  let pxPerCmY = dstH / 29.7;

  let widthCm = (objRect.width / pxPerCmX).toFixed(2);
  let heightCm = (objRect.height / pxPerCmY).toFixed(2);

  result.innerText =
`✅ Accurate mode enabled (Warp Correction)
Object Width : ${widthCm} cm
Object Height: ${heightCm} cm`;

  // show corrected image on canvas
  cv.imshow(canvas, warped);

  cleanup(src, roi, gray, blur, edges, contours, hierarchy, approx, srcTri, dstTri, M,
          warped, warpedGray, warpedBlur, warpedEdges, warpedContours, warpedHierarchy);
}

// ----------------- SORT CORNERS -----------------
function sortCorners(pts) {
  // Sum and diff for sorting
  let sum = pts.map(p => p.x + p.y);
  let diff = pts.map(p => p.x - p.y);

  let topLeft = pts[sum.indexOf(Math.min(...sum))];
  let bottomRight = pts[sum.indexOf(Math.max(...sum))];
  let topRight = pts[diff.indexOf(Math.max(...diff))];
  let bottomLeft = pts[diff.indexOf(Math.min(...diff))];

  return [topLeft, topRight, bottomRight, bottomLeft];
}

// ----------------- CLEANUP -----------------
function cleanup(...mats) {
  mats.forEach(m => {
    try { m.delete(); } catch {}
  });
}
