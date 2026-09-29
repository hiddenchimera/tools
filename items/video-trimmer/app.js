const { createFFmpeg, fetchFile } = FFmpeg;

let ffmpeg = null;
let currentFile = null;
let generatedBlob = null;
let outputFilename = '';

const dropzone = document.getElementById('dropzone');
const editorSection = document.getElementById('editor-section');
const videoPlayer = document.getElementById('video-player');
const formatSelect = document.getElementById('audio-format');
const bitrateSelect = document.getElementById('bitrate');
const bitrateGroup = document.getElementById('bitrate-group');
const extractBtn = document.getElementById('extract-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const outputSection = document.getElementById('output-section');
const audioPlayer = document.getElementById('audio-player');
const outputSize = document.getElementById('output-size');
const downloadBtn = document.getElementById('download-btn');

// WAV選択時はビットレートを非表示
formatSelect.addEventListener('change', () => {
  bitrateGroup.style.display = (formatSelect.value === 'wav') ? 'none' : 'flex';
});

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('video/')) {
    alert('動画ファイルを選択してください。');
    return;
  }
  currentFile = file;
  videoPlayer.src = URL.createObjectURL(file);
  editorSection.style.display = 'block';
  outputSection.style.display = 'none';
});

// 抽出処理
extractBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  extractBtn.disabled = true;
  progressWrapper.style.display = 'block';
  outputSection.style.display = 'none';
  progressBar.style.width = '0%';
  statusText.textContent = 'FFmpegエンジンを準備中...';

  try {
    if (!ffmpeg) {
      ffmpeg = createFFmpeg({
        log: true,
        corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
      });
      ffmpeg.setProgress(({ ratio }) => {
        const percent = Math.min(100, Math.round(ratio * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `音声抽出中... ${percent}%`;
      });
      await ffmpeg.load();
    }

    statusText.textContent = '動画ファイルを読み込み中...';
    const inputExt = currentFile.name.substring(currentFile.name.lastIndexOf('.')) || '.mp4';
    const inputName = `input${inputExt}`;
    const format = formatSelect.value;
    const bitrate = bitrateSelect.value;
    const outputName = `output.${format}`;

    ffmpeg.FS('writeFile', inputName, await fetchFile(currentFile));

    statusText.textContent = '音声抽出・変換中...';

    // コマンド組み立て
    const args = ['-i', inputName, '-vn'];
    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    } else if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    } else if (format === 'aac') {
      args.push('-c:a', 'aac', '-b:a', bitrate);
    }
    args.push(outputName);

    await ffmpeg.run(...args);

    // 抽出データ取得
    const data = ffmpeg.FS('readFile', outputName);
    const mimeTypes = { mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac' };
    generatedBlob = new Blob([data.buffer], { type: mimeTypes[format] || 'audio/mpeg' });

    // プレビュー表示
    audioPlayer.src = URL.createObjectURL(generatedBlob);
    outputSize.textContent = `ファイルサイズ: ${CommonUtils.formatBytes(generatedBlob.size)}`;
    outputSection.style.display = 'block';
    statusText.textContent = '抽出完了！';

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'extracted';
    outputFilename = `${baseName}.${format}`;

    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

  } catch (error) {
    console.error(error);
    alert('音声抽出に失敗しました。');
    statusText.textContent = 'エラーが発生しました。';
  } finally {
    extractBtn.disabled = false;
  }
});

// ダウンロード
downloadBtn.addEventListener('click', () => {
  if (!generatedBlob) return;
  CommonUtils.downloadBlob(generatedBlob, outputFilename);
});
