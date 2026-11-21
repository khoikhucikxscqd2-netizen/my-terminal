// ==========================================
// 独立扩展插件：查手机 (Phone Inspection)
// ==========================================
(function() {
  const CACHE_KEY = 'ezekiel_phone_cache';
  const SETTINGS_KEY = 'ezekiel_phone_settings';
  const PHOTOS_KEY = 'terminal_phone_photos'; // 纯本地不云同步

  let phoneData = null;
  let phoneSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{"pin":"0000","loc":""}');
  let curPin = "";

  // 1. 动态生成整台手机的 HTML 结构并塞入页面
  const phoneHTML = `
    <div class="modal-backdrop hidden" id="phone-modal-backdrop">
      <div id="phone-wrapper">
        <div class="speaker-notch"><div class="lens"></div></div>
        
        <!-- 锁屏 -->
        <div id="p-lock-screen" class="p-screen">
          <div class="p-status-bar">
            <span>Terminal 5G</span><div class="icons"><span>🔒</span><span>100%</span></div>
          </div>
          <div style="margin-top: 15px;">
            <div class="p-lock-clock" id="p-lock-time">22:45</div>
            <div class="p-lock-date" id="p-lock-date">10月26日 星期一</div>
          </div>
          <div class="p-lock-alert" id="p-lock-alert-box" style="display:none;">
            <div class="badge">💬</div>
            <div style="font-size: 12px; color: #ddd; flex: 1;">
              <b style="color:#fff;" id="p-lock-sender"></b> · 刚刚<br>
              <span id="p-lock-msg"></span>
            </div>
          </div>
          <div>
            <div class="p-dots">
              <span class="p-dot" id="p-dp0"></span><span class="p-dot" id="p-dp1"></span>
              <span class="p-dot" id="p-dp2"></span><span class="p-dot" id="p-dp3"></span>
            </div>
            <div class="p-numpad" id="p-numpad-grid">
              ${[1,2,3,4,5,6,7,8,9].map(n => `<div class="p-num-key" onclick="pPressKey('${n}')">${n}</div>`).join('')}
              <div class="p-num-key" style="background:none;font-size:14px;" onclick="pClearPin()">清除</div>
              <div class="p-num-key" onclick="pPressKey('0')">0</div>
              <div class="p-num-key" style="background:none;font-size:14px;color:#1890ff;" onclick="pForceUnlock()">解锁</div>
            </div>
          </div>
        </div>

        <!-- 主屏幕 -->
        <div id="p-home-screen" class="p-screen">
          <div class="p-status-bar" style="padding-top:12px;">
            <span id="p-home-time">22:45</span>
            <div class="icons">
              <span id="p-return-latest-btn" style="display:none; margin-right:8px; cursor:pointer; color:#ff7875; font-weight:bold;" onclick="pRestoreLatest()">🔙 返回最新</span>
              <span>5G</span>
              <span style="margin-left: 8px; cursor: pointer; color: #1890ff;" id="p-refresh-btn" title="强制刷新抓取最新记忆">↻ 刷新</span>
            </div>
          </div>
          <div style="padding: 0 10px;">
            <div class="p-widget-weather">
              <div><div class="city" id="p-w-city">加载中...</div><div class="temp" id="p-w-temp">--</div></div>
              <div style="text-align:right; font-size: 11px; color:#aaa;" id="p-w-desc">--</div>
            </div>
            <div class="p-widget-memo" id="p-home-memos">加载中...</div>
          </div>
          
          <div class="p-app-grid">
            <div class="p-app-icon-box" onclick="pOpenApp('xhs')">
              <div class="p-app-icon" style="background:#ff2442;">📕</div><span class="p-app-name">小红书</span>
            </div>
            <div class="p-app-icon-box" onclick="pOpenApp('taobao')">
              <div class="p-app-icon" style="background:#ff5000;">🛍️</div><span class="p-app-name">淘宝/外卖</span>
            </div>
            <div class="p-app-icon-box" onclick="pOpenApp('browser')">
              <div class="p-app-icon" style="background:#4285f4;">🧭</div><span class="p-app-name">浏览器</span>
            </div>
            <div class="p-app-icon-box" onclick="pOpenApp('photos')">
              <div class="p-app-icon" style="background:#525b68;">🖼️</div><span class="p-app-name">私密相册</span>
            </div>
          </div>
          
          <div class="p-dock-bar">
            <div class="p-app-icon-box" onclick="pOpenApp('wechat')">
              <div class="p-app-icon" style="background:#07c160;">💬</div>
            </div>
            <div class="p-app-icon-box" onclick="pOpenApp('notes')">
              <div class="p-app-icon" style="background:#fadb14;">📝</div>
            </div>
            <div class="p-app-icon-box" onclick="pOpenApp('settings')">
              <div class="p-app-icon" style="background:#8c8c8c;">⚙️</div>
            </div>
          </div>
        </div>

        <!-- 各种 App 窗口容器 (共用一个基础结构，靠JS动态填入) -->
        <div id="p-app-wechat" class="p-app-window">
          <div class="p-app-header">
            <button onclick="pCloseApp('wechat')">‹ 主屏幕</button><div class="p-app-title" id="p-wc-title">微信</div><div></div>
          </div>
          <div class="p-app-body" id="p-wc-body" style="background:#111215;"></div>
          <div style="height:50px; background:#1e2126; display:flex; justify-content:space-around; align-items:center; border-top:1px solid #333;">
            <button style="background:none;border:none;color:#07c160;font-size:12px;" onclick="pRenderWc('chats')">💬 微信</button>
            <button style="background:none;border:none;color:#aaa;font-size:12px;" onclick="pRenderWc('contacts')">👥 通讯录</button>
            <button style="background:none;border:none;color:#aaa;font-size:12px;" onclick="pRenderWc('moments')">🧭 朋友圈</button>
            <button style="background:none;border:none;color:#aaa;font-size:12px;" onclick="pRenderWc('me')">👤 我</button>
          </div>
        </div>

        <div id="p-app-generic" class="p-app-window">
          <div class="p-app-header">
            <button onclick="pCloseApp('generic')">‹ 返回</button><div class="p-app-title" id="p-gen-title">App</div><div></div>
          </div>
          <div class="p-app-body" id="p-gen-body"></div>
        </div>

        <!-- 单独聊天/详情 弹窗 -->
        <div id="p-detail-popup">
          <div class="p-app-header" style="background:#1a1c20;">
            <button onclick="document.getElementById('p-detail-popup').classList.remove('open')">‹ 返回</button>
            <div class="p-app-title" id="p-dtl-title">详情</div><div></div>
          </div>
          <div class="p-detail-content" id="p-dtl-body"></div>
        </div>
      </div>
      <!-- 把关闭按钮挪到 wrapper 外面，免得被手机壳遮挡 -->
      <button id="close-phone-btn" onclick="document.getElementById('phone-modal-backdrop').classList.add('hidden')">✕</button>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', phoneHTML);

  // 2. 挂载入口到扩展中控台
  const hubBody = document.querySelector('#extension-hub-modal .modal-body');
  if (hubBody) {
    const card = document.createElement('div');
    card.className = 'ext-module-card';
    card.innerHTML = `<div class="ext-icon">📱</div><div class="ext-name">查手机</div>`;
    hubBody.appendChild(card);
    card.addEventListener('click', () => {
      document.getElementById('extension-hub-modal').classList.add('hidden');
      openPhone();
    });
  }

  // --- UI 控制逻辑 ---
  const SNAPSHOTS_KEY = 'ezekiel_phone_snapshots';
  let isViewingSnapshot = false;

  // --- UI 控制逻辑 ---
  function openPhone() {
    document.getElementById('phone-modal-backdrop').classList.remove('hidden');
    document.getElementById('p-lock-screen').style.display = 'flex';
    document.getElementById('p-home-screen').style.display = 'none';
    pClearPin();
    updateClockAndWallpaper();
    updateLockScreenLatestUserMsg();
    
    isViewingSnapshot = false;
    updateSnapshotUIState();

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      phoneData = JSON.parse(cached);
      renderPhoneData();
    } else {
      fetchPhoneData(); // 第一次打开自动抓取
    }
  }

  function updateSnapshotUIState() {
    const retBtn = document.getElementById('p-return-latest-btn');
    const refBtn = document.getElementById('p-refresh-btn');
    if (retBtn) retBtn.style.display = isViewingSnapshot ? 'inline' : 'none';
    if (refBtn) refBtn.style.display = isViewingSnapshot ? 'none' : 'inline';
  }

  window.pRestoreLatest = function() {
    isViewingSnapshot = false;
    updateSnapshotUIState();
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      phoneData = JSON.parse(cached);
      renderPhoneData();
    }
    pCloseApp('generic');
    alert('✓ 已切回当前最新手机状态！');
  };

  window.pLoadSnapshot = function(idx) {
    const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    if (!snaps[idx]) return;
    isViewingSnapshot = true;
    updateSnapshotUIState();
    phoneData = snaps[idx].data;
    renderPhoneData();
    pCloseApp('generic');
    alert(`🕰️ 已切换至历史快照（${snaps[idx].time}），可随时点击右上角「🔙 返回最新」恢复。`);
  };

  function updateClockAndWallpaper() {
    const now = new Date();
    const tStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const dStr = `${now.getMonth()+1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;
    document.getElementById('p-lock-time').textContent = tStr;
    document.getElementById('p-home-time').textContent = tStr;
    document.getElementById('p-lock-date').textContent = dStr;

    const photos = JSON.parse(localStorage.getItem(PHOTOS_KEY) || '[]');
    const bgUrl = photos.length > 0 ? `url(${photos[Math.floor(Math.random() * photos.length)].base64})` : 'none';
    document.getElementById('p-lock-screen').style.backgroundImage = bgUrl;
    document.getElementById('p-home-screen').style.backgroundImage = bgUrl;
  }

  window.pPressKey = function(num) {
    if (curPin.length < 4) {
      curPin += num;
      for(let i=0; i<4; i++) document.getElementById('p-dp'+i).classList.toggle('filled', i < curPin.length);
      if (curPin.length === 4) setTimeout(verifyPin, 150);
    }
  };
  window.pClearPin = function() {
    curPin = "";
    for(let i=0; i<4; i++) document.getElementById('p-dp'+i).classList.remove('filled');
  };
  function verifyPin() {
    if (curPin === phoneSettings.pin) pForceUnlock();
    else { alert('密码错误。'); pClearPin(); }
  }
  window.pForceUnlock = function() {
    document.getElementById('p-lock-screen').style.display = 'none';
    document.getElementById('p-home-screen').style.display = 'flex';
  };

  window.pOpenApp = function(appId) {
    if (appId === 'wechat') {
      document.getElementById('p-app-wechat').classList.add('active');
      pRenderWc('chats');
    } else if (appId === 'settings') {
      const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
      const snapListHTML = snaps.length === 0 
        ? '<p style="color:#666; font-size:12px;">暂无历史快照（每次点击主屏刷新时会自动备份旧数据）</p>'
        : snaps.map((s, i) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #333;">
            <div style="display:flex; flex-direction:column; gap:2px;">
              <span style="font-size:12px; color:#ddd; font-weight:${s.starred ? 'bold' : 'normal'};">📌 ${s.time}</span>
              ${s.starred ? '<span style="font-size:10px; color:#e0a96d;">★ 已永久收藏</span>' : ''}
            </div>
            <div style="display:flex; gap:6px;">
              <button style="padding:4px 8px; background:transparent; border:1px solid ${s.starred ? '#e0a96d' : '#555'}; color:${s.starred ? '#e0a96d' : '#888'}; border-radius:4px; font-size:11px; cursor:pointer;" onclick="pToggleStarSnapshot(${i})">
                ${s.starred ? '★ 取消' : '☆ 收藏'}
              </button>
              <button style="padding:4px 10px; background:#2b323b; border:1px solid #1890ff; color:#1890ff; border-radius:4px; font-size:11px; cursor:pointer;" onclick="pLoadSnapshot(${i})">查看</button>
            </div>
          </div>
        `).join('');

      document.getElementById('p-gen-title').textContent = '系统设置';
      document.getElementById('p-gen-body').innerHTML = `
        <div style="padding:16px;">
          ${isViewingSnapshot ? `<button style="width:100%; padding:10px; background:#ff5252; border:none; color:#fff; border-radius:8px; margin-bottom:16px; font-weight:bold; cursor:pointer;" onclick="pRestoreLatest()">🔙 当前正在查看旧快照，点击切回最新</button>` : ''}
          <button style="width:100%; padding:10px; background:#2b323b; border:1px solid #1890ff; color:#1890ff; border-radius:10px; margin-bottom:14px; font-weight:bold; font-size:13px; cursor:pointer;" onclick="pOpenGuide()">📖 小手机使用说明与容量规则</button>
          <div style="background:#22252a; padding:14px; border-radius:12px; margin-bottom:14px;">
            <p style="color:#aaa; font-size:12px; margin-bottom:6px;">修改锁屏密码 (当前: ${phoneSettings.pin})</p>
            <input type="text" id="p-set-pin" maxlength="4" placeholder="输入4位数字" style="width:100%; padding:8px; background:#111215; border:1px solid #333; color:#fff; border-radius:6px;">
          </div>
          <div style="background:#22252a; padding:14px; border-radius:12px; margin-bottom:14px;">
            <p style="color:#aaa; font-size:12px; margin-bottom:6px;">强制锚定所在地 (为空则AI推断)</p>
            <input type="text" id="p-set-loc" placeholder="如：纽约 / 南京" value="${phoneSettings.loc}" style="width:100%; padding:8px; background:#111215; border:1px solid #333; color:#fff; border-radius:6px;">
          </div>
          <button style="width:100%; padding:10px; background:#1890ff; border:none; color:#fff; border-radius:8px; cursor:pointer; margin-bottom:10px;" onclick="pSaveSettings()">💾 保存密码与地点</button>
          <button style="width:100%; padding:8px; background:transparent; border:1px dashed #ff5252; color:#ff5252; border-radius:8px; cursor:pointer; margin-bottom:16px; font-size:12px;" onclick="pResetPhoneCache()">🗑️ 清空手机记录 (保留相册与设置)</button>
          
          <div style="background:#22252a; padding:14px; border-radius:12px;">
            <p style="color:#e0a96d; font-size:12px; font-weight:bold; margin-bottom:8px;">🕰️ 历史快照（收藏的快照不会被顶替）</p>
            ${snapListHTML}
          </div>
        </div>
      `;
      document.getElementById('p-app-generic').classList.add('active');
    } else if (appId === 'photos') {
      renderPhotosApp();
    } else {
      renderGenericApp(appId);
    }
  };
  window.pCloseApp = function(id) { document.getElementById('p-app-' + id).classList.remove('active'); };
// 新增：小手机内置使用说明书
  window.pOpenGuide = function() {
    const guideHTML = `
      <div style="font-size:12.5px; line-height:1.7; color:#ddd;">
        <div style="background:#1e2126; padding:12px; border-radius:10px; margin-bottom:12px; border-left:3px solid #1890ff;">
          <b style="color:#fff; font-size:13px;">🔑 1. 基础操作与解锁</b><br>
          • <b>初始密码</b>：默认 <code style="color:#1890ff;">0000</code>（可在设置中修改为任意4位数字，点右下角「解锁」可直接跳过）。<br>
          • <b>锁屏通知</b>：自动同步你在终端发出的最新一句话（零 Token 消耗）。<br>
          • <b>刷新动态</b>：点击主屏右上角「↻ 刷新」，会读取全频道最近 <b>50 条</b> 聊天记录及当前情绪板，续写最新动态（走「② 档案共读模型」通道）。
        </div>

        <div style="background:#1e2126; padding:12px; border-radius:10px; margin-bottom:12px; border-left:3px solid #07c160;">
          <b style="color:#fff; font-size:13px;">📊 2. 每次刷新与最大储存上限</b><br>
          每次刷新采用<b>增量合并</b>，新内容排在最前，超出上限自动淘汰最旧记录：<br>
          • <b>💬 微信聊天</b>：每次续写 2~3 位联系人（每人 <b>4~6 条</b>新消息）；最多存 <b>8 个</b>联系人，每人上限 <b>30 条</b>对话。<br>
          • <b>🧭 朋友圈</b>：最多储存 <b>12 条</b>动态。<br>
          • <b>📕 小红书</b>：最多储存 <b>16 条</b>浏览笔记。<br>
          • <b>🛍️ 淘宝/外卖</b>：最多储存 <b>15 条</b>订单（点击卡片可查看真实购买目的备注）。<br>
          • <b>🧭 浏览器</b>：最多储存 <b>15 条</b>搜索记录与心声。<br>
          • <b>📝 备忘录</b>：最多储存 <b>12 条</b>随手记。
        </div>

        <div style="background:#1e2126; padding:12px; border-radius:10px; margin-bottom:12px; border-left:3px solid #e0a96d;">
          <b style="color:#fff; font-size:13px;">🕰️ 3. 历史快照与收藏机制</b><br>
          • 每次点「↻ 刷新」前，旧数据会自动打包存为一份快照。<br>
          • 普通快照最多保留最新 <b>5 份</b>，超出自动顶掉最早的；点击 <b>「☆ 收藏」</b> 标星后将<b>永久保留</b>，不占 5 份名额。
        </div>

        <div style="background:#1e2126; padding:12px; border-radius:10px; border-left:3px solid #ff7875;">
          <b style="color:#fff; font-size:13px;">🖼️ 4. 私密相册与云同步说明</b><br>
          • 相册最多存 <b>20 张</b>本地图片（自动高清压缩，每次打开手机随机抽 1 张作锁屏与主屏壁纸）。<br>
          • 相册图片为节省云端空间<b>仅存当前设备本地</b>；其余所有聊天、App 记录、快照与密码设置均支持随终端一键云端同步。
        </div>
      </div>
    `;
    pOpenDtl('📖 小手机使用说明', guideHTML);
  };

  // 新增：切换快照收藏状态
  window.pToggleStarSnapshot = function(idx) {
    const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
    if (!snaps[idx]) return;
    snaps[idx].starred = !snaps[idx].starred;
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snaps));
    pOpenApp('settings'); // 刷新设置界面
  };

  window.pSaveSettings = function() {
    const newPin = document.getElementById('p-set-pin').value.trim();
    const newLoc = document.getElementById('p-set-loc').value.trim();
    if (newPin && !/^\d{4}$/.test(newPin)) return alert('密码必须是4位数字！');
    if (newPin) phoneSettings.pin = newPin;
    phoneSettings.loc = newLoc;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(phoneSettings));
    alert('✓ 设置已保存');
  };

  // 新增：手动清空手机动态缓存（不影响密码、地址和相册）
  window.pResetPhoneCache = function() {
    if (confirm('确定要清空这台手机的所有生成记录吗？\n（密码、所在地和相册会保留，微信、淘宝等数据将被清空，需重新抓取）')) {
      phoneData = null;
      localStorage.removeItem(CACHE_KEY);
      pCloseApp('generic');
      updateLockScreenLatestUserMsg();
      alert('✓ 手机已重置为空白状态，请点击主屏【↻ 刷新】重新抓取。');
    }
  };

  // --- API 增量抓取与快照备份 ---
  document.getElementById('p-refresh-btn').addEventListener('click', () => {
    if (confirm('即将消耗 Token 续写最新手机动态（旧记录会自动保留并备份快照），是否继续？')) {
      fetchPhoneData();
    }
  });

  // 智能合并新旧手机数据（有限度增量保留）
  function mergePhoneData(oldD, newD) {
    if (!oldD) return newD;
    const merged = { ...newD };

    // 1. 微信联系人聊天记录：老联系人续写新气泡（上限30条），新联系人追加
    if (oldD.wechat && newD.wechat && Array.isArray(oldD.wechat.chats) && Array.isArray(newD.wechat.chats)) {
      const chatMap = new Map();
      oldD.wechat.chats.forEach(c => chatMap.set(c.name, { ...c, msgs: [...(c.msgs || [])] }));
      
      newD.wechat.chats.forEach(nc => {
        if (chatMap.has(nc.name)) {
          const existing = chatMap.get(nc.name);
          existing.msgs = existing.msgs.concat(nc.msgs || []).slice(-30); // 每个对话最多留30条
          if (nc.role) existing.role = nc.role;
        } else {
          chatMap.set(nc.name, nc);
        }
      });
      // 最多保留8个联系人，把刚有新消息的排在前面
      const updatedNames = new Set(newD.wechat.chats.map(c => c.name));
      const allChats = Array.from(chatMap.values());
      const activeChats = allChats.filter(c => updatedNames.has(c.name));
      const olderChats = allChats.filter(c => !updatedNames.has(c.name));
      merged.wechat.chats = [...activeChats, ...olderChats].slice(0, 8);
    }

    // 2. 朋友圈、小红书、淘宝、浏览器、备忘录：新生成的插在最前面，旧的往下排（各上限15条）
    const prependLimit = (newArr, oldArr, max = 15) => [...(newArr || []), ...(oldArr || [])].slice(0, max);
    if (oldD.wechat && merged.wechat) {
      merged.wechat.moments = prependLimit(newD.wechat.moments, oldD.wechat.moments, 12);
    }
    merged.xhs = prependLimit(newD.xhs, oldD.xhs, 16);
    merged.taobao = prependLimit(newD.taobao, oldD.taobao, 15);
    merged.browser = prependLimit(newD.browser, oldD.browser, 15);
    merged.notes = prependLimit(newD.notes, oldD.notes, 12);

    return merged;
  }

  async function fetchPhoneData() {
    const cfg = getConfig();
    if (!cfg.apiKey || typeof callTacticalAPI !== 'function') return alert('请先配置终端 API 秘钥！');
    
    const refreshBtn = document.getElementById('p-refresh-btn');
    refreshBtn.textContent = '⏳ 续写中...';
    refreshBtn.style.pointerEvents = 'none';

    let allHistory = [];
    const sessions = typeof getSessions === 'function' ? getSessions() : [{ id: 'default' }];
    sessions.forEach(s => {
      const key = s.id === 'default' ? 'ezekiel_chat_history' : 'ezekiel_chat_history_' + s.id;
      allHistory = allHistory.concat(JSON.parse(localStorage.getItem(key) || '[]'));
    });
    allHistory.sort((a, b) => (a.time || 0) - (b.time || 0));
    
    // 只给 AI 喂真实的聊天记录，用于它严格复述
    const recentChat = allHistory.slice(-50).map(m => {
      const d = new Date(m.time || Date.now());
      // 强制只显示日期给 AI，不要时分
      const timeTag = `[${d.getMonth()+1}月${d.getDate()}日]`;
      return `${timeTag} ${m.role === 'user' ? cfg.userName : cfg.aiName}: ${m.content.replace(/\[.*?\]/g, '')}`;
    }).join('\n');

    let memoryContext = '';
    if (typeof getInjectableMemories === 'function') memoryContext = getInjectableMemories();
    const pool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_POOL) || '{"diaries":[],"mood":""}');

    const existingContacts = (phoneData && phoneData.wechat && phoneData.wechat.chats)
      ? phoneData.wechat.chats.map(c => `${c.name}(${c.role})`).join('、')
      : '暂无';
      
    const now = new Date();
    const nowTimeStr = `${now.getMonth()+1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const prompt = `[系统指令：续写角色手机最新动态]
当前现实时间是：${nowTimeStr}。
请严格按照你（${cfg.aiName}）的人设、所在城市（${phoneSettings.loc || '根据人设推断'}）生成你手机里【最新发生】的增量动态。

⚠️ 【最高警告与时间线铁律】：
1. 提取真实对话：在生成 ${cfg.userName} 的微信聊天记录时，必须且只能【一字不差地提取】底部提供的真实聊天记录，严禁自行脑补任何没发生过的对话内容！！
2. 时间不可倒流：AI 最容易犯时间倒流的错误。所有带有 time 字段的地方（如微信对话、备忘录、订单等），必须且只能填入【纯日期】（如“11月16日”或“昨天”），绝对不准带有具体时分！
3. 时间范围：所有生成的日期必须小于或等于今天。

必须输出【纯JSON格式】，绝对不要包裹在 \`\`\`json 中，直接输出 { 开始。
数据结构要求：
{
  "lock": {"sender":"${cfg.userName}","time":"刚刚","text":"最新消息预览"},
  "weather": {"desc":"晴/雨/雪","temp":"22°C","wind":"微风"},
  "memos": ["第1条今日优先守则","第2条","第3条"],
  "wechat": {
    "chats": [
      {
        "name": "${cfg.userName}", "avatar": "👩🏻‍🦰", "role": "老婆/备注",
        "msgs": [{"me":false,"time":"11月15日","text":"（绝对摘抄自下方的真实记录）"},{"me":true,"time":"11月16日","text":"（绝对摘抄自下方）"}...] 
      } // 其他2-3个联系人(沿用名单：${existingContacts})，每个含4-6条最新续写对话，time 必须是纯日期
    ],
    "moments": [
      {"author":"${cfg.userName}或其他人","avatar":"👩🏻‍🦰","time":"今天","content":"最新动态正文","img_desc":"[图片：描述画面]","actions":"你的点赞或评论"}
    ],
    "me": {"sign":"你的微信签名","balance":"$ 12,450.00","favs":["新收藏1","新收藏2"]}
  },
  "xhs": [
    {"title":"新刷到的笔记标题","author":"博主名","likes":"1.2w","emoji":"🎮","cover_text":"封面大字","content":"笔记正文或心声"}
  ],
  "taobao": [
    {"shop":"店铺名","time":"11月16日","status":"派送中","name":"新购商品名","spec":"规格","price":"$12","emoji":"📦","is_flash":false,"detail":"真实目的备注"}
  ],
  "browser": [
    {"query":"新搜索关键词","time":"昨天","thought":"你搜这个的真实目的/心声"}
  ],
  "notes": [
    {"title":"新备忘录标题","time":"11月16日","content":"详细正文内容..."}
  ]
}
【近期状态】\n${pool.mood}
【最近50条真实聊天记录（用于直接提取，严禁瞎编）】\n${recentChat}`;

    try {
      const reply = await callTacticalAPI([
        { role: 'system', content: cfg.systemPrompt || `你是 ${cfg.aiName}` },
        { role: 'user', content: prompt }
      ], 'archive');

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('解析 JSON 失败');
      
      const newParsed = JSON.parse(jsonMatch[0]);

      // 1. 刷新前把旧数据存成历史快照，但跳过已经标星收藏的，确保最多只有5份非收藏快照
      if (phoneData) {
        const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]');
        const stamp = `${now.getMonth()+1}月${now.getDate()}日 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        snaps.unshift({ time: stamp, data: phoneData, starred: false });
        
        // 过滤保留逻辑：所有标星的无条件保留，没标星的只留最新的前 5 个
        const starredSnaps = snaps.filter(s => s.starred);
        const unstarredSnaps = snaps.filter(s => !s.starred).slice(0, 5);
        localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify([...starredSnaps, ...unstarredSnaps]));
      }

      // 2. 合并新旧数据并保存
      phoneData = mergePhoneData(phoneData, newParsed);
      localStorage.setItem(CACHE_KEY, JSON.stringify(phoneData));
      isViewingSnapshot = false;
      updateSnapshotUIState();
      renderPhoneData();
      alert('✓ 新动态已同步！旧记录已自动备份。');
    } catch (err) {
      alert('✕ 抓取失败: ' + err.message);
    } finally {
      refreshBtn.textContent = '↻ 刷新';
      refreshBtn.style.pointerEvents = 'auto';
    }
  }

  // 点击手机外侧黑色背景也可直接关闭
  document.getElementById('phone-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'phone-modal-backdrop') {
      e.target.classList.add('hidden');
    }
  });

  // 实时提取用户最新一条发言显示在锁屏上（零Token消耗）
  function updateLockScreenLatestUserMsg() {
    const cfg = getConfig();
    let allHistory = [];
    const sessions = typeof getSessions === 'function' ? getSessions() : [{ id: 'default' }];
    sessions.forEach(s => {
      const key = s.id === 'default' ? 'ezekiel_chat_history' : 'ezekiel_chat_history_' + s.id;
      allHistory = allHistory.concat(JSON.parse(localStorage.getItem(key) || '[]'));
    });
    allHistory.sort((a, b) => (a.time || 0) - (b.time || 0));

    const lastUserMsg = [...allHistory].reverse().find(m => m.role === 'user');
    const alertBox = document.getElementById('p-lock-alert-box');
    if (lastUserMsg && alertBox) {
      const cleanTxt = lastUserMsg.content
        .replace(/\[QUOTE:[\s\S]*?\]\n?/g, '')
        .replace(/\[表情包:([^\|]+)\|.*\]/g, '[$1]')
        .replace(/\[LOCAL_IMG:.*?\]/g, '[图片]')
        .trim();
      alertBox.style.display = 'flex';
      document.getElementById('p-lock-sender').textContent = cfg.userName || 'USER';
      document.getElementById('p-lock-msg').textContent = cleanTxt || '[发送了一条消息]';
    } else if (phoneData && phoneData.lock && alertBox) {
      alertBox.style.display = 'flex';
      document.getElementById('p-lock-sender').textContent = phoneData.lock.sender;
      document.getElementById('p-lock-msg').textContent = phoneData.lock.text;
    }
  }

  function renderPhoneData() {
    updateLockScreenLatestUserMsg();
    if (!phoneData) return;

    if (phoneData.weather) {
      document.getElementById('p-w-city').textContent = phoneSettings.loc || '当前位置';
      document.getElementById('p-w-temp').textContent = phoneData.weather.temp;
      document.getElementById('p-w-desc').textContent = `${phoneData.weather.desc} | ${phoneData.weather.wind}`;
    }
    if (phoneData.memos) {
      document.getElementById('p-home-memos').innerHTML = `<b>📌 优先守则：</b><br>` + phoneData.memos.map((m,i)=>`${i+1}. ${m}`).join('<br>');
    }
  }

  // --- 微信渲染逻辑 ---
  window.pRenderWc = function(tab) {
    if (!phoneData || !phoneData.wechat) return;
    const body = document.getElementById('p-wc-body');
    const wc = phoneData.wechat;

    if (tab === 'chats') {
      body.innerHTML = wc.chats.map((c, i) => `
        <div class="p-wc-item" onclick="pOpenChatDetail(${i})">
          <div class="p-wc-avatar">${c.avatar}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;"><span class="p-wc-name">${c.name}</span></div>
            <div class="p-wc-msg">${c.msgs && c.msgs.length > 0 ? c.msgs[c.msgs.length-1].text : '...'}</div>
          </div>
        </div>
      `).join('');
    } else if (tab === 'contacts') {
      body.innerHTML = wc.chats.map(c => `
        <div class="p-wc-item" onclick="pOpenDtl('联系人资料', '<b>${c.name}</b><br>身份：${c.role}<br><br>📝 私密备注：${c.name === getConfig().userName ? '最高保护对象，绝不扫兴' : '常规联络'}')">
          <div class="p-wc-avatar">${c.avatar}</div>
          <div class="p-wc-name">${c.name}</div>
        </div>
      `).join('');
    } else if (tab === 'moments') {
      body.innerHTML = wc.moments.map(m => `
        <div style="padding:16px; border-bottom:1px solid #1c1f24;">
          <div style="display:flex; gap:12px;">
            <div class="p-wc-avatar" style="width:40px;height:40px;font-size:20px;">${m.avatar}</div>
            <div style="flex:1;">
              <div style="color:#576b95; font-weight:600; font-size:14px; margin-bottom:4px;">${m.author}</div>
              <div style="font-size:13px; color:#ddd; margin-bottom:8px; line-height:1.5;">${m.content}</div>
              <div style="background:#22252a; padding:8px; font-size:12px; color:#888; border-radius:4px;">${m.img_desc}</div>
              <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:11px; color:#666;">
                <span>${m.time}</span><span>${m.actions}</span>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    } else if (tab === 'me') {
      body.innerHTML = `
        <div style="padding:20px; text-align:center; border-bottom:1px solid #1c1f24;">
          <div class="p-wc-avatar" style="width:64px;height:64px;font-size:32px;margin:0 auto 10px;">🪖</div>
          <div style="font-size:18px; color:#fff; font-weight:bold;">${getConfig().aiName}</div>
          <div style="font-size:12px; color:#888; margin-top:6px;">${wc.me.sign}</div>
        </div>
        <div class="p-wc-item" onclick="pOpenDtl('服务与资产', '微信支付零钱：<br><b style=\\'font-size:24px;color:#07c160;\\'>${wc.me.balance}</b>')">
          💳 服务与资产
        </div>
        <div class="p-wc-item" onclick="pOpenDtl('我的收藏', '${wc.me.favs.join('<br><br>')}')">
          ⭐ 我的收藏
        </div>
      `;
    }
  };

  // 微信气泡渲染（带时间戳）
  window.pOpenChatDetail = function(idx) {
    const chat = phoneData.wechat.chats[idx];
    const logHTML = chat.msgs.map(m => `
      <div style="text-align:center; font-size:10px; color:#555; margin-bottom:4px;">${m.time || ''}</div>
      <div class="p-msg-row ${m.me ? 'me' : ''}">
        ${!m.me ? `<div class="p-wc-avatar" style="width:36px;height:36px;font-size:18px;">${chat.avatar}</div>` : ''}
        <div class="p-bubble">${m.text}</div>
      </div>
    `).join('');
    pOpenDtl(chat.name, `<div class="p-chat-log">${logHTML}</div>`, true);
  };

  // 其他 App 渲染（加入外卖时间标签）
  function renderGenericApp(appId) {
    document.getElementById('p-app-generic').classList.add('active');
    const titleEl = document.getElementById('p-gen-title');
    const bodyEl = document.getElementById('p-gen-body');
    bodyEl.style.padding = '0';

    if (appId === 'xhs' && phoneData.xhs) {
      titleEl.textContent = '小红书';
      bodyEl.innerHTML = `<div class="p-xhs-grid">` + phoneData.xhs.map(x => `
        <div class="p-xhs-card" onclick="pOpenDtl('笔记详情', '<h3 style=\\'color:#fff;margin-bottom:10px;\\'>${x.title.replace(/'/g, "\\'")}</h3><p style=\\'color:#aaa;\\'>${x.content.replace(/\n/g, '<br>').replace(/'/g, "\\'")}</p>')">
          <div class="p-xhs-cover"><span>${x.emoji}</span><div style="font-size:11px;color:#888;margin-top:4px;">${x.cover_text}</div></div>
          <div style="padding:10px;">
            <div style="font-size:12px; color:#fff; font-weight:bold; margin-bottom:6px; height:32px; overflow:hidden;">${x.title}</div>
            <div style="font-size:10px; color:#666; display:flex; justify-content:space-between;"><span>${x.author}</span><span>❤️ ${x.likes}</span></div>
          </div>
        </div>
      `).join('') + `</div>`;
    } else if (appId === 'taobao' && phoneData.taobao) {
      titleEl.textContent = '订单中心 (淘宝/外卖)';
      bodyEl.innerHTML = phoneData.taobao.map(t => `
        <div class="p-order-card" onclick="pOpenDtl('订单追踪', '<b>${t.shop.replace(/'/g, "\\'")}</b><br>状态：${t.status}<br>金额：${t.price}<br><br>📝 备注：<br>${t.detail.replace(/\n/g, '<br>').replace(/'/g, "\\'")}')">
          <div style="display:flex; justify-content:space-between; font-size:12px; color:#888; border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:10px;">
            <span>${t.is_flash ? '⚡ 同城急送' : '📦 淘宝购物'} - ${t.shop}</span><span style="color:#e0a96d;">${t.status}</span>
          </div>
          <div style="display:flex; gap:12px;">
            <div style="width:48px;height:48px;background:#2a2e35;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${t.emoji}</div>
            <div>
              <div style="font-size:14px; color:#fff; font-weight:500; margin-bottom:4px;">${t.name}</div>
              <div style="font-size:11px; color:#888;">${t.time ? `下单时间：${t.time}<br>` : ''}${t.spec}</div>
            </div>
            <div style="margin-left:auto; font-size:14px; font-weight:bold; color:#1890ff;">${t.price}</div>
          </div>
        </div>
      `).join('');
    } else if (appId === 'browser' && phoneData.browser) {
      titleEl.textContent = 'Safari 浏览记录';
      bodyEl.innerHTML = phoneData.browser.map(b => `
        <div style="padding:14px 16px; border-bottom:1px solid #1c1f24; cursor:pointer;" onclick="pOpenDtl('搜索详情', '<b>检索关键词：</b><br>${b.query.replace(/'/g, "\\'")}<br><br><b>🕵️‍♂️ 心声：</b><br>${b.thought.replace(/'/g, "\\'")}')">
          <div style="font-size:14px; color:#fff; font-weight:500; margin-bottom:6px;">🔍 ${b.query}</div>
          <div style="font-size:11px; color:#666;">搜索于：${b.time}</div>
        </div>
      `).join('');
    } else if (appId === 'notes' && phoneData.notes) {
      titleEl.textContent = '行动备忘录';
      bodyEl.innerHTML = phoneData.notes.map(n => `
        <div style="padding:16px; border-bottom:1px solid #1c1f24; cursor:pointer;" onclick="pOpenDtl('${n.title.replace(/'/g, "\\'")}', '${n.content.replace(/\n/g, '<br>').replace(/'/g, "\\'")}')">
          <div style="font-size:15px; color:#e0a96d; font-weight:bold; margin-bottom:6px;">📌 ${n.title}</div>
          <div style="font-size:11px; color:#666;">记录于：${n.time}</div>
        </div>
      `).join('');
    }
  }

  // --- 本地相册逻辑 (零Token，自动压缩) ---
  function renderPhotosApp() {
    document.getElementById('p-app-generic').classList.add('active');
    document.getElementById('p-gen-title').textContent = '私密相册';
    
    const photos = JSON.parse(localStorage.getItem(PHOTOS_KEY) || '[]');
    let html = `
      <div style="padding:12px; background:#1e2126; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333;">
        <span style="font-size:12px; color:#aaa;">共 ${photos.length}/20 张 (本地加密)</span>
        <button style="padding:6px 12px; background:#1890ff; border:none; color:#fff; border-radius:4px; font-size:12px; cursor:pointer;" onclick="document.getElementById('p-photo-upload').click()">+ 导入照片</button>
        <input type="file" id="p-photo-upload" accept="image/*" style="display:none;">
      </div>
      <div class="p-photo-grid" id="p-photo-grid-cont"></div>
    `;
    document.getElementById('p-gen-body').innerHTML = html;
    
    const grid = document.getElementById('p-photo-grid-cont');
    grid.innerHTML = photos.map(p => `
      <div class="p-photo-box" style="background-image:url(${p.base64})" onclick="pOpenDtl('查看大图', '<img src=\\'${p.base64}\\' style=\\'width:100%;border-radius:8px;\\'>')">
        <button class="del-btn" onclick="event.stopPropagation(); pDelPhoto('${p.id}')">✕</button>
      </div>
    `).join('');

    document.getElementById('p-photo-upload').addEventListener('change', (e) => {
      if (photos.length >= 20) return alert('相册最多只能存 20 张照片！');
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          let w = img.width, h = img.height;
          const max = 1080;
          if (w > max || h > max) {
            if (w > h) { h *= max/w; w = max; } else { w *= max/h; h = max; }
          }
          canvas.width = w; canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          
          photos.unshift({ id: Date.now().toString(), base64: canvas.toDataURL('image/jpeg', 0.75) });
          localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
          renderPhotosApp();
          updateClockAndWallpaper(); // 导入新图后刷新壁纸
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  window.pDelPhoto = function(id) {
    if (!confirm('确认删除这张照片吗？')) return;
    let photos = JSON.parse(localStorage.getItem(PHOTOS_KEY) || '[]');
    photos = photos.filter(p => p.id !== id);
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
    renderPhotosApp();
    updateClockAndWallpaper();
  };

  // --- 全局详情弹窗 ---
  window.pOpenDtl = function(title, content, isFull = false) {
    document.getElementById('p-dtl-title').textContent = title;
    const body = document.getElementById('p-dtl-body');
    body.innerHTML = content;
    body.style.padding = isFull ? '0' : '20px 16px';
    document.getElementById('p-detail-popup').classList.add('open');
  };

})();