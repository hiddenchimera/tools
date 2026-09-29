const { createFFmpeg, fetchFile } = FFmpeg;

let ffmpeg = null;
let currentFile = null;
let generatedBlob = null;
let outputFilename = '';

const dropzone = document.getElementById('dropzone');
const editorSection = document.getElementById('editor-section');
const videoPlayer = document.getElementById('video-player');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const muteCheckbox = document.getElementById('mute-checkbox');
const processBtn = document.getElementById('process-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const outputSection = document.getElementById('output-section');
const outputVideo = document.getElementById('output-video');
const outputSize = document.getElementById('output-size');
const downloadBtn = document.getElementById('download-btn');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('video/')) {
    alert('動画ファイルを選択してください。');
    return;
  }
  currentFile = file;
  videoPlayer.src = URL.createObjectURL(file);

  videoPlayer.onloadedmetadata = () => {
    startTimeInput.value = '0';
    endTimeInput.value = Math.floor(videoPlayer.duration * 10) / 10;
    endTimeInput.max = videoPlayer.duration;

    editorSection.style.display = 'block';
    outputSection.style.display = 'none';
  };
});

// 処理実行
processBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const start = parseFloat(startTimeInput.value) || 0;
  const end = parseFloat(endTimeInput.value) || videoPlayer.duration;
  const duration = end - start;

  if (duration <= 0) {
    alert('終了時間は開始時間よりも後に設定してください。');
    return;
  }

  processBtn.disabled = true;
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
        statusText.textContent = `動画処理中... ${percent}%`;
      });
      await ffmpeg.load();
    }

    statusText.textContent = '動画ファイルを読み込み中...';
    const inputExt = currentFile.name.substring(currentFile.name.lastIndexOf('.')) || '.mp4';
    const inputName = `input${inputExt}`;
    const outputName = 'output.mp4';

    ffmpeg.FS('writeFile', inputName, await fetchFile(currentFile));

    statusText.textContent = 'トリミング・処理中...';

    const args = [
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', inputName
    ];

    if (muteCheckbox.checked) {
      args.push('-an'); // 音声削除
    } else {
      args.push('-c:a', 'aac');
    }

    // 映像処理
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', outputName);

    await ffmpeg.run(...args);

    // 出力データ取得
    const data = ffmpeg.FS('readFile', outputName);
    generatedBlob = new Blob([data.buffer], { type: 'video/mp4' });

    outputVideo.src = URL.createObjectURL(generatedBlob);
    outputSize.textContent = `ファイルサイズ: ${CommonUtils.formatBytes(generatedBlob.size)}`;
    outputSection.style.display = 'block';
    statusText.textContent = '処理完了！';

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'video';
    outputFilename = `${baseName}_edited.mp4`;

    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

  } catch (error) {
    console.error(error);
    alert('動画の処理中にエラーが発生しました。');
    statusText.textContent = 'エラーが発生しました。';
  } finally {
    processBtn.disabled = false;
  }
});

// ダウンロード
downloadBtn.addEventListener('click', () => {
  if (!generatedBlob) return;
  CommonUtils.downloadBlob(generatedBlob, outputFilename);
});
