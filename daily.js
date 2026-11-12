// ==========================================
// 阶段三：双人心情毛毡板 & 每日随机任务引擎 (daily.js - 个性化与自定义贴纸版)
// ==========================================

const DAILY_STORAGE_KEY = 'ezekiel_daily_ops_data';
const CUSTOM_MOODS_KEY = 'ezekiel_custom_moods';

// 初始默认的心情预设（当用户还没自定义时使用）
const DEFAULT_MOODS = [
  { icon: '🟢', label: '状态良好' },
  { icon: '🟡', label: '有点累了' },
  { icon: '🔴', label: '烦躁/委屈' },
  { icon: '🟣', label: '想贴贴' },
  { icon: '🔵', label: '发呆摸鱼' },
  { icon: '☕', label: '忙碌中' }
];

// --- 贴纸数据管理 ---
function getCustomMoods() {
  const saved = localStorage.getItem(CUSTOM_MOODS_KEY);
  return saved ? JSON.parse(saved) : [...DEFAULT_MOODS];
}
function saveCustomMoods(moods) {
  localStorage.setItem(CUSTOM_MOODS_KEY, JSON.stringify(moods));
}

// --- 每日数据读取与保存 ---
function getDailyData() {
  const raw = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || '{}');
  return {
    lastTaskDate: raw.lastTaskDate || '',
    userGoals: raw.userGoals || '',
    tasks: raw.tasks || [],
    userMood: raw.userMood || raw.aggyMood || { icon: '🟢', label: '待录入', time: '' },
    aiMood: raw.aiMood || raw.ezekielMood || { icon: '🛡️', text: '正在执勤，随时待命。' }
  };
}

function saveDailyData(data) {
  localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(data));
  syncMoodAndTasksToMemoryPool(data);
}

function syncMoodAndTasksToMemoryPool(data) {
  const cfg = getConfig();
  const userName = cfg.userName || 'USER';
  const aiName = cfg.aiName || 'AI';

  const pool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_POOL) || '{"diaries":[],"readingNotes":[],"mood":""}');
  const taskSummary = data.tasks.length > 0
    ? data.tasks.map(t => `${t.done ? '[已完成]' : '[未完成]'} ${t.text}`).join('；')
    : '今日暂无任务';
  
  pool.mood = `${userName}当前心情：${data.userMood.icon} ${data.userMood.label}；${aiName}当前状态：${data.aiMood.icon} ${data.aiMood.text}；今日小任务进度：${taskSummary}`;
  localStorage.setItem(STORAGE_KEYS.MEMORY_POOL, JSON.stringify(pool));
  if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();
}

