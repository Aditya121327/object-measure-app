alert("script.js loaded");

const video = document.getElementById("video");

navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
  audio: false
})
.then(stream => {
  video.srcObject = stream;
  alert("Camera started");
})
.catch(err => {
  alert("Camera error: " + err.name + " - " + err.message);
});
