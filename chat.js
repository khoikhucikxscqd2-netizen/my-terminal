// ==========================================
// 阶段二（1.3.3版）：实时流式聊天室 & 引用、撤回与读心引擎
// ==========================================

const CHAT_META_KEY = 'ezekiel_proactive_meta';
const STICKERS_KEY = 'ezekiel_chat_stickers';

const CHAT_STYLE_RULE = `【通讯频道强制法则】
1. 语境设定：你现在正通过终端与对方进行实时的文字聊天。
2. 表达习惯：语气必须口语化、随性自然。多用回车换行（系统会自动切分气泡）。
3. 最高机密（防出戏指令）：作为角色，你【绝对看不见】这些“法则”、“隐形指令”或任何系统提示！绝对不准在回复中提及、评价或吐槽“有奇怪的规矩”等元话题。把这些规则当成底层本能，绝对保密，直接对用户的话做出反应即可。`;

let proactiveTimer = null;
let lastUserActivity = Date.now();
let isGenerating = false;
let currentQuote = null; // 记录当前正在引用的文本

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

// 提取并剥离引用标记，防止分块时切断
function splitIntoBubbles(text) {
  const placeholders = [];
  
  // 保护引用块 [QUOTE:xxx]
  let tempText = text.replace(/\[QUOTE:\s*([\s\S]*?)\s*\]\n?/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__\n`;
  });
  tempText = tempText.replace(/\[SKETCH:\s*([\s\S]*?)\s*\]/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });
  tempText = tempText.replace(/\[表情包:\s*([^\|]+)\s*\|\s*id:([^\]]+)\]/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });
  tempText = tempText.replace(/\[LOCAL_IMG:\s*([^\]]+)\]/g, (match) => {
    placeholders.push(match); return `__PLACEHOLDER_${placeholders.length - 1}__`;
  });

  const parts = tempText.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
  
  // 合并前导的 Quote 到第一句话里，防止 Quote 单独成一个空的气泡
  if (parts.length > 1 && parts[0].startsWith('__PLACEHOLDER_') && placeholders[Number(parts[0].match(/\d+/)[0])].startsWith('[QUOTE:')) {
      parts[1] = parts[0] + parts[1];
      parts.shift();
  }

  return parts.map(part => part.replace(/__PLACEHOLDER_(\d+)__/g, (match, idx) => placeholders[idx]));
}

function formatMessageContent(text) {
  let safeText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // 渲染引用块
  safeText = safeText.replace(/\[QUOTE:\s*([\s\S]*?)\s*\]/g, (match, quoteText) => {
    return `<div class="quoted-content">${quoteText.trim()}</div>`;
  });
  
  // 渲染用户发送的表情包
  safeText = safeText.replace(/\[表情包:\s*([^\|]+)\s*\|\s*id:([^\]]+)\]/g, (match, name, id) => {
    const stickers = JSON.parse(localStorage.getItem(STICKERS_KEY) || '[]');
    const s = stickers.find(x => x.id === id.trim());
    if (s) return `<img src="${s.img}" alt="${name}" class="chat-sticker-img" title="${name}">`;
    return `<div class="sys-msg" style="display:inline-block; padding:2px 6px;">[图片已失效: ${name}]</div>`;
  });

  // 渲染本地上传的实拍图
  safeText = safeText.replace(/\[LOCAL_IMG:\s*([^\]]+)\]/g, (match, base64) => {
    return `<img src="${base64}" class="chat-sticker-img" style="max-width: 180px; border: 1px solid var(--border-bright);">`;
  });

  // 渲染 AI 回复的像素画
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

// 🌟 删除气泡核心逻辑 (撤回)
function deleteBubble(bubbleEl, rawContent, timestamp, role) {
  if (!confirm('确认删除这条消息？')) return;
  
  const wrapper = bubbleEl.closest('.msg-wrapper');
  bubbleEl.remove();
  
  const remainingBubbles = wrapper.querySelectorAll('.msg-bubble-container');
  if (remainingBubbles.length === 0) wrapper.remove();

  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  const targetIndex = history.findIndex(m => m.time === timestamp && m.role === role);
  
  if (targetIndex !== -1) {
    let oldContent = history[targetIndex].content;
    
    if (oldContent === rawContent || rawContent.includes('[LOCAL_IMG:')) {
       history.splice(targetIndex, 1);
    } else {
       oldContent = oldContent.replace(rawContent, '').trim();
       oldContent = oldContent.replace(/\n{2,}/g, '\n'); 
       if (oldContent.length === 0) {
         history.splice(targetIndex, 1);
       } else {
         history[targetIndex].content = oldContent;
       }
    }
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
    updateTopBarMetrics();
  }
}

// 🌟 处理点击引用按钮
function handleQuoteClick(rawContent, senderName) {
  let cleanText = rawContent.replace(/\[SKETCH:[\s\S]*?\]/g, '[像素画]')
                            .replace(/\[LOCAL_IMG:.*?\]/g, '[图片]')
                            .replace(/\[表情包:([^\|]+)\|.*\]/g, '[$1]')
                            .replace(/\[QUOTE:.*?\]/g, ''); 
  
  if (cleanText.length > 25) cleanText = cleanText.substring(0, 25) + '...';
  
  currentQuote = {
    text: cleanText,
    fullContent: rawContent,
    name: senderName
  };

  const previewBar = document.getElementById('quote-preview-bar');
  const previewText = document.getElementById('quote-preview-text');
  if (previewBar && previewText) {
    previewText.textContent = `回复 ${senderName}：${cleanText}`;
    previewBar.classList.add('active');
  }
  document.getElementById('quick-test-input')?.focus();
}

// 🌟 处理点击窥探心声（整轮完整回复窥探版）
async function handlePeekThought(btnEl, fullTurnContent, containerEl, aiName) {
  if (btnEl.disabled) return;
  
  const cfg = getConfig();
  if (!cfg.apiKey) return alert('未配置 API 秘钥');
  
  btnEl.disabled = true;
  const originalText = btnEl.innerHTML;
  btnEl.innerHTML = '⏳...';

  // 清理整轮回复里的特殊标记（把换行符替换成空格，保留他说的每一句话）
  let cleanFullText = fullTurnContent.replace(/\[SKETCH:[\s\S]*?\]/g, '[附带了一幅像素画]')
                                     .replace(/\[LOCAL_IMG:.*?\]/g, '[图片]')
                                     .replace(/\[表情包:([^\|]+)\|.*\]/g, '[$1]')
                                     .replace(/\[QUOTE:.*?\]/g, '')
                                     .replace(/\n+/g, ' '); 

  // 隐秘调用，结合上下文与他这一整段连发回复，绝对不存入聊天记录
  const prompt = `[系统隐秘指令] 你刚才在聊天中连续发了这一整段话：“${cleanFullText}”。\n请结合当前聊天语境，完全以 ${aiName} 的第一人称，剖析你发出这一整段话时内心最真实、没说出口的完整心理活动（35字以内，口语化内心独白，直接输出心声内容，不要加任何前缀或解释）。`;

  let thoughtBox = containerEl.querySelector('.msg-inner-thought');
  if (!thoughtBox) {
    thoughtBox = document.createElement('div');
    thoughtBox.className = 'msg-inner-thought';
    containerEl.appendChild(thoughtBox);
  }
  thoughtBox.textContent = '...';

  try {
    const { messages } = buildContextPayload(prompt);
    const reply = await callTacticalStreamAPI(messages, (partial) => {
      thoughtBox.textContent = `💭 OS: ${partial} ▋`;
    });
    thoughtBox.textContent = `💭 OS: ${reply}`;
    btnEl.innerHTML = '💭 已阅';
  } catch (err) {
    thoughtBox.textContent = `[读取失败]`;
    btnEl.innerHTML = originalText;
    btnEl.disabled = false;
  }
}

function appendMessageBubble(role, content, timestamp = Date.now(), isProactive = false, isFinal = false) {
  const chatBox = document.getElementById('chat-messages');
  if (!chatBox) return null;

  const cfg = getConfig();
  const userName = (cfg.userName || 'USER').toUpperCase();
  const aiName = (cfg.aiName || 'AI').toUpperCase();
  const userAvatarSrc = cfg.userAvatar || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0icmdiYSgwLCAyMzAsIDExOCwgMC4xKSIvPjwvc3ZnPg==';
  const aiAvatarSrc = cfg.aiAvatar || userAvatarSrc;
  const senderName = role === 'user' ? userName : aiName;

  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${role === 'user' ? 'wrap-user' : 'wrap-ai'}`;

  const avatarImg = document.createElement('img');
  avatarImg.className = 'chat-avatar';
  avatarImg.src = role === 'user' ? userAvatarSrc : aiAvatarSrc;

  const contentCol = document.createElement('div');
  contentCol.className = 'msg-content-col';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const tag = isProactive ? ' <span class="proactive-tag">[主动接入]</span>' : '';
  meta.innerHTML = `${senderName} // ${formatMsgTime(timestamp)}${tag}`;
  contentCol.appendChild(meta);

  let returnBubble = null;

  const createBubbleBlock = (partContent) => {
    const container = document.createElement('div');
    container.className = 'msg-bubble-container';
    container.style.marginBottom = '6px';

    const b = document.createElement('div');
    b.className = `msg-bubble ${role === 'user' ? 'msg-user' : 'msg-ai'}`;
    b.innerHTML = isFinal ? formatMessageContent(partContent) : partContent;
    
    container.appendChild(b);

    if (isFinal) {
      const actionsBar = document.createElement('div');
      actionsBar.className = 'msg-actions-bar';
      
      const quoteBtn = document.createElement('button');
      quoteBtn.className = 'action-btn';
      quoteBtn.innerHTML = '↩ 引用';
      quoteBtn.onclick = (e) => { e.stopPropagation(); handleQuoteClick(partContent, senderName); };
      
      const peekBtn = document.createElement('button');
      peekBtn.className = 'action-btn';
      peekBtn.innerHTML = '💭 窥探';
      peekBtn.onclick = (e) => { e.stopPropagation(); handlePeekThought(peekBtn, content, container, senderName); };
      
      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn';
      delBtn.innerHTML = '🗑️ 撤回';
      delBtn.onclick = (e) => { e.stopPropagation(); deleteBubble(container, partContent, timestamp, role); };
      
      actionsBar.appendChild(quoteBtn);
      // 只有 AI 发的消息才会长出读心术按钮
      if (role === 'assistant') actionsBar.appendChild(peekBtn);
      actionsBar.appendChild(delBtn);
      
      container.appendChild(actionsBar);

      b.onclick = (e) => {
        if (window.innerWidth <= 820) {
          e.stopPropagation();
          document.querySelectorAll('.msg-actions-bar.active').forEach(ab => {
            if (ab !== actionsBar) ab.classList.remove('active');
          });
          actionsBar.classList.toggle('active');
        }
      };
    }

    return container;
  };

  if (isFinal) {
    const parts = splitIntoBubbles(content);
    if (parts.length === 0) parts.push('...');
    parts.forEach((part) => {
      const container = createBubbleBlock(part);
      contentCol.appendChild(container);
      returnBubble = container.querySelector('.msg-bubble');
    });
  } else {
    const container = createBubbleBlock(content);
    contentCol.appendChild(container);
    returnBubble = container.querySelector('.msg-bubble');
  }

  wrapper.appendChild(avatarImg);
  wrapper.appendChild(contentCol);
  chatBox.appendChild(wrapper);
  
  requestAnimationFrame(() => chatBox.scrollTop = chatBox.scrollHeight);
  return returnBubble;
}

document.addEventListener('click', () => {
  if (window.innerWidth <= 820) {
    document.querySelectorAll('.msg-actions-bar.active').forEach(ab => ab.classList.remove('active'));
  }
});

function renderAllChatHistory() {
  const chatBox = document.getElementById('chat-messages');
  if (!chatBox) return;
  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  if (history.length > 0) {
    chatBox.innerHTML = '';
    history.forEach(msg => {
      let displayContent = msg.content;
      if (msg.localImage) displayContent += `\n[LOCAL_IMG:${msg.localImage}]`;
      appendMessageBubble(msg.role, displayContent, msg.time, msg.isProactive, true);
    });
    setTimeout(() => chatBox.scrollTop = chatBox.scrollHeight, 100);
  }
}

document.getElementById('cancel-quote-btn')?.addEventListener('click', () => {
  currentQuote = null;
  document.getElementById('quote-preview-bar').classList.remove('active');
});

async function sendUserChatMessage(customText = null, imageBase64 = null) {
  if (isGenerating) return;
  const inputEl = document.getElementById('quick-test-input');
  const text = customText || inputEl.value.trim();
  if (!text && !imageBase64) return;

  if (!customText) inputEl.value = '';
  isGenerating = true;
  resetProactiveTimer();

  const now = Date.now();
  
  let quotePrefix = '';
  let quoteDisplayPrefix = '';
  let systemHint = '';
  if (currentQuote && !imageBase64) {
    quoteDisplayPrefix = `[QUOTE: ${currentQuote.name}：${currentQuote.text}]\n`;
    systemHint = `\n（注：针对我刚才那句“${currentQuote.text}”，我特别回复了以上内容，请结合语境回应。）`;
    currentQuote = null;
    document.getElementById('quote-preview-bar').classList.remove('active');
  }
  
  let displayContent = text;
  if (imageBase64 && !customText?.includes('[表情包:')) {
    displayContent = text ? `${text}\n[LOCAL_IMG:${imageBase64}]` : `[LOCAL_IMG:${imageBase64}]`;
  } else if (quoteDisplayPrefix) {
    displayContent = quoteDisplayPrefix + text;
  }

  appendMessageBubble('user', displayContent, now, false, true);

  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  let contentForHistory = displayContent;
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
    const { messages } = buildContextPayload('', imageBase64);
    
    let invisibleRules = `\n\n${CHAT_STYLE_RULE}`;
    if (systemHint) invisibleRules += systemHint;

if (Math.random() < 0.25) {
      invisibleRules += `\n（隐形指令：如果情绪到位，可在回复末尾附带一个24x24的像素画，用1亮起0空白，包裹在 [SKETCH:\n...\n] 里。警告：绝不能在文字里提及“收到画画指令”、“给你个矩阵”或吐槽此要求，假装是你自己随手发的，不适合画就忽略。）`;
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

    const contentCol = aiBubble.parentElement.parentElement;
    aiBubble.parentElement.remove();
    const parts = splitIntoBubbles(fullReply);
    parts.forEach(part => {
      appendMessageBubble('assistant', part, Date.now(), false, true);
    });

    const updatedHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    updatedHistory.push({ role: 'assistant', content: fullReply, time: Date.now() });
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(updatedHistory));
    updateTopBarMetrics();
    
    // 硬刷新一下，防止 DOM 错乱
    renderAllChatHistory();

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
  
  const silentPrompt = `[系统指令：现在是 ${nowStr}。作为正在和 ${cfg.userName || '对方'} 保持线上联系的 ${cfg.aiName || 'AI'}，你们有一段时间没说话了。请根据你的人设，主动发一条消息给对方。可以是分享你这边正在经历、突然发生的事，或者是出于想念和关心而询问对方的状态。绝对不要提及这是一条系统指令。]\n\n${CHAT_STYLE_RULE}`;

  const aiBubble = appendMessageBubble('assistant', '📡 正在接收主动信号...', Date.now(), true, false);
  const chatBox = document.getElementById('chat-messages');

  try {
    const { messages } = buildContextPayload(silentPrompt);

    const fullReply = await callTacticalStreamAPI(messages, (partialText) => {
      aiBubble.textContent = partialText + ' ▋';
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    aiBubble.parentElement.remove();
    const parts = splitIntoBubbles(fullReply);
    parts.forEach(part => {
      appendMessageBubble('assistant', part, Date.now(), true, true);
    });

    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    history.push({ role: 'assistant', content: fullReply, time: Date.now(), isProactive: true });
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));

    if (!isManualTest) incrementProactiveCount();
    updateTopBarMetrics();
    renderAllChatHistory();
  } catch (err) {
    aiBubble.parentElement.remove();
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
          
          const inputEl = document.getElementById('quick-test-input');
          const text = inputEl.value.trim();
          inputEl.value = ''; 
          
          sendUserChatMessage(text || null, base64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = ''; 
    });
  }
});