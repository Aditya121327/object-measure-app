const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const result = document.getElementById("result");

// Start back camera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } },
      audio: false
    });
    video.srcObject = stream;
  } catch {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  }
}

startCamera();

// Capture and analyze
document.getElementById("capture").onclick = () => {
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

    // Credit card reference
    if (area > 5000 && rect.width > rect.height) {
      referencePixels = rect.width;
    }

    // Largest contour = object
    if (!objectRect || area > objectRect.width * objectRect.height) {
      objectRect = rect;
    }
  }

  if (!referencePixels || !objectRect) {
    result.innerText = "Reference card or object not detected properly";
    return;
  }

  let pixelsPerCm = referencePixels / 8.56;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

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
