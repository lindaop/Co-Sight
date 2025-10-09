const defaultConfig = {
  durationMs: 90_000,
  goalPoints: 300,
  weights: { like: 1, comment: 1.5, keyword: 2 },
  keyword: '上车',
  nearThresholdPct: 0.10,
  themeId: 'classic',
  reveal: { type: 'code', value: 'DEAL-2025' },
  failFallbackText: '领取基础券 CMB-BASE，或关注下轮冲刺',
};

const storageKey = (id='demo') => `sprint-timer:${id}:v1`;

function initState(cfg){
  return {
    startedAt: 0,
    timeLeft: cfg.durationMs,
    progress: 0,
    likeBaseline: 0,
    lastCalibrateAt: 0,
    lastLikeTotal: 0,
    lastCommentByUserAt: {},
    lastSegment: null,
    keywordCount: 0,
    themeId: cfg.themeId,
    version: 'v1'
  };
}

function saveSnapshot(state, cfg){
  try { localStorage.setItem(storageKey(), JSON.stringify({ s: state, c: cfg })); } catch {}
}
function loadSnapshot(){
  try { return JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch { return null; }
}

function applyTheme(root, theme){
  root.classList.remove('theme-classic','theme-neon','theme-sunset');
  root.classList.add(`theme-${theme}`);
}

function setActiveSegment(seg){
  ['seg90','seg60','seg30','seg10'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('active', id === segIdFromName(seg));
  });
}
function segIdFromName(name){
  switch(name){
    case 'S90': return 'seg90';
    case 'S60': return 'seg60';
    case 'S30': return 'seg30';
    case 'S10': return 'seg10';
    default: return '';
  }
}

function computeSegment(ms){
  const s = Math.ceil(ms/1000);
  if (s <= 10) return 'S10';
  if (s <= 30) return 'S30';
  if (s <= 60) return 'S60';
  return 'S90';
}

function updateUI(state, cfg){
  const timeEl = document.getElementById('timeLeft');
  timeEl.textContent = Math.max(0, Math.ceil(state.timeLeft/1000)) + 's';

  const pct = Math.floor((state.progress / cfg.goalPoints) * 100);
  document.getElementById('progressFill').style.width = Math.min(100, pct) + '%';
  document.getElementById('progressPct').textContent = Math.min(100, pct) + '%';

  const need = Math.max(0, cfg.goalPoints - state.progress);
  const near = need / cfg.goalPoints <= cfg.nearThresholdPct && need > 0;
  document.getElementById('progressHint').textContent = near ? `还差 ${Math.ceil(need)} 分` : '';

  const last10El = document.getElementById('last10');
  const isLast10 = state.timeLeft <= 10_000 && state.timeLeft > 0 && state.progress < cfg.goalPoints;
  last10El.classList.toggle('on', isLast10);
  document.getElementById('kw').textContent = cfg.keyword;
  document.getElementById('kwCount').textContent = state.keywordCount;

  const seg = computeSegment(state.timeLeft);
  if (seg !== state.lastSegment){
    state.lastSegment = seg; setActiveSegment(seg);
  }
}

function revealSuccess(cfg){
  document.getElementById('reveal').classList.remove('hidden');
  document.getElementById('fallback').classList.add('hidden');
  const codeEl = document.getElementById('revealCode');
  const linkEl = document.getElementById('btnLink');
  const copyBtn = document.getElementById('btnCopy');

  if (cfg.reveal.type === 'code'){
    codeEl.textContent = cfg.reveal.value;
    codeEl.classList.remove('hidden');
    linkEl.classList.add('hidden');
  } else {
    codeEl.classList.add('hidden');
    linkEl.classList.remove('hidden');
    linkEl.href = cfg.reveal.value;
    linkEl.textContent = '打开链接';
  }
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(cfg.reveal.value); copyBtn.textContent = '已复制'; setTimeout(()=> copyBtn.textContent='复制', 1200); } catch {}
  };
}

function showFail(cfg){
  document.getElementById('reveal').classList.add('hidden');
  const fb = document.getElementById('fallback');
  fb.classList.remove('hidden');
  document.getElementById('fallbackText').textContent = cfg.failFallbackText || '';
}

