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
            <div class="icons"><span>5G</span><span style="margin-left: 8px; cursor: pointer; color: #1890ff;" id="p-refresh-btn" title="强制刷新抓取最新记忆">↻ 刷新</span></div>
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
  function openPhone() {
    document.getElementById('phone-modal-backdrop').classList.remove('hidden');
    document.getElementById('p-lock-screen').style.display = 'flex';
    document.getElementById('p-home-screen').style.display = 'none';
    pClearPin();
    updateClockAndWallpaper();
    
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      phoneData = JSON.parse(cached);
      renderPhoneData();
    } else {
      fetchPhoneData(); // 第一次打开自动抓取
    }
  }

  function updateClockAndWallpaper() {
    const now = new Date();
    const tStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const dStr = `${now.getMonth()+1}月${now.getDate()}日 星期${'日一二三四五六'[now.getDay()]}`;
    document.getElementById('p-lock-time').textContent = tStr;
    document.getElementById('p-home-time').textContent = tStr;
    document.getElementById('p-lock-date').textContent = dStr;

    // 随机壁纸
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
      document.getElementById('p-gen-title').textContent = '系统设置';
      document.getElementById('p-gen-body').innerHTML = `
        <div style="padding:16px;">
          <div style="background:#22252a; padding:16px; border-radius:12px; margin-bottom:16px;">
            <p style="color:#aaa; font-size:12px; margin-bottom:8px;">修改锁屏密码 (当前: ${phoneSettings.pin})</p>
            <input type="text" id="p-set-pin" maxlength="4" placeholder="输入4位数字" style="width:100%; padding:10px; background:#111215; border:1px solid #333; color:#fff; border-radius:6px;">
          </div>
          <div style="background:#22252a; padding:16px; border-radius:12px; margin-bottom:16px;">
            <p style="color:#aaa; font-size:12px; margin-bottom:8px;">强制锚定所在地 (为空则AI推断)</p>
            <input type="text" id="p-set-loc" placeholder="如：新纽约 / 南京" value="${phoneSettings.loc}" style="width:100%; padding:10px; background:#111215; border:1px solid #333; color:#fff; border-radius:6px;">
          </div>
          <button style="width:100%; padding:12px; background:#1890ff; border:none; color:#fff; border-radius:8px; cursor:pointer;" onclick="pSaveSettings()">💾 保存设置</button>
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

  window.pSaveSettings = function() {
    const newPin = document.getElementById('p-set-pin').value.trim();
    const newLoc = document.getElementById('p-set-loc').value.trim();
    if (newPin && !/^\d{4}$/.test(newPin)) return alert('密码必须是4位数字！');
    if (newPin) phoneSettings.pin = newPin;
    phoneSettings.loc = newLoc;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(phoneSettings));
    alert('✓ 设置已保存');
  };

  // --- API 数据请求与渲染 ---
  document.getElementById('p-refresh-btn').addEventListener('click', fetchPhoneData);

  async function fetchPhoneData() {
    const cfg = getConfig();
    if (!cfg.apiKey || typeof callTacticalAPI !== 'function') return alert('请先配置终端 API 秘钥！');
    
    const refreshBtn = document.getElementById('p-refresh-btn');
    refreshBtn.textContent = '⏳ 抓取中...';
    refreshBtn.style.pointerEvents = 'none';

    // 组装上下文
    let allHistory = [];
    const sessions = typeof getSessions === 'function' ? getSessions() : [{ id: 'default' }];
    sessions.forEach(s => {
      const key = s.id === 'default' ? 'ezekiel_chat_history' : 'ezekiel_chat_history_' + s.id;
      allHistory = allHistory.concat(JSON.parse(localStorage.getItem(key) || '[]'));
    });
    allHistory.sort((a, b) => (a.time || 0) - (b.time || 0));
    const recentChat = allHistory.slice(-50).map(m => `${m.role === 'user' ? cfg.userName : cfg.aiName}: ${m.content.replace(/\[.*?\]/g, '')}`).join('\n');

    let memoryContext = '';
    if (typeof getInjectableMemories === 'function') memoryContext = getInjectableMemories();
    const pool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY_POOL) || '{"diaries":[],"mood":""}');

    const prompt = `[系统指令：生成角色手机动态数据]
请严格按照你（${cfg.aiName}）的人设、所在城市（${phoneSettings.loc || '根据人设推断'}）以及下方的[近期记忆与聊天上下文]，生成你当前手机里的私密数据。
必须输出【纯JSON格式】，绝对不要包裹在 \`\`\`json 中，直接输出 { 开始。
数据结构要求：
{
  "lock": {"sender":"发件人名(如${cfg.userName})","time":"刚刚","text":"最新一条未读消息预览"},
  "weather": {"desc":"晴/雨/雪","temp":"22°C","wind":"微风"},
  "memos": ["第1条生活/工作防踩雷备忘","第2条","第3条"],
  "wechat": {
    "chats": [
      {
        "name": "联系人1(必须是${cfg.userName})", "avatar": "👩🏻‍🦰", "role": "老婆/备注",
        "msgs": [{"me":false,"text":"她的原话或符合设定的语气"},{"me":true,"text":"你的回复"}...] // 8-12条连贯对话
      } // 再生成3个符合人设的联系人(同事/损友/家人)，每个含6-8条对话
    ],
    "moments": [
      {"author":"${cfg.userName}或其他人","avatar":"👩🏻‍🦰","time":"2小时前","content":"动态正文","img_desc":"[图片：描述画面]","actions":"你的点赞或评论"} // 共2条
    ],
    "me": {"sign":"你的微信签名","balance":"$ 12,450.00","favs":["收藏1","收藏2","收藏3"]}
  },
  "xhs": [
    {"title":"笔记标题","author":"博主名","likes":"1.2w","emoji":"🎮","cover_text":"封面大字","content":"笔记正文或你的心声"} // 4条
  ],
  "taobao": [
    {"shop":"店铺名","status":"派送中","name":"实物商品名","spec":"规格","price":"$12","emoji":"📦","is_flash":false,"detail":"订单真实目的备注"} // 2条实物，2条外卖闪购(is_flash:true)
  ],
  "browser": [
    {"query":"搜索关键词","time":"昨天 23:00","thought":"你搜这个的真实目的/心声"} // 4条
  ],
  "notes": [
    {"title":"备忘录标题","time":"10月25日","content":"详细正文内容..."} // 3条长备忘
  ]
}
【长期记忆】\n${memoryContext}
【近期状态】\n${pool.mood}
【最近20条聊天】\n${recentChat}`;

    try {
      const reply = await callTacticalAPI([
        { role: 'system', content: cfg.systemPrompt || `你是 ${cfg.aiName}` },
        { role: 'user', content: prompt }
      ], 'archive'); // 默认走档案模型省钱

      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('解析 JSON 失败');
      
      phoneData = JSON.parse(jsonMatch[0]);
      localStorage.setItem(CACHE_KEY, JSON.stringify(phoneData));
      renderPhoneData();
      alert('✓ 手机信号已更新！');
    } catch (err) {
      alert('✕ 抓取失败: ' + err.message);
    } finally {
      refreshBtn.textContent = '↻ 刷新';
      refreshBtn.style.pointerEvents = 'auto';
    }
  }

  function renderPhoneData() {
    if (!phoneData) return;
    
    // 渲染锁屏与主屏组件
    if (phoneData.lock) {
      document.getElementById('p-lock-alert-box').style.display = 'flex';
      document.getElementById('p-lock-sender').textContent = phoneData.lock.sender;
      document.getElementById('p-lock-msg').textContent = phoneData.lock.text;
    }
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

  window.pOpenChatDetail = function(idx) {
    const chat = phoneData.wechat.chats[idx];
    const logHTML = chat.msgs.map(m => `
      <div class="p-msg-row ${m.me ? 'me' : ''}">
        ${!m.me ? `<div class="p-wc-avatar" style="width:36px;height:36px;font-size:18px;">${chat.avatar}</div>` : ''}
        <div class="p-bubble">${m.text}</div>
      </div>
    `).join('');
    pOpenDtl(chat.name, `<div class="p-chat-log">${logHTML}</div>`, true);
  };

  // --- 其他 App 渲染逻辑 ---
  function renderGenericApp(appId) {
    document.getElementById('p-app-generic').classList.add('active');
    const titleEl = document.getElementById('p-gen-title');
    const bodyEl = document.getElementById('p-gen-body');
    bodyEl.style.padding = '0';

    if (appId === 'xhs' && phoneData.xhs) {
      titleEl.textContent = '小红书';
      bodyEl.innerHTML = `<div class="p-xhs-grid">` + phoneData.xhs.map(x => `
        <div class="p-xhs-card" onclick="pOpenDtl('笔记详情', '<h3 style=\\'color:#fff;margin-bottom:10px;\\'>${x.title}</h3><p style=\\'color:#aaa;\\'>${x.content}</p>')">
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
        <div class="p-order-card" onclick="pOpenDtl('订单追踪', '<b>${t.shop}</b><br>状态：${t.status}<br>金额：${t.price}<br><br>📝 真实目的/备注：<br>${t.detail}')">
          <div style="display:flex; justify-content:space-between; font-size:12px; color:#888; border-bottom:1px solid #333; padding-bottom:8px; margin-bottom:10px;">
            <span>${t.is_flash ? '⚡ 闪购同城' : '📦 淘宝购物'} - ${t.shop}</span><span style="color:#e0a96d;">${t.status}</span>
          </div>
          <div style="display:flex; gap:12px;">
            <div style="width:48px;height:48px;background:#2a2e35;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${t.emoji}</div>
            <div>
              <div style="font-size:14px; color:#fff; font-weight:500; margin-bottom:4px;">${t.name}</div>
              <div style="font-size:12px; color:#888;">${t.spec}</div>
            </div>
            <div style="margin-left:auto; font-size:14px; font-weight:bold; color:#1890ff;">${t.price}</div>
          </div>
        </div>
      `).join('');
    } else if (appId === 'browser' && phoneData.browser) {
      titleEl.textContent = 'Safari 浏览记录';
      bodyEl.innerHTML = phoneData.browser.map(b => `
        <div style="padding:14px 16px; border-bottom:1px solid #1c1f24; cursor:pointer;" onclick="pOpenDtl('搜索详情', '<b>检索关键词：</b><br>${b.query}<br><br><b>🕵️‍♂️ 真实目的/心声：</b><br>${b.thought}')">
          <div style="font-size:14px; color:#fff; font-weight:500; margin-bottom:6px;">🔍 ${b.query}</div>
          <div style="font-size:11px; color:#666;">搜索于：${b.time}</div>
        </div>
      `).join('');
    } else if (appId === 'notes' && phoneData.notes) {
      titleEl.textContent = '行动备忘录';
      bodyEl.innerHTML = phoneData.notes.map(n => `
        <div style="padding:16px; border-bottom:1px solid #1c1f24; cursor:pointer;" onclick="pOpenDtl('${n.title}', '${n.content.replace(/\\n/g, '<br>')}')">
          <div style="font-size:15px; color:#e0a96d; font-weight:bold; margin-bottom:6px;">📌 ${n.title}</div>
          <div style="font-size:11px; color:#666;">更新于：${n.time}</div>
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