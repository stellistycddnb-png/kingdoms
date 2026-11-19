'use strict';
/* =====================================================
   КОРОЛЕВСТВА — игровой движок (без интерфейса)
   ===================================================== */

let MAP = null, G = null;

const rI = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const rk = (a, b) => a < b ? a + '-' + b : b + '-' + a;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickW(list) { // [[value, weight], ...]
  let t = 0; for (const x of list) t += x[1];
  let r = Math.random() * t;
  for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; }
  return list.length ? list[list.length - 1][0] : null;
}

/* ---------- Армии ---------- */
function sizeOf(a) { let n = 0; for (const u in a) n += a[u]; return n; }
function addTo(a, u, n) { if (n > 0) a[u] = (a[u] || 0) + n; }
function addAll(a, b) { for (const u in b) addTo(a, u, b[u]); }
function merge(a, b) { const r = {}; addAll(r, a); addAll(r, b); return r; }
function pw(a) { let A = 0, H = 0; for (const u in a) { A += UNITS[u].atk * a[u]; H += UNITS[u].hp * a[u]; } return Math.sqrt(A * H); }
function strOf(a) { let s = 0; for (const u in a) s += a[u] * Math.sqrt(UNITS[u].atk * UNITS[u].hp); return s; }
function totalArmy(p) { return sizeOf(p.army) + sizeOf(p.tired); }

/* ---------- Доступ ---------- */
const nm = k => KINGDOMS[k.kid].n;
const ownProvs = id => G.provs.filter(p => p.owner === id);
const isPlayer = k => !k.ai;
function seasonIdx() { return Math.floor((G.turn - 1) / 3) % 4; }
function yearOf() { return Math.floor((G.turn - 1) / 12) + 1; }

function getRel(a, b) {
  const key = rk(a, b);
  return G.rel[key] || (G.rel[key] = { st: 'peace', op: 0, war: 0, tr: 0 });
}

function logEv(txt, forPlayer) {
  G.log.unshift({ t: G.turn, s: txt });
  if (G.log.length > 100) G.log.length = 100;
  if (forPlayer) G.notes.push(txt);
}

/* =====================================================
   Новая игра
   ===================================================== */
function newGame(cfg) {
  const sz = SIZES[cfg.size];
  MAP = genMap(cfg.seed, sz.n);
  const kids = [cfg.kid];
  kids.push(...shuffle(KINGDOMS.map(k => k.id).filter(i => i !== cfg.kid)).slice(0, sz.k - 1));

  G = {
    v: 1, cfg, turn: 1, provs: [], kings: [], rel: {}, log: [], notes: [], offers: [], event: null,
    ach: {}, stats: { won: 0, lost: 0, killed: 0, lostU: 0, captured: 0 }, won: false, over: null, tips: 0
  };
  for (let i = 0; i < MAP.N; i++) G.provs.push({ id: i, owner: -1, army: {}, tired: {}, b: {}, rec: 0, built: false, gcap: 0 });

  // Столицы: самые удалённые друг от друга
  const mp = MAP.provs;
  const caps = [Math.floor(Math.random() * MAP.N)];
  while (caps.length < sz.k) {
    let best = -1, bd = -1;
    for (let i = 0; i < MAP.N; i++) {
      if (caps.includes(i)) continue;
      let d = 1e9;
      for (const c of caps) d = Math.min(d, Math.hypot(mp[i].x - mp[c].x, mp[i].y - mp[c].y));
      if (d > bd) { bd = d; best = i; }
    }
    caps.push(best);
  }
  kids.forEach((kid, i) => {
    G.kings.push({
      id: i, kid, ai: i > 0, alive: true, cap: caps[i],
      res: { gold: 160, food: 120, iron: 40, know: 0 }, tech: {},
      hero: { n: HERO_NAMES[(Math.random() * HERO_NAMES.length) | 0], lvl: 1, xp: 0, pid: caps[i], dead: 0 }
    });
    G.provs[caps[i]].owner = i;
  });
  // Рост территорий
  for (let r = 1; r < sz.start; r++) {
    for (const k of G.kings) {
      let best = -1, bd = 1e9;
      const cap = mp[k.cap];
      for (const p of G.provs) {
        if (p.owner !== k.id) continue;
        for (const n of mp[p.id].nb) {
          if (G.provs[n].owner !== -1) continue;
          const d = Math.hypot(mp[n].x - cap.x, mp[n].y - cap.y);
          if (d < bd) { bd = d; best = n; }
        }
      }
      if (best >= 0) G.provs[best].owner = k.id;
    }
  }
  // Гарнизоны
  for (const p of G.provs) {
    if (p.owner >= 0) {
      const cap = G.kings[p.owner].cap === p.id;
      p.army = cap ? { militia: 8, spear: 3 } : { militia: 4 };
    } else {
      const m = mp[p.id].terr === 'mountain' ? 1.5 : mp[p.id].terr === 'hills' ? 1.25 : 1;
      p.army = { militia: Math.round(rI(6, 11) * m), spear: Math.round(rI(2, 4) * m) };
      if (Math.random() < 0.5) p.army.archer = rI(2, 5);
      if (Math.random() < 0.3) p.army.sword = rI(2, 4);
      p.gcap = Math.round(sizeOf(p.army) * 1.25);
    }
  }
  // Отношения
  for (let i = 0; i < G.kings.length; i++) for (let j = i + 1; j < G.kings.length; j++) {
    const r = getRel(i, j); r.op = rI(-12, 12);
  }
  logEv('Ты взошёл на трон. Да начнётся правление!');
  return G;
}

