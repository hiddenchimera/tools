let currentImage = null;
let currentFileName = '';
let currentPreviewUrl = null; // プレビュー用URLポインタ
let origW = 0;
let origH = 0;
let targetW = 0;
let targetH = 0;

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const imagePreview = document.getElementById('image-preview');
const origDimSpan = document.getElementById('orig-dim');
const targetDimSpan = document.getElementById('target-dim');

const modeSelect = document.getElementById('mode-select');
const groupPx = document.getElementById('group-px');
const groupPercent = document.getElementById('group-percent');
const groupMaxEdge = document.getElementById('group-max-edge');

const inputW = document.getElementById('input-w');
const inputH = document.getElementById('input-h');
const lockRatioCheckbox = document.getElementById('lock-ratio');
const inputPercent = document.getElementById('input-percent');
const inputMaxEdge = document.getElementById('input-max-edge');
const formatSelect = document.getElementById('format-select');
const downloadBtn = document.getElementById('download-btn');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイル（PNG, JPG, WebP等）を選択してください。');
    return;
  }

  // 以前のプレビューURLが存在する場合はメモリ解放
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }

  currentFileName = file.name;
  currentPreviewUrl = URL.createObjectURL(file);

  const img = new Image();
  img.onload = () => {
    currentImage = img;
    origW = img.naturalWidth;
    origH = img.naturalHeight;

    origDimSpan.textContent = `${origW} × ${origH} px`;
    imagePreview.src = currentPreviewUrl; // 有効なURLをセット

    // 初期値として元の解像度をセット
    inputW.value = origW;
    inputH.value = origH;
    targetW = origW;
    targetH = origH;

    updateTargetDimDisplay();
    controlPanel.style.display = 'block';
  };

  img.src = currentPreviewUrl;
});

// モード切り替え
modeSelect.addEventListener('change', () => {
  const mode = modeSelect.value;
  groupPx.style.display = (mode === 'px') ? 'flex' : 'none';
  groupPercent.style.display = (mode === 'percent') ? 'flex' : 'none';
  groupMaxEdge.style.display = (mode === 'max-edge') ? 'flex' : 'none';
  recalcDimensions();
});

// 数値変更イベントリスナー
inputW.addEventListener('input', () => {
  if (modeSelect.value !== 'px') return;
  const val = parseInt(inputW.value, 10);
  if (isNaN(val) || val <= 0) return;

  targetW = val;
  if (lockRatioCheckbox.checked && origW > 0) {
    targetH = Math.max(1, Math.round(targetW * (origH / origW)));
    inputH.value = targetH;
  }
  updateTargetDimDisplay();
});

inputH.addEventListener('input', () => {
  if (modeSelect.value !== 'px') return;
  const val = parseInt(inputH.value, 10);
  if (isNaN(val) || val <= 0) return;

  targetH = val;
  if (lockRatioCheckbox.checked && origH > 0) {
    targetW = Math.max(1, Math.round(targetH * (origW / origH)));
    inputW.value = targetW;
  }
  updateTargetDimDisplay();
});

inputPercent.addEventListener('input', recalcDimensions);
inputMaxEdge.addEventListener('input', recalcDimensions);
lockRatioCheckbox.addEventListener('change', recalcDimensions);

// モードに応じた計算
function recalcDimensions() {
  if (!currentImage) return;
  const mode = modeSelect.value;

  if (mode === 'px') {
    const w = parseInt(inputW.value, 10) || origW;
    targetW = w;
    if (lockRatioCheckbox.checked) {
      targetH = Math.max(1, Math.round(targetW * (origH / origW)));
      inputH.value = targetH;
    } else {
      targetH = parseInt(inputH.value, 10) || origH;
    }
  } else if (mode === 'percent') {
    const p = (parseFloat(inputPercent.value) || 100) / 100;
    targetW = Math.max(1, Math.round(origW * p));
    targetH = Math.max(1, Math.round(origH * p));
  } else if (mode === 'max-edge') {
    const maxVal = parseFloat(inputMaxEdge.value) || 400;
    const maxDim = Math.max(origW, origH);
    const scale = maxVal / maxDim;
    targetW = Math.max(1, Math.round(origW * scale));
    targetH = Math.max(1, Math.round(origH * scale));
  }

  updateTargetDimDisplay();
}

function updateTargetDimDisplay() {
  targetDimSpan.textContent = `${targetW} × ${targetH} px`;
}

// ダウンロード処理
downloadBtn.addEventListener('click', () => {
  if (!currentImage || targetW <= 0 || targetH <= 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  let selectedFormat = formatSelect.value;
  let outMime = 'image/png';
  let outExt = 'png';

  const origExt = (currentFileName.substring(currentFileName.lastIndexOf('.') + 1) || '').toLowerCase();

  if (selectedFormat === 'original') {
    if (origExt === 'jpg' || origExt === 'jpeg') {
      outMime = 'image/jpeg';
      outExt = 'jpg';
    } else if (origExt === 'webp') {
      outMime = 'image/webp';
      outExt = 'webp';
    } else {
      outMime = 'image/png';
      outExt = 'png';
    }
  } else {
    outMime = selectedFormat;
    const map = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp'
    };
    outExt = map[selectedFormat] || 'png';
  }

  // JPG保存時の透過白背景補正
  if (outMime === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  ctx.drawImage(currentImage, 0, 0, targetW, targetH);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || 'image';
    const outputName = `${baseName}_${targetW}x${targetH}.${outExt}`;
    CommonUtils.downloadBlob(blob, outputName);
  }, outMime, 0.92);
});
