// グローバルの FFmpeg から必要な関数を取得
const { createFFmpeg, fetchFile } = FFmpeg;

let ffmpeg = null;
let currentFile = null;
let generatedBlob = null;

const dropzone = document.getElementById('dropzone');
const editorSection = document.getElementById('editor-section');
const videoPlayer = document.getElementById('video-player');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const fpsSelect = document.getElementById('fps');
const widthSelect = document.getElementById('width');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const outputSection = document.getElementById('output-section');
const outputGif = document.getElementById('output-gif');
const outputSize = document.getElementById('output-size');
const downloadBtn = document.getElementById('download-btn');

// ファイル受付
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('video/')) {
    alert('動画ファイルを選択してください。');
    return;
  }
  loadFile(file);
});

function loadFile(file) {
  currentFile = file;
  const fileUrl = URL.createObjectURL(file);
  videoPlayer.src = fileUrl;

  videoPlayer.onloadedmetadata = () => {
    startTimeInput.value = '0';
    const defaultEnd = Math.min(5, Math.floor(videoPlayer.duration * 10) / 10);
    endTimeInput.value = defaultEnd;
    endTimeInput.max = videoPlayer.duration;

    editorSection.style.display = 'block';
    outputSection.style.display = 'none';
  };
}

// 変換処理
convertBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  const start = parseFloat(startTimeInput.value) || 0;
  const end = parseFloat(endTimeInput.value) || 5;
  const duration = end - start;

  if (duration <= 0) {
    alert('終了時間は開始時間よりも後に設定してください。');
    return;
  }

  convertBtn.disabled = true;
  progressWrapper.style.display = 'block';
  outputSection.style.display = 'none';
  progressBar.style.width = '0%';
  statusText.textContent = 'FFmpegエンジンを準備中... (初回のみ数秒かかります)';

  try {
    if (!ffmpeg) {
      ffmpeg = createFFmpeg({
        log: true,
        // ★ここを core-st（シングルスレッド版）に変更
        corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js'
      });
      ffmpeg.setProgress(({ ratio }) => {
        const percent = Math.min(100, Math.round(ratio * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `変換中... ${percent}%`;
      });
      await ffmpeg.load();
    }

    statusText.textContent = '動画ファイルを読み込み中...';
    const inputExt = currentFile.name.substring(currentFile.name.lastIndexOf('.')) || '.mp4';
    const inputName = `input${inputExt}`;
    const outputName = 'output.gif';

    ffmpeg.FS('writeFile', inputName, await fetchFile(currentFile));

    statusText.textContent = 'GIF生成中...';

    const fps = fpsSelect.value;
    const width = widthSelect.value;
    const scaleFilter = width === '-1' ? `fps=${fps}` : `fps=${fps},scale=${width}:-1:flags=lanczos`;
    const filterComplex = `[0:v] ${scaleFilter},split [a][b];[a] palettegen [p];[b][p] paletteuse`;

    // FFmpegコマンド実行
    await ffmpeg.run(
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', inputName,
      '-filter_complex', filterComplex,
      outputName
    );

    // 生成ファイル取得
    const data = ffmpeg.FS('readFile', outputName);
    generatedBlob = new Blob([data.buffer], { type: 'image/gif' });

    // プレビュー表示
    const gifUrl = URL.createObjectURL(generatedBlob);
    outputGif.src = gifUrl;
    outputSize.textContent = `ファイルサイズ: ${CommonUtils.formatBytes(generatedBlob.size)}`;
    outputSection.style.display = 'block';
    statusText.textContent = '完了しました！';

    // 仮想FS掃除
    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

  } catch (error) {
    console.error(error);
    alert('変換処理中にエラーが発生しました。コンソールログをご確認ください。');
    statusText.textContent = 'エラーが発生しました。';
  } finally {
    convertBtn.disabled = false;
  }
});

// ダウンロード
downloadBtn.addEventListener('click', () => {
  if (!generatedBlob) return;
  const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'converted';
  CommonUtils.downloadBlob(generatedBlob, `${baseName}.gif`);
});