/* =====================================================
   Экономика
   ===================================================== */
function kBonus(k, key) {
  let v = KINGDOMS[k.kid].trait[key] || 0;
  for (const t in k.tech) v += TECHS[t].fx[key] || 0;
  return v;
}

function provYield(p) {
  const mp = MAP.provs[p.id], T = TERR[mp.terr];
  const y = { gold: T.y.gold, food: T.y.food, iron: T.y.iron, know: 0 };
  if (mp.coast) y.gold += 2;
  const k = G.kings[p.owner];
  if (k && k.cap === p.id) { y.gold += 8; y.food += 4; y.know += 3; }
  for (const b in p.b) { const o = BLD[b].out; if (o) for (const r in o) y[r] += o[r] * p.b[b]; }
  return y;
}

function grossIncome(k) {
  const g = { gold: 0, food: 0, iron: 0, know: 0 };
  for (const p of G.provs) if (p.owner === k.id) { const y = provYield(p); for (const r of RES) g[r] += y[r]; }
  const dm = k.ai ? DIFFM[G.cfg.diff] : 1, sm = SEASONS[seasonIdx()].food;
  for (const r of RES) { let m = 1 + kBonus(k, r); if (r === 'food') m *= sm; g[r] *= m * dm; }
  return g;
}

function upkeepFood(k) {
  let u = 0;
  for (const p of G.provs) if (p.owner === k.id) for (const a of [p.army, p.tired]) for (const x in a) u += UNITS[x].up * a[x];
  return u * (1 - Math.min(0.6, kBonus(k, 'upkeep')));
}

function netIncome(k) { const g = grossIncome(k); g.food -= upkeepFood(k); return g; }

function canAfford(k, c) { for (const r in c) if ((k.res[r] || 0) < c[r]) return false; return true; }
function pay(k, c) { for (const r in c) k.res[r] -= c[r]; }

function slotsUsed(p) { let n = 0; for (const b in p.b) n += p.b[b]; return n; }
function slotsMax(k, p) { return k.cap === p.id ? SLOTS_CAP : SLOTS; }

function buildCost(k, p, b) {
  const lv = p.b[b] || 0, m = (1 + lv * 0.8) * (1 - Math.min(0.5, kBonus(k, 'bcost'))), c = {};
  for (const r in BLD[b].cost) c[r] = Math.round(BLD[b].cost[r] * m);
  return c;
}
function canBuild(k, p, b) {
  if (p.owner !== k.id) return 'Это не твоя провинция';
  if (p.built) return 'Здесь уже строили в этом ходу';
  if ((p.b[b] || 0) >= BLD_MAX) return 'Максимальный уровень';
  if (slotsUsed(p) >= slotsMax(k, p)) return 'Нет свободных мест для построек';
  if (!canAfford(k, buildCost(k, p, b))) return 'Не хватает ресурсов';
  return null;
}
function build(k, p, b) {
  const e = canBuild(k, p, b);
  if (e) return { err: e };
  pay(k, buildCost(k, p, b));
  p.b[b] = (p.b[b] || 0) + 1;
  p.built = true;
  return { ok: true };
}

/* ---------- Найм ---------- */
function barLv(p) { return (p.b.barracks || 0) + (G.kings[p.owner] && G.kings[p.owner].cap === p.id ? 1 : 0); }
function unitAvail(k, p, u) { const d = UNITS[u]; return barLv(p) >= d.bar && (!d.tech || !!k.tech[d.tech]); }
function unitLockReason(k, p, u) {
  const d = UNITS[u];
  if (d.tech && !k.tech[d.tech]) return 'Нужна технология: ' + TECHS[d.tech].n;
  if (barLv(p) < d.bar) return 'Нужны казармы ур. ' + d.bar;
  return null;
}
function unitCost(k, p, u) {
  const d = UNITS[u], disc = 1 - Math.min(0.6, kBonus(k, 'ucost') + 0.05 * (p.b.barracks || 0)), c = {};
  for (const r in d.cost) c[r] = Math.max(1, Math.round(d.cost[r] * disc));
  return c;
}
function recLimit(k, p) { return 4 + 3 * (p.b.barracks || 0) + (k.cap === p.id ? 4 : 0); }
function recruit(k, p, u, n) {
  if (p.owner !== k.id) return { err: 'Это не твоя провинция' };
  if (!unitAvail(k, p, u)) return { err: unitLockReason(k, p, u) || 'Недоступно' };
  if (p.rec + n > recLimit(k, p)) return { err: 'Лимит найма в этой провинции на ход' };
  const c = unitCost(k, p, u), tot = {};
  for (const r in c) tot[r] = c[r] * n;
  if (!canAfford(k, tot)) return { err: 'Не хватает ресурсов' };
  pay(k, tot);
  addTo(p.tired, u, n);
  p.rec += n;
  return { ok: true };
}

