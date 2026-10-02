/**
 * サイト共通ユーティリティ (common.js)
 */
const CommonUtils = {
  /**
   * ドロップゾーンの初期化
   */
  initDropzone: (dropzoneElement, onFileSelect, acceptType = '') => {
    if (!dropzoneElement) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropzoneElement.addEventListener(eventName, preventDefaults, false);
      document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
      e.preventDefault();
      e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzoneElement.addEventListener(eventName, () => {
        dropzoneElement.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzoneElement.addEventListener(eventName, () => {
        dropzoneElement.classList.remove('dragover');
      }, false);
    });

    dropzoneElement.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        if (files.length === 1) {
          onFileSelect(files[0]);
        } else {
          onFileSelect(files);
        }
      }
    }, false);

    dropzoneElement.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      if (acceptType) input.accept = acceptType;
      input.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          onFileSelect(e.target.files[0]);
        }
      };
      input.click();
    });
  },

  /**
   * Blobデータをファイルとしてダウンロードさせる
   */
  downloadBlob: (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  },

  /**
   * バイト数を読みやすい形式 (KB, MB等) に変換
   */
  formatBytes: (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
};

/**
 * ========================================================
 * 全自動サイドバー（ドロワー）ナビゲーション
 * ========================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
  const header = document.querySelector('header');
  if (!header) return;

  // 1. ヘッダーの先頭に「二」ボタンを追加
  const menuBtn = document.createElement('button');
  menuBtn.className = 'nav-menu-btn';
  menuBtn.setAttribute('aria-label', 'メニューを開く');
  menuBtn.innerHTML = '<span></span><span></span>';
  header.prepend(menuBtn);

  // 2. ドロワーサイドバー ＆ オーバーレイ要素を作成してbodyに追加
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';

  const drawer = document.createElement('div');
  drawer.className = 'nav-drawer';
  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-header-title">
        <span>🛠️</span>
        <span>ツール一覧</span>
      </div>
      <button class="drawer-close-btn" aria-label="閉じる">✕</button>
    </div>
    <div class="drawer-body" id="drawer-body">
      <div style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">読み込み中...</div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  const drawerBody = drawer.querySelector('#drawer-body');
  const closeBtn = drawer.querySelector('.drawer-close-btn');

  // 開閉イベント
  const openDrawer = () => {
    overlay.classList.add('active');
    drawer.classList.add('active');
  };
  const closeDrawer = () => {
    overlay.classList.remove('active');
    drawer.classList.remove('active');
  };

  menuBtn.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  // 3. ルート相対パスに統一して items.json を取得
  const jsonPath = '/items.json';
  const rootPath = '/';

  const iconMap = {
    film: '🎬',
    music: '🎵',
    scissors: '✂️',
    repeat: '🔄',
    image: '🖼️',
    maximize: '📐',
    shield: '🛡️',
    zap: '⚡',
    edit: '✍️',
    default: '🔧'
  };

  try {
    const res = await fetch(jsonPath);
    if (!res.ok) throw new Error('items.json fetch error');
    const tools = await res.json();

    // カテゴリごとに分類
    const categories = {
      'video-audio': { name: '動画・音声ツール', items: [] },
      'image': { name: '画像・PDFツール', items: [] },
      'text': { name: 'テキストツール', items: [] }
    };

    tools.forEach(tool => {
      if (categories[tool.category]) {
        categories[tool.category].items.push(tool);
      }
    });

    const currentPath = window.location.pathname;
    const isTopPage = currentPath === '/' || currentPath === '/index.html';

    let html = `
      <div class="drawer-group">
        <a href="${rootPath}" class="drawer-link ${isTopPage ? 'current' : ''}">
          <span class="drawer-link-icon">🏠</span>
          <span class="drawer-link-text">トップページ</span>
        </a>
      </div>
    `;

    for (const [key, group] of Object.entries(categories)) {
      if (group.items.length === 0) continue;

      html += `
        <div class="drawer-group">
          <div class="drawer-group-title">${group.name}</div>
      `;

      group.items.forEach(tool => {
        // ルート相対パス（/items/ツール名/）でリンクを生成
        const targetUrl = `/items/${tool.id}/`;
        const isCurrent = currentPath.includes(`/items/${tool.id}`);
        const icon = iconMap[tool.icon] || iconMap.default;

        html += `
          <a href="${targetUrl}" class="drawer-link ${isCurrent ? 'current' : ''}">
            <span class="drawer-link-icon">${icon}</span>
            <span class="drawer-link-text">${tool.name}</span>
          </a>
        `;
      });

      html += `</div>`;
    }

    drawerBody.innerHTML = html;

  } catch (err) {
    console.error(err);
    drawerBody.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem;">ツールの取得に失敗しました</div>';
  }
});
