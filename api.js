// ==========================================
// 阶段一 & 云端升级版：API 通信层 + Supabase 静默同步引擎
// ==========================================

const STORAGE_KEYS = {
  CONFIG: 'ezekiel_tac_config',
  MEMORY_POOL: 'ezekiel_memory_pool', 
  // 🌟 魔法核心：动态劫持聊天室的存储键
  get CHAT_HISTORY() {
    const sid = localStorage.getItem('ezekiel_active_session') || 'default';
    return sid === 'default' ? 'ezekiel_chat_history' : 'ezekiel_chat_history_' + sid;
  }
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

function buildContextPayload(newUserText = '', imageBase64 = null, audioPayload = null) {  
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
  if (typeof getInjectableMemories === 'function') {
    const longTermMems = getInjectableMemories();
    if (longTermMems) coreSystemContent += `\n${longTermMems}\n`;
  }
  
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
  
if (audioPayload && audioPayload.base64) {
    // 🎵 一次性音频透传（兼容 OpenAI / Gemini 反代标准 input_audio 格式）
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: newUserText },
        {
          type: 'input_audio',
          input_audio: {
            data: audioPayload.base64,
            format: audioPayload.format || 'mp3'
          }
        }
      ]
    });
  } else if (imageBase64) {
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
// ==========================================
// 新增：记忆库二层界面平滑切换逻辑
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const memBtn = document.getElementById('open-memory-db-btn');
  const tabs = document.querySelector('#settings-modal .modal-tabs');
  const tabContents = document.querySelectorAll('#settings-modal .tab-content');
  const testResult = document.getElementById('api-test-result');
  const modalFooter = document.getElementById('settings-modal-footer');
  const memView = document.getElementById('memory-db-view');
  
  const modalHeaderTitle = document.querySelector('#settings-modal .modal-header h2');
  const panelTag = document.querySelector('#settings-modal .modal-header .panel-tag');
  
  // 暂存原本的标题，方便切回来时恢复
  const originalTitle = modalHeaderTitle ? modalHeaderTitle.innerHTML : '终端核心配置 // SYSTEM OVERRIDE';
  const originalTag = panelTag ? panelTag.innerHTML : '[SYS-CFG]';

  if (memBtn) {
    memBtn.addEventListener('click', () => {
      // 1. 隐藏第一层的所有内容
      if (tabs) tabs.style.display = 'none';
      tabContents.forEach(c => c.style.display = 'none');
      if (testResult) testResult.style.display = 'none';
      if (modalFooter) modalFooter.style.display = 'none';
      
      // 2. 显示第二层的记忆库视图
      if (memView) memView.style.display = 'flex';
      
      // 3. 修改顶栏标题，装上返回按钮
      if (panelTag) panelTag.innerHTML = '[MEM-DB]';
      if (modalHeaderTitle) {
        modalHeaderTitle.innerHTML = `<button class="back-to-cfg-btn" id="mem-back-btn">◀ 返回配置</button> <span style="margin-left: 10px;">核心记忆库 // ARCHIVES</span>`;
        
        // 给这个新长出来的返回按钮绑定点击事件
        document.getElementById('mem-back-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          // 清除行内隐藏样式，让第一层根据 CSS 自动恢复原样
          if (tabs) tabs.style.display = '';
          tabContents.forEach(c => c.style.display = '');
          if (testResult) testResult.style.display = '';
          if (modalFooter) modalFooter.style.display = '';
          
          // 重新隐藏第二层
          if (memView) memView.style.display = 'none';
          
          // 恢复原本的标题栏
          if (panelTag) panelTag.innerHTML = originalTag;
          modalHeaderTitle.innerHTML = originalTitle;
        });
      }
    });
  }
  
  // 兜底机制：每次点击右上角 X 关闭整个配置面板时，顺便重置回第一层，防止下次打开错乱
  document.getElementById('close-settings-btn')?.addEventListener('click', () => {
    const backBtn = document.getElementById('mem-back-btn');
    if (backBtn) backBtn.click();
  });
});
// ==========================================
// 阶段九核心：长线记忆库 (5w Token 游标与 15+5 抽卡注入)
// ==========================================

