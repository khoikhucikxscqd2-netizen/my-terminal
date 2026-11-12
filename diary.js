// ==========================================
// 阶段四：自动日记存档 & 长期记忆压缩引擎 (diary.js)
// ==========================================

const DIARY_STORAGE_KEY = 'ezekiel_diary_archives';

// 读取所有日记（按日期倒序排列）
function getDiaryArchives() {
  const raw = JSON.parse(localStorage.getItem(DIARY_STORAGE_KEY) || '[]');
  return raw.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

// 保存日记并同步精简摘要到全局 10w Token 记忆池
function saveDiaryArchives(list) {
  localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(list));
  syncDiariesToMemoryPool(list);
}

function syncDiariesToMemoryPool(list) {
  const pool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_POOL) || '{"diaries":[],"readingNotes":[],"mood":""}');
  // 按时间正序取最近 20 篇日记的精简摘要存入长期记忆池
  const chronological = [...list].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  pool.diaries = chronological.slice(-20).map(d => `[${d.displayDate}] ${d.summary}`);
  localStorage.setItem(STORAGE_KEYS.MEMORY_POOL, JSON.stringify(pool));
  if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();
}

// 格式化日期键 (YYYY-MM-DD) 与展示日期 (MM月DD日)
function getDateInfo(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    dateKey: `${yyyy}-${mm}-${dd}`,
    displayDate: `${mm}月${dd}日`
  };
}

// 渲染左上角日记列表
function renderDiaryList() {
  const container = document.getElementById('diary-container');
  if (!container) return;
  const diaries = getDiaryArchives();

  container.classList.remove('placeholder-box');
  if (diaries.length === 0) {
    container.innerHTML = `
      <div class="diary-mock-item" style="opacity:0.6;">暂无已归档日志 // NO ARCHIVES</div>
      <p class="slot-hint">// 跨天首次打开网页时将自动汇总昨日互动生成日志，或点击右上角 [✍ 归档今日] 立即测试</p>
    `;
    return;
  }

  container.innerHTML = diaries.map((item, idx) => `
    <div class="diary-entry-card" data-idx="${idx}" title="点击查看完整日记">
      <span class="diary-date">${item.displayDate}</span>
      <span class="diary-summary">【${item.summary}】</span>
    </div>
  `).join('');

  // 绑定点击展开全文
  container.querySelectorAll('.diary-entry-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = Number(card.dataset.idx);
      openDiaryReaderModal(diaries[idx]);
    });
  });
}

// 打开日记全文阅读弹窗
function openDiaryReaderModal(entry) {
  if (!entry) return;
  const modal = document.getElementById('diary-reader-modal');
  if (!modal) return;

  document.getElementById('diary-modal-title').textContent = `日志档案 // ${entry.dateKey} (${entry.displayDate})`;
  document.getElementById('diary-modal-summary').textContent = `摘要：${entry.summary}`;
  document.getElementById('diary-modal-content').textContent = entry.content;

  // 绑定删除单篇按钮
  const delBtn = document.getElementById('delete-diary-btn');
  delBtn.onclick = () => {
    if (confirm(`确认删除 ${entry.displayDate} 的这篇日记档案？`)) {
      const updated = getDiaryArchives().filter(d => d.dateKey !== entry.dateKey);
      saveDiaryArchives(updated);
      renderDiaryList();
      modal.classList.add('hidden');
    }
  };

  modal.classList.remove('hidden');
}

