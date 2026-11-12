// ==========================================
// 阶段一：终端核心配置、10w Token 滑动窗口与 API 通信层 (v1.7 豆包官方原生兼容版)
// ==========================================

const STORAGE_KEYS = {
  CONFIG: 'ezekiel_tac_config',
  MEMORY_POOL: 'ezekiel_memory_pool', 
  CHAT_HISTORY: 'ezekiel_chat_history'
};

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0icmdiYSgwLCAyMzAsIDExOCwgMC4xKSIvPjwvc3ZnPg==';

const DEFAULT_CONFIG = {
  apiHost: '', apiKey: '', model: '', maxTokens: 100000,
  proactive: 'on', proactiveMax: 5, proactiveInterval: '15-45', systemPrompt: '',
  userName: 'USER', aiName: 'AI',
  userAvatar: DEFAULT_AVATAR, aiAvatar: DEFAULT_AVATAR,
  theme: 'tactical-green'
};

function getConfig() {
  const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
  return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
  updateTopBarMetrics();
}

// 🌟 智能规范化接口地址（完美兼容普通 /v1 接口 与 豆包火山方舟 /v3 接口）
function normalizeBaseUrl(rawHost) {
  let baseUrl = (rawHost || '').trim().replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1') && !baseUrl.endsWith('/v3')) {
    baseUrl += '/v1';
  }
  return baseUrl;
}

let selectedThemeId = 'tactical-green';

function applyTheme(themeId) {
  const targetTheme = themeId || 'tactical-green';
  selectedThemeId = targetTheme;
  document.documentElement.setAttribute('data-theme', targetTheme);
  document.body.setAttribute('data-theme', targetTheme);

  document.querySelectorAll('.theme-card').forEach(card => {
    if (card.dataset.themeId === targetTheme) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
}

(function initThemeImmediately() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || '{}');
    if (saved.theme) {
      document.documentElement.setAttribute('data-theme', saved.theme);
    }
  } catch (e) {}
})();

function estimateTokens(text) {
  if (!text) return 0;
  let cnChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  let otherChars = text.length - cnChars;
  return Math.ceil(cnChars * 1.6 + otherChars * 0.4);
}

function buildContextPayload(newUserText = '', imageBase64 = null) {
  const cfg = getConfig();
  const maxLimit = Number(cfg.maxTokens) || 100000;
  const memoryPool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_POOL) || '{"diaries":[],"readingNotes":[],"mood":""}');
  
  let coreSystemContent = `[核心人设指令]\n${cfg.systemPrompt || '未设置人设'}\n`;
  if (memoryPool.mood) coreSystemContent += `\n[当前双方情绪板]\n${memoryPool.mood}\n`;
  if (memoryPool.diaries.length > 0) coreSystemContent += `\n[近期日记档案摘要]\n${memoryPool.diaries.slice(-15).join('\n')}\n`;
  if (memoryPool.readingNotes.length > 0) coreSystemContent += `\n[共同阅读书摘体会]\n${memoryPool.readingNotes.slice(-10).join('\n')}\n`;

  let usedTokens = estimateTokens(coreSystemContent) + estimateTokens(newUserText);
  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  const selectedHistory = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const msgTokens = estimateTokens(msg.content) + 6;
    if (usedTokens + msgTokens > maxLimit - 2000) break;
    selectedHistory.unshift({ role: msg.role, content: msg.content });
    usedTokens += msgTokens;
  }

  const messages = [{ role: 'system', content: coreSystemContent }, ...selectedHistory];
  
  if (imageBase64) {
    if (messages.length > 1 && messages[messages.length - 1].role === 'user') {
      const lastText = messages[messages.length - 1].content;
      messages[messages.length - 1].content = [
        { type: 'text', text: lastText || '（对方发来一张表情包，请看图回应）' },
        { type: 'image_url', image_url: { url: imageBase64 } }
      ];
    }
  } else if (newUserText) {
    messages.push({ role: 'user', content: newUserText });
  }

  return { messages, usedTokens, maxLimit };
}

function updateTopBarMetrics() {
  const { usedTokens, maxLimit } = buildContextPayload();
  const counterEl = document.getElementById('token-counter');
  if (counterEl) counterEl.textContent = `${usedTokens.toLocaleString()} / ${maxLimit.toLocaleString()}`;
  const dotEl = document.getElementById('conn-dot');
  if (dotEl) dotEl.className = getConfig().apiKey ? 'status-dot online' : 'status-dot';
}

