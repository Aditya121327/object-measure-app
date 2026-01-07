const video = document.getElementById("video");
const captureBtn = document.getElementById("capture");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Start camera – FORCE BACK CAMERA
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: "environment" } // BACK CAMERA
      },
      audio: false
    });

    video.srcObject = stream;
    video.play();
  } catch (err) {
    console.error("Back camera failed, trying default camera...", err);

    // Fallback if exact back camera fails
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    video.srcObject = stream;
    video.play();
  }
}

// Capture photo
captureBtn.addEventListener("click", () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  alert("Photo captured! (Measurement logic comes next)");
});

// Start on page load
window.onload = startCamera;
