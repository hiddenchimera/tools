import { fetchFile } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';
import { getFFmpeg } from '../../assets/js/ffmpeg-loader.js';

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

// WAVは非圧縮のためビットレート選択を非表示にする
formatSelect.addEventListener('change', () => {
  if (formatSelect.value === 'wav') {
    bitrateGroup.style.display = 'none';
  } else {
    bitrateGroup.style.display = 'flex';
  }
});

// ファイル受け取り
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
    const ffmpeg = await getFFmpeg((event) => {
      if (event && typeof event.progress === 'number') {
        const percent = Math.min(100, Math.round(event.progress * 100));
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `音声抽出中... ${percent}%`;
      }
    });

    statusText.textContent = '動画ファイルを読み込み中...';
    const inputExt = currentFile.name.substring(currentFile.name.lastIndexOf('.')) || '.mp4';
    const inputName = `input${inputExt}`;
    
    const format = formatSelect.value;
    const bitrate = bitrateSelect.value;
    const outputName = `output.${format}`;

    await ffmpeg.writeFile(inputName, await fetchFile(currentFile));

    statusText.textContent = 'エンコード中...';

    // FFmpeg実行引数を生成
    const ffmpegArgs = ['-i', inputName, '-vn']; // -vn: 映像トラックを除外

    if (format === 'mp3') {
      ffmpegArgs.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    } else if (format === 'wav') {
      ffmpegArgs.push('-c:a', 'pcm_s16le');
    } else if (format === 'aac') {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', bitrate);
    }
    ffmpegArgs.push(outputName);

    await ffmpeg.exec(ffmpegArgs);

    // 生成ファイル取得
    const data = await ffmpeg.readFile(outputName);
    const mimeTypes = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac'
    };
    generatedBlob = new Blob([data.buffer], { type: mimeTypes[format] || 'audio/mpeg' });

    // プレビューとダウンロード設定
    const audioUrl = URL.createObjectURL(generatedBlob);
    audioPlayer.src = audioUrl;
    outputSize.textContent = `ファイルサイズ: ${CommonUtils.formatBytes(generatedBlob.size)}`;
    outputSection.style.display = 'block';
    statusText.textContent = '抽出が完了しました！';

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'extracted_audio';
    outputFilename = `${baseName}.${format}`;

    // 仮想FSのクリーンアップ
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

  } catch (error) {
    console.error(error);
    alert('音声抽出に失敗しました。動画に音声が含まれていないか、サポートされていない形式の可能性があります。');
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