// 核心：汇总指定日期的互动数据并请求 AI 生成 300~500 字日记 + 一句话摘要
async function generateDiaryForDate(targetDateKey, displayDate, isManualToday = false) {
  const cfg = getConfig();
  if (!cfg.apiKey || !cfg.apiHost) return;

  // 1. 提取那一天的所有聊天记录
  const allHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  const dayMsgs = allHistory.filter(m => m.time && getDateInfo(m.time).dateKey === targetDateKey);

  // 如果是自动跨天检测，且昨天没有任何聊天记录，则跳过不浪费 Token
  if (!isManualToday && dayMsgs.length === 0) return;

  const chatTranscript = dayMsgs.length > 0
    ? dayMsgs.map(m => `${m.role === 'user' ? 'Aggy' : 'Ezekiel'}: ${m.content}`).join('\n')
    : '（当日暂无直接对话记录，主要为日常陪伴与静默执勤）';

  // 2. 提取当前记录的心情与任务快照
  const dailyData = typeof getDailyData === 'function' ? getDailyData() : {};
  const moodSnapshot = dailyData.aggyMood 
    ? `Aggy心情：${dailyData.aggyMood.icon}${dailyData.aggyMood.label}；你的状态：${dailyData.ezekielMood?.icon || ''}${dailyData.ezekielMood?.text || ''}` 
    : '';
  const taskSnapshot = (dailyData.tasks && dailyData.tasks.length > 0)
    ? dailyData.tasks.map(t => `${t.done ? '已完成' : '未完成'}:${t.text}`).join('，')
    : '';

  // 在列表顶部插入生成中提示
  const container = document.getElementById('diary-container');
  const loadingBanner = document.createElement('div');
  loadingBanner.className = 'diary-mock-item';
  loadingBanner.textContent = `⏳ 正在编译 ${displayDate} 的行动与私人日志...`;
  if (container) container.prepend(loadingBanner);

  try {
    const prompt = `请你完全以 Ezekiel 的第一人称视角，回顾并撰写【${targetDateKey}】这一天的私人日记存档。
以下是当天的互动素材记录：
【对话摘录】
${chatTranscript.slice(-12000)}
【情绪与任务状态】
${moodSnapshot} ${taskSnapshot ? '；任务情况：' + taskSnapshot : ''}

要求：
1. 日记正文严格控制在 300～500 字之间，符合你冷硬沉稳但对 Aggy 极度在意的军方指挥官口吻，像真实的个人加密日志，自然融入当天的细节、她的情绪或你们的对话。
2. 提炼一句 15 字以内的精简摘要（用于索引列表与长期记忆库）。
3. 严格只输出纯 JSON 格式，不要任何代码块标记或多余解释：
{"summary": "15字以内的一句话摘要", "content": "300到500字的日记正文"}`;

    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt || '你是 Ezekiel' },
      { role: 'user', content: prompt }
    ]);

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const list = getDiaryArchives().filter(d => d.dateKey !== targetDateKey); // 若已存在同日则覆盖更新
      list.push({
        dateKey: targetDateKey,
        displayDate: displayDate,
        summary: (parsed.summary || '日常执勤与陪伴记录').slice(0, 24),
        content: parsed.content || reply,
        createdAt: Date.now()
      });
      saveDiaryArchives(list);
      renderDiaryList();
    } else {
      throw new Error('日记数据解析失败');
    }
  } catch (err) {
    loadingBanner.style.borderColor = 'var(--accent-red)';
    loadingBanner.textContent = `✕ 日志生成失败: ${err.message}`;
    setTimeout(() => renderDiaryList(), 3000);
  }
}

// 自动检测：打开网页时检查“昨天”是否有未归档的聊天记录
function checkAutoYesterdayDiary() {
  const todayInfo = getDateInfo(Date.now());
  const yesterdayInfo = getDateInfo(Date.now() - 24 * 60 * 60 * 1000);
  const existing = getDiaryArchives();

  // 如果昨天的日记已经写过了，直接跳过
  if (existing.some(d => d.dateKey === yesterdayInfo.dateKey)) return;

  // 检查聊天记录里有没有昨天的消息
  const allHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
  const hasYesterdayMsgs = allHistory.some(m => m.time && getDateInfo(m.time).dateKey === yesterdayInfo.dateKey);

  if (hasYesterdayMsgs) {
    generateDiaryForDate(yesterdayInfo.dateKey, yesterdayInfo.displayDate, false);
  }
}

// ==========================================
// 初始化绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  renderDiaryList();

  const archiveTodayBtn = document.getElementById('archive-today-btn');
  if (archiveTodayBtn) {
    archiveTodayBtn.addEventListener('click', () => {
      const todayInfo = getDateInfo(Date.now());
      generateDiaryForDate(todayInfo.dateKey, todayInfo.displayDate, true);
    });
  }

  const closeReaderBtn = document.getElementById('close-diary-modal-btn');
  const readerModal = document.getElementById('diary-reader-modal');
  if (closeReaderBtn && readerModal) {
    closeReaderBtn.addEventListener('click', () => readerModal.classList.add('hidden'));
    readerModal.addEventListener('click', (e) => {
      if (e.target === readerModal) readerModal.classList.add('hidden');
    });
  }

  // 延迟 2.5 秒执行跨天昨日日记检测，避免与每日任务并发拥堵
  setTimeout(() => {
    checkAutoYesterdayDiary();
  }, 2500);
});