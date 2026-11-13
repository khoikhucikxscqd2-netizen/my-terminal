// ==========================================
// 独立扩展模块：纪念日多档案 & 扩展中控台
// ==========================================

const ANNI_STORAGE_KEY = 'ezekiel_anniversary_data';

// 单个纪念日默认模板
const DEFAULT_ANNI_ITEM = {
  id: '',
  title: '新的纪念日',
  date: '2018-01-01',
  mode: 'countup',
  bgImage: '',
  lastTriggeredYear: ''
};

let currentAnniIndex = 0; // 当前正在查看第几个纪念日
let pendingBgImage = null; // 暂存刚上传还没保存的背景图

// 读取所有纪念日档案（如果旧版本是单个对象，自动转成数组以防崩溃）
function getAnniList() {
  const saved = localStorage.getItem(ANNI_STORAGE_KEY);
  if (!saved) return [{ ...DEFAULT_ANNI_ITEM, id: Date.now().toString() }];
  
  try {
    let parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      // 兼容刚写的旧版本单条数据
      parsed.id = Date.now().toString();
      parsed = [parsed];
    }
    return parsed.length > 0 ? parsed : [{ ...DEFAULT_ANNI_ITEM, id: Date.now().toString() }];
  } catch (e) {
    return [{ ...DEFAULT_ANNI_ITEM, id: Date.now().toString() }];
  }
}

function saveAnniList(list) {
  localStorage.setItem(ANNI_STORAGE_KEY, JSON.stringify(list));
  // 顺便往全局云端推一下（利用 api.js 的劫持或手动推）
  if (typeof triggerCloudPush === 'function') triggerCloudPush();
}

// 获取当前严格北京时间 (UTC+8)
function getBeijingTimeInfo() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const bjDate = new Date(utcMs + 8 * 3600000);
  const yyyy = bjDate.getFullYear();
  const mm = String(bjDate.getMonth() + 1).padStart(2, '0');
  const dd = String(bjDate.getDate()).padStart(2, '0');
  return { dateObj: bjDate, yearStr: String(yyyy), monthDayStr: `${mm}-${dd}`, fullDateStr: `${yyyy}-${mm}-${dd}` };
}

// 计算天数差
function calculateAnniDays(data) {
  if (!data.date) return { days: 0, label: '请设置日期', isToday: false };
  const bj = getBeijingTimeInfo();
  const todayZero = new Date(`${bj.fullDateStr}T00:00:00`);
  const targetParts = data.date.split('-');
  if (targetParts.length !== 3) return { days: 0, label: '日期格式有误', isToday: false };

  const targetMonthDay = `${targetParts[1]}-${targetParts[2]}`;
  const isToday = (bj.monthDayStr === targetMonthDay);

  if (data.mode === 'yearly') {
    let nextTarget = new Date(`${bj.yearStr}-${targetMonthDay}T00:00:00`);
    if (nextTarget < todayZero) {
      nextTarget = new Date(`${Number(bj.yearStr) + 1}-${targetMonthDay}T00:00:00`);
    }
    const diffDays = Math.round((nextTarget - todayZero) / (1000 * 3600 * 24));
    return { days: diffDays, label: diffDays === 0 ? '就是今天！' : `距离下一个纪念日 (${targetMonthDay})`, isToday };
  } else {
    const startZero = new Date(`${data.date}T00:00:00`);
    const diffDays = Math.floor((todayZero - startZero) / (1000 * 3600 * 24));
    return { days: Math.max(0, diffDays), label: `起始日: ${data.date}`, isToday };
  }
}

// 渲染多纪念日顶部的横向标签栏
function renderAnniListBar() {
  const container = document.getElementById('anni-list-container');
  if (!container) return;
  const list = getAnniList();
  
  container.innerHTML = list.map((item, idx) => `
    <div class="anni-chip ${idx === currentAnniIndex ? 'active' : ''}" data-idx="${idx}">
      ${item.title.substring(0, 6) || '未命名'}
    </div>
  `).join('') + `<div class="anni-add-btn" id="add-anni-btn">+ 新增</div>`;

  // 绑定切换事件
  container.querySelectorAll('.anni-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      currentAnniIndex = Number(e.target.dataset.idx);
      loadAnniForm();
    });
  });

  // 绑定新增事件
  document.getElementById('add-anni-btn').addEventListener('click', () => {
    const list = getAnniList();
    if (list.length >= 6) return alert('档案库最多支持 6 个同时监控的纪念日。');
    list.push({ ...DEFAULT_ANNI_ITEM, id: Date.now().toString() });
    saveAnniList(list);
    currentAnniIndex = list.length - 1;
    loadAnniForm();
  });
}

// 渲染相框及下方的表单（核心刷新）
function loadAnniForm() {
  renderAnniListBar();
  const list = getAnniList();
  if (!list[currentAnniIndex]) currentAnniIndex = 0;
  const data = list[currentAnniIndex];

  pendingBgImage = data.bgImage; // 加载时重置暂存区

  // 填充相框
  const calc = calculateAnniDays(data);
  document.getElementById('anniversary-title').textContent = data.title || '重要纪念日';
  document.getElementById('anniversary-countdown').innerHTML = data.mode === 'yearly' && calc.days === 0
    ? `TODAY <span>// 快乐</span>`
    : `${calc.days} <span>天</span>`;
  document.getElementById('anniversary-hint').textContent = calc.label;
  document.getElementById('anniversary-bg').style.backgroundImage = data.bgImage ? `url(${data.bgImage})` : 'none';

  // 填发表单
  document.getElementById('anni-title-input').value = data.title || '';
  document.getElementById('anni-date-input').value = data.date || '';
  document.getElementById('anni-mode-input').value = data.mode || 'countup';
}

