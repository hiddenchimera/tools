const { PDFDocument } = PDFLib;

let fileItems = []; // { id, type: 'pdf' | 'image', file, buffer, pageCount, rangeText, thumbUrl, width, height }

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const fileList = document.getElementById('file-list');
const addMoreBtn = document.getElementById('add-more-btn');
const outputFilenameInput = document.getElementById('output-filename');
const imageLayoutModeSelect = document.getElementById('image-layout-mode');
const mergeBtn = document.getElementById('merge-btn');
const clearBtn = document.getElementById('clear-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const statusText = document.getElementById('status-text');

// 隠しファイル入力
const hiddenFileInput = document.createElement('input');
hiddenFileInput.type = 'file';
hiddenFileInput.accept = '.pdf,image/*';
hiddenFileInput.multiple = true;
hiddenFileInput.style.display = 'none';
document.body.appendChild(hiddenFileInput);

// --- 複数ファイル対応ドラッグ＆ドロップ実装 ---
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    // 複数ファイルを一括で配列化して処理関数へ渡す
    await handleIncomingFiles(Array.from(e.dataTransfer.files));
  }
});

dropzone.addEventListener('click', () => {
  hiddenFileInput.click();
});

addMoreBtn.addEventListener('click', () => {
  hiddenFileInput.click();
});

hiddenFileInput.addEventListener('change', async (e) => {
  if (e.target.files && e.target.files.length > 0) {
    await handleIncomingFiles(Array.from(e.target.files));
    hiddenFileInput.value = '';
  }
});

// ファイル受付・解析（複数ファイルを順次処理して追加）
async function handleIncomingFiles(files) {
  for (const file of files) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|avif|gif|bmp|svg|ico)$/i.test(file.name);

    if (isPdf) {
      try {
        const buffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();

        fileItems.push({
          id: Math.random().toString(36).substring(2),
          type: 'pdf',
          file: file,
          buffer: buffer,
          pageCount: pageCount,
          rangeText: `1-${pageCount}`,
          thumbUrl: null
        });
      } catch (err) {
        console.error(err);
        alert(`「${file.name}」の読み込みに失敗しました。パスワード保護されている可能性があります。`);
      }
    } else if (isImage) {
      try {
        const { blob, width, height, thumbUrl } = await loadImageMeta(file);
        fileItems.push({
          id: Math.random().toString(36).substring(2),
          type: 'image',
          file: file,
          buffer: await blob.arrayBuffer(),
          pageCount: 1,
          rangeText: '1',
          thumbUrl: thumbUrl,
          width: width,
          height: height
        });
      } catch (err) {
        console.error(err);
        alert(`画像「${file.name}」の読み込みに失敗しました。`);
      }
    }
  }

  if (fileItems.length > 0) {
    controlPanel.style.display = 'block';
    renderFileList();
  }
}

// 画像のメタ情報読み込み・PNG化Blob生成
function loadImageMeta(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        resolve({
          blob: blob,
          width: img.naturalWidth,
          height: img.naturalHeight,
          thumbUrl: objectUrl
        });
      }, 'image/png');
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}

// ファイル一覧UI描画
function renderFileList() {
  fileList.innerHTML = '';

  fileItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'file-item';

    const thumbHtml = item.type === 'pdf' 
      ? '<div class="file-thumb">📄</div>' 
      : `<div class="file-thumb"><img src="${item.thumbUrl}" alt="thumb"></div>`;

    const metaText = item.type === 'pdf'
      ? `PDF (全 ${item.pageCount} ページ)・${CommonUtils.formatBytes(item.file.size)}`
      : `画像 (${item.width} × ${item.height} px)・${CommonUtils.formatBytes(item.file.size)}`;

    const rangeHtml = item.type === 'pdf'
      ? `<div class="file-range">
           <span>対象ページ:</span>
           <input type="text" class="range-input" data-index="${index}" value="${item.rangeText}" placeholder="例: 1-3, 5">
         </div>`
      : `<div class="file-range" style="color: var(--text-muted); font-size: 0.8rem;">1ページとして追加</div>`;

    row.innerHTML = `
      <div class="file-info">
        ${thumbHtml}
        <div class="file-text">
          <div class="file-name">${index + 1}. ${item.file.name}</div>
          <div class="file-meta">${metaText}</div>
        </div>
      </div>

      ${rangeHtml}

      <div class="file-actions">
        <button class="btn-icon btn-up" data-index="${index}" title="上へ移動" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-icon btn-down" data-index="${index}" title="下へ移動" ${index === fileItems.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-icon danger btn-delete" data-index="${index}" title="削除">✕</button>
      </div>
    `;

    fileList.appendChild(row);
  });

  // イベントリスナー
  document.querySelectorAll('.range-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      if (fileItems[idx]) {
        fileItems[idx].rangeText = e.target.value.trim();
      }
    });
  });

  document.querySelectorAll('.btn-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (idx > 0) {
        const temp = fileItems[idx];
        fileItems[idx] = fileItems[idx - 1];
        fileItems[idx - 1] = temp;
        renderFileList();
      }
    });
  });

  document.querySelectorAll('.btn-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (idx < fileItems.length - 1) {
        const temp = fileItems[idx];
        fileItems[idx] = fileItems[idx + 1];
        fileItems[idx + 1] = temp;
        renderFileList();
      }
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      fileItems.splice(idx, 1);
      if (fileItems.length === 0) {
        controlPanel.style.display = 'none';
      } else {
        renderFileList();
      }
    });
  });
}

