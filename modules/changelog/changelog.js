// ==========================================
// 独立插件：版本更新公告 (零侵入纯本地缓存版)
// 每次更新只需修改下方 VERSION 和 LOGS 即可自动触发未读高亮
// ==========================================
(function() {
  // 🌟 1. 每次发布新版本时，改一下这个版本号，所有用户就会重新亮起未读红点！
  const CURRENT_VERSION = '1.4.6';
  const STORAGE_KEY = 'terminal_changelog_read_ver';

  // 🌟 2. 写在这里的更新内容会自动渲染成漂亮的公告列表
  const CHANGELOG_DATA = [
    {
      version: 'v1.5.0',
      date: '2026-11-16',
      title: '沉浸式「查手机」模块正式上线',
      items: [
        '【扩展：查手机终端】「❖ 扩展」中控台新增高拟真查岗小手机！内置微信（4大完整分页与长对话）、小红书、淘宝与闪购外卖、Safari 浏览记录及行动备忘录，一键同步全频道最新 50 条记忆动态。',
        '【本地私密相册 & 随机壁纸】内置零 Token 消耗的本地加密相册（上限 20 张，自动高清压缩），每次打开手机都会随机抽取一张照片作为锁屏与主屏壁纸。',
        '【安全密码锁与防误触】支持在手机内「⚙️ 设置」自定义 4 位解锁密码（初始 0000）与强制锚定所在城市；锁屏通知实时同步你最新发出的消息，手动刷新增加二次防误触确认。',
        '【省流架构】默认走「② 档案共读模型」通道，且全量缓存在本地，日常聊天零 Token 占用。'
      ]
    },
    {
      version: 'v1.4.6',
      date: '2026-11-16',
      title: '业务后台摸鱼皮肤 & 电子书转码器上线',
      items: [
        '【业务后台摸鱼皮肤】「配置 - 界面外观」新增「ERP-OFFICE」蓝白办公系统皮肤，自带“审批通过”绿标与工单式对话气泡，上班摸鱼安全感拉满！',
        '【扩展：电子书转码器】「❖ 扩展」中控台新增 EPUB / 乱码 TXT 转码插件，纯本地零依赖解析电子书并保留完整分段，支持一键直接存入战术书库。',
        '【大部头智能分卷与分段修复】战术书库单文件导入上限放宽至 6MB，超大部头自动按卷拆分；彻底修复 Windows 记事本换行符被吞掉导致文字糊成一团的问题。',
        '【体验细节优化】修复手机端发送消息后输入框高度不自动回缩，以及聊天框左侧边沿偶发漏出抽屉阴影的显示问题。'
      ]
    },
    {
      version: 'v1.4.4',
      date: '2026-11-15',
      title: '输入体验优化 & 三路模型独立分流',
      items: [
        '【聊天框智能换行】电脑端支持 Shift+Enter 换行、Enter 直接发送；手机端回车键改为自由换行，点击发送按钮再发出，再也不怕输一半误发啦。',
        '【三路模型独立选择】系统设置支持分别指定「① 聊天模型」、「② 档案共读模型（日记/书库/信箱）」与「③ 日常任务模型（Daily 情绪与任务）」，重要对话用聪明模型，日常刷新省心省流！',
        '【安全重置彻底清理】修复了一键重置时偶发残留信件数据的小漏洞。'
      ]
    },
    {
      version: 'v1.4.3',
      date: '2026-11-14',
      title: '多频道抽屉 & 记忆与画板升级',
      items: [
        '【多频道侧边抽屉】点击聊天框左上角 ☰ 可新建/切换独立聊天频道，短期对话互不干扰，告别车轱辘话；长期记忆、日记与人设全频道通用。',
        '【核心记忆库 [MEM-DB]】配置-关于我们中上线长期记忆管理！全频道每聊满 50,000 Token 自动浓缩一条阶段记忆，每次聊天自动召回最新 15 条 + 5 条随机早期闪回。',
        '【24×24 像素小画板】修复了点阵矩阵被换行切碎的问题，TA 现在会随机在句末画一幅完整的发光点阵画送给你。',
        '【共读与日记联动】共读伴读与讨论现已接入完整聊天记忆；每日日记支持自动汇总全天所有频道的对话。',
        '【一键安全重置】系统设置底部新增格式化存档功能，需手打确认口令防误触。'
      ]
    },
    {
      version: 'v1.4.0',
      date: '2026-11-10',
      title: '扩展终端与多皮肤系统上线',
      items: [
        '新增「扩展」中控台，实装纪念日多档案相框、时空信箱与本地点唱机。',
        '新增「森屿手札」与「晴空牧场」两套视觉皮肤，支持实时无缝切换。'
      ]
    }
  ];

  // 注入插件专属的轻量样式（不污染主 style.css）
  const style = document.createElement('style');
  style.textContent = `
    .changelog-entry-btn {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      margin-bottom: 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-dim);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .changelog-entry-btn:hover {
      border-color: var(--accent-amber);
    }
    /* 未读高亮状态 */
    .changelog-entry-btn.unread {
      border-color: var(--accent-amber);
      background: rgba(0, 230, 118, 0.08);
      box-shadow: 0 0 10px rgba(0, 230, 118, 0.15);
    }
    .changelog-badge {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: var(--border-dim);
      color: var(--text-muted);
    }
    .changelog-entry-btn.unread .changelog-badge {
      background: var(--accent-amber);
      color: #000;
      font-weight: bold;
      animation: pulseBadge 1.8s infinite;
    }
    /* 右上角配置按钮的微型未读红点 */
    .cfg-unread-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-red);
      margin-left: 4px;
      vertical-align: middle;
      box-shadow: 0 0 6px var(--accent-red);
    }
    @keyframes pulseBadge {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .cl-version-block {
      background: var(--bg-input);
      border: 1px solid var(--border-dim);
      border-left: 3px solid var(--accent-amber);
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 12px;
    }
    .cl-version-block.old {
      border-left-color: var(--text-muted);
      opacity: 0.75;
    }
    .cl-ver-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px dashed var(--border-dim);
    }
    .cl-list {
      padding-left: 16px;
      font-size: 12.5px;
      line-height: 1.65;
      color: var(--text-main);
    }
    .cl-list li {
      margin-bottom: 5px;
    }
  `;
  document.head.appendChild(style);

  // 动态生成公告弹窗 HTML 塞进 body
  const modalHTML = `
    <div class="modal-backdrop hidden" id="changelog-modal" style="z-index: 260;">
      <div class="tac-modal" style="max-width: 500px;">
        <div class="panel-header modal-header">
          <span class="panel-tag">[SYS-LOG]</span>
          <h2>终端更新日志 // CHANGELOG</h2>
          <button class="close-btn" id="close-changelog-btn">✕</button>
        </div>
        <div class="modal-body" id="changelog-list-body" style="max-height: 60dvh; overflow-y: auto;">
        </div>
        <div class="modal-footer">
          <button class="tac-btn primary" id="confirm-changelog-btn">✓ 我知道了</button>
        </div>
      </div>
    </div>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const isUnread = localStorage.getItem(STORAGE_KEY) !== CURRENT_VERSION;

    // 1. 如果有新版本没看，给右上角「🔧 配置」按钮点亮一粒小红点
    const settingsBtn = document.getElementById('open-settings-btn');
    let topDot = null;
    if (settingsBtn && isUnread) {
      topDot = document.createElement('span');
      topDot.className = 'cfg-unread-dot';
      settingsBtn.appendChild(topDot);
    }

    // 2. 在「系统设置」标签页最顶部自动插入公告入口条
    const sysTab = document.getElementById('tab-system');
    if (sysTab) {
      const entryDiv = document.createElement('div');
      entryDiv.className = `changelog-entry-btn ${isUnread ? 'unread' : ''}`;
      entryDiv.id = 'open-changelog-entry';
      entryDiv.innerHTML = `
        <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main); font-weight: 600;">
          📢 系统更新公告 (${CURRENT_VERSION})
        </span>
        <span class="changelog-badge" id="changelog-status-badge">
          ${isUnread ? 'NEW · 点击查看' : '已读'}
        </span>
      `;
      sysTab.insertBefore(entryDiv, sysTab.firstChild);

      // 3. 绑定点击打开公告，并立刻标记为已读（熄灭所有高亮）
      const modal = document.getElementById('changelog-modal');
      const bodyEl = document.getElementById('changelog-list-body');

      entryDiv.addEventListener('click', () => {
        // 渲染公告内容
        bodyEl.innerHTML = CHANGELOG_DATA.map((log, idx) => `
          <div class="cl-version-block ${idx > 0 ? 'old' : ''}">
            <div class="cl-ver-header">
              <strong style="color: ${idx === 0 ? 'var(--accent-amber)' : 'var(--text-main)'}; font-family: var(--font-mono); font-size: 13px;">
                ${log.version} // ${log.title}
              </strong>
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${log.date}</span>
            </div>
            <ul class="cl-list">
              ${log.items.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `).join('');

        modal.classList.remove('hidden');

        // 熄灭高亮并写入本地已读缓存
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
        entryDiv.classList.remove('unread');
        const badge = document.getElementById('changelog-status-badge');
        if (badge) badge.textContent = '已读';
        if (topDot) topDot.remove();
      });

      const closeModal = () => modal.classList.add('hidden');
      document.getElementById('close-changelog-btn')?.addEventListener('click', closeModal);
      document.getElementById('confirm-changelog-btn')?.addEventListener('click', closeModal);
    }
  });
})();