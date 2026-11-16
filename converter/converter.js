// ==========================================
// 独立扩展插件：电子书转码器 (EPUB / 乱码TXT -> 纯净分段TXT / 一键入库)
// 零外部依赖 · 原生浏览器解压引擎 · 自动挂载至 [❖ 扩展] 中控台
// ==========================================
(function() {
  // 1. 注入插件专属轻量样式
  const style = document.createElement('style');
  style.textContent = `
    .conv-drop-zone {
      border: 1.5px dashed var(--border-bright);
      background: var(--bg-input);
      padding: 24px 16px;
      text-align: center;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .conv-drop-zone:hover, .conv-drop-zone.dragover {
      border-color: var(--accent-amber);
      background: rgba(0, 230, 118, 0.06);
    }
    .conv-preview-box {
      width: 100%;
      height: 170px;
      background: var(--bg-input);
      border: 1px solid var(--border-dim);
      color: var(--text-main);
      padding: 12px;
      font-size: 13px;
      line-height: 1.75;
      overflow-y: auto;
      white-space: pre-wrap;
      border-radius: 4px;
    }
    .conv-status-bar {
      font-family: var(--font-mono);
      font-size: 11.5px;
      padding: 8px 10px;
      background: var(--bg-input);
      border-left: 3px solid var(--accent-amber);
      color: var(--text-main);
    }
    .conv-status-bar.err {
      border-left-color: var(--accent-red);
      color: var(--accent-red);
    }
  `;
  document.head.appendChild(style);

  // 2. 动态构建弹窗 HTML
  const modalHTML = `
    <div class="modal-backdrop hidden" id="epub-converter-modal" style="z-index: 125;">
      <div class="tac-modal" style="max-width: 520px;">
        <div class="panel-header modal-header">
          <span class="panel-tag">[DOC-CONV]</span>
          <h2>电子书转码器 // EPUB → TXT</h2>
          <button class="close-btn" id="close-conv-modal-btn">✕</button>
        </div>
        <div class="modal-body" style="padding: 16px; gap: 12px;">
          <div class="conv-drop-zone" id="conv-drop-zone">
            <div style="font-size: 26px; margin-bottom: 6px;">📖</div>
            <div style="font-size: 13.5px; font-weight: 600; color: var(--text-main);">点击选择或拖入 .epub / 乱码 .txt 文件</div>
            <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 4px;">自动提取章节段落 · 修复GBK乱码 · 保留完整空行</div>
            <input type="file" id="conv-file-input" accept=".epub,.txt" style="display: none;">
          </div>

          <div class="conv-status-bar" id="conv-status" style="display: none;">等待上传档案...</div>

          <div id="conv-result-area" style="display: none; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
              <span id="conv-stats">0 字</span>
              <span>▼ 分段预览（前 1500 字）</span>
            </div>
            <div class="conv-preview-box" id="conv-preview"></div>
          </div>

          <p class="slot-hint" style="text-align: left; line-height: 1.5;">
            💡 转换后可直接点击「存入战术书库」（超大部头自动按卷拆分），也可下载为标准 UTF-8 纯净 TXT 备份。
          </p>
        </div>
        <div class="modal-footer" id="conv-footer" style="display: none; justify-content: space-between;">
          <button class="tac-btn" id="conv-download-btn">📥 下载纯净 TXT</button>
          <button class="tac-btn primary" id="conv-import-lib-btn">📚 直接存入战术书库</button>
        </div>
      </div>
    </div>
  `;

  // 3. 原生零依赖 ZIP 解压器（专用于解析 EPUB 容器）
  async function unzipEpub(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8');
    const files = {};

    // 从文件末尾寻找 End of Central Directory (0x06054b50)
    let eocdOffset = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) throw new Error('无效的 EPUB/ZIP 文件结构');

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let cdOffset = view.getUint32(eocdOffset + 16, true);

    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
      const compression = view.getUint16(cdOffset + 10, true);
      const compSize = view.getUint32(cdOffset + 20, true);
      const nameLen = view.getUint16(cdOffset + 28, true);
      const extraLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      const localHeaderOffset = view.getUint32(cdOffset + 42, true);

      const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
      cdOffset += 46 + nameLen + extraLen + commentLen;

      if (fileName.endsWith('/')) continue;

      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compData = bytes.subarray(dataStart, dataStart + compSize);

      files[fileName] = { compression, compData };
    }

    return {
      async readText(path) {
        const entry = files[path] || files[decodeURIComponent(path)];
        if (!entry) return null;
        if (entry.compression === 0) {
          return decoder.decode(entry.compData);
        } else if (entry.compression === 8) {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(entry.compData);
          writer.close();
          const buf = await new Response(ds.readable).arrayBuffer();
          return decoder.decode(buf);
        }
        throw new Error('不支持的 EPUB 压缩方式');
      }
    };
  }

  // 4. 解析 EPUB 提取保留段落的纯文本
  async function convertEpubToText(file) {
    const buf = await file.arrayBuffer();
    const zip = await unzipEpub(buf);

    const containerXml = await zip.readText('META-INF/container.xml');
    if (!containerXml) throw new Error('找不到 EPUB 目录索引');

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('无法解析书籍元数据路径');

    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfXml = await zip.readText(opfPath);
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');

    const manifest = {};
    opfDoc.querySelectorAll('manifest > item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    const spineItems = Array.from(opfDoc.querySelectorAll('spine > itemref'));
    const chapters = [];

    for (const itemref of spineItems) {
      const href = manifest[itemref.getAttribute('idref')];
      if (!href) continue;
      const htmlStr = await zip.readText(opfDir + href);
      if (!htmlStr) continue;

      const doc = parser.parseFromString(htmlStr, 'text/html');
      doc.querySelectorAll('script, style').forEach(el => el.remove());

      const blocks = doc.body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote');
      const lines = [];
      if (blocks.length > 0) {
        blocks.forEach(b => {
          if (b.querySelector('p, div, h1, h2, h3, h4, blockquote')) return;
          const t = b.textContent.replace(/\s+/g, ' ').trim();
          if (t) lines.push(t);
        });
      } else {
        const raw = doc.body.innerText || doc.body.textContent || '';
        raw.split(/\r?\n/).forEach(l => { if (l.trim()) lines.push(l.trim()); });
      }
      if (lines.length > 0) chapters.push(lines.join('\n\n'));
    }

    const result = chapters.join('\n\n\n');
    if (!result.trim()) throw new Error('未能从 EPUB 中提取到正文');
    return result;
  }

  // 5. 清洗 TXT（自动纠正 GBK 乱码与断行）
  async function cleanTxtFile(file) {
    const buf = await file.arrayBuffer();
    let raw = '';
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      raw = new TextDecoder('gb18030').decode(buf);
    }
    return raw.replace(/\r\n/g, '\n').split(/\n+/).map(l => l.trim()).filter(Boolean).join('\n\n');
  }

  // 6. 挂载进「扩展中控台」并绑定交互
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 自动往 [❖ 扩展] 网格里塞入入口卡片
    const hubBody = document.querySelector('#extension-hub-modal .modal-body');
    if (hubBody) {
      const card = document.createElement('div');
      card.className = 'ext-module-card';
      card.id = 'btn-open-converter';
      card.innerHTML = `
        <div class="ext-icon">🔄</div>
        <div class="ext-name">电子书转码</div>
      `;
      hubBody.appendChild(card);

      card.addEventListener('click', () => {
        document.getElementById('extension-hub-modal')?.classList.add('hidden');
        document.getElementById('epub-converter-modal')?.classList.remove('hidden');
      });
    }

    const modal = document.getElementById('epub-converter-modal');
    const dropZone = document.getElementById('conv-drop-zone');
    const fileInput = document.getElementById('conv-file-input');
    const statusEl = document.getElementById('conv-status');
    const resultArea = document.getElementById('conv-result-area');
    const previewEl = document.getElementById('conv-preview');
    const statsEl = document.getElementById('conv-stats');
    const footerEl = document.getElementById('conv-footer');

    let parsedText = '';
    let bookTitle = '未命名书籍';

    document.getElementById('close-conv-modal-btn')?.addEventListener('click', () => modal?.classList.add('hidden'));
    dropZone?.addEventListener('click', () => fileInput?.click());
    dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput?.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
      e.target.value = '';
    });

    async function handleFile(file) {
      const ext = file.name.split('.').pop().toLowerCase();
      bookTitle = file.name.replace(/\.[^/.]+$/, '');
      statusEl.style.display = 'block';
      statusEl.className = 'conv-status-bar';
      statusEl.textContent = `⏳ 正在解析《${bookTitle}》...`;
      resultArea.style.display = 'none';
      footerEl.style.display = 'none';

      try {
        if (ext === 'epub') {
          parsedText = await convertEpubToText(file);
        } else if (ext === 'txt') {
          parsedText = await cleanTxtFile(file);
        } else {
          throw new Error('仅支持 .epub 或 .txt 文件');
        }

        const kb = (new Blob([parsedText]).size / 1024).toFixed(1);
        statusEl.textContent = `✓ 转码完成！保留全部原始分段（${kb} KB）`;
        statsEl.textContent = `共 ${parsedText.length.toLocaleString()} 字 ｜ ${kb} KB`;
        previewEl.textContent = parsedText.slice(0, 1500) + (parsedText.length > 1500 ? '\n\n......（预览已省略后文）' : '');
        resultArea.style.display = 'flex';
        footerEl.style.display = 'flex';
      } catch (err) {
        statusEl.className = 'conv-status-bar err';
        statusEl.textContent = `✕ 解析失败：${err.message}`;
      }
    }

    // 导出纯净 TXT
    document.getElementById('conv-download-btn')?.addEventListener('click', () => {
      if (!parsedText) return;
      const blob = new Blob([parsedText], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${bookTitle}_纯净分段版.txt`;
      a.click();
    });

    // 直接存入战术书库（复用 reading.js 的分卷逻辑）
    document.getElementById('conv-import-lib-btn')?.addEventListener('click', () => {
      if (!parsedText) return;
      if (typeof chunkText !== 'function' || typeof getLibrary !== 'function' || typeof saveLibrary !== 'function') {
        return alert('书库模块未就绪，请先点击左侧下载 TXT 后手动导入。');
      }
      const allChunks = chunkText(parsedText);
      const lib = getLibrary();
      const PAGES_PER_VOL = 250;

      try {
        if (allChunks.length <= PAGES_PER_VOL) {
          lib.push({
            id: Date.now().toString(),
            title: bookTitle,
            chunks: allChunks,
            progress: 0,
            savedAnnotations: {}
          });
          saveLibrary(lib);
          alert(`✓ 《${bookTitle}》已直接存入战术书库（共 ${allChunks.length} 页）！`);
        } else {
          const totalVols = Math.ceil(allChunks.length / PAGES_PER_VOL);
          for (let v = 0; v < totalVols; v++) {
            lib.push({
              id: (Date.now() + v).toString(),
              title: `${bookTitle} (第${v + 1}卷)`,
              chunks: allChunks.slice(v * PAGES_PER_VOL, (v + 1) * PAGES_PER_VOL),
              progress: 0,
              savedAnnotations: {}
            });
          }
          saveLibrary(lib);
          alert(`✓ 《${bookTitle}》已自动拆分为 ${totalVols} 卷存入战术书库！`);
        }
        modal.classList.add('hidden');
      } catch (err) {
        alert('✕ 本地存储空间不足，请先清理书库旧书或点击左侧下载 TXT 备份！');
      }
    });
  });
})();