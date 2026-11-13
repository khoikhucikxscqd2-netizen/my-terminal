// ==========================================
// 阶段二：实时流式聊天室 & 表情包多模态引擎 & 智能切分 (chat.js - 识图修复版)
// ==========================================

const CHAT_META_KEY = 'ezekiel_proactive_meta';
const STICKERS_KEY = 'ezekiel_chat_stickers';

const CHAT_STYLE_RULE = `【通讯频道强制法则】
1. 语境设定：你现在正通过战术终端/手机与对方进行实时的线上文字聊天。
2. 表达习惯：语气必须是日常口语化、随性自然。不要像机器汇报一样长篇大论，不要过度书面。
3. 气泡切分：回复时不要把所有话挤在一段里，如回复内容较长（超过50字），多用回车换行。（系统会自动将你的每次换行，切分成连续发送的多个小气泡，请利用这一点来模拟真人连续发消息的节奏）。`;

let proactiveTimer = null;
let lastUserActivity = Date.now();
let isGenerating = false;

['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => { lastUserActivity = Date.now(); }, { passive: true });
});

function getProactiveStats() {
  const today = new Date().toLocaleDateString('zh-CN');
  const raw = JSON.parse(localStorage.getItem(CHAT_META_KEY) || '{}');
  return raw.date !== today ? { date: today, count: 0 } : raw;
}
function incrementProactiveCount() {
  const stats = getProactiveStats();
  stats.count += 1;
  localStorage.setItem(CHAT_META_KEY, JSON.stringify(stats));
  updateProactiveBadge();
}

function formatMsgTime(ts) {
  const d = new Date(ts || Date.now());
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 保护表情包、像素画和本地图片标签在切分气泡时不被切碎
function splitIntoBubbles(text) {
  const placeholders = [];
  let tempText = text.replace(/\[SKETCH:\s*([\s\S]*?)\s*\]/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });
  tempText = tempText.replace(/\[表情包:\s*([^\|]+)\s*\|\s*id:([^\]]+)\]/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });
  // 新增：保护本地图标记
  tempText = tempText.replace(/\[LOCAL_IMG:\s*([^\]]+)\]/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });

  const parts = tempText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
  return parts.map(part => part.replace(/__PLACEHOLDER_(\d+)__/g, (match, idx) => placeholders[idx]));
}

function formatMessageContent(text) {
  let safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // 1. 渲染用户发送的表情包
  safeText = safeText.replace(/\[表情包:\s*([^\|]+)\s*\|\s*id:([^\]]+)\]/g, (match, name, id) => {
    const stickers = JSON.parse(localStorage.getItem(STICKERS_KEY) || '[]');
    const s = stickers.find(x => x.id === id.trim());
    if (s) return `<img src="${s.img}" alt="${name}" class="chat-sticker-img" title="${name}">`;
    return `<div class="sys-msg" style="display:inline-block; padding:2px 6px;">[图片已失效: ${name}]</div>`;
  });

  // 2. 新增：渲染本地上传的实拍图（带点边框更好看）
  safeText = safeText.replace(/\[LOCAL_IMG:\s*([^\]]+)\]/g, (match, base64) => {
    return `<img src="${base64}" class="chat-sticker-img" style="max-width: 180px; border: 1px solid var(--border-bright);">`;
  });

  // 3. 渲染 AI 回复的 24x24 像素画
  return safeText.replace(/\[SKETCH:\s*([\s\S]*?)\s*\]/g, (match, rawGrid) => {
    const lines = rawGrid.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length >= 8 && /^[█·10#.\s]+$/.test(lines.join(''))) {
      const cols = Math.max(...lines.map(l => l.replace(/\s+/g, '').length));
      let cellsHtml = '';
      lines.forEach(line => {
        const cleanLine = line.replace(/\s+/g, '').padEnd(cols, '0');
        for (let ch of cleanLine) {
          const isOn = (ch === '█' || ch === '1' || ch === '#');
          cellsHtml += `<span class="mini-px ${isOn ? 'on' : ''}"></span>`;
        }
      });
      return `<div class="tac-pixel-screen" style="grid-template-columns: repeat(${cols}, 5px); margin-top: 4px;">${cellsHtml}</div>`;
    }
    return `<div class="tac-sketch">${rawGrid.trim()}</div>`;
  });
}