// 1. 获取 15(近期) + 5(随机早期) 的混合记忆用于组装 Prompt
function getInjectableMemories() {
  const mems = JSON.parse(localStorage.getItem('ezekiel_long_term_memories') || '[]');
  if (mems.length === 0) return '';
  
  const recent = mems.slice(0, 15);
  let randomOld = [];
  if (mems.length > 15) {
    const older = mems.slice(15);
    // Fisher-Yates 洗牌算法随机抽 5 个
    for (let i = older.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [older[i], older[j]] = [older[j], older[i]];
    }
    randomOld = older.slice(0, 5);
  }
  
  let res = `[长期记忆档案 // 自动召回]\n以下是你过往留存的记忆片段，请自然融入你的认知背景中，不要生硬背诵：\n【近期记忆（按时间倒序）】\n`;
  recent.forEach(m => res += `- [${m.date}] ${m.content}\n`);
  if (randomOld.length > 0) {
    res += `【往昔闪回（随机唤起的早期记忆）】\n`;
    randomOld.forEach(m => res += `- [${m.date}] ${m.content}\n`);
  }
  return res;
}

// 2. 检查全局所有窗口的 50,000 Token 水位线并更新进度条
function checkMemoryWatermark() {
  let allHistory = [];
  const sessions = typeof getSessions === 'function' ? getSessions() : [{ id: 'default' }];
  sessions.forEach(s => {
    const key = s.id === 'default' ? 'ezekiel_chat_history' : 'ezekiel_chat_history_' + s.id;
    const msgs = JSON.parse(localStorage.getItem(key) || '[]');
    allHistory = allHistory.concat(msgs);
  });
  // 按时间正序排好所有窗口的对话
  allHistory.sort((a, b) => (a.time || 0) - (b.time || 0));

  const lastTime = Number(localStorage.getItem('ezekiel_memory_cursor') || 0);
  const unarchived = allHistory.filter(m => (m.time || 0) > lastTime);
  
  let tokenCount = 0;
  unarchived.forEach(m => tokenCount += estimateTokens(m.content));

  const progressEl = document.getElementById('memory-progress-bar');
  const textEl = document.getElementById('memory-progress-text');

  if (progressEl && textEl) {
    let percent = Math.min(100, (tokenCount / 50000) * 100);
    progressEl.style.width = percent + '%';
    textEl.textContent = `全频道累计待归档：${tokenCount.toLocaleString()} / 50,000 TKN`;
    if (percent >= 100) {
      progressEl.style.background = 'var(--accent-red)';
    } else {
      progressEl.style.background = 'var(--accent-amber)';
    }
  }
  
  const hintEl = document.getElementById('memory-db-count-hint');
  if (hintEl) {
    const totalMems = JSON.parse(localStorage.getItem('ezekiel_long_term_memories') || '[]').length;
    hintEl.textContent = `已存 ${totalMems} 条 >`;
  }
  return { tokenCount, unarchived };
}

// 3. 触发全局归档生成
let isSummarizing = false;
async function triggerMemorySummary() {
  if (isSummarizing) return;
  const { unarchived } = checkMemoryWatermark();
  if (unarchived.length === 0) return alert('当前所有频道均没有需要归档的新对话记录。');
  isSummarizing = true;

  const btnEl = document.getElementById('force-summary-btn');
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ 记忆压缩中...'; }

  const cfg = getConfig();
  const aiName = cfg.aiName || 'AI';
  const userName = cfg.userName || 'USER';

  let chatText = unarchived.map(m => {
    const speaker = m.role === 'user' ? userName : aiName;
    return `${speaker}: ${m.content.replace(/\[.*?\]/g, '')}`;
  }).join('\n');
  if (chatText.length > 25000) chatText = chatText.slice(-25000);

  const prompt = `[系统记忆归档指令]
请完全代入你（${aiName}）的视角与核心人设，回顾以上按时间顺序整理的对话记录，为自己留存一份精炼的阶段性记忆档案（严格控制在 150 字以内）。
记录需客观提炼以下三个维度的核心信息：
1. 关系与事件进展：这段时间内双方共同经历的关键事件，或彼此关系状态的实质推进；
2. 互动与深层触动：交流中具有意义的共识、情绪波动或值得留存的对话瞬间；
3. 对 ${userName} 的当前印象：对方在这段时期展现出的状态、习惯或给你的直观感受。
要求：摒弃空泛套话与系统腔，保留具体事实、时间节点与双方约定，以你习惯的私人记录口吻直接输出正文，不要加任何标题或解释。

【待归档对话片段】
${chatText}`;

  try {
    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt || `你是 ${aiName}` },
      { role: 'user', content: prompt }
    ]);

    const mems = JSON.parse(localStorage.getItem('ezekiel_long_term_memories') || '[]');
    const now = new Date();
    mems.unshift({
      id: Date.now().toString(),
      date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
      content: reply.trim()
    });
    localStorage.setItem('ezekiel_long_term_memories', JSON.stringify(mems));
    
    // 更新全局统一游标为最后一条已归档消息的时间戳
    localStorage.setItem('ezekiel_memory_cursor', unarchived[unarchived.length - 1].time.toString());
    
    renderMemoryList();
    checkMemoryWatermark();
  } catch (err) {
    alert('归档失败: ' + err.message);
  } finally {
    isSummarizing = false;
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = '⚡ 立即总结'; }
  }
}

