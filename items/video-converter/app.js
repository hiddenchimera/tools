let ffmpeg = null;
let currentFile = null;
let currentBgImageFile = null;
let isLoaded = false;
let isAudioInput = false;
let isImageTransparent = false;
let inputDuration = 0;
let isCancelled = false;

// メモリ解放用URLポインタ
let currentMediaUrl = null;
let currentBgImageUrl = null;

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const videoPreview = document.getElementById('video-preview');
const audioPreview = document.getElementById('audio-preview');
const inputInfoBadge = document.getElementById('input-info-badge');
const targetFormatSelect = document.getElementById('target-format');
const qualityGroup = document.getElementById('quality-group');
const qualityPresetSelect = document.getElementById('quality-preset');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const cancelBtn = document.getElementById('cancel-btn');

// 背景選択用エレメント
const bgOptionsPanel = document.getElementById('bg-options-panel');
const bgTypeSelect = document.getElementById('bg-type-select');
const bgColorSection = document.getElementById('bg-color-section');
const bgColorInput = document.getElementById('bg-color-input');
const bgColorText = document.getElementById('bg-color-text');
const bgImageSection = document.getElementById('bg-image-section');
const bgImageInput = document.getElementById('bg-image-input');
const bgImageDropzone = document.getElementById('bg-image-dropzone');
const bgImageLabel = document.getElementById('bg-image-label');
const bgImagePreview = document.getElementById('bg-image-preview');

// 透過PNG用エレメント
const bgPngBackdropSection = document.getElementById('bg-png-backdrop-section');
const pngBackdropType = document.getElementById('png-backdrop-type');
const pngCustomColorContainer = document.getElementById('png-custom-color-container');
const pngBackdropColorInput = document.getElementById('png-backdrop-color-input');
const pngBackdropColorText = document.getElementById('png-backdrop-color-text');

// 拡張子リスト
const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv', 'm4v'];
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma'];

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  const ext = (file.name.substring(file.name.lastIndexOf('.') + 1) || '').toLowerCase();
  const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.includes(ext);
  const isAudio = file.type.startsWith('audio/') || AUDIO_EXTS.includes(ext);

  if (!isVideo && !isAudio) {
    alert('動画または音声ファイル（MP4, MOV, WebM, MP3, WAV, M4A等）を選択してください。');
    return;
  }

  // 以前のメディアURLを破棄
  if (currentMediaUrl) {
    URL.revokeObjectURL(currentMediaUrl);
    currentMediaUrl = null;
    videoPreview.removeAttribute('src');
    audioPreview.removeAttribute('src');
  }

  currentFile = file;
  isAudioInput = isAudio && !file.type.startsWith('video/');

  currentMediaUrl = URL.createObjectURL(file);
  inputDuration = 0;

  // プレビューの切り替え ＆ 長さ（duration）の取得
  if (isAudioInput) {
    videoPreview.style.display = 'none';
    audioPreview.style.display = 'block';
    audioPreview.src = currentMediaUrl;
    audioPreview.onloadedmetadata = () => {
      inputDuration = audioPreview.duration;
    };
    inputInfoBadge.textContent = `🎵 音声ファイルを検出: ${file.name} (${CommonUtils.formatBytes(file.size)})`;

    if (['mp3', 'wav', 'aac'].includes(ext)) {
      targetFormatSelect.value = (ext === 'mp3') ? 'wav' : 'mp3';
    } else {
      targetFormatSelect.value = 'mp3';
    }
  } else {
    audioPreview.style.display = 'none';
    videoPreview.style.display = 'block';
    videoPreview.src = currentMediaUrl;
    videoPreview.onloadedmetadata = () => {
      inputDuration = videoPreview.duration;
    };
    inputInfoBadge.textContent = `🎬 動画ファイルを検出: ${file.name} (${CommonUtils.formatBytes(file.size)})`;

    if (targetFormatSelect.value === ext) {
      targetFormatSelect.value = (ext === 'mp4') ? 'webm' : 'mp4';
    }
  }

  updateUIForFormat();
  controlPanel.style.display = 'block';
  progressWrapper.style.display = 'none';
  convertBtn.disabled = false;
}, '*');

// 単色背景カラーピッカーの値変更
bgColorInput.addEventListener('input', () => {
  bgColorText.textContent = bgColorInput.value;
});