function appendMessageBubble(role, content, timestamp = Date.now(), isProactive = false, isFinal = false) {
  const chatBox = document.getElementById('chat-messages');
  if (!chatBox) return null;

  const cfg = getConfig();
  const userName = (cfg.userName || 'USER').toUpperCase();
  const aiName = (cfg.aiName || 'AI').toUpperCase();
  const userAvatarSrc = cfg.userAvatar || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0icmdiYSgwLCAyMzAsIDExOCwgMC4xKSIvPjwvc3ZnPg==';
  const aiAvatarSrc = cfg.aiAvatar || userAvatarSrc;

  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${role === 'user' ? 'wrap-user' : 'wrap-ai'}`;

  const avatarImg = document.createElement('img');
  avatarImg.className = 'chat-avatar';
  avatarImg.src = role === 'user' ? userAvatarSrc : aiAvatarSrc;

  const contentCol = document.createElement('div');
  contentCol.className = 'msg-content-col';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const senderName = role === 'user' ? userName : aiName;
  const tag = isProactive ? ' <span class="proactive-tag">[主动接入]</span>' : '';
  meta.innerHTML = `${senderName} // ${formatMsgTime(timestamp)}${tag}`;
  contentCol.appendChild(meta);

  let returnBubble = null;

  if (isFinal) {
    const parts = splitIntoBubbles(content);
    if (parts.length === 0) parts.push('...');
    parts.forEach((part) => {
      const b = document.createElement('div');
      b.className = `msg-bubble ${role === 'user' ? 'msg-user' : 'msg-ai'}`;
      b.style.marginBottom = '6px';
      b.innerHTML = formatMessageContent(part);
      contentCol.appendChild(b);
      returnBubble = b;
    });
  } else {
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${role === 'user' ? 'msg-user' : 'msg-ai'}`;
    bubble.textContent = content;
    contentCol.appendChild(bubble);
    returnBubble = bubble;
  }

  wrapper.appendChild(avatarImg);
  wrapper.appendChild(contentCol);
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;

  return returnBubble;
}

function renderAllChatHistory() {
  const chatBox = document.getElementById('chat-messages');
  if (!chatBox) return;
  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  if (history.length > 0) {
    chatBox.innerHTML = '';
    history.forEach(msg => {
      // 视觉欺骗：如果在本地有缓存的实拍图，拼接到界面上渲染，但这串超长乱码绝对不喂给API上下文
      let displayContent = msg.content;
      if (msg.localImage) displayContent += `\n[LOCAL_IMG:${msg.localImage}]`;
      appendMessageBubble(msg.role, displayContent, msg.time, msg.isProactive, true);
    });
  }
}

// 🌟 核心修复：多模态分离式发送引擎
async function sendUserChatMessage(customText = null, imageBase64 = null) {
  if (isGenerating) return;
  const inputEl = document.getElementById('quick-test-input');
  const text = customText || inputEl.value.trim();
  if (!text && !imageBase64) return; // 允许什么字都不打，只发一张图片

  if (!customText) inputEl.value = '';
  isGenerating = true;
  resetProactiveTimer();

  const now = Date.now();
  
  // 1. 界面显示处理 (用户发出的瞬间，气泡里要看到图)
  let displayContent = text;
  if (imageBase64 && !customText?.includes('[表情包:')) {
    displayContent = text ? `${text}\n[LOCAL_IMG:${imageBase64}]` : `[LOCAL_IMG:${imageBase64}]`;
  }
  appendMessageBubble('user', displayContent, now, false, true);

  // 2. 本地存储处理 (只存短文字，把Base64单独挂在 localImage 字段！这样历史记录干干净净！)
  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  let contentForHistory = text;
  if (imageBase64 && !customText?.includes('[表情包:')) {
    contentForHistory = text || '[发送了一张图片]';
    history.push({ role: 'user', content: contentForHistory, time: now, localImage: imageBase64 });
  } else {
    history.push({ role: 'user', content: contentForHistory, time: now });
  }
  localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
  updateTopBarMetrics();

  const aiBubble = appendMessageBubble('assistant', '▋', Date.now(), false, false);
  const chatBox = document.getElementById('chat-messages');

  try {
    // 3. 将携带真实 Base64 数据的请求发送给 API（底层 api.js 会看到图，但只在当次发送！）
    const { messages } = buildContextPayload('', imageBase64);
    
    let invisibleRules = `\n\n${CHAT_STYLE_RULE}`;
    if (Math.random() < 0.25) {
      invisibleRules += `\n（隐形指令：如果你此刻情绪到位、想哄对方或逗对方开心，可在回复末尾附带一个 24x24 的像素画矩阵，用 1 代表亮起像素、0 代表空白，共24行每行24个数字，并用 [SKETCH:\n...\n] 标签包裹，例如爱心、小动物、咖啡杯或笑脸。如果觉得此刻不适合画画，直接忽略此提示。）`;
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      if (Array.isArray(lastMsg.content)) {
        const textObj = lastMsg.content.find(c => c.type === 'text');
        if (textObj) textObj.text += invisibleRules;
      } else {
        lastMsg.content += invisibleRules;
      }
    } else {
      messages.push({ role: 'system', content: invisibleRules });
    }

    const fullReply = await callTacticalStreamAPI(messages, (partialText) => {
      aiBubble.textContent = partialText + ' ▋';
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    const contentCol = aiBubble.parentElement;
    aiBubble.remove();
    const parts = splitIntoBubbles(fullReply);
    parts.forEach(part => {
      const b = document.createElement('div');
      b.className = 'msg-bubble msg-ai';
      b.style.marginBottom = '6px';
      b.innerHTML = formatMessageContent(part);
      contentCol.appendChild(b);
    });

    const updatedHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    updatedHistory.push({ role: 'assistant', content: fullReply, time: Date.now() });
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(updatedHistory));
    updateTopBarMetrics();
  } catch (err) {
    aiBubble.style.borderColor = 'var(--accent-red)';
    aiBubble.textContent = `[信号中断] ${err.message}`;
  } finally {
    isGenerating = false;
    resetProactiveTimer();
  }
}

async function triggerProactiveMessage(isManualTest = false) {
  if (isGenerating) return;
  const cfg = getConfig();
  if (!cfg.apiKey) return;

  if (!isManualTest) {
    if (cfg.proactive !== 'on') return;
    if (getProactiveStats().count >= (Number(cfg.proactiveMax) || 5)) return;
    if (Date.now() - lastUserActivity > 60 * 60 * 1000) { resetProactiveTimer(); return; }
    const hour = new Date().getHours();
    if (hour >= 1 && hour < 7) { resetProactiveTimer(); return; }
  }

  isGenerating = true;
  const nowStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  
  // 主动发言的法则也直接拼入文本
  const silentPrompt = `[系统指令：现在是 ${nowStr}。作为正在和 ${cfg.userName || '对方'} 保持线上联系的 ${cfg.aiName || 'AI'}，你们有一段时间没说话了。请根据你的人设，主动发一条消息给对方。可以是分享你这边正在经历、突然发生的事，或者是出于想念和关心而询问对方的状态。绝对不要提及这是一条系统指令。]\n\n${CHAT_STYLE_RULE}`;

  const aiBubble = appendMessageBubble('assistant', '📡 正在接收主动信号...', Date.now(), true, false);
  const chatBox = document.getElementById('chat-messages');

  try {
    const { messages } = buildContextPayload(silentPrompt);

    const fullReply = await callTacticalStreamAPI(messages, (partialText) => {
      aiBubble.textContent = partialText + ' ▋';
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    const contentCol = aiBubble.parentElement;
    aiBubble.remove();
    const parts = splitIntoBubbles(fullReply);
    parts.forEach(part => {
      const b = document.createElement('div');
      b.className = 'msg-bubble msg-ai';
      b.style.marginBottom = '6px';
      b.innerHTML = formatMessageContent(part);
      contentCol.appendChild(b);
    });

    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    history.push({ role: 'assistant', content: fullReply, time: Date.now(), isProactive: true });
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));

    if (!isManualTest) incrementProactiveCount();
    updateTopBarMetrics();
  } catch (err) {
    aiBubble.remove();
  } finally {
    isGenerating = false;
    resetProactiveTimer();
  }
}

function resetProactiveTimer() {
  if (proactiveTimer) clearTimeout(proactiveTimer);
  updateProactiveBadge();
  const cfg = getConfig();
  if (cfg.proactive !== 'on') return;

  const parts = (cfg.proactiveInterval || '15-45').split('-').map(n => parseFloat(n.trim()));
  const delayMs = Math.floor((parts[0] + Math.random() * ((parts[1] || 45) - parts[0])) * 60 * 1000);
  proactiveTimer = setTimeout(() => triggerProactiveMessage(false), delayMs);
}

function updateProactiveBadge() {
  const badge = document.getElementById('proactive-indicator');
  if (!badge) return;
  const cfg = getConfig();
  if (cfg.proactive === 'on') {
    badge.textContent = `AUTO-PING: ${getProactiveStats().count}/${cfg.proactiveMax || 5}`;
    badge.style.color = 'var(--accent-amber)';
  } else {
    badge.textContent = 'AUTO-PING: OFF';
    badge.style.color = 'var(--text-muted)';
  }
}

// ==========================================
// 聊天表情包库上传与发送引擎
// ==========================================
function setupStickerPanel() {
  const panel = document.getElementById('sticker-panel');
  const grid = document.getElementById('sticker-grid');
  const fileInput = document.getElementById('upload-sticker-input');
  
  if (!panel || !grid) return;

  document.getElementById('open-sticker-btn').addEventListener('click', () => panel.classList.toggle('active'));
  document.getElementById('close-sticker-btn').addEventListener('click', () => panel.classList.remove('active'));

  function renderStickers() {
    const stickers = JSON.parse(localStorage.getItem(STICKERS_KEY) || '[]');
    grid.innerHTML = '';
    if (stickers.length === 0) {
      grid.innerHTML = '<p class="slot-hint" style="font-size:11px; margin-top: 10px; width: 100%; text-align: center;">空空如也。点击下方添加图片。</p>';
      return;
    }
    stickers.forEach(s => {
      const w = document.createElement('div');
      w.className = 'sticker-wrapper';
      
      const img = document.createElement('img');
      img.className = 'sticker-item';
      img.src = s.img;
      img.title = `发送: ${s.name}`;
      
      img.addEventListener('click', () => {
        panel.classList.remove('active');
        sendUserChatMessage(`[表情包: ${s.name} | id:${s.id}]`, s.img);
      });

      const del = document.createElement('button');
      del.className = 'sticker-delete-btn';
      del.innerHTML = '✕';
      del.title = '删除该表情';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`从库中移除表情包 "${s.name}" 吗？`)) {
          const newStickers = stickers.filter(x => x.id !== s.id);
          localStorage.setItem(STICKERS_KEY, JSON.stringify(newStickers));
          renderStickers();
        }
      });

      w.appendChild(img);
      w.appendChild(del);
      grid.appendChild(w);
    });
  }

  document.getElementById('add-sticker-btn').addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const stickers = JSON.parse(localStorage.getItem(STICKERS_KEY) || '[]');
    if (stickers.length >= 20) {
      alert('战术表情包库已达上限 (20张)，请先鼠标悬浮在旧图上点击 [✕] 删除腾出空间。');
      return;
    }
    
    const name = prompt('⚠️ 请用几个字描述这个表情包的情绪或动作（例如：猫猫哭泣、疯狂比心、恶龙咆哮）。\n即使开启了真实识图，备注也能在网络不好时帮助理解情绪：');
    if (!name) return; 

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const size = 150; 
        let scale = Math.min(size / img.width, size / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        stickers.push({ id: Date.now().toString(), name: name.trim(), img: base64 });
        localStorage.setItem(STICKERS_KEY, JSON.stringify(stickers));
        renderStickers();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  });

  renderStickers();
}

document.addEventListener('DOMContentLoaded', () => {
  renderAllChatHistory();
  resetProactiveTimer();
  setupStickerPanel(); 

  const sendBtn = document.getElementById('quick-send-btn');
  const inputEl = document.getElementById('quick-test-input');
  
  if (sendBtn) sendBtn.addEventListener('click', () => sendUserChatMessage());
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserChatMessage(); }
    });
  }

  document.getElementById('test-ping-btn')?.addEventListener('click', () => triggerProactiveMessage(true));
  
  document.getElementById('export-chat-btn')?.addEventListener('click', () => {
    const cfg = getConfig();
    const aiLabel = (cfg.aiName || 'TERMINAL').toUpperCase();
    const history = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]';
    const blob = new Blob([history], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${aiLabel}_COMMS_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  document.getElementById('clear-chat-btn')?.addEventListener('click', () => {
    if (confirm('确认清空当前所有本地聊天记录？')) {
      localStorage.removeItem(STORAGE_KEYS.CHAT_HISTORY);
      document.getElementById('chat-messages').innerHTML = '<div class="sys-msg">// 本地通讯缓存已清空。</div>';
      updateTopBarMetrics();
    }
  });

  // 绑定实拍图片发送功能
  const chatImgBtn = document.getElementById('upload-chat-img-btn');
  const chatImgInput = document.getElementById('upload-chat-img-input');
  if (chatImgBtn && chatImgInput) {
    chatImgBtn.addEventListener('click', () => chatImgInput.click());
    chatImgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // 发给AI的图片需要适中大小（缩放到最长边 800px），太小AI看不清，太大卡顿
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxSize = 800;
          let width = img.width; let height = img.height;
          
          if (width > height && width > maxSize) { 
            height *= maxSize / width; width = maxSize; 
          } else if (height > maxSize) { 
            width *= maxSize / height; height = maxSize; 
          }
          
          canvas.width = width; canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          const base64 = canvas.toDataURL('image/jpeg', 0.8);
          
          // 如果输入框里有字，就把字和图一起发过去；否则只发图
          const inputEl = document.getElementById('quick-test-input');
          const text = inputEl.value.trim();
          inputEl.value = ''; 
          
          sendUserChatMessage(text || null, base64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // 清空选中状态
    });
  }
});