/* ---------- Технологии ---------- */
function techState(k, id) {
  if (k.tech[id]) return 'done';
  for (const r of TECHS[id].req) if (!k.tech[r]) return 'locked';
  return 'open';
}
function research(k, id) {
  const st = techState(k, id);
  if (st === 'done') return { err: 'Уже изучено' };
  if (st === 'locked') return { err: 'Сначала изучи: ' + TECHS[id].req.filter(r => !k.tech[r]).map(r => TECHS[r].n).join(', ') };
  if (k.res.know < TECHS[id].cost) return { err: 'Не хватает знаний' };
  k.res.know -= TECHS[id].cost;
  k.tech[id] = true;
  return { ok: true };
}

/* ---------- Генерал ---------- */
function heroHere(k, pid) { return !!k.hero && !k.hero.dead && k.hero.pid === pid; }
function heroXp(k, x) {
  const h = k.hero;
  if (!h || h.dead) return;
  h.xp += x;
  while (h.lvl < 5 && h.xp >= 20 * h.lvl) { h.xp -= 20 * h.lvl; h.lvl++; if (isPlayer(k)) logEv(`🦸 ${h.n} достиг ${h.lvl} уровня!`, true); }
}

/* =====================================================
   Бой
   ===================================================== */
function sideDmg(S, E, r, isAtt) {
  let tot = 0;
  const eN = sizeOf(E) || 1, spearF = (E.spear || 0) / eN, cavF = ((E.cavalry || 0) + (E.knight || 0)) / eN;
  for (const u in S) {
    const n = S[u];
    if (n <= 0) continue;
    let m = 1;
    if (u === 'archer' && r < 2) m = 1.5;
    if (u === 'cavalry' || u === 'knight') { if (isAtt && r === 0) m = 1.6; m *= 1 - 0.5 * spearF; }
    if (u === 'spear') m = 1 + cavF;
    if (u === 'catapult' && !isAtt) m = 0.4;
    tot += UNITS[u].atk * n * m;
  }
  return tot;
}
function applyDmg(S, dmg) {
  let pool = 0;
  for (const u in S) pool += S[u] * UNITS[u].hp;
  if (pool <= 0) return;
  const f = Math.min(1, dmg / pool);
  for (const u in S) S[u] *= 1 - f;
}
function roundUnits(S, alive) {
  const o = {};
  let sum = 0, bu = null, bv = -1;
  for (const u in S) {
    const n = Math.round(S[u]);
    if (n > 0) { o[u] = n; sum += n; }
    if (S[u] > bv) { bv = S[u]; bu = u; }
  }
  if (alive && sum === 0 && bu) o[bu] = 1;
  return o;
}

function simBattle(att, def, aB, dB) {
  const A = {}, D = {};
  for (const u in att) A[u] = att[u];
  for (const u in def) D[u] = def[u];
  const rounds = [{ A: roundUnits(A, true), D: roundUnits(D, true) }];
  const aM = 1 + aB, dM = 1 + dB;
  for (let r = 0; r < 10; r++) {
    const aD = sideDmg(A, D, r, true) * aM * (0.9 + Math.random() * 0.2);
    const dD = sideDmg(D, A, r, false) * dM * (0.9 + Math.random() * 0.2);
    applyDmg(D, aD); applyDmg(A, dD);
    const sa = sizeOf(A), sd = sizeOf(D);
    rounds.push({ A: roundUnits(A, sa >= 0.5), D: roundUnits(D, sd >= 0.5) });
    if (sa < 0.5 || sd < 0.5) break;
  }
  const sa = sizeOf(A), sd = sizeOf(D);
  const win = sd < 0.5 && sa >= 0.5;
  return { win, rounds, A: roundUnits(A, sa >= 0.5), D: roundUnits(D, sd >= 0.5) };
}

function battleCtx(attK, to, units, heroGo) {
  const defK = to.owner >= 0 ? G.kings[to.owner] : null;
  const mp = MAP.provs[to.id];
  let aB = kBonus(attK, 'atk') + (heroGo ? 0.08 * attK.hero.lvl : 0);
  let dB = TERR[mp.terr].def;
  const walls = to.b.walls || 0;
  dB += Math.max(0, walls * 0.15 - (units.catapult || 0) * 0.03);
  if (defK) {
    dB += kBonus(defK, 'def');
    if (defK.cap === to.id) dB += 0.1;
    if (heroHere(defK, to.id)) dB += 0.05 * defK.hero.lvl;
  }
  return { aB, dB, defK };
}

/* Оценка боя (по 20 прогонам) для интерфейса */
function estimateBattle(fromId, toId, frac, withHero) {
  const from = G.provs[fromId], to = G.provs[toId], k = G.kings[from.owner];
  const units = {};
  for (const u in from.army) { const n = frac >= 0.999 ? from.army[u] : Math.round(from.army[u] * frac); if (n > 0) units[u] = n; }
  const def = merge(to.army, to.tired);
  const hg = !!withHero && heroHere(k, fromId);
  const ctx = battleCtx(k, to, units, hg);
  let wins = 0, la = 0, ld = 0;
  const N = 20, sa = sizeOf(units), sd = sizeOf(def);
  for (let i = 0; i < N; i++) {
    const r = simBattle(units, def, ctx.aB, ctx.dB);
    if (r.win) wins++;
    la += sa - sizeOf(r.A); ld += sd - sizeOf(r.D);
  }
  return { win: wins / N, lossA: la / N, lossD: ld / N, att: units, def, aB: ctx.aB, dB: ctx.dB };
}

