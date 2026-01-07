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
    cleanup(src, gray, blur, edges);
    return;
  }

  // STEP 1: Store all contours with areas
  let contourData = [];

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let rect = cv.boundingRect(cnt);
    let area = rect.width * rect.height;

    contourData.push({ rect, area });
  }

  // STEP 2: Sort contours by area (descending)
  contourData.sort((a, b) => b.area - a.area);

  let a4Rect = contourData[0].rect; // largest = A4

let objectRect = null;
for (let i = 1; i < contourData.length; i++) {
  if (contourData[i].area > 2000) { // ignore tiny/noisy contours
    objectRect = contourData[i].rect;
    break;
  }
}

if (!objectRect) {
  result.innerText = "Object not detected clearly";
  cleanup(src, gray, blur, edges);
  return;
}

  // STEP 4: Calibration using A4 (longer side = 29.7 cm)
  let referencePixels = Math.max(a4Rect.width, a4Rect.height);
  let pixelsPerCm = referencePixels / 29.7;

  let widthCm = (objectRect.width / pixelsPerCm).toFixed(2);
  let heightCm = (objectRect.height / pixelsPerCm).toFixed(2);

  // STEP 5: Shape detection (on OBJECT only)
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
