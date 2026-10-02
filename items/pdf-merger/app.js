const { PDFDocument } = PDFLib;

let pdfItems = []; // { file, arrayBuffer, pageCount, rangeText }

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const fileList = document.getElementById('file-list');
const addMoreBtn = document.getElementById('add-more-btn');
const outputFilenameInput = document.getElementById('output-filename');
const mergeBtn = document.getElementById('merge-btn');
const clearBtn = document.getElementById('clear-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const statusText = document.getElementById('status-text');

// 隠しファイル入力
const hiddenFileInput = document.createElement('input');
hiddenFileInput.type = 'file';
hiddenFileInput.accept = 'application/pdf';
hiddenFileInput.multiple = true;
hiddenFileInput.style.display = 'none';
document.body.appendChild(hiddenFileInput);

// ドロップゾーン初期化
CommonUtils.initDropzone(dropzone, async (files) => {
  const fileArray = Array.isArray(files) ? files : [files];
  await handleIncomingFiles(fileArray);
}, 'application/pdf');

// 「＋ PDFを追加」ボタン
addMoreBtn.addEventListener('click', () => {
  hiddenFileInput.click();
});

hiddenFileInput.addEventListener('change', async (e) => {
  if (e.target.files && e.target.files.length > 0) {
    await handleIncomingFiles(Array.from(e.target.files));
    hiddenFileInput.value = '';
  }
});

// ファイル読み込み処理
async function handleIncomingFiles(files) {
  const validPdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');

  if (validPdfs.length === 0) {
    alert('PDFファイル（.pdf）を選択してください。');
    return;
  }

  for (const file of validPdfs) {
    try {
      const buffer = await file.arrayBuffer();
      // ページ数確認のためにロード
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();

      pdfItems.push({
        file: file,
        arrayBuffer: buffer,
        pageCount: pageCount,
        rangeText: `1-${pageCount}`
      });
    } catch (err) {
      console.error(err);
      alert(`「${file.name}」の読み込みに失敗しました。パスワード保護されているか破損している可能性があります。`);
    }
  }

  if (pdfItems.length > 0) {
    controlPanel.style.display = 'block';
    renderFileList();
  }
}

// ファイル一覧UIの描画
function renderFileList() {
  fileList.innerHTML = '';

  pdfItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'file-item';

    row.innerHTML = `
      <div class="file-info">
        <div class="file-name">${index + 1}. ${item.file.name}</div>
        <div class="file-meta">全 ${item.pageCount} ページ (${CommonUtils.formatBytes(item.file.size)})</div>
      </div>

      <div class="file-range">
        <span>対象ページ:</span>
        <input type="text" class="range-input" data-index="${index}" value="${item.rangeText}" placeholder="例: 1-3, 5">
      </div>

      <div class="file-actions">
        <button class="btn-icon btn-up" data-index="${index}" title="上へ移動" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-icon btn-down" data-index="${index}" title="下へ移動" ${index === pdfItems.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-icon danger btn-delete" data-index="${index}" title="削除">✕</button>
      </div>
    `;

    fileList.appendChild(row);
  });

  // イベントバインド
  document.querySelectorAll('.range-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      if (pdfItems[idx]) {
        pdfItems[idx].rangeText = e.target.value.trim();
      }
    });
  });

  document.querySelectorAll('.btn-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (idx > 0) {
        const temp = pdfItems[idx];
        pdfItems[idx] = pdfItems[idx - 1];
        pdfItems[idx - 1] = temp;
        renderFileList();
      }
    });
  });

  document.querySelectorAll('.btn-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (idx < pdfItems.length - 1) {
        const temp = pdfItems[idx];
        pdfItems[idx] = pdfItems[idx + 1];
        pdfItems[idx + 1] = temp;
        renderFileList();
      }
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      pdfItems.splice(idx, 1);
      if (pdfItems.length === 0) {
        controlPanel.style.display = 'none';
      } else {
        renderFileList();
      }
    });
  });
}

// ページ範囲テキストの解析関数 (例: "1-3, 5, 8" -> [0, 1, 2, 4, 7])
function parsePageRange(rangeStr, maxPages) {
  if (!rangeStr || rangeStr.trim() === '') {
    // 空なら全ページ
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

// PDF結合処理の実行
mergeBtn.addEventListener('click', async () => {
  if (pdfItems.length === 0) return;

  mergeBtn.disabled = true;
  progressWrapper.style.display = 'block';
  statusText.textContent = '新規PDFを作成中...';

  try {
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < pdfItems.length; i++) {
      const item = pdfItems[i];
      statusText.textContent = `PDFを処理中 (${i + 1}/${pdfItems.length}): ${item.file.name}...`;

      const srcPdf = await PDFDocument.load(item.arrayBuffer);
      const pageIndices = parsePageRange(item.rangeText, item.pageCount);

      if (pageIndices.length > 0) {
        const copiedPages = await mergedPdf.copyPages(srcPdf, pageIndices);
        copiedPages.forEach(page => mergedPdf.addPage(page));
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
    statusText.textContent = '結合が完了しました！ダウンロードを開始しました。';
  } catch (err) {
    console.error(err);
    alert('PDF結合処理中にエラーが発生しました。コンソールをご確認ください。');
    statusText.textContent = 'エラーが発生しました。';
  } finally {
    mergeBtn.disabled = false;
  }
});

// すべて消去
clearBtn.addEventListener('click', () => {
  if (!confirm('取り込んだPDFをすべて消去しますか？')) return;
  pdfItems = [];
  fileList.innerHTML = '';
  controlPanel.style.display = 'none';
  progressWrapper.style.display = 'none';
});
