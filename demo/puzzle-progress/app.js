const defaultConfig = {
  gridSize: 3,
  thresholdPerTile: 50,
  commentWeight: 1.5,
  rewardText: '完成解锁：加演一首',
  nearThresholdHintPct: 0.1,
  theme: 'classic',
};

const storageKey = (roomId='demo') => `puzzle-progress:${roomId}:v1`;

function initState(config){
  const totalTiles = config.gridSize * config.gridSize;
  return {
    totalProgress: 0,
    unlockedIndices: [],
    likeBase: 0,
    commentBucket: 0,
    theme: config.theme,
    totalTiles,
    order: Array.from({length: totalTiles}, (_,i)=>i),
  };
}

function saveSnapshot(state, config){
  const snapshot = { s: state, c: config };
  localStorage.setItem(storageKey(), JSON.stringify(snapshot));
}

function loadSnapshot(){
  try { return JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch { return null; }
}

function applyTheme(root, theme){
  root.classList.remove('theme-classic','theme-neon','theme-sunset');
  root.classList.add(`theme-${theme}`);
}

function renderGrid(gridEl, state){
  gridEl.innerHTML = '';
  const cols = state.totalTiles ** 0.5;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  for (let i=0;i<state.totalTiles;i++){
    const tile = document.createElement('div');
    tile.className = 'tile ' + (state.unlockedIndices.includes(i)?'unlocked':'locked');
    const shine = document.createElement('div');
    shine.className = 'shine';
    tile.appendChild(shine);
    gridEl.appendChild(tile);
  }
}

function updateProgressUI(state, config){
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');
  const hint = document.getElementById('hintText');

  const unlocked = state.unlockedIndices.length;
  const pct = Math.floor((unlocked / state.totalTiles) * 100);
  fill.style.width = pct + '%';
  text.textContent = pct + '%';

  if (unlocked < state.totalTiles){
    const modulo = state.totalProgress % config.thresholdPerTile;
    const needRaw = config.thresholdPerTile - modulo;
    const needForNext = Math.ceil(Math.max(0, needRaw));
    const near = needForNext / config.thresholdPerTile <= config.nearThresholdHintPct;
    hint.textContent = near ? `再集 ${needForNext} 进下一块` : '';
  } else {
    hint.textContent = '';
  }
}

function tryUnlock(state, config, gridEl){
  let unlocked = 0;
  while (state.unlockedIndices.length < state.totalTiles && state.totalProgress >= (state.unlockedIndices.length + 1) * config.thresholdPerTile){
    const nextIndex = state.order[state.unlockedIndices.length];
    state.unlockedIndices.push(nextIndex);
    unlocked++;
  }
  if (unlocked > 0){
    // re-render only changed tiles
    Array.from(gridEl.children).forEach((el, idx)=>{
      if (state.unlockedIndices.includes(idx)){
        el.classList.remove('locked');
        el.classList.add('unlocked');
      }
    });
  }
  if (state.unlockedIndices.length === state.totalTiles){
    document.getElementById('celebration').classList.remove('hidden');
  }
}

async function mount(config){
  const root = document.getElementById('puzzle-card');
  const rewardText = document.getElementById('rewardText');
  const gridEl = document.getElementById('puzzleGrid');
  const celebration = document.getElementById('celebration');

  let state = initState(config);
  const snapshot = loadSnapshot();
  if (snapshot){
    state = { ...initState(snapshot.c), ...snapshot.s };
    config = { ...config, ...snapshot.c };
  }

  applyTheme(root, config.theme);
  rewardText.textContent = config.rewardText;

  // init grid
  renderGrid(gridEl, state);
  updateProgressUI(state, config);

  // init data baseline
  const base = await tt.getLiveRoomLikeCount();
  state.likeBase = base;

  // message handlers
  const likeHandler = (evt) => {
    if (evt?.type === 'LIKE_DELTA'){
      state.totalProgress += evt.payload.count;
      tryUnlock(state, config, gridEl);
      updateProgressUI(state, config);
      saveSnapshot(state, config);
    }
  };
  const commentHandler = (evt) => {
    state.totalProgress += Math.max(0, config.commentWeight || 0) ;
    tryUnlock(state, config, gridEl);
    updateProgressUI(state, config);
    saveSnapshot(state, config);
  };

  tt.onReceiveLiveInteractPluginMessage(likeHandler);
  tt.onComment(commentHandler);

  // theme switch via demo control
  document.getElementById('theme').addEventListener('change', (e)=>{
    const t = e.target.value;
    config.theme = t; state.theme = t;
    applyTheme(root, t); saveSnapshot(state, config);
  });
}

function bindControls(){
  const gridSize = document.getElementById('gridSize');
  const thresholdPerTile = document.getElementById('thresholdPerTile');
  const commentWeight = document.getElementById('commentWeight');
  const rewardInput = document.getElementById('rewardInput');

  document.getElementById('btnReset').addEventListener('click', ()=>{
    const config = {
      gridSize: Number(gridSize.value),
      thresholdPerTile: Math.max(1, Number(thresholdPerTile.value)),
      commentWeight: Number(commentWeight.value),
      rewardText: rewardInput.value || defaultConfig.rewardText,
      nearThresholdHintPct: defaultConfig.nearThresholdHintPct,
      theme: document.getElementById('theme').value,
    };
    localStorage.removeItem(storageKey());
    // recreate UI quickly
    document.getElementById('celebration').classList.add('hidden');
    mount(config);
  });

  document.getElementById('btnLike').addEventListener('click', ()=> tt.__mock.addLikes(10));
  document.getElementById('btnComment').addEventListener('click', ()=> tt.__mock.addComments(5));
  document.getElementById('btnAuto').addEventListener('click', ()=> {
    const on = tt.__mock.toggleAuto();
    document.getElementById('btnAuto').textContent = on ? '自动刷赞（开启）' : '自动刷赞（切换）';
  });
}

window.addEventListener('DOMContentLoaded', ()=>{
  bindControls();
  mount({ ...defaultConfig });
});
