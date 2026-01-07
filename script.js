alert("script.js loaded");

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const captureBtn = document.getElementById("capture");

// Start camera
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  video.srcObject = stream;
  alert("Camera started");
})
.catch(err => {
  alert("Camera error: " + err.message);
});

// Capture button test
captureBtn.addEventListener("click", () => {
  alert("Capture button clicked");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  alert("Image drawn to canvas");
});
