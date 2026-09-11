const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("video");
const faceCanvas = document.getElementById("faceCanvas");
const handCtx = faceCanvas.getContext("2d");
const overlay = document.getElementById("gameOverlay");
const mainButton = document.getElementById("mainButton");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const statusText = document.getElementById("status");
const scoreLabel = document.getElementById("score");
const bestLabel = document.getElementById("bestScore");
const badge = document.getElementById("trackingBadge");
const fistValue = document.getElementById("noseValue");
const altitudeFill = document.getElementById("altitudeFill");
const cameraMessage = document.getElementById("cameraMessage");

let stream, hands, tracking = false, playing = false;
let fistY = .5, targetY = 270, birdY = 270, score = 0, best = 0, speed = 4.3;
let obstacles = [], animationId, lastTime = 0, spawnClock = 0;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#0c2c67"); gradient.addColorStop(.55, "#12579a"); gradient.addColorStop(1, "#2e9fbe");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 35; i++) {
    const x = (i * 137 + 80) % canvas.width, y = (i * 61 + 40) % canvas.height;
    ctx.fillStyle = "rgba(255,255,255,.24)"; ctx.beginPath(); ctx.arc(x, y, (i % 4) + 1, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBird() {
  ctx.save(); ctx.translate(175, birdY); ctx.rotate((birdY - targetY) * .004);
  ctx.fillStyle = "#ffd45e"; ctx.beginPath(); ctx.ellipse(0, 0, 27, 20, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff668e"; ctx.beginPath(); ctx.ellipse(-12, 2, 19, 13, -.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(10, -8, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#10234d"; ctx.beginPath(); ctx.arc(12, -8, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ff9e4d"; ctx.beginPath(); ctx.moveTo(24, 0);ctx.lineTo(39,5);ctx.lineTo(24,10);ctx.fill(); ctx.restore();
}

function drawObstacle(obstacle) {
  const glow = ctx.createLinearGradient(obstacle.x, 0, obstacle.x + obstacle.width, 0);
  glow.addColorStop(0, "#4ff4db"); glow.addColorStop(.5, "#70aaff"); glow.addColorStop(1, "#4ff4db");
  ctx.fillStyle = glow;
  ctx.fillRect(obstacle.x, 0, obstacle.width, obstacle.gapTop);
  ctx.fillRect(obstacle.x, obstacle.gapTop + obstacle.gap, obstacle.width, canvas.height - obstacle.gapTop - obstacle.gap);
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.fillRect(obstacle.x - 5, obstacle.gapTop - 12, obstacle.width + 10, 12);
  ctx.fillRect(obstacle.x - 5, obstacle.gapTop + obstacle.gap, obstacle.width + 10, 12);
}

function collision(obstacle) {
  const birdLeft = 150, birdRight = 200, birdTop = birdY - 18, birdBottom = birdY + 18;
  return birdRight > obstacle.x && birdLeft < obstacle.x + obstacle.width &&
    (birdTop < obstacle.gapTop || birdBottom > obstacle.gapTop + obstacle.gap);
}

function gameLoop(time) {
  if (!playing) return;
  const delta = Math.min(2, (time - lastTime) / 16.67 || 1); lastTime = time;
  drawBackground();
  targetY = clamp(fistY * canvas.height, 45, canvas.height - 45);
  birdY += (targetY - birdY) * .13 * delta;
  spawnClock += delta;
  if (spawnClock > 94) {
    const gap = Math.max(135, 185 - score * 2);
    obstacles.push({ x: canvas.width + 50, width: 62, gapTop: 65 + Math.random() * (canvas.height - gap - 130), gap, counted:false });
    spawnClock = 0;
  }
  obstacles.forEach((obstacle) => { obstacle.x -= speed * delta; drawObstacle(obstacle); });
  obstacles = obstacles.filter((obstacle) => obstacle.x > -100);
  for (const obstacle of obstacles) {
    if (collision(obstacle) || birdY < 20 || birdY > canvas.height - 20) { endGame(); return; }
    if (!obstacle.counted && obstacle.x + obstacle.width < 175) {
      obstacle.counted = true; score += 1; speed += .14; scoreLabel.textContent = score;
    }
  }
  drawBird();
  animationId = requestAnimationFrame(gameLoop);
}

function isClosedFist(points) {
  const palmSize = Math.max(.001, distance(points[0], points[9]));
  const fingertipDistance =
    (distance(points[8], points[0]) + distance(points[12], points[0]) +
      distance(points[16], points[0]) + distance(points[20], points[0])) / 4;
  return fingertipDistance / palmSize < 1.62;
}

function drawHand(points, closed) {
  faceCanvas.width = video.videoWidth || 480;
  faceCanvas.height = video.videoHeight || 640;
  handCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
  handCtx.strokeStyle = closed ? "#4ff4db" : "#ff668e";
  handCtx.lineWidth = 5;
  handCtx.beginPath();
  points.forEach((point, index) => {
    const x = point.x * faceCanvas.width, y = point.y * faceCanvas.height;
    if (index === 0) handCtx.moveTo(x, y); else handCtx.lineTo(x, y);
  });
  handCtx.stroke();
  const centre = points[9];
  handCtx.fillStyle = closed ? "#ffd45e" : "#ff668e";
  handCtx.beginPath();
  handCtx.arc(centre.x * faceCanvas.width, centre.y * faceCanvas.height, 14, 0, Math.PI * 2);
  handCtx.fill();
}

function onHandResults(results) {
  if (!tracking) return;
  handCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
  const allHands = results.multiHandLandmarks;
  if (!allHands || !allHands.length) {
    statusText.textContent = "Hand not found. Hold one closed fist in the preview.";
    badge.classList.remove("active"); badge.innerHTML = "<i></i> FIST LOST"; fistValue.textContent = "SEARCHING";
    return;
  }
  const points = allHands[0];
  const closed = isClosedFist(points);
  drawHand(points, closed);
  if (!closed) {
    statusText.textContent = "Hand found — close your fingers into a fist to steer.";
    badge.classList.remove("active"); badge.innerHTML = "<i></i> OPEN HAND"; fistValue.textContent = "MAKE FIST";
    return;
  }
  fistY = clamp(points[9].y, .05, .95);
  altitudeFill.style.width = (fistY * 100) + "%";
  fistValue.textContent = Math.round((1 - fistY) * 100) + "% ALT";
  statusText.textContent = playing ? "Fist locked. Fly through the gates!" : "Fist found. Press launch when ready.";
  badge.classList.add("active"); badge.innerHTML = "<i></i> FIST LOCKED";
}

async function handLoop() {
  if (!tracking || !hands || video.readyState < 3) return;
  await hands.send({ image: video });
  requestAnimationFrame(handLoop);
}

async function startCamera() {
  try {
    mainButton.disabled = true; mainButton.textContent = "Loading...";
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});
    video.srcObject = stream; await video.play();
    hands = new Hands({ locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: .65, minTrackingConfidence: .6 });
    hands.onResults(onHandResults);
    cameraMessage.classList.add("hidden"); tracking = true; handLoop();
    overlayTitle.textContent = "Fist tracker ready!";
    overlayText.textContent = "Keep one closed fist in the preview. Raise it to fly upward.";
    mainButton.textContent = "Launch Game"; mainButton.disabled = false;
  } catch (error) {
    overlayText.textContent = "Camera access was blocked. Open through Live Server, allow camera access, then retry.";
    mainButton.textContent = "Try Camera Again"; mainButton.disabled = false;
  }
}

function launchGame() {
  if (!tracking) { startCamera(); return; }
  score = 0; speed = 4.3; obstacles = []; spawnClock = 0;
  birdY = fistY * canvas.height; targetY = birdY; scoreLabel.textContent = "0";
  overlay.classList.add("hidden"); playing = true; lastTime = performance.now(); animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  playing = false; cancelAnimationFrame(animationId); best = Math.max(best, score); bestLabel.textContent = best;
  overlayTitle.textContent = score >= 8 ? "Elite fist pilot!" : "The gates got you.";
  overlayText.textContent = "Score: " + score + ". Raise your fist to fly higher and lower it to dive.";
  mainButton.textContent = "Fly Again"; overlay.classList.remove("hidden");
}

mainButton.addEventListener("click", () => tracking ? launchGame() : startCamera());
drawBackground(); drawBird();
