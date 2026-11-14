// ==========================================
// 阶段一 & 云端升级版：API 通信层 + Supabase 静默同步引擎
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
  theme: 'tactical-green',
  syncSecret: '' // 新增暗号字段
};

// --- Supabase 云端钥匙 ---
const SUPA_URL = 'https://dkboyuwgvddnrpgsgrir.supabase.co/rest/v1/terminal_sync';
const SUPA_KEY = 'sb_publishable_9vvsCiFXJN0t_oaKxHjLrA_B1d2bMng';

function getConfig() {
  const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
  return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
  updateTopBarMetrics();
  triggerCloudPush(); // 配置保存时，顺便推送到云端
}

// 🌟 核心引擎：静默打包上传云端
async function triggerCloudPush() {
  const secret = getConfig().syncSecret;
  if (!secret || secret.trim() === '') return; // 没设暗号就不上传
  
  // 收集当前所有的本地数据
  const payload = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('ezekiel_')) {
      payload[key] = localStorage.getItem(key);
    }
  }

  // 发送给 Supabase
  try {
    await fetch(SUPA_URL, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates' // 如果有同样的暗号，就直接覆盖更新
      },
      body: JSON.stringify({
        secret_code: secret.trim(),
        payload: payload
      })
    });
    console.log('[云端] 数据已静默同步');
  } catch (err) {
    console.warn('[云端] 同步失败，继续使用本地数据', err);
  }
}

// 🌟 核心引擎：从云端拉取数据覆盖本地
async function pullFromCloud(secretCode, statusBtn) {
  if (!secretCode) return alert('请先输入同步暗号！');
  if (statusBtn) statusBtn.textContent = '⏳ 拉取中...';
  
  try {
    const res = await fetch(`${SUPA_URL}?secret_code=eq.${secretCode}`, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`
      }
    });
    const data = await res.json();
    
    if (data && data.length > 0 && data[0].payload) {
      const cloudData = data[0].payload;
      for (const key in cloudData) {
        if (key.startsWith('ezekiel_')) {
          localStorage.setItem(key, cloudData[key]);
        }
      }
      if (statusBtn) {
        statusBtn.textContent = '✓ 恢复成功！重启中';
        statusBtn.style.background = 'var(--accent-amber)';
        statusBtn.style.color = '#000';
      }
      setTimeout(() => window.location.reload(), 800);
    } else {
      alert('云端没有找到该暗号的存档，请检查是否拼写错误。');
      if (statusBtn) statusBtn.textContent = '📥 从云拉取';
    }
  } catch (err) {
    alert('连接云端失败！请检查网络。');
    if (statusBtn) statusBtn.textContent = '📥 从云拉取';
  }
}

// ==========================================
// 劫持所有存数据的动作，顺便推给云端
// （这部分利用重写原生的 setItem 来实现，一劳永逸）
// ==========================================
const originalSetItem = localStorage.setItem;
let pushTimeout = null;
localStorage.setItem = function(key, value) {
  originalSetItem.apply(this, arguments);
  // 如果存的是咱们的数据，延迟2秒打包推送（防频繁点击卡顿）
  if (key.startsWith('ezekiel_') && getConfig().syncSecret) {
    clearTimeout(pushTimeout);
    pushTimeout = setTimeout(() => triggerCloudPush(), 2000);
  }
};


// 🌟 智能规范化接口地址
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
  
  // 🌟 新增：获取当前的精准时间（包含星期几）
  const now = new Date();
  const timeStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} (星期${'日一二三四五六'[now.getDay()]})`;

  let coreSystemContent = `[核心人设指令]\n${cfg.systemPrompt || '未设置人设'}\n`;
  coreSystemContent += `\n[当前现实时间]\n${timeStr}\n`; // 强制把时间刻进模型的潜意识
  if (memoryPool.mood) coreSystemContent += `\n[当前双方情绪板]\n${memoryPool.mood}\n`;
  if (memoryPool.diaries.length > 0) coreSystemContent += `\n[近期日记档案摘要]\n${memoryPool.diaries.slice(-15).join('\n')}\n`;
  if (memoryPool.readingNotes.length > 0) coreSystemContent += `\n[共同阅读书摘体会]\n${memoryPool.readingNotes.slice(-10).join('\n')}\n`;
  
  let usedTokens = estimateTokens(coreSystemContent) + estimateTokens(newUserText);
  const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  const selectedHistory = [];

for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    // 🌟 新增：把每条历史消息的发送时间拼在前面
    const d = new Date(msg.time || Date.now());
    const tTag = `[${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}] `;
    const contentWithTime = tTag + msg.content;

    const msgTokens = estimateTokens(contentWithTime) + 6;
    if (usedTokens + msgTokens > maxLimit - 2000) break;
    selectedHistory.unshift({ role: msg.role, content: contentWithTime });
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
    if(document.getElementById('cfg-sync-secret')) document.getElementById('cfg-sync-secret').value = cfg.syncSecret || '';
    
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
      theme: selectedThemeId || 'tactical-green',
      syncSecret: document.getElementById('cfg-sync-secret')?.value.trim() || ''
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
    testResultEl.textContent = '✓ 配置与暗号已保存并同步云端。';
    setTimeout(() => { modal.classList.add('hidden'); window.location.reload(); }, 600);
  });

  // 绑定云端手动拉取按钮
  document.getElementById('cloud-pull-btn')?.addEventListener('click', function() {
    const code = document.getElementById('cfg-sync-secret').value.trim();
    pullFromCloud(code, this);
  });

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
// ==========================================
// 手机端 App 化：底部导航栏切换引擎
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.mobile-tab-bar .tab-item');
  const panels = {
    'panel-chat': document.getElementById('panel-chat'),
    'panel-diary': document.getElementById('panel-diary'),
    'panel-reading': document.getElementById('panel-reading'),
    'panel-mood': document.querySelector('.sub-grid') // 特殊处理：mood 和 tasks 绑在一起
  };

  function switchTab(targetId) {
    // 如果是在电脑宽屏上，这个逻辑不执行
    if (window.innerWidth > 820) return;

    // 1. 按钮变色
    tabs.forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.tab-item[data-target="${targetId}"]`);
    if (activeTab) activeTab.classList.add('active');

    // 2. 隐藏所有面板
    document.querySelectorAll('.tac-panel').forEach(p => p.classList.remove('mobile-active'));
    document.querySelector('.sub-grid')?.classList.remove('mobile-active-combo');

    // 3. 显示目标面板
    if (targetId === 'panel-mood') {
      // 状态页特殊处理：把心情和任务组合显示
      panels['panel-mood'].classList.add('mobile-active-combo');
    } else if (panels[targetId]) {
      panels[targetId].classList.add('mobile-active');
      
      // 切换到聊天页时，强行把滚动条拉到底
      if (targetId === 'panel-chat') {
        const chatBox = document.getElementById('chat-messages');
        if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
      }
    }
  }

  // 绑定点击事件
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.target);
    });
  });

  // 页面初次加载时，如果是手机端，强制切到通讯页
  setTimeout(() => {
    if (window.innerWidth <= 820) {
      switchTab('panel-chat');
    }
  }, 100);

  // 监听屏幕尺寸变化，如果从手机竖屏切回电脑，清理掉手机端的隐藏类名
  window.addEventListener('resize', () => {
    if (window.innerWidth > 820) {
      document.querySelectorAll('.tac-panel').forEach(p => p.classList.remove('mobile-active'));
      document.querySelector('.sub-grid')?.classList.remove('mobile-active-combo');
    }
  });
});