// 透過PNG用背景カラーピッカーの値変更
pngBackdropColorInput.addEventListener('input', () => {
  pngBackdropColorText.textContent = pngBackdropColorInput.value;
});

pngBackdropType.addEventListener('change', () => {
  pngCustomColorContainer.style.display = (pngBackdropType.value === 'color') ? 'block' : 'none';
});

// 背景画像の受付
bgImageDropzone.addEventListener('click', () => bgImageInput.click());

bgImageDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  bgImageDropzone.style.borderColor = 'var(--primary-color)';
});

bgImageDropzone.addEventListener('dragleave', () => {
  bgImageDropzone.style.borderColor = 'var(--border-color)';
});

bgImageDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  bgImageDropzone.style.borderColor = 'var(--border-color)';
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleBgImageFile(e.dataTransfer.files[0]);
  }
});

bgImageInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleBgImageFile(e.target.files[0]);
  }
});

// 画像ファイルの処理 ＆ 透過判定
async function handleBgImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイル（PNG, JPG, WebP等）を選択してください。');
    return;
  }

  // 以前の背景画像URLを破棄
  if (currentBgImageUrl) {
    URL.revokeObjectURL(currentBgImageUrl);
    currentBgImageUrl = null;
  }

  currentBgImageFile = file;
  currentBgImageUrl = URL.createObjectURL(file);
  bgImagePreview.src = currentBgImageUrl;
  bgImagePreview.style.display = 'inline-block';
  bgImageLabel.textContent = `選択中: ${file.name} (${CommonUtils.formatBytes(file.size)})`;

  isImageTransparent = await checkIfImageHasTransparency(file);

  if (isImageTransparent) {
    bgPngBackdropSection.style.display = 'block';
  } else {
    bgPngBackdropSection.style.display = 'none';
  }
}

