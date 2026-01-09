const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureButton = document.getElementById("capture");
const result = document.getElementById("result");
const ctx = canvas.getContext("2d");

navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => video.srcObject = stream)
.catch(err => alert("Camera error: " + err.message));

captureButton.onclick = () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  video.style.display = "none";
  canvas.style.display = "block";

  result.innerText = "Analyzing...";
  waitForOpenCV(measureObject);
};

function waitForOpenCV(callback) {
  if (typeof cv !== "undefined" && cv.Mat) callback();
  else setTimeout(() => waitForOpenCV(callback), 100);
}

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

  if (contours.size() < 2) {
    result.innerText = "Not enough objects detected.";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Store contours + area
  let contourData = [];
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    contourData.push({ cnt, area });
  }

  // Sort by area (largest first)
  contourData.sort((a, b) => b.area - a.area);

  let a4Contour = contourData[0].cnt;       // largest = A4
  let objectContour = contourData[1].cnt;   // second largest = object

  // ROTATED RECT for A4
  let a4Rect = cv.minAreaRect(a4Contour);
  let a4Width = a4Rect.size.width;
  let a4Height = a4Rect.size.height;

  // Ensure correct sides
  let a4Long = Math.max(a4Width, a4Height);
  let a4Short = Math.min(a4Width, a4Height);

  // Check A4 ratio to confirm
  let ratio = a4Long / a4Short;
  if (ratio < 1.3 || ratio > 1.55) {
    result.innerText = "A4 not detected properly. Ensure A4 edges visible.";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Scale using both sides average
  let scaleLong = a4Long / 29.7;  // px per cm
  let scaleShort = a4Short / 21.0;
  let pixelsPerCm = (scaleLong + scaleShort) / 2;

  // ROTATED RECT for object
  let objRect = cv.minAreaRect(objectContour);
  let objW = Math.max(objRect.size.width, objRect.size.height);
  let objH = Math.min(objRect.size.width, objRect.size.height);

  let widthCm = (objW / pixelsPerCm).toFixed(2);
  let heightCm = (objH / pixelsPerCm).toFixed(2);

  result.innerText =
`✅ Accurate A4 detected
Object Length: ${widthCm} cm
Object Width : ${heightCm} cm`;

  cleanup(src, gray, blur, edges, contours, hierarchy);
}

function cleanup(...mats) {
  mats.forEach(m => m.delete());
}
