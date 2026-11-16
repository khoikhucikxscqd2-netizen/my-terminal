// ==========================================
// 升级版阶段五：持久化伴读批注 & 自定义页码范围书摘引擎 (reading.js - 个性化版)
// ==========================================

const LIBRARY_KEY = 'Terminal_library';
const EXTRACTS_KEY = 'Terminal_extracts';

let currentBook = null;
let currentChunkIndex = 0;
let currentSentences = []; // 当前页切分的句子

// ==========================================
// 1. 书库管理与 TXT 导入
// ==========================================
function getLibrary() {
  return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]');
}

function saveLibrary(lib) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
  renderBookshelf();
}

function syncCurrentBookToStorage() {
  if (!currentBook) return;
  const lib = getLibrary();
  const idx = lib.findIndex(b => b.id === currentBook.id);
  if (idx !== -1) {
    currentBook.progress = currentChunkIndex;
    lib[idx] = currentBook;
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    renderBookshelf();
  }
}

function chunkText(text, maxLen = 1200) {
  const paragraphs = text.split('\n').filter(p => p.trim() !== '');
  const chunks = [];
  let currentChunk = "";
  for (let p of paragraphs) {
    if (currentChunk.length + p.length > maxLen && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = p + '\n';
    } else {
      currentChunk += p + '\n';
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function splitChunkToSentences(rawText) {
  const segments = rawText
    .replace(/\r\n/g, '\n')
    .replace(/([。！？\?\!]+”*)/g, '$1|')
    .replace(/\n+/g, '|\n|')
    .split('|')
    .filter(s => s === '\n' || s.trim().length > 0);
  return segments.map((text, idx) => ({ id: idx, text: text }));
}

function handleTxtImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) {
    alert('⚠️ 档案超过 6MB 上限，为防止浏览器内存溢出，请适当拆分后再导入。');
    event.target.value = '';
    return;
  }
  
  let baseTitle = file.name.replace(/\.txt$/i, '');
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const allChunks = chunkText(text);
    const lib = getLibrary();

    // 单册每 250 页（约 30 万字）自动分卷，兼顾流畅度与浏览器存储安全
    const PAGES_PER_VOL = 250;
    try {
      if (allChunks.length <= PAGES_PER_VOL) {
        lib.push({
          id: Date.now().toString(),
          title: baseTitle,
          chunks: allChunks,
          progress: 0,
          savedAnnotations: {}
        });
        saveLibrary(lib);
        alert(`✓ 《${baseTitle}》导入成功，共切割为 ${allChunks.length} 页。`);
      } else {
        const totalVols = Math.ceil(allChunks.length / PAGES_PER_VOL);
        for (let v = 0; v < totalVols; v++) {
          const volChunks = allChunks.slice(v * PAGES_PER_VOL, (v + 1) * PAGES_PER_VOL);
          lib.push({
            id: (Date.now() + v).toString(),
            title: `${baseTitle} (第${v + 1}卷)`,
            chunks: volChunks,
            progress: 0,
            savedAnnotations: {}
          });
        }
        saveLibrary(lib);
        alert(`✓ 《${baseTitle}》大部头导入成功！\n已自动为您拆分为 ${totalVols} 卷（共 ${allChunks.length} 页），方便分册共读。`);
      }
    } catch (err) {
      alert('✕ 浏览器本地存储空间已满，请先删除书库中已读完的旧书籍再试！');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function renderBookshelf() {
  const grid = document.getElementById('library-grid');
  if (!grid) return;
  const lib = getLibrary();
  
  if (lib.length === 0) {
    grid.innerHTML = '<p class="slot-hint" style="grid-column: 1/-1; margin-top:20px;">书库空空如也，点击下方导入 TXT 开始共读</p>';
    return;
  }

  grid.innerHTML = lib.map(book => {
    const annotatedPagesCount = book.savedAnnotations ? Object.keys(book.savedAnnotations).length : 0;
    return `
      <div class="book-card" data-id="${book.id}">
        <span class="book-title">${book.title}</span>
        <span class="book-progress">进度: ${book.progress + 1}/${book.chunks.length}页 ${annotatedPagesCount > 0 ? `(已批注${annotatedPagesCount}页)` : ''}</span>
        <button class="book-delete-btn" data-id="${book.id}">[ 删除档案 ]</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('book-delete-btn')) {
        e.stopPropagation();
        if (confirm('确认从书库中删除此书及所有本地批注？')) {
          const newLib = getLibrary().filter(b => b.id !== e.target.dataset.id);
          saveLibrary(newLib);
        }
        return;
      }
      openImmersiveReader(card.dataset.id);
    });
  });
}

// ==========================================
// 2. 沉浸式大屏阅读器逻辑
// ==========================================
function openImmersiveReader(bookId) {
  const lib = getLibrary();
  currentBook = lib.find(b => b.id === bookId);
  if (!currentBook) return;
  if (!currentBook.savedAnnotations) currentBook.savedAnnotations = {};
  
  currentChunkIndex = currentBook.progress || 0;
  document.getElementById('immersive-reader-modal').classList.remove('hidden');
  renderReaderPage();
}

function renderReaderPage() {
  document.getElementById('reader-book-title').textContent = currentBook.title;
  document.getElementById('reader-progress').textContent = `${currentChunkIndex + 1} / ${currentBook.chunks.length} 页`;
  
  document.getElementById('reading-discussion-panel').classList.remove('active');

  const rawText = currentBook.chunks[currentChunkIndex] || '（本页无内容）';
  currentSentences = splitChunkToSentences(rawText);
  
  updateReaderHTML();
}

function updateReaderHTML() {
  const contentBox = document.getElementById('reader-text-box');
  const pageAnnotations = currentBook.savedAnnotations[currentChunkIndex] || {};

  contentBox.innerHTML = currentSentences.map(s => {
    if (s.text === '\n') return '<br/><br/>';
    if (pageAnnotations[s.id]) {
      const hasReplies = pageAnnotations[s.id].replies && pageAnnotations[s.id].replies.length > 0;
      return `<span class="annotated-sentence" data-id="${s.id}" title="点击查看批注${hasReplies ? ' (含讨论记录)' : ''}">${s.text}</span>`;
    }
    return `<span>${s.text}</span>`;
  }).join('');

  contentBox.querySelectorAll('.annotated-sentence').forEach(el => {
    el.addEventListener('click', () => openDiscussionPanel(el.dataset.id));
  });
  contentBox.scrollTop = 0;
}

// ==========================================
// 3. 呼叫批注与局部讨论
// ==========================================
async function requestChunkAnnotation() {
  const cfg = getConfig();
  if (!cfg.apiKey) return alert('未配置 API 秘钥');
  
  const userName = cfg.userName || 'USER';
  const aiName = cfg.aiName || 'AI';

  const pingBtn = document.getElementById('reader-ping-btn');
  pingBtn.textContent = '⏳ 终端信号分析中...';
  pingBtn.disabled = true;

  const numberedText = currentSentences.map(s => `[${s.id}] ${s.text}`).join('');
  const prompt = `你现在是 ${aiName}。${userName} 正在阅读《${currentBook.title}》的第 ${currentChunkIndex + 1} 页。
请阅读以下带编号的文本。挑选出最让你有共鸣、想吐槽或最吸引你注意力的 3 到 6 个句子，写下你的批注（就像书页上的随笔，完全符合你的人设）。
严格以纯 JSON 数组格式返回：[{"id": 句子编号数字, "comment": "批注内容"}]

【本页正文】
${numberedText}`;

  try {
    const { messages } = buildContextPayload(prompt);
    const reply = await callTacticalAPI(messages);

    const jsonMatch = reply.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!currentBook.savedAnnotations[currentChunkIndex]) {
        currentBook.savedAnnotations[currentChunkIndex] = {};
      }
      parsed.forEach(item => {
        if (item.id !== undefined && item.comment) {
          const existingReplies = currentBook.savedAnnotations[currentChunkIndex][item.id]?.replies || [];
          currentBook.savedAnnotations[currentChunkIndex][item.id] = { 
            comment: item.comment, 
            replies: existingReplies 
          };
        }
      });
      syncCurrentBookToStorage();
      updateReaderHTML();
    }
  } catch (err) {
    alert('批注生成失败: ' + err.message);
  } finally {
    pingBtn.textContent = '⚡ 呼叫伴读批注';
    pingBtn.disabled = false;
  }
}

function openDiscussionPanel(sentenceId) {
  const id = Number(sentenceId);
  const sentence = currentSentences.find(s => s.id === id);
  const pageAnnotations = currentBook.savedAnnotations[currentChunkIndex] || {};
  const annotation = pageAnnotations[id];
  if (!sentence || !annotation) return;

  const cfg = getConfig();
  const aiName = (cfg.aiName || 'AI').toUpperCase();

  const panel = document.getElementById('reading-discussion-panel');
  panel.classList.add('active');
  panel.dataset.currentId = id;

  document.getElementById('discuss-original-text').textContent = sentence.text;
  document.getElementById('discuss-Terminal-comment').textContent = `${aiName}: ${annotation.comment}`;
  
  const historyBox = document.getElementById('discuss-history');
  historyBox.innerHTML = annotation.replies.map(r => `
    <div class="msg-bubble ${r.role === 'user' ? 'msg-user' : 'msg-ai'}" style="font-size:13px; padding:6px 10px; max-width:90%; ${r.role==='user'?'align-self:flex-end;':'align-self:flex-start;'}">
      ${r.content}
    </div>
  `).join('');
  setTimeout(() => historyBox.scrollTop = historyBox.scrollHeight, 50);
}

async function sendDiscussionReply() {
  const panel = document.getElementById('reading-discussion-panel');
  const id = panel.dataset.currentId;
  const inputEl = document.getElementById('discuss-input');
  const text = inputEl.value.trim();
  if (!text || id === undefined) return;
  inputEl.value = '';

  const pageAnnotations = currentBook.savedAnnotations[currentChunkIndex];
  const annotation = pageAnnotations[id];
  const sentence = currentSentences.find(s => s.id === Number(id));
  
  annotation.replies.push({ role: 'user', content: text });
  syncCurrentBookToStorage();
  openDiscussionPanel(id);

  const contextPrompt = `我们在共读《${currentBook.title}》。原文是：“${sentence.text}”\n你的批注是：“${annotation.comment}”\n请结合我们平时的相处与聊天语境，针对后续探讨简短回应，保持人设。`;
  const { messages: discussMessages } = buildContextPayload(contextPrompt);
  annotation.replies.forEach(r => discussMessages.push(r));

  const historyBox = document.getElementById('discuss-history');
  const aiBubble = document.createElement('div');
  aiBubble.className = 'msg-bubble msg-ai';
  aiBubble.style = 'font-size:13px; padding:6px 10px; max-width:90%; align-self:flex-start;';
  aiBubble.textContent = '...';
  historyBox.appendChild(aiBubble);
  historyBox.scrollTop = historyBox.scrollHeight;

  try {
    const reply = await callTacticalStreamAPI(discussMessages, (partial) => {
      aiBubble.textContent = partial;
      historyBox.scrollTop = historyBox.scrollHeight;
    });
    aiBubble.textContent = reply;
    annotation.replies.push({ role: 'assistant', content: reply });
    syncCurrentBookToStorage();
  } catch (err) {
    aiBubble.textContent = '[通信异常]';
  }
}

// ==========================================
// 4. 自定义页码范围做书摘 & 同步记忆池
// ==========================================
async function extractAndSaveToArchive() {
  const cfg = getConfig();
  if (!cfg.apiKey) return alert('未配置 API 秘钥');
  if (!currentBook) return;

  const userName = cfg.userName || 'USER';
  const aiName = cfg.aiName || 'AI';

  const totalPages = currentBook.chunks.length;
  const defaultRange = `1-${currentChunkIndex + 1}`;
  const rangeInput = prompt(
    `请输入要汇总做书摘的页码范围（本书共 ${totalPages} 页）：\n格式如：1-5（表示汇总第1页到第5页的所有批注与讨论），或单页如：${currentChunkIndex + 1}`,
    defaultRange
  );

  if (!rangeInput) return;

  let startPage = 1, endPage = currentChunkIndex + 1;
  if (rangeInput.includes('-')) {
    const parts = rangeInput.split('-').map(n => parseInt(n.trim(), 10));
    startPage = Math.max(1, parts[0] || 1);
    endPage = Math.min(totalPages, parts[1] || startPage);
  } else {
    const single = parseInt(rangeInput.trim(), 10);
    if (!isNaN(single)) {
      startPage = Math.max(1, Math.min(totalPages, single));
      endPage = startPage;
    }
  }

  if (startPage > endPage) {
    return alert('起始页码不能大于结束页码。');
  }

  let material = '';
  for (let p = startPage; p <= endPage; p++) {
    const pageIdx = p - 1;
    const pageAnnos = currentBook.savedAnnotations[pageIdx];
    if (!pageAnnos || Object.keys(pageAnnos).length === 0) continue;

    const pageSentences = splitChunkToSentences(currentBook.chunks[pageIdx]);
    material += `\n--- 第 ${p} 页 ---`;
    
    Object.keys(pageAnnos).forEach(sId => {
      const sObj = pageSentences.find(s => s.id === Number(sId));
      const text = sObj ? sObj.text : '';
      const anno = pageAnnos[sId];
      material += `\n原文：“${text}”\n${aiName}批注：${anno.comment}`;
      if (anno.replies && anno.replies.length > 0) {
        material += `\n二人讨论：` + anno.replies.map(r => `${r.role === 'user' ? userName : aiName}:${r.content}`).join(' | ');
      }
    });
  }

  if (!material) {
    return alert(`第 ${startPage} 页到第 ${endPage} 页之间没有任何批注记录，请先在对应页面点击【⚡ 呼叫伴读批注】。`);
  }

  const extractBtn = document.getElementById('reader-extract-btn');
  extractBtn.textContent = '沉淀中...';
  extractBtn.disabled = true;

  const pageLabel = startPage === endPage ? `第${startPage}页` : `第${startPage}-${endPage}页`;
  const promptText = `以下是我们共读《${currentBook.title}》（${pageLabel}）期间所有的批注与讨论片段：\n${material.slice(-15000)}\n\n请以 ${aiName} 的第一人称，写一段 60 到 100 字的“共读体会与总结”。自然融入你们讨论过的细节与书中的核心情节，直接输出纯文本。`;

  try {
    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt },
      { role: 'user', content: promptText }
    ]);
    
    const extracts = JSON.parse(localStorage.getItem(EXTRACTS_KEY) || '[]');
    extracts.unshift({
      bookTitle: `${currentBook.title} (${pageLabel})`,
      content: reply,
      date: new Date().toLocaleDateString('zh-CN')
    });
    localStorage.setItem(EXTRACTS_KEY, JSON.stringify(extracts));

    const pool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_POOL) || '{"diaries":[],"readingNotes":[],"mood":""}');
    pool.readingNotes.push(`[共读《${currentBook.title}》${pageLabel}] ${reply.slice(0, 110)}`);
    localStorage.setItem(STORAGE_KEYS.MEMORY_POOL, JSON.stringify(pool));
    if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();

    alert(`✓ 《${currentBook.title}》(${pageLabel}) 书摘已收录至档案库并同步至记忆池！\n\n${reply}`);
  } catch (err) {
    alert('书摘生成失败: ' + err.message);
  } finally {
    extractBtn.textContent = '📝 做书摘';
    extractBtn.disabled = false;
  }
}

function renderExtractsArchive() {
  const container = document.getElementById('extracts-list-container');
  const extracts = JSON.parse(localStorage.getItem(EXTRACTS_KEY) || '[]');
  if (extracts.length === 0) {
    container.innerHTML = '<p class="slot-hint">暂无书摘档案。</p>';
    return;
  }
  container.innerHTML = extracts.map(e => `
    <div class="extract-card">
      <h4>《${e.bookTitle}》 // ${e.date}</h4>
      <p>${e.content}</p>
    </div>
  `).join('');
}

// ==========================================
// 初始化绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderBookshelf();

  document.getElementById('trigger-import-btn').addEventListener('click', () => {
    document.getElementById('import-txt-input').click();
  });
  document.getElementById('import-txt-input').addEventListener('change', handleTxtImport);

  document.getElementById('close-reader-btn').addEventListener('click', () => {
    document.getElementById('immersive-reader-modal').classList.add('hidden');
    syncCurrentBookToStorage();
  });
  
  document.getElementById('reader-prev-btn').addEventListener('click', () => {
    if (currentChunkIndex > 0) {
      currentChunkIndex--;
      renderReaderPage();
      syncCurrentBookToStorage();
    }
  });
  document.getElementById('reader-next-btn').addEventListener('click', () => {
    if (currentChunkIndex < currentBook.chunks.length - 1) {
      currentChunkIndex++;
      renderReaderPage();
      syncCurrentBookToStorage();
    }
  });

  document.getElementById('reader-ping-btn').addEventListener('click', requestChunkAnnotation);
  document.getElementById('close-discuss-btn').addEventListener('click', () => {
    document.getElementById('reading-discussion-panel').classList.remove('active');
  });
  document.getElementById('discuss-send-btn').addEventListener('click', sendDiscussionReply);
  document.getElementById('discuss-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendDiscussionReply();
  });

  document.getElementById('reader-extract-btn').addEventListener('click', extractAndSaveToArchive);
  
  const extractsModal = document.getElementById('extracts-modal');
  document.getElementById('open-extracts-btn').addEventListener('click', () => {
    renderExtractsArchive();
    extractsModal.classList.remove('hidden');
  });
  document.getElementById('close-extracts-btn').addEventListener('click', () => {
    extractsModal.classList.add('hidden');
    // 绑定书摘 TXT 导出功能
  const exportExtractsBtn = document.getElementById('export-extracts-btn');
  if (exportExtractsBtn) {
    exportExtractsBtn.addEventListener('click', () => {
      const extracts = JSON.parse(localStorage.getItem(EXTRACTS_KEY) || '[]');
      if (extracts.length === 0) return alert('暂无书摘可导出。');
      
      let txtContent = '【终端书摘档案汇总】\n\n';
      extracts.forEach(e => {
        txtContent += `=================================\n`;
        txtContent += `来源: 《${e.bookTitle}》\n`;
        txtContent += `日期: ${e.date}\n`;
        txtContent += `---------------------------------\n`;
        txtContent += `${e.content}\n\n\n`;
      });
      
      const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Terminal_Extracts_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
      a.click();
    });
  }
  });
});