function relocateCapital(k) {
  let best = -1, bs = -1;
  for (const p of G.provs) if (p.owner === k.id) { const s = slotsUsed(p) + Math.random(); if (s > bs) { bs = s; best = p.id; } }
  if (best >= 0) {
    k.cap = best;
    k.res.gold = Math.floor(k.res.gold * 0.6);
    if (k.hero && !k.hero.dead) k.hero.pid = best;
  }
}

function eliminate(pk, by) {
  pk.alive = false;
  for (const o of G.kings) if (o !== pk) getRel(pk.id, o.id).st = 'dead';
  logEv(`💀 ${nm(pk)} пало под ударами ${nm(by)}!`, true);
  if (isPlayer(by)) { G.stats.killed++; }
}

function capture(to, k, rep) {
  const prev = to.owner;
  to.owner = k.id;
  for (const b in to.b) if (Math.random() < 0.5) { to.b[b]--; if (to.b[b] <= 0) delete to.b[b]; }
  to.rec = 0; to.built = true;
  const plunder = Math.round(10 + 3 * slotsUsed(to) + (prev >= 0 ? 15 : 0));
  k.res.gold += plunder;
  rep.plunder = plunder;
  if (isPlayer(k)) G.stats.captured++;
  if (prev >= 0) {
    const pk = G.kings[prev];
    if (pk.hero && pk.hero.pid === to.id && !pk.hero.dead) {
      if (Math.random() < 0.35) { pk.hero.dead = 4; } else pk.hero.pid = pk.cap === to.id ? to.id : pk.cap;
    }
    if (pk.cap === to.id) relocateCapital(pk);
    if (!G.provs.some(p => p.owner === pk.id)) eliminate(pk, k);
  }
}

/* =====================================================
   Перемещение и атака
   ===================================================== */
function moveArmy(fromId, toId, frac, withHero) {
  const from = G.provs[fromId], to = G.provs[toId];
  if (!from || !to || from.owner < 0) return { err: 'Ошибка' };
  const k = G.kings[from.owner];
  if (!MAP.provs[fromId].nb.includes(toId)) return { err: 'Провинции не соседние' };
  const units = {};
  let cnt = 0;
  for (const u in from.army) {
    let n = frac >= 0.999 ? from.army[u] : Math.round(from.army[u] * frac);
    n = Math.min(n, from.army[u]);
    if (n > 0) { units[u] = n; cnt += n; }
  }
  if (!cnt) return { err: 'Нет готовых к движению войск' };
  const heroGo = !!withHero && heroHere(k, fromId);

  if (to.owner === k.id) {
    for (const u in units) { from.army[u] -= units[u]; if (from.army[u] <= 0) delete from.army[u]; }
    addAll(to.tired, units);
    if (heroGo) k.hero.pid = toId;
    return { ok: true, move: true, count: cnt };
  }
  if (to.owner >= 0) {
    const rel = getRel(k.id, to.owner);
    if (rel.st !== 'war') return { err: rel.st === 'ally' ? 'Это земли союзника' : 'Сначала нужно объявить войну', needWar: to.owner };
  }

  for (const u in units) { from.army[u] -= units[u]; if (from.army[u] <= 0) delete from.army[u]; }
  const def = merge(to.army, to.tired);
  const ctx = battleCtx(k, to, units, heroGo);
  const res = simBattle(units, def, ctx.aB, ctx.dB);
  const sa = sizeOf(units), sd = sizeOf(def);
  const rep = {
    attK: k.id, defK: to.owner, from: fromId, to: toId, turn: G.turn,
    attStart: units, defStart: def, rounds: res.rounds, win: res.win,
    attLeft: res.A, defLeft: res.D, lossA: sa - sizeOf(res.A), lossD: sd - sizeOf(res.D),
    aB: ctx.aB, dB: ctx.dB, hero: heroGo ? k.hero.n : null, plunder: 0
  };
  const defK = ctx.defK;

  if (res.win) {
    to.army = {}; to.tired = {};
    addAll(to.tired, res.A);
    capture(to, k, rep);
    if (heroGo) { k.hero.pid = toId; heroXp(k, 12); }
    if (isPlayer(k)) G.stats.won++;
    if (defK && isPlayer(defK)) G.stats.lost++;
  } else {
    to.army = res.D; to.tired = {};
    addAll(from.tired, res.A);
    if (heroGo && sizeOf(res.A) === 0 && Math.random() < 0.4) { k.hero.dead = 4; if (isPlayer(k)) logEv(`⚰️ ${k.hero.n} пал в бою. Вернётся через 4 хода.`, true); }
    if (defK && heroHere(defK, toId)) heroXp(defK, 6);
    if (isPlayer(k)) G.stats.lost++;
    if (defK && isPlayer(defK)) G.stats.won++;
  }
  if (isPlayer(k)) G.stats.lostU += rep.lossA;
  if (defK && isPlayer(defK)) G.stats.lostU += rep.lossD;
  if (isPlayer(k)) G.stats.killed += 0;

  // уведомления игроку
  const pn = MAP.provs[toId].name;
  if (defK && isPlayer(defK)) {
    logEv(res.win ? `🔥 ${nm(k)} захватило ${pn}! Потеряно ${rep.lossD} воинов.` : `🛡️ Ты отбил атаку ${nm(k)} на ${pn}.`, true);
    G.reports = G.reports || []; G.reports.push(rep);
  } else if (!isPlayer(k)) {
    if (res.win) logEv(`${nm(k)} захватило ${pn}${defK ? ' у ' + nm(defK) : ''}.`, false);
  }
  return { ok: true, battle: rep };
}

