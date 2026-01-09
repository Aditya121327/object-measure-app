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

// Measure object using A4 reference
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
    result.innerText = "A4 sheet or object not detected clearly";
    cleanup(src, gray, blur, edges, contours, hierarchy);
    return;
  }

  // Store contours with area
  let data = [];
  for (let i = 0; i < contours.size(); i++) {
    let rect = cv.boundingRect(contours.get(i));
    let area = rect.width * rect.height;
    data.push({ rect, area });
  }

  // Sort by size (largest first)
  data.sort((a, b) => b.area - a.area);

  let a4 = data[0].rect;       // largest contour = A4
  let object = data[1].rect;   // second largest = object

  // A4 long side = 29.7 cm
  let pixelsPerCm = Math.max(a4.width, a4.height) / 29.7;

  let widthCm = (object.width / pixelsPerCm).toFixed(2);
  let heightCm = (object.height / pixelsPerCm).toFixed(2);

  result.innerText =
`Object Width : ${widthCm} cm
Object Height: ${heightCm} cm`;

  cleanup(src, gray, blur, edges, contours, hierarchy);
}

// Clean memory
function cleanup(...mats) {
  mats.forEach(m => m.delete());
}
