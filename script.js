const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const output = document.getElementById("output");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => video.srcObject = stream);

function capture() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  processImage();
}

function processImage() {
  let src = cv.imread(canvas);
  let gray = new cv.Mat();
  let edges = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 150);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let referenceWidthPixels = null;
  let objectRect = null;

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);

    let area = rect.width * rect.height;

    // Detect credit card (approx rectangle)
    if (area > 5000 && rect.width > rect.height) {
      referenceWidthPixels = rect.width;
    }

    // Largest contour assumed as object
    if (!objectRect || area > objectRect.width * objectRect.height) {
      objectRect = rect;
    }
  }

  if (!referenceWidthPixels || !objectRect) {
    output.innerText = "Reference object not detected";
    return;
  }

  // Credit card width = 8.56 cm
  let pixelsPerCm = referenceWidthPixels / 8.56;

  let objectWidthCm = objectRect.width / pixelsPerCm;
  let objectHeightCm = objectRect.height / pixelsPerCm;

  let shape = "Irregular";
  if (Math.abs(objectRect.width - objectRect.height) < 20) shape = "Square / Circle";
  else shape = "Rectangle";

  output.innerText =
    `Shape: ${shape}
     Width: ${objectWidthCm.toFixed(2)} cm
     Height: ${objectHeightCm.toFixed(2)} cm`;

  src.delete(); gray.delete(); edges.delete();
}
