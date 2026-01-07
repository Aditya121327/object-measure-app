const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const result = document.getElementById("result");

let cvReady = false;

// Wait for OpenCV to load
cv['onRuntimeInitialized'] = () => {
  cvReady = true;
  console.log("OpenCV is ready");
};

// Start back camera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } },
      audio: false
    });
    video.srcObject = stream;
  } catch (err) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    video.srcObject = stream;
  }
}

startCamera();

// Capture and analyze
document.getElementById("capture").onclick = () => {
  if (!cvReady) {
    alert("OpenCV is still loading. Please wait 2 seconds and try again.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  analyzeImage();
};

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

  let referencePixels = null;
  let objectRect = null;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;

    // Detect credit card (reference object)
    if (area > 5000 && rect.width > rect.height) {
      referencePixels = rect.width;
    }

    // Largest contour assumed as object
    if (!objectRect || area > objectRect.width * objectRect.height) {
      objectRect = rect;
    }
  }

  if (!referencePixels || !objectRect) {
    result.innerText = "Reference card or object not detected properly";
    src.delete(); gray.delete(); blur.delete(); edges.delete();
    return;
  }

  // Credit card width = 8.56 cm
  let pixelsPerCm = referencePixels / 8.56;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

  // Shape detection
  let shape = "Irregular";
  if (Math.abs(objectRect.width - objectRect.height) < 20) {
    shape = "Square / Circle";
  } else {
    shape = "Rectangle";
  }

  result.innerText =
`Detected Shape: ${shape}
Width: ${widthCm} cm
Height: ${heightCm} cm`;

  src.delete(); gray.delete(); blur.delete(); edges.delete();
}
