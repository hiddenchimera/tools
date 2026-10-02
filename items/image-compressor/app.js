let originalFiles = [];
let processedFiles = [];

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const qualitySlider = document.getElementById('quality-slider');
const qualityVal = document.getElementById('quality-val');
const formatSelect = document.getElementById('format-select');
const resizeModeSelect = document.getElementById('resize-mode');
const resizeValGroup = document.getElementById('resize-val-group');
const resizeValLabel = document.getElementById('resize-val-label');
const resizeValInput = document.getElementById('resize-val');

const statCount = document.getElementById('stat-count');
const statOriginalSize = document.getElementById('stat-original-size');
const statCompressedSize = document.getElementById('stat-compressed-size');
const statReductionRate = document.getElementById('stat-reduction-rate');
const resultsTbody = document.getElementById('results-tbody');

const zipDlBtn = document.getElementById('zip-dl-btn');
const recompressBtn = document.getElementById('recompress-btn');
const clearBtn = document.getElementById('clear-btn');

// スライダー表示連動
qualitySlider.addEventListener('input', () => {
  qualityVal.textContent = `${qualitySlider.value}%`;
});

// リサイズオプション切り替え
resizeModeSelect.addEventListener('change', () => {
  const mode = resizeModeSelect.value;
  if (mode === 'none') {
    resizeValGroup.style.display = 'none';
  } else if (mode === 'max-width') {
    resizeValGroup.style.display = 'flex';
    resizeValLabel.textContent = '最大幅 (px)';
    resizeValInput.value = '1920';
    resizeValInput.min = '100';
    resizeValInput.max = '8000';
  } else if (mode === 'percent') {
    resizeValGroup.style.display = 'flex';
    resizeValLabel.textContent = '縮小割合 (%)';
    resizeValInput.value = '70';
    resizeValInput.min = '10';
    resizeValInput.max = '90';
  }
});

// ドロップゾーン初期化（複数ファイル対応）
CommonUtils.initDropzone(dropzone, (files) => {
  const fileList = Array.isArray(files) ? files : [files];
  const imageFiles = fileList.filter(f => f.type.startsWith('image/'));

  if (imageFiles.length === 0) {
    alert('有効な画像ファイル（PNG, JPG, WebP等）を選択してください。');
    return;
  }

  // 追加蓄積
  originalFiles = originalFiles.concat(imageFiles);
  controlPanel.style.display = 'block';
  processAllImages();
}, 'image/*');

// 再圧縮ボタン
recompressBtn.addEventListener('click', () => {
  if (originalFiles.length === 0) return;
  processAllImages();
});

// 全消去ボタン
clearBtn.addEventListener('click', () => {
  if (!confirm('取り込んだ画像と結果をすべて消去しますか？')) return;
  originalFiles = [];
  processedFiles = [];
  resultsTbody.innerHTML = '';
  controlPanel.style.display = 'none';
});

// 全画像の一括処理
async function processAllImages() {
  processedFiles = [];
  resultsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">処理中...</td></tr>';

  const quality = parseFloat(qualitySlider.value) / 100;
  const targetFormatMode = formatSelect.value;
  const resizeMode = resizeModeSelect.value;
  const resizeVal = parseFloat(resizeValInput.value) || 1920;

  let totalOriginal = 0;
  let totalCompressed = 0;

  for (let i = 0; i < originalFiles.length; i++) {
    const file = originalFiles[i];
    totalOriginal += file.size;

    const processed = await compressSingleImage(file, quality, targetFormatMode, resizeMode, resizeVal);
    processedFiles.push(processed);
    totalCompressed += processed.compressedBlob.size;
  }

  updateStats(originalFiles.length, totalOriginal, totalCompressed);
  renderResultsTable();
}

