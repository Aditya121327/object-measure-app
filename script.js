const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const captureBtn = document.getElementById("capture");
const result = document.getElementById("result");

let cvReady = false;

// -------- FORCE OPENCV READY CHECK --------
function waitForOpenCV(callback) {
  if (typeof cv !== "undefined" && cv.Mat) {
    cvReady = true;
    callback();
  } else {
    setTimeout(() => waitForOpenCV(callback), 100);
  }
}

// -------- CAMERA --------
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

// -------- CAPTURE --------
captureBtn.onclick = () => {
  result.innerText = "Captured image. Initializing analysis...";

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.style.display = "block";
  video.style.display = "none";

  waitForOpenCV(analyzeImage);
};

// -------- ANALYSIS --------
function analyzeImage() {
  result.innerText = "Running OpenCV analysis...";

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

  result.innerText = `Contours detected: ${contours.size()}`;

  if (contours.size() < 2) {
    result.innerText = "Not enough contours. Ensure A4 + object are visible.";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Collect contour areas
  let contourData = [];
  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;
    contourData.push({ rect, area });
  }

  // Sort descending
  contourData.sort((a, b) => b.area - a.area);

  let a4Rect = contourData[0].rect;
  let objectRect = contourData[1].rect;

  // Calibration
  let referencePixels = Math.max(a4Rect.width, a4Rect.height);
  let pixelsPerCm = referencePixels / 29.7;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

  let shape =
    Math.abs(objectRect.width - objectRect.height) < 30
      ? "Square / Circle"
      : "Rectangle";

  result.innerText =
`Reference detected: A4 sheet
Contours found: ${contours.size()}
Detected Shape: ${shape}
Object Width: ${widthCm} cm
Object Height: ${heightCm} cm`;

  cleanup(src, gray, blur, edges, contours, hierarchy);
}

// -------- CLEANUP --------
function cleanup(...mats) {
  mats.forEach(m => m.delete());
}