/* =====================================================
   Дипломатия
   ===================================================== */
function kStrength(k) { let s = 0; for (const p of G.provs) if (p.owner === k.id) s += strOf(p.army) + strOf(p.tired); return s; }
function sharesBorder(a, b) {
  for (const p of G.provs) if (p.owner === a.id) for (const n of MAP.provs[p.id].nb) if (G.provs[n].owner === b.id) return true;
  return false;
}

function declareWar(a, b) {
  const r = getRel(a.id, b.id);
  if (r.st === 'war' || r.st === 'dead') return false;
  const wasAlly = r.st === 'ally';
  r.st = 'war'; r.war = 0; r.op = Math.min(r.op, -40);
  logEv(`⚔️ ${nm(a)} объявило войну: ${nm(b)}!`, isPlayer(a) || isPlayer(b));
  for (const c of G.kings) {
    if (!c.alive || c === a || c === b) continue;
    const rb = getRel(c.id, b.id), ra = getRel(c.id, a.id);
    if (wasAlly) ra.op -= 15;
    if (rb.st === 'ally' && ra.st !== 'ally' && ra.st !== 'war' && c.ai && Math.random() < 0.7) {
      ra.st = 'war'; ra.war = 0; ra.op = -30;
      logEv(`⚔️ ${nm(c)} вступило в войну на стороне ${nm(b)} против ${nm(a)}!`, isPlayer(a) || isPlayer(b));
    }
  }
  return true;
}
function makePeace(a, b) {
  const r = getRel(a.id, b.id);
  r.st = 'peace'; r.tr = 6; r.war = 0; r.op = Math.max(r.op, 0);
  logEv(`🕊️ ${nm(a)} и ${nm(b)} заключили мир.`, isPlayer(a) || isPlayer(b));
}
function makeAlliance(a, b) {
  const r = getRel(a.id, b.id);
  r.st = 'ally'; r.op = Math.max(r.op, 40);
  logEv(`🤝 ${nm(a)} и ${nm(b)} заключили союз!`, isPlayer(a) || isPlayer(b));
}
function aiAcceptsPeace(o, from) {
  const r = getRel(o.id, from.id);
  if (r.war < 2) return false;
  const mine = kStrength(o), theirs = kStrength(from);
  return mine < theirs * 1.1 || r.war > 12 || (r.op > -25 && Math.random() < 0.35);
}
function proposePeace(a, o) {
  if (!o.ai) { G.offers.push({ from: a.id, type: 'peace' }); return { ok: true, pending: true }; }
  if (aiAcceptsPeace(o, a)) { makePeace(a, o); return { ok: true, msg: `${nm(o)} принимает мир.` }; }
  return { ok: false, msg: `${nm(o)} отвергает мир.` };
}
function proposeAlliance(a, o) {
  const r = getRel(a.id, o.id);
  if (r.st !== 'peace') return { ok: false, msg: 'Союз возможен только в мирное время.' };
  if (!o.ai) { G.offers.push({ from: a.id, type: 'alliance' }); return { ok: true, pending: true }; }
  if (r.op >= 30) { makeAlliance(a, o); return { ok: true, msg: `${nm(o)} становится твоим союзником!` }; }
  return { ok: false, msg: `${nm(o)} не доверяет тебе (отношения ниже 30). Отправь подарки.` };
}
function giftGold(a, o, amount) {
  if (a.res.gold < amount) return { ok: false, msg: 'Не хватает золота.' };
  a.res.gold -= amount; o.res.gold += amount;
  const r = getRel(a.id, o.id);
  r.op = Math.min(100, r.op + Math.round(amount / 6));
  return { ok: true, msg: `Подарок принят. Отношения: ${r.op}.` };
}
function demandTribute(a, o) {
  const r = getRel(a.id, o.id);
  if (kStrength(a) > kStrength(o) * 1.6 && o.res.gold >= 20) {
    const amt = Math.min(Math.floor(o.res.gold * 0.3), 120);
    o.res.gold -= amt; a.res.gold += amt; r.op -= 15;
    return { ok: true, msg: `${nm(o)} платит дань: ${amt} 🪙.` };
  }
  r.op -= 10;
  return { ok: false, msg: `${nm(o)} отказывается платить. Отношения ухудшились.` };
}
function acceptOffer(idx) {
  const o = G.offers[idx]; if (!o) return;
  const a = G.kings[o.from], p = G.kings[0];
  if (o.type === 'peace') makePeace(a, p);
  else if (o.type === 'alliance') makeAlliance(a, p);
  G.offers.splice(idx, 1);
}
function declineOffer(idx) {
  const o = G.offers[idx]; if (!o) return;
  getRel(o.from, 0).op -= 5;
  G.offers.splice(idx, 1);
}

/* =====================================================
   Ход
   ===================================================== */