// Canvasを使った透過チェック
function checkIfImageHasTransparency(file) {
  return new Promise((resolve) => {
    if (file.type === 'image/jpeg') {
      return resolve(false);
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxDim = 300;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      try {
        const imgData = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < imgData.length; i += 4) {
          if (imgData[i] < 255) {
            return resolve(true);
          }
        }
        resolve(false);
      } catch (e) {
        resolve(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

// 背景タイプセレクト切り替え
bgTypeSelect.addEventListener('change', () => {
  const type = bgTypeSelect.value;
  bgColorSection.style.display = (type === 'color') ? 'block' : 'none';
  bgImageSection.style.display = (type === 'image') ? 'block' : 'none';
});

// フォーマット切り替え時のUI制御
targetFormatSelect.addEventListener('change', updateUIForFormat);

function updateUIForFormat() {
  const fmt = targetFormatSelect.value;
  const isTargetVideo = ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(fmt);

  if (fmt === 'gif' || fmt === 'wav') {
    qualityGroup.style.display = 'none';
  } else {
    qualityGroup.style.display = 'flex';
  }

  if (isAudioInput && isTargetVideo) {
    bgOptionsPanel.style.display = 'block';
    const type = bgTypeSelect.value;
    bgColorSection.style.display = (type === 'color') ? 'block' : 'none';
    bgImageSection.style.display = (type === 'image') ? 'block' : 'none';
  } else {
    bgOptionsPanel.style.display = 'none';
  }
}

// 時間文字列（HH:MM:SS.ms）を秒数に変換
function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

// 進捗表示を更新する共通関数（y = -(x-1)^2 + 1 の曲線イージング）
function updateProgress(percent) {
  if (isCancelled) return;
  const clamped = Math.min(99, Math.max(0, Math.round(percent)));

  const x = clamped / 100;
  const curvedPercent = (1 - Math.pow(1 - x, 2)) * 100;

  progressBar.style.width = `${curvedPercent.toFixed(1)}%`;
  statusText.textContent = `変換中... ${clamped}%`;
}

// FFmpegのロード
async function loadFFmpeg() {
  if (isLoaded && ffmpeg) return;
  const { createFFmpeg } = FFmpeg;
  ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  });

  statusText.textContent = '変換エンジンの初期化中...';
  await ffmpeg.load();
  isLoaded = true;
}

// キャンセル処理
cancelBtn.addEventListener('click', () => {
  if (!confirm('変換処理を中止しますか？')) return;

  isCancelled = true;
  cancelBtn.disabled = true;
  statusText.textContent = '変換を中止しています...';

  try {
    if (ffmpeg) {
      ffmpeg.exit();
    }
  } catch (err) {
    console.warn('ffmpeg exit:', err);
  } finally {
    ffmpeg = null;
    isLoaded = false;
    setTimeout(() => {
      progressWrapper.style.display = 'none';
      convertBtn.disabled = false;
      cancelBtn.disabled = false;
      cancelBtn.style.display = 'none';
      alert('変換処理を中止しました。設定を変更してやり直すことができます。');
    }, 400);
  }
});

// 変換メインロジック
convertBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const targetFormat = targetFormatSelect.value;
  const isTargetVideo = ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(targetFormat);
  const isTargetAudio = ['mp3', 'wav', 'aac'].includes(targetFormat);

  if (isAudioInput && isTargetVideo && bgTypeSelect.value === 'image' && !currentBgImageFile) {
    alert('背景にする画像ファイルを選択してください。');
    return;
  }

  isCancelled = false;
  convertBtn.disabled = true;

  cancelBtn.disabled = false;
  cancelBtn.style.display = 'block';

  progressWrapper.style.display = 'block';
  progressBar.style.width = '0%';
  statusText.textContent = '準備中...';

  let inputBgImageName = null;

  try {
    await loadFFmpeg();

    ffmpeg.setProgress(({ ratio }) => {
      if (ratio > 0 && ratio <= 1) {
        updateProgress(ratio * 100);
      }
    });

    ffmpeg.setLogger(({ message }) => {
      if (inputDuration > 0 && message.includes('time=')) {
        const match = message.match(/time=([0-9:.]+)/);
        if (match && match[1]) {
          const currentSec = parseTimeToSeconds(match[1]);
          const percent = (currentSec / inputDuration) * 100;
          updateProgress(percent);
        }
      }
    });

    const inExt = (currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'bin').toLowerCase();
    const inputName = `input.${inExt}`;
    const outputName = `output.${targetFormat}`;

    statusText.textContent = 'ファイルを読み込み中...';
    const fileData = new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileData);

    if (isAudioInput && isTargetVideo && bgTypeSelect.value === 'image' && currentBgImageFile) {
      const imgExt = (currentBgImageFile.name.substring(currentBgImageFile.name.lastIndexOf('.') + 1) || 'png').toLowerCase();
      inputBgImageName = `bg_image.${imgExt}`;
      const imgData = new Uint8Array(await currentBgImageFile.arrayBuffer());
      ffmpeg.FS('writeFile', inputBgImageName, imgData);
    }

    statusText.textContent = '変換処理を実行中...';

    const preset = qualityPresetSelect.value;
    let ffmpegArgs = [];

    // パターン1: 音声 ➔ 動画
    if (isAudioInput && isTargetVideo) {
      const bgType = bgTypeSelect.value;
      const isWebm = (targetFormat === 'webm');

      const vCodec = isWebm ? 'libvpx' : 'libx264';
      const aCodec = isWebm ? 'libvorbis' : 'aac';

      let videoEncoderArgs = [];
      if (isWebm) {
        videoEncoderArgs = ['-c:v', vCodec, '-b:v', '1M', '-crf', '10', '-c:a', aCodec, '-b:a', '128k'];
      } else {
        videoEncoderArgs = ['-c:v', vCodec, '-tune', 'stillimage', '-preset', 'ultrafast', '-c:a', aCodec, '-b:a', '192k'];
      }

      if (bgType === 'image' && inputBgImageName) {
        if (isImageTransparent) {
          let baseColor = 'black';
          if (pngBackdropType.value === 'white') {
            baseColor = 'white';
          } else if (pngBackdropType.value === 'color') {
            baseColor = pngBackdropColorInput.value.replace('#', '0x');
          }

          ffmpegArgs.push(
            '-f', 'lavfi', '-i', `color=c=${baseColor}:s=1280x720:r=25`,
            '-loop', '1', '-i', inputBgImageName,
            '-i', inputName,
            '-filter_complex', '[1:v]scale=1280:720:force_original_aspect_ratio=decrease[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2',
            ...videoEncoderArgs,
            '-pix_fmt', 'yuv420p',
            '-shortest',
            outputName
          );
        } else {
          ffmpegArgs.push(
            '-loop', '1',
            '-i', inputBgImageName,
            '-i', inputName,
            '-r', '25',
            '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
            ...videoEncoderArgs,
            '-pix_fmt', 'yuv420p',
            '-shortest',
            outputName
          );
        }
      } else {
        let colorParam = 'black';
        if (bgType === 'white') {
          colorParam = 'white';
        } else if (bgType === 'color') {
          colorParam = bgColorInput.value.replace('#', '0x');
        }

        ffmpegArgs.push(
          '-f', 'lavfi', '-i', `color=c=${colorParam}:s=1280x720:r=25`,
          '-i', inputName,
          ...videoEncoderArgs,
          '-pix_fmt', 'yuv420p',
          '-shortest',
          outputName
        );
      }
    }
    // パターン2: 音声のみ出力
    else if (isTargetAudio) {
      ffmpegArgs.push('-i', inputName, '-vn');

      if (targetFormat === 'mp3') {
        const bitrates = { fast: '128k', high: '256k', small: '96k' };
        ffmpegArgs.push('-b:a', bitrates[preset] || '128k', outputName);
      } else if (targetFormat === 'wav') {
        ffmpegArgs.push('-c:a', 'pcm_s16le', outputName);
      } else if (targetFormat === 'aac') {
        const bitrates = { fast: '128k', high: '256k', small: '96k' };
        ffmpegArgs.push('-c:a', 'aac', '-b:a', bitrates[preset] || '128k', outputName);
      }
    }
    // パターン3: 動画 ➔ 動画 / GIF
    else {
      ffmpegArgs.push('-i', inputName);

      switch (targetFormat) {
        case 'mp4':
        case 'mov':
        case 'mkv': {
          let crf = '23';
          let speed = 'ultrafast';
          if (preset === 'high') { crf = '19'; speed = 'fast'; }
          if (preset === 'small') { crf = '28'; speed = 'ultrafast'; }

          ffmpegArgs.push(
            '-c:v', 'libx264',
            '-preset', speed,
            '-crf', crf,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            outputName
          );
          break;
        }

        case 'webm': {
          let crf = '32';
          if (preset === 'high') crf = '26';
          if (preset === 'small') crf = '38';

          ffmpegArgs.push(
            '-c:v', 'libvpx',
            '-crf', crf,
            '-b:v', '1M',
            '-c:a', 'libvorbis',
            outputName
          );
          break;
        }

        case 'avi': {
          ffmpegArgs.push(
            '-c:v', 'mpeg4',
            '-qscale:v', preset === 'high' ? '3' : '6',
            '-c:a', 'mp3',
            '-b:a', '128k',
            outputName
          );
          break;
        }

        case 'gif': {
          ffmpegArgs.push(
            '-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            '-loop', '0',
            outputName
          );
          break;
        }
      }
    }

    await ffmpeg.run(...ffmpegArgs);

    if (isCancelled) return;

    let data;
    try {
      data = ffmpeg.FS('readFile', outputName);
    } catch (readErr) {
      if (isCancelled) return;
      if (isTargetAudio && !isAudioInput) {
        throw new Error('動画内に音声トラックが見つかりませんでした。');
      } else {
        throw new Error('変換ファイルの生成に失敗しました。');
      }
    }

    if (isCancelled) return;

    cancelBtn.style.display = 'none';
    cancelBtn.disabled = true;

    statusText.textContent = '変換完了！ダウンロードします...';
    progressBar.style.width = '100%';

    const mimeMap = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
      avi: 'video/x-msvideo',
      gif: 'image/gif',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac'
    };

    const blob = new Blob([data.buffer], { type: mimeMap[targetFormat] || 'application/octet-stream' });
    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'converted';
    CommonUtils.downloadBlob(blob, `${baseName}.${targetFormat}`);

    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);
    if (inputBgImageName) {
      try { ffmpeg.FS('unlink', inputBgImageName); } catch (e) {}
    }

  } catch (error) {
    if (isCancelled) return;
    console.error(error);
    alert(error.message || '変換処理中にエラーが発生しました。コンソールのログをご確認ください。');
    statusText.textContent = 'エラーが発生しました';
    cancelBtn.style.display = 'none';
    cancelBtn.disabled = true;
  } finally {
    if (!isCancelled) {
      convertBtn.disabled = false;
    }
  }
});
