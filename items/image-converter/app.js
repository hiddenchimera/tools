let selectedFiles = [];
let convertedResults = [];

const dropzone = document.getElementById('dropzone');
const settingsPanel = document.getElementById('settings-panel');
const targetFormatSelect = document.getElementById('target-format');
const qualityGroup = document.getElementById('quality-group');
const qualityRange = document.getElementById('quality-range');
const qualityVal = document.getElementById('quality-val');
const fileCount = document.getElementById('file-count');
const fileList = document.getElementById('file-list');
const clearBtn = document.getElementById('clear-btn');
const convertBtn = document.getElementById('convert-btn');
const downloadAllWrapper = document.getElementById('download-all-wrapper');
const downloadAllBtn = document.getElementById('download-all-btn');

// PNG選択時は品質スライダーを非表示（可逆圧縮のため）
targetFormatSelect.addEventListener('change', () => {
  const isPng = targetFormatSelect.value === 'image/png';
  qualityGroup.style.display = isPng ? 'none' : 'flex';
});

qualityRange.addEventListener('input', () => {
  qualityVal.textContent = `${qualityRange.value}%`;
});

// ファイル選択入力用インプット要素（複数選択対応）
const inputEl = document.createElement('input');
inputEl.type = 'file';
inputEl.accept = 'image/*';
inputEl.multiple = true;
inputEl.style.display = 'none';
document.body.appendChild(inputEl);

dropzone.addEventListener('click', () => inputEl.click());

inputEl.addEventListener('change', (e) => {
  handleFiles(Array.from(e.target.files));
  inputEl.value = '';
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFiles(Array.from(e.dataTransfer.files));
  }
});

function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    alert('画像ファイルを選択してください。');
    return;
  }

  selectedFiles.push(...imageFiles);
  renderFileList();
  settingsPanel.style.display = 'block';
  downloadAllWrapper.style.display = 'none';
}

function renderFileList() {
  fileCount.textContent = selectedFiles.length;
  fileList.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';

    const objectUrl = URL.createObjectURL(file);

    li.innerHTML = `
      <div class="file-info">
        <img class="file-thumb" src="${objectUrl}" alt="thumb">
        <div>
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-meta">${CommonUtils.formatBytes(file.size)}</div>
        </div>
      </div>
      <div class="file-actions" id="action-${index}">
        <span class="badge">待機中</span>
      </div>
    `;
    fileList.appendChild(li);
  });
}

clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  convertedResults = [];
  settingsPanel.style.display = 'none';
  downloadAllWrapper.style.display = 'none';
});

// Canvas API による変換 ＆ EXIF自動削除
convertBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  convertBtn.disabled = true;
  convertedResults = [];

  const mimeType = targetFormatSelect.value;
  const quality = parseFloat(qualityRange.value) / 100;
  const extMap = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/avif': 'avif'
  };
  const targetExt = extMap[mimeType] || 'webp';

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const actionEl = document.getElementById(`action-${i}`);
    actionEl.innerHTML = `<span class="badge">処理中...</span>`;

    try {
      const blob = await convertImage(file, mimeType, quality);
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const newFilename = `${baseName}.${targetExt}`;

      convertedResults.push({ blob, filename: newFilename });

      actionEl.innerHTML = `
        <span class="badge success">${CommonUtils.formatBytes(blob.size)}</span>
        <button class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="downloadSingle(${convertedResults.length - 1})">保存</button>
      `;
    } catch (err) {
      console.error(err);
      actionEl.innerHTML = `<span class="badge" style="background:#dc2626; color:#fff;">失敗</span>`;
    }
  }

  convertBtn.disabled = false;
  if (convertedResults.length > 0) {
    downloadAllWrapper.style.display = 'block';
  }
});

function convertImage(file, mimeType, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');

      // JPG変換時、透明領域が黒く塗りつぶされるのを防ぐため白背景を敷く
      if (mimeType === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // ブラウザがAVIF書き出しに非対応な場合はWebPにフォールバック
          if (mimeType === 'image/avif') {
            canvas.toBlob((fallbackBlob) => {
              if (fallbackBlob) resolve(fallbackBlob);
              else reject(new Error('変換に失敗しました'));
            }, 'image/webp', quality);
          } else {
            reject(new Error('変換に失敗しました'));
          }
        }
      }, mimeType, quality);
    };

    img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
    img.src = URL.createObjectURL(file);
  });
}

// 単一ダウンロード
window.downloadSingle = (index) => {
  const item = convertedResults[index];
  if (item) {
    CommonUtils.downloadBlob(item.blob, item.filename);
  }
};

// 一括ダウンロード（連続保存制限を避けるため時間差実行）
downloadAllBtn.addEventListener('click', () => {
  convertedResults.forEach((item, index) => {
    setTimeout(() => {
      CommonUtils.downloadBlob(item.blob, item.filename);
    }, index * 250);
  });
});
