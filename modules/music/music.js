// ==========================================
// 战术点唱机模块 (纯本地 IndexedDB 存储 + 静默评价)
// ==========================================

const DB_NAME = 'TerminalMusicDB';
const STORE_NAME = 'playlist';
let db = null;
let currentPlaylist = [];
let currentIndex = -1;
let playMode = 'loop'; // 'loop', 'single', 'random'

const audio = document.getElementById('core-audio-player');
let currentBlobUrl = null;
let evaluationTimer = null; // 防抖评价定时器
let hasEvaluatedCurrentSong = false; // 当前这首歌是否评价过

// --- 1. IndexedDB 存储引擎 ---
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(); };
    request.onerror = (e) => { console.error('DB Error', e); reject(e); };
  });
}

async function getAllSongs() {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function saveSong(songObj) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(songObj);
    tx.oncomplete = () => resolve();
  });
}

async function deleteSongFromDB(id) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
  });
}

// --- 2. 界面与播放逻辑 ---
async function renderPlaylist() {
  currentPlaylist = await getAllSongs();
  const container = document.getElementById('music-playlist-container');
  if (currentPlaylist.length === 0) {
    container.innerHTML = '<p class="slot-hint" style="margin-top: 20px;">列表为空，点击上方导入手机/电脑里的音频文件。</p>';
    return;
  }

  container.innerHTML = currentPlaylist.map((song, idx) => `
    <div class="song-item ${idx === currentIndex ? 'playing' : ''}" data-idx="${idx}">
      <div class="song-info">
        <span class="song-name">${song.title}</span>
        <span class="song-artist">${song.artist}</span>
      </div>
      <button class="song-delete-btn" data-id="${song.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.song-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('song-delete-btn')) {
        e.stopPropagation();
        if (confirm('从本地记忆中删除这首歌？')) {
          deleteSongFromDB(e.target.dataset.id).then(() => {
            if (Number(item.dataset.idx) === currentIndex) audio.pause();
            renderPlaylist();
          });
        }
        return;
      }
      playSong(Number(item.dataset.idx));
    });
  });
}

async function playSong(idx) {
  if (idx < 0 || idx >= currentPlaylist.length) return;
  currentIndex = idx;
  const song = currentPlaylist[idx];
  
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(song.blob);
  
  audio.src = currentBlobUrl;
  audio.play();
  
  document.getElementById('now-playing-title').textContent = `${song.artist} - ${song.title}`;
  document.getElementById('btn-music-play').textContent = '⏸ 暂停';
  
  const ticker = document.getElementById('global-music-ticker');
  if (ticker) {
    ticker.style.display = 'inline-block';
    ticker.textContent = `🎵 ${song.title}`;
  }

  renderPlaylist();

  // 🌟 核心：开启 8 秒防抖后台评价倒计时
  hasEvaluatedCurrentSong = false;
  if (evaluationTimer) clearTimeout(evaluationTimer);
  evaluationTimer = setTimeout(() => {
    if (!hasEvaluatedCurrentSong && !audio.paused) {
      triggerSilentMusicEvaluation(song.title, song.artist);
      hasEvaluatedCurrentSong = true; // 确保每首歌只评价一次
    }
  }, 8000);
}

// 🌟 利用现有的流式接口，静默向后台丢评价指令
async function triggerSilentMusicEvaluation(title, artist) {
  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  if (!cfg.apiKey || typeof callTacticalStreamAPI === 'undefined') return;
  if (window.isGenerating) return; // 如果正在聊天，就先憋着不说话
  
  window.isGenerating = true;
  const aiName = cfg.aiName || 'AI';
  
  // 极度客观中立的指令
  const prompt = `[系统隐秘事件：对方正在终端播放歌曲《${title}》（歌手：${artist}）。
请完全贴合你当前的人设性格，结合你们最近的聊天语境，随口在聊天室里对这首歌发表一些可长可短的评价、反应或联想。
请直接以角色视角输出，不要提及这是系统提示。]\n\n${typeof CHAT_STYLE_RULE !== 'undefined' ? CHAT_STYLE_RULE : ''}`;

  const aiBubble = typeof appendMessageBubble === 'function' 
    ? appendMessageBubble('assistant', `🎵 正在倾听《${title}》...`, Date.now(), true, false) 
    : null;

  try {
    const { messages } = buildContextPayload(prompt);
    const fullReply = await callTacticalStreamAPI(messages, (partial) => {
      if (aiBubble) {
        aiBubble.textContent = partial + ' ▋';
        const cb = document.getElementById('chat-messages');
        if(cb) cb.scrollTop = cb.scrollHeight;
      }
    });

    if (aiBubble) {
      const contentCol = aiBubble.parentElement; aiBubble.remove();
      const parts = splitIntoBubbles(fullReply);
      parts.forEach(part => {
        const b = document.createElement('div'); b.className = 'msg-bubble msg-ai'; b.style.marginBottom = '6px';
        b.innerHTML = formatMessageContent(part); contentCol.appendChild(b);
      });
      const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
      history.push({ role: 'assistant', content: fullReply, time: Date.now(), isProactive: true });
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
      if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();
    }
  } catch (err) {
    if (aiBubble) aiBubble.remove();
  } finally {
    window.isGenerating = false;
  }
}

// --- 3. 各种绑定的零碎事件 ---
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();

  const musicModal = document.getElementById('music-modal');
  const hubModal = document.getElementById('extension-hub-modal');

  document.getElementById('btn-open-music')?.addEventListener('click', () => {
    hubModal?.classList.add('hidden');
    musicModal?.classList.remove('hidden');
    renderPlaylist();
  });
  
  document.getElementById('close-music-btn')?.addEventListener('click', () => musicModal?.classList.add('hidden'));
  document.getElementById('global-music-ticker')?.addEventListener('click', () => musicModal?.classList.remove('hidden'));

  // 导入音乐逻辑
  document.getElementById('btn-trigger-music-upload')?.addEventListener('click', () => {
    document.getElementById('music-upload-input').click();
  });

  document.getElementById('music-upload-input')?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;
    
    for (let file of files) {
      // 智能拆分 "歌手 - 歌名.mp3"
      let nameStr = file.name.replace(/\.[^/.]+$/, "");
      let artist = "未知歌手", title = nameStr;
      if (nameStr.includes('-')) {
        const parts = nameStr.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }
      
      await saveSong({ id: Date.now().toString() + Math.random(), title, artist, blob: file });
    }
    
    e.target.value = '';
    renderPlaylist();
  });

  // 控制条逻辑
  const playBtn = document.getElementById('btn-music-play');
  playBtn?.addEventListener('click', () => {
    if (currentPlaylist.length === 0) return;
    if (audio.src) {
      if (audio.paused) { audio.play(); playBtn.textContent = '⏸ 暂停'; } 
      else { audio.pause(); playBtn.textContent = '▶ 播放'; }
    } else {
      playSong(0);
    }
  });

  document.getElementById('btn-music-prev')?.addEventListener('click', () => {
    if (currentPlaylist.length === 0) return;
    let nextIdx = playMode === 'random' ? Math.floor(Math.random() * currentPlaylist.length) : (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    playSong(nextIdx);
  });

  document.getElementById('btn-music-next')?.addEventListener('click', () => {
    if (currentPlaylist.length === 0) return;
    let nextIdx = playMode === 'random' ? Math.floor(Math.random() * currentPlaylist.length) : (currentIndex + 1) % currentPlaylist.length;
    playSong(nextIdx);
  });

  const modeBtn = document.getElementById('btn-music-mode');
  modeBtn?.addEventListener('click', () => {
    if (playMode === 'loop') { playMode = 'single'; modeBtn.textContent = '🔂'; modeBtn.title = '单曲循环'; }
    else if (playMode === 'single') { playMode = 'random'; modeBtn.textContent = '🔀'; modeBtn.title = '随机播放'; }
    else { playMode = 'loop'; modeBtn.textContent = '🔁'; modeBtn.title = '列表循环'; }
  });

  // 进度条与时间格式化
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const progressSlider = document.getElementById('music-progress');
  const curTimeEl = document.getElementById('music-current-time');
  const totTimeEl = document.getElementById('music-total-time');

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    progressSlider.value = (audio.currentTime / audio.duration) * 100;
    curTimeEl.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('loadedmetadata', () => {
    totTimeEl.textContent = formatTime(audio.duration);
  });

  progressSlider?.addEventListener('input', (e) => {
    if (!audio.duration) return;
    audio.currentTime = (e.target.value / 100) * audio.duration;
  });

  audio.addEventListener('ended', () => {
    if (currentPlaylist.length === 0) return;
    if (playMode === 'single') { audio.currentTime = 0; audio.play(); } 
    else { document.getElementById('btn-music-next').click(); }
  });

  // 音量控制
  const volBtn = document.getElementById('btn-music-vol');
  const volSlider = document.getElementById('music-vol-slider');
  volBtn?.addEventListener('click', () => volSlider.classList.toggle('hidden'));
  volSlider?.addEventListener('input', (e) => audio.volume = e.target.value);
});// ==========================================
// 战术点唱机模块 (纯本地 IndexedDB 存储 + 静默评价)
// ==========================================

const DB_NAME = 'TerminalMusicDB';
const STORE_NAME = 'playlist';
let db = null;
let currentPlaylist = [];
let currentIndex = -1;
let playMode = 'loop'; // 'loop', 'single', 'random'

const audio = document.getElementById('core-audio-player');
let currentBlobUrl = null;
let evaluationTimer = null; // 防抖评价定时器
let hasEvaluatedCurrentSong = false; // 当前这首歌是否评价过

// --- 1. IndexedDB 存储引擎 ---
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(); };
    request.onerror = (e) => { console.error('DB Error', e); reject(e); };
  });
}

async function getAllSongs() {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function saveSong(songObj) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(songObj);
    tx.oncomplete = () => resolve();
  });
}

async function deleteSongFromDB(id) {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
  });
}

// --- 2. 界面与播放逻辑 ---
async function renderPlaylist() {
  currentPlaylist = await getAllSongs();
  const container = document.getElementById('music-playlist-container');
  if (currentPlaylist.length === 0) {
    container.innerHTML = '<p class="slot-hint" style="margin-top: 20px;">列表为空，点击上方导入手机/电脑里的音频文件。</p>';
    return;
  }

  container.innerHTML = currentPlaylist.map((song, idx) => `
    <div class="song-item ${idx === currentIndex ? 'playing' : ''}" data-idx="${idx}">
      <div class="song-info">
        <span class="song-name">${song.title}</span>
        <span class="song-artist">${song.artist}</span>
      </div>
      <button class="song-delete-btn" data-id="${song.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.song-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('song-delete-btn')) {
        e.stopPropagation();
        if (confirm('从本地记忆中删除这首歌？')) {
          deleteSongFromDB(e.target.dataset.id).then(() => {
            if (Number(item.dataset.idx) === currentIndex) audio.pause();
            renderPlaylist();
          });
        }
        return;
      }
      playSong(Number(item.dataset.idx));
    });
  });
}