async function callTacticalAPI(messages) {
  const cfg = getConfig();
  if (!cfg.apiHost || !cfg.apiKey) throw new Error('未配置 API 主机地址或秘钥。');
  const baseUrl = normalizeBaseUrl(cfg.apiHost);
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey.trim()}` },
    body: JSON.stringify({ model: cfg.model.trim(), messages: messages, temperature: 0.75 })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '（终端无返回内容）';
}

function compressImage(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const size = 100;
      canvas.width = size; canvas.height = size;
      const scale = Math.max(size / img.width, size / img.height);
      const x = (size - img.width * scale) / 2;
      const y = (size - img.height * scale) / 2;
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', () => {
  const initialCfg = getConfig();
  applyTheme(initialCfg.theme || 'tactical-green');

  const modal = document.getElementById('settings-modal');
  const testResultEl = document.getElementById('api-test-result');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).classList.add('active');
    });
  });

  const themeGrid = document.getElementById('theme-selector-grid');
  if (themeGrid) {
    themeGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.theme-card');
      if (card && card.dataset.themeId) {
        applyTheme(card.dataset.themeId);
      }
    });
  }

  document.getElementById('upload-user-avatar')?.addEventListener('change', (e) => {
    if (e.target.files[0]) compressImage(e.target.files[0], (base64) => { document.getElementById('preview-user-avatar').src = base64; });
  });
  document.getElementById('upload-ai-avatar')?.addEventListener('change', (e) => {
    if (e.target.files[0]) compressImage(e.target.files[0], (base64) => { document.getElementById('preview-ai-avatar').src = base64; });
  });

  function populateModelSelect(modelsArray, selectedModel) {
    const select = document.getElementById('cfg-model');
    if(!select) return;
    select.innerHTML = '';
    modelsArray.forEach(m => {
      const opt = document.createElement('option'); opt.value = m.id; opt.textContent = m.id; select.appendChild(opt);
    });
    if (selectedModel && !modelsArray.find(m => m.id === selectedModel)) {
      const opt = document.createElement('option'); opt.value = selectedModel; opt.textContent = selectedModel; select.appendChild(opt);
    }
    select.value = selectedModel || '';
  }

  function loadForm() {
    const cfg = getConfig();
    if(document.getElementById('cfg-api-host')) document.getElementById('cfg-api-host').value = cfg.apiHost || '';
    if(document.getElementById('cfg-api-key')) document.getElementById('cfg-api-key').value = cfg.apiKey || '';
    if(document.getElementById('cfg-proactive')) document.getElementById('cfg-proactive').value = cfg.proactive || 'on';
    if(document.getElementById('cfg-proactive-max')) document.getElementById('cfg-proactive-max').value = cfg.proactiveMax || 5;
    if(document.getElementById('cfg-proactive-interval')) document.getElementById('cfg-proactive-interval').value = cfg.proactiveInterval || '15-45';
    if(document.getElementById('cfg-system-prompt')) document.getElementById('cfg-system-prompt').value = cfg.systemPrompt || '';
    if(document.getElementById('cfg-user-name')) document.getElementById('cfg-user-name').value = cfg.userName || 'USER';
    if(document.getElementById('cfg-ai-name')) document.getElementById('cfg-ai-name').value = cfg.aiName || 'AI';
    if(document.getElementById('preview-user-avatar')) document.getElementById('preview-user-avatar').src = cfg.userAvatar || DEFAULT_AVATAR;
    if(document.getElementById('preview-ai-avatar')) document.getElementById('preview-ai-avatar').src = cfg.aiAvatar || DEFAULT_AVATAR;
    
    applyTheme(cfg.theme || 'tactical-green');
    populateModelSelect(cfg.model ? [{id: cfg.model}] : [], cfg.model);
  }

  function readForm() {
    return {
      apiHost: document.getElementById('cfg-api-host')?.value.trim() || '',
      apiKey: document.getElementById('cfg-api-key')?.value.trim() || '',
      model: document.getElementById('cfg-model')?.value.trim() || '',
      maxTokens: Number(document.getElementById('cfg-max-tokens')?.value) || 100000,
      proactive: document.getElementById('cfg-proactive')?.value || 'on',
      proactiveMax: Number(document.getElementById('cfg-proactive-max')?.value) || 5,
      proactiveInterval: document.getElementById('cfg-proactive-interval')?.value.trim() || '15-45',
      systemPrompt: document.getElementById('cfg-system-prompt')?.value || '',
      userName: document.getElementById('cfg-user-name')?.value.trim() || 'USER',
      aiName: document.getElementById('cfg-ai-name')?.value.trim() || 'AI',
      userAvatar: document.getElementById('preview-user-avatar')?.src || DEFAULT_AVATAR,
      aiAvatar: document.getElementById('preview-ai-avatar')?.src || DEFAULT_AVATAR,
      theme: selectedThemeId || 'tactical-green'
    };
  }

  document.getElementById('open-settings-btn')?.addEventListener('click', () => { loadForm(); modal.classList.remove('hidden'); });
  
  document.getElementById('close-settings-btn')?.addEventListener('click', () => {
    applyTheme(getConfig().theme || 'tactical-green');
    modal.classList.add('hidden');
  });

  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    saveConfig(readForm());
    testResultEl.style.color = '#38b27b';
    testResultEl.textContent = '✓ 配置与主题偏好已写入本地。';
    setTimeout(() => { modal.classList.add('hidden'); window.location.reload(); }, 600);
  });

  // 🌟 升级检索按钮：如果接口不支持自动拉取列表（比如豆包官方），直接弹窗让你输入 ep- 接入点 ID
  document.getElementById('fetch-models-btn')?.addEventListener('click', async () => {
    const host = document.getElementById('cfg-api-host').value.trim();
    const key = document.getElementById('cfg-api-key').value.trim();
    if (!host || !key) return alert('请先填写 API 主机地址和秘钥！');
    
    const baseUrl = normalizeBaseUrl(host);
    testResultEl.style.color = '#d4a359';
    testResultEl.textContent = '📡 正在检索模型列表...';

    try {
      const response = await fetch(`${baseUrl}/models`, { headers: { 'Authorization': `Bearer ${key}` } });
      if (!response.ok) throw new Error('不支持自动检索');
      const data = await response.json();
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        populateModelSelect(data.data, document.getElementById('cfg-model').value || data.data[0].id);
        testResultEl.style.color = '#38b27b';
        testResultEl.textContent = `✓ 成功获取 ${data.data.length} 个模型！`;
      } else {
        throw new Error('列表为空');
      }
    } catch (err) {
      // 豆包官方走这里：直接弹出输入框让你粘贴 ep- 接入点 ID
      const manualId = prompt('当前接口不支持自动检索列表（豆包/火山方舟请直接粘贴你的接入点 ID，例如 ep-2026xxxx-xxxxx）：', document.getElementById('cfg-model').value);
      if (manualId && manualId.trim()) {
        populateModelSelect([{ id: manualId.trim() }], manualId.trim());
        testResultEl.style.color = '#38b27b';
        testResultEl.textContent = `✓ 已手动设定模型/接入点: ${manualId.trim()}`;
      } else {
        testResultEl.textContent = '等待配置校验...';
      }
    }
  });

  document.getElementById('test-api-btn')?.addEventListener('click', async () => {
    saveConfig(readForm());
    testResultEl.style.color = '#d4a359';
    testResultEl.textContent = '⏳ 正在呼叫终端...';
    try {
      const reply = await callTacticalAPI([
        { role: 'system', content: readForm().systemPrompt || '你是一个AI助手' },
        { role: 'user', content: '收到请回复。' }
      ]);
      testResultEl.style.color = '#38b27b';
      testResultEl.textContent = `✓ 链路畅通！响应: "${reply.slice(0, 45)}..."`;
    } catch (err) {
      testResultEl.style.color = '#d9534f';
      testResultEl.textContent = `✕ 链路异常: ${err.message}`;
    }
  });
  
  const exportBtn = document.getElementById('export-data-btn');
  const importBtn = document.getElementById('import-data-btn');
  const importInput = document.getElementById('import-data-input');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const backupData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ezekiel_')) backupData[key] = localStorage.getItem(key);
      }
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `TERMINAL_BACKUP_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`;
      a.click();
    });
  }

  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          for (const key in data) { if (key.startsWith('ezekiel_')) localStorage.setItem(key, data[key]); }
          alert(`✓ 成功恢复终端核心数据！\n系统即将重启刷新...`); window.location.reload();
        } catch (err) { alert('✕ 存档解析失败，请检查文件。'); }
      };
      reader.readAsText(file); e.target.value = '';
    });
  }

  updateTopBarMetrics();
});

async function callTacticalStreamAPI(messages, onChunk) {
  const cfg = getConfig();
  const baseUrl = normalizeBaseUrl(cfg.apiHost);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey.trim()}` },
    body: JSON.stringify({ model: cfg.model.trim(), messages: messages, temperature: 0.75, stream: true })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = ''; let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) { fullText += delta; if (onChunk) onChunk(fullText); }
      } catch (e) {}
    }
  }
  return fullText || '（信号接收为空）';
}