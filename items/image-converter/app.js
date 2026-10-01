let currentFile = null;
let currentImageBitmap = null;

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const imagePreview = document.getElementById('image-preview');
const inputInfoBadge = document.getElementById('input-info-badge');
const targetFormatSelect = document.getElementById('target-format');
const qualityContainer = document.getElementById('quality-container');
const qualityRange = document.getElementById('quality-range');
const qualityVal = document.getElementById('quality-val');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

// スライダーの値表示更新
qualityRange.addEventListener('input', () => {
  qualityVal.textContent = `${Math.round(qualityRange.value * 100)}%`;
});

// フォーマット切り替え時（PNGはロスレスのため画質スライダーを非表示）
targetFormatSelect.addEventListener('change', () => {
  const fmt = targetFormatSelect.value;
  if (fmt === 'png') {
    qualityContainer.style.display = 'none';
  } else {
    qualityContainer.style.display = 'flex';
  }
});

// ファイル受付
CommonUtils.initDropzone(dropzone, async (file) => {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイル（WebP, PNG, JPG, AVIF, GIF等）を選択してください。');
    return;
  }

  currentFile = file;

  try {
    // 画像をBitmapとして読み込み
    currentImageBitmap = await createImageBitmap(file);

    // プレビュー表示
    imagePreview.src = URL.createObjectURL(file);
    inputInfoBadge.textContent = `🖼️ 検出: ${file.name} (${file.type || '不明'}, ${currentImageBitmap.width}×${currentImageBitmap.height}px, ${CommonUtils.formatBytes(file.size)})`;

    // 入力と出力が被らないように初期値を調整
    const ext = (file.name.substring(file.name.lastIndexOf('.') + 1) || '').toLowerCase();
    if (ext === 'webp') {
      targetFormatSelect.value = 'jpeg';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      targetFormatSelect.value = 'webp';
    } else {
      targetFormatSelect.value = 'webp';
    }

    qualityContainer.style.display = targetFormatSelect.value === 'png' ? 'none' : 'flex';
    controlPanel.style.display = 'block';
    progressWrapper.style.display = 'none';
    convertBtn.disabled = false;

  } catch (err) {
    console.error(err);
    alert('画像の読み込みに失敗しました。対応していない画像形式の可能性があります。');
  }
}, 'image/*');

// 変換メインロジック（Canvas API）
convertBtn.addEventListener('click', async () => {
  if (!currentFile || !currentImageBitmap) return;

  convertBtn.disabled = true;
  progressWrapper.style.display = 'block';
  progressBar.style.width = '30%';
  statusText.textContent = '変換処理中...';

  try {
    const format = targetFormatSelect.value;
    const quality = parseFloat(qualityRange.value);

    // Canvasの生成
    const canvas = document.createElement('canvas');
    canvas.width = currentImageBitmap.width;
    canvas.height = currentImageBitmap.height;
    const ctx = canvas.getContext('2d');

    // JPG変換時のみ、透明部分を白背景で塗りつぶす（透過PNG対策）
    if (format === 'jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 画像を描画（この時点でEXIFメタデータは完全に除去されます）
    ctx.drawImage(currentImageBitmap, 0, 0);

    progressBar.style.width = '70%';

    const mimeType = `image/${format}`;
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('画像の変換・出力に失敗しました。'));
      }, mimeType, quality);
    });

    progressBar.style.width = '100%';
    statusText.textContent = '変換完了！ダウンロードします...';

    // ダウンロード実行
    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'converted';
    const outExt = format === 'jpeg' ? 'jpg' : format;
    CommonUtils.downloadBlob(blob, `${baseName}.${outExt}`);

  } catch (error) {
    console.error(error);
    alert(error.message || '変換処理中にエラーが発生しました。');
    statusText.textContent = 'エラーが発生しました';
  } finally {
    convertBtn.disabled = false;
  }
});
