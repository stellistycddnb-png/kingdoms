'use strict';
/* =====================================================
   КОРОЛЕВСТВА — отрисовка карты и управление камерой
   ===================================================== */

const Rn = (() => {
  let cv, ctx, W = 0, H = 0, dpr = 1;
  const cam = { x: MAPW / 2, y: MAPH / 2, z: 1 };
  let tween = null;
  let mapCv = null, mapCtx = null, mapHi = null, mapDirty = true;
  const masks = new Map();
  let sel = -1, targets = [], decor = false, last = 0, onTapCb = null, running = false;
  const snow = [];
  for (let i = 0; i < 70; i++) snow.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5, v: 0.02 + Math.random() * 0.04 });

  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const decorOwner = [];

  function provRGB(i) {
    const tint = hex(TERR[MAP.provs[i].terr].tint);
    let own = null;
    if (decor) { const o = decorOwner[i]; own = o < 0 ? [140, 133, 119] : hex(KINGDOMS[o].c); }
    else {
      const o = G.provs[i].owner;
      own = o < 0 ? [140, 133, 119] : hex(KINGDOMS[G.kings[o].kid].c);
    }
    const w = (decor || G.provs[i].owner >= 0) ? 0.68 : 0.35;
    return [own[0] * w + tint[0] * (1 - w), own[1] * w + tint[1] * (1 - w), own[2] * w + tint[2] * (1 - w)];
  }
  function ownerOf(i) { return decor ? decorOwner[i] : G.provs[i].owner; }

  function repaintMap() {
    if (!MAP) return;
    if (!mapCv) { mapCv = document.createElement('canvas'); mapCv.width = GW; mapCv.height = GH; mapCtx = mapCv.getContext('2d'); }
    const img = mapCtx.createImageData(GW, GH), d = img.data, ids = MAP.ids, sh = MAP.shade;
    const cols = [], owners = [];
    for (let i = 0; i < MAP.N; i++) { cols.push(provRGB(i)); owners.push(ownerOf(i)); }
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x, id = ids[i], o = i * 4;
        if (id < 0) { d[o + 3] = 0; continue; }
        const c = cols[id];
        let m = 0.86 + 0.28 * sh[i] / 255;
        const nb = [x > 0 ? ids[i - 1] : -1, x < GW - 1 ? ids[i + 1] : -1, y > 0 ? ids[i - GW] : -1, y < GH - 1 ? ids[i + GW] : -1];
        for (const n of nb) {
          if (n === id) continue;
          if (n < 0) { m *= 0.62; break; }
          m *= owners[n] !== owners[id] ? 0.5 : 0.78;
        }
        d[o] = Math.min(255, c[0] * m); d[o + 1] = Math.min(255, c[1] * m); d[o + 2] = Math.min(255, c[2] * m); d[o + 3] = 255;
      }
    }
    mapCtx.putImageData(img, 0, 0);
    // увеличенная сглаженная копия: убирает «лесенку» на границах
    if (!mapHi) { mapHi = document.createElement('canvas'); mapHi.width = GW * 2; mapHi.height = GH * 2; }
    const hc = mapHi.getContext('2d');
    hc.clearRect(0, 0, mapHi.width, mapHi.height);
    hc.imageSmoothingEnabled = true; hc.imageSmoothingQuality = 'high';
    try { hc.filter = 'blur(1.1px)'; } catch (e) { }
    hc.drawImage(mapCv, 0, 0, mapHi.width, mapHi.height);
    try { hc.filter = 'none'; } catch (e) { }
    mapDirty = false;
  }

  function mask(id, rgb) {
    const key = id + ':' + rgb.join(',');
    let m = masks.get(key);
    if (m) return m;
    const p = MAP.provs[id], w = p.x1 - p.x0 + 1, h = p.y1 - p.y0 + 1;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (MAP.ids[(p.y0 + y) * GW + p.x0 + x] === id) { const o = (y * w + x) * 4; d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255; }
    }
    cx.putImageData(img, 0, 0);
    m = { c, x: p.x0 * CELL, y: p.y0 * CELL, w: w * CELL, h: h * CELL };
    masks.set(key, m);
    return m;
  }

  /* ---------- Камера ---------- */
  function minZ() { return Math.min(W / MAPW, H / MAPH) * 0.98; }
  function clampCam() {
    cam.z = Math.max(minZ(), Math.min(3.2, cam.z));
    const hw = W / (2 * cam.z), hh = H / (2 * cam.z);
    const pad = 80;
    cam.x = hw * 2 >= MAPW + pad * 2 ? MAPW / 2 : Math.max(hw - pad, Math.min(MAPW - hw + pad, cam.x));
    cam.y = hh * 2 >= MAPH + pad * 2 ? MAPH / 2 : Math.max(hh - pad, Math.min(MAPH - hh + pad, cam.y));
  }
  function zoomAt(sx, sy, f) {
    const wx = (sx - W / 2) / cam.z + cam.x, wy = (sy - H / 2) / cam.z + cam.y;
    cam.z = Math.max(minZ(), Math.min(3.2, cam.z * f));
    cam.x = wx - (sx - W / 2) / cam.z; cam.y = wy - (sy - H / 2) / cam.z;
    clampCam();
  }
  function toWorld(sx, sy) { return [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y]; }
  function hit(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    const gx = Math.floor(wx / CELL), gy = Math.floor(wy / CELL);
    if (gx >= 0 && gy >= 0 && gx < GW && gy < GH && MAP.ids[gy * GW + gx] >= 0) return MAP.ids[gy * GW + gx];
    let best = -1, bd = 36 * 36;
    for (const p of MAP.provs) { const d = (p.x - wx) ** 2 + (p.y - wy) ** 2; if (d < bd) { bd = d; best = p.id; } }
    return best;
  }
  function focus(id, z) {
    const p = MAP.provs[id];
    tween = { t: 0, fx: cam.x, fy: cam.y, fz: cam.z, x: p.x, y: p.y, z: z || Math.max(cam.z, 1.2) };
  }
  function fit() { tween = null; cam.x = MAPW / 2; cam.y = MAPH / 2; cam.z = minZ(); clampCam(); }

  /* ---------- Размер ---------- */
  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    clampCam();
  }

  /* ---------- Рисование ---------- */
  function sea(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b5272'); g.addColorStop(1, '#0d2e46');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const y0 = (i + 0.5) * H / 16;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const y = y0 + Math.sin(x * 0.02 + t * 0.0007 + i * 1.7) * 5 - cam.y * 0.05 * (i % 3);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function banner(x, y, text, color, s, extra) {
    ctx.font = `bold ${Math.round(12 * s)}px sans-serif`;
    const tw = ctx.measureText(text).width + (extra ? 16 * s : 0), w = tw + 14 * s, h = 17 * s;
    ctx.fillStyle = 'rgba(15,12,10,0.82)';
    ctx.strokeStyle = color; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 5 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((extra || '') + text, x, y + 0.5);
  }

  function draw(t) {
    if (!cv || !MAP) return;
    if (mapDirty) repaintMap();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sea(t);

    const z = cam.z;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
    ctx.imageSmoothingEnabled = true;
    // тень берега
    ctx.globalAlpha = 0.35; ctx.drawImage(mapHi, 4, 6, MAPW, MAPH); ctx.globalAlpha = 1;
    ctx.drawImage(mapHi, 0, 0, MAPW, MAPH);

    // подсветка
    if (!decor) {
      const pulse = 0.25 + 0.12 * Math.sin(t * 0.005);
      for (const tg of targets) {
        const rgb = tg.kind === 'attack' ? [255, 70, 50] : tg.kind === 'move' ? [90, 255, 120] : [160, 160, 160];
        const m = mask(tg.id, rgb); ctx.globalAlpha = pulse + 0.08; ctx.drawImage(m.c, m.x, m.y, m.w, m.h);
      }
      if (sel >= 0) { const m = mask(sel, [255, 255, 255]); ctx.globalAlpha = 0.28 + 0.1 * Math.sin(t * 0.004); ctx.drawImage(m.c, m.x, m.y, m.w, m.h); }
      ctx.globalAlpha = 1;
    }

    // дороги
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,240,200,0.22)'; ctx.lineWidth = 1.5 / z * 1.2; ctx.setLineDash([5 / z, 6 / z]);
    ctx.beginPath();
    for (const p of MAP.provs) for (const n of p.nb) if (n > p.id) { const q = MAP.provs[n]; ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (sel >= 0 && targets.length) {
      ctx.lineWidth = 3 / z; const p = MAP.provs[sel];
      for (const tg of targets) {
        const q = MAP.provs[tg.id];
        ctx.strokeStyle = tg.kind === 'attack' ? 'rgba(255,90,70,.9)' : tg.kind === 'move' ? 'rgba(110,255,140,.9)' : 'rgba(180,180,180,.5)';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    ctx.restore();

    // иконки и подписи (в экранных координатах)
    const s = Math.max(0.75, Math.min(1.5, z * 0.9));
    const show = z >= 0.85;
    for (const p of MAP.provs) {
      const sx = (p.x - cam.x) * z + W / 2, sy = (p.y - cam.y) * z + H / 2;
      if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) continue;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (decor) { ctx.font = `${Math.round(18 * s)}px sans-serif`; ctx.fillText(TERR[p.terr].i, sx, sy); continue; }
      const pr = G.provs[p.id], owner = pr.owner >= 0 ? G.kings[pr.owner] : null;
      const isCap = owner && owner.cap === p.id;
      ctx.globalAlpha = 0.9;
      ctx.font = `${Math.round((isCap ? 28 : 17) * s)}px sans-serif`;
      ctx.fillText(isCap ? '🏰' : TERR[p.terr].i, sx, sy - 9 * s);
      ctx.globalAlpha = 1;
      const tot = totalArmy(pr);
      const col = owner ? KINGDOMS[owner.kid].c : '#9b9484';
      if (tot > 0) {
        const hero = owner && heroHere(owner, p.id);
        banner(sx, sy + 12 * s, String(tot), col, s, hero ? '🦸' : '');
        if (owner && !owner.ai && sizeOf(pr.army) > 0 && !G.over) {
          ctx.fillStyle = '#7dff8a'; ctx.beginPath(); ctx.arc(sx + 20 * s + (hero ? 8 * s : 0), sy + 5 * s, 3.2 * s, 0, 6.3); ctx.fill();
        }
      }
      if (show || p.id === sel || targets.some(x => x.id === p.id)) {
        ctx.font = `bold ${Math.round(11 * s)}px sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = '#fff';
        const ly = sy + 30 * s;
        ctx.strokeText(p.name, sx, ly); ctx.fillText(p.name, sx, ly);
      }
    }

    // времена года
    if (!decor && G) {
      const si = seasonIdx();
      if (si === 3) {
        ctx.fillStyle = 'rgba(190,215,255,0.10)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        for (const f of snow) {
          f.y += f.v * 0.4; f.x += Math.sin(t * 0.001 + f.s * 9) * 0.0006;
          if (f.y > 1) { f.y = 0; f.x = Math.random(); }
          ctx.beginPath(); ctx.arc(f.x * W, f.y * H, f.s, 0, 6.3); ctx.fill();
        }
      } else if (si === 2) { ctx.fillStyle = 'rgba(255,150,40,0.06)'; ctx.fillRect(0, 0, W, H); }
      else if (si === 1) { ctx.fillStyle = 'rgba(255,230,120,0.04)'; ctx.fillRect(0, 0, W, H); }
    }
    // виньетка
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (ts - last < 30) return;
    const dt = Math.min(100, ts - last); last = ts;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 450);
      const e = 1 - Math.pow(1 - tween.t, 3);
      cam.x = tween.fx + (tween.x - tween.fx) * e; cam.y = tween.fy + (tween.y - tween.fy) * e; cam.z = tween.fz + (tween.z - tween.fz) * e;
      clampCam();
      if (tween.t >= 1) tween = null;
    }
    if (decor) { cam.x += Math.sin(ts * 0.00012) * 0.35; cam.y += Math.cos(ts * 0.00009) * 0.2; clampCam(); }
    draw(ts);
  }

  /* ---------- Ввод ---------- */
  function attachInput() {
    const pts = new Map();
    let moved = false, lastD = 0, down = null;
    const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (x) { }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tween = null;
      if (pts.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = false; }
      if (pts.size === 2) { lastD = dist(); moved = true; }
    });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const rect = cv.getBoundingClientRect();
      if (pts.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (!moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) moved = true;
        if (moved) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
      } else if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const d = dist(), a = [...pts.values()];
        if (lastD > 0) zoomAt((a[0].x + a[1].x) / 2 - rect.left, (a[0].y + a[1].y) / 2 - rect.top, d / lastD);
        lastD = d;
      }
    });
    const up = e => {
      const had = pts.delete(e.pointerId);
      if (had && !moved && pts.size === 0 && onTapCb && e.type === 'pointerup') {
        const rect = cv.getBoundingClientRect();
        onTapCb(e.clientX - rect.left, e.clientY - rect.top);
      }
      if (pts.size < 2) lastD = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 0.87); }, { passive: false });
  }

  return {
    cam,
    init(canvas, onTap) {
      cv = canvas; ctx = cv.getContext('2d'); onTapCb = onTap;
      attachInput(); resize();
      window.addEventListener('resize', resize);
      if (!running) { running = true; requestAnimationFrame(frame); }
    },
    resize,
    setMap() { masks.clear(); sel = -1; targets = []; mapDirty = true; },
    setDecor(on) {
      decor = on;
      if (on) { decorOwner.length = 0; for (let i = 0; i < MAP.N; i++) decorOwner.push(Math.random() < 0.8 ? Math.floor(Math.random() * KINGDOMS.length) : -1); }
      mapDirty = true; fit();
    },
    repaint() { mapDirty = true; },
    setSel(id) { sel = id; },
    setTargets(t) { targets = t || []; },
    focus, fit, hit, zoomAt,
    zoomBy(f) { zoomAt(W / 2, H / 2, f); }
  };
})();