// ページ範囲パーサー
function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || rangeStr.trim() === '') {
    return Array.from({ length: maxPages }, (_, i) => i);
  }

  const indices = new Set();
  const parts = rangeStr.split(',');

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(maxPages, Math.max(start, end));
        for (let p = min; p <= max; p++) {
          indices.add(p - 1);
        }
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        indices.add(pageNum - 1);
      }
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

// PDF生成・結合
mergeBtn.addEventListener('click', async () => {
  if (fileItems.length === 0) return;

  mergeBtn.disabled = true;
  progressWrapper.style.display = 'block';
  statusText.textContent = '新規PDFを作成中...';

  const layoutMode = imageLayoutModeSelect.value;
  // A4 ポイントサイズ (72 dpi): 595.28 x 841.89
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  try {
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i];
      statusText.textContent = `ファイルを処理中 (${i + 1}/${fileItems.length}): ${item.file.name}...`;

      if (item.type === 'pdf') {
        const srcPdf = await PDFDocument.load(item.buffer);
        const pageIndices = parsePageRange(item.rangeText, item.pageCount);

        if (pageIndices.length > 0) {
          const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
          copiedPages.forEach(page => mergedPdf.addPage(page));
        }
      } else if (item.type === 'image') {
        // 画像埋め込み（PNGバイトデータ）
        const embeddedImg = await mergedPdf.embedPng(item.buffer);

        if (layoutMode === 'original-size') {
          // 画像サイズそのままのページ
          const page = mergedPdf.addPage([item.width, item.height]);
          page.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: item.width,
            height: item.height
          });
        } else {
          // A4フィット（向き自動判定）
          const isLandscape = item.width > item.height;
          const pageWidth = isLandscape ? A4_HEIGHT : A4_WIDTH;
          const pageHeight = isLandscape ? A4_WIDTH : A4_HEIGHT;

          const margin = 28; // 余白
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2;

          const scale = Math.min(maxWidth / item.width, maxHeight / item.height, 1);
          const drawWidth = item.width * scale;
          const drawHeight = item.height * scale;

          const x = (pageWidth - drawWidth) / 2;
          const y = (pageHeight - drawHeight) / 2;

          const page = mergedPdf.addPage([pageWidth, pageHeight]);
          page.drawImage(embeddedImg, {
            x: x,
            y: y,
            width: drawWidth,
            height: drawHeight
          });
        }
      }
    }

    statusText.textContent = 'PDFバイナリを書き出し中...';
    const mergedBytes = await mergedPdf.save();
    const mergedBlob = new Blob([mergedBytes], { type: 'application/pdf' });

    let outName = outputFilenameInput.value.trim() || 'merged_document.pdf';
    if (!outName.toLowerCase().endsWith('.pdf')) {
      outName += '.pdf';
    }

    CommonUtils.downloadBlob(mergedBlob, outName);
    statusText.textContent = '完了しました！ダウンロードを開始しました。';
  } catch (err) {
    console.error(err);
    alert('処理中にエラーが発生しました。コンソールをご確認ください。');
    statusText.textContent = 'エラーが発生しました。';
  } finally {
    mergeBtn.disabled = false;
  }
});

// すべて消去
clearBtn.addEventListener('click', () => {
  if (!confirm('取り込んだファイルをすべて消去しますか？')) return;
  fileItems = [];
  fileList.innerHTML = '';
  controlPanel.style.display = 'none';
  progressWrapper.style.display = 'none';
});