function startTurn(k) {
  const n = netIncome(k);
  for (const r of RES) k.res[r] = Math.round((k.res[r] + n[r]) * 10) / 10;
  if (k.res.food < 0) {
    k.res.food = 0;
    for (const p of G.provs) if (p.owner === k.id) {
      for (const a of [p.army, p.tired]) for (const u in a) a[u] = Math.floor(a[u] * 0.88);
    }
    if (isPlayer(k)) logEv('🍞 Голод! Армия редеет — построй фермы или распусти войска.', true);
  }
  for (const p of G.provs) if (p.owner === k.id) { p.rec = 0; p.built = false; addAll(p.army, p.tired); p.tired = {}; }
  if (k.hero.dead > 0) {
    k.hero.dead--;
    if (k.hero.dead === 0) { k.hero.pid = k.cap; if (isPlayer(k)) logEv(`🦸 ${k.hero.n} вернулся в столицу.`, true); }
  }
}

function endTurn() {
  G.notes = []; G.reports = []; G.offers = [];
  const order = shuffle(G.kings.filter(k => k.alive && k.ai).map(k => k.id));
  for (const id of order) { const k = G.kings[id]; if (k.alive) aiTurn(k); }
  G.turn++;
  for (const k of G.kings) if (k.alive) startTurn(k);
  // нейтральные провинции восстанавливают гарнизон
  if (G.turn % 2 === 0) for (const p of G.provs) if (p.owner < 0 && totalArmy(p) < p.gcap) addTo(p.army, 'militia', 1);
  // отношения
  for (const key in G.rel) {
    const r = G.rel[key];
    if (r.st === 'dead') continue;
    if (r.st === 'war') r.war++;
    if (r.tr > 0) r.tr--;
    if (r.op > 0) r.op -= (Math.random() < 0.3 ? 1 : 0); else if (r.op < 0 && r.st !== 'war') r.op += (Math.random() < 0.3 ? 1 : 0);
    if (r.st === 'ally') r.op = Math.min(100, r.op + 1);
  }
  G.event = G.kings[0].ai ? null : rollEvent();
  checkEnd();
  if (G.turn % 12 === 0) logEv(`📅 Начался ${yearOf()}-й год твоего правления.`, false);
}

function checkEnd() {
  const player = G.kings[0];
  if (player.ai) return;
  const mine = G.provs.filter(p => p.owner === 0).length;
  if (!player.alive || mine === 0) { G.over = 'lose'; return; }
  const rivals = G.kings.filter(k => k.alive && k.id !== 0).length;
  if (!G.won && (rivals === 0 || mine >= Math.ceil(G.provs.length * 0.7))) { G.won = true; G.over = 'win'; }
}

/* =====================================================
   События
   ===================================================== */
function rollEvent() {
  if (G.turn < 3 || Math.random() > 0.2) return null;
  const k = G.kings[0], mine = ownProvs(0);
  const withArmy = mine.filter(p => totalArmy(p) >= 4);
  const pool = [['traders', 2], ['harvest', 2], ['treasure', 2], ['sage', 2], ['mercs', 2], ['envoy', 1]];
  if (withArmy.length) pool.push(['plague', 1.5]);
  if (mine.length > 2) pool.push(['rebels', 1.5]);
  const id = pickW(pool);
  const ev = { id, pid: -1 };
  if (id === 'plague') ev.pid = withArmy[rI(0, withArmy.length - 1)].id;
  if (id === 'rebels') ev.pid = mine.filter(p => p.id !== k.cap)[rI(0, mine.length - 2)].id;
  if (id === 'treasure') ev.amt = rI(60, 140);
  if (id === 'envoy') { const al = G.kings.filter(x => x.alive && x.id !== 0); ev.kid = al[rI(0, al.length - 1)].id; }
  return ev;
}
function eventInfo(ev) {
  const pn = ev.pid >= 0 ? MAP.provs[ev.pid].name : '';
  switch (ev.id) {
    case 'traders': return { t: '🛒 Бродячие торговцы', s: 'Караван купцов предлагает партию железа по хорошей цене.', o: ['Купить 20 ⚙️ за 40 🪙', 'Отказаться'] };
    case 'harvest': return { t: '🌾 Урожайный год', s: 'Поля дали щедрый урожай. Амбары полны.', o: ['Отлично! +40 🌾'] };
    case 'treasure': return { t: '💎 Найден клад', s: 'Крестьяне нашли старый клад. Всё это — казне.', o: [`Забрать +${ev.amt} 🪙`] };
    case 'sage': return { t: '🧙 Мудрец', s: 'Странствующий учёный делится знаниями при дворе.', o: ['Выслушать +25 📜'] };
    case 'mercs': return { t: '⚔️ Наёмники', s: 'Отряд наёмников предлагает свои мечи в столице.', o: ['Нанять 6 мечников за 100 🪙', 'Отказаться'] };
    case 'envoy': return { t: '🕊️ Посол', s: `Посол королевства «${KINGDOMS[G.kings[ev.kid].kid].n}» привёз дары и добрые слова.`, o: ['Принять (+15 к отношениям)'] };
    case 'plague': return { t: '☠️ Чума', s: `В провинции ${pn} вспыхнула чума.`, o: ['Заплатить лекарям (−40 🪙)', 'Смириться (−15% войск там)'] };
    case 'rebels': return { t: '🔥 Мятеж', s: `В провинции ${pn} зреет мятеж.`, o: ['Раздать хлеб (−30 🌾)', 'Подавить силой (−25 🪙, риск)'] };
  }
  return { t: '?', s: '', o: ['ОК'] };
}
function resolveEvent(ch) {
  const ev = G.event; if (!ev) return '';
  const k = G.kings[0]; let msg = '';
  switch (ev.id) {
    case 'traders': if (ch === 0) { if (k.res.gold >= 40) { k.res.gold -= 40; k.res.iron += 20; msg = 'Куплено 20 железа.'; } else msg = 'Не хватило золота — купцы ушли.'; } break;
    case 'harvest': k.res.food += 40; break;
    case 'treasure': k.res.gold += ev.amt; break;
    case 'sage': k.res.know += 25; break;
    case 'mercs': if (ch === 0) { if (k.res.gold >= 100) { k.res.gold -= 100; addTo(G.provs[k.cap].tired, 'sword', 6); msg = '6 мечников присоединились в столице.'; } else msg = 'Не хватило золота.'; } break;
    case 'envoy': getRel(0, ev.kid).op = Math.min(100, getRel(0, ev.kid).op + 15); break;
    case 'plague': {
      const p = G.provs[ev.pid];
      if (ch === 0 && k.res.gold >= 40) { k.res.gold -= 40; msg = 'Лекари остановили болезнь.'; }
      else { for (const a of [p.army, p.tired]) for (const u in a) a[u] = Math.floor(a[u] * 0.85); msg = 'Болезнь унесла часть войск.'; }
      break;
    }
    case 'rebels': {
      const p = G.provs[ev.pid];
      if (ch === 0 && k.res.food >= 30) { k.res.food -= 30; msg = 'Народ успокоился.'; }
      else if (ch === 1 && k.res.gold >= 25) {
        k.res.gold -= 25;
        if (Math.random() < 0.75) msg = 'Мятеж подавлен.';
        else { for (const a of [p.army, p.tired]) for (const u in a) a[u] = Math.floor(a[u] * 0.7); msg = 'Мятежники нанесли урон гарнизону.'; }
      } else { for (const a of [p.army, p.tired]) for (const u in a) a[u] = Math.floor(a[u] * 0.7); msg = 'Мятеж не подавлен — гарнизон ослаблен.'; }
      break;
    }
  }
  G.event = null;
  return msg;
}

