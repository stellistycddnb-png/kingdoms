'use strict';
/* =====================================================
   КОРОЛЕВСТВА — интерфейс
   MADE BY PESSIMIST  ·  Telegram: @Izzolentaaa
   ===================================================== */

const $ = s => document.querySelector(s);

let selId = -1, tab = 'info', mode = null, mvFrac = 1, mvHero = false, busy = false;
let setupSel = { kid: 0, size: 1, diff: 1 };
let settings = {};
let afterClose = null, modalLock = false, battleTimer = null, lastBattle = null, boomDone = false, promoT = null;

/* ---------- Настройки и сохранения ---------- */
function loadSettings() {
  try { settings = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch (e) { settings = {}; }
  if (settings.setup) setupSel = Object.assign(setupSel, settings.setup);
}
function saveSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
    o.tut = settings.tut; o.setup = setupSel;
    localStorage.setItem(SET_KEY, JSON.stringify(o));
  } catch (e) { }
}
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G, (k, v) => k === 'reports' ? undefined : v)); return true; } catch (e) { return false; }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const g = JSON.parse(raw);
    if (!g || !g.provs || !g.kings || !g.cfg) return false;
    MAP = genMap(g.cfg.seed, SIZES[g.cfg.size].n);
    G = g;
    G.notes = G.notes || []; G.offers = G.offers || []; G.log = G.log || [];
    return true;
  } catch (e) { return false; }
}
const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };

/* ---------- Помощники ---------- */
const fm = n => { n = Math.floor(n); return n >= 100000 ? Math.round(n / 1000) + 'K' : String(n); };
const tgLinks = () => `<div class="tg-row">
  <a class="btn tg" href="${TG_CHANNEL}" target="_blank" rel="noopener">📢 Канал создателя</a>
  <a class="btn tg" href="${TG_USER_URL}" target="_blank" rel="noopener">✉️ ${TG_USER}</a></div>`;

function toast(msg, kind) {
  const box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600);
}
function openModal(html, o) {
  o = o || {};
  const sh = $('#sheet');
  sh.innerHTML = html; sh.className = o.narrow ? 'narrow' : ''; sh.scrollTop = 0;
  modalLock = !!o.lock; afterClose = o.onClose || null;
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  $('#modal').classList.add('hidden'); modalLock = false;
  if (battleTimer) { clearTimeout(battleTimer); battleTimer = null; }
  const f = afterClose; afterClose = null; if (f) f();
}
function costChips(cost, k) {
  return `<div class="cost">${Object.keys(cost).map(r => `<span class="cc${k.res[r] >= cost[r] ? '' : ' bad'}">${RINFO[r].i} ${cost[r]}</span>`).join('')}</div>`;
}
const armyHTML = a => UORDER.filter(u => a[u]).map(u => `<span class="uc" title="${UNITS[u].n}">${UNITS[u].i} ${a[u]}</span>`).join('') || '<span class="muted">никого</span>';
const kName = id => id < 0 ? 'Нейтральные земли' : KINGDOMS[G.kings[id].kid].n;
const kFlag = id => id < 0 ? '🏴' : KINGDOMS[G.kings[id].kid].flag;

/* =====================================================
   Экраны: интро, меню, выбор королевства
   ===================================================== */
function runIntro() {
  Snd.unlock();
  const boom = () => { if (!boomDone && Snd.running()) { boomDone = true; Snd.sfx('boom'); } };
  setTimeout(boom, 900);
  setTimeout(() => { if (!Snd.running()) $('#itap').classList.remove('hidden'); }, 1800);
  $('#intro').addEventListener('pointerdown', () => { Snd.unlock(); setTimeout(boom, 200); });
  setTimeout(endIntro, 4300);
}
function endIntro() {
  const i = $('#intro');
  if (i.classList.contains('out')) return;
  i.classList.add('out');
  showTitle();
  setTimeout(() => i.classList.add('hidden'), 900);
}

function showTitle() {
  $('#hud').classList.add('hidden'); $('#setup').classList.add('hidden'); $('#loading').classList.add('hidden');
  if (MAP) { Rn.setMap(); Rn.setDecor(true); }
  buildTitle();
  $('#title').classList.remove('hidden');
  Snd.setMode('calm');
}
function buildTitle() {
  const hs = hasSave();
  $('#titleMenu').innerHTML = `
    ${hs ? '<button class="btn gold" data-act="continue">▶ Продолжить</button>' : ''}
    <button class="btn ${hs ? '' : 'gold'}" data-act="newgame">⚔️ Новая игра</button>
    <button class="btn" data-act="howto">📖 Как играть</button>
    <button class="btn" data-act="settings">⚙️ Настройки</button>
    <a class="btn tg" href="${TG_CHANNEL}" target="_blank" rel="noopener">📢 Канал создателя</a>
    <a class="btn tg" href="${TG_USER_URL}" target="_blank" rel="noopener">✉️ Автор ${TG_USER}</a>
    <button class="btn sm" data-act="privacy">🔒 Политика конфиденциальности</button>`;
}

function buildSetup() {
  const cards = KINGDOMS.map(k => `
    <button class="kcard ${setupSel.kid === k.id ? 'on' : ''}" data-act="pickk" data-id="${k.id}">
      <div class="kband" style="background:${k.c}"></div><div class="kf">${k.flag}</div>
      <b>${k.n}</b><div class="kt">${k.td}</div><div class="kd">${k.desc}</div></button>`).join('');
  $('#setup').innerHTML = `
    <h2>Выбери королевство</h2>
    <div class="kcards">${cards}</div>
    <div class="opts">
      <div class="chips"><span class="lbl">Карта:</span>${SIZES.map((s, i) => `<button class="chip ${setupSel.size === i ? 'on' : ''}" data-act="picksz" data-id="${i}">${s.name}</button>`).join('')}</div>
      <div class="chips"><span class="lbl">Сложность:</span>${DIFFN.map((s, i) => `<button class="chip ${setupSel.diff === i ? 'on' : ''}" data-act="pickdf" data-id="${i}">${s}</button>`).join('')}</div>
    </div>
    <div class="lbl">${SIZES[setupSel.size].d}</div>
    <div class="row"><button class="btn sm" data-act="back">← Назад</button>
    <button class="btn gold" style="width:auto;padding:.6rem 2.2rem" data-act="start">Начать игру</button></div>`;
}

