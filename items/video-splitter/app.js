let ffmpeg = null;
let currentFile = null;
let isLoaded = false;
let videoDuration = 0;
let isCancelled = false;

// 生成されたパートのBlobとメタデータを保持
let generatedPartFiles = [];

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const videoPreview = document.getElementById('video-preview');
const inputInfoBadge = document.getElementById('input-info-badge');
const splitPresetSelect = document.getElementById('split-preset');
const customSecondsGroup = document.getElementById('custom-seconds-group');
const customSecondsInput = document.getElementById('custom-seconds-input');
const overlapSelect = document.getElementById('overlap-select');
const cutModeSelect = document.getElementById('cut-mode');
const targetFormatSelect = document.getElementById('target-format');
const splitSummaryText = document.getElementById('split-summary-text');
const splitPartsList = document.getElementById('split-parts-list');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const cancelBtn = document.getElementById('cancel-btn');

// ダウンロード結果パネル
const downloadResultsPanel = document.getElementById('download-results-panel');
const resultsCountBadge = document.getElementById('results-count-badge');
const sizeAlertBox = document.getElementById('size-alert-box');
const zipDownloadBtn = document.getElementById('zip-download-btn');
const partItemsContainer = document.getElementById('part-items-container');

const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv', 'm4v'];
const X_MAX_SIZE_BYTES = 512 * 1024 * 1024; // 512MB

// 秒数を「分:秒」または「時間:分:秒」にフォーマット
function formatSeconds(sec) {
  const s = Math.floor(sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ドロップゾーン初期化
CommonUtils.initDropzone(dropzone, (file) => {
  const ext = (file.name.substring(file.name.lastIndexOf('.') + 1) || '').toLowerCase();
  const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.includes(ext);

  if (!isVideo) {
    alert('動画ファイル（MP4, MOV, WebM, MKV, AVIなど）を選択してください。');
    return;
  }

  currentFile = file;
  const fileUrl = URL.createObjectURL(file);
  videoPreview.src = fileUrl;

  videoPreview.onloadedmetadata = () => {
    videoDuration = videoPreview.duration;
    inputInfoBadge.textContent = `🎬 動画: ${file.name} (${CommonUtils.formatBytes(file.size)}) / 総再生時間: ${formatSeconds(videoDuration)}`;
    calculateSplitPlan();
    controlPanel.style.display = 'block';
    progressWrapper.style.display = 'none';
    downloadResultsPanel.style.display = 'none';
    convertBtn.disabled = false;
  };
}, '*');

// プリセット・のりしろ変更イベント
splitPresetSelect.addEventListener('change', () => {
  customSecondsGroup.style.display = (splitPresetSelect.value === 'custom') ? 'flex' : 'none';
  calculateSplitPlan();
});

customSecondsInput.addEventListener('input', calculateSplitPlan);
overlapSelect.addEventListener('change', calculateSplitPlan);

// 1パートあたりの秒数を取得
function getTargetSegmentSeconds() {
  if (splitPresetSelect.value === 'custom') {
    const val = parseFloat(customSecondsInput.value);
    return isNaN(val) || val <= 0 ? 140 : val;
  }
  return parseFloat(splitPresetSelect.value);
}

// のりしろ（秒）を取得
function getOverlapSeconds() {
  return parseFloat(overlapSelect.value) || 0;
}

// 分割計画（タイムライン区間）を計算
function getSplitIntervals() {
  const segmentSec = getTargetSegmentSeconds();
  const overlapSec = getOverlapSeconds();
  const intervals = [];

  let currentStart = 0;
  while (currentStart < videoDuration) {
    const currentEnd = Math.min(videoDuration, currentStart + segmentSec);
    intervals.push({
      start: currentStart,
      end: currentEnd,
      duration: currentEnd - currentStart
    });

    if (currentEnd >= videoDuration) break;

    // 次のパート開始位置（のりしろ分だけ手前から開始）
    currentStart = currentEnd - overlapSec;
    if (currentStart >= currentEnd) {
      currentStart = currentEnd;
    }
  }

  return intervals;
}

// 分割計画の計算とプレビュー表示
function calculateSplitPlan() {
  if (!videoDuration || videoDuration <= 0) return;

  const segmentSec = getTargetSegmentSeconds();
  const overlapSec = getOverlapSeconds();
  const intervals = getSplitIntervals();
  const totalParts = intervals.length;

  splitPartsList.innerHTML = '';

  if (totalParts <= 1) {
    splitSummaryText.innerHTML = `この動画の長さ（${formatSeconds(videoDuration)}）は指定制限（${formatSeconds(segmentSec)}）以下のため、<strong>分割の必要はありません</strong>。`;
    return;
  }

  const overlapInfo = overlapSec > 0 ? `（のりしろ: ${overlapSec}秒重複）` : '';
  splitSummaryText.innerHTML = `総時間: <strong>${formatSeconds(videoDuration)}</strong> ➔ 1本最大 <strong>${formatSeconds(segmentSec)}</strong> ${overlapInfo} で <strong>計 ${totalParts} 本</strong> に分割されます。`;

  intervals.forEach((interval, i) => {
    const li = document.createElement('li');
    li.textContent = `Part ${i + 1}: ${formatSeconds(interval.start)} 〜 ${formatSeconds(interval.end)}（長さ: ${formatSeconds(interval.duration)}）`;
    splitPartsList.appendChild(li);
  });
}

// 放物線イージング進捗更新
function updateProgress(percent) {
  if (isCancelled) return;
  const clamped = Math.min(99, Math.max(0, Math.round(percent)));
  const x = clamped / 100;
  const curvedPercent = (1 - Math.pow(1 - x, 2)) * 100;

  progressBar.style.width = `${curvedPercent.toFixed(1)}%`;
  statusText.textContent = `処理中... ${clamped}%`;
}

// FFmpegのロード
async function loadFFmpeg() {
  if (isLoaded && ffmpeg) return;
  const { createFFmpeg } = FFmpeg;
  ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  });

  statusText.textContent = '変換エンジンの初期化中...';
  await ffmpeg.load();
  isLoaded = true;
}

