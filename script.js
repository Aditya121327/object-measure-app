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
  } catch {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });
    video.srcObject = stream;
  }
}

startCamera();

// Capture & analyze
document.getElementById("capture").onclick = () => {
  if (!cvReady) {
    alert("OpenCV is still loading. Please wait 2 seconds.");
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

  let a4Rect = null;
  let a4Area = 0;

  // STEP 1: Detect A4 sheet
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;

    let aspectRatio = rect.width / rect.height;

    // A4 aspect ratio ≈ 1 : 1.414
    if (
      area > 30000 &&
      (aspectRatio > 0.65 && aspectRatio < 0.8 ||
       aspectRatio > 1.3 && aspectRatio < 1.6)
    ) {
      if (area > a4Area) {
        a4Area = area;
        a4Rect = rect;
      }
    }
  }

  if (!a4Rect) {
    result.innerText = "A4 sheet not detected";
    cleanup(src, gray, blur, edges);
    return;
  }

  // STEP 2: Detect object (largest contour EXCLUDING A4)
  let objectRect = null;
  let objectArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;

    // Ignore A4 area
    if (
      rect.x === a4Rect.x &&
      rect.y === a4Rect.y &&
      rect.width === a4Rect.width &&
      rect.height === a4Rect.height
    ) {
      continue;
    }

    if (area > objectArea) {
      objectArea = area;
      objectRect = rect;
    }
  }

  if (!objectRect) {
    result.innerText = "Object not detected";
    cleanup(src, gray, blur, edges);
    return;
  }

  // STEP 3: Measurement using A4 (29.7 cm)
  let referencePixels = Math.max(a4Rect.width, a4Rect.height);
  let pixelsPerCm = referencePixels / 29.7;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

  // STEP 4: Shape detection
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

  cleanup(src, gray, blur, edges);
}
