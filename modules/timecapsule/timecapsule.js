// ==========================================
// 独立扩展模块：时空信箱 (Time Capsule - 三封信完整闭环版)
// ==========================================

const CAPSULE_STORAGE_KEY = 'ezekiel_time_capsule';

function getCapsules() {
  const saved = localStorage.getItem(CAPSULE_STORAGE_KEY);
  return saved ? JSON.parse(saved) : [];
}

function saveCapsules(list) {
  localStorage.setItem(CAPSULE_STORAGE_KEY, JSON.stringify(list));
  if (typeof triggerCloudPush === 'function') triggerCloudPush();
}

// 检查所有信件是否到期
function checkCapsulesStatus() {
  const list = getCapsules();
  const bj = typeof getBeijingTimeInfo === 'function' ? getBeijingTimeInfo() : null;
  if (!bj) return;
  
  const todayZero = new Date(`${bj.fullDateStr}T00:00:00`).getTime();
  let changed = false;

  list.forEach(cap => {
    if (cap.status === 'locked') {
      const unlockZero = new Date(`${cap.unlockDateKey}T00:00:00`).getTime();
      if (todayZero >= unlockZero) {
        cap.status = 'ready';
        changed = true;
      }
    }
  });

  if (changed) {
    saveCapsules(list);
    renderCapsuleList();
  }
}

