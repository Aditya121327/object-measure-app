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
})
.catch(err => {
  alert("Camera error: " + err.message);
});

// Capture image
captureBtn.addEventListener("click", () => {
  // Set real canvas resolution
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Show canvas, hide video
  canvas.style.display = "block";
  video.style.display = "none";

  alert("Image captured and displayed");
});
