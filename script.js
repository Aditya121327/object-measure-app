// Get elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureButton = document.getElementById("capture");
const result = document.getElementById("result");
const ctx = canvas.getContext("2d");

// STEP 1: Open phone camera (BACK camera)
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  video.srcObject = stream;
})
.catch(error => {
  alert("Camera error: " + error.message);
});

// STEP 2: Capture image
captureButton.addEventListener("click", () => {

  // Set canvas size
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw image on canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Show canvas, hide video
  canvas.style.display = "block";
  video.style.display = "none";

  // TEMPORARY measurement (FAKE)
  showFakeMeasurement();
});

// STEP 3: Fake measurement (for testing flow)
function showFakeMeasurement() {
  result.innerText =
    "Object Width: 20 cm\n" +
    "Object Height: 12 cm";
}
