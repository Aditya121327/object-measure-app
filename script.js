// Get elements from HTML
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const captureButton = document.getElementById("capture");
const ctx = canvas.getContext("2d");

// STEP 1: Open the phone camera
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" }, // back camera
  audio: false
})
.then(stream => {
  video.srcObject = stream;
})
.catch(error => {
  alert("Camera error: " + error.message);
});

// STEP 2: Capture image when button is clicked
captureButton.addEventListener("click", () => {

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.style.display = "block";
  video.style.display = "none";

  // TEMP: show fake measurement
  fakeMeasurement();
});

  // Set canvas size same as video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw current video frame on canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Show captured image
  canvas.style.display = "block";
  video.style.display = "none";
});

const result = document.getElementById("result");

// TEMPORARY: simulate measurement
function fakeMeasurement() {
  result.innerText =
    "Object Width: 20 cm\nObject Height: 12 cm";
}


