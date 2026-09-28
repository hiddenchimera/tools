import { fetchFile } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';
import { getFFmpeg } from '../../assets/js/ffmpeg-loader.js';

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

// 共通ドラッグ＆ドロップ初期化
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
    // 初期値として最大5秒、または動画の長さ
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
    const ffmpeg = await getFFmpeg((event) => {
      // 進行状況のプログレスバー更新
      if (event && typeof event.progress === 'number') {
        const percent = Math.min(100, Math.round(event.progress * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `変換中... ${percent}%`;
      }
    });

    statusText.textContent = '動画ファイルを読み込み中...';
    const inputName = 'input_video' + (currentFile.name.substring(currentFile.name.lastIndexOf('.')) || '.mp4');
    const outputName = 'output.gif';

    await ffmpeg.writeFile(inputName, await fetchFile(currentFile));

    statusText.textContent = 'GIF生成中（パレット最適化中）...';

    const fps = fpsSelect.value;
    const width = widthSelect.value;
    // リサイズとカラーパレット最適化（高品質GIFフィルタ）
    const scaleFilter = width === '-1' ? `fps=${fps}` : `fps=${fps},scale=${width}:-1:flags=lanczos`;
    const filterComplex = `[0:v] ${scaleFilter},split [a][b];[a] palettegen [p];[b][p] paletteuse`;

    // FFmpegコマンド実行
    await ffmpeg.exec([
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', inputName,
      '-filter_complex', filterComplex,
      outputName
    ]);

    // 生成ファイル取得
    const data = await ffmpeg.readFile(outputName);
    generatedBlob = new Blob([data.buffer], { type: 'image/gif' });

    // プレビュー表示
    const gifUrl = URL.createObjectURL(generatedBlob);
    outputGif.src = gifUrl;
    outputSize.textContent = `ファイルサイズ: ${CommonUtils.formatBytes(generatedBlob.size)}`;
    outputSection.style.display = 'block';
    statusText.textContent = '完了しました！';

    // 仮想FSの掃除
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

  } catch (error) {
    console.error(error);
    alert('変換処理中にエラーが発生しました。コンソールログをご確認ください。');
    statusText.textContent = 'エラーが発生しました。';
  } finally {
    convertBtn.disabled = false;
  }
});

// ダウンロードボタン
downloadBtn.addEventListener('click', () => {
  if (!generatedBlob) return;
  const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'converted';
  CommonUtils.downloadBlob(generatedBlob, `${baseName}.gif`);
});