// 4. 渲染界面与修改删除
function renderMemoryList() {
  const container = document.getElementById('memory-list-container');
  if (!container) return;
  const mems = JSON.parse(localStorage.getItem('ezekiel_long_term_memories') || '[]');
  if (mems.length === 0) {
    container.innerHTML = '<p class="slot-hint" style="margin-top: 20px;">记忆库空空如也，积累足够的对话后，系统会自动或可手动生成记忆档案。</p>';
    return;
  }
  container.innerHTML = mems.map((m, idx) => `
    <div class="memory-card">
      <div class="memory-header">
        <span class="memory-time">${m.date} ${idx < 15 ? '<span style="color:var(--accent-green);font-size:10px;">[近期固定池]</span>' : '<span style="color:var(--text-muted);font-size:10px;">[早期随机池]</span>'}</span>
        <button class="mini-btn" style="border-color:var(--accent-red); color:var(--accent-red);" onclick="deleteMemory('${m.id}')">删除</button>
      </div>
      <!-- 直接点击文本就可以原地修改错别字 -->
      <div class="memory-content" contenteditable="true" onblur="updateMemoryContent('${m.id}', this.innerText)">${m.content}</div>
    </div>
  `).join('');
}

window.deleteMemory = function(id) {
  if (!confirm('确认删除这条核心记忆？')) return;
  let mems = JSON.parse(localStorage.getItem('ezekiel_long_term_memories') || '[]');
  mems = mems.filter(m => m.id !== id);
  localStorage.setItem('ezekiel_long_term_memories', JSON.stringify(mems));
  renderMemoryList();
  checkMemoryWatermark();
};

window.updateMemoryContent = function(id, newText) {
  let mems = JSON.parse(localStorage.getItem('ezekiel_long_term_memories') || '[]');
  const target = mems.find(m => m.id === id);
  if (target) {
    target.content = newText.trim();
    localStorage.setItem('ezekiel_long_term_memories', JSON.stringify(mems));
  }
};

document.addEventListener('DOMContentLoaded', () => {
  renderMemoryList();
  checkMemoryWatermark();
  document.getElementById('force-summary-btn')?.addEventListener('click', triggerMemorySummary);
});
// ==========================================
// 新增：一键重置存档逻辑（手打二次确认）
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const resetModal = document.getElementById('reset-confirm-modal');
  const resetInput = document.getElementById('reset-confirm-input');

  // 打开确认弹窗
  document.getElementById('open-reset-modal-btn')?.addEventListener('click', () => {
    if (resetInput) resetInput.value = '';
    resetModal?.classList.remove('hidden');
  });

  // 关闭确认弹窗
  const closeResetModal = () => resetModal?.classList.add('hidden');
  document.getElementById('close-reset-modal-btn')?.addEventListener('click', closeResetModal);
  document.getElementById('cancel-reset-btn')?.addEventListener('click', closeResetModal);

  // 执行清空
  document.getElementById('execute-reset-btn')?.addEventListener('click', () => {
    const val = (resetInput?.value || '').trim();
    if (val !== '我要清空这个存档') {
      alert('输入内容不匹配！必须完整输入：我要清空这个存档');
      return;
    }

    // 1. 清理所有 localStorage 里的业务数据
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('ezekiel_') || k.startsWith('Terminal_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 2. 顺便清理点唱机里存的本地音乐数据库 (IndexedDB)
    try {
      indexedDB.deleteDatabase('TerminalMusicDB');
    } catch (e) {}

    alert('✓ 存档已彻底清空！终端即将重启为初始状态...');
    window.location.reload();
  });
});
// ==========================================
// 阶段十核心：多通讯频道 (Sessions) 管理系统
// ==========================================
function getSessions() {
  const saved = localStorage.getItem('ezekiel_chat_sessions');
  if (!saved) return [{ id: 'default', name: '主频道 // MAIN', time: Date.now() }];
  return JSON.parse(saved);
}

