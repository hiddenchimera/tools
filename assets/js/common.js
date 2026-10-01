/**
 * 共通UIユーティリティ
 */
const CommonUtils = {
  /**
   * ドラッグ＆ドロップゾーンのイベントを設定する
   * @param {HTMLElement} dropzoneEl 
   * @param {Function} onFileSelect ファイルが選択/ドロップされた時のコールバック
   * @param {String} acceptType 許可するMIMEタイプや拡張子（例: 'video/'）
   */
  initDropzone(dropzoneEl, onFileSelect, acceptType = 'video/') {
    if (!dropzoneEl) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';
    if (acceptType) fileInput.accept = acceptType;
    document.body.appendChild(fileInput);

    dropzoneEl.addEventListener('click', () => fileInput.click());

    dropzoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneEl.classList.add('dragover');
    });

    dropzoneEl.addEventListener('dragleave', () => {
      dropzoneEl.classList.remove('dragover');
    });

    dropzoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        onFileSelect(files[0]);
      }
    });
  },

  /**
   * ファイルサイズを読みやすい形式にフォーマットする
   */
  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * 処理完了したBlobデータをファイルとしてダウンロードさせる
   */
  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * File / Blob を FFmpeg FS書き込み用の Uint8Array に変換する
   */
  async fetchFile(file) {
    return new Uint8Array(await file.arrayBuffer());
  }
};
