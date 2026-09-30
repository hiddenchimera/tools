let originalImage = null;
let currentFileName = '';
const historyStack = []; // Undo用スタック

const dropzone = document.getElementById('dropzone');
const editorSection = document.getElementById('editor-section');
const canvas = document.getElementById('image-canvas');
const ctx = canvas.getContext('2d');
const canvasWrapper = document.getElementById('canvas-wrapper');
const selectionBox = document.getElementById('selection-box');

const maskTypeSelect = document.getElementById('mask-type');
const strengthGroup = document.getElementById('strength-group');
const maskStrengthInput = document.getElementById('mask-strength');
const strengthVal = document.getElementById('strength-val');
const undoBtn = document.getElementById('undo-btn');
const resetBtn = document.getElementById('reset-btn');
const downloadBtn = document.getElementById('download-btn');

let isDrawing = false;
let startX = 0;
let startY = 0;

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    return;
  }

  currentFileName = file.name;
  const img = new Image();
  img.onload = () => {
    originalImage = img;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.drawImage(img, 0, 0);
    saveState(); // 初期状態を保存

    editorSection.style.display = 'block';
  };
  img.src = URL.createObjectURL(file);
});

// UIイベント
maskTypeSelect.addEventListener('change', () => {
  const isColor = maskTypeSelect.value === 'black' || maskTypeSelect.value === 'white';
  strengthGroup.style.display = isColor ? 'none' : 'flex';
});

maskStrengthInput.addEventListener('input', () => {
  strengthVal.textContent = maskStrengthInput.value;
});

// Undo用履歴保存
function saveState() {
  if (historyStack.length >= 15) historyStack.shift(); // 最大15手保持
  historyStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

undoBtn.addEventListener('click', () => {
  if (historyStack.length > 1) {
    historyStack.pop(); // 現在の状態を捨てる
    const prevState = historyStack[historyStack.length - 1];
    ctx.putImageData(prevState, 0, 0);
  }
});

resetBtn.addEventListener('click', () => {
  if (!originalImage) return;
  if (confirm('すべての加工を破棄して元の画像に戻しますか？')) {
    historyStack.length = 0;
    ctx.drawImage(originalImage, 0, 0);
    saveState();
  }
});

// ドラッグによる範囲指定（Canvas座標への補正）
function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  return {
    x: Math.max(0, Math.min(canvas.width, (clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(canvas.height, (clientY - rect.top) * scaleY)),
    screenX: clientX,
    screenY: clientY
  };
}

function startSelection(e) {
  if (!originalImage) return;
  isDrawing = true;
  const coords = getCanvasCoordinates(e);
  startX = coords.x;
  startY = coords.y;

  updateSelectionBoxUI(coords.screenX, coords.screenY, 0, 0);
  selectionBox.style.display = 'block';
}

function moveSelection(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const coords = getCanvasCoordinates(e);

  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const currentX = coords.x;
  const currentY = coords.y;

  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - left);
  const height = Math.abs(currentY - top);

  // ガイド枠をCanvas上の位置に合わせて表示
  const wrapperRect = canvasWrapper.getBoundingClientRect();
  selectionBox.style.left = `${rect.left - wrapperRect.left + left * scaleX}px`;
  selectionBox.style.top = `${rect.top - wrapperRect.top + top * scaleY}px`;
  selectionBox.style.width = `${width * scaleX}px`;
  selectionBox.style.height = `${height * scaleY}px`;
}

function endSelection(e) {
  if (!isDrawing) return;
  isDrawing = false;
  selectionBox.style.display = 'none';

  const coords = getCanvasCoordinates(e.changedTouches ? e.changedTouches[0] : e);
  const endX = coords.x;
  const endY = coords.y;

  const x = Math.round(Math.min(startX, endX));
  const y = Math.round(Math.min(startY, endY));
  const w = Math.round(Math.abs(endX - startX));
  const h = Math.round(Math.abs(endY - startY));

  // ごく小さなクリック誤動作（3px未満）は無視
  if (w > 3 && h > 3) {
    applyMask(x, y, w, h);
  }
}

function updateSelectionBoxUI(sx, sy, sw, sh) {
  selectionBox.style.width = `${sw}px`;
  selectionBox.style.height = `${sh}px`;
}

canvas.addEventListener('mousedown', startSelection);
window.addEventListener('mousemove', moveSelection);
window.addEventListener('mouseup', endSelection);

canvas.addEventListener('touchstart', startSelection, { passive: false });
window.addEventListener('touchmove', moveSelection, { passive: false });
window.addEventListener('touchend', endSelection);

// マスク加工処理
function applyMask(x, y, w, h) {
  const type = maskTypeSelect.value;
  const strength = parseInt(maskStrengthInput.value, 10);

  if (type === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
  } else if (type === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, w, h);
  } else if (type === 'mosaic') {
    applyMosaic(x, y, w, h, strength);
  } else if (type === 'blur') {
    applyBlur(x, y, w, h, strength);
  }

  saveState();
}

// モザイク処理（低解像度縮小→拡大描画）
function applyMosaic(x, y, w, h, blockSize) {
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');

  const scaledW = Math.max(1, Math.floor(w / blockSize));
  const scaledH = Math.max(1, Math.floor(h / blockSize));

  offCanvas.width = scaledW;
  offCanvas.height = scaledH;

  // 縮小して描画
  offCtx.drawImage(canvas, x, y, w, h, 0, 0, scaledW, scaledH);

  // ニアレストネイバーで拡大して元に戻す
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offCanvas, 0, 0, scaledW, scaledH, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

// ぼかし処理
function applyBlur(x, y, w, h, radius) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const tempCtx = tempCanvas.getContext('2d');

  tempCtx.filter = `blur(${Math.max(2, radius / 2)}px)`;
  tempCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

  ctx.drawImage(tempCanvas, x, y);
}

// ダウンロード
downloadBtn.addEventListener('click', () => {
  if (!originalImage) return;

  const ext = currentFileName.substring(currentFileName.lastIndexOf('.') + 1).toLowerCase() || 'png';
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

  canvas.toBlob((blob) => {
    if (!blob) return;
    const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || 'image';
    CommonUtils.downloadBlob(blob, `${baseName}_redacted.${ext === 'jpg' ? 'jpg' : 'png'}`);
  }, mimeType, 0.95);
});
