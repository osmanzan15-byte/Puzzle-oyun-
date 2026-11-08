const N = 8;
const HUES = [335, 195, 45, 140, 280, 25, 225];
const SHAPES = [
  [[1]],[[1,1]],[[1],[1]],[[1,1,1]],[[1],[1],[1]],[[1,1,1,1]],[[1],[1],[1],[1]],
  [[1,1],[1,1]],[[1,1,1],[1,1,1],[1,1,1]],[[1,1],[1,0]],[[1,1],[0,1]],[[1,0],[1,1]],[[0,1],[1,1]],
  [[1,0],[1,0],[1,1]],[[1,1,1],[1,0,0]],[[0,1],[0,1],[1,1]],[[1,1,1],[0,0,1]],[[1,1,1],[0,1,0]]
];
const levelCfg = l => ({ target: 150 + (l - 1) * 100, walls: Math.min(2 + l * 2, 22), prefill: Math.min((l - 1) * 3, 16) });

const $ = id => document.getElementById(id);
const rnd = n => Math.random() * n | 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
const save = (k, v) => { try { localStorage[k] = v } catch (e) {} };
const load = (k, d) => { try { return +localStorage[k] || d } catch (e) { return d } };

let grid, level, score = 0, shown = 0, best = load('best', 0), pieces, cfg, cells = [], drag = null, busy = false, combo = 0;
let gain = load('sens', 1);
let muted = (() => { try { return localStorage.mute === '1' } catch (e) { return false } })();

/* ---------- ses ---------- */
let ac;
function tone(f, d = .12, t = 'sine', v = .08, at = 0) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(), s = ac.currentTime + at;
    o.type = t; o.frequency.value = f; g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(.0001, s + d);
    o.connect(g).connect(ac.destination); o.start(s); o.stop(s + d);
  } catch (e) {}
}
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms) } catch (e) {} };
const sfx = {
  pick: () => tone(520, .06, 'triangle'),
  place: () => tone(300, .1, 'triangle', .1),
  bad: () => tone(160, .15, 'sawtooth', .04),
  clear: n => [0, 1, 2, 3].slice(0, 2 + Math.min(n, 3)).forEach((k, i) => tone(500 * 2 ** (k * 3 / 12 + i / 12), .18, 'sine', .08, i * .07)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, 'triangle', .1, i * .12)),
  lose: () => [400, 330, 260, 190].forEach((f, i) => tone(f, .3, 'sawtooth', .05, i * .14))
};

/* ---------- ölçüler ---------- */
function resize() {
  const w = Math.min(innerWidth, 460) - 32 - 20 - 7 * 4;
  const h = (innerHeight - 330) / 8.2;
  const c = Math.max(26, Math.min(52, Math.floor(Math.min(w / 8, h))));
  document.documentElement.style.setProperty('--c', c + 'px');
}
addEventListener('resize', resize);

/* ---------- tahta ---------- */
function build() {
  $('board').innerHTML = ''; cells = [];
  for (let i = 0; i < N * N; i++) { const d = document.createElement('div'); d.className = 'cell'; $('board').append(d); cells.push(d); }
}

function startLevel(l) {
  level = l; score = 0; shown = 0; combo = 0; cfg = levelCfg(l);
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  const put = (v, n) => { while (n > 0) { const r = rnd(N), c = rnd(N); if (!grid[r][c]) { grid[r][c] = typeof v === 'function' ? v() : v; n--; } } };
  put('wall', cfg.walls);
  put(() => HUES[rnd(HUES.length)], cfg.prefill);
  for (let i = 0; i < N; i++) { if (grid[i].every(Boolean)) grid[i][0] = null; if (grid.every(r => r[i])) grid[0][i] = null; }
  newPieces(); render(true); hud(true);
}

function newPieces() {
  pieces = [0, 1, 2].map(() => ({ s: SHAPES[rnd(SHAPES.length)], h: HUES[rnd(HUES.length)], used: false }));
  if (!pieces.some(p => fitsAnywhere(p.s))) pieces[0].s = SHAPES[rnd(3)];
  renderTray(true);
}