async function playSong(idx) {
  if (idx < 0 || idx >= currentPlaylist.length) return;
  currentIndex = idx;
  const song = currentPlaylist[idx];
  
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(song.blob);
  
  audio.src = currentBlobUrl;
  audio.play();
  
  document.getElementById('now-playing-title').textContent = `${song.artist} - ${song.title}`;
  document.getElementById('btn-music-play').textContent = '⏸ 暂停';
  
  const ticker = document.getElementById('global-music-ticker');
  if (ticker) {
    ticker.style.display = 'inline-block';
    ticker.textContent = `🎵 ${song.title}`;
  }

  renderPlaylist();

  // 🌟 核心：开启 8 秒防抖后台评价倒计时
  hasEvaluatedCurrentSong = false;
  if (evaluationTimer) clearTimeout(evaluationTimer);
  evaluationTimer = setTimeout(() => {
    if (!hasEvaluatedCurrentSong && !audio.paused) {
      triggerSilentMusicEvaluation(song.title, song.artist);
      hasEvaluatedCurrentSong = true; // 确保每首歌只评价一次
    }
  }, 8000);
}

// 🌟 利用现有的流式接口，静默向后台丢评价指令
async function triggerSilentMusicEvaluation(title, artist) {
  const cfg = typeof getConfig === 'function' ? getConfig() : {};
  if (!cfg.apiKey || typeof callTacticalStreamAPI === 'undefined') return;
  if (window.isGenerating) return; // 如果正在聊天，就先憋着不说话
  
  window.isGenerating = true;
  const aiName = cfg.aiName || 'AI';
  
  // 极度客观中立的指令
  const prompt = `[系统隐秘事件：对方正在终端播放歌曲《${title}》（歌手：${artist}）。
请完全贴合你当前的人设性格，结合你们最近的聊天语境，随口在聊天室里对这首歌发表一句简短的评价、反应或联想。
请直接说出这句话，不要提及这是系统提示。]\n\n${typeof CHAT_STYLE_RULE !== 'undefined' ? CHAT_STYLE_RULE : ''}`;

  const aiBubble = typeof appendMessageBubble === 'function' 
    ? appendMessageBubble('assistant', `🎵 正在倾听《${title}》...`, Date.now(), true, false) 
    : null;

  try {
    const { messages } = buildContextPayload(prompt);
    const fullReply = await callTacticalStreamAPI(messages, (partial) => {
      if (aiBubble) {
        aiBubble.textContent = partial + ' ▋';
        const cb = document.getElementById('chat-messages');
        if(cb) cb.scrollTop = cb.scrollHeight;
      }
    });

    if (aiBubble) {
      const contentCol = aiBubble.parentElement; aiBubble.remove();
      const parts = splitIntoBubbles(fullReply);
      parts.forEach(part => {
        const b = document.createElement('div'); b.className = 'msg-bubble msg-ai'; b.style.marginBottom = '6px';
        b.innerHTML = formatMessageContent(part); contentCol.appendChild(b);
      });
      const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY) || '[]');
      history.push({ role: 'assistant', content: fullReply, time: Date.now(), isProactive: true });
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(history));
      if (typeof updateTopBarMetrics === 'function') updateTopBarMetrics();
    }
  } catch (err) {
    if (aiBubble) aiBubble.remove();
  } finally {
    window.isGenerating = false;
  }
}

