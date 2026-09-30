let currentImage = null;
let currentFileName = '';

const dropzone = document.getElementById('dropzone');
const editorSection = document.getElementById('editor-section');
const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');

const bgTypeSelect = document.getElementById('bg-type');
const customColorGroup = document.getElementById('custom-color-group');
const customColorInput = document.getElementById('custom-color');
const customColorHex = document.getElementById('custom-color-hex');
const paddingScaleInput = document.getElementById('padding-scale');
const paddingVal = document.getElementById('padding-val');
const exportFormatSelect = document.getElementById('export-format');
const downloadBtn = document.getElementById('download-btn');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください。');
    return;
  }

  currentFileName = file.name;
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    editorSection.style.display = 'block';
    renderSquareImage();
  };
  img.src = URL.createObjectURL(file);
});

// 各種設定の変更リスナー
bgTypeSelect.addEventListener('change', () => {
  const isCustom = bgTypeSelect.value === 'custom';
  customColorGroup.style.display = isCustom ? 'flex' : 'none';

  // 透明余白選択時は自動でPNGを推奨選択
  if (bgTypeSelect.value === 'transparent') {
    exportFormatSelect.value = 'image/png';
  }
  renderSquareImage();
});

customColorInput.addEventListener('input', () => {
  customColorHex.textContent = customColorInput.value.toUpperCase();
  renderSquareImage();
});

paddingScaleInput.addEventListener('input', () => {
  paddingVal.textContent = `${paddingScaleInput.value}%`;
  renderSquareImage();
});

// 正方形描画メインロジック
function renderSquareImage() {
  if (!currentImage) return;

  const originalWidth = currentImage.naturalWidth;
  const originalHeight = currentImage.naturalHeight;

  // 長辺を基準に正方形サイズ（キャンバスサイズ）を決定
  const maxDim = Math.max(originalWidth, originalHeight);
  canvas.width = maxDim;
  canvas.height = maxDim;

  ctx.clearRect(0, 0, maxDim, maxDim);

  const bgType = bgTypeSelect.value;

  // 1. 背景の描画
  if (bgType === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, maxDim, maxDim);
  } else if (bgType === 'black') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, maxDim, maxDim);
  } else if (bgType === 'custom') {
    ctx.fillStyle = customColorInput.value;
    ctx.fillRect(0, 0, maxDim, maxDim);
  } else if (bgType === 'blur') {
    // 元画像をキャンバス全体に引き伸ばしてぼかす
    ctx.save();
    ctx.filter = 'blur(25px) brightness(0.9)';
    ctx.drawImage(currentImage, -20, -20, maxDim + 40, maxDim + 40);
    ctx.restore();
  }
  // 'transparent' の場合は何もしない（透過のまま）

  // 2. 余白（パディング）と画像の配置計算
  const paddingPercent = parseFloat(paddingScaleInput.value) / 100;
  const availableDim = maxDim * (1 - paddingPercent * 2);

  const scale = Math.min(availableDim / originalWidth, availableDim / originalHeight);
  const drawWidth = originalWidth * scale;
  const drawHeight = originalHeight * scale;

  const dx = (maxDim - drawWidth) / 2;
  const dy = (maxDim - drawHeight) / 2;

  // 3. 元画像を中心に描画
  ctx.drawImage(currentImage, dx, dy, drawWidth, drawHeight);
}

// ダウンロード処理
downloadBtn.addEventListener('click', () => {
  if (!currentImage) return;

  const mimeType = exportFormatSelect.value;
  const extMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp'
  };
  const ext = extMap[mimeType] || 'png';

  // JPG保存で背景が透明のままだと黒化するため、自動で白を敷いた一時キャンバスから書き出す
  let targetCanvas = canvas;
  if (mimeType === 'image/jpeg' && bgTypeSelect.value === 'transparent') {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    targetCanvas = tempCanvas;
  }

  targetCanvas.toBlob((blob) => {
    if (!blob) return;
    const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || 'image';
    const outputName = `${baseName}_square.${ext}`;
    CommonUtils.downloadBlob(blob, outputName);
  }, mimeType, 0.92);
});
