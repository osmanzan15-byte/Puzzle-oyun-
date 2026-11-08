const N = 8;
const COLORS = ['#f72585','#4cc9f0','#ffbe0b','#80ed99','#b5179e','#ff7b00','#4361ee'];
const SHAPES = [
  [[1]],[[1,1]],[[1],[1]],[[1,1,1]],[[1],[1],[1]],[[1,1,1,1]],[[1],[1],[1],[1]],
  [[1,1],[1,1]],[[1,1,1],[1,1,1],[1,1,1]],[[1,1],[1,0]],[[1,1],[0,1]],[[1,0],[1,1]],[[0,1],[1,1]],
  [[1,0],[1,0],[1,1]],[[1,1,1],[1,0,0]],[[0,1],[0,1],[1,1]],[[1,1,1],[0,0,1]],[[1,1,1],[0,1,0]]
];
// Seviye ayarları: hedef puan ve başlangıçtaki taş (engel) sayısı
const levelCfg = l => ({ target: 150 + (l - 1) * 100, walls: Math.min(2 + l * 2, 22), prefill: Math.min((l - 1) * 3, 16) });

const $ = id => document.getElementById(id);
const save = (k, v) => { try { localStorage[k] = v } catch (e) {} };
const load = (k, d) => { try { return +localStorage[k] || d } catch (e) { return d } };

let grid, level, score, best = load('best', 0), pieces, cfg, cells = [], drag = null;

function build() {
  $('board').innerHTML = '';
  cells = [];
  for (let i = 0; i < N * N; i++) { const d = document.createElement('div'); d.className = 'cell'; $('board').append(d); cells.push(d); }
}

function startLevel(l) {
  level = l; score = 0; cfg = levelCfg(l);
  grid = Array.from({ length: N }, () => Array(N).fill(null));
  const put = (v, n) => { while (n > 0) { const r = Math.random() * N | 0, c = Math.random() * N | 0; if (!grid[r][c]) { grid[r][c] = v; n--; } } };
  put('wall', cfg.walls);
  put(null, 0);
  let n = cfg.prefill;
  while (n > 0) { const r = Math.random() * N | 0, c = Math.random() * N | 0; if (!grid[r][c]) { grid[r][c] = COLORS[Math.random() * COLORS.length | 0]; n--; } }
  // dolu satır/sütun oluşmasın
  for (let i = 0; i < N; i++) { if (grid[i].every(Boolean)) grid[i][0] = null; if (grid.every(r => r[i])) grid[0][i] = null; }
  newPieces(); render(); hud();
}

function newPieces() {
  pieces = [0, 1, 2].map(() => ({ s: SHAPES[Math.random() * SHAPES.length | 0], c: COLORS[Math.random() * COLORS.length | 0], used: false }));
  // en az bir parça sığsın (kolay seviyelerde adil olsun)
  if (!pieces.some(p => fitsAnywhere(p.s))) { const small = SHAPES[Math.random() * 3 | 0]; pieces[0].s = small; }
  renderTray();
}

const fits = (s, r, c) => r >= 0 && c >= 0 && r + s.length <= N && c + s[0].length <= N &&
  s.every((row, i) => row.every((v, j) => !v || !grid[r + i][c + j]));
const fitsAnywhere = s => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(s, r, c)) return true; return false; };

function render() {
  grid.forEach((row, r) => row.forEach((v, c) => {
    const d = cells[r * N + c];
    d.className = 'cell' + (v ? (v === 'wall' ? ' wall' : ' f') : '');
    d.style.background = v && v !== 'wall' ? v : '';
  }));
}

function pieceEl(p) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.style.gridTemplateColumns = `repeat(${p.s[0].length},var(--c))`;
  p.s.forEach(row => row.forEach(v => {
    const d = document.createElement('div');
    d.className = v ? 'cell f' : 'cell e';
    if (v) d.style.background = p.c;
    el.append(d);
  }));
  return el;
}

function renderTray() {
  $('tray').innerHTML = '';
  pieces.forEach((p, i) => {
    const slot = document.createElement('div'); slot.className = 'slot';
    const el = pieceEl(p); if (p.used) el.classList.add('used');
    el.addEventListener('pointerdown', e => startDrag(e, i, el));
    slot.append(el); $('tray').append(slot);
  });
}

