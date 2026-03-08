const COLS = 10;
const ROWS = 20;
const CELL_SIZE = 30;
const PREVIEW_SIZE = 4;
const PREVIEW_CELL_SIZE = 24;
const EMPTY_CELL = 0;
const BASE_DROP_INTERVAL_MS = 500;
const LEVEL_SPEED_STEP_MS = 35;
const MIN_DROP_INTERVAL_MS = 120;
const SOFT_DROP_INTERVAL_MS = 70;
const LINES_PER_LEVEL = 10;
const LINE_CLEAR_FLASH_MS = 140;
const LOCK_FLASH_MS = 110;
const HARD_DROP_IMPACT_MS = 140;
const GAME_OVER_FADE_MS = 420;
const SCORE_BY_LINES = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};
const TAP_MAX_MOVEMENT_PX = 18;
const TAP_MAX_DURATION_MS = 260;
const SWIPE_DOWN_MIN_DISTANCE_PX = 55;
const FAST_SWIPE_SPEED_PX_PER_MS = 1.25;
const UPPER_ROTATE_REGION_RATIO = 0.36;

const TETROMINOES = [
  { name: "I", color: "#14b8a6", shape: [[1, 1, 1, 1]] },
  {
    name: "O",
    color: "#f59e0b",
    shape: [
      [1, 1],
      [1, 1],
    ],
  },
  {
    name: "T",
    color: "#8b5cf6",
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    name: "S",
    color: "#22c55e",
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    name: "Z",
    color: "#ef4444",
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  },
  {
    name: "J",
    color: "#3b82f6",
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
  {
    name: "L",
    color: "#f97316",
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  },
];

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");
const appEl = document.querySelector(".app");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas.getContext("2d");
const holdCanvas = document.getElementById("holdCanvas");
const holdCtx = holdCanvas.getContext("2d");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const installBtn = document.getElementById("installBtn");
const soundToggleBtn = document.getElementById("soundToggleBtn");
const mobileLeftBtn = document.getElementById("mobileLeftBtn");
const mobileRightBtn = document.getElementById("mobileRightBtn");
const mobileRotateBtn = document.getElementById("mobileRotateBtn");
const mobileSoftDropBtn = document.getElementById("mobileSoftDropBtn");
const mobileHardDropBtn = document.getElementById("mobileHardDropBtn");

let score = 0;
let level = 1;
let totalClearedLines = 0;
let board = [];
let activePiece = null;
let nextPiece = null;
let holdPiece = null;
let dropTimerId = null;
let isSoftDropping = false;
let isPaused = false;
let isGameOver = false;
let hasGameStarted = false;
let canHoldCurrentPiece = true;
let isMuted = false;
let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;
let musicTimerId = null;
let musicStep = 0;
const sfxLastPlayedAt = {
  rotate: 0,
  lock: 0,
  lineClear: 0,
  hardDrop: 0,
  gameOver: 0,
};
let lastStepTimeMs = performance.now();
let isLineClearAnimating = false;
let lineClearEffect = null;
let lineClearTimerId = null;
let lockEffect = null;
let hardDropEffect = null;
let gameOverAnimStartMs = null;
let renderLoopId = null;
let isTouchScreenDevice = false;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTimeMs = 0;
let isTrackingTouchGesture = false;
let lastTouchTapTimeMs = 0;
let mobileSoftDropTimerId = null;
let deferredInstallPrompt = null;

function isFullscreenActive() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFullscreenButtonLabel() {
  if (!fullscreenBtn) {
    return;
  }

  fullscreenBtn.textContent = isFullscreenActive()
    ? "Exit Fullscreen"
    : "Fullscreen";
}

function syncFullscreenLayoutState() {
  document.body.classList.toggle("is-fullscreen", isFullscreenActive());
  updateFullscreenButtonLabel();
}

function updateInstallButtonVisibility() {
  if (!installBtn) {
    return;
  }

  installBtn.hidden = !deferredInstallPrompt;
}

async function promptInstall() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch {
    // Ignore user cancellation.
  }

  deferredInstallPrompt = null;
  updateInstallButtonVisibility();
}

async function toggleFullscreen() {
  const isActive = isFullscreenActive();

  try {
    if (isActive) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      return;
    }

    if (appEl.requestFullscreen) {
      await appEl.requestFullscreen();
    } else if (appEl.webkitRequestFullscreen) {
      appEl.webkitRequestFullscreen();
    }
  } catch {
    // Ignore fullscreen failures (platform/browser restrictions).
  } finally {
    syncFullscreenLayoutState();
  }
}

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY_CELL));
}

