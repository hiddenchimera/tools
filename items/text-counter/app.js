const textInput = document.getElementById('text-input');
const copyBtn = document.getElementById('copy-btn');
const cleanSpacesBtn = document.getElementById('clean-spaces-btn');
const sampleTextBtn = document.getElementById('sample-text-btn');
const clearBtn = document.getElementById('clear-btn');
const saveIndicator = document.getElementById('save-indicator');

// 集計用要素
const statTotalChars = document.getElementById('stat-total-chars');
const statNoSpaces = document.getElementById('stat-no-spaces');
const statNoBreaks = document.getElementById('stat-no-breaks');
const statLines = document.getElementById('stat-lines');
const statParagraphs = document.getElementById('stat-paragraphs');
const statManuscript = document.getElementById('stat-manuscript');
const statManuscriptReal = document.getElementById('stat-manuscript-real');
const statReadTime = document.getElementById('stat-read-time');
const statSpeechTime = document.getElementById('stat-speech-time');
const statBytesUtf8 = document.getElementById('stat-bytes-utf8');
const statBytesSjis = document.getElementById('stat-bytes-sjis');
const analysisContainer = document.getElementById('analysis-container');

const STORAGE_KEY = 'hc_text_counter_draft';

// 初期化：ローカル下書きの復元
window.addEventListener('DOMContentLoaded', () => {
  const savedDraft = localStorage.getItem(STORAGE_KEY);
  if (savedDraft) {
    textInput.value = savedDraft;
  }
  updateAllStats();
});

// 入力イベント（リアルタイム集計 ＆ 自動保存）
textInput.addEventListener('input', () => {
  updateAllStats();
  localStorage.setItem(STORAGE_KEY, textInput.value);
  saveIndicator.textContent = '自動保存済';
  setTimeout(() => {
    saveIndicator.textContent = 'ローカル下書き保存済';
  }, 1200);
});

// コピー機能
copyBtn.addEventListener('click', async () => {
  if (!textInput.value) return;
  try {
    await navigator.clipboard.writeText(textInput.value);
    const origText = copyBtn.textContent;
    copyBtn.textContent = '✅ コピー完了';
    setTimeout(() => { copyBtn.textContent = origText; }, 1500);
  } catch (err) {
    textInput.select();
    document.execCommand('copy');
  }
});

// 空白の整理（連続スペースや行末の空白を除去）
cleanSpacesBtn.addEventListener('click', () => {
  if (!textInput.value) return;
  let cleaned = textInput.value
    .replace(/[ \t]+/g, ' ')           // 連続する半角空白・タブを1つに
    .replace(/ +/g, ' ')             // 連続する全角空白を1つに
    .replace(/[ \t]+$/gm, '')          // 各行末の空白を除去
    .replace(/\n{3,}/g, '\n\n');       // 3回以上の連続改行を2つに

  textInput.value = cleaned;
  updateAllStats();
  localStorage.setItem(STORAGE_KEY, cleaned);
});

// サンプル文章の挿入
sampleTextBtn.addEventListener('click', () => {
  textInput.value = `吾輩は猫である。名前はまだ無い。
どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。吾輩はここで始めて人間というものを見た。しかもあとで聞くとそれは書生という人間中で一番獰悪な種族であったそうだ。この書生というのは時々我々を捕えて煮て食うという話である。

しかしその当時は何という考もなかったから別段恐しいとも思わなかった。ただ彼の掌に載せられてスーと持ち上げられた時何だかフワフワした感じがあったばかりである。掌の上で少し落ちついて書生の顔を見たのがいわゆる人間というものの見始であろう。`;
  updateAllStats();
  localStorage.setItem(STORAGE_KEY, textInput.value);
});

// 消去機能
clearBtn.addEventListener('click', () => {
  if (!textInput.value) return;
  if (!confirm('入力中の文章をすべて消去しますか？')) return;
  textInput.value = '';
  localStorage.removeItem(STORAGE_KEY);
  updateAllStats();
});