function showLoading(cb) {
  $('#ldTip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];
  $('#loading').classList.remove('hidden');
  setTimeout(() => { cb(); setTimeout(() => $('#loading').classList.add('hidden'), 1100); }, 80);
}

function startNewGame() {
  settings.tut = settings.tut; saveSettings();
  $('#setup').classList.add('hidden'); $('#title').classList.add('hidden');
  showLoading(() => {
    newGame({ kid: setupSel.kid, size: setupSel.size, diff: setupSel.diff, seed: (Math.random() * 1e9) | 0 });
    enterGame();
  });
}
function continueGame() {
  $('#title').classList.add('hidden');
  showLoading(() => {
    if (!loadGame()) { toast('Сохранение повреждено', 'bad'); localStorage.removeItem(SAVE_KEY); showTitle(); return; }
    enterGame();
  });
}

function enterGame() {
  $('#title').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  Rn.setMap(); Rn.setDecor(false);
  mode = null; $('#moveBar').classList.add('hidden');
  const cap = G.kings[0].cap;
  Rn.focus(cap, 1.25);
  selId = -1; select(cap);
  refreshHUD();
  Snd.setMode('calm');
  if (G.over === 'win' || G.over === 'lose') G.over = G.over === 'win' ? null : G.over;
  if (!settings.tut) { settings.tut = true; saveSettings(); showHelp(); }
  else if (G.event || G.notes.length || G.offers.length) showSummary();
}

/* =====================================================
   HUD
   ===================================================== */
function refreshHUD() {
  if (!G) return;
  const k = G.kings[0], n = netIncome(k), si = seasonIdx(), kd = KINGDOMS[k.kid];
  $('#kinfo').innerHTML = `<span class="fl">${kd.flag}</span><span class="kn">${kd.n}</span>`;
  $('#res').innerHTML = RES.map(r => `<div class="rc"><span>${RINFO[r].i}</span><b>${fm(k.res[r])}</b><em class="${n[r] < 0 ? 'neg' : ''}">${n[r] >= 0 ? '+' : ''}${Math.round(n[r])}</em></div>`).join('');
  $('#tinfo').textContent = `Ход ${G.turn} · ${SEASONS[si].i} ${SEASONS[si].n}`;
  $('#muteBtn').textContent = Snd.S.muted ? '🔇' : '🔊';
  $('#dTech').classList.toggle('hidden', !TORDER.some(id => techState(k, id) === 'open' && k.res.know >= TECHS[id].cost));
  $('#dDiplo').classList.toggle('hidden', !G.offers.length);
}
function afterAction() { refreshHUD(); if (selId >= 0) renderPanel(); }

/* =====================================================
   Панель провинции
   ===================================================== */
function select(id) {
  selId = id; Rn.setSel(id); tab = 'info';
  if (id >= 0) { renderPanel(); $('#panel').classList.remove('closed'); } else $('#panel').classList.add('closed');
}

function renderPanel() {
  if (selId < 0) return;
  const p = G.provs[selId], mp = MAP.provs[selId], T = TERR[mp.terr], me = G.kings[0], mine = p.owner === 0;
  const owner = p.owner >= 0 ? G.kings[p.owner] : null;
  const head = `<div class="ph"><b>${owner && owner.cap === p.id ? '🏰 ' : ''}${mp.name}</b>
    <div class="sub">${T.i} ${T.n}${mp.coast ? ' · побережье' : ''} · ${kFlag(p.owner)} ${kName(p.owner)}</div>
    <button class="x" data-act="closep">✕</button></div>`;
  const tabs = mine ? `<div class="tabs">${[['info', 'Обзор'], ['build', 'Стройка'], ['rec', 'Найм']].map(([t, n]) => `<button data-act="tab" data-t="${t}" class="${tab === t ? 'on' : ''}">${n}</button>`).join('')}</div>` : '';
  let body = '';
  if (!mine || tab === 'info') body = panelInfo(p, mp, T, owner, mine);
  else if (tab === 'build') body = panelBuild(p, me);
  else body = panelRec(p, me);
  $('#panel').innerHTML = head + tabs + `<div class="pbody">${body}</div>`;
}

function panelInfo(p, mp, T, owner, mine) {
  const me = G.kings[0];
  let h = '';
  if (owner) {
    const y = provYield(p);
    h += `<div class="kv"><span>Доход (базовый)</span><span>${RES.map(r => y[r] ? `${RINFO[r].i}${Math.round(y[r])}` : '').join(' ')}</span></div>`;
  } else h += `<div class="note">Нейтральные земли. Захвати их — получишь постоянный доход и добычу.</div>`;
  let def = T.def + (p.b.walls || 0) * 0.15 + (owner && owner.cap === p.id ? 0.1 : 0);
  if (owner) def += kBonus(owner, 'def');
  h += `<div class="kv"><span>🛡️ Защита</span><span>+${Math.round(def * 100)}%</span></div>`;
  const bl = Object.keys(p.b);
  h += `<div class="kv"><span>Постройки</span><span>${bl.length ? bl.map(b => `${BLD[b].i}<span class="pips">${'●'.repeat(p.b[b])}</span>`).join(' ') : '—'}</span></div>`;
  if (owner && heroHere(owner, p.id)) h += `<div class="kv"><span>Генерал</span><span>🦸 ${owner.hero.n} (ур. ${owner.hero.lvl})</span></div>`;
  h += `<h3>${mine ? 'Армия' : 'Гарнизон'}</h3>`;
  if (mine) {
    h += `<div>${armyHTML(p.army)}</div>`;
    if (sizeOf(p.tired)) h += `<div class="muted" style="font-size:.75rem;margin-top:.2rem">Свежие войска (готовы со след. хода): ${armyHTML(p.tired)}</div>`;
    h += sizeOf(p.army) ? `<button class="btn gold" style="margin-top:.6rem" data-act="target">🎯 Двигать / атаковать</button>`
      : `<div class="note">Нет готовых к движению войск. Найми армию во вкладке «Найм».</div>`;
  } else {
    h += `<div>${armyHTML(merge(p.army, p.tired))}</div>`;
    const near = MAP.provs[p.id].nb.filter(n => G.provs[n].owner === 0 && sizeOf(G.provs[n].army) > 0);
    if (p.owner >= 0 && getRel(0, p.owner).st !== 'war') {
      const st = getRel(0, p.owner).st;
      h += `<div class="note warn">${st === 'ally' ? 'Это земли союзника.' : 'Вы в мире с этим королевством.'} Для нападения нужна война.</div>`;
      if (near.length) h += `<button class="btn red" data-act="askwar" data-k="${p.owner}">⚔️ Объявить войну</button>`;
    } else if (near.length) {
      h += `<h3>Атаковать из</h3>` + near.map(n => `<button class="btn red" style="margin:.25rem 0" data-act="atkfrom" data-from="${n}" data-to="${p.id}">⚔️ ${MAP.provs[n].name} (${sizeOf(G.provs[n].army)})</button>`).join('');
    } else h += `<div class="note">Рядом нет твоих армий. Подведи войска к соседней провинции.</div>`;
  }
  return h;
}

function panelBuild(p, k) {
  let h = `<div class="kv"><span>Места для построек</span><span>${slotsUsed(p)} / ${slotsMax(k, p)}</span></div>`;
  if (p.built) h += `<div class="note warn">В этом ходу здесь уже построено. Следующая стройка — со следующего хода.</div>`;
  for (const b of Object.keys(BLD)) {
    const lv = p.b[b] || 0, err = canBuild(k, p, b), cost = buildCost(k, p, b);
    h += `<div class="item"><div class="ii">${BLD[b].i}</div><div class="ib2"><div class="nm">${BLD[b].n} <span class="pips">${'●'.repeat(lv)}${'○'.repeat(BLD_MAX - lv)}</span></div>
      <div class="ds">${BLD[b].d}</div>${lv < BLD_MAX ? costChips(cost, k) : ''}</div>
      <button class="act ${err ? 'off' : ''}" data-act="bld" data-b="${b}">${lv >= BLD_MAX ? 'Макс.' : 'Строить'}</button></div>`;
  }
  return h;
}

function panelRec(p, k) {
  let h = `<div class="kv"><span>Найм в этом ходу</span><span>${p.rec} / ${recLimit(k, p)}</span></div>
    <div class="ds muted" style="font-size:.72rem">Новые воины готовы к движению со следующего хода. Они едят 🌾 каждый ход.</div>`;
  for (const u of UORDER) {
    const d = UNITS[u], lock = unitLockReason(k, p, u);
    h += `<div class="item"><div class="ii">${d.i}</div><div class="ib2"><div class="nm">${d.n}</div>
      <div class="ds">⚔️ ${d.atk} · ❤️ ${d.hp} · ${d.d}</div>
      ${lock ? `<div class="ds" style="color:var(--warn)">🔒 ${lock}</div>` : costChips(unitCost(k, p, u), k)}</div>
      ${lock ? '' : `<div class="acts"><button class="act sm" data-act="rec" data-u="${u}" data-n="1">+1</button><button class="act sm" data-act="rec" data-u="${u}" data-n="5">+5</button></div>`}</div>`;
  }
  return h;
}

/* =====================================================
   Перемещение и бой
   ===================================================== */
function startTarget() {
  const p = G.provs[selId], me = G.kings[0];
  if (!p || p.owner !== 0 || !sizeOf(p.army)) return;
  mode = 'target'; mvFrac = 1; mvHero = heroHere(me, selId);
  $('#panel').classList.add('closed');
  const tg = [];
  for (const n of MAP.provs[selId].nb) {
    const q = G.provs[n];
    tg.push({ id: n, kind: q.owner === 0 ? 'move' : (q.owner === -1 || getRel(0, q.owner).st === 'war') ? 'attack' : 'blocked' });
  }
  Rn.setTargets(tg);
  renderMoveBar();
}
function renderMoveBar() {
  const me = G.kings[0], bar = $('#moveBar'), p = G.provs[selId];
  bar.classList.remove('hidden');
  bar.innerHTML = `<b>🎯 Выбери соседнюю провинцию</b>
    <span class="lbl">Отряд:</span>${[0.25, 0.5, 0.75, 1].map(v => `<button class="chip ${mvFrac === v ? 'on' : ''}" data-act="frac" data-v="${v}">${v === 1 ? 'Все' : Math.round(v * 100) + '%'}</button>`).join('')}
    ${heroHere(me, selId) ? `<button class="chip ${mvHero ? 'on' : ''}" data-act="herot">🦸 С генералом</button>` : ''}
    <button class="chip" data-act="canceltarget">Отмена</button>`;
}
function cancelTarget() {
  mode = null; Rn.setTargets([]); $('#moveBar').classList.add('hidden');
  if (selId >= 0 && !$('#hud').classList.contains('hidden')) $('#panel').classList.remove('closed');
}

function onMapTap(sx, sy) {
  if (!G || $('#hud').classList.contains('hidden') || !$('#modal').classList.contains('hidden')) return;
  const id = Rn.hit(sx, sy);
  if (mode === 'target') {
    if (id === selId || id < 0) { cancelTarget(); return; }
    if (!MAP.provs[selId].nb.includes(id)) { toast('Выбери подсвеченную соседнюю провинцию', 'warn'); return; }
    const q = G.provs[id];
    if (q.owner === 0) doMove(selId, id);
    else if (q.owner === -1 || getRel(0, q.owner).st === 'war') showAttackConfirm(selId, id);
    else askWar(q.owner);
    return;
  }
  Snd.sfx('tap');
  select(id < 0 ? -1 : id);
}

function doMove(from, to) {
  const r = moveArmy(from, to, mvFrac, mvHero);
  if (r.err) { toast(r.err, 'warn'); Snd.sfx('error'); return; }
  if (r.move) {
    Snd.sfx('recruit'); toast(`Отряд (${r.count}) идёт в ${MAP.provs[to].name}`);
    cancelTarget(); afterAction();
  }
}

function showAttackConfirm(from, to) {
  const est = estimateBattle(from, to, mvFrac, mvHero), q = G.provs[to], pct = Math.round(est.win * 100);
  const cls = pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad';
  const verdict = pct >= 85 ? 'Победа почти обеспечена.' : pct >= 60 ? 'Победа вероятна.' : pct >= 40 ? 'Бой может пойти в любую сторону.' : 'Скорее всего, поражение. Усиль армию.';
  openModal(`<h2>⚔️ Атака на ${MAP.provs[to].name}</h2>
    <div class="bt"><div class="bside"><h4>${kFlag(0)} Твои силы</h4>${armyHTML(est.att)}</div>
    <div class="bmid"><b>VS</b></div>
    <div class="bside"><h4>${kFlag(q.owner)} ${kName(q.owner)}</h4>${armyHTML(est.def)}</div></div>
    <div class="note ${cls}"><b>Шанс победы: ${pct}%</b><div class="bar op"><i style="width:${pct}%"></i></div>${verdict}<br>
    Ожидаемые потери: твои ~${Math.round(est.lossA)}, враг ~${Math.round(est.lossD)}.<br>
    Бонус атаки ${est.aB >= 0 ? '+' : ''}${Math.round(est.aB * 100)}% · бонус защиты врага +${Math.round(est.dB * 100)}%</div>
    <div class="mrow"><button class="btn" data-act="close">Отмена</button><button class="btn red" data-act="doattack" data-from="${from}" data-to="${to}">⚔️ В атаку!</button></div>`);
}

function doAttack(from, to) {
  const r = moveArmy(from, to, mvFrac, mvHero);
  if (r.err) { closeModal(); toast(r.err, 'warn'); return; }
  cancelTarget();
  if (r.battle) showBattle(r.battle);
}

function showBattle(rep) {
  lastBattle = rep;
  const A = KINGDOMS[G.kings[rep.attK].kid], D = rep.defK >= 0 ? KINGDOMS[G.kings[rep.defK].kid] : null;
  const rows = (side, start, color) => UORDER.filter(u => start[u]).map(u =>
    `<div class="brow"><span class="bi">${UNITS[u].i}</span><span class="bb"><i id="b${side}${u}" style="background:${color}"></i></span><span class="bn" id="n${side}${u}">${start[u]}</span></div>`).join('');
  openModal(`<h2>⚔️ Битва за ${MAP.provs[rep.to].name}</h2>
    <div class="bt" id="btl">
      <div class="bside"><h4>${A.flag} ${A.n} <span class="muted">(атака)</span></h4>${rows('A', rep.attStart, A.c)}</div>
      <div class="bmid">Раунд<b id="rnd">0</b></div>
      <div class="bside"><h4>${D ? D.flag + ' ' + D.n : '🏴 Нейтральные земли'} <span class="muted">(защита)</span></h4>${rows('D', rep.defStart, D ? D.c : '#9b9484')}</div>
    </div>
    <div class="muted" style="font-size:.75rem;margin-top:.4rem">Бонус атаки ${rep.aB >= 0 ? '+' : ''}${Math.round(rep.aB * 100)}% · бонус защиты +${Math.round(rep.dB * 100)}%${rep.hero ? ' · 🦸 ' + rep.hero : ''}</div>
    <div id="bres"></div>
    <div class="mrow" id="bbtn"><button class="btn" data-act="skipbattle">Пропустить ⏩</button></div>`, { lock: true });
  Snd.setMode('battle');
  let r = 0;
  const setR = i => {
    const rd = rep.rounds[i];
    for (const u of UORDER) {
      for (const [side, start, cur] of [['A', rep.attStart, rd.A], ['D', rep.defStart, rd.D]]) {
        if (!start[u]) continue;
        const bar = document.getElementById('b' + side + u), n = document.getElementById('n' + side + u);
        if (bar) bar.style.width = Math.round(100 * (cur[u] || 0) / start[u]) + '%';
        if (n) n.textContent = cur[u] || 0;
      }
    }
    const el = document.getElementById('rnd'); if (el) el.textContent = i;
  };
  const finish = () => {
    setR(rep.rounds.length - 1);
    const mine = rep.attK === 0;
    const good = mine ? rep.win : !rep.win;
    $('#bres').innerHTML = rep.win
      ? `<div class="note ${mine ? 'good' : 'bad'}"><b>${mine ? '🏆 ПОБЕДА!' : '💀 Провинция потеряна'}</b><br>${MAP.provs[rep.to].name} ${mine ? 'захвачена' : 'захвачена врагом'}. Потери атакующих: ${rep.lossA}, защитников: ${rep.lossD}.${rep.plunder && mine ? `<br>Добыча: +${rep.plunder} 🪙` : ''}</div>`
      : `<div class="note ${mine ? 'bad' : 'good'}"><b>${mine ? '💀 Атака отбита' : '🛡️ Ты отстоял землю!'}</b><br>Потери атакующих: ${rep.lossA}, защитников: ${rep.lossD}. ${mine ? 'Остатки отряда отступили.' : ''}</div>`;
    $('#bbtn').innerHTML = `<button class="btn gold" data-act="battledone">Продолжить</button>`;
    Snd.sfx(good ? 'fanfare' : 'defeat');
    modalLock = true;
  };
  const stepRound = () => {
    r++;
    if (r >= rep.rounds.length) { battleTimer = null; finish(); return; }
    setR(r); Snd.sfx(Math.random() < 0.5 ? 'clash' : 'hit');
    const b = $('#btl'); if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    battleTimer = setTimeout(stepRound, 700);
  };
  battleTimer = setTimeout(stepRound, 600);
}

function battleDone() {
  const rep = lastBattle;
  if (battleTimer) { clearTimeout(battleTimer); battleTimer = null; }
  modalLock = false; closeModal();
  Snd.setMode('calm');
  Rn.repaint();
  if (rep) select(rep.win ? rep.to : rep.from);
  afterAction();
  achToasts();
  checkEnd();
  if (G.over) showEnd();
}

/* =====================================================
   Окна: наука, дипломатия, генерал, журнал, успехи
   ===================================================== */
function showTech() {
  const k = G.kings[0], n = netIncome(k);
  openModal(`<h2>🔬 Технологии</h2>
    <div class="note">📜 Знания: <b>${Math.floor(k.res.know)}</b> (+${Math.round(n.know)} за ход). Знания дают Библиотеки (+3 за уровень), столица и технологии.</div>
    <div class="grid3">${TORDER.map(id => {
      const t = TECHS[id], st = techState(k, id);
      const reqTxt = t.req.length ? `<div class="ds">Нужно: ${t.req.map(r => (k.tech[r] ? '✅ ' : '🔒 ') + TECHS[r].n).join(', ')}</div>` : '';
      return `<div class="card ${st === 'done' ? 'done' : st === 'locked' ? 'lock' : ''}"><div class="nm">${t.i} ${t.n}</div><div class="ds">${t.d}</div>${reqTxt}
        ${st === 'done' ? '<div class="ds" style="color:var(--good)">✅ Изучено</div>' : st === 'open' ? `<button class="act ${k.res.know >= t.cost ? '' : 'off'}" style="margin-top:.3rem;width:100%" data-act="res" data-id="${id}">Изучить · 📜 ${t.cost}</button>` : `<div class="ds">📜 ${t.cost}</div>`}</div>`;
    }).join('')}</div>
    <div class="mrow"><button class="btn" data-act="close">Закрыть</button></div>`);
}

function showDiplo() {
  const me = G.kings[0];
  const offers = G.offers.map((o, i) => `<div class="card"><b>${kFlag(o.from)} ${kName(o.from)}</b> предлагает ${o.type === 'peace' ? '🕊️ мир' : '🤝 союз'}
    <div class="row" style="margin-top:.3rem"><button class="act" data-act="offer" data-i="${i}" data-y="1">Принять</button><button class="act off" data-act="offer" data-i="${i}" data-y="0">Отклонить</button></div></div>`).join('');
  const rows = G.kings.filter(k => k.id !== 0).map(k => {
    const kd = KINGDOMS[k.kid];
    if (!k.alive) return `<div class="card lock"><b>${kd.flag} ${kd.n}</b> · ☠ пало</div>`;
    const r = getRel(0, k.id), provs = ownProvs(k.id).length;
    const stTxt = { war: 'ВОЙНА', peace: 'МИР', ally: 'СОЮЗ' }[r.st] || 'МИР';
    let btns = '';
    if (r.st === 'war') btns = `<button class="act sm" data-act="dp" data-a="peace" data-k="${k.id}">🕊️ Мир</button>`;
    if (r.st === 'peace') btns = `<button class="act sm" data-act="dp" data-a="ally" data-k="${k.id}">🤝 Союз</button><button class="act sm" data-act="dp" data-a="tribute" data-k="${k.id}">💰 Дань</button><button class="act sm off" data-act="askwar" data-k="${k.id}">⚔️ Война</button>`;
    btns += `<button class="act sm" data-act="dp" data-a="gift" data-k="${k.id}">🎁 50🪙</button>`;
    return `<div class="card"><div class="row between" style="justify-content:space-between"><b>${kd.flag} ${kd.n}</b><span class="tag ${r.st}">${stTxt}</span></div>
      <div class="ds">Провинций: ${provs} · Сила армии: ${Math.round(kStrength(k))} · Отношения: ${r.op}</div>
      <div class="bar op"><i style="width:${Math.max(2, (r.op + 100) / 2)}%"></i></div>
      <div class="row wrap">${btns}</div></div>`;
  }).join('');
  openModal(`<h2>🤝 Дипломатия</h2>${offers ? '<h3>Предложения</h3>' + offers : ''}<div class="grid2" style="margin-top:.4rem">${rows}</div>
    <div class="note">Союз возможен при отношениях от 30. Подарки повышают отношения. Дань можно требовать у слабых.</div>
    <div class="mrow"><button class="btn" data-act="close">Закрыть</button></div>`);
}

function askWar(kid) {
  openModal(`<h2>⚔️ Объявить войну?</h2><div class="note warn">${kFlag(kid)} <b>${kName(kid)}</b> станет врагом. Их союзники могут вступить в войну. Отношения с другими королевствами ухудшатся.</div>
    <div class="mrow"><button class="btn" data-act="close">Отмена</button><button class="btn red" data-act="dowar" data-k="${kid}">Объявить войну</button></div>`, { narrow: true });
}

function showHero() {
  const k = G.kings[0], h = k.hero, need = 20 * h.lvl;
  openModal(`<h2>🦸 Генерал</h2>
    <div class="card"><b style="font-size:1.1rem">${h.n}</b> · уровень ${h.lvl} / 5
    <div class="bar"><i style="width:${h.lvl >= 5 ? 100 : Math.round(100 * h.xp / need)}%"></i></div>
    <div class="ds">Опыт: ${h.lvl >= 5 ? 'максимум' : h.xp + ' / ' + need}</div>
    <div class="kv"><span>Бонус при нападении</span><span>+${8 * h.lvl}% к атаке</span></div>
    <div class="kv"><span>Бонус при защите</span><span>+${5 * h.lvl}% к защите</span></div>
    <div class="kv"><span>Где находится</span><span>${h.dead ? '⚰️ Пал (вернётся через ' + h.dead + ' ход.)' : MAP.provs[h.pid].name}</span></div></div>
    <div class="note">Генерал идёт с армией, если при выборе цели включить «🦸 С генералом». Он получает опыт за победы. Если армия погибнет, генерал может пасть.</div>
    <div class="mrow"><button class="btn" data-act="close">Закрыть</button>${h.dead ? '' : `<button class="btn gold" data-act="focus" data-p="${h.pid}">📍 Показать на карте</button>`}</div>`);
}

function showLog() {
  openModal(`<h2>📜 Журнал событий</h2>${G.log.length ? G.log.slice(0, 40).map(l => `<div class="kv"><span style="color:var(--text)">${l.s}</span><span>ход ${l.t}</span></div>`).join('') : '<div class="muted">Пока пусто.</div>'}
    <div class="mrow"><button class="btn" data-act="close">Закрыть</button></div>`);
}

function showAch() {
  const n = Object.keys(G.ach).length;
  openModal(`<h2>🏆 Достижения · ${n}/${ACHS.length}</h2><div class="grid3">${ACHS.map(a => `<div class="card ${G.ach[a.id] ? 'done' : 'lock'}"><div class="nm">${G.ach[a.id] ? '🏆' : '🔒'} ${a.n}</div><div class="ds">${a.d}</div></div>`).join('')}</div>
    <h3>Статистика</h3><div class="grid2"><div class="kv"><span>Ход</span><span>${G.turn}</span></div><div class="kv"><span>Провинций</span><span>${ownProvs(0).length} / ${G.provs.length}</span></div>
    <div class="kv"><span>Побед / поражений</span><span>${G.stats.won} / ${G.stats.lost}</span></div><div class="kv"><span>Захвачено земель</span><span>${G.stats.captured}</span></div></div>
    <div class="mrow"><button class="btn" data-act="close">Закрыть</button></div>`);
}

function achToasts() { for (const a of checkAch()) { toast(`🏆 ${a.n}`, 'good'); Snd.sfx('coin'); } }

/* ---------- Меню, помощь, политика ---------- */
function showMenu() {
  openModal(`<h2>☰ Меню</h2>
    <div class="grid2">
      <div><div class="lbl">🎵 Музыка</div><input type="range" id="vMusic" min="0" max="100" value="${Math.round(Snd.S.music * 100)}"></div>
      <div><div class="lbl">🔔 Звуки</div><input type="range" id="vSfx" min="0" max="100" value="${Math.round(Snd.S.sfx * 100)}"></div>
    </div>
    <div class="mrow"><button class="btn" data-act="savegame">💾 Сохранить</button><button class="btn" data-act="howto">📖 Как играть</button><button class="btn" data-act="privacy">🔒 Политика</button></div>
    ${tgLinks()}
    <div class="mrow"><button class="btn" data-act="close">Продолжить игру</button><button class="btn red" data-act="tomenu">В главное меню</button></div>
    <div class="muted" style="text-align:center;font-size:.75rem;margin-top:.6rem">MADE BY PESSIMIST</div>`);
}

function showSettings() {
  openModal(`<h2>⚙️ Настройки</h2>
    <div class="grid2">
      <div><div class="lbl">🎵 Музыка</div><input type="range" id="vMusic" min="0" max="100" value="${Math.round(Snd.S.music * 100)}"></div>
      <div><div class="lbl">🔔 Звуки</div><input type="range" id="vSfx" min="0" max="100" value="${Math.round(Snd.S.sfx * 100)}"></div>
    </div>
    <div class="mrow"><button class="btn" data-act="mute">${Snd.S.muted ? '🔇 Включить звук' : '🔊 Выключить звук'}</button></div>
    <div class="mrow"><button class="btn red" data-act="wipe">🗑️ Удалить сохранение</button><button class="btn" data-act="privacy">🔒 Политика</button></div>
    <div class="mrow"><button class="btn gold" data-act="close">Готово</button></div>`, { narrow: true });
}

function showHelp() {
  openModal(`<h2>📖 Как играть</h2><div class="help">
    <p>🗺️ <b>Цель:</b> захвати 70% провинций или уничтожь все королевства.</p>
    <p>👆 <b>Нажми на провинцию</b> — откроется панель. Карту можно двигать пальцем и увеличивать щипком.</p>
    <p>🏗️ <b>Стройка:</b> фермы дают еду, рынки — золото, шахты — железо, библиотеки — знания, казармы открывают войска, стены усиливают защиту.</p>
    <p>⚔️ <b>Найм:</b> вкладка «Найм». Новые воины готовы со следующего хода. Армия ест 🌾, без еды начинается голод.</p>
    <p>🎯 <b>Поход:</b> выбери свою провинцию с армией → «Двигать / атаковать» → нажми на подсвеченного соседа. Зелёный — свои земли, красный — враг.</p>
    <p>🤝 <b>Дипломатия:</b> мир, союзы, подарки и дань. Чтобы напасть на королевство в мире, объяви войну.</p>
    <p>⏭️ <b>Конец хода:</b> враги сделают свои ходы, ты получишь доход. Каждые 3 хода меняется время года, зимой урожай вдвое меньше.</p>
    <p>🦸 <b>Генерал</b> усиливает армию, а <b>технологии</b> усиливают всё государство.</p></div>
    ${tgLinks()}
    <div class="mrow"><button class="btn gold" data-act="close">Понятно, играем!</button></div>`);
}

const PRIVACY_RU = `
<p><b>Дата вступления в силу: 19 ноября 2026 г.</b></p>
<p>Эта политика описывает, как игра «Королевства» (разработчик — PESSIMIST, связь в Telegram: ${TG_USER}) обращается с данными.</p>
<h3>1. Какие данные мы собираем</h3>
<p>Никакие. Игра не требует регистрации и не запрашивает разрешений на доступ к контактам, камере, микрофону, геолокации или файлам. В ней нет рекламы, аналитики, встроенных покупок и сторонних SDK, и она не отправляет данные на какие-либо серверы.</p>
<h3>2. Данные на вашем устройстве</h3>
<p>Сохранения игры и настройки (громкость, выбранные параметры) хранятся только локально в памяти приложения на вашем устройстве. Они удаляются при удалении приложения или очистке его данных. Если на устройстве включено резервное копирование Android, система может включать данные приложения в резервную копию вашего аккаунта Google — это определяется настройками вашего устройства, а не игрой.</p>
<h3>3. Ссылки на сторонние сервисы</h3>
<p>Игра содержит ссылки на Telegram (канал и профиль автора). При нажатии они открываются в приложении Telegram или браузере. На эти сервисы распространяется их собственная политика конфиденциальности, мы за неё не отвечаем.</p>
<h3>4. Дети</h3>
<p>Мы не собираем персональные данные ни от кого, включая детей.</p>
<h3>5. Изменения политики</h3>
<p>Политика может обновляться вместе с новыми версиями игры. Актуальная версия всегда доступна в игре (Меню → Политика) и на странице политики.</p>
<h3>6. Контакты</h3>
<p>Вопросы: Telegram ${TG_USER} — ${TG_USER_URL}</p>`;

function showPrivacy() {
  openModal(`<h2>🔒 Политика конфиденциальности</h2><div class="help">${PRIVACY_RU}</div>${tgLinks()}<div class="mrow"><button class="btn gold" data-act="close">Закрыть</button></div>`);
}

/* =====================================================
   Ход, события, конец игры
   ===================================================== */
function onEndTurn() {
  if (busy || !G) return;
  busy = true; cancelTarget(); Snd.sfx('turn');
  const sp = document.createElement('div'); sp.className = 'splash'; sp.textContent = `Ход ${G.turn} завершён…`; document.body.appendChild(sp);
  setTimeout(() => {
    try { endTurn(); } catch (e) { console.error(e); }
    saveGame(); Rn.repaint(); sp.remove(); busy = false;
    afterTurn();
  }, 450);
}

function afterTurn() {
  refreshHUD(); if (selId >= 0) renderPanel();
  achToasts();
  maybePromo();
  if (G.over) { showEnd(); return; }
  showSummary();
}

function showSummary() {
  const notes = G.notes.slice(0, 8), offers = G.offers, ev = G.event;
  if (!notes.length && !offers.length && !ev) { toast(`Ход ${G.turn} · ${SEASONS[seasonIdx()].i} ${SEASONS[seasonIdx()].n}`); return; }
  let h = `<h2>📅 Ход ${G.turn}</h2>`;
  if (notes.length) { h += '<h3>Новости</h3>' + notes.map(n => `<div class="kv"><span style="color:var(--text)">${n}</span></div>`).join(''); if (G.notes.length > 8) h += `<div class="muted">…и ещё ${G.notes.length - 8} (см. Журнал)</div>`; if (notes.some(n => n.includes('захватил') || n.includes('объявил'))) Snd.sfx('horn'); }
  if (offers.length) h += '<h3>Предложения</h3>' + offers.map((o, i) => `<div class="card" style="margin:.3rem 0">${kFlag(o.from)} <b>${kName(o.from)}</b> предлагает ${o.type === 'peace' ? '🕊️ мир' : '🤝 союз'}
    <div class="row" style="margin-top:.3rem"><button class="act" data-act="offer" data-s="1" data-i="${i}" data-y="1">Принять</button><button class="act off" data-act="offer" data-s="1" data-i="${i}" data-y="0">Отклонить</button></div></div>`).join('');
  if (ev) {
    const info = eventInfo(ev);
    h += `<h3>${info.t}</h3><div class="note">${info.s}</div><div class="mrow">${info.o.map((o, i) => `<button class="btn ${i === 0 ? 'gold' : ''}" data-act="ev" data-c="${i}">${o}</button>`).join('')}</div>`;
  } else h += `<div class="mrow"><button class="btn gold" data-act="close">Продолжить</button></div>`;
  openModal(h, { lock: !!ev });
}

function maybePromo() {
  if (!(G.turn === 4 || G.turn % 15 === 0)) return;
  const p = $('#promo');
  p.innerHTML = `<a href="${TG_CHANNEL}" target="_blank" rel="noopener">📢 Канал создателя — PESSIMIST</a>`;
  p.classList.remove('hidden');
  clearTimeout(promoT); promoT = setTimeout(() => p.classList.add('hidden'), 9000);
}

function showEnd() {
  const win = G.over === 'win', st = G.stats;
  Snd.setMode(win ? 'calm' : 'sad'); Snd.sfx(win ? 'fanfare' : 'defeat');
  openModal(`<h2>${win ? '🏆 Победа!' : '💀 Королевство пало'}</h2>
    <div class="note ${win ? 'good' : 'bad'}">${win ? 'Ты объединил земли под своей короной. Хроники запомнят твоё имя!' : 'Твои земли захвачены. Но каждый поражённый король однажды возвращается.'}</div>
    <div class="grid2"><div class="kv"><span>Ходов сыграно</span><span>${G.turn}</span></div><div class="kv"><span>Провинций</span><span>${ownProvs(0).length}</span></div>
    <div class="kv"><span>Побед в боях</span><span>${st.won}</span></div><div class="kv"><span>Захвачено земель</span><span>${st.captured}</span></div></div>
    ${tgLinks()}
    <div class="mrow">${win ? '<button class="btn" data-act="contend">Продолжить игру</button>' : ''}<button class="btn gold" data-act="tomenu">В главное меню</button></div>`, { lock: true });
  if (!win) { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }
}

/* =====================================================
   События интерфейса
   ===================================================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.id === 'modal' && !modalLock) closeModal();
    return;
  }
  const a = el.dataset.act, d = el.dataset, me = G ? G.kings[0] : null;
  if (!['close', 'mute'].includes(a)) Snd.sfx('click');
  switch (a) {
    /* меню */
    case 'continue': continueGame(); break;
    case 'newgame': $('#title').classList.add('hidden'); buildSetup(); $('#setup').classList.remove('hidden'); break;
    case 'back': $('#setup').classList.add('hidden'); showTitle(); break;
    case 'pickk': setupSel.kid = +d.id; buildSetup(); break;
    case 'picksz': setupSel.size = +d.id; buildSetup(); break;
    case 'pickdf': setupSel.diff = +d.id; buildSetup(); break;
    case 'start': startNewGame(); break;
    case 'howto': showHelp(); break;
    case 'settings': showSettings(); break;
    case 'privacy': showPrivacy(); break;
    case 'wipe': try { localStorage.removeItem(SAVE_KEY); } catch (x) { } buildTitle(); toast('Сохранение удалено'); closeModal(); break;
    /* HUD */
    case 'mute': Snd.toggleMute(); if (G) refreshHUD(); if (!$('#modal').classList.contains('hidden') && $('#vMusic')) showSettings(); break;
    case 'menu': showMenu(); break;
    case 'tech': showTech(); break;
    case 'diplo': showDiplo(); break;
    case 'hero': showHero(); break;
    case 'log': showLog(); break;
    case 'ach': showAch(); break;
    case 'zin': Rn.zoomBy(1.3); break;
    case 'zout': Rn.zoomBy(0.77); break;
    case 'zfit': Rn.fit(); break;
    case 'endturn': onEndTurn(); break;
    /* панель */
    case 'closep': if (mode) cancelTarget(); select(-1); break;
    case 'tab': tab = d.t; renderPanel(); break;
    case 'bld': { const r = build(me, G.provs[selId], d.b); if (r.err) { toast(r.err, 'warn'); Snd.sfx('error'); } else { Snd.sfx('build'); } afterAction(); break; }
    case 'rec': { const r = recruit(me, G.provs[selId], d.u, +d.n); if (r.err) { toast(r.err, 'warn'); Snd.sfx('error'); } else Snd.sfx('recruit'); afterAction(); break; }
    case 'target': startTarget(); break;
    case 'frac': mvFrac = +d.v; renderMoveBar(); break;
    case 'herot': mvHero = !mvHero; renderMoveBar(); break;
    case 'canceltarget': cancelTarget(); break;
    case 'atkfrom': selId = +d.from; Rn.setSel(selId); mvFrac = 1; mvHero = heroHere(me, selId); showAttackConfirm(+d.from, +d.to); break;
    /* окна */
    case 'close': closeModal(); break;
    case 'doattack': { const f = +d.from, t = +d.to; closeModal(); doAttack(f, t); break; }
    case 'skipbattle': { if (battleTimer) { clearTimeout(battleTimer); battleTimer = null; } showBattleResultNow(lastBattle); break; }
    case 'battledone': battleDone(); break;
    case 'res': { const r = research(me, d.id); if (r.err) { toast(r.err, 'warn'); Snd.sfx('error'); } else { Snd.sfx('coin'); toast(`Изучено: ${TECHS[d.id].n}`, 'good'); achToasts(); } refreshHUD(); showTech(); break; }
    case 'dp': {
      const o = G.kings[+d.k]; let r;
      if (d.a === 'peace') r = proposePeace(me, o);
      else if (d.a === 'ally') r = proposeAlliance(me, o);
      else if (d.a === 'gift') r = giftGold(me, o, 50);
      else r = demandTribute(me, o);
      toast(r.msg || 'Предложение отправлено', r.ok ? 'good' : 'warn'); achToasts(); refreshHUD(); showDiplo(); break;
    }
    case 'askwar': askWar(+d.k); break;
    case 'dowar': { declareWar(me, G.kings[+d.k]); closeModal(); toast('Война объявлена!', 'bad'); Snd.sfx('horn'); refreshHUD(); if (selId >= 0) renderPanel(); break; }
    case 'offer': { if (+d.y) acceptOffer(+d.i); else declineOffer(+d.i); achToasts(); refreshHUD(); if (d.s) showSummary(); else showDiplo(); break; }
    case 'ev': { const msg = resolveEvent(+d.c); if (msg) toast(msg); refreshHUD(); closeModal(); break; }
    case 'focus': closeModal(); Rn.focus(+d.p, 1.5); select(+d.p); break;
    case 'savegame': toast(saveGame() ? 'Игра сохранена 💾' : 'Не удалось сохранить', 'good'); break;
    case 'tomenu': closeModal(); if (G && !G.over) saveGame(); cancelTarget(); showTitle(); break;
    case 'contend': G.over = null; closeModal(); Snd.setMode('calm'); break;
  }
});