function cloneShape(shape) {
  return shape.map((row) => [...row]);
}

function createPiece(template) {
  return {
    name: template.name,
    color: template.color,
    shape: cloneShape(template.shape),
    x: 0,
    y: 0,
  };
}

function getRandomTetrominoTemplate() {
  const randomIndex = Math.floor(Math.random() * TETROMINOES.length);
  return TETROMINOES[randomIndex];
}

function createRandomPiece() {
  return createPiece(getRandomTetrominoTemplate());
}

function updateScore(value) {
  score = value;
  scoreEl.textContent = String(score);
}

function updateLevel(value) {
  level = value;
  levelEl.textContent = String(level);
}

function setStatusMessage(message) {
  statusEl.textContent = message;
}

function getDropIntervalForLevel(currentLevel) {
  return Math.max(
    MIN_DROP_INTERVAL_MS,
    BASE_DROP_INTERVAL_MS - (currentLevel - 1) * LEVEL_SPEED_STEP_MS,
  );
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new window.AudioContext();
    masterGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    musicGain = audioCtx.createGain();

    masterGain.gain.value = 1;
    sfxGain.gain.value = 0.35;
    musicGain.gain.value = 0.2;

    sfxGain.connect(masterGain);
    musicGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  return audioCtx;
}

function updateSoundToggleLabel() {
  soundToggleBtn.textContent = isMuted ? "Sound: Off" : "Sound: On";
}

function setMuted(muted) {
  isMuted = muted;
  if (masterGain) {
    masterGain.gain.value = isMuted ? 0 : 1;
  }
  updateSoundToggleLabel();
}

function toggleMuted() {
  setMuted(!isMuted);
}

function playTone(frequency, duration, type = "square", volume = 0.1, delay = 0) {
  if (isMuted) {
    return;
  }

  const context = ensureAudioContext();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const startAt = context.currentTime + delay;
  const endAt = startAt + duration;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

  oscillator.connect(gainNode);
  gainNode.connect(sfxGain);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.01);
}

function playSfx(type) {
  if (isMuted) {
    return;
  }

  const now = Date.now();
  const minGapMsByType = {
    rotate: 40,
    lock: 90,
    lineClear: 120,
    hardDrop: 120,
    gameOver: 250,
  };

  if (now - sfxLastPlayedAt[type] < minGapMsByType[type]) {
    return;
  }
  sfxLastPlayedAt[type] = now;

  switch (type) {
    case "rotate":
      playTone(660, 0.06, "triangle", 0.08);
      break;
    case "lock":
      playTone(220, 0.08, "square", 0.1);
      break;
    case "lineClear":
      playTone(523.25, 0.1, "triangle", 0.1);
      playTone(659.25, 0.1, "triangle", 0.09, 0.08);
      break;
    case "hardDrop":
      playTone(150, 0.07, "sawtooth", 0.1);
      break;
    case "gameOver":
      playTone(196, 0.14, "sawtooth", 0.09);
      playTone(164.81, 0.2, "sawtooth", 0.08, 0.14);
      break;
    default:
      break;
  }
}

function startBackgroundMusic() {
  if (isMuted || musicTimerId || isPaused || isGameOver || !hasGameStarted) {
    return;
  }

  ensureAudioContext();
  const melody = [261.63, 329.63, 392.0, 329.63, 293.66, 349.23, 440.0, 349.23];
  musicTimerId = setInterval(() => {
    if (isMuted || isPaused || isGameOver || !hasGameStarted) {
      return;
    }

    const note = melody[musicStep % melody.length];
    playTone(note, 0.12, "triangle", 0.045);
    if (musicStep % 4 === 0) {
      playTone(note / 2, 0.1, "sine", 0.03);
    }
    musicStep += 1;
  }, 220);
}

function stopBackgroundMusic() {
  if (!musicTimerId) {
    return;
  }

  clearInterval(musicTimerId);
  musicTimerId = null;
}

function drawBlock(context, x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x, y, size, size);
  context.strokeStyle = "rgba(15, 23, 42, 0.2)";
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

function drawCell(col, row, value) {
  const x = col * CELL_SIZE;
  const y = row * CELL_SIZE;
  const color = value === EMPTY_CELL ? "#f8fafc" : value;
  drawBlock(ctx, x, y, CELL_SIZE, color);
}