// 全計算の更新
function updateAllStats() {
  const text = textInput.value;

  // 1. サロゲートペア対応の総文字数
  const chars = [...text];
  const totalCount = chars.length;
  statTotalChars.textContent = totalCount.toLocaleString();

  if (totalCount === 0) {
    resetStats();
    return;
  }

  // 2. 空白除外（全角スペース、半角スペース、タブ）
  const noSpacesCount = [...text.replace(/[\s\u3000]/g, '')].length;
  statNoSpaces.textContent = noSpacesCount.toLocaleString();

  // 3. 改行除外
  const noBreaksCount = [...text.replace(/[\r\n]/g, '')].length;
  statNoBreaks.textContent = noBreaksCount.toLocaleString();

  // 4. 行数と段落数
  const lines = text.split(/\r\n|\r|\n/);
  statLines.textContent = `${lines.length.toLocaleString()} 行`;

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  statParagraphs.textContent = Math.max(1, paragraphs.length).toLocaleString();

  // 5. 原稿用紙換算（400字詰め）
  // 単純換算
  const simpleSheets = (totalCount / 400).toFixed(1);
  statManuscript.textContent = `${simpleSheets} 枚`;

  // 実質換算（20字×20行）
  let totalGridLines = 0;
  for (const line of lines) {
    const lineChars = [...line].length;
    // 空行も1行として数える
    if (lineChars === 0) {
      totalGridLines += 1;
    } else {
      totalGridLines += Math.ceil(lineChars / 20);
    }
  }
  const realSheets = (totalGridLines / 20).toFixed(1);
  statManuscriptReal.textContent = `${realSheets} 枚`;

  // 6. 読了目安時間
  // 黙読: 500文字/分 = 約8.3文字/秒
  const readSeconds = Math.ceil(totalCount / (500 / 60));
  statReadTime.textContent = formatDuration(readSeconds);

  // 音読: 300文字/分 = 5文字/秒
  const speechSeconds = Math.ceil(totalCount / (300 / 60));
  statSpeechTime.textContent = formatDuration(speechSeconds);

  // 7. バイト数計算
  const utf8Bytes = new TextEncoder().encode(text).length;
  statBytesUtf8.textContent = CommonUtils.formatBytes(utf8Bytes);

  // Shift_JIS近似計算（全角2バイト、半角1バイト）
  let sjisBytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // ASCIIおよび半角カナ範囲
    if ((code >= 0x0 && code < 0x81) || (code === 0xf8f0) || (code >= 0xff61 && code <= 0xff9f)) {
      sjisBytes += 1;
    } else {
      sjisBytes += 2;
    }
  }
  statBytesSjis.textContent = CommonUtils.formatBytes(sjisBytes);

  // 8. 簡易文章校正・分析
  runTextAnalysis(text, lines);
}

// 時間フォーマット（秒 -> X分Y秒）
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return remSecs > 0 ? `${mins} 分 ${remSecs} 秒` : `${mins} 分`;
}

// 簡易文章分析
function runTextAnalysis(text, lines) {
  const alerts = [];

  // ① 文末の連続（〜です。〜です。等）
  const sentences = text.split(/。|\n/).map(s => s.trim()).filter(Boolean);
  let consecutiveEnds = 1;
  for (let i = 1; i < sentences.length; i++) {
    const prev = sentences[i - 1];
    const curr = sentences[i];
    const getEnd = (s) => {
      if (s.endsWith('でした')) return 'でした';
      if (s.endsWith('ます')) return 'ます';
      if (s.endsWith('です')) return 'です';
      if (s.endsWith('だ')) return 'だ';
      if (s.endsWith('である')) return 'である';
      return '';
    };
    const prevEnd = getEnd(prev);
    const currEnd = getEnd(curr);

    if (prevEnd && currEnd && prevEnd === currEnd) {
      consecutiveEnds++;
      if (consecutiveEnds >= 3) {
        alerts.push(`文末「〜${currEnd}」が3回以上連続しています。語尾のバリエーションを意識すると読みやすくなります。`);
        break;
      }
    } else {
      consecutiveEnds = 1;
    }
  }

  // ② 助詞「の」の過度な連続チェック
  const noMatch = text.match(/[^。、\n]{0,20}の[^。、\n]{1,10}の[^。、\n]{1,10}の/g);
  if (noMatch && noMatch.length > 0) {
    alerts.push(`助詞「の」が1文の中に連続して使用されている箇所があります（例: 「〜の〜の〜」）。`);
  }

  // ③ 1文の長さチェック（100文字超）
  const longSentence = sentences.find(s => [...s].length > 100);
  if (longSentence) {
    alerts.push(`1文が100文字を超えている箇所があります。一文を短く区切ると伝わりやすくなります。`);
  }

  // 結果描画
  if (alerts.length === 0) {
    analysisContainer.innerHTML = '<div class="analysis-item" style="color: #4ade80;">✨ 気になる重複や長文は見つかりませんでした。良好なリズムです。</div>';
  } else {
    analysisContainer.innerHTML = alerts.map(a => `<div class="analysis-item alert">⚠️ ${a}</div>`).join('');
  }
}

// リセット表示
function resetStats() {
  statTotalChars.textContent = '0';
  statNoSpaces.textContent = '0';
  statNoBreaks.textContent = '0';
  statLines.textContent = '0 行';
  statParagraphs.textContent = '0';
  statManuscript.textContent = '0.0 枚';
  statManuscriptReal.textContent = '0.0 枚';
  statReadTime.textContent = '0 秒';
  statSpeechTime.textContent = '0 秒';
  statBytesUtf8.textContent = '0 B';
  statBytesSjis.textContent = '0 B';
  analysisContainer.innerHTML = '<div class="analysis-item">文章を入力すると、助詞の連続や文末の重複を判定します。</div>';
}
