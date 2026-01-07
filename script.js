const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const captureBtn = document.getElementById("capture");
const result = document.getElementById("result");

let cvReady = false;

// OpenCV ready
cv.onRuntimeInitialized = () => {
  cvReady = true;
  console.log("OpenCV ready");
};

// Start camera
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

// Capture + analyze
captureBtn.addEventListener("click", () => {
  if (!cvReady) {
    alert("OpenCV still loading. Wait 2 seconds.");
    return;
  }

  // Capture frame
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Show captured image
  canvas.style.display = "block";
  video.style.display = "none";

  analyzeImage();
});

// -------- ANALYSIS --------
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
    result.innerText = "A4 sheet or object not detected clearly";
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

  // Sort by area
  contourData.sort((a, b) => b.area - a.area);

  let a4Rect = contourData[0].rect;   // largest
  let objectRect = contourData[1].rect; // second largest

  // Calibration using A4 (29.7 cm)
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
Width: ${widthCm} cm
Height: ${heightCm} cm`;

  cleanup(src, gray, blur, edges, contours, hierarchy);
}

// Cleanup memory
function cleanup(...mats) {
  mats.forEach(m => m.delete());
}
