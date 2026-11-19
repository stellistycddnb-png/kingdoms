'use strict';
/* =====================================================
   КОРОЛЕВСТВА — процедурная музыка и звуки (WebAudio)
   Никаких файлов: всё синтезируется кодом.
   ===================================================== */

const Snd = (() => {
  let ctx = null, master = null, musicG = null, sfxG = null, noiseBuf = null, timer = null;
  let mode = 'calm', nextT = 0, step = 0, melIdx = 4, motif = [], started = false;
  const S = { music: 0.55, sfx: 0.8, muted: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem(SET_KEY) || '{}').audio || {}); } catch (e) { }

  const PROG = {
    calm:   [[50, 53, 57], [48, 52, 55], [46, 50, 53], [48, 52, 55]],            // Dm C Bb C
    battle: [[50, 53, 57], [50, 53, 57], [46, 50, 53], [45, 49, 52]],            // Dm Dm Bb A
    sad:    [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 48, 52]]
  };
  const SCALE = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];   // D дорийский
  const BPM = { calm: 78, battle: 126, sad: 62, win: 96 };

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.connect(ctx.destination);
    musicG = ctx.createGain(); sfxG = ctx.createGain();
    // «эхо» для объёма
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.31;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const wet = ctx.createGain(); wet.gain.value = 0.38;
    musicG.connect(master); musicG.connect(dl);
    dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(master);
    sfxG.connect(master);
    // белый шум
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVol();
    return ctx;
  }

  function applyVol() {
    if (!ctx) return;
    musicG.gain.value = S.muted ? 0 : S.music * 0.5;
    sfxG.gain.value = S.muted ? 0 : S.sfx * 0.7;
  }
  function persist() {
    try {
      const o = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
      o.audio = { music: S.music, sfx: S.sfx, muted: S.muted };
      localStorage.setItem(SET_KEY, JSON.stringify(o));
    } catch (e) { }
  }

  /* ---------- Инструменты ---------- */
  function pluck(f, t, dur, v) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f * 2;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 6, t); fl.frequency.exponentialRampToValueAtTime(f * 1.3, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(musicG);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function pad(f, t, dur, v) {
    const fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = 'lowpass'; fl.frequency.value = 950;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    fl.connect(g); g.connect(musicG);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      o.connect(fl); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function bass(f, t, dur, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(musicG); o.start(t); o.stop(t + dur + 0.05);
  }
  function drum(t, v, pitch) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(pitch, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.32, t + 0.16);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g); g.connect(musicG); o.start(t); o.stop(t + 0.3);
  }
  function noise(t, dur, v, type, freq, dest) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = freq;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || musicG); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  /* ---------- Музыкальный секвенсор ---------- */
  function chordTone(chord) {
    // ближайшая к текущей высоте нота аккорда в диапазоне мелодии
    const cands = [];
    for (const n of chord) for (const o of [12, 24]) { const x = n + o; if (x >= SCALE[0] && x <= SCALE[SCALE.length - 1]) cands.push(x); }
    cands.sort((a, b) => Math.abs(a - SCALE[melIdx]) - Math.abs(b - SCALE[melIdx]));
    const m = cands[Math.floor(Math.random() * Math.min(2, cands.length))];
    const i = SCALE.indexOf(m);
    if (i >= 0) melIdx = i; else {
      let bi = 0; for (let j = 0; j < SCALE.length; j++) if (Math.abs(SCALE[j] - m) < Math.abs(SCALE[bi] - m)) bi = j;
      melIdx = bi;
    }
    return SCALE[melIdx];
  }
  function walk() {
    const d = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
    melIdx = Math.max(0, Math.min(SCALE.length - 1, melIdx + d));
    return SCALE[melIdx];
  }

  function playStep(sn, t) {
    const prog = PROG[mode === 'win' ? 'calm' : mode] || PROG.calm;
    const bar = Math.floor(sn / 8), beat = sn % 8;
    const chord = prog[Math.floor(bar / 2) % prog.length];
    const sd = 60 / BPM[mode] / 2;               // длительность 1/8
    const battle = mode === 'battle', sad = mode === 'sad';

    if (beat === 0 && bar % 2 === 0) for (const n of chord) pad(mtof(n), t, sd * 16, battle ? 0.07 : 0.1);
    if (beat === 0 || (beat === 4 && !sad)) bass(mtof(chord[0] - 12), t, sd * 3.5, battle ? 0.5 : 0.4);
    if (battle && beat % 2 === 1) bass(mtof(chord[0] - 12), t, sd * 0.8, 0.28);

    // мелодия
    const strong = beat === 0 || beat === 4;
    const prob = battle ? 0.78 : sad ? 0.3 : (strong ? 0.85 : beat % 2 === 0 ? 0.5 : 0.28);
    if (Math.random() < prob) {
      const note = strong && Math.random() < 0.7 ? chordTone(chord) : walk();
      const dur = sd * (strong ? 2.2 : 1.3) * (sad ? 1.8 : 1);
      pluck(mtof(note), t, Math.max(0.25, dur), battle ? 0.2 : 0.17);
      if (!battle && Math.random() < 0.22) pluck(mtof(note - 12), t + 0.01, dur, 0.07);   // октава вниз
    }
    // ударные
    if (battle) {
      if (beat % 2 === 0) drum(t, 0.7, 120);
      if (beat === 2 || beat === 6) { noise(t, 0.12, 0.28, 'bandpass', 1800); drum(t, 0.3, 200); }
      noise(t, 0.035, 0.07, 'highpass', 7000);
    } else if (!sad) {
      if (beat === 0) drum(t, 0.38, 95);
      if (beat === 4) drum(t, 0.2, 80);
      if (beat === 6 && Math.random() < 0.4) drum(t, 0.12, 140);
    } else if (beat === 0) drum(t, 0.25, 70);
  }

  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
    const sd = 60 / BPM[mode] / 2;
    while (nextT < ctx.currentTime + 0.6) { playStep(step, nextT); nextT += sd; step++; }
  }

  function startMusic() {
    if (!ctx || timer) return;
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(tick, 120);
    started = true;
  }

  /* ---------- Звуковые эффекты ---------- */
  function tone(f, t, dur, type, v, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(sfxG); o.start(t); o.stop(t + dur + 0.05);
  }
  const SFX = {
    click() { const t = ctx.currentTime; tone(520, t, 0.07, 'triangle', 0.25, 380); },
    tap() { const t = ctx.currentTime; tone(330, t, 0.05, 'sine', 0.2); },
    coin() { const t = ctx.currentTime; tone(988, t, 0.09, 'square', 0.12); tone(1319, t + 0.07, 0.18, 'square', 0.12); },
    build() { const t = ctx.currentTime; for (let i = 0; i < 3; i++) { noise(t + i * 0.12, 0.08, 0.35, 'bandpass', 900, sfxG); tone(180, t + i * 0.12, 0.06, 'square', 0.12, 110); } },
    recruit() { const t = ctx.currentTime; tone(262, t, 0.12, 'sawtooth', 0.14); tone(392, t + 0.1, 0.2, 'sawtooth', 0.14); },
    clash() { const t = ctx.currentTime; noise(t, 0.09, 0.5, 'highpass', 2500, sfxG); tone(1900 + Math.random() * 600, t, 0.14, 'triangle', 0.12, 1400); },
    hit() { const t = ctx.currentTime; noise(t, 0.12, 0.45, 'lowpass', 700, sfxG); tone(110, t, 0.15, 'sine', 0.3, 55); },
    horn() { const t = ctx.currentTime; tone(147, t, 0.55, 'sawtooth', 0.18); tone(220, t + 0.35, 0.8, 'sawtooth', 0.18); },
    turn() { const t = ctx.currentTime; noise(t, 0.22, 0.25, 'highpass', 3500, sfxG); tone(196, t + 0.05, 0.25, 'triangle', 0.18, 294); },
    error() { const t = ctx.currentTime; tone(160, t, 0.18, 'square', 0.12, 110); },
    fanfare() { const t = ctx.currentTime; [392, 392, 392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.16, i > 3 ? 0.55 : 0.18, 'sawtooth', 0.15)); },
    defeat() { const t = ctx.currentTime; [330, 311, 294, 262].forEach((f, i) => tone(f, t + i * 0.35, 0.6, 'triangle', 0.2)); },
    boom() {
      const t = ctx.currentTime; tone(70, t, 1.8, 'sine', 0.7, 28); noise(t, 1.4, 0.18, 'lowpass', 500, sfxG);
      tone(440, t + 0.5, 2.4, 'sine', 0.07); tone(660, t + 0.55, 2.3, 'sine', 0.05);
    }
  };

  function sfx(name) {
    if (!ctx || S.muted || ctx.state !== 'running') return;
    try { if (SFX[name]) SFX[name](); } catch (e) { }
  }

  return {
    S,
    init() { return init(); },
    // вызывать из жеста пользователя
    unlock() {
      if (!init()) return;
      const go = () => { startMusic(); applyVol(); };
      if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => { });
    },
    running() { return !!ctx && ctx.state === 'running'; },
    setMode(m) { if (m !== mode) { mode = m; step = 0; melIdx = 4; } },
    getMode() { return mode; },
    sfx,
    setMusic(v) { S.music = v; applyVol(); persist(); },
    setSfx(v) { S.sfx = v; applyVol(); persist(); },
    toggleMute() { S.muted = !S.muted; applyVol(); persist(); return S.muted; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended' && started) ctx.resume(); }
  };
})();