function drawPiece(piece, yOffsetCells = 0, alpha = 1) {
  if (!piece) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  for (let row = 0; row < piece.shape.length; row += 1) {
    for (let col = 0; col < piece.shape[row].length; col += 1) {
      if (piece.shape[row][col] !== 1) {
        continue;
      }

      const boardX = piece.x + col;
      const boardY = piece.y + row + yOffsetCells;
      if (boardX < 0 || boardX >= COLS || boardY < 0 || boardY >= ROWS) {
        continue;
      }

      drawBlock(
        ctx,
        boardX * CELL_SIZE,
        boardY * CELL_SIZE,
        CELL_SIZE,
        piece.color,
      );
    }
  }
  ctx.restore();
}

function hexToRgba(hexColor, alpha) {
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) {
    return `rgba(15, 23, 42, ${alpha})`;
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawGhostPiece(piece) {
  if (!piece) {
    return;
  }

  let ghostY = piece.y;
  while (isValidPosition(piece, piece.x, ghostY + 1, piece.shape)) {
    ghostY += 1;
  }

  if (ghostY === piece.y) {
    return;
  }

  const ghostColor = hexToRgba(piece.color, 0.25);
  for (let row = 0; row < piece.shape.length; row += 1) {
    for (let col = 0; col < piece.shape[row].length; col += 1) {
      if (piece.shape[row][col] !== 1) {
        continue;
      }

      const boardX = piece.x + col;
      const boardY = ghostY + row;
      if (boardX < 0 || boardX >= COLS || boardY < 0 || boardY >= ROWS) {
        continue;
      }

      drawBlock(ctx, boardX * CELL_SIZE, boardY * CELL_SIZE, CELL_SIZE, ghostColor);
    }
  }
}

function getActivePieceSmoothOffsetCells() {
  if (!activePiece || isPaused || isGameOver || isLineClearAnimating) {
    return 0;
  }

  if (!isValidPosition(activePiece, activePiece.x, activePiece.y + 1)) {
    return 0;
  }

  const interval = isSoftDropping
    ? SOFT_DROP_INTERVAL_MS
    : getDropIntervalForLevel(level);
  const elapsed = performance.now() - lastStepTimeMs;
  return Math.min(elapsed / interval, 0.95);
}

function drawGridLines() {
  ctx.strokeStyle = "#d6deea";
  ctx.lineWidth = 1;

  for (let x = 0; x <= COLS; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, ROWS * CELL_SIZE);
    ctx.stroke();
  }

  for (let y = 0; y <= ROWS; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(COLS * CELL_SIZE, y * CELL_SIZE);
    ctx.stroke();
  }
}

function drawLineClearEffect() {
  if (!lineClearEffect) {
    return;
  }

  const elapsed = performance.now() - lineClearEffect.startAt;
  const progress = Math.min(elapsed / lineClearEffect.duration, 1);
  const alpha = 0.55 * (1 - progress);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

  for (const row of lineClearEffect.rows) {
    ctx.fillRect(0, row * CELL_SIZE, COLS * CELL_SIZE, CELL_SIZE);
  }

  if (progress >= 1) {
    lineClearEffect = null;
  }
}