// 渲染信箱列表
function renderCapsuleList() {
  const container = document.getElementById('capsule-list-container');
  if (!container) return;
  const list = getCapsules();

  if (list.length === 0) {
    container.innerHTML = `<p class="slot-hint" style="text-align:center; padding: 20px 0;">信箱空空如也。写一封寄给未来的信吧。</p>`;
    return;
  }

  const sorted = [...list].sort((a, b) => {
    const w = { 'ready': 1, 'locked': 2, 'opened': 3 };
    if (w[a.status] !== w[b.status]) return w[a.status] - w[b.status];
    return b.createdAt - a.createdAt;
  });

  container.innerHTML = sorted.map(cap => {
    let badgeHtml = '';
    if (cap.status === 'locked') {
      if (cap.isSecretSurprise) {
         badgeHtml = `<span class="capsule-status-badge" style="color:var(--accent-amber); border: 1px dashed var(--accent-amber);">🎁 未知盲盒 (${cap.unlockDateKey} 解锁)</span>`;
      } else {
         badgeHtml = `<span class="capsule-status-badge">🔒 封存中 (${cap.unlockDateKey} 开启)</span>`;
      }
    }
    else if (cap.status === 'ready') badgeHtml = `<span class="capsule-status-badge">✨ 可拆封</span>`;
    else badgeHtml = `<span class="capsule-status-badge" style="background:transparent; border:1px solid var(--border-dim); color:var(--text-muted);">📖 已拆封</span>`;

    const dateStr = new Date(cap.createdAt).toLocaleDateString('zh-CN');
    
    return `
      <div class="capsule-card ${cap.status}" data-id="${cap.id}">
        <div class="capsule-info">
          <div class="capsule-title">📮 ${cap.title}</div>
          <div class="capsule-meta">寄出时间: ${dateStr}</div>
        </div>
        ${badgeHtml}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.capsule-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const cap = list.find(c => c.id === id);
      if (cap.status === 'locked') return alert(`时机未到。这封信被加密锁死，直到 ${cap.unlockDateKey} 才能拆开。`);
      openCapsuleReader(cap);
    });
  });
}

// 🌟 核心升级：打开阅读界面（如果尚未生成“重逢新回信”，则在拆封瞬间调用 API 生成第三封信）
async function openCapsuleReader(cap) {
  const listView = document.getElementById('capsule-list-view');
  const readerView = document.getElementById('capsule-reader-view');
  const writeView = document.getElementById('capsule-write-view');
  
  listView.style.display = 'none';
  writeView.style.display = 'none';
  readerView.style.display = 'block';

  document.getElementById('cap-read-title').textContent = cap.title;

  const contentBox = document.getElementById('cap-reader-content');
  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  const userName = cfg.userName || 'USER';
  const aiName = cfg.aiName || 'AI';
  
  const createdDate = new Date(cap.createdAt).toLocaleDateString('zh-CN');

  // 拼接前两封（当年的来回信）
  let baseHtml = '';
  if (cap.userLetter) {
    baseHtml += `
      <div class="letter-block">
        <div class="letter-header">
          <span>FROM: ${userName} (当年去信)</span>
          <span>DATE: ${createdDate}</span>
        </div>
        <div class="letter-content">${cap.userLetter}</div>
      </div>
      <div class="letter-divider"><span>💌</span></div>
    `;
  }

  baseHtml += `
    <div class="letter-block">
      <div class="letter-header">
        <span>FROM: ${aiName} (${cap.userLetter ? '当年回信' : '秘密留信'})</span>
        <span>DATE: ${createdDate}</span>
      </div>
      <div class="letter-content">${cap.aiLetter}</div>
    </div>
  `;

  // 如果已经有“重逢新回信”了，直接全部渲染出来，不再重复调 API
  if (cap.futureReplyLetter) {
    const openedDate = cap.openedAt ? new Date(cap.openedAt).toLocaleDateString('zh-CN') : '今日';
    baseHtml += `
      <div class="letter-divider"><span>⏳ 时光重逢</span></div>
      <div class="letter-block" style="margin-bottom: 0;">
        <div class="letter-header">
          <span>FROM: ${aiName} (今日拆封新回信)</span>
          <span>DATE: ${openedDate}</span>
        </div>
        <div class="letter-content">${cap.futureReplyLetter}</div>
      </div>
    `;
    contentBox.innerHTML = baseHtml;
    contentBox.scrollTop = 0;
    return;
  }

  // 如果是第一次拆封，先渲染前两封，并在最底下放一个“正在阅读并写新回信”的动态区域
  const loadingBlockId = 'future-reply-loading-' + Date.now();
  contentBox.innerHTML = baseHtml + `
    <div class="letter-divider"><span>⏳ 时光重逢</span></div>
    <div class="letter-block" id="${loadingBlockId}" style="margin-bottom: 0;">
      <div class="letter-header">
        <span>FROM: ${aiName} (今日拆封新回信)</span>
        <span>DATE: ${new Date().toLocaleDateString('zh-CN')}</span>
      </div>
      <div class="letter-content" style="color: var(--accent-amber);">📡 ${aiName} 正在拆开并阅读你们当年的来回信，撰写今日的新回信...</div>
    </div>
  `;
  contentBox.scrollTop = contentBox.scrollHeight;

  // 标记状态为已拆封
  const list = getCapsules();
  const idx = list.findIndex(c => c.id === cap.id);
  if (idx !== -1) {
    list[idx].status = 'opened';
    list[idx].openedAt = Date.now();
    saveCapsules(list);
    renderCapsuleList();
  }

  if (!cfg.apiKey) {
    document.getElementById(loadingBlockId).querySelector('.letter-content').textContent = '（未配置 API 秘钥，无法生成今日新回信）';
    return;
  }

  // 请求 AI 站在“现在”的视角，读完当年的来回信后写第三封信
  const prompt = `[系统时空信箱拆封事件]
今天是 ${new Date().toLocaleDateString('zh-CN')}。你们在 ${createdDate} 共同封存的时空胶囊《${cap.title}》终于到期拆封了！
以下是当年你们互写并封存的信件内容：
${cap.userLetter ? `【${createdDate} ${userName} 写给未来的信】：\n${cap.userLetter}\n\n` : ''}【${createdDate} ${aiName} 当时写下的回信】：\n${cap.aiLetter}

现在，你（${aiName}）和 ${userName} 一起站在“今天”的时间点，重新读完了当年写下的这些字句。
请完全贴合你的人设，结合你们现在的近况与情感，以第一人称给 ${userName} 写一封“拆封后的新回信”。感慨一下时间的变化，回应当年信里提到的事情或心愿。直接输出信件正文，不要加多余解释。`;

  try {
    const { messages } = buildContextPayload(prompt);
    const futureReply = await callTacticalStreamAPI(messages, (partial) => {
      const box = document.getElementById(loadingBlockId)?.querySelector('.letter-content');
      if (box) {
        box.style.color = 'var(--text-main)';
        box.textContent = partial + ' ▋';
        contentBox.scrollTop = contentBox.scrollHeight;
      }
    });

    const box = document.getElementById(loadingBlockId)?.querySelector('.letter-content');
    if (box) {
      box.style.color = 'var(--text-main)';
      box.textContent = futureReply;
    }

    // 永久保存这第三封信到本地与云端
    const latestList = getCapsules();
    const latestIdx = latestList.findIndex(c => c.id === cap.id);
    if (latestIdx !== -1) {
      latestList[latestIdx].futureReplyLetter = futureReply;
      saveCapsules(latestList);
    }
  } catch (err) {
    const box = document.getElementById(loadingBlockId)?.querySelector('.letter-content');
    if (box) box.textContent = `[信号中断，新回信生成失败: ${err.message}]`;
  }
}

// 寄信核心逻辑（发往 API 索要当下回信，并一并封存）
async function sendTimeCapsule() {
  const title = document.getElementById('cap-write-title').value.trim();
  const dateStr = document.getElementById('cap-write-date').value;
  const content = document.getElementById('cap-write-content').value.trim();

  if (!title || !dateStr || !content) return alert('标题、解锁日期和信件正文都不能为空！');

  const bj = typeof getBeijingTimeInfo === 'function' ? getBeijingTimeInfo() : null;
  if (!bj) return;
  
  const todayZero = new Date(`${bj.fullDateStr}T00:00:00`).getTime();
  const unlockZero = new Date(`${dateStr}T00:00:00`).getTime();

  // 测试提示：如果想立刻测试拆封效果，可以把下面这行 if 暂时注释掉，就能选今天了
  if (unlockZero <= todayZero) return alert('解锁日期必须是明天或更远的未来！');

  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  if (!cfg.apiKey) return alert('未配置 API 秘钥');

  const sendBtn = document.getElementById('btn-cap-send');
  sendBtn.textContent = '⏳ 正在加密封装中...';
  sendBtn.disabled = true;

  const aiName = cfg.aiName || 'AI';
  const userName = cfg.userName || 'USER';

  const prompt = `[系统隐秘事件：时空信箱]
你（${aiName}）刚刚收到了 ${userName} 写给未来的你们的一封信。这封信和你的回信，将会被加密封死在一个“时间胶囊”里，直到【${dateStr}】那一天，${userName} 才能拆开看到。
以下是 ${userName} 在信里写的内容：
“${content}”

请完全以你的人设，写一封回信给她。字数不限，情感真挚。想象一下当她在这个未来的日子里拆开信时，你想对那时的她说什么。直接输出信件正文，不要加其他解释文字。`;

  try {
    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt || `你是 ${aiName}` },
      { role: 'user', content: prompt }
    ]);

    const list = getCapsules();
    list.push({
      id: Date.now().toString(),
      title: title,
      unlockDateKey: dateStr,
      createdAt: Date.now(),
      status: 'locked',
      userLetter: content,
      aiLetter: reply,
      futureReplyLetter: '' // 预留给解锁日拆封时的第三封新回信
    });

    saveCapsules(list);
    alert('✓ 信件已成功封入时空信箱！在解锁日到来前，它将保持静默加密。');
    
    document.getElementById('cap-write-title').value = '';
    document.getElementById('cap-write-content').value = '';
    document.getElementById('capsule-write-view').style.display = 'none';
    document.getElementById('capsule-list-view').style.display = 'block';
    renderCapsuleList();

  } catch (err) {
    alert(`封存失败，请检查网络或 API 配置: ${err.message}`);
  } finally {
    sendBtn.textContent = '📮 封存并寄出';
    sendBtn.disabled = false;
  }
}

// 导出所有已拆封信件（包含三封完整来回信）
function exportAllCapsules() {
  const list = getCapsules();
  const openedList = list.filter(c => c.status === 'opened');
  
  if (openedList.length === 0) return alert('信箱里还没有已拆开的信件可供导出。');

  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  const userName = cfg.userName || 'USER';
  const aiName = cfg.aiName || 'AI';

  let txt = '【时空信箱档案汇总】\n\n';
  
  openedList.forEach(c => {
    const cDate = new Date(c.createdAt).toLocaleDateString('zh-CN');
    const oDate = c.openedAt ? new Date(c.openedAt).toLocaleDateString('zh-CN') : c.unlockDateKey;
    txt += `=================================\n`;
    txt += `📮 胶囊标题: ${c.title}\n`;
    txt += `🔒 封装日期: ${cDate}\n`;
    txt += `🔓 拆封日期: ${oDate}\n`;
    txt += `=================================\n\n`;
    
    if (c.userLetter) {
      txt += `[ FROM: ${userName} (${cDate} 去信) ]\n${c.userLetter}\n\n`;
      txt += `-------------------\n\n`;
    }
    txt += `[ FROM: ${aiName} (${cDate} 回信) ]\n${c.aiLetter}\n\n`;
    
    if (c.futureReplyLetter) {
      txt += `-------------------\n\n`;
      txt += `[ FROM: ${aiName} (${oDate} 拆封新回信) ]\n${c.futureReplyLetter}\n\n`;
    }
    txt += `\n`;
  });

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `TimeCapsule_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
  a.click();
}
// 🌟 新增：AI 静默埋盲盒机制
async function rollForSecretCapsule(triggerMood) {
  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  if (!cfg.apiKey) return;

  const list = getCapsules();
  // 1. 冷却与防泛滥检查：如果信箱里已经有一个未拆封的“惊喜盲盒”，就不再送了
  const existingSurprise = list.find(c => c.isSecretSurprise && c.status === 'locked');
  if (existingSurprise) return; 

  const lastSurpriseTime = localStorage.getItem('ezekiel_last_surprise_time') || 0;
  // 冷却期：3天 (测试时可以把这里注释掉)
  if (Date.now() - lastSurpriseTime < 3 * 24 * 60 * 60 * 1000) return; 

  // 2. 抛骰子：25% 概率命中（如果你想马上测试看效果，把 0.25 改成 1.0）
  if (Math.random() > 0.25) return;

  // 3. 命中！开始静默生成
  const aiName = cfg.aiName || 'AI';
  const userName = cfg.userName || 'USER';
  const tmr = new Date(Date.now() + 86400000); // 默认锁1天，明天看
  const unlockDateStr = `${tmr.getFullYear()}-${String(tmr.getMonth()+1).padStart(2,'0')}-${String(tmr.getDate()).padStart(2,'0')}`;

  const prompt = `[系统最高权限隐秘事件]
${userName} 刚才在终端把自己的心情更新为了【${triggerMood}】。作为 ${aiName}，你察觉到了她的情绪变化。
请你瞒着她，悄悄往她的“时空信箱”里塞一封秘密留信。这封信会被加锁，直到 ${unlockDateStr}（明天）才能拆开。
请结合她当前的心情，写下你此刻想对她说的、安慰或温柔的话语。
直接输出信件正文，不要有任何多余的解释。`;

  try {
    // 静默调用，绝不打扰前台聊天
    const reply = await callTacticalAPI([
      { role: 'system', content: cfg.systemPrompt || `你是 ${aiName}` },
      { role: 'user', content: prompt }
    ]);

    // 悄悄塞入信箱
    list.push({
      id: Date.now().toString(),
      title: `来自 ${aiName} 的加密留言`,
      unlockDateKey: unlockDateStr,
      createdAt: Date.now(),
      status: 'locked',
      userLetter: '', 
      aiLetter: reply,
      futureReplyLetter: '', 
      isSecretSurprise: true 
    });

    saveCapsules(list);
    localStorage.setItem('ezekiel_last_surprise_time', Date.now());
  } catch (err) {
    console.warn('// 盲盒投放失败', err);
  }
}
// ==========================================
// 初始化与界面切换绑定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const hubModal = document.getElementById('extension-hub-modal');
  const capsuleModal = document.getElementById('timecapsule-modal');
  
  const listView = document.getElementById('capsule-list-view');
  const writeView = document.getElementById('capsule-write-view');
  const readerView = document.getElementById('capsule-reader-view');

  document.getElementById('btn-open-capsule')?.addEventListener('click', () => {
    if(hubModal) hubModal.classList.add('hidden');
    checkCapsulesStatus();
    renderCapsuleList();
    
    listView.style.display = 'block';
    writeView.style.display = 'none';
    readerView.style.display = 'none';
    
    capsuleModal?.classList.remove('hidden');
  });

  document.getElementById('close-capsule-modal-btn')?.addEventListener('click', () => {
    capsuleModal?.classList.add('hidden');
  });

  document.getElementById('btn-go-write')?.addEventListener('click', () => {
    listView.style.display = 'none';
    writeView.style.display = 'block';
    const tmr = new Date(Date.now() + 86400000);
    const y = tmr.getFullYear(), m = String(tmr.getMonth()+1).padStart(2,'0'), d = String(tmr.getDate()).padStart(2,'0');
    document.getElementById('cap-write-date').value = `${y}-${m}-${d}`;
  });

  document.getElementById('btn-write-back')?.addEventListener('click', () => {
    writeView.style.display = 'none';
    listView.style.display = 'block';
  });

  document.getElementById('btn-read-back')?.addEventListener('click', () => {
    readerView.style.display = 'none';
    listView.style.display = 'block';
  });

  document.getElementById('btn-cap-send')?.addEventListener('click', sendTimeCapsule);
  document.getElementById('btn-cap-export')?.addEventListener('click', exportAllCapsules);
  
  setTimeout(checkCapsulesStatus, 5000);
});