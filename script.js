const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureButton = document.getElementById("capture");
const result = document.getElementById("result");
const ctx = canvas.getContext("2d");

// Open back camera
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  video.srcObject = stream;
})
.catch(err => alert("Camera error: " + err.message));

// Capture image
captureButton.onclick = () => {

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  video.style.display = "none";
  canvas.style.display = "block";

  result.innerText = "Analyzing image...";

  waitForOpenCV(measureObject);
};

// Ensure OpenCV is ready
function waitForOpenCV(callback) {
  if (typeof cv !== "undefined" && cv.Mat) {
    callback();
  } else {
    setTimeout(() => waitForOpenCV(callback), 100);
  }
}

// Measure object using TRUE A4 detection
function measureObject() {

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

  let a4Rect = null;
  let objectRect = null;
  let maxArea = 0;

  // STEP 1: Find A4 sheet using aspect ratio
  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;

    let ratio = rect.width / rect.height;
    ratio = ratio > 1 ? ratio : 1 / ratio; // make ratio >= 1

    // A4 ratio ≈ 1.414
    if (area > 30000 && ratio > 1.3 && ratio < 1.55) {
      a4Rect = rect;
      break;
    }
  }

  // If no A4 found, stop
  if (!a4Rect) {
    result.innerText = "❌ A4 sheet not detected. Please place object on A4 paper.";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // STEP 2: Find object (largest contour EXCEPT A4)
  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;

    // skip A4 region
    if (
      rect.x === a4Rect.x &&
      rect.y === a4Rect.y &&
      rect.width === a4Rect.width &&
      rect.height === a4Rect.height
    ) continue;

    if (area > maxArea) {
      maxArea = area;
      objectRect = rect;
    }
  }

  if (!objectRect) {
    result.innerText = "❌ Object not detected clearly.";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // A4 long side = 29.7 cm
  let pixelsPerCm = Math.max(a4Rect.width, a4Rect.height) / 29.7;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

  result.innerText =
`✅ A4 detected
Object Width : ${widthCm} cm
Object Height: ${heightCm} cm`;

  cleanup(src, gray, blur, edges, contours, hierarchy);
}

// Cleanup memory
function cleanup(...mats) {
  mats.forEach(m => m.delete());
}
