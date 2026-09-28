import { fetchFile } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';
import { getFFmpeg } from '../../assets/js/ffmpeg-loader.js';

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

// ファイル読み込み
CommonUtils.initDropzone(dropzone, (file) => {
  if (!file.type.startsWith('video/')) {
    alert('動画ファイルを選択してください。');
    return;
  }
  currentFile = file;
  const fileUrl = URL.createObjectURL(file);
  videoPlayer.src = fileUrl;

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
    const ffmpeg = await getFFmpeg((event) => {
      if (event && typeof event.progress === 'number') {
        const percent = Math.min(100, Math.round(event.progress * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `動画処理中... ${percent}%`;
      }
    });

    statusText.textContent = '動画ファイルを読み込み中...';
    const inputExt = currentFile.name.substring(currentFile.name.lastIndexOf('.')) || '.mp4';
    const inputName = `input${inputExt}`;
    const outputName = 'output.mp4';

    await ffmpeg.writeFile(inputName, await fetchFile(currentFile));

    statusText.textContent = 'トリミングおよびエンコード中...';

    // FFmpegコマンド組み立て
    // -ss と -t を入力前(-iの前)に置くことでシークを高速化
    const ffmpegArgs = [
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', inputName
    ];

    if (muteCheckbox.checked) {
      // 音声除去 (-an)
      ffmpegArgs.push('-an');
    } else {
      // 音声維持（互換性のためAAC）
      ffmpegArgs.push('-c:a', 'aac');
    }

    // 映像は高速なultrafastプリセットでH.264エンコード
    ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', outputName);

    await ffmpeg.exec(ffmpegArgs);

    // 出力データ取得
    const data = await ffmpeg.readFile(outputName);
    generatedBlob = new Blob([data.buffer], { type: 'video/mp4' });

    // プレビューと結果表示
    const videoUrl = URL.createObjectURL(generatedBlob);
    outputVideo.src = videoUrl;
    outputSize.textContent = `ファイルサイズ: ${CommonUtils.formatBytes(generatedBlob.size)}`;
    outputSection.style.display = 'block';
    statusText.textContent = '処理が完了しました！';

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'trimmed_video';
    outputFilename = `${baseName}_edited.mp4`;

    // 仮想FSのクリーンアップ
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

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