function saveSessions(sessions) {
  localStorage.setItem('ezekiel_chat_sessions', JSON.stringify(sessions));
}

function getActiveSessionId() {
  return localStorage.getItem('ezekiel_active_session') || 'default';
}

function setActiveSessionId(id) {
  localStorage.setItem('ezekiel_active_session', id);
}

function renderSessionList() {
  const container = document.getElementById('session-list-container');
  const titleEl = document.getElementById('current-chat-title');
  if (!container) return;

  const sessions = getSessions();
  const activeId = getActiveSessionId();

  // 更新聊天框顶部的标题
  const activeSession = sessions.find(s => s.id === activeId) || sessions[0];
  if (titleEl) titleEl.textContent = activeSession.name;

  container.innerHTML = sessions.map(s => {
    const d = new Date(s.time || Date.now());
    const timeStr = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `
      <div class="session-item ${s.id === activeId ? 'active' : ''}" onclick="switchSession('${s.id}')">
        <div class="session-info">
          <span class="session-name">${s.name}</span>
          <span class="session-time">建于: ${timeStr}</span>
        </div>
        <div class="session-actions">
          <button class="mini-btn" onclick="renameSession(event, '${s.id}')" title="重命名">✏️</button>
          ${s.id !== 'default' ? `<button class="mini-btn" style="color:var(--accent-red);border-color:var(--accent-red);" onclick="deleteSession(event, '${s.id}')" title="删除频道">✕</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.switchSession = function(id) {
  if (id === getActiveSessionId()) return; // 已经是当前频道，不理它
  
  setActiveSessionId(id);
  renderSessionList();
  
  // 切换频道后，清空并重新渲染聊天框
  const chatBox = document.getElementById('chat-messages');
  if (chatBox) chatBox.innerHTML = '<div class="sys-msg">// 频道信道切换中...</div>';
  
  setTimeout(() => {
    if (typeof renderAllChatHistory === 'function') renderAllChatHistory();
    if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();
    if (typeof checkMemoryWatermark === 'function') checkMemoryWatermark(); // 更新属于这个频道的进度条
  }, 100);

  // 手机端点完自动收起抽屉
  if (window.innerWidth <= 820) {
    document.getElementById('chat-session-drawer')?.classList.add('hidden');
  }
};

window.renameSession = function(e, id) {
  e.stopPropagation();
  const sessions = getSessions();
  const target = sessions.find(s => s.id === id);
  if (!target) return;
  const newName = prompt('给这个频道起个新名字（如：电影讨论、睡前闲聊）：', target.name);
  if (newName && newName.trim()) {
    target.name = newName.trim();
    saveSessions(sessions);
    renderSessionList();
  }
};

window.deleteSession = function(e, id) {
  e.stopPropagation();
  if (id === 'default') return; // 主频道不许删
  if (!confirm('确定要删除这个频道及里面的所有聊天记录吗？(不可恢复)')) return;

  let sessions = getSessions();
  sessions = sessions.filter(s => s.id !== id);
  saveSessions(sessions);

  // 绝不留垃圾：清理对应频道的聊天缓存和记忆游标
  localStorage.removeItem('ezekiel_chat_history_' + id);
  localStorage.removeItem('ezekiel_memory_cursor_' + id);

  // 如果删的是当前正在看的频道，强制切回主频道
  if (getActiveSessionId() === id) {
    switchSession('default');
  } else {
    renderSessionList();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const drawer = document.getElementById('chat-session-drawer');
  const openBtn = document.getElementById('open-chat-drawer-btn');
  const closeBtn = document.getElementById('close-chat-drawer-btn');
  const newBtn = document.getElementById('new-session-btn');

  openBtn?.addEventListener('click', () => {
    renderSessionList(); 
    drawer?.classList.remove('hidden');
  });

  closeBtn?.addEventListener('click', () => {
    drawer?.classList.add('hidden');
  });

  newBtn?.addEventListener('click', () => {
    const name = prompt('输入新频道名称（如：副本剧情、深层对话）：', '新的频道');
    if (name && name.trim()) {
      const sessions = getSessions();
      if (sessions.length >= 10) return alert('最多只能创建 10 个频道哦，请先删除没用的。');

      const newId = 's_' + Date.now();
      // 新建频道插在主频道下面
      sessions.splice(1, 0, { id: newId, name: name.trim(), time: Date.now() });
      saveSessions(sessions);
      switchSession(newId); // 创建完直接跳过去
    }
  });

  // 网页刚打开时渲染一次
  renderSessionList();
});