/* =====================================================
   Достижения
   ===================================================== */
function checkAch() {
  const k = G.kings[0], out = [];
  const mine = ownProvs(0).length;
  const tc = Object.keys(k.tech).length;
  const maxArmy = Math.max(0, ...ownProvs(0).map(totalArmy));
  const rel = G.kings.some(o => o.id !== 0 && getRel(0, o.id).st === 'ally');
  const cond = {
    win1: G.stats.won >= 1, cap1: G.stats.captured >= 1, own8: mine >= 8, own15: mine >= 15, army50: maxArmy >= 50,
    tech6: tc >= 6, tech12: tc >= TORDER.length, ally1: rel, kill1: G.stats.killed >= 1, hero3: k.hero.lvl >= 3,
    gold1k: k.res.gold >= 1000, win: G.won
  };
  for (const a of ACHS) if (!G.ach[a.id] && cond[a.id]) { G.ach[a.id] = true; out.push(a); }
  return out;
}

/* =====================================================
   ИИ
   ===================================================== */
function isHostile(k, q) { return q.owner === -1 || (q.owner !== k.id && getRel(k.id, q.owner).st === 'war'); }
function isBorder(k, p) { return MAP.provs[p.id].nb.some(n => G.provs[n].owner !== k.id); }
function isFront(k, p) { return MAP.provs[p.id].nb.some(n => isHostile(k, G.provs[n])); }
function provValue(q) {
  const y = provYield(Object.assign({}, q, { owner: q.owner }));
  let v = 8 + y.gold + y.food * 0.5 + y.iron * 1.2 + slotsUsed(q) * 3;
  if (q.owner >= 0 && G.kings[q.owner].cap === q.id) v += 25;
  return v;
}

function aiTurn(k) {
  aiTech(k); aiDiplo(k); aiBuild(k); aiRecruit(k); aiMilitary(k);
}

function aiTech(k) {
  const pri = ['agri', 'scribes', 'trade', 'steel', 'mining', 'recruit', 'horses', 'fortify', 'bank', 'siege', 'supply', 'chivalry'];
  for (const id of pri) if (techState(k, id) === 'open' && k.res.know >= TECHS[id].cost) { research(k, id); break; }
}

