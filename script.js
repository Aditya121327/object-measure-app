// DOM elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const result = document.getElementById("result");
const captureBtn = document.getElementById("capture");

let cvReady = false;

// OpenCV ready check
cv.onRuntimeInitialized = () => {
  cvReady = true;
  console.log("OpenCV loaded");
};

// ---------------- CAMERA START ----------------
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    alert("Camera error: " + err.message);
  }
}

// Start camera when page loads
window.onload = startCamera;

// ---------------- CAPTURE BUTTON ----------------
captureBtn.onclick = () => {
  if (!cvReady) {
    alert("OpenCV still loading. Please wait.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  analyzeImage();
};

// ---------------- IMAGE ANALYSIS ----------------
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
    result.innerText = "Not enough contours detected";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Store contours with area
  let contourData = [];
  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;
    contourData.push({ rect, area });
  }

  // Sort by area (largest first)
  contourData.sort((a, b) => b.area - a.area);

  let a4Rect = contourData[0].rect; // largest = A4

  // Object = next significant contour
  let objectRect = null;
  for (let i = 1; i < contourData.length; i++) {
    if (contourData[i].area > 2000) {
      objectRect = contourData[i].rect;
      break;
    }
  }

  if (!objectRect) {
    result.innerText = "Object not detected clearly";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Calibration (A4 long side = 29.7 cm)
  let referencePixels = Math.max(a4Rect.width, a4Rect.height);
  let pixelsPerCm = referencePixels / 29.7;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

  // Shape detection
  let shape = "Irregular";
  if (Math.abs(objectRect.width - objectRect.height) < 30) {
    shape = "Square / Circle";
  } else {
    shape = "Rectangle";
  }

  result.innerText =
`Reference: A4 Sheet
Detected Shape: ${shape}
Object Width: ${widthCm} cm
Object Height: ${heightCm} cm`;

  cleanup(src, gray, blur, edges, contours, hierarchy);
}

// ---------------- CLEANUP ----------------
function cleanup(...mats) {
  mats.forEach(m => m.delete());
}