const fits = (s, r, c) => r >= 0 && c >= 0 && r + s.length <= N && c + s[0].length <= N &&
  s.every((row, i) => row.every((v, j) => !v || !grid[r + i][c + j]));
const fitsAnywhere = s => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(s, r, c)) return true; return false; };

function render(pop) {
  grid.forEach((row, r) => row.forEach((v, c) => {
    const d = cells[r * N + c];
    d.className = 'cell' + (v ? (v === 'wall' ? ' wall' : ' f') : '') + (pop && v ? ' pop' : '');
    if (v && v !== 'wall') d.style.setProperty('--h', v);
  }));
}

function pieceEl(p) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.style.gridTemplateColumns = `repeat(${p.s[0].length},var(--c))`;
  p.s.forEach(row => row.forEach(v => {
    const d = document.createElement('div');
    d.className = v ? 'cell f' : 'cell e';
    d.style.setProperty('--h', p.h);
    el.append(d);
  }));
  return el;
}

function renderTray(fresh) {
  $('tray').innerHTML = '';
  pieces.forEach((p, i) => {
    const slot = document.createElement('div'); slot.className = 'slot';
    const el = pieceEl(p);
    if (fresh) el.style.setProperty('--i', i * .09 + 's'); else el.style.animation = 'none';
    if (p.used) el.classList.add('used');
    else if (!fitsAnywhere(p.s)) el.classList.add('nofit');
    p.el = el;
    el.addEventListener('pointerdown', e => startDrag(e, i));
    slot.append(el); $('tray').append(slot);
  });
}

