'use strict';
/* =====================================================
   КОРОЛЕВСТВА — генерация карты (чистый код, без DOM)
   ===================================================== */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function genMap(seed, N) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = tryGenMap(seed + attempt * 7919, N);
    if (m) return m;
  }
  throw new Error('map generation failed');
}

function tryGenMap(seed, N) {
  const rnd = mulberry32(seed);
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const land = (x, y) => {
    const nx = x / MAPW - 0.5, ny = y / MAPH - 0.5;
    const a = Math.atan2(ny, nx);
    const r = Math.hypot(nx / 0.47, ny / 0.45);
    const wob = 0.10 * Math.sin(3 * a + ph[0]) + 0.06 * Math.sin(5 * a + ph[1]) + 0.04 * Math.sin(2 * a + ph[2]);
    return r + wob < 1;
  };

  // Равномерно расставляем зёрна (best-candidate)
  const seeds = [];
  const randLand = () => { for (let i = 0; i < 200; i++) { const x = rnd() * MAPW, y = rnd() * MAPH; if (land(x, y)) return [x, y]; } return [MAPW / 2, MAPH / 2]; };
  seeds.push(randLand());
  while (seeds.length < N) {
    let best = null, bd = -1;
    for (let c = 0; c < 24; c++) {
      const p = randLand();
      let d = 1e9;
      for (const s of seeds) d = Math.min(d, (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2);
      if (d > bd) { bd = d; best = p; }
    }
    seeds.push(best);
  }

  // Сетка принадлежности (диаграмма Вороного с волнистыми границами)
  const ids = new Int8Array(GW * GH).fill(-1);
  const sx = seeds.map(s => s[0]), sy = seeds.map(s => s[1]);
  for (let gy = 0; gy < GH; gy++) {
    const wy = (gy + 0.5) * CELL;
    for (let gx = 0; gx < GW; gx++) {
      const wx = (gx + 0.5) * CELL;
      if (!land(wx, wy)) continue;
      const qx = wx + 20 * Math.sin(wy * 0.021 + ph[0]) + 9 * Math.sin(wy * 0.057 + ph[1]);
      const qy = wy + 20 * Math.sin(wx * 0.019 + ph[2]) + 9 * Math.sin(wx * 0.05 + ph[3]);
      let bi = 0, bd = 1e12;
      for (let i = 0; i < N; i++) {
        const d = (qx - sx[i]) ** 2 + (qy - sy[i]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      ids[gy * GW + gx] = bi;
    }
  }

  // Статистика по провинциям
  const provs = [];
  for (let i = 0; i < N; i++) provs.push({ id: i, area: 0, sx: 0, sy: 0, x0: GW, y0: GH, x1: 0, y1: 0, nbs: new Set(), coast: false });
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const id = ids[gy * GW + gx];
    if (id < 0) continue;
    const p = provs[id];
    p.area++; p.sx += gx; p.sy += gy;
    if (gx < p.x0) p.x0 = gx; if (gx > p.x1) p.x1 = gx;
    if (gy < p.y0) p.y0 = gy; if (gy > p.y1) p.y1 = gy;
    const r = gx + 1 < GW ? ids[gy * GW + gx + 1] : -1;
    const d = gy + 1 < GH ? ids[(gy + 1) * GW + gx] : -1;
    const l = gx > 0 ? ids[gy * GW + gx - 1] : -1;
    const u = gy > 0 ? ids[(gy - 1) * GW + gx] : -1;
    for (const o of [r, d]) if (o >= 0 && o !== id) { p.nbs.add(o); provs[o].nbs.add(id); }
    if (r < 0 || d < 0 || l < 0 || u < 0) p.coast = true;
  }
  for (const p of provs) if (p.area < 260) return null;

  // Связность графа
  const seen = new Set([0]), q = [0];
  while (q.length) { const c = q.pop(); for (const n of provs[c].nbs) if (!seen.has(n)) { seen.add(n); q.push(n); } }
  if (seen.size !== N) return null;

  // Центры, имена, местность
  const used = new Set();
  for (const p of provs) {
    let cx = Math.round(p.sx / p.area), cy = Math.round(p.sy / p.area);
    if (ids[cy * GW + cx] !== p.id) {
      let bd = 1e9;
      for (let gy = p.y0; gy <= p.y1; gy++) for (let gx = p.x0; gx <= p.x1; gx++) {
        if (ids[gy * GW + gx] !== p.id) continue;
        const d = (gx - cx) ** 2 + (gy - cy) ** 2;
        if (d < bd) { bd = d; p.cx = gx; p.cy = gy; }
      }
      cx = p.cx; cy = p.cy;
    }
    p.cx = cx; p.cy = cy;
    p.x = (cx + 0.5) * CELL; p.y = (cy + 0.5) * CELL;
    p.nb = [...p.nbs].sort((a, b) => a - b);
    delete p.nbs; delete p.sx; delete p.sy;
    const t = rnd();
    p.terr = t < 0.36 ? 'plains' : t < 0.62 ? 'forest' : t < 0.82 ? 'hills' : 'mountain';
    let name;
    do { name = NAME_A[Math.floor(rnd() * NAME_A.length)] + NAME_B[Math.floor(rnd() * NAME_B.length)]; } while (used.has(name));
    used.add(name); p.name = name;
  }

  // Шум для объёма (оттенок поверхности)
  const shade = new Uint8Array(GW * GH);
  const f = [0.045, 0.11, 0.23];
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const v = 0.5 + 0.28 * Math.sin(gx * f[0] + ph[0]) * Math.cos(gy * f[0] * 1.3 + ph[1])
      + 0.16 * Math.sin(gx * f[1] + gy * f[1] * 0.7 + ph[2]) + 0.08 * Math.sin(gx * f[2] - gy * f[2] + ph[3]);
    shade[gy * GW + gx] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }

  return { seed, N, provs, ids, shade };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { genMap, mulberry32 };
