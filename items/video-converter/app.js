let ffmpeg = null;
let currentFile = null;
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
    
    // 音声が入力された場合、デフォルト出力先をMP3またはMP4に設定
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
}, '*'); // acceptTypeを緩めて音声も動画も受け入れる

targetFormatSelect.addEventListener('change', updateUIForFormat);

function updateUIForFormat() {
  const fmt = targetFormatSelect.value;
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

    const inExt = (currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'bin').toLowerCase();
    const inputName = `input.${inExt}`;
    const targetFormat = targetFormatSelect.value;
    const outputName = `output.${targetFormat}`;

    statusText.textContent = 'ファイルを読み込み中...';
    const fileData = new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileData);

    statusText.textContent = '変換処理を実行中...';

    const preset = qualityPresetSelect.value;
    let ffmpegArgs = [];

    const isTargetVideo = ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(targetFormat);
    const isTargetAudio = ['mp3', 'wav', 'aac'].includes(targetFormat);

    // ==========================================
    // パターン1: 音声ファイル ➔ 動画化（黒背景を追加）
    // ==========================================
    if (isAudioInput && isTargetVideo) {
      // 仮想黒背景（1280x720 30fps）を合成
      ffmpegArgs.push(
        '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30',
        '-i', inputName,
        '-c:v', targetFormat === 'webm' ? 'libvpx-vp9' : 'libx264',
        '-tune', 'stillimage',
        '-preset', 'ultrafast',
        '-c:a', targetFormat === 'webm' ? 'libopus' : 'aac',
        '-b:a', '192k',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        outputName
      );
    } 
    // ==========================================
    // パターン2: 音声のみ出力（動画からの抽出、または音声相互変換）
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
        throw new Error('変換ファイルの生成に失敗しました。対応していないコーデックの可能性があります。');
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

    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

  } catch (error) {
    console.error(error);
    alert(error.message || '変換処理中にエラーが発生しました。コンソールのログをご確認ください。');
    statusText.textContent = 'エラーが発生しました';
  } finally {
    convertBtn.disabled = false;
  }
});