function aiDiplo(k) {
  const aggr = KINGDOMS[k.kid].aggr * (0.7 + 0.15 * G.cfg.diff);
  const alive = G.kings.filter(x => x.alive);
  const avg = G.provs.filter(p => p.owner >= 0).length / alive.length;
  for (const o of G.kings) {
    if (!o.alive || o === k) continue;
    const r = getRel(k.id, o.id);
    const big = ownProvs(o.id).length > avg * 1.6 && ownProvs(k.id).length < ownProvs(o.id).length;
    if (r.st === 'war') {
      const ks = kStrength(k), os = kStrength(o);
      if (r.war >= 3 && (ks < os * 0.75 || (r.war > 14 && Math.random() < 0.2))) {
        if (!o.ai) { if (!G.offers.some(x => x.from === k.id && x.type === 'peace')) G.offers.push({ from: k.id, type: 'peace' }); }
        else if (aiAcceptsPeace(o, k)) makePeace(k, o);
      }
    } else if (r.st === 'peace') {
      const grace = G.turn > (o.ai ? 8 : 10 + 4 * (2 - G.cfg.diff));
      if (grace && r.tr <= 0 && sharesBorder(k, o) && ((kStrength(k) > kStrength(o) * 1.2 && Math.random() < 0.02 + 0.06 * aggr) || (big && Math.random() < 0.1))) declareWar(k, o);
      else if (o.ai && r.op >= 40 && Math.random() < 0.04) makeAlliance(k, o);
    }
  }
}

function aiBuild(k) {
  const mine = shuffle(ownProvs(k.id)), net = netIncome(k);
  let builds = 0;
  for (const p of mine) {
    if (builds >= 3) break;
    if (p.built) continue;
    const lv = b => p.b[b] || 0, border = isBorder(k, p);
    const list = [
      ['farm', net.food < 3 ? 6 : 1], ['market', 3], ['mine', k.res.iron < 60 ? 3 : 1], ['library', 2],
      ['barracks', lv('barracks') < 2 ? (border ? 3 : 1) : 0.4], ['walls', border ? 1.5 : 0]
    ].filter(x => x[1] > 0 && !canBuild(k, p, x[0]) && k.res.gold >= buildCost(k, p, x[0]).gold + 30);
    if (!list.length) continue;
    const b = pickW(list);
    if (build(k, p, b).ok) builds++;
  }
}

function aiRecruit(k) {
  const mine = ownProvs(k.id), fronts = mine.filter(p => isFront(k, p)), borders = mine.filter(p => isBorder(k, p));
  let targets = fronts.length ? fronts : borders.length ? borders : mine;
  const net = netIncome(k);
  let foodRoom = net.food + Math.max(0, k.res.food - 60) / 8;
  for (let g = 0; g < 16; g++) {
    targets = targets.filter(p => p.rec < recLimit(k, p));
    if (!targets.length) break;
    if (k.res.gold < 35) break;
    let p = targets[0];
    for (const t of targets) if (totalArmy(t) < totalArmy(p)) p = t;
    const opts = UORDER.filter(u => unitAvail(k, p, u) && UNITS[u].up <= foodRoom + 0.2).map(u => [u, { militia: k.res.iron < 14 ? 3 : 0.4, spear: 2, archer: 2, sword: 3, cavalry: 2, catapult: 1, knight: 3 }[u]]);
    if (!opts.length) break;
    let u = pickW(opts);
    let r = recruit(k, p, u, 1);
    if (r.err && u !== 'militia') { u = 'militia'; r = recruit(k, p, u, 1); }
    if (r.err) break;
    foodRoom -= UNITS[u].up;
  }
}

function nextToFront(k, p) {
  const seen = { [p.id]: -1 }, q = [p.id];
  while (q.length) {
    const c = q.shift();
    if (c !== p.id && isFront(k, G.provs[c])) { let s = c; while (seen[s] !== p.id) s = seen[s]; return s; }
    for (const n of MAP.provs[c].nb) if (G.provs[n].owner === k.id && !(n in seen)) { seen[n] = c; q.push(n); }
  }
  return -1;
}

function aiMilitary(k) {
  const aggr = KINGDOMS[k.kid].aggr;
  const mine = shuffle(ownProvs(k.id));
  let attacks = 0;
  const maxAtt = aggr >= 0.7 ? 2 : 1;
  for (const p of mine) {
    if (p.owner !== k.id) continue;
    const total = sizeOf(p.army);
    if (total < 3) continue;
    let best = null;
    const hero = heroHere(k, p.id);
    // угроза
    let threat = 0;
    for (const n of MAP.provs[p.id].nb) { const q = G.provs[n]; if (q.owner >= 0 && q.owner !== k.id && getRel(k.id, q.owner).st === 'war') threat += strOf(q.army) + strOf(q.tired); }
    const frac = threat > strOf(p.army) * 0.6 ? 0.7 : 1;
    const units = {};
    for (const u in p.army) { const n = Math.round(p.army[u] * frac); if (n > 0) units[u] = n; }
    if (!sizeOf(units)) continue;
    for (const n of MAP.provs[p.id].nb) {
      const q = G.provs[n];
      if (!isHostile(k, q)) continue;
      const def = merge(q.army, q.tired);
      const ctx = battleCtx(k, q, units, hero);
      const ratio = pw(units) * (1 + ctx.aB) / Math.max(1, pw(def) * (1 + ctx.dB));
      const thr = (q.owner < 0 ? 1.35 : 1.5) - 0.25 * aggr;
      if (ratio >= thr && attacks < maxAtt && G.turn >= 4) {
        const score = provValue(q) * Math.min(ratio, 3);
        if (!best || score > best.score) best = { id: n, score };
      }
    }
    if (best) { moveArmy(p.id, best.id, frac, hero); attacks++; continue; }
    if (!isFront(k, p)) {
      const nx = nextToFront(k, p);
      if (nx >= 0) moveArmy(p.id, nx, 1, hero);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    get G() { return G; }, get MAP() { return MAP; }
  };
}
