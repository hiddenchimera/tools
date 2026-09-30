let ffmpeg = null;
let currentFile = null;
let isLoaded = false;

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const videoPreview = document.getElementById('video-preview');
const targetFormatSelect = document.getElementById('target-format');
const qualityPresetSelect = document.getElementById('quality-preset');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('video/') && !file.name.match(/\.(mov|mp4|webm|mkv|avi)$/i)) {
    alert('動画ファイルを選択してください。');
    return;
  }

  currentFile = file;
  videoPreview.src = URL.createObjectURL(file);
  controlPanel.style.display = 'block';
  progressWrapper.style.display = 'none';
  convertBtn.disabled = false;
});

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

    const ext = currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'mp4';
    const inputName = `input.${ext}`;
    const targetFormat = targetFormatSelect.value;
    const outputName = `output.${targetFormat}`;

    statusText.textContent = '動画ファイルを読み込み中...';
    ffmpeg.FS('writeFile', inputName, await CommonUtils.fetchFile(currentFile));

    statusText.textContent = '変換エンコードを実行中...';

    const preset = qualityPresetSelect.value;
    let ffmpegArgs = ['-i', inputName];

    if (targetFormat === 'mp4') {
      // H.264 + AAC 形式への変換（ブラウザで確実に再生・書き出し可能に）
      let crf = '23';
      let speedPreset = 'ultrafast';

      if (preset === 'high') {
        crf = '19';
        speedPreset = 'fast';
      } else if (preset === 'small') {
        crf = '28';
        speedPreset = 'ultrafast';
      }

      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', speedPreset,
        '-crf', crf,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputName
      );
    } else if (targetFormat === 'webm') {
      // WebM (VP9 / Opus) への変換
      let crf = '32';
      if (preset === 'high') crf = '26';
      else if (preset === 'small') crf = '38';

      ffmpegArgs.push(
        '-c:v', 'libvpx-vp9',
        '-crf', crf,
        '-b:v', '0',
        '-c:a', 'libopus',
        '-speed', '8',
        outputName
      );
    }

    await ffmpeg.run(...ffmpegArgs);

    statusText.textContent = '変換完了！ファイルをダウンロードします...';
    progressBar.style.width = '100%';

    const data = ffmpeg.FS('readFile', outputName);
    const mimeType = targetFormat === 'mp4' ? 'video/mp4' : 'video/webm';
    const blob = new Blob([data.buffer], { type: mimeType });

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'video';
    CommonUtils.downloadBlob(blob, `${baseName}_converted.${targetFormat}`);

    // FSクリーンアップ
    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

  } catch (error) {
    console.error(error);
    alert('変換処理中にエラーが発生しました。ファイルが壊れているか、サイズが大きすぎる可能性があります。');
    statusText.textContent = 'エラーが発生しました';
  } finally {
    convertBtn.disabled = false;
  }
});
