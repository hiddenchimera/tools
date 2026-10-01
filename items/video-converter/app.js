let ffmpeg = null;
let currentFile = null;
let currentBgImageFile = null;
let isLoaded = false;
let isAudioInput = false;

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

  currentFile = file;
  isAudioInput = isAudio && !file.type.startsWith('video/');

  const fileUrl = URL.createObjectURL(file);

  // プレビューの切り替え
  if (isAudioInput) {
    videoPreview.style.display = 'none';
    audioPreview.style.display = 'block';
    audioPreview.src = fileUrl;
    inputInfoBadge.textContent = `🎵 音声ファイルを検出: ${file.name} (${CommonUtils.formatBytes(file.size)})`;
    
    if (['mp3', 'wav', 'aac'].includes(ext)) {
      targetFormatSelect.value = (ext === 'mp3') ? 'wav' : 'mp3';
    } else {
      targetFormatSelect.value = 'mp3';
    }
  } else {
    audioPreview.style.display = 'none';
    videoPreview.style.display = 'block';
    videoPreview.src = fileUrl;
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

// カラーピッカーの値変更
bgColorInput.addEventListener('input', () => {
  bgColorText.textContent = bgColorInput.value;
});

// 背景画像の受付（クリック＆ドラッグ＆ドロップ）
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

function handleBgImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('画像ファイル（PNG, JPG, WebP等）を選択してください。');
    return;
  }
  currentBgImageFile = file;
  bgImagePreview.src = URL.createObjectURL(file);
  bgImagePreview.style.display = 'inline-block';
  bgImageLabel.textContent = `選択中: ${file.name} (${CommonUtils.formatBytes(file.size)})`;
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

  // GIFやWAVのときは画質設定を隠す
  if (fmt === 'gif' || fmt === 'wav') {
    qualityGroup.style.display = 'none';
  } else {
    qualityGroup.style.display = 'flex';
  }

  // 「音声ファイル」かつ「動画形式への変換」の時のみ背景設定パネルを表示
  if (isAudioInput && isTargetVideo) {
    bgOptionsPanel.style.display = 'block';
    const type = bgTypeSelect.value;
    bgColorSection.style.display = (type === 'color') ? 'block' : 'none';
    bgImageSection.style.display = (type === 'image') ? 'block' : 'none';
  } else {
    bgOptionsPanel.style.display = 'none';
  }
}

// FFmpegのロード
async function loadFFmpeg() {
  if (isLoaded) return;
  const { createFFmpeg } = FFmpeg;
  ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  });

  statusText.textContent = '変換エンジンの初期化中...';
  await ffmpeg.load();
  isLoaded = true;
}

// 変換メインロジック
convertBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const targetFormat = targetFormatSelect.value;
  const isTargetVideo = ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(targetFormat);
  const isTargetAudio = ['mp3', 'wav', 'aac'].includes(targetFormat);

  // 背景画像必須チェック
  if (isAudioInput && isTargetVideo && bgTypeSelect.value === 'image' && !currentBgImageFile) {
    alert('背景にする画像ファイルを選択してください。');
    return;
  }

  convertBtn.disabled = true;
  progressWrapper.style.display = 'block';
  progressBar.style.width = '0%';
  statusText.textContent = '準備中...';

  let inputBgImageName = null;

  try {
    await loadFFmpeg();

    ffmpeg.setProgress(({ ratio }) => {
      if (ratio >= 0 && ratio <= 1) {
        const percent = Math.min(100, Math.round(ratio * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `変換中... ${percent}%`;
      }
    });

    const inExt = (currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'bin').toLowerCase();
    const inputName = `input.${inExt}`;
    const outputName = `output.${targetFormat}`;

    statusText.textContent = 'ファイルを読み込み中...';
    const fileData = new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileData);

    // 背景画像がある場合は書き込み
    if (isAudioInput && isTargetVideo && bgTypeSelect.value === 'image' && currentBgImageFile) {
      const imgExt = (currentBgImageFile.name.substring(currentBgImageFile.name.lastIndexOf('.') + 1) || 'jpg').toLowerCase();
      inputBgImageName = `bg_image.${imgExt}`;
      const imgData = new Uint8Array(await currentBgImageFile.arrayBuffer());
      ffmpeg.FS('writeFile', inputBgImageName, imgData);
    }

    statusText.textContent = '変換処理を実行中...';

    const preset = qualityPresetSelect.value;
    let ffmpegArgs = [];

    // ==========================================
    // パターン1: 音声ファイル ➔ 動画化（背景を合成）
    // ==========================================
    if (isAudioInput && isTargetVideo) {
      const bgType = bgTypeSelect.value;
      const vCodec = targetFormat === 'webm' ? 'libvpx-vp9' : 'libx264';
      const aCodec = targetFormat === 'webm' ? 'libopus' : 'aac';

      if (bgType === 'image' && inputBgImageName) {
        // 画像ループ合成（アスペクト比維持のパディング）
        ffmpegArgs.push(
          '-loop', '1',
          '-i', inputBgImageName,
          '-i', inputName,
          '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
          '-c:v', vCodec,
          '-tune', 'stillimage',
          '-preset', 'ultrafast',
          '-c:a', aCodec,
          '-b:a', '192k',
          '-pix_fmt', 'yuv420p',
          '-shortest',
          outputName
        );
      } else {
        // 単色背景（黒・白・指定色）
        let colorParam = 'black';
        if (bgType === 'white') {
          colorParam = 'white';
        } else if (bgType === 'color') {
          // #1a202c -> 0x1a202c 形式に変換
          colorParam = bgColorInput.value.replace('#', '0x');
        }

        ffmpegArgs.push(
          '-f', 'lavfi', '-i', `color=c=${colorParam}:s=1280x720:r=30`,
          '-i', inputName,
          '-c:v', vCodec,
          '-tune', 'stillimage',
          '-preset', 'ultrafast',
          '-c:a', aCodec,
          '-b:a', '192k',
          '-pix_fmt', 'yuv420p',
          '-shortest',
          outputName
        );
      }
    } 
    // ==========================================
    // パターン2: 音声のみ出力（音声抽出 / 音声相互変換）
    // ==========================================
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
    // ==========================================
    // パターン3: 通常の動画 ➔ 動画変換 / GIF変換
    // ==========================================
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
            '-c:v', 'libvpx-vp9',
            '-crf', crf,
            '-b:v', '0',
            '-c:a', 'libopus',
            '-speed', '8',
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

    let data;
    try {
      data = ffmpeg.FS('readFile', outputName);
    } catch (readErr) {
      if (isTargetAudio && !isAudioInput) {
        throw new Error('動画内に音声トラックが見つかりませんでした。');
      } else {
        throw new Error('変換ファイルの生成に失敗しました。');
      }
    }

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

    // FSクリーンアップ
    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);
    if (inputBgImageName) {
      try { ffmpeg.FS('unlink', inputBgImageName); } catch (e) {}
    }

  } catch (error) {
    console.error(error);
    alert(error.message || '変換処理中にエラーが発生しました。コンソールのログをご確認ください。');
    statusText.textContent = 'エラーが発生しました';
  } finally {
    convertBtn.disabled = false;
  }
});