function drawLockEffect() {
  if (!lockEffect) {
    return;
  }

  const elapsed = performance.now() - lockEffect.startAt;
  const progress = Math.min(elapsed / lockEffect.duration, 1);
  const alpha = 0.45 * (1 - progress);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;

  for (const cell of lockEffect.cells) {
    ctx.fillRect(cell.x * CELL_SIZE, cell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  if (progress >= 1) {
    lockEffect = null;
  }
}

function drawHardDropImpactEffect() {
  if (!hardDropEffect) {
    return;
  }

  const elapsed = performance.now() - hardDropEffect.startAt;
  const progress = Math.min(elapsed / hardDropEffect.duration, 1);
  const alpha = 0.5 * (1 - progress);
  const expand = progress * 6;

  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    hardDropEffect.x - expand,
    hardDropEffect.y - expand,
    hardDropEffect.width + expand * 2,
    hardDropEffect.height + expand * 2,
  );

  if (progress >= 1) {
    hardDropEffect = null;
  }
}

function drawGameOverOverlay() {
  if (!gameOverAnimStartMs) {
    return;
  }

  const elapsed = performance.now() - gameOverAnimStartMs;
  const progress = Math.min(elapsed / GAME_OVER_FADE_MS, 1);
  const alpha = 0.62 * progress;
  ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.2, progress)})`;
  ctx.font = "700 34px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      drawCell(col, row, board[row][col]);
    }
  }

  drawGhostPiece(activePiece);
  drawPiece(activePiece, getActivePieceSmoothOffsetCells());
  drawLineClearEffect();
  drawLockEffect();
  drawHardDropImpactEffect();
  drawGridLines();
  drawGameOverOverlay();
}

function startRenderLoop() {
  if (renderLoopId) {
    return;
  }

  const render = () => {
    drawBoard();
    renderLoopId = window.requestAnimationFrame(render);
  };

  renderLoopId = window.requestAnimationFrame(render);
}

function drawPiecePreview(previewCtx, previewCanvas, piece) {
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.fillStyle = "#ffffff";
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.strokeStyle = "#e2e8f0";
  previewCtx.lineWidth = 1;

  for (let x = 0; x <= PREVIEW_SIZE; x += 1) {
    previewCtx.beginPath();
    previewCtx.moveTo(x * PREVIEW_CELL_SIZE, 0);
    previewCtx.lineTo(x * PREVIEW_CELL_SIZE, PREVIEW_SIZE * PREVIEW_CELL_SIZE);
    previewCtx.stroke();
  }

  for (let y = 0; y <= PREVIEW_SIZE; y += 1) {
    previewCtx.beginPath();
    previewCtx.moveTo(0, y * PREVIEW_CELL_SIZE);
    previewCtx.lineTo(PREVIEW_SIZE * PREVIEW_CELL_SIZE, y * PREVIEW_CELL_SIZE);
    previewCtx.stroke();
  }

  if (!piece) {
    return;
  }

  const shapeHeight = piece.shape.length;
  const shapeWidth = piece.shape[0].length;
  const offsetX = Math.floor((PREVIEW_SIZE - shapeWidth) / 2);
  const offsetY = Math.floor((PREVIEW_SIZE - shapeHeight) / 2);

  for (let row = 0; row < shapeHeight; row += 1) {
    for (let col = 0; col < shapeWidth; col += 1) {
      if (piece.shape[row][col] !== 1) {
        continue;
      }

      drawBlock(
        previewCtx,
        (offsetX + col) * PREVIEW_CELL_SIZE,
        (offsetY + row) * PREVIEW_CELL_SIZE,
        PREVIEW_CELL_SIZE,
        piece.color,
      );
    }
  }
}

function drawNextPiecePreview() {
  drawPiecePreview(nextCtx, nextCanvas, nextPiece);
}

function drawHoldPiecePreview() {
  drawPiecePreview(holdCtx, holdCanvas, holdPiece);
}

function rotateShapeClockwise(shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      rotated[col][rows - 1 - row] = shape[row][col];
    }
  }

  return rotated;
}

function isValidPosition(piece, nextX, nextY, nextShape = piece.shape) {
  for (let row = 0; row < nextShape.length; row += 1) {
    for (let col = 0; col < nextShape[row].length; col += 1) {
      if (nextShape[row][col] !== 1) {
        continue;
      }

      const boardX = nextX + col;
      const boardY = nextY + row;
      if (boardX < 0 || boardX >= COLS || boardY < 0 || boardY >= ROWS) {
        return false;
      }
      if (board[boardY][boardX] !== EMPTY_CELL) {
        return false;
      }
    }
  }

  return true;
}

function positionAtSpawn(piece) {
  piece.x = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
  piece.y = 0;
}

function stopDropLoop() {
  if (!dropTimerId) {
    return;
  }

  clearInterval(dropTimerId);
  dropTimerId = null;
}

function startDropLoop() {
  if (isPaused || isGameOver || isLineClearAnimating || !activePiece) {
    return;
  }

  stopDropLoop();
  const interval = isSoftDropping
    ? SOFT_DROP_INTERVAL_MS
    : getDropIntervalForLevel(level);
  dropTimerId = setInterval(stepActivePieceDown, interval);
}

function endGame() {
  isGameOver = true;
  isPaused = false;
  isSoftDropping = false;
  isLineClearAnimating = false;
  activePiece = null;
  clearPendingLineClearTimer();
  stopDropLoop();
  stopBackgroundMusic();
  playSfx("gameOver");
  gameOverAnimStartMs = performance.now();
  setStatusMessage(`Game Over - Final Score: ${score}`);
}

function spawnPieceFromQueue(allowHold = true) {
  if (!nextPiece) {
    nextPiece = createRandomPiece();
  }

  activePiece = nextPiece;
  positionAtSpawn(activePiece);
  nextPiece = createRandomPiece();
  canHoldCurrentPiece = allowHold;
  lastStepTimeMs = performance.now();
  drawNextPiecePreview();

  if (!isValidPosition(activePiece, activePiece.x, activePiece.y)) {
    endGame();
    return false;
  }

  return true;
}

function lockActivePieceToBoard() {
  if (!activePiece) {
    return [];
  }

  const lockedCells = [];
  for (let row = 0; row < activePiece.shape.length; row += 1) {
    for (let col = 0; col < activePiece.shape[row].length; col += 1) {
      if (activePiece.shape[row][col] !== 1) {
        continue;
      }

      const boardX = activePiece.x + col;
      const boardY = activePiece.y + row;
      if (boardX < 0 || boardX >= COLS || boardY < 0 || boardY >= ROWS) {
        continue;
      }

      board[boardY][boardX] = activePiece.color;
      lockedCells.push({ x: boardX, y: boardY });
    }
  }

  return lockedCells;
}

function getFullRows() {
  const rows = [];
  for (let row = 0; row < ROWS; row += 1) {
    if (board[row].every((cellValue) => cellValue !== EMPTY_CELL)) {
      rows.push(row);
    }
  }
  return rows;
}

function clearRows(rowsToClear) {
  if (rowsToClear.length === 0) {
    return 0;
  }

  const clearSet = new Set(rowsToClear);
  const keptRows = board.filter((_, rowIndex) => !clearSet.has(rowIndex));
  const emptyRows = Array.from({ length: rowsToClear.length }, () =>
    Array(COLS).fill(EMPTY_CELL),
  );
  board = [...emptyRows, ...keptRows];
  return rowsToClear.length;
}

function triggerLineClearAnimation(rows) {
  lineClearEffect = {
    rows,
    startAt: performance.now(),
    duration: LINE_CLEAR_FLASH_MS,
  };
}

function clearPendingLineClearTimer() {
  if (!lineClearTimerId) {
    return;
  }

  window.clearTimeout(lineClearTimerId);
  lineClearTimerId = null;
}

function triggerLockEffect(cells) {
  lockEffect = {
    cells,
    startAt: performance.now(),
    duration: LOCK_FLASH_MS,
  };
}

function triggerHardDropImpact(piece, landingY) {
  const width = piece.shape[0].length * CELL_SIZE;
  const height = piece.shape.length * CELL_SIZE;
  hardDropEffect = {
    x: piece.x * CELL_SIZE,
    y: (landingY + piece.shape.length - 1) * CELL_SIZE,
    width,
    height: Math.min(height, CELL_SIZE * 0.7),
    startAt: performance.now(),
    duration: HARD_DROP_IMPACT_MS,
  };
}

function addScoreForClearedLines(linesCleared) {
  const points = SCORE_BY_LINES[linesCleared] ?? 0;
  if (points > 0) {
    updateScore(score + points);
  }
}

function addClearedLines(linesCleared) {
  if (linesCleared <= 0) {
    return;
  }

  totalClearedLines += linesCleared;
  const nextLevel = Math.floor(totalClearedLines / LINES_PER_LEVEL) + 1;
  const didLevelChange = nextLevel !== level;
  if (didLevelChange) {
    updateLevel(nextLevel);
  }

  if (didLevelChange && !isPaused && !isGameOver && activePiece) {
    startDropLoop();
  }
}

function processPieceLock() {
  const lockedCells = lockActivePieceToBoard();
  activePiece = null;
  triggerLockEffect(lockedCells);
  playSfx("lock");
  const fullRows = getFullRows();

  if (fullRows.length > 0) {
    isLineClearAnimating = true;
    isSoftDropping = false;
    stopDropLoop();
    triggerLineClearAnimation(fullRows);
    lineClearTimerId = window.setTimeout(() => {
      const linesCleared = clearRows(fullRows);
      playSfx("lineClear");
      addClearedLines(linesCleared);
      addScoreForClearedLines(linesCleared);
      spawnPieceFromQueue(true);
      isLineClearAnimating = false;
      lineClearTimerId = null;
      lastStepTimeMs = performance.now();
      if (!isPaused && !isGameOver) {
        startDropLoop();
      }
    }, LINE_CLEAR_FLASH_MS);
    return;
  }

  spawnPieceFromQueue(true);
}

function holdActivePiece() {
  if (
    !activePiece ||
    isGameOver ||
    isPaused ||
    isLineClearAnimating ||
    !canHoldCurrentPiece
  ) {
    return;
  }

  stopDropLoop();

  if (!holdPiece) {
    holdPiece = createPiece(activePiece);
    drawHoldPiecePreview();
    spawnPieceFromQueue(false);
  } else {
    const nextHold = createPiece(activePiece);
    activePiece = createPiece(holdPiece);
    positionAtSpawn(activePiece);
    holdPiece = nextHold;
    canHoldCurrentPiece = false;
    drawHoldPiecePreview();

    if (!isValidPosition(activePiece, activePiece.x, activePiece.y)) {
      endGame();
    }
  }

  drawBoard();
  startDropLoop();
}

function stepActivePieceDown() {
  if (!activePiece || isGameOver || isPaused || isLineClearAnimating) {
    return;
  }

  if (isValidPosition(activePiece, activePiece.x, activePiece.y + 1)) {
    activePiece.y += 1;
    lastStepTimeMs = performance.now();
  } else {
    processPieceLock();
  }
}

function moveActivePiece(dx, dy) {
  if (!activePiece || isGameOver || isPaused || isLineClearAnimating) {
    return false;
  }

  const nextX = activePiece.x + dx;
  const nextY = activePiece.y + dy;
  if (!isValidPosition(activePiece, nextX, nextY)) {
    return false;
  }

  activePiece.x = nextX;
  activePiece.y = nextY;
  if (dy !== 0) {
    lastStepTimeMs = performance.now();
  }
  return true;
}

function rotateActivePiece() {
  if (!activePiece || isGameOver || isPaused || isLineClearAnimating) {
    return;
  }

  const rotatedShape = rotateShapeClockwise(activePiece.shape);
  if (!isValidPosition(activePiece, activePiece.x, activePiece.y, rotatedShape)) {
    return;
  }

  activePiece.shape = rotatedShape;
  playSfx("rotate");
}

function hardDropActivePiece() {
  if (!activePiece || isGameOver || isPaused || isLineClearAnimating) {
    return;
  }

  stopDropLoop();
  const landingYStart = activePiece.y;
  while (isValidPosition(activePiece, activePiece.x, activePiece.y + 1)) {
    activePiece.y += 1;
  }

  if (activePiece.y > landingYStart) {
    triggerHardDropImpact(activePiece, activePiece.y);
  }
  playSfx("hardDrop");
  processPieceLock();
  lastStepTimeMs = performance.now();
  startDropLoop();
}

function togglePause() {
  if (!hasGameStarted || isGameOver) {
    return;
  }

  isPaused = !isPaused;
  if (isPaused) {
    isSoftDropping = false;
    stopDropLoop();
    stopBackgroundMusic();
    setStatusMessage("Paused");
  } else {
    setStatusMessage("");
    startBackgroundMusic();
    startDropLoop();
  }
}

function initializeUI() {
  canvas.width = COLS * CELL_SIZE;
  canvas.height = ROWS * CELL_SIZE;
  nextCanvas.width = PREVIEW_SIZE * PREVIEW_CELL_SIZE;
  nextCanvas.height = PREVIEW_SIZE * PREVIEW_CELL_SIZE;
  holdCanvas.width = PREVIEW_SIZE * PREVIEW_CELL_SIZE;
  holdCanvas.height = PREVIEW_SIZE * PREVIEW_CELL_SIZE;
  board = createEmptyBoard();
  activePiece = null;
  nextPiece = null;
  holdPiece = null;
  isSoftDropping = false;
  isPaused = false;
  isGameOver = false;
  isLineClearAnimating = false;
  hasGameStarted = false;
  canHoldCurrentPiece = true;
  totalClearedLines = 0;
  setMuted(false);
  updateScore(0);
  updateLevel(1);
  setStatusMessage("");
  lineClearEffect = null;
  lockEffect = null;
  hardDropEffect = null;
  gameOverAnimStartMs = null;
  lastStepTimeMs = performance.now();
  isTouchScreenDevice = detectTouchScreenDevice();
  document.body.classList.toggle("touch-device", isTouchScreenDevice);
  syncFullscreenLayoutState();
  isTrackingTouchGesture = false;
  stopMobileSoftDrop();
  clearPendingLineClearTimer();
  stopDropLoop();
  stopBackgroundMusic();
  drawNextPiecePreview();
  drawHoldPiecePreview();
  startRenderLoop();
}

function startNewGame() {
  board = createEmptyBoard();
  activePiece = null;
  nextPiece = createRandomPiece();
  holdPiece = null;
  isSoftDropping = false;
  isPaused = false;
  isGameOver = false;
  isLineClearAnimating = false;
  hasGameStarted = true;
  canHoldCurrentPiece = true;
  totalClearedLines = 0;
  updateScore(0);
  updateLevel(1);
  setStatusMessage("");
  lineClearEffect = null;
  lockEffect = null;
  hardDropEffect = null;
  gameOverAnimStartMs = null;
  lastStepTimeMs = performance.now();
  stopMobileSoftDrop();
  clearPendingLineClearTimer();
  stopDropLoop();
  stopBackgroundMusic();
  drawHoldPiecePreview();
  spawnPieceFromQueue(true);
  startBackgroundMusic();
  startDropLoop();
}

function detectTouchScreenDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

function canUseTouchGameplay() {
  return (
    isTouchScreenDevice &&
    activePiece &&
    !isGameOver &&
    !isPaused &&
    !isLineClearAnimating
  );
}

function handleMobileMoveLeft() {
  if (!canUseTouchGameplay()) {
    return;
  }
  moveActivePiece(-1, 0);
}

function handleMobileMoveRight() {
  if (!canUseTouchGameplay()) {
    return;
  }
  moveActivePiece(1, 0);
}

function handleMobileRotate() {
  if (!canUseTouchGameplay()) {
    return;
  }
  rotateActivePiece();
}

function startMobileSoftDrop() {
  if (!canUseTouchGameplay()) {
    return;
  }

  moveActivePiece(0, 1);
  stopMobileSoftDrop();
  mobileSoftDropTimerId = window.setInterval(() => {
    if (!canUseTouchGameplay()) {
      stopMobileSoftDrop();
      return;
    }
    moveActivePiece(0, 1);
  }, 80);
}

function stopMobileSoftDrop() {
  if (!mobileSoftDropTimerId) {
    return;
  }
  window.clearInterval(mobileSoftDropTimerId);
  mobileSoftDropTimerId = null;
}

function handleMobileHardDrop() {
  if (!canUseTouchGameplay()) {
    return;
  }
  hardDropActivePiece();
}

function handleTouchStart(event) {
  if (!appEl || !appEl.contains(event.target)) {
    return;
  }

  // Prevent pinch zoom and browser gestures inside the game area.
  if (event.touches.length > 1) {
    event.preventDefault();
    isTrackingTouchGesture = false;
    return;
  }

  if (!isTouchScreenDevice) {
    return;
  }

  if (event.target.closest("button")) {
    return;
  }

  if (!canUseTouchGameplay()) {
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) {
    return;
  }

  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTimeMs = performance.now();
  isTrackingTouchGesture = true;

  const now = touchStartTimeMs;
  if (now - lastTouchTapTimeMs < 320) {
    event.preventDefault();
  }
  lastTouchTapTimeMs = now;

  event.preventDefault();
}

function performTapAction(clientX, clientY) {
  if (clientY < window.innerHeight * UPPER_ROTATE_REGION_RATIO) {
    rotateActivePiece();
    return;
  }

  if (clientX < window.innerWidth / 2) {
    moveActivePiece(-1, 0);
  } else {
    moveActivePiece(1, 0);
  }
}

function performSwipeDownAction(deltaY, elapsedMs) {
  const swipeSpeed = deltaY / Math.max(elapsedMs, 1);
  if (swipeSpeed >= FAST_SWIPE_SPEED_PX_PER_MS) {
    hardDropActivePiece();
    return;
  }

  const softDropSteps = Math.max(1, Math.min(4, Math.floor(deltaY / 70)));
  for (let step = 0; step < softDropSteps; step += 1) {
    if (!moveActivePiece(0, 1)) {
      break;
    }
  }
}

function handleTouchEnd(event) {
  if (!isTouchScreenDevice || !isTrackingTouchGesture) {
    return;
  }

  const touch = event.changedTouches[0];
  if (!touch) {
    return;
  }

  const endX = touch.clientX;
  const endY = touch.clientY;
  const elapsedMs = performance.now() - touchStartTimeMs;
  const deltaX = endX - touchStartX;
  const deltaY = endY - touchStartY;
  const distance = Math.hypot(deltaX, deltaY);
  const isDownSwipe =
    deltaY > SWIPE_DOWN_MIN_DISTANCE_PX && Math.abs(deltaY) > Math.abs(deltaX);

  if (canUseTouchGameplay()) {
    if (isDownSwipe) {
      performSwipeDownAction(deltaY, elapsedMs);
      event.preventDefault();
    } else if (distance <= TAP_MAX_MOVEMENT_PX && elapsedMs <= TAP_MAX_DURATION_MS) {
      performTapAction(endX, endY);
      event.preventDefault();
    }
  }

  isTrackingTouchGesture = false;
}

function handleTouchMove(event) {
  if (!appEl || !appEl.contains(event.target)) {
    return;
  }

  if (isTrackingTouchGesture || (hasGameStarted && isTouchScreenDevice)) {
    event.preventDefault();
  }
}

function handleTouchCancel() {
  isTrackingTouchGesture = false;
}

function handleIOSGesture(event) {
  if (!appEl || !appEl.contains(event.target)) {
    return;
  }

  event.preventDefault();
}

function handleKeyDown(event) {
  if (event.code === "KeyP") {
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    togglePause();
    return;
  }

  if (!activePiece || isGameOver || isPaused || isLineClearAnimating) {
    return;
  }

  switch (event.code) {
    case "ArrowLeft":
      event.preventDefault();
      moveActivePiece(-1, 0);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveActivePiece(1, 0);
      break;
    case "ArrowDown":
      event.preventDefault();
      if (!isSoftDropping) {
        isSoftDropping = true;
        startDropLoop();
      }
      moveActivePiece(0, 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      rotateActivePiece();
      break;
    case "Space":
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      hardDropActivePiece();
      break;
    case "KeyC":
      event.preventDefault();
      if (event.repeat) {
        return;
      }
      holdActivePiece();
      break;
    default:
      break;
  }
}

function handleKeyUp(event) {
  if (isGameOver || isPaused) {
    return;
  }

  if (event.code !== "ArrowDown") {
    return;
  }

  if (!isSoftDropping) {
    return;
  }

  isSoftDropping = false;
  startDropLoop();
}

startBtn.addEventListener("click", startNewGame);
restartBtn.addEventListener("click", startNewGame);
if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", toggleFullscreen);
}
if (installBtn) {
  installBtn.addEventListener("click", promptInstall);
}
soundToggleBtn.addEventListener("click", () => {
  toggleMuted();
  ensureAudioContext();
});

if (mobileLeftBtn) {
  mobileLeftBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleMobileMoveLeft();
  });
}

if (mobileRightBtn) {
  mobileRightBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleMobileMoveRight();
  });
}

if (mobileRotateBtn) {
  mobileRotateBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleMobileRotate();
  });
}

if (mobileSoftDropBtn) {
  mobileSoftDropBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    startMobileSoftDrop();
  });
  mobileSoftDropBtn.addEventListener("pointerup", stopMobileSoftDrop);
  mobileSoftDropBtn.addEventListener("pointercancel", stopMobileSoftDrop);
  mobileSoftDropBtn.addEventListener("pointerleave", stopMobileSoftDrop);
}

if (mobileHardDropBtn) {
  mobileHardDropBtn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handleMobileHardDrop();
  });
}

document.addEventListener("keydown", handleKeyDown);
document.addEventListener("keyup", handleKeyUp);
appEl.addEventListener("touchstart", handleTouchStart, { passive: false });
appEl.addEventListener("touchmove", handleTouchMove, { passive: false });
appEl.addEventListener("touchend", handleTouchEnd, { passive: false });
appEl.addEventListener("touchcancel", handleTouchCancel, { passive: true });
appEl.addEventListener("gesturestart", handleIOSGesture, { passive: false });
appEl.addEventListener("gesturechange", handleIOSGesture, { passive: false });
appEl.addEventListener("gestureend", handleIOSGesture, { passive: false });
document.addEventListener("fullscreenchange", syncFullscreenLayoutState);
document.addEventListener("webkitfullscreenchange", syncFullscreenLayoutState);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtonVisibility();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallButtonVisibility();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Ignore registration failures.
    });
  });
}

initializeUI();