function hud(instant) {
  $('level').textContent = level; $('best').textContent = best; $('target').textContent = cfg.target;
  $('bar').style.width = Math.min(100, score / cfg.target * 100) + '%';
  const el = $('score'), from = shown, to = score;
  if (instant || from === to) { shown = to; el.textContent = to; return; }
  const t0 = performance.now();
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  (function tick(t) {
    const k = Math.min(1, (t - t0) / 450);
    shown = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    el.textContent = shown;
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ---------- sürükleme ---------- */
const cs = () => cells[0].offsetWidth + 4;

function startDrag(e, i) {
  const p = pieces[i];
  if (p.used || busy || drag || !$('intro').classList.contains('hidden') || !$('msg').classList.contains('hidden')) return;
  e.preventDefault();
  sfx.pick(); buzz(8);
  const wrap = document.createElement('div'); wrap.className = 'dragwrap';
  const el = pieceEl(p); wrap.append(el); document.body.append(wrap);
  const srcRect = p.el.getBoundingClientRect();
  p.el.classList.add('src');
  const w = p.s[0].length * cs() - 4, h = p.s.length * cs() - 4;
  // başlangıçta tepsideki konumdan (küçük) başla, sonra parmağın üstüne yüksel
  wrap.style.transition = 'none';
  wrap.style.transform = `translate3d(${srcRect.left + srcRect.width / 2 - w / 2}px,${srcRect.top + srcRect.height / 2 - h / 2}px,0)`;
  el.style.transform = 'scale(.6)';
  void wrap.offsetWidth; wrap.style.transition = ''; el.style.transform = '';
  drag = { sx: e.clientX, sy: e.clientY, i, p, wrap, w, h, r: -1, c: -1, id: e.pointerId, srcRect };
  moveDrag(e);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag, { once: true });
  window.addEventListener('pointercancel', endDrag, { once: true });
}

function moveDrag(e) {
  if (!drag) return;
  const { wrap, p, w, h } = drag, size = cs();
  const px = drag.sx + (e.clientX - drag.sx) * gain, py = drag.sy + (e.clientY - drag.sy) * gain;
  const x = px - w / 2, y = py - h - 46;
  wrap.style.transform = `translate3d(${x}px,${y}px,0)`;
  const b = cells[0].getBoundingClientRect();
  const fc = (x - b.left) / size, fr = (y - b.top) / size;
  let c = Math.round(fc), r = Math.round(fr);
  if (!fits(p.s, r, c)) { // yakındaki geçerli kareye yapış (kolaylaştırma)
    let bd = 1.6;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = Math.round(fr) + dr, cc = Math.round(fc) + dc, dist = Math.hypot(rr - fr, cc - fc);
      if (dist < bd && fits(p.s, rr, cc)) { bd = dist; r = rr; c = cc; }
    }
  }
  if (r !== drag.r || c !== drag.c) { drag.r = r; drag.c = c; preview(); }
}

let lastPrev = [];
function clearPreview() { lastPrev.forEach(d => d.classList.remove('ghost', 'hint')); lastPrev = []; }

function preview() {
  clearPreview();
  const { p, r, c } = drag;
  if (!fits(p.s, r, c)) return;
  const tmp = grid.map(row => row.slice());
  p.s.forEach((row, i) => row.forEach((v, j) => {
    if (v) { tmp[r + i][c + j] = p.h; const d = cells[(r + i) * N + c + j]; d.style.setProperty('--h', p.h); d.classList.add('ghost'); lastPrev.push(d); }
  }));
  // tamamlanacak çizgileri vurgula
  for (let k = 0; k < N; k++) {
    if (tmp[k].every(Boolean)) for (let j = 0; j < N; j++) mark(k, j);
    if (tmp.every(row => row[k])) for (let j = 0; j < N; j++) mark(j, k);
  }
  function mark(a, b) { const d = cells[a * N + b]; if (d.classList.contains('f') || d.classList.contains('ghost') || d.classList.contains('wall')) { d.classList.add('hint'); lastPrev.push(d); } }
}

async function endDrag() {
  window.removeEventListener('pointermove', moveDrag);
  const d = drag; if (!d) return; drag = null;
  clearPreview();
  const { wrap, p, r, c, i } = d;
  if (fits(p.s, r, c)) {
    const b = cells[r * N + c].getBoundingClientRect();
    wrap.classList.add('snap'); wrap.style.transform = `translate3d(${b.left}px,${b.top}px,0)`;
    busy = true;
    await wait(110); wrap.remove();
    await place(i, r, c);
  } else {
    sfx.bad();
    const s = d.srcRect;
    wrap.classList.add('back');
    wrap.style.transform = `translate3d(${s.left + s.width / 2 - d.w / 2}px,${s.top + s.height / 2 - d.h / 2}px,0)`;
    await wait(280); wrap.remove(); p.el.classList.remove('src');
  }
}

/* ---------- yerleştirme ve temizleme ---------- */
function burst(idx, h) {
  const b = cells[idx], wb = $('boardwrap').getBoundingClientRect(), r = b.getBoundingClientRect();
  for (let k = 0; k < 3; k++) {
    const d = document.createElement('i'); d.className = 'p';
    const a = Math.random() * 6.28, dist = 30 + Math.random() * 50;
    d.style.cssText = `left:${r.left - wb.left + r.width / 2}px;top:${r.top - wb.top + r.height / 2}px;--h:${h};--x:${Math.cos(a) * dist}px;--y:${Math.sin(a) * dist}px`;
    $('fx').append(d); d.addEventListener('animationend', () => d.remove());
  }
}
function floatText(txt, sub) {
  const f = document.createElement('div'); f.className = 'float';
  f.innerHTML = (sub ? `<small>${sub}</small>` : '') + txt;
  $('fx').append(f); f.addEventListener('animationend', () => f.remove());
}

async function place(i, r, c) {
  const p = pieces[i]; let n = 0;
  p.s.forEach((row, a) => row.forEach((v, b) => { if (v) { grid[r + a][c + b] = p.h; n++; } }));
  p.used = true; p.el.classList.remove('src'); p.el.classList.add('used');
  render();
  p.s.forEach((row, a) => row.forEach((v, b) => { if (v) cells[(r + a) * N + c + b].classList.add('pop'); }));
  sfx.place(); buzz(12);

  const rows = [], cols = [];
  for (let k = 0; k < N; k++) {
    if (grid[k].every(Boolean)) rows.push(k);
    if (grid.every(row => row[k])) cols.push(k);
  }
  const lines = rows.length + cols.length;
  let gain = n;
  if (lines) {
    combo++;
    gain += lines * lines * 10 + (combo - 1) * 5;
    const clear = new Map(); // idx -> gecikme
    rows.forEach(k => { for (let j = 0; j < N; j++) clear.set(k * N + j, j * .03); });
    cols.forEach(k => { for (let j = 0; j < N; j++) clear.set(j * N + k, Math.min(clear.get(j * N + k) ?? 9, j * .03)); });
    clear.forEach((dl, idx) => {
      const d = cells[idx]; d.classList.remove('pop'); d.style.setProperty('--d', dl + 's'); d.classList.add('clr');
      if (grid[idx / N | 0][idx % N] !== 'wall') burst(idx, grid[idx / N | 0][idx % N]);
    });
    sfx.clear(lines); buzz(30);
    $('board').classList.remove('shake'); void $('board').offsetWidth; $('board').classList.add('shake');
    floatText('+' + gain, lines > 1 ? `${lines} ÇİZGİ` : combo > 1 ? `KOMBO x${combo}` : '');
    await wait(480);
    clear.forEach((_, idx) => { grid[idx / N | 0][idx % N] = null; });
    render();
  } else combo = 0;

  score += gain;
  if (score > best) { best = score; save('best', best); }
  hud();
  busy = false;
  after();
}

function after() {
  if (score >= cfg.target) {
    save('lvl', level + 1); sfx.win(); buzz(60);
    for (let k = 0; k < 40; k++) burst(rnd(N * N), HUES[rnd(HUES.length)]);
    return setTimeout(() => show(`Seviye ${level} Tamam! 🎉`, `Puan: ${score}`, `Seviye ${level + 1}`, () => startLevel(level + 1)), 500);
  }
  if (pieces.every(p => p.used)) newPieces(); else renderTray(false);
  if (!pieces.some(p => !p.used && fitsAnywhere(p.s))) {
    sfx.lose();
    setTimeout(() => show('Oyun Bitti 😢', `Puan: ${score} / Hedef: ${cfg.target}`, 'Tekrar Dene', () => startLevel(level)), 600);
  }
}

function show(t, p, b, fn) {
  $('mt').textContent = t; $('mp').textContent = p; $('mb').textContent = b;
  $('mb').onclick = () => { $('msg').classList.add('hidden'); fn(); };
  $('msg').classList.remove('hidden');
}

/* ---------- başlangıç ---------- */
$('snd').textContent = muted ? '🔇' : '🔊';
$('snd').onclick = () => { muted = !muted; save('mute', muted ? 1 : 0); try { localStorage.mute = muted ? '1' : '0' } catch (e) {} $('snd').textContent = muted ? '🔇' : '🔊'; };
resize(); build();
const lv = Math.max(1, load('lvl', 1));
startLevel(lv);
$('play').textContent = lv > 1 ? `Devam Et (Seviye ${lv})` : 'Oyna';
$('reset').style.display = lv > 1 ? '' : 'none';
$('play').onclick = () => { $('intro').classList.add('hidden'); tone(440, .1); };
$('reset').onclick = () => { save('lvl', 1); startLevel(1); $('intro').classList.add('hidden'); };

const sensBtns = [...document.querySelectorAll('#sens b')];
const setSens = v => { gain = v; save('sens', v); sensBtns.forEach(b => b.classList.toggle('on', +b.dataset.v === v)); };
sensBtns.forEach(b => b.onclick = () => setSens(+b.dataset.v));
setSens(gain);