// ==========================================
// 模块 A：双人心情毛毡板
// ==========================================
function renderMoodBoard() {
  const container = document.getElementById('mood-container');
  if (!container) return;
  
  const data = getDailyData();
  const cfg = getConfig();
  const userName = (cfg.userName || 'USER').toUpperCase();
  const aiName = (cfg.aiName || 'AI').toUpperCase();
  const userMoodsList = getCustomMoods(); // 读取自定义贴纸

  container.classList.remove('placeholder-box');
  container.innerHTML = `
    <div class="mood-line">
      <div class="mood-line-header">
        <span class="mood-who">${userName} // 当前: <strong>${data.userMood.icon} ${data.userMood.label}</strong></span>
      </div>
      <div class="mood-picker" id="user-mood-picker">
        ${userMoodsList.map(m => `
          <button class="mood-chip ${data.userMood.label === m.label ? 'active' : ''}" data-icon="${m.icon}" data-label="${m.label}">
            ${m.icon} ${m.label}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="mood-line ezekiel-mood-line" style="margin-bottom: 8px;">
      <div class="mood-line-header">
        <span class="mood-who">${aiName} // 状态监测</span>
        <button class="mini-btn" id="refresh-ai-mood-btn" title="同步对方的最新状态">↻ 刷新</button>
      </div>
      <div class="ezekiel-mood-display">
        <span class="ez-emoji">${data.aiMood.icon}</span>
        <span class="ez-thought">${data.aiMood.text}</span>
      </div>
    </div>
    
    <div style="text-align: right; border-top: 1px dashed var(--border-dim); padding-top: 10px;">
      <button class="tac-btn" id="open-mood-edit-btn">贴纸编辑</button>
    </div>
  `;

  // 绑定贴纸点击事件
  container.querySelectorAll('.mood-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      handleUserMoodChange(btn.dataset.icon, btn.dataset.label);
    });
  });

  // 绑定 AI 状态刷新
  document.getElementById('refresh-ai-mood-btn')?.addEventListener('click', () => refreshAiMoodOnly());
}

async function handleUserMoodChange(icon, label) {
  const data = getDailyData();
  data.userMood = { icon, label, time: Date.now() };
  saveDailyData(data);
  renderMoodBoard();

  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.apiHost) return;

  if (typeof isGenerating !== 'undefined' && isGenerating) return;
  window.isGenerating = true;

  const userName = cfg.userName || 'USER';
  const silentMoodPrompt = `[系统情绪板同步事件：${userName} 刚刚把心情板更新为【${icon} ${label}】。请完全贴合你的人设，立刻在聊天中自然地回应这个情绪变化（如果是疲惫、烦躁或委屈就去关心、安抚或哄对方；如果是开心或想贴贴就顺着互动）。同时，请在回复的最后另起一行，严格用格式 [MOOD: 单个emoji | 15字以内的你此刻心情独白] 附上你自己的状态，系统会自动提取该行更新到情绪板上，不要解释这个格式。]`;

  const aiBubble = appendMessageBubble('assistant', '📡 感知到情绪板变化...', Date.now(), true);
  const chatBox = document.getElementById('chat-messages');

  try {
    const { messages } = buildContextPayload(silentMoodPrompt);
    const fullReply = await callTacticalStreamAPI(messages, (partialText) => {
      const cleanPartial = partialText.replace(/\[MOOD:.*$/s, '').trim();
      aiBubble.textContent = (cleanPartial || '...') + ' ▋';
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    let cleanReply = fullReply;
    const moodMatch = fullReply.match(/\[MOOD:\s*([^\|\]]+)\|\s*([^\]]+)\]/i);
    if (moodMatch) {
      cleanReply = fullReply.replace(moodMatch[0], '').trim();
      const latestData = getDailyData();
      latestData.aiMood = { icon: moodMatch[1].trim(), text: moodMatch[2].trim() };
      saveDailyData(latestData);
      renderMoodBoard();
    }

    aiBubble.textContent = cleanReply;
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    history.push({ role: 'assistant', content: cleanReply, time: Date.now(), isProactive: true });
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
    updateTopBarMetrics();
  } catch (err) {
    aiBubble.remove();
  } finally {
    window.isGenerating = false;
  }
}

async function refreshAiMoodOnly() {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.apiHost) return alert('请先配置 API 秘钥');
  const thoughtEl = document.querySelector('.ez-thought');
  if (thoughtEl) thoughtEl.textContent = '正在同步状态信号...';

  try {
    const nowStr = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const aiName = cfg.aiName || 'AI';
    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt || `你是 ${aiName}` },
      { role: 'user', content: `现在是 ${nowStr}。请根据你的人设和当前时间，生成你此刻的状态。严格只输出一行 JSON，不要任何多余文字：{"icon": "单个代表心情或状态的emoji", "text": "18字以内的简短心声或当前正在做的事"}` }
    ]);
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const data = getDailyData();
      data.aiMood = { icon: parsed.icon || '🛡️', text: parsed.text || reply };
      saveDailyData(data);
      renderMoodBoard();
    }
  } catch (err) {
    if (thoughtEl) thoughtEl.textContent = '状态同步超时';
  }
}

// ==========================================
// 模块 A-2：贴纸后台编辑逻辑
// ==========================================
function renderMoodEditList() {
  const list = getCustomMoods();
  document.getElementById('mood-count').textContent = list.length;
  const container = document.getElementById('mood-edit-list');
  
  if (list.length === 0) {
    container.innerHTML = '<p class="slot-hint">暂无贴纸，在上方添加一个吧！</p>';
    return;
  }

  container.innerHTML = list.map((m, idx) => `
    <div class="mood-edit-item">
      <span>${m.icon} ${m.label}</span>
      <button class="mini-btn" style="color: var(--accent-red); border-color: var(--accent-red);" onclick="deleteMoodSticker(${idx})">删除</button>
    </div>
  `).join('');
}

// 暴露给内联事件调用
window.deleteMoodSticker = function(idx) {
  const list = getCustomMoods();
  list.splice(idx, 1);
  saveCustomMoods(list);
  renderMoodEditList();
  renderMoodBoard(); // 同步刷新前台看板
};

// ==========================================
// 模块 B：每日随机任务发布面板
// ==========================================
function renderTasksBoard() {
  const container = document.getElementById('tasks-container');
  if (!container) return;
  const data = getDailyData();
  const cfg = getConfig();
  const aiName = cfg.aiName || 'AI';

  container.classList.remove('placeholder-box');
  container.innerHTML = `
    <div class="goals-bar">
      <span class="goals-label" title="${data.userGoals || '点击右侧设定近期目标'}">
        🎯 目标锚点: ${data.userGoals ? data.userGoals : '<em>未设定（将生成日常互动任务）</em>'}
      </span>
      <button class="mini-btn" id="edit-goals-btn">设定</button>
    </div>
    <div class="task-list" id="daily-task-list">
      ${data.tasks.length === 0 
        ? '<p class="slot-hint">暂无今日行动指令，点击右上角 [↻ 刷新] 派发任务</p>' 
        : data.tasks.map((t, idx) => `
          <label class="task-item ${t.done ? 'done' : ''}">
            <input type="checkbox" data-idx="${idx}" ${t.done ? 'checked' : ''}>
            <span class="task-text">${t.text}</span>
          </label>
        `).join('')
      }
    </div>
  `;

  document.getElementById('edit-goals-btn').addEventListener('click', () => {
    const current = getDailyData().userGoals;
    const next = prompt(`输入你近期的个人目标或习惯（例如：每天喝水2L、早睡），${aiName} 会结合这些目标派发每日任务：`, current);
    if (next !== null) {
      const d = getDailyData();
      d.userGoals = next.trim();
      saveDailyData(d);
      renderTasksBoard();
    }
  });

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const idx = Number(e.target.dataset.idx);
      const d = getDailyData();
      if (!d.tasks[idx]) return;
      d.tasks[idx].done = e.target.checked;
      saveDailyData(d);
      renderTasksBoard();
      if (e.target.checked) notifyTaskCompleted(d.tasks[idx].text);
    });
  });
}

async function generateDailyTasks(forceRefresh = false) {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.apiHost) return;

  const today = new Date().toLocaleDateString('zh-CN');
  const data = getDailyData();

  if (!forceRefresh && data.lastTaskDate === today && data.tasks.length > 0) return;

  const listEl = document.getElementById('daily-task-list');
  if (listEl) listEl.innerHTML = '<p class="slot-hint">⏳ 正在接收今日行动指令...</p>';

  const userName = cfg.userName || 'USER';
  const aiName = cfg.aiName || 'AI';

  try {
    const goalPrompt = data.userGoals 
      ? `${userName} 设定的近期目标是：【${data.userGoals}】。请结合这些目标以及你们之间的日常互动，` 
      : `请结合你们之间的日常关怀与互动，`;

    const prompt = `${goalPrompt}以你（${aiName}）的口吻为 ${userName} 派发 3 个今天可以轻松完成的轻量小任务（每个任务控制在18字以内）。严格只输出纯 JSON 数组，格式如：["任务一内容", "任务二内容", "任务三内容"]。`;

    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt || `你是 ${aiName}` },
      { role: 'user', content: prompt }
    ]);

    const arrMatch = reply.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      const taskStrings = JSON.parse(arrMatch[0]);
      const latest = getDailyData();
      latest.lastTaskDate = today;
      latest.tasks = taskStrings.slice(0, 4).map(str => ({ text: String(str), done: false }));
      saveDailyData(latest);
      renderTasksBoard();
    }
  } catch (err) {
    if (listEl) listEl.innerHTML = `<p class="slot-hint" style="color:var(--accent-red);">指令获取失败: ${err.message}</p>`;
  }
}

async function notifyTaskCompleted(taskText) {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.apiHost) return;
  if (typeof isGenerating !== 'undefined' && isGenerating) return;

  window.isGenerating = true;
  const userName = cfg.userName || 'USER';
  const silentPrompt = `[系统任务反馈：${userName} 刚刚在每日任务面板勾选完成了你派发的小任务：【${taskText}】。请简短互动一下，不要提系统提示。]`;
  const aiBubble = appendMessageBubble('assistant', '▋', Date.now(), true);
  const chatBox = document.getElementById('chat-messages');

  try {
    const { messages } = buildContextPayload(silentPrompt);
    const fullReply = await callTacticalStreamAPI(messages, (partial) => {
      aiBubble.textContent = partial + ' ▋';
      chatBox.scrollTop = chatBox.scrollHeight;
    });
    aiBubble.textContent = fullReply;

    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
    history.push({ role: 'assistant', content: fullReply, time: Date.now(), isProactive: true });
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
    updateTopBarMetrics();
  } catch (e) {
    aiBubble.remove();
  } finally {
    window.isGenerating = false;
  }
}

// ==========================================
// 初始化绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderMoodBoard();
  renderTasksBoard();

  document.getElementById('refresh-tasks-btn')?.addEventListener('click', () => generateDailyTasks(true));

  // --- 贴纸编辑弹窗事件绑定 ---
  const moodModal = document.getElementById('mood-edit-modal');
  
  // 代理绑定“贴纸编辑”按钮（因为是在 renderMoodBoard 时动态生成的）
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'open-mood-edit-btn') {
      renderMoodEditList();
      moodModal.classList.remove('hidden');
    }
  });

  document.getElementById('close-mood-edit-btn')?.addEventListener('click', () => {
    moodModal.classList.add('hidden');
  });

  document.getElementById('add-mood-btn')?.addEventListener('click', () => {
    const iconInput = document.getElementById('new-mood-icon');
    const labelInput = document.getElementById('new-mood-label');
    const icon = iconInput.value.trim();
    const label = labelInput.value.trim();

    if (!icon || !label) return alert('Emoji 和贴纸文字都不能为空！');

    const list = getCustomMoods();
    if (list.length >= 10) return alert('贴纸数量已达上限 (10个)，请先删除旧的。');

    list.push({ icon, label });
    saveCustomMoods(list);
    
    renderMoodEditList(); // 刷新后台列表
    renderMoodBoard();    // 刷新前台面板
    
    iconInput.value = '';
    labelInput.value = '';
  });

  setTimeout(() => { generateDailyTasks(false); }, 1500);
});