function showBattleResultNow(rep) {
  // мгновенно показать итог боя
  const last = rep.rounds[rep.rounds.length - 1];
  for (const u of UORDER) for (const [s, st, cur] of [['A', rep.attStart, last.A], ['D', rep.defStart, last.D]]) {
    if (!st[u]) continue;
    const bar = document.getElementById('b' + s + u), n = document.getElementById('n' + s + u);
    if (bar) bar.style.width = Math.round(100 * (cur[u] || 0) / st[u]) + '%';
    if (n) n.textContent = cur[u] || 0;
  }
  const mine = rep.attK === 0;
  $('#bres').innerHTML = rep.win
    ? `<div class="note ${mine ? 'good' : 'bad'}"><b>${mine ? '🏆 ПОБЕДА!' : '💀 Провинция потеряна'}</b><br>Потери атакующих: ${rep.lossA}, защитников: ${rep.lossD}.${rep.plunder && mine ? `<br>Добыча: +${rep.plunder} 🪙` : ''}</div>`
    : `<div class="note ${mine ? 'bad' : 'good'}"><b>${mine ? '💀 Атака отбита' : '🛡️ Ты отстоял землю!'}</b><br>Потери атакующих: ${rep.lossA}, защитников: ${rep.lossD}.</div>`;
  $('#bbtn').innerHTML = `<button class="btn gold" data-act="battledone">Продолжить</button>`;
  Snd.sfx((mine ? rep.win : !rep.win) ? 'fanfare' : 'defeat');
}

document.addEventListener('input', e => {
  if (e.target.id === 'vMusic') Snd.setMusic(e.target.value / 100);
  if (e.target.id === 'vSfx') Snd.setSfx(e.target.value / 100);
});
document.addEventListener('pointerdown', () => { if (!Snd.running()) Snd.unlock(); }, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) { Snd.suspend(); if (G && !G.over && !$('#hud').classList.contains('hidden')) saveGame(); } else Snd.resume(); });
window.addEventListener('pagehide', () => { if (G && !G.over && !$('#hud').classList.contains('hidden')) saveGame(); });

/* =====================================================
   Запуск
   ===================================================== */
function boot() {
  loadSettings();
  if (window.Capacitor) document.documentElement.classList.add('cap');
  MAP = genMap((Math.random() * 1e9) | 0, 34);
  Rn.init($('#cv'), onMapTap);
  Rn.setMap(); Rn.setDecor(true);
  runIntro();
}
boot();