function startSprint(cfg){
  const root = document.getElementById('sprint-card');
  applyTheme(root, cfg.themeId);
  document.getElementById('metaGoal').textContent = `目标：${cfg.goalPoints}分`;
  document.getElementById('metaKeyword').textContent = `关键词：${cfg.keyword}`;

  let state = initState(cfg);
  const snap = loadSnapshot();
  if (snap){
    state = { ...initState(snap.c), ...snap.s };
    cfg = { ...cfg, ...snap.c };
    // 校正 timeLeft
    const elapsed = Date.now() - (state.startedAt || Date.now());
    state.timeLeft = Math.max(0, cfg.durationMs - elapsed);
  }

  // reset overlays
  document.getElementById('reveal').classList.add('hidden');
  document.getElementById('fallback').classList.add('hidden');

  state.startedAt = Date.now();
  updateUI(state, cfg); saveSnapshot(state, cfg);

  let pendingDelta = 0;
  const tick = () => {
    state.timeLeft -= 200;
    if (state.timeLeft < 0) state.timeLeft = 0;

    // drain pending
    if (pendingDelta > 0){
      state.progress += pendingDelta;
      pendingDelta = 0;
    }

    if (state.progress >= cfg.goalPoints){
      revealSuccess(cfg); saveSnapshot(state, cfg); clearInterval(timer); return;
    }
    if (state.timeLeft <= 0){
      showFail(cfg); saveSnapshot(state, cfg); clearInterval(timer); return;
    }

    updateUI(state, cfg);

    // periodic calibrate (mock: use getLiveRoomLikeCount)
    const now = Date.now();
    if (now - (state.lastCalibrateAt||0) > 45_000){
      tt.getLiveRoomLikeCount().then(total => {
        state.lastCalibrateAt = now;
        state.lastLikeTotal = total;
        saveSnapshot(state, cfg);
      });
    }
    saveSnapshot(state, cfg);
  };
  const timer = setInterval(tick, 200);

  // events
  const likeOff = tt.onReceiveLiveInteractPluginMessage((evt)=>{
    if (evt?.type === 'LIKE_DELTA'){
      pendingDelta += evt.payload.count * (cfg.weights.like || 0);
    }
  });

  const commentOff = tt.onComment(({userId, text})=>{
    const now = Date.now();
    const last = state.lastCommentByUserAt[userId] || 0;
    if (now - last < 5000) return; // 去水化 5s
    state.lastCommentByUserAt[userId] = now;

    const inLast10 = state.timeLeft <= 10_000 && state.timeLeft > 0 && state.progress < cfg.goalPoints;
    if (inLast10 && text && text.toLowerCase().includes((cfg.keyword||'').toLowerCase())){
      pendingDelta += (cfg.weights.keyword || 0);
      state.keywordCount += 1;
    } else {
      pendingDelta += (cfg.weights.comment || 0);
    }
  });

  return () => { clearInterval(timer); likeOff?.(); commentOff?.(); };
}

function bindControls(){
  const duration = document.getElementById('duration');
  const goal = document.getElementById('goal');
  const wLike = document.getElementById('wLike');
  const wComment = document.getElementById('wComment');
  const wKeyword = document.getElementById('wKeyword');
  const keyword = document.getElementById('keyword');
  const nearPct = document.getElementById('nearPct');
  const theme = document.getElementById('theme');
  const revealType = document.getElementById('revealType');
  const revealValue = document.getElementById('revealValue');

  let stop = null;

  document.getElementById('btnStart').addEventListener('click', ()=>{
    if (stop) stop();
    const cfg = {
      durationMs: Math.max(10, Number(duration.value)) * 1000,
      goalPoints: Math.max(10, Number(goal.value)),
      weights: { like: Number(wLike.value), comment: Number(wComment.value), keyword: Number(wKeyword.value) },
      keyword: keyword.value || defaultConfig.keyword,
      nearThresholdPct: Math.max(0.01, Math.min(0.5, Number(nearPct.value)/100)),
      themeId: theme.value,
      reveal: { type: revealType.value, value: revealValue.value },
      failFallbackText: defaultConfig.failFallbackText,
    };
    localStorage.setItem(storageKey(), '');
    stop = startSprint(cfg);
  });

  document.getElementById('btnReset').addEventListener('click', ()=>{
    if (stop) stop();
    localStorage.removeItem(storageKey());
    document.getElementById('reveal').classList.add('hidden');
    document.getElementById('fallback').classList.add('hidden');
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressPct').textContent = '0%';
    document.getElementById('progressHint').textContent = '';
    document.getElementById('timeLeft').textContent = duration.value + 's';
    ['seg90','seg60','seg30','seg10'].forEach(id=>document.getElementById(id).classList.remove('active'));
  });

  document.getElementById('btnLike').addEventListener('click', ()=> tt.__mock.addLikes(10));
  document.getElementById('btnComment').addEventListener('click', ()=> tt.__mock.addComment('随便聊聊'));
  document.getElementById('btnAuto').addEventListener('click', ()=>{
    const on = tt.__mock.toggleAuto();
    document.getElementById('btnAuto').textContent = on ? '自动刷赞（开启）' : '自动刷赞（切换）';
  });
  document.getElementById('btnSendKW').addEventListener('click', ()=>{
    const kw = keyword.value || defaultConfig.keyword;
    tt.__mock.addComment(kw);
  });
}

window.addEventListener('DOMContentLoaded', ()=>{
  bindControls();
  // 初始显示默认参数
  document.getElementById('timeLeft').textContent = Math.ceil(defaultConfig.durationMs/1000) + 's';
  document.getElementById('metaGoal').textContent = `目标：${defaultConfig.goalPoints}分`;
  document.getElementById('metaKeyword').textContent = `关键词：${defaultConfig.keyword}`;
});