function hud() {
  $('level').textContent = level; $('score').textContent = score; $('best').textContent = best;
  $('target').textContent = cfg.target; $('bar').style.width = Math.min(100, score / cfg.target * 100) + '%';
}

function cellSize() { return cells[0].getBoundingClientRect().width + 3; }

function startDrag(e, i, src) {
  if (pieces[i].used || msgOpen() || !$('intro').classList.contains('hidden')) return;
  e.preventDefault();
  const p = pieces[i], el = pieceEl(p);
  el.classList.add('drag'); document.body.append(el);
  drag = { i, el, p, cs: cellSize(), r: -1, c: -1 };
  src.style.opacity = .3; drag.src = src;
  moveDrag(e);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag, { once: true });
}

function moveDrag(e) {
  if (!drag) return;
  const { el, p, cs } = drag, w = p.s[0].length * cs, h = p.s.length * cs;
  const x = e.clientX - w / 2, y = e.clientY - h - 40; // parmağın üstünde dursun
  el.style.left = x + 'px'; el.style.top = y + 'px';
  const b = cells[0].getBoundingClientRect();
  const c = Math.round((x - b.left) / cs), r = Math.round((y - b.top) / cs);
  drag.r = r; drag.c = c; preview();
}

function preview() {
  render();
  const { p, r, c } = drag, ok = fits(p.s, r, c);
  p.s.forEach((row, i) => row.forEach((v, j) => {
    const rr = r + i, cc = c + j;
    if (v && rr >= 0 && rr < N && cc >= 0 && cc < N) cells[rr * N + cc].classList.add(ok ? 'ok' : 'bad');
  }));
}

function endDrag() {
  window.removeEventListener('pointermove', moveDrag);
  const { el, p, r, c, src, i } = drag; drag = null;
  el.remove(); src.style.opacity = '';
  render();
  if (fits(p.s, r, c)) place(i, r, c);
}

function place(i, r, c) {
  const p = pieces[i]; let n = 0;
  p.s.forEach((row, a) => row.forEach((v, b) => { if (v) { grid[r + a][c + b] = p.c; n++; } }));
  p.used = true;
  // dolu satır/sütunları bul (engeller de sayılır ve temizlenir)
  const rows = [], cols = [];
  for (let k = 0; k < N; k++) {
    if (grid[k].every(Boolean)) rows.push(k);
    if (grid.every(row => row[k])) cols.push(k);
  }
  const lines = rows.length + cols.length;
  const clear = new Set();
  rows.forEach(k => { for (let j = 0; j < N; j++) clear.add(k * N + j); });
  cols.forEach(k => { for (let j = 0; j < N; j++) clear.add(j * N + k); });
  score += n + (lines ? lines * 10 * lines : 0);
  render(); clear.forEach(idx => cells[idx].classList.add('clr'));
  setTimeout(() => {
    clear.forEach(idx => { grid[idx / N | 0][idx % N] = null; });
    render(); after();
  }, lines ? 320 : 0);
  if (score > best) { best = score; save('best', best); }
  hud(); renderTray();
}

function after() {
  if (score >= cfg.target) { save('lvl', level + 1); return show(`Seviye ${level} Tamam! 🎉`, `Puan: ${score}`, `Seviye ${level + 1}`, () => startLevel(level + 1)); }
  if (pieces.every(p => p.used)) newPieces();
  if (!pieces.some(p => !p.used && fitsAnywhere(p.s)))
    show('Oyun Bitti 😢', `Puan: ${score} / Hedef: ${cfg.target}`, 'Tekrar Dene', () => startLevel(level));
}

const msgOpen = () => !$('msg').classList.contains('hidden');
function show(t, p, b, fn) {
  $('mt').textContent = t; $('mp').textContent = p; $('mb').textContent = b;
  $('mb').onclick = () => { $('msg').classList.add('hidden'); fn(); };
  $('msg').classList.remove('hidden');
}

build();
startLevel(Math.max(1, load('lvl', 1)));
const lv = load('lvl', 1);
$('play').textContent = lv > 1 ? `Devam Et (Seviye ${lv})` : 'Oyna';
$('reset').style.display = lv > 1 ? '' : 'none';
$('play').onclick = () => $('intro').classList.add('hidden');
$('reset').onclick = () => { save('lvl', 1); startLevel(1); $('intro').classList.add('hidden'); };