// 中止ボタン
cancelBtn.addEventListener('click', () => {
  if (!confirm('分割処理を中止しますか？')) return;

  isCancelled = true;
  cancelBtn.disabled = true;
  statusText.textContent = '処理を中止しています...';

  try {
    if (ffmpeg) {
      ffmpeg.exit();
    }
  } catch (err) {
    console.warn('ffmpeg exit:', err);
  } finally {
    ffmpeg = null;
    isLoaded = false;
    setTimeout(() => {
      progressWrapper.style.display = 'none';
      convertBtn.disabled = false;
      cancelBtn.disabled = false;
      cancelBtn.style.display = 'none';
      alert('処理を中止しました。');
    }, 400);
  }
});

// ZIP一括ダウンロードボタン
zipDownloadBtn.addEventListener('click', async () => {
  if (generatedPartFiles.length === 0) return;

  zipDownloadBtn.disabled = true;
  zipDownloadBtn.textContent = '📦 ZIPファイルを生成中...';

  try {
    const zip = new JSZip();
    generatedPartFiles.forEach((file) => {
      zip.file(file.name, file.blob);
    });

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'video';
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    CommonUtils.downloadBlob(zipBlob, `${baseName}_split.zip`);
  } catch (err) {
    console.error(err);
    alert('ZIPの生成に失敗しました。各パートの個別ダウンロードをご利用ください。');
  } finally {
    zipDownloadBtn.disabled = false;
    zipDownloadBtn.textContent = '📦 すべてまとめてZIPダウンロード';
  }
});

// 分割実行メインロジック
convertBtn.addEventListener('click', async () => {
  if (!currentFile || videoDuration <= 0) return;

  const intervals = getSplitIntervals();
  const totalParts = intervals.length;
  const cutMode = cutModeSelect.value;
  const targetFormatMode = targetFormatSelect.value;
  const inExt = (currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'mp4').toLowerCase();

  let outExt = inExt;
  if (targetFormatMode !== 'copy') {
    outExt = targetFormatMode;
  }

  const mimeMap = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo'
  };
  const mimeType = mimeMap[outExt] || 'video/mp4';

  isCancelled = false;
  convertBtn.disabled = true;
  cancelBtn.disabled = false;
  cancelBtn.style.display = 'block';
  downloadResultsPanel.style.display = 'none';
  progressWrapper.style.display = 'block';
  progressBar.style.width = '0%';
  statusText.textContent = '準備中...';

  const inputName = `input.${inExt}`;
  generatedPartFiles = [];

  try {
    await loadFFmpeg();

    statusText.textContent = 'ファイルを読み込み中...';
    const fileData = new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileData);

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'video';

    for (let i = 0; i < totalParts; i++) {
      if (isCancelled) break;

      const { start, duration } = intervals[i];
      const outputName = `part_${String(i + 1).padStart(2, '0')}.${outExt}`;
      const downloadFileName = `${baseName}_part${i + 1}.${outExt}`;

      statusText.textContent = `Part ${i + 1} / ${totalParts} を切り出し中...`;

      let ffmpegArgs = [];

      if (cutMode === 'fast' && targetFormatMode === 'copy') {
        // 超高速モード（キーフレームシーク）
        ffmpegArgs = [
          '-ss', String(start),
          '-i', inputName,
          '-t', String(duration),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outputName
        ];
      } else {
        // 高精度モード（Output Seeking: -i の後ろに -ss と -t）
        const isWebm = (outExt === 'webm');
        const vCodec = isWebm ? 'libvpx' : 'libx264';
        const aCodec = isWebm ? 'libvorbis' : 'aac';

        ffmpegArgs = [
          '-i', inputName,
          '-ss', String(start),
          '-t', String(duration),
          '-c:v', vCodec,
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', aCodec,
          '-b:a', '128k',
          '-avoid_negative_ts', 'make_zero',
          outputName
        ];
      }

      await ffmpeg.run(...ffmpegArgs);

      if (isCancelled) break;

      const data = ffmpeg.FS('readFile', outputName);
      const blob = new Blob([data.buffer], { type: mimeType });

      generatedPartFiles.push({
        name: downloadFileName,
        blob: blob,
        size: blob.size,
        duration: duration,
        timeRange: `${formatSeconds(start)} 〜 ${formatSeconds(start + duration)}`
      });

      const overallPercent = ((i + 1) / totalParts) * 100;
      updateProgress(overallPercent);

      ffmpeg.FS('unlink', outputName);
    }

    if (isCancelled) return;

    statusText.textContent = '分割完了！';
    progressBar.style.width = '100%';
    cancelBtn.style.display = 'none';
    cancelBtn.disabled = true;

    // 入力ファイルクリーンアップ
    ffmpeg.FS('unlink', inputName);

    // 完了結果パネルの描画
    renderDownloadResults();

  } catch (error) {
    if (isCancelled) return;
    console.error(error);
    alert(error.message || '分割処理中にエラーが発生しました。コンソールをご確認ください。');
    statusText.textContent = 'エラーが発生しました';
    cancelBtn.style.display = 'none';
    cancelBtn.disabled = true;
  } finally {
    if (!isCancelled) {
      convertBtn.disabled = false;
    }
  }
});

// 完了後の個別ダウンロードリスト描画 & 512MBチェック
function renderDownloadResults() {
  partItemsContainer.innerHTML = '';
  resultsCountBadge.textContent = `全 ${generatedPartFiles.length} 本`;

  let hasOver512MB = false;

  generatedPartFiles.forEach((file, idx) => {
    if (file.size > X_MAX_SIZE_BYTES) {
      hasOver512MB = true;
    }

    const row = document.createElement('div');
    row.className = 'part-item-row';

    const info = document.createElement('div');
    info.className = 'part-item-info';

    const isAlert = file.size > X_MAX_SIZE_BYTES;
    const sizeBadgeColor = isAlert ? 'color: #ef4444; font-weight: bold;' : '';

    info.innerHTML = `
      <div class="part-item-title">Part ${idx + 1} (${file.timeRange})</div>
      <div class="part-item-meta">
        ファイル名: ${file.name} | サイズ: <span style="${sizeBadgeColor}">${CommonUtils.formatBytes(file.size)}</span>
        ${isAlert ? ' ⚠️ 512MB超過' : ''}
      </div>
    `;

    const dlBtn = document.createElement('button');
    dlBtn.className = 'part-dl-btn';
    dlBtn.type = 'button';
    dlBtn.textContent = '⬇ ダウンロード';
    dlBtn.addEventListener('click', () => {
      CommonUtils.downloadBlob(file.blob, file.name);
    });

    row.appendChild(info);
    row.appendChild(dlBtn);
    partItemsContainer.appendChild(row);
  });

  // 512MB警告の表示/非表示
  sizeAlertBox.style.display = hasOver512MB ? 'block' : 'none';

  // 単体ファイルの場合はZIPボタンを非表示
  zipDownloadBtn.style.display = (generatedPartFiles.length > 1) ? 'block' : 'none';

  downloadResultsPanel.style.display = 'block';
}