// 保存当前表单的修改
function saveCurrentAnni() {
  const list = getAnniList();
  if (!list[currentAnniIndex]) return;
  
  list[currentAnniIndex].title = document.getElementById('anni-title-input').value.trim() || '未命名纪念日';
  list[currentAnniIndex].date = document.getElementById('anni-date-input').value || '2018-01-01';
  list[currentAnniIndex].mode = document.getElementById('anni-mode-input').value || 'countup';
  list[currentAnniIndex].bgImage = pendingBgImage;

  saveAnniList(list);
  loadAnniForm();
  alert('已保存该纪念日！');
}

// 删除当前纪念日
function deleteCurrentAnni() {
  const list = getAnniList();
  if (list.length <= 1) return alert('档案里至少需要保留一个纪念日。');
  if (confirm(`确定要删除【${list[currentAnniIndex].title}】吗？`)) {
    list.splice(currentAnniIndex, 1);
    currentAnniIndex = Math.max(0, currentAnniIndex - 1);
    saveAnniList(list);
    loadAnniForm();
  }
}

// 遍历检查今天是否命中某个纪念日（静默卡点）
async function checkAndTriggerAnniversary() {
  const list = getAnniList();
  const bj = getBeijingTimeInfo();
  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  if (!cfg.apiKey || typeof callTacticalStreamAPI === 'undefined') return;
  if (typeof isGenerating !== 'undefined' && window.isGenerating) return;

  for (let i = 0; i < list.length; i++) {
    const data = list[i];
    const calc = calculateAnniDays(data);
    
    // 如果今天是它的日子，并且今年还没触发过
    if (calc.isToday && data.lastTriggeredYear !== bj.yearStr) {
      // 打个标记防连发
      data.lastTriggeredYear = bj.yearStr;
      list[i] = data;
      saveAnniList(list);

      window.isGenerating = true;
      const userName = cfg.userName || 'USER';
      const aiName = cfg.aiName || 'AI';
      const yearDiff = Number(bj.yearStr) - Number(data.date.split('-')[0]);
      const milestoneNote = yearDiff > 0 ? `（这是第 ${yearDiff} 周年）` : '';

      const prompt = `[系统纪念日事件触发：现在是北京时间 ${bj.fullDateStr} 零点，今天是你们的重要日子【${data.title}】${milestoneNote}！请主动发一条专属消息给 ${userName}。自然聊天口吻，不要提系统指令。]`;

      const aiBubble = appendMessageBubble('assistant', '✨ 正在接收纪念日脉冲信号...', Date.now(), true, false);
      const chatBox = document.getElementById('chat-messages');

      try {
        const { messages } = buildContextPayload(prompt);
        const fullReply = await callTacticalStreamAPI(messages, (partial) => {
          if (aiBubble) { aiBubble.textContent = partial + ' ▋'; if (chatBox) chatBox.scrollTop = chatBox.scrollHeight; }
        });
        
        if (aiBubble) {
          const contentCol = aiBubble.parentElement; aiBubble.remove();
          const parts = splitIntoBubbles(fullReply);
          parts.forEach(part => {
            const b = document.createElement('div'); b.className = 'msg-bubble msg-ai'; b.style.marginBottom = '6px';
            b.innerHTML = formatMessageContent(part); contentCol.appendChild(b);
          });
        }
        
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
        history.push({ role: 'assistant', content: fullReply, time: Date.now(), isProactive: true });
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
        if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();

      } catch (err) {
        if (aiBubble) aiBubble.remove();
        // 失败回滚
        data.lastTriggeredYear = '';
        list[i] = data;
        saveAnniList(list);
      } finally {
        window.isGenerating = false;
      }
      
      // 一天只要成功发了一条纪念日消息，就不再遍历其他同一天的纪念日了，防止刷屏
      break; 
    }
  }
}

function compressFrameBg(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
      const scale = Math.min(1, 720 / img.width);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    }; img.src = e.target.result;
  }; reader.readAsDataURL(file);
}

// 初始化绑定
document.addEventListener('DOMContentLoaded', () => {
  // Hub 中控台逻辑
  const hubModal = document.getElementById('extension-hub-modal');
  document.getElementById('open-modules-btn')?.addEventListener('click', () => hubModal?.classList.remove('hidden'));
  document.getElementById('close-hub-btn')?.addEventListener('click', () => hubModal?.classList.add('hidden'));

  // 从中控台点进纪念日
  const anniModal = document.getElementById('anniversary-modal');
  document.getElementById('btn-open-anni')?.addEventListener('click', () => {
    hubModal?.classList.add('hidden');
    loadAnniForm();
    anniModal?.classList.remove('hidden');
  });
  document.getElementById('close-anni-modal-btn')?.addEventListener('click', () => anniModal?.classList.add('hidden'));

  // 纪念日表单事件
  document.getElementById('anni-upload-btn')?.addEventListener('click', () => document.getElementById('anni-img-input')?.click());
  document.getElementById('anni-img-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    compressFrameBg(file, (base64) => {
      pendingBgImage = base64;
      document.getElementById('anniversary-bg').style.backgroundImage = `url(${base64})`;
    }); e.target.value = '';
  });

  document.getElementById('save-anni-btn')?.addEventListener('click', saveCurrentAnni);
  document.getElementById('delete-anni-btn')?.addEventListener('click', deleteCurrentAnni);

  setTimeout(checkAndTriggerAnniversary, 3000);
  setInterval(checkAndTriggerAnniversary, 30000);
});