// 単一画像の圧縮・変換
function compressSingleImage(file, quality, targetFormatMode, resizeMode, resizeVal) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let targetWidth = img.naturalWidth;
      let targetHeight = img.naturalHeight;

      // リサイズ計算
      if (resizeMode === 'max-width' && targetWidth > resizeVal) {
        const ratio = resizeVal / targetWidth;
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
      } else if (resizeMode === 'percent') {
        const scale = resizeVal / 100;
        targetWidth = Math.max(1, Math.round(targetWidth * scale));
        targetHeight = Math.max(1, Math.round(targetHeight * scale));
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      // フォーマット決定
      let outMime = 'image/webp';
      let outExt = 'webp';

      if (targetFormatMode === 'original') {
        outMime = file.type || 'image/jpeg';
        outExt = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase() || 'jpg';
      } else if (targetFormatMode === 'jpeg') {
        outMime = 'image/jpeg';
        outExt = 'jpg';
      } else if (targetFormatMode === 'png') {
        outMime = 'image/png';
        outExt = 'png';
      } else {
        outMime = 'image/webp';
        outExt = 'webp';
      }

      // JPG変換時の透過色白補正
      if (outMime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob((blob) => {
        const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
        const outFileName = `${baseName}_compressed.${outExt}`;

        resolve({
          originalName: file.name,
          originalSize: file.size,
          compressedName: outFileName,
          compressedBlob: blob,
          previewUrl: URL.createObjectURL(blob),
          width: targetWidth,
          height: targetHeight
        });
      }, outMime, quality);
    };

    img.src = objectUrl;
  });
}

// サマリー表示の更新
function updateStats(count, origTotal, compTotal) {
  statCount.textContent = count;
  statOriginalSize.textContent = CommonUtils.formatBytes(origTotal);
  statCompressedSize.textContent = CommonUtils.formatBytes(compTotal);

  const diff = origTotal - compTotal;
  const rate = origTotal > 0 ? (diff / origTotal) * 100 : 0;

  if (rate >= 0) {
    statReductionRate.textContent = `- ${rate.toFixed(1)}%`;
    statReductionRate.style.color = '#4ade80';
  } else {
    statReductionRate.textContent = `+ ${Math.abs(rate).toFixed(1)}%`;
    statReductionRate.style.color = '#f87171';
  }
}

// 結果テーブルの描画
function renderResultsTable() {
  resultsTbody.innerHTML = '';

  processedFiles.forEach((item, index) => {
    const tr = document.createElement('tr');

    const diff = item.originalSize - item.compressedBlob.size;
    const rate = (diff / item.originalSize) * 100;
    const isSmaller = diff >= 0;

    tr.innerHTML = `
      <td style="width: 60px;">
        <img src="${item.previewUrl}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);">
      </td>
      <td>
        <div style="font-weight: 500; word-break: break-all;">${item.compressedName}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${item.width} × ${item.height} px</div>
      </td>
      <td style="color: var(--text-muted);">${CommonUtils.formatBytes(item.originalSize)}</td>
      <td style="font-weight: 600;">${CommonUtils.formatBytes(item.compressedBlob.size)}</td>
      <td>
        <span class="rate-badge ${isSmaller ? '' : 'negative'}">
          ${isSmaller ? '-' : '+'}${Math.abs(rate).toFixed(1)}%
        </span>
      </td>
      <td>
        <button class="btn-dl-item" data-index="${index}">⬇ 保存</button>
      </td>
    `;

    resultsTbody.appendChild(tr);
  });

  // 個別ダウンロードイベント付与
  document.querySelectorAll('.btn-dl-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const item = processedFiles[idx];
      if (item) {
        CommonUtils.downloadBlob(item.compressedBlob, item.compressedName);
      }
    });
  });
}

// まとめてZIPダウンロード
zipDlBtn.addEventListener('click', async () => {
  if (processedFiles.length === 0) return;

  zipDlBtn.disabled = true;
  zipDlBtn.textContent = '📦 ZIP生成中...';

  try {
    const zip = new JSZip();
    processedFiles.forEach(item => {
      zip.file(item.compressedName, item.compressedBlob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    CommonUtils.downloadBlob(zipBlob, 'compressed_images.zip');
  } catch (err) {
    console.error(err);
    alert('ZIPファイルの作成に失敗しました。個別ダウンロードをお試しください。');
  } finally {
    zipDlBtn.disabled = false;
    zipDlBtn.textContent = '📦 まとめてZIPダウンロード';
  }
});