// --- 3. 各种绑定的零碎事件 ---
document.addEventListener('DOMContentLoaded', async () => {
  await initDB();

  const musicModal = document.getElementById('music-modal');
  const hubModal = document.getElementById('extension-hub-modal');

  document.getElementById('btn-open-music')?.addEventListener('click', () => {
    hubModal?.classList.add('hidden');
    musicModal?.classList.remove('hidden');
    renderPlaylist();
  });
  
  document.getElementById('close-music-btn')?.addEventListener('click', () => musicModal?.classList.add('hidden'));
  document.getElementById('global-music-ticker')?.addEventListener('click', () => musicModal?.classList.remove('hidden'));

  // 导入音乐逻辑
  document.getElementById('btn-trigger-music-upload')?.addEventListener('click', () => {
    document.getElementById('music-upload-input').click();
  });

  document.getElementById('music-upload-input')?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;
    
    for (let file of files) {
      // 智能拆分 "歌手 - 歌名.mp3"
      let nameStr = file.name.replace(/\.[^/.]+$/, "");
      let artist = "未知歌手", title = nameStr;
      if (nameStr.includes('-')) {
        const parts = nameStr.split('-');
        artist = parts[0].trim();
        title = parts.slice(1).join('-').trim();
      }
      
      await saveSong({ id: Date.now().toString() + Math.random(), title, artist, blob: file });
    }
    
    e.target.value = '';
    renderPlaylist();
  });

  // 控制条逻辑
  const playBtn = document.getElementById('btn-music-play');
  playBtn?.addEventListener('click', () => {
    if (currentPlaylist.length === 0) return;
    if (audio.src) {
      if (audio.paused) { audio.play(); playBtn.textContent = '⏸ 暂停'; } 
      else { audio.pause(); playBtn.textContent = '▶ 播放'; }
    } else {
      playSong(0);
    }
  });

  document.getElementById('btn-music-prev')?.addEventListener('click', () => {
    if (currentPlaylist.length === 0) return;
    let nextIdx = playMode === 'random' ? Math.floor(Math.random() * currentPlaylist.length) : (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
    playSong(nextIdx);
  });

  document.getElementById('btn-music-next')?.addEventListener('click', () => {
    if (currentPlaylist.length === 0) return;
    let nextIdx = playMode === 'random' ? Math.floor(Math.random() * currentPlaylist.length) : (currentIndex + 1) % currentPlaylist.length;
    playSong(nextIdx);
  });

  const modeBtn = document.getElementById('btn-music-mode');
  modeBtn?.addEventListener('click', () => {
    if (playMode === 'loop') { playMode = 'single'; modeBtn.textContent = '🔂'; modeBtn.title = '单曲循环'; }
    else if (playMode === 'single') { playMode = 'random'; modeBtn.textContent = '🔀'; modeBtn.title = '随机播放'; }
    else { playMode = 'loop'; modeBtn.textContent = '🔁'; modeBtn.title = '列表循环'; }
  });

  // 进度条与时间格式化
  const formatTime = (sec) => {
    const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  const progressSlider = document.getElementById('music-progress');
  const curTimeEl = document.getElementById('music-current-time');
  const totTimeEl = document.getElementById('music-total-time');

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    progressSlider.value = (audio.currentTime / audio.duration) * 100;
    curTimeEl.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('loadedmetadata', () => {
    totTimeEl.textContent = formatTime(audio.duration);
  });

  progressSlider?.addEventListener('input', (e) => {
    if (!audio.duration) return;
    audio.currentTime = (e.target.value / 100) * audio.duration;
  });

  audio.addEventListener('ended', () => {
    if (currentPlaylist.length === 0) return;
    if (playMode === 'single') { audio.currentTime = 0; audio.play(); } 
    else { document.getElementById('btn-music-next').click(); }
  });

  // 音量控制
  const volBtn = document.getElementById('btn-music-vol');
  const volSlider = document.getElementById('music-vol-slider');
  volBtn?.addEventListener('click', () => volSlider.classList.toggle('hidden'));
  volSlider?.addEventListener('input', (e) => audio.volume = e.target.value);
});