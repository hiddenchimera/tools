let ffmpeg = null;
let currentFile = null;
let isLoaded = false;
let videoDuration = 0;
let isCancelled = false;

const dropzone = document.getElementById('dropzone');
const controlPanel = document.getElementById('control-panel');
const videoPreview = document.getElementById('video-preview');
const inputInfoBadge = document.getElementById('input-info-badge');
const splitPresetSelect = document.getElementById('split-preset');
const customSecondsGroup = document.getElementById('custom-seconds-group');
const customSecondsInput = document.getElementById('custom-seconds-input');
const targetFormatSelect = document.getElementById('target-format');
const splitSummaryText = document.getElementById('split-summary-text');
const splitPartsList = document.getElementById('split-parts-list');
const convertBtn = document.getElementById('convert-btn');
const progressWrapper = document.getElementById('progress-wrapper');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const cancelBtn = document.getElementById('cancel-btn');

const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv', 'm4v'];

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
    convertBtn.disabled = false;
  };
}, '*');

// プリセット変更イベント
splitPresetSelect.addEventListener('change', () => {
  if (splitPresetSelect.value === 'custom') {
    customSecondsGroup.style.display = 'flex';
  } else {
    customSecondsGroup.style.display = 'none';
  }
  calculateSplitPlan();
});

customSecondsInput.addEventListener('input', calculateSplitPlan);

// 1パートあたりの秒数を取得
function getTargetSegmentSeconds() {
  if (splitPresetSelect.value === 'custom') {
    const val = parseFloat(customSecondsInput.value);
    return isNaN(val) || val <= 0 ? 140 : val;
  }
  return parseFloat(splitPresetSelect.value);
}

// 分割計画の計算とプレビュー表示
function calculateSplitPlan() {
  if (!videoDuration || videoDuration <= 0) return;

  const segmentSec = getTargetSegmentSeconds();
  const totalParts = Math.ceil(videoDuration / segmentSec);

  splitPartsList.innerHTML = '';

  if (totalParts <= 1) {
    splitSummaryText.innerHTML = `この動画の長さ（${formatSeconds(videoDuration)}）は指定制限（${formatSeconds(segmentSec)}）以下のため、<strong>分割の必要はありません</strong>。`;
    return;
  }

  splitSummaryText.innerHTML = `総時間: <strong>${formatSeconds(videoDuration)}</strong> ➔ 1本あたり最大 <strong>${formatSeconds(segmentSec)}</strong> で <strong>計 ${totalParts} 本</strong> に分割されます。`;

  for (let i = 0; i < totalParts; i++) {
    const startSec = i * segmentSec;
    const endSec = Math.min(videoDuration, (i + 1) * segmentSec);
    const partDuration = endSec - startSec;

    const li = document.createElement('li');
    li.textContent = `Part ${i + 1}: ${formatSeconds(startSec)} 〜 ${formatSeconds(endSec)}（長さ: ${formatSeconds(partDuration)}）`;
    splitPartsList.appendChild(li);
  }
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

// 分割実行メインロジック
convertBtn.addEventListener('click', async () => {
  if (!currentFile || videoDuration <= 0) return;

  const segmentSec = getTargetSegmentSeconds();
  const totalParts = Math.ceil(videoDuration / segmentSec);
  const targetFormatMode = targetFormatSelect.value;
  const inExt = (currentFile.name.substring(currentFile.name.lastIndexOf('.') + 1) || 'mp4').toLowerCase();

  // 出力拡張子（copy の場合は元ファイルと同じ）
  const outExt = targetFormatMode === 'copy' ? inExt : targetFormatMode;

  isCancelled = false;
  convertBtn.disabled = true;
  cancelBtn.disabled = false;
  cancelBtn.style.display = 'block';
  progressWrapper.style.display = 'block';
  progressBar.style.width = '0%';
  statusText.textContent = '準備中...';

  const inputName = `input.${inExt}`;
  const generatedFiles = [];

  try {
    await loadFFmpeg();

    statusText.textContent = 'ファイルを読み込み中...';
    const fileData = new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileData);

    for (let i = 0; i < totalParts; i++) {
      if (isCancelled) break;

      const startSec = i * segmentSec;
      const endSec = Math.min(videoDuration, (i + 1) * segmentSec);
      const durationSec = endSec - startSec;
      const outputName = `part_${String(i + 1).padStart(2, '0')}.${outExt}`;

      statusText.textContent = `Part ${i + 1} / ${totalParts} を切り出し中...`;

      let ffmpegArgs = [];

      // 高速シークのために -ss を -i の前に配置
      if (targetFormatMode === 'copy') {
        ffmpegArgs = [
          '-ss', String(startSec),
          '-i', inputName,
          '-t', String(durationSec),
          '-c', 'copy',
          '-avoid_negative_ts', 'make_zero',
          outputName
        ];
      } else {
        // 再エンコード
        const vCodec = targetFormatMode === 'webm' ? 'libvpx' : 'libx264';
        const aCodec = targetFormatMode === 'webm' ? 'libvorbis' : 'aac';

        ffmpegArgs = [
          '-ss', String(startSec),
          '-i', inputName,
          '-t', String(durationSec),
          '-c:v', vCodec,
          '-preset', 'ultrafast',
          '-c:a', aCodec,
          '-b:a', '128k',
          outputName
        ];
      }

      await ffmpeg.run(...ffmpegArgs);

      if (isCancelled) break;

      const data = ffmpeg.FS('readFile', outputName);
      generatedFiles.push({ name: outputName, data: data });

      // パート単位で進捗バーを更新
      const overallPercent = ((i + 1) / totalParts) * 100;
      updateProgress(overallPercent);

      // メモリ節約のため仮想FSから削除
      ffmpeg.FS('unlink', outputName);
    }

    if (isCancelled) return;

    statusText.textContent = 'ファイルをパッケージ化中...';

    const baseName = currentFile.name.substring(0, currentFile.name.lastIndexOf('.')) || 'video';

    // 1本だけの場合は直接動画ファイルをダウンロード
    if (generatedFiles.length === 1) {
      const mimeType = outExt === 'webm' ? 'video/webm' : (outExt === 'mov' ? 'video/quicktime' : 'video/mp4');
      const blob = new Blob([generatedFiles[0].data.buffer], { type: mimeType });
      CommonUtils.downloadBlob(blob, `${baseName}_part1.${outExt}`);
    } 
    // 複数本の場合は ZIP にまとめて一括ダウンロード
    else if (generatedFiles.length > 1) {
      statusText.textContent = 'ZIPファイルを生成中...';
      const zip = new JSZip();
      generatedFiles.forEach((file, idx) => {
        const fileName = `${baseName}_part${idx + 1}.${outExt}`;
        zip.file(fileName, file.data);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      CommonUtils.downloadBlob(zipBlob, `${baseName}_split.zip`);
    }

    cancelBtn.style.display = 'none';
    cancelBtn.disabled = true;
    statusText.textContent = '分割完了！ダウンロードしました。';
    progressBar.style.width = '100%';

    // 入力ファイルクリーンアップ
    ffmpeg.FS('unlink', inputName);

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
