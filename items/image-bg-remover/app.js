import { AutoModel, AutoProcessor, RawImage, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

// ローカルモデルのキャッシュを有効化
env.allowLocalModels = false;

let model = null;
let processor = null;
let currentFileName = '';
let currentOrigUrl = null;
let generatedBlob = null;

const dropzone = document.getElementById('dropzone');
const editorSection = document.getElementById('editor-section');
const origImg = document.getElementById('orig-img');
const resultImg = document.getElementById('result-img');
const progressBox = document.getElementById('progress-box');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイル（PNG, JPG, WebP等）を選択してください。');
    return;
  }
  handleImage(file);
});

// 画像処理メインフロー
async function handleImage(file) {
  currentFileName = file.name;
  
  if (currentOrigUrl) {
    URL.revokeObjectURL(currentOrigUrl);
    currentOrigUrl = null;
  }

  currentOrigUrl = URL.createObjectURL(file);
  origImg.src = currentOrigUrl;

  resultImg.style.display = 'none';
  resultImg.removeAttribute('src');
  downloadBtn.disabled = true;

  editorSection.style.display = 'block';
  progressBox.style.display = 'block';
  progressBar.style.width = '0%';
  statusText.textContent = 'AIモデルの読み込み準備中...';

  try {
    // 1. モデルとプロセッサの初期化（初回のみ）
    if (!model || !processor) {
      const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const device = hasWebGPU ? 'webgpu' : 'wasm';

      statusText.textContent = `モデルデータを読み込み中 (${device.toUpperCase()})...`;

// --- 修正後（放物線イージング曲線を適用） ---
      const updateEasingProgress = (percent, fileName) => {
        const clamped = Math.min(99, Math.max(0, Math.round(percent)));
        const x = clamped / 100;
        const curvedPercent = (1 - Math.pow(1 - x, 2)) * 100; // y = -(x-1)^2 + 1

        progressBar.style.width = `${curvedPercent.toFixed(1)}%`;
        statusText.textContent = `AIモデルをダウンロード中: ${fileName || ''} (${clamped}%)`;
      };

      model = await AutoModel.from_pretrained('briaai/RMBG-1.4', {
        device,
        progress_callback: (info) => {
          if (info.status === 'progress' && info.total) {
            const percent = (info.loaded / info.total) * 100;
            updateEasingProgress(percent, info.file);
          }
        }
      });
      processor = await AutoProcessor.from_pretrained('briaai/RMBG-1.4');
    }

    statusText.textContent = '被写体を解析・背景を除去中...';
    progressBar.style.width = '80%';

    // 2. 推論処理
    const image = await RawImage.fromURL(currentOrigUrl);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });

    // 3. マスク生成（元画像サイズにリサイズ）
    const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height);

    // 4. Canvas上でアルファ合成
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');

    const imgObj = await createImageBitmap(file);
    ctx.drawImage(imgObj, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < mask.data.length; i++) {
      imgData.data[i * 4 + 3] = mask.data[i]; // Alphaチャンネル適用
    }
    ctx.putImageData(imgData, 0, 0);

    // 5. Blob化とプレビュー表示
    canvas.toBlob((blob) => {
      generatedBlob = blob;
      resultImg.src = URL.createObjectURL(blob);
      resultImg.style.display = 'block';
      downloadBtn.disabled = false;

      progressBar.style.width = '100%';
      statusText.textContent = '背景透過が完了しました！';
    }, 'image/png');

  } catch (err) {
    console.error(err);
    alert('処理中にエラーが発生しました: ' + err.message);
    statusText.textContent = 'エラーが発生しました。';
  }
}

// ダウンロード
downloadBtn.addEventListener('click', () => {
  if (!generatedBlob) return;
  const baseName = currentFileName.substring(0, currentFileName.lastIndexOf('.')) || 'image';
  CommonUtils.downloadBlob(generatedBlob, `${baseName}_nobg.png`);
});

// クリア
clearBtn.addEventListener('click', () => {
  if (currentOrigUrl) URL.revokeObjectURL(currentOrigUrl);
  currentOrigUrl = null;
  generatedBlob = null;
  origImg.removeAttribute('src');
  resultImg.removeAttribute('src');
  resultImg.style.display = 'none';
  editorSection.style.display = 'none';
  progressBox.style.display = 'none';
});
