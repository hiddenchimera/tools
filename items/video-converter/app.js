let ffmpeg = null;
let currentFile = null;
let isLoaded = false;

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const videoPreview = document.getElementById('video-preview');
const targetFormatSelect = document.getElementById('target-format');
const qualityGroup = document.getElementById('quality-group');
const qualityPresetSelect = document.getElementById('quality-preset');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('video/') && !file.name.match(/\.(mov|mp4|webm|mkv|avi|flv|wmv)$/i)) {
    alert('動画ファイルを選択してください。');
    return;
  }

  currentFile = file;
  videoPreview.src = URL.createObjectURL(file);

  // 入力ファイルと同じ拡張子の場合は自動で別の候補に切り替える
  const ext = (file.name.substring(file.name.lastIndexOf('.') + 1) || '').toLowerCase();
  if (targetFormatSelect.value === ext) {
    targetFormatSelect.value = (ext === 'mp4') ? 'webm' : 'mp4';
  }

  updateUIForFormat();
  controlPanel.style.display = 'block';
  progressWrapper.style.display = 'none';
  convertBtn.disabled = false;
});

// フォーマット切り替え時のUI調整
targetFormatSelect.addEventListener('change', updateUIForFormat);

function updateUIForFormat() {
  const fmt = targetFormatSelect.value;
  // GIFやWAVはプリセットの影響が少ないため表示をシンプルに
  if (fmt === 'gif' || fmt === 'wav') {
    qualityGroup.style.display = 'none';
  } else {
    qualityGroup.style.display = 'flex';
  }
}

// FFmpegのロード
async function loadFFmpeg() {
  if (isLoaded) return;
  const { createFFmpeg } = FFmpeg;
  ffmpeg = createFFmpeg({
    log: false,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  });

  statusText.textContent = '変換エンジンの初期化中...';
  await ffmpeg.load();
  isLoaded = true;
}

// 変換メインロジック
convertBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  convertBtn.disabled = true;
  progressWrapper.style.display = 'block';
  progressBar.style.width = '0%';
  statusText.textContent = '準備中...';

  try {
    await loadFFmpeg();

    ffmpeg.setProgress(({ ratio }) => {
      if (ratio >= 0 && ratio <= 1) {
        const percent = Math.min(100, Math.round(ratio * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `変換中... ${percent}%`;
      }
    });

    const inExt = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'mp4';
    const inputName = `input.${inExt}`;
    const targetFormat = targetFormatSelect.value;
    const outputName = `output.${targetFormat}`;

    statusText.textContent = '動画ファイルを読み込み中...';
    const fileData = new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileData);

    statusText.textContent = '変換処理を実行中...';

    const preset = qualityPresetSelect.value;
    let ffmpegArgs = ['-i', inputName];

    // フォーマットごとのエンコード分岐
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
        // レガシーAVI形式（MPEG-4 + MP3）
        ffmpegArgs.push(
          '-c:v', 'mpeg4',
          '-qscale:v', preset === 'high' ? '3' : '6',
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          outputName
        );
        break;
      }

      case 'gif': {
        // GIFアニメ（パレット生成で綺麗に変換）
        ffmpegArgs.push(
          '-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
          '-loop', '0',
          outputName
        );
        break;
      }

      case 'mp3': {
        const bitrates = { fast: '128k', high: '256k', small: '96k' };
        ffmpegArgs.push(
          '-vn',
          '-b:a', bitrates[preset] || '128k',
          outputName
        );
        break;
      }

      case 'wav': {
        ffmpegArgs.push(
          '-vn',
          '-c:a', 'pcm_s16le',
          outputName
        );
        break;
      }

      case 'aac': {
        const bitrates = { fast: '128k', high: '256k', small: '96k' };
        ffmpegArgs.push(
          '-vn',
          '-c:a', 'aac',
          '-b:a', bitrates[preset] || '128k',
          outputName
        );
        break;
      }
    }

    await ffmpeg.run(...ffmpegArgs);

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

    const data = ffmpeg.FS('readFile', outputName);
    const blob = new Blob([data.buffer], { type: mimeMap[targetFormat] || 'application/octet-stream' });

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'converted';
    CommonUtils.downloadBlob(blob, `${baseName}.${targetFormat}`);

    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

  } catch (error) {
    console.error(error);
    alert('変換処理中にエラーが発生しました。ファイル形式やサイズをご確認ください。');
    statusText.textContent = 'エラーが発生しました';
  } finally {
    convertBtn.disabled = false;
  }
});
