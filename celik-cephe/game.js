'use strict';
/* ÇELİK CEPHE — orijinal bir gerçek zamanlı strateji oyunu (tarayıcıda çalışır) */
const TILE = 32, MW = 80, MH = 60, WW = MW * TILE, WH = MH * TILE;
const TEAMCOL = ['#3b82f6', '#ef4444'];
const TEAMDARK = ['#1e3a8a', '#7f1d1d'];

const BDEF = {
  yard:     { name: 'Ana Üs',   w: 3, h: 3, hp: 1200, cost: 0,   time: 0,   power: 0,   req: [] },
  power:    { name: 'Santral',  w: 2, h: 2, hp: 450,  cost: 300, time: 360, power: 120, req: ['yard'] },
  refinery: { name: 'Rafineri', w: 3, h: 2, hp: 700,  cost: 600, time: 600, power: -30, req: ['power'] },
  barracks: { name: 'Kışla',    w: 2, h: 2, hp: 550,  cost: 300, time: 420, power: -20, req: ['power'] },
  factory:  { name: 'Fabrika',  w: 3, h: 3, hp: 900,  cost: 800, time: 720, power: -40, req: ['refinery', 'barracks'] },
  turret:   { name: 'Taret',    w: 1, h: 1, hp: 450,  cost: 400, time: 420, power: -15, req: ['barracks'],
              range: 220, dmg: 14, rate: 28, bsp: 12 },
};
const UDEF = {
  inf:    { name: 'Piyade',    hp: 70,  speed: 1.5, cost: 100, time: 180, from: 'barracks', r: 7,  range: 120, dmg: 7,  rate: 20, bsp: 12, bm: 0.4, tm: 0.5 },
  rocket: { name: 'Roketatar', hp: 55,  speed: 1.3, cost: 250, time: 280, from: 'barracks', r: 7,  range: 190, dmg: 28, rate: 75, bsp: 7,  bm: 1.5, tm: 1.7 },
  tank:   { name: 'Tank',      hp: 300, speed: 1.9, cost: 700, time: 460, from: 'factory',  r: 13, range: 160, dmg: 32, rate: 50, bsp: 9,  splash: 28, heavy: true },
  harv:   { name: 'Toplayıcı', hp: 350, speed: 1.3, cost: 600, time: 560, from: 'factory',  r: 13, cap: 400, heavy: true },
};
const STRUCTS = ['power', 'refinery', 'barracks', 'factory', 'turret'];
const UNITS = ['inf', 'rocket', 'tank', 'harv'];

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const idx = (tx, ty) => ty * MW + tx;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const canvas = $('game'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
let G = null, cam = { x: 0, y: 0 }, mouse = { x: 0, y: 0, in: false, down: false, dx: 0, dy: 0 };
let paused = false, amoveMode = false, started = false, muted = false;
let miniTerrain = null, tileVar = null;

/* ---------------- ses ---------------- */
let ac = null; const lastSnd = {};
function snd(kind) {
  if (muted || !started) return;
  if (lastSnd[kind] && G.tick - lastSnd[kind] < 4) return;
  lastSnd[kind] = G.tick;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    const cfg = { shot: [380, 0.04, 'square', 0.04], boom: [90, 0.25, 'sawtooth', 0.09], ok: [660, 0.08, 'sine', 0.06], coin: [880, 0.07, 'triangle', 0.05] }[kind];
    o.type = cfg[2]; o.frequency.value = cfg[0];
    if (kind === 'boom') o.frequency.exponentialRampToValueAtTime(30, ac.currentTime + cfg[1]);
    g.gain.value = cfg[3]; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + cfg[1]);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + cfg[1]);
  } catch (e) { /* ses yok */ }
}

/* ---------------- oyun kurulumu ---------------- */
function mkTeam(id) {
  return { id, credits: 2500, prodB: null, q: { barracks: [], factory: [] }, power: 0, used: 0, low: false,
           ai: { wave: 0, next: 3600, size: 6, tick: 0 }, lastWarn: -9999 };
}

function newGame() {
  const rnd = mulberry32((Date.now() & 0xffffff) ^ 0x5bd1e995);
  G = { tick: 0, units: [], blds: [], bullets: [], parts: [], terrain: new Uint8Array(MW * MH), ore: new Int16Array(MW * MH),
        occ: new Uint8Array(MW * MH), teams: [mkTeam(0), mkTeam(1)], sel: [], nextId: 1, over: null, placing: null,
        groups: {}, msgs: [], rnd };
  genMap(rnd);
  const P = { x: 8, y: 44 }, E = { x: 68, y: 12 };
  setupBase(0, P.x, P.y, 1);
  setupBase(1, E.x, E.y, -1);
  cam.x = (P.x + 1.5) * TILE - canvas.width / 2; cam.y = (P.y + 1.5) * TILE - canvas.height / 2;
  clampCam();
  prerenderMini();
  msg('Üssünü kur, maden topla, ordunu üret!');
}

function genMap(rnd) {
  const T = G.terrain;
  tileVar = new Uint8Array(MW * MH);
  for (let i = 0; i < MW * MH; i++) tileVar[i] = (rnd() * 4) | 0;
  const blob = (val, n, size) => {
    for (let c = 0; c < n; c++) {
      let x = (rnd() * MW) | 0, y = (rnd() * MH) | 0;
      const len = 5 + ((rnd() * size) | 0);
      for (let i = 0; i < len; i++) {
        if (x >= 0 && y >= 0 && x < MW && y < MH) T[idx(x, y)] = val;
        x += ((rnd() * 3) | 0) - 1; y += ((rnd() * 3) | 0) - 1;
      }
    }
  };
  blob(1, 45, 14); blob(2, 7, 40);
  const clear = (cx, cy, r) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) T[idx(x, y)] = 0; };
  clear(9, 45, 9); clear(69, 13, 9);
  const field = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1 && T[idx(x, y)] === 0) G.ore[idx(x, y)] = 600 + ((rnd() * 400) | 0);
    }
  };
  field(17, 50, 3); field(60, 8, 3);
  field(40, 30, 3); field(22, 22, 3); field(58, 38, 3); field(14, 12, 2); field(66, 50, 2); field(40, 8, 2); field(40, 52, 2);
  for (let i = 0; i < 8; i++) clear(40 + ((rnd() * 4) | 0) - 2, 30 + ((rnd() * 4) | 0) - 2, 0);
}

function setupBase(team, bx, by, dir) {
  addBuilding(team, 'yard', bx, by);
  addBuilding(team, 'power', bx + (dir > 0 ? 4 : -3), by);
  const rf = addBuilding(team, 'refinery', bx + (dir > 0 ? 0 : -1), by + (dir > 0 ? 4 : 4));
  spawnUnitAt(team, 'harv', (rf.tx + 1.5) * TILE, (rf.ty + rf.h + 1) * TILE);
}

function addBuilding(team, type, tx, ty) {
  const d = BDEF[type];
  const b = { id: G.nextId++, kind: 'b', type, team, tx, ty, w: d.w, h: d.h, hp: d.hp, maxhp: d.hp, def: d, cd: 0, dead: false,
              x: (tx + d.w / 2) * TILE, y: (ty + d.h / 2) * TILE, angle: 0, flash: 0, auto: null };
  G.blds.push(b); rebuildOcc(); calcPower();
  return b;
}
function rebuildOcc() {
  G.occ.fill(0);
  for (const b of G.blds) if (!b.dead) for (let y = b.ty; y < b.ty + b.h; y++) for (let x = b.tx; x < b.tx + b.w; x++) G.occ[idx(x, y)] = 1;
}
function calcPower() {
  for (const T of G.teams) { T.power = 0; T.used = 0; }
  for (const b of G.blds) if (!b.dead) { const p = b.def.power; if (p > 0) G.teams[b.team].power += p; else G.teams[b.team].used -= p; }
  for (const T of G.teams) T.low = T.used > T.power;
}

function spawnUnitAt(team, type, x, y) {
  const d = UDEF[type];
  const u = { id: G.nextId++, kind: 'u', type, team, x, y, hp: d.hp, maxhp: d.hp, def: d, r: d.r, angle: 0, path: [], order: null,
              goal: null, cd: 0, dead: false, load: 0, state: 'seek', ot: -1, mt: 0, auto: null, repath: 0, wave: false, turret: 0 };
  G.units.push(u);
  return u;
}

function hasB(team, type) { return G.blds.some(b => b.team === team && b.type === type && !b.dead); }
function reqOK(team, type) { return BDEF[type].req.every(r => hasB(team, r)); }

/* ---------------- yol bulma (A*) ---------------- */
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const gS = new Float32Array(MW * MH), fS = new Float32Array(MW * MH), par = new Int32Array(MW * MH);
const stampA = new Uint32Array(MW * MH), closedA = new Uint32Array(MW * MH);
let stamp = 0;
const blockedAt = i => G.terrain[i] !== 0 || G.occ[i] !== 0;
function hcost(a, b) { const dx = Math.abs((a % MW) - (b % MW)), dy = Math.abs(((a / MW) | 0) - ((b / MW) | 0)); return dx + dy - 0.586 * Math.min(dx, dy); }

function nearestFree(tx, ty) {
  if (!blockedAt(idx(tx, ty))) return [tx, ty];
  for (let r = 1; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = tx + dx, y = ty + dy;
    if (x >= 0 && y >= 0 && x < MW && y < MH && !blockedAt(idx(x, y))) return [x, y];
  }
  return null;
}

function astar(s, g) {
  stamp++;
  const H = [];
  const push = i => { H.push(i); let c = H.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (fS[H[p]] <= fS[H[c]]) break; [H[p], H[c]] = [H[c], H[p]]; c = p; } };
  const pop = () => {
    const top = H[0], last = H.pop();
    if (H.length) { H[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < H.length && fS[H[l]] < fS[H[m]]) m = l; if (r < H.length && fS[H[r]] < fS[H[m]]) m = r; if (m === c) break; [H[m], H[c]] = [H[c], H[m]]; c = m; } }
    return top;
  };
  gS[s] = 0; stampA[s] = stamp; par[s] = -1; fS[s] = hcost(s, g); push(s);
  while (H.length) {
    const c = pop();
    if (closedA[c] === stamp) continue;
    closedA[c] = stamp;
    if (c === g) break;
    const cx = c % MW, cy = (c / MW) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const n = ny * MW + nx;
      if (closedA[n] === stamp || blockedAt(n)) continue;
      if (k >= 4 && (blockedAt(cy * MW + nx) || blockedAt(ny * MW + cx))) continue;
      const ng = gS[c] + (k >= 4 ? 1.414 : 1);
      if (stampA[n] !== stamp || ng < gS[n]) { stampA[n] = stamp; gS[n] = ng; par[n] = c; fS[n] = ng + hcost(n, g); push(n); }
    }
  }
  if (closedA[g] !== stamp) return null;
  const out = [];
  for (let c = g; c !== -1 && c !== s; c = par[c]) out.push(c);
  return out.reverse();
}

function pathTo(u, x, y) {
  const sx = clamp((u.x / TILE) | 0, 0, MW - 1), sy = clamp((u.y / TILE) | 0, 0, MH - 1);
  const gx = clamp((x / TILE) | 0, 0, MW - 1), gy = clamp((y / TILE) | 0, 0, MH - 1);
  const f = nearestFree(gx, gy);
  if (!f) return null;
  if (f[0] === sx && f[1] === sy) return f[0] === gx && f[1] === gy ? [{ x, y }] : [];
  const p = astar(idx(sx, sy), idx(f[0], f[1]));
  if (!p) return null;
  const w = p.map(i => ({ x: ((i % MW) + 0.5) * TILE, y: (((i / MW) | 0) + 0.5) * TILE }));
  if (f[0] === gx && f[1] === gy && w.length) w[w.length - 1] = { x, y };
  return w;
}
function setGoal(u, x, y) {
  u.goal = { x, y };
  u.path = pathTo(u, x, y) || [];
  u.repath = 0;
}
function moveAlong(u) {
  if (!u.path.length) return true;
  const p = u.path[0];
  const ti = idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1));
  if (G.occ[ti] && u.goal) { setGoal(u, u.goal.x, u.goal.y); return !u.path.length; }
  const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy), sp = u.def.speed * (u.team === 0 ? 1 : 1);
  u.angle = Math.atan2(dy, dx);
  if (d <= sp) { u.x = p.x; u.y = p.y; u.path.shift(); return !u.path.length; }
  u.x += (dx / d) * sp; u.y += (dy / d) * sp;
  return false;
}

/* ---------------- savaş ---------------- */
function distTo(a, b) {
  if (b.kind === 'b') {
    const cx = clamp(a.x, b.tx * TILE, (b.tx + b.w) * TILE), cy = clamp(a.y, b.ty * TILE, (b.ty + b.h) * TILE);
    return Math.hypot(a.x - cx, a.y - cy);
  }
  return Math.hypot(a.x - b.x, a.y - b.y) - b.r;
}
function findTarget(e, range) {
  let best = null, bd = range;
  for (const u of G.units) if (!u.dead && u.team !== e.team) { const d = distTo(e, u); if (d < bd) { bd = d; best = u; } }
  for (const b of G.blds) if (!b.dead && b.team !== e.team) { const d = distTo(e, b); if (d < bd) { bd = d; best = b; } }
  return best;
}
function acquire(e) {
  const rng = e.def.range + (e.kind === 'u' ? 60 : 0);
  if ((G.tick + e.id) % 10 === 0 || (e.auto && e.auto.dead)) e.auto = findTarget(e, rng);
  if (e.auto && (e.auto.dead || distTo(e, e.auto) > rng + 20)) e.auto = null;
  return e.auto;
}
function fire(a, t) {
  const d = a.def;
  a.cd = d.rate;
  G.bullets.push({ x: a.x, y: a.y, t, dmg: d.dmg, sp: d.bsp, team: a.team, splash: d.splash || 0, src: d });
  a.angle = Math.atan2(t.y - a.y, t.x - a.x);
  if (a.kind === 'u') a.turret = a.angle;
  puff(a.x + Math.cos(a.angle) * 12, a.y + Math.sin(a.angle) * 12, 3, '#fde68a', 1.2, 8);
  if (onScreen(a.x, a.y)) snd('shot');
}
function engage(u, t) {
  const d = distTo(u, t);
  if (d <= u.def.range) {
    u.path = []; u.angle = Math.atan2(t.y - u.y, t.x - u.x); u.turret = u.angle;
    if (u.cd <= 0) fire(u, t);
  } else {
    if (--u.repath <= 0 || !u.path.length) { setGoal(u, t.x, t.y); u.repath = 25; }
    moveAlong(u);
  }
}
function damage(e, d, srcDef, fromTeam) {
  if (e.dead) return;
  if (srcDef) {
    if (e.kind === 'b' && srcDef.bm) d *= srcDef.bm;
    if (e.kind === 'u' && e.def.heavy && srcDef.tm) d *= srcDef.tm;
  }
  e.hp -= d;
  if (e.team === 0 && G.tick - G.teams[0].lastWarn > 720) { G.teams[0].lastWarn = G.tick; msg('⚠ Birliklerimiz saldırı altında!'); }
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.dead = true;
  if (e.kind === 'b') {
    for (let i = 0; i < 28; i++) puff(e.x + (Math.random() - 0.5) * e.w * TILE, e.y + (Math.random() - 0.5) * e.h * TILE, 5 + Math.random() * 7, Math.random() < 0.5 ? '#f97316' : '#fbbf24', 2, 30 + Math.random() * 20);
    snd('boom');
  } else {
    for (let i = 0; i < 9; i++) puff(e.x, e.y, 3 + Math.random() * 4, Math.random() < 0.5 ? '#f97316' : '#78716c', 1.6, 22);
    snd('boom');
  }
}
function puff(x, y, size, col, spd, life) {
  if (G.parts.length > 600) return;
  const a = Math.random() * 6.283, s = Math.random() * spd;
  G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, col, size });
}
function updateBullets() {
  for (const b of G.bullets) {
    if (b.t.dead) { b.done = true; continue; }
    const dx = b.t.x - b.x, dy = b.t.y - b.y, d = Math.hypot(dx, dy);
    if (d <= b.sp) {
      b.done = true;
      damage(b.t, b.dmg, b.src, b.team);
      puff(b.t.x, b.t.y, 4, '#fde047', 1.5, 12);
      if (b.splash) for (const u of G.units) if (!u.dead && u.team !== b.team && u !== b.t && Math.hypot(u.x - b.t.x, u.y - b.t.y) < b.splash) damage(u, b.dmg * 0.5, b.src, b.team);
    } else { b.x += (dx / d) * b.sp; b.y += (dy / d) * b.sp; }
  }
  G.bullets = G.bullets.filter(b => !b.done);
}

/* ---------------- birim mantığı ---------------- */
function nearestOre(u) {
  let best = -1, bd = 1e9;
  for (let i = 0; i < MW * MH; i++) if (G.ore[i] > 0) {
    const x = ((i % MW) + 0.5) * TILE, y = (((i / MW) | 0) + 0.5) * TILE, d = Math.hypot(x - u.x, y - u.y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function nearestRefinery(u) {
  let best = null, bd = 1e9;
  for (const b of G.blds) if (!b.dead && b.team === u.team && b.type === 'refinery') { const d = Math.hypot(b.x - u.x, b.y - u.y); if (d < bd) { bd = d; best = b; } }
  return best;
}
function updateHarv(u) {
  if (u.order && u.order.t === 'move') {
    if (moveAlong(u)) { u.order = null; u.state = 'seek'; u.pathSet = false; }
    return;
  }
  if (u.wait > 0) { u.wait--; return; }
  if (u.state === 'seek') {
    if (u.load >= u.def.cap) { u.state = 'return'; u.pathSet = false; return; }
    if (u.ot < 0 || G.ore[u.ot] <= 0) { u.ot = nearestOre(u); u.pathSet = false; if (u.ot < 0) { u.wait = 120; return; } }
    const ox = ((u.ot % MW) + 0.5) * TILE, oy = (((u.ot / MW) | 0) + 0.5) * TILE;
    if (!u.pathSet) { setGoal(u, ox, oy); u.pathSet = true; if (!u.path.length && Math.hypot(u.x - ox, u.y - oy) > TILE) { u.ot = -1; u.wait = 60; return; } }
    if (moveAlong(u) || Math.hypot(u.x - ox, u.y - oy) < TILE * 0.6) { u.state = 'mine'; u.mt = 0; u.path = []; }
  } else if (u.state === 'mine') {
    if (G.ore[u.ot] <= 0) { u.state = u.load > 0 && u.load >= u.def.cap * 0.5 ? 'return' : 'seek'; u.pathSet = false; u.ot = -1; return; }
    if (++u.mt >= 12) {
      u.mt = 0;
      const take = Math.min(20, G.ore[u.ot], u.def.cap - u.load);
      G.ore[u.ot] -= take; u.load += take;
      puff(u.x, u.y, 2.5, '#facc15', 1, 14);
      if (u.load >= u.def.cap) { u.state = 'return'; u.pathSet = false; }
    }
  } else if (u.state === 'return') {
    const rf = nearestRefinery(u);
    if (!rf) { u.wait = 90; return; }
    if (distTo(u, rf) < TILE * 1.3) {
      G.teams[u.team].credits += u.load; if (u.team === 0 && u.load) snd('coin');
      u.load = 0; rf.flash = 20; u.state = 'seek'; u.pathSet = false; return;
    }
    if (!u.pathSet) { setGoal(u, (rf.tx + rf.w / 2) * TILE, (rf.ty + rf.h + 0.5) * TILE); u.pathSet = true; }
    if (moveAlong(u)) {
      if (distTo(u, rf) >= TILE * 1.3) u.pathSet = false;
    }
  }
}
function updateUnit(u) {
  if (u.cd > 0) u.cd--;
  if (u.type === 'harv') return updateHarv(u);
  const o = u.order;
  if (o && o.t === 'attack') {
    if (o.target.dead) { u.order = null; u.path = []; } else engage(u, o.target);
    return;
  }
  if (o && (o.t === 'move' || o.t === 'amove')) {
    if (o.t === 'amove') { const t = acquire(u); if (t) { engage(u, t); return; } }
    if (moveAlong(u)) u.order = null;
    return;
  }
  const t = acquire(u);
  if (t) engage(u, t);
}
function updateBuilding(b) {
  if (b.cd > 0) b.cd--;
  if (b.flash > 0) b.flash--;
  if (b.type === 'turret') {
    const t = acquire(b);
    if (t) {
      b.angle = Math.atan2(t.y - b.y, t.x - b.x);
      if (b.cd <= 0 && distTo(b, t) <= b.def.range) { fire(b, t); if (G.teams[b.team].low) b.cd *= 2; }
    }
  }
  if (b.hp < b.maxhp * 0.35 && G.tick % 8 === 0) puff(b.x + (Math.random() - 0.5) * b.w * TILE * 0.6, b.y, 5, '#44403c', 0.6, 40);
}
function separate() {
  const U = G.units;
  for (let i = 0; i < U.length; i++) {
    const a = U[i];
    for (let j = i + 1; j < U.length; j++) {
      const b = U[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy);
      if (d >= min || d === 0) continue;
      const push = (min - d) * 0.25, nx = dx / d, ny = dy / d;
      nudge(a, -nx * push, -ny * push); nudge(b, nx * push, ny * push);
    }
  }
}
function nudge(u, dx, dy) {
  const nx = u.x + dx, ny = u.y + dy;
  const i = idx(clamp((nx / TILE) | 0, 0, MW - 1), clamp((ny / TILE) | 0, 0, MH - 1));
  if (!blockedAt(i)) { u.x = nx; u.y = ny; }
}

/* ---------------- üretim ---------------- */
function startStruct(team, type) {
  const T = G.teams[team], d = BDEF[type];
  if (T.prodB || T.credits < d.cost || !reqOK(team, type)) return false;
  T.credits -= d.cost; T.prodB = { type, p: 0, ready: false };
  return true;
}
function queueUnit(team, type) {
  const T = G.teams[team], d = UDEF[type], q = T.q[d.from];
  if (q.length >= 6 || T.credits < d.cost || !hasB(team, d.from)) return false;
  T.credits -= d.cost; q.push({ type, p: 0 });
  return true;
}
function freeSpotNear(b) {
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= b.h + r; dy++) for (let dx = -r; dx <= b.w + r; dx++) {
    const x = b.tx + dx, y = b.ty + dy;
    if (x < 0 || y < 0 || x >= MW || y >= MH || blockedAt(idx(x, y))) continue;
    if (G.units.some(u => !u.dead && Math.hypot(u.x - (x + 0.5) * TILE, u.y - (y + 0.5) * TILE) < u.r + 8)) continue;
    return { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
  }
  return { x: b.x, y: (b.ty + b.h + 1) * TILE };
}
function prodTick(T) {
  const spd = T.low ? 0.5 : 1;
  if (T.prodB && !T.prodB.ready) {
    T.prodB.p += spd;
    if (T.prodB.p >= BDEF[T.prodB.type].time) { T.prodB.ready = true; if (T.id === 0) { msg('Yapı hazır: ' + BDEF[T.prodB.type].name); snd('ok'); } }
  }
  for (const k of ['barracks', 'factory']) {
    const q = T.q[k];
    if (!q.length) continue;
    const prods = G.blds.filter(b => b.team === T.id && b.type === k && !b.dead);
    if (!prods.length) continue;
    const it = q[0];
    it.p += spd;
    if (it.p >= UDEF[it.type].time) {
      q.shift();
      const pb = prods[(G.tick / 7 | 0) % prods.length], pos = freeSpotNear(pb);
      const u = spawnUnitAt(T.id, it.type, pos.x, pos.y);
      if (T.id === 0) { msg(UDEF[it.type].name + ' hazır'); snd('ok'); }
      if (T.id === 0 && it.type !== 'harv') { u.order = { t: 'move' }; setGoal(u, pos.x + 20, pos.y + 40); }
    }
  }
}
function canPlace(team, type, tx, ty) {
  const d = BDEF[type];
  if (tx < 0 || ty < 0 || tx + d.w > MW || ty + d.h > MH) return false;
  for (let y = ty; y < ty + d.h; y++) for (let x = tx; x < tx + d.w; x++) if (blockedAt(idx(x, y))) return false;
  for (const u of G.units) if (!u.dead && u.x > tx * TILE - u.r && u.x < (tx + d.w) * TILE + u.r && u.y > ty * TILE - u.r && u.y < (ty + d.h) * TILE + u.r) return false;
  return G.blds.some(b => {
    if (b.dead || b.team !== team) return false;
    const dx = Math.max(b.tx - (tx + d.w), tx - (b.tx + b.w), 0), dy = Math.max(b.ty - (ty + d.h), ty - (b.ty + b.h), 0);
    return Math.max(dx, dy) <= 5;
  });
}
function placeBuilding(team, tx, ty) {
  const T = G.teams[team], p = T.prodB;
  if (!p || !p.ready || !canPlace(team, p.type, tx, ty)) return false;
  const b = addBuilding(team, p.type, tx, ty);
  T.prodB = null;
  if (p.type === 'refinery') { const pos = freeSpotNear(b); spawnUnitAt(team, 'harv', pos.x, pos.y); }
  if (team === 0) snd('ok');
  return true;
}

/* ---------------- yapay zekâ ---------------- */
function aiTick(T) {
  const id = T.id, cnt = t => G.blds.filter(b => b.team === id && b.type === t && !b.dead).length;
  const yard = G.blds.find(b => b.team === id && b.type === 'yard' && !b.dead) || G.blds.find(b => b.team === id && !b.dead);
  if (!yard) return;
  // yapı yerleştir
  if (T.prodB && T.prodB.ready) {
    for (let i = 0; i < 60; i++) {
      const tx = yard.tx + ((G.rnd() * 18) | 0) - 7, ty = yard.ty + ((G.rnd() * 18) | 0) - 7;
      if (placeBuilding(id, tx, ty)) break;
    }
  }
  // yapı sırası
  if (!T.prodB) {
    const pw = cnt('power'), rf = cnt('refinery'), br = cnt('barracks'), fa = cnt('factory'), tu = cnt('turret');
    let want = null;
    if (T.used + 25 > T.power) want = 'power';
    else if (rf < 1) want = 'refinery';
    else if (br < 1) want = 'barracks';
    else if (rf < 2) want = 'refinery';
    else if (fa < 1) want = 'factory';
    else if (tu < 4) want = 'turret';
    else if (fa < 2 && T.credits > 1400) want = 'factory';
    else if (br < 2 && T.credits > 1000) want = 'barracks';
    else if (rf < 3 && T.credits > 1600) want = 'refinery';
    else if (tu < 8 && T.credits > 1200) want = 'turret';
    if (want && reqOK(id, want)) startStruct(id, want);
  }
  // birim üretimi
  const harvs = G.units.filter(u => u.team === id && u.type === 'harv' && !u.dead).length + T.q.factory.filter(i => i.type === 'harv').length;
  if (hasB(id, 'factory') && harvs < Math.min(4, cnt('refinery') * 2)) queueUnit(id, 'harv');
  else if (hasB(id, 'factory') && T.q.factory.length < 2) queueUnit(id, 'tank');
  if (hasB(id, 'barracks') && T.q.barracks.length < 2) queueUnit(id, G.rnd() < 0.5 ? 'inf' : 'rocket');
  // saldırı dalgası
  const army = G.units.filter(u => u.team === id && !u.dead && u.type !== 'harv');
  const A = T.ai;
  if (G.tick >= A.next && army.length >= A.size) {
    A.wave++; A.size += 2; A.next = G.tick + 3000;
    for (const u of army) u.wave = true;
    msg('⚠ Düşman saldırı dalgası yaklaşıyor!');
  }
  for (const u of army) if (u.wave && !u.order) {
    const tgt = findTarget(u, 99999);
    if (tgt) { u.order = { t: 'amove' }; setGoal(u, tgt.x, tgt.y); }
  }
}

/* ---------------- ana güncelleme ---------------- */
function update() {
  G.tick++;
  for (const u of G.units) if (!u.dead) updateUnit(u);
  for (const b of G.blds) if (!b.dead) updateBuilding(b);
  separate();
  updateBullets();
  for (const p of G.parts) { p.x += p.vx; p.y += p.vy; p.life--; }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const T of G.teams) prodTick(T);
  if (G.tick % 20 === 0) aiTick(G.teams[1]);
  const hadB = G.blds.some(b => b.dead);
  G.units = G.units.filter(u => !u.dead);
  if (hadB) { G.blds = G.blds.filter(b => !b.dead); rebuildOcc(); calcPower(); }
  G.sel = G.sel.filter(e => !e.dead);
  G.msgs = G.msgs.filter(m => G.tick - m.t < 300);
  if (G.tick % 30 === 0 && !G.over) {
    const alive = t => G.blds.some(b => b.team === t);
    if (!alive(1)) endGame('win'); else if (!alive(0)) endGame('lose');
  }
}
function msg(text) { G.msgs.push({ text, t: G.tick }); }
function endGame(r) {
  G.over = r;
  $('ovTitle').textContent = r === 'win' ? 'ZAFER!' : 'YENİLGİ';
  $('ovText').innerHTML = r === 'win' ? 'Kızıl Pakt\'ın üssünü yok ettin.' : 'Üssün yok edildi.';
  $('ovBtn').textContent = 'Tekrar Oyna';
  $('overlay').classList.remove('hide');
}

/* ---------------- girdi ---------------- */
const screenToWorld = (sx, sy) => ({ x: sx + cam.x, y: sy + cam.y });
function clampCam() { cam.x = clamp(cam.x, 0, Math.max(0, WW - canvas.width)); cam.y = clamp(cam.y, 0, Math.max(0, WH - canvas.height)); }
const onScreen = (x, y) => x > cam.x - 40 && y > cam.y - 40 && x < cam.x + canvas.width + 40 && y < cam.y + canvas.height + 40;

function pickEntity(wx, wy, team) {
  let best = null, bd = 1e9;
  for (const u of G.units) if (!u.dead && (team === undefined || u.team === team)) { const d = Math.hypot(u.x - wx, u.y - wy); if (d < u.r + 5 && d < bd) { bd = d; best = u; } }
  if (best) return best;
  for (const b of G.blds) if (!b.dead && (team === undefined || b.team === team) && wx >= b.tx * TILE && wx < (b.tx + b.w) * TILE && wy >= b.ty * TILE && wy < (b.ty + b.h) * TILE) return b;
  return null;
}
function myUnits() { return G.sel.filter(e => e.kind === 'u' && e.team === 0); }
function issueOrder(wx, wy) {
  const us = myUnits();
  if (!us.length) return;
  const tgt = pickEntity(wx, wy, 1);
  if (tgt) { for (const u of us) if (u.type !== 'harv') { u.order = { t: 'attack', target: tgt }; u.path = []; } snd('ok'); return; }
  const ti = idx(clamp((wx / TILE) | 0, 0, MW - 1), clamp((wy / TILE) | 0, 0, MH - 1));
  const cols = Math.ceil(Math.sqrt(us.length));
  us.forEach((u, i) => {
    const ox = ((i % cols) - (cols - 1) / 2) * 26, oy = (((i / cols) | 0) - (cols - 1) / 2) * 26;
    if (u.type === 'harv' && G.ore[ti] > 0) { u.order = null; u.ot = ti; u.state = 'seek'; u.pathSet = false; u.wait = 0; return; }
    u.order = { t: amoveMode ? 'amove' : 'move' };
    setGoal(u, wx + ox, wy + oy);
  });
  snd('ok');
}
function selectBox(x0, y0, x1, y1, add) {
  const a = screenToWorld(Math.min(x0, x1), Math.min(y0, y1)), b = screenToWorld(Math.max(x0, x1), Math.max(y0, y1));
  const small = Math.abs(x1 - x0) < 5 && Math.abs(y1 - y0) < 5;
  let found = [];
  if (small) { const e = pickEntity((a.x + b.x) / 2, (a.y + b.y) / 2, 0); if (e) found = [e]; }
  else found = G.units.filter(u => !u.dead && u.team === 0 && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y);
  if (add) { for (const e of found) if (!G.sel.includes(e)) G.sel.push(e); } else G.sel = found;
}

canvas.addEventListener('mousedown', e => {
  if (!started || G.over) return;
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, w = screenToWorld(x, y);
  if (e.button === 0) {
    if (G.placing) { const tx = (w.x / TILE) | 0, ty = (w.y / TILE) | 0; if (placeBuilding(0, tx, ty)) G.placing = null; return; }
    if (amoveMode) { issueOrder(w.x, w.y); amoveMode = false; return; }
    mouse.down = true; mouse.dx = x; mouse.dy = y;
  } else if (e.button === 2) {
    if (G.placing) { G.placing = null; return; }
    amoveMode = false; issueOrder(w.x, w.y);
  }
});
window.addEventListener('mouseup', e => {
  if (!mouse.down) return;
  mouse.down = false;
  const r = canvas.getBoundingClientRect();
  selectBox(mouse.dx, mouse.dy, e.clientX - r.left, e.clientY - r.top, e.shiftKey);
  updateInfo();
});
canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.in = true; });
canvas.addEventListener('mouseleave', () => { mouse.in = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
mini.addEventListener('contextmenu', e => e.preventDefault());

function miniPos(e) { const r = mini.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * WW, y: ((e.clientY - r.top) / r.height) * WH }; }
let miniDrag = false;
mini.addEventListener('mousedown', e => {
  if (!started) return;
  const p = miniPos(e);
  if (e.button === 2) { issueOrder(p.x, p.y); return; }
  miniDrag = true; cam.x = p.x - canvas.width / 2; cam.y = p.y - canvas.height / 2; clampCam();
});
window.addEventListener('mousemove', e => { if (miniDrag) { const p = miniPos(e); cam.x = p.x - canvas.width / 2; cam.y = p.y - canvas.height / 2; clampCam(); } });
window.addEventListener('mouseup', () => { miniDrag = false; });

const keys = {};
window.addEventListener('keydown', e => {
  if (!started) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'escape') { G.placing = null; amoveMode = false; }
  else if (k === 'p') paused = !paused;
  else if (k === 'a' && myUnits().length) amoveMode = true;
  else if (k === 's') { for (const u of myUnits()) { u.order = null; u.path = []; } }
  else if (k === 'x') { for (const b of G.sel) if (b.kind === 'b' && b.team === 0 && b.type !== 'yard') { G.teams[0].credits += b.def.cost >> 1; kill(b); } }
  else if (k === 'h') { const y = G.blds.find(b => b.team === 0 && b.type === 'yard'); if (y) { cam.x = y.x - canvas.width / 2; cam.y = y.y - canvas.height / 2; clampCam(); } }
  else if (k === 'm') muted = !muted;
  else if (/^[1-9]$/.test(k)) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); G.groups[k] = G.sel.filter(x => x.kind === 'u'); msg('Grup ' + k + ' atandı'); }
    else if (G.groups[k]) { G.sel = G.groups[k].filter(x => !x.dead); updateInfo(); }
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

/* ---------------- arayüz ---------------- */
const btnEls = {};
function buildUI() {
  const mk = (type, def, parent, isStruct) => {
    const el = document.createElement('div');
    el.className = 'btn';
    el.innerHTML = `<div class="n">${def.name}</div><div class="c">$${def.cost}</div><div class="s"></div><div class="p"></div>`;
    el.addEventListener('click', () => { if (started && !G.over) (isStruct ? clickStruct(type) : clickUnit(type)); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); if (started && !G.over) (isStruct ? cancelStruct(type) : cancelUnit(type)); });
    parent.appendChild(el);
    btnEls[type] = { el, s: el.querySelector('.s'), p: el.querySelector('.p') };
  };
  for (const t of STRUCTS) mk(t, BDEF[t], $('bld'), true);
  for (const t of UNITS) mk(t, UDEF[t], $('unt'), false);
}
function clickStruct(type) {
  const T = G.teams[0];
  if (T.prodB && T.prodB.type === type && T.prodB.ready) { G.placing = { type }; return; }
  if (!startStruct(0, type)) msg(T.prodB ? 'Başka bir yapı üretiliyor' : T.credits < BDEF[type].cost ? 'Yetersiz kredi' : 'Gereksinimler eksik');
}
function cancelStruct(type) {
  const T = G.teams[0];
  if (T.prodB && T.prodB.type === type) { T.credits += BDEF[type].cost; T.prodB = null; G.placing = null; }
}
function clickUnit(type) { if (!queueUnit(0, type)) msg(G.teams[0].credits < UDEF[type].cost ? 'Yetersiz kredi' : 'Üretim binası gerekli'); }
function cancelUnit(type) {
  const q = G.teams[0].q[UDEF[type].from];
  for (let i = q.length - 1; i >= 0; i--) if (q[i].type === type) { G.teams[0].credits += UDEF[type].cost; q.splice(i, 1); return; }
}
function updateUI() {
  const T = G.teams[0];
  $('cr').textContent = Math.floor(T.credits);
  $('pw').textContent = T.used + '/' + T.power;
  $('pw').className = T.low ? 'low' : '';
  for (const t of STRUCTS) {
    const e = btnEls[t], p = T.prodB, mine = p && p.type === t;
    const ok = reqOK(0, t) && (!p || mine);
    e.el.classList.toggle('dis', !ok);
    e.el.classList.toggle('ready', !!(mine && p.ready));
    e.s.textContent = mine ? (p.ready ? 'HAZIR' : '') : '';
    e.p.style.width = mine ? Math.min(100, (p.p / BDEF[t].time) * 100) + '%' : '0';
  }
  for (const t of UNITS) {
    const e = btnEls[t], d = UDEF[t], q = T.q[d.from], n = q.filter(i => i.type === t).length;
    e.el.classList.toggle('dis', !hasB(0, d.from));
    e.s.textContent = n ? 'x' + n : '';
    e.p.style.width = q.length && q[0].type === t ? Math.min(100, (q[0].p / d.time) * 100) + '%' : '0';
  }
}
function updateInfo() {
  const s = G.sel;
  if (!s.length) { $('info').textContent = 'Birim seçilmedi'; return; }
  if (s.length === 1) { const e = s[0]; $('info').innerHTML = `<b>${e.def.name}</b><br>Can: ${Math.ceil(e.hp)} / ${e.maxhp}${e.type === 'harv' ? '<br>Yük: ' + e.load : ''}`; return; }
  const c = {};
  for (const e of s) c[e.def.name] = (c[e.def.name] || 0) + 1;
  $('info').innerHTML = '<b>' + s.length + ' seçili</b><br>' + Object.entries(c).map(([k, v]) => k + ' ×' + v).join(', ');
}

/* ---------------- çizim ---------------- */
const GRASS = ['#3d6b2a', '#41722d', '#386526', '#3f6d2c'];
function drawTerrain() {
  const x0 = Math.max(0, (cam.x / TILE) | 0), y0 = Math.max(0, (cam.y / TILE) | 0);
  const x1 = Math.min(MW - 1, ((cam.x + canvas.width) / TILE) | 0), y1 = Math.min(MH - 1, ((cam.y + canvas.height) / TILE) | 0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y), px = x * TILE - cam.x, py = y * TILE - cam.y, t = G.terrain[i];
    if (t === 2) { ctx.fillStyle = (x + y + (G.tick >> 5)) % 2 ? '#1d4e89' : '#1f5694'; ctx.fillRect(px, py, TILE, TILE); continue; }
    ctx.fillStyle = GRASS[tileVar[i]]; ctx.fillRect(px, py, TILE, TILE);
    if (t === 1) {
      ctx.fillStyle = '#5b6068'; ctx.beginPath(); ctx.moveTo(px + 3, py + TILE - 3); ctx.lineTo(px + 9, py + 5); ctx.lineTo(px + 22, py + 3); ctx.lineTo(px + TILE - 3, py + TILE - 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7b818b'; ctx.beginPath(); ctx.moveTo(px + 9, py + 5); ctx.lineTo(px + 22, py + 3); ctx.lineTo(px + 17, py + 15); ctx.closePath(); ctx.fill();
    } else if (G.ore[i] > 0) {
      const n = Math.ceil(G.ore[i] / 250);
      ctx.fillStyle = '#facc15';
      for (let k = 0; k < n; k++) { const ox = ((k * 37 + x * 13) % 22) + 4, oy = ((k * 53 + y * 7) % 22) + 4; ctx.fillRect(px + ox, py + oy, 5, 5); }
      ctx.fillStyle = '#fef08a'; ctx.fillRect(px + 6, py + 6, 2, 2);
    }
  }
}
function drawBuilding(b) {
  const x = b.tx * TILE - cam.x, y = b.ty * TILE - cam.y, w = b.w * TILE, h = b.h * TILE, tc = TEAMCOL[b.team];
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 4, y + 5, w, h);
  ctx.fillStyle = b.flash ? '#fde68a' : '#38424f'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = tc; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = TEAMDARK[b.team];
  const cx = x + w / 2, cy = y + h / 2;
  switch (b.type) {
    case 'yard': ctx.fillRect(x + 8, y + 8, w - 16, h - 16); ctx.fillStyle = tc; ctx.fillRect(cx - 4, y + 12, 8, h - 24); ctx.fillRect(x + 12, cy - 4, w - 24, 8); break;
    case 'power': ctx.fillRect(x + 6, y + 6, w - 12, h - 12); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(cx + 3, y + 8); ctx.lineTo(cx - 8, cy + 3); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 3, y + h - 8); ctx.lineTo(cx + 8, cy - 3); ctx.lineTo(cx, cy - 3); ctx.closePath(); ctx.fill(); break;
    case 'refinery': ctx.fillRect(x + 6, y + 6, w * 0.45, h - 12); ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.arc(x + w * 0.72, cy, h * 0.3, 0, 6.283); ctx.fill(); ctx.fillStyle = '#facc15'; ctx.fillRect(x + w * 0.72 - 3, cy - 3, 6, 6); break;
    case 'barracks': for (let i = 0; i < 4; i++) ctx.fillRect(x + 7, y + 8 + i * 13, w - 14, 7); break;
    case 'factory': ctx.fillRect(x + 8, y + 8, w - 16, h - 16); ctx.fillStyle = '#111827'; ctx.fillRect(x + 14, y + h - 30, w - 28, 22); ctx.fillStyle = tc; ctx.fillRect(x + 14, y + 12, w - 28, 6); break;
    case 'turret': ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(b.angle) * 16, cy + Math.sin(b.angle) * 16); ctx.stroke(); break;
  }
  if (b.team === 1 || b.hp < b.maxhp || G.sel.includes(b)) hpBar(x, y - 7, w, b.hp / b.maxhp);
  if (G.sel.includes(b)) { ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); }
}
function hpBar(x, y, w, f) {
  ctx.fillStyle = '#000a'; ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#ef4444'; ctx.fillRect(x, y, w * Math.max(0, f), 4);
}
function drawUnit(u) {
  const x = u.x - cam.x, y = u.y - cam.y, tc = TEAMCOL[u.team];
  if (x < -30 || y < -30 || x > canvas.width + 30 || y > canvas.height + 30) return;
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 3, u.r, u.r * 0.7, 0, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(x, y);
  if (u.type === 'tank') {
    ctx.rotate(u.angle); ctx.fillStyle = '#374151'; ctx.fillRect(-14, -10, 28, 20); ctx.fillStyle = '#1f2937'; ctx.fillRect(-14, -12, 28, 4); ctx.fillRect(-14, 8, 28, 4);
    ctx.fillStyle = tc; ctx.fillRect(-9, -6, 16, 12); ctx.rotate(u.turret - u.angle);
    ctx.fillStyle = '#6b7280'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.283); ctx.fill(); ctx.fillRect(0, -2, 20, 4);
  } else if (u.type === 'harv') {
    ctx.rotate(u.angle); ctx.fillStyle = '#a16207'; ctx.fillRect(-14, -11, 28, 22); ctx.fillStyle = '#facc15'; ctx.fillRect(-12, -8, 6 + 10 * (u.load / u.def.cap), 16); ctx.fillStyle = tc; ctx.fillRect(6, -11, 8, 22);
  } else {
    ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(0, 0, u.r, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#0008'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(u.turret || u.angle); ctx.fillStyle = '#1f2937'; ctx.fillRect(0, -1.5, u.type === 'rocket' ? 15 : 10, 3);
  }
  ctx.restore();
  if (G.sel.includes(u)) { ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, u.r + 4, 0, 6.283); ctx.stroke(); }
  if (u.hp < u.maxhp || G.sel.includes(u)) hpBar(x - u.r, y - u.r - 8, u.r * 2, u.hp / u.maxhp);
}
function draw() {
  const W = canvas.width, H = canvas.height;
  drawTerrain();
  for (const b of G.blds) if (!b.dead && onScreen(b.x, b.y) || b.w > 1) drawBuilding(b);
  if (G.placing) {
    const d = BDEF[G.placing.type], w = screenToWorld(mouse.x, mouse.y), tx = Math.floor(w.x / TILE - (d.w - 1) / 2 + 0.5 - 0.5), ty = Math.floor(w.y / TILE - (d.h - 1) / 2 + 0.5 - 0.5);
    G.placing.tx = tx; G.placing.ty = ty;
    const ok = canPlace(0, G.placing.type, tx, ty);
    ctx.fillStyle = ok ? 'rgba(74,222,128,.45)' : 'rgba(239,68,68,.45)'; ctx.fillRect(tx * TILE - cam.x, ty * TILE - cam.y, d.w * TILE, d.h * TILE);
    ctx.strokeStyle = ok ? '#4ade80' : '#ef4444'; ctx.lineWidth = 2; ctx.strokeRect(tx * TILE - cam.x, ty * TILE - cam.y, d.w * TILE, d.h * TILE);
  }
  for (const u of G.units) drawUnit(u);
  for (const b of G.bullets) { ctx.fillStyle = '#fef08a'; ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - cam.y, b.splash ? 3.5 : 2.5, 0, 6.283); ctx.fill(); }
  for (const p of G.parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; const s = p.size * (0.5 + 0.5 * p.life / p.max); ctx.fillRect(p.x - cam.x - s / 2, p.y - cam.y - s / 2, s, s); }
  ctx.globalAlpha = 1;
  if (mouse.down) {
    const x = Math.min(mouse.dx, mouse.x), y = Math.min(mouse.dy, mouse.y), w = Math.abs(mouse.x - mouse.dx), h = Math.abs(mouse.y - mouse.dy);
    if (w > 4 || h > 4) { ctx.fillStyle = 'rgba(74,222,128,.12)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h); }
  }
  ctx.font = '600 14px system-ui,sans-serif'; ctx.textBaseline = 'top';
  G.msgs.slice(-5).forEach((m, i) => { const a = clamp(1 - (G.tick - m.t - 220) / 80, 0, 1); ctx.globalAlpha = a; ctx.fillStyle = '#000a'; const tw = ctx.measureText(m.text).width; ctx.fillRect(10, 10 + i * 24, tw + 16, 22); ctx.fillStyle = '#f1f5f9'; ctx.fillText(m.text, 18, 14 + i * 24); });
  ctx.globalAlpha = 1;
  if (amoveMode) { ctx.fillStyle = '#fca5a5'; ctx.fillText('Saldırarak ilerle: hedefe tıkla (Esc iptal)', 10, H - 26); }
  if (paused) { ctx.fillStyle = '#0008'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.font = '700 32px system-ui'; ctx.fillText('DURAKLATILDI', W / 2 - 105, H / 2 - 16); }
  drawMini();
}
function prerenderMini() {
  miniTerrain = document.createElement('canvas'); miniTerrain.width = MW; miniTerrain.height = MH;
  const c = miniTerrain.getContext('2d');
  for (let i = 0; i < MW * MH; i++) { const t = G.terrain[i]; c.fillStyle = t === 1 ? '#6b7280' : t === 2 ? '#1d4e89' : '#3a6a29'; c.fillRect(i % MW, (i / MW) | 0, 1, 1); }
}
function drawMini() {
  const sw = mini.width / MW, sh = mini.height / MH;
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(miniTerrain, 0, 0, mini.width, mini.height);
  for (let i = 0; i < MW * MH; i += 1) if (G.ore[i] > 0) { mctx.fillStyle = '#facc15'; mctx.fillRect((i % MW) * sw, ((i / MW) | 0) * sh, sw, sh); }
  for (const b of G.blds) { mctx.fillStyle = TEAMCOL[b.team]; mctx.fillRect(b.tx * sw, b.ty * sh, b.w * sw, b.h * sh); }
  for (const u of G.units) { mctx.fillStyle = TEAMCOL[u.team]; mctx.fillRect((u.x / TILE) * sw - 1, (u.y / TILE) * sh - 1, 3, 3); }
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1;
  mctx.strokeRect((cam.x / WW) * mini.width, (cam.y / WH) * mini.height, (canvas.width / WW) * mini.width, (canvas.height / WH) * mini.height);
}

/* ---------------- döngü ---------------- */
function resize() {
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(300, r.width | 0); canvas.height = Math.max(300, r.height | 0);
  if (G) clampCam();
}
window.addEventListener('resize', resize);

let last = 0, acc = 0, uiT = 0;
function frame(ts) {
  const dt = Math.min(100, ts - last); last = ts;
  if (started && G) {
    // kaydırma
    const sp = 14, ed = 18;
    if (keys['arrowup'] || (mouse.in && mouse.y < ed)) cam.y -= sp;
    if (keys['arrowdown'] || (mouse.in && mouse.y > canvas.height - ed)) cam.y += sp;
    if (keys['arrowleft'] || (mouse.in && mouse.x < ed)) cam.x -= sp;
    if (keys['arrowright'] || (mouse.in && mouse.x > canvas.width - ed)) cam.x += sp;
    clampCam();
    if (!paused && !G.over) { acc += dt; while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; } } else acc = 0;
    draw();
    if (++uiT % 6 === 0) { updateUI(); if (G.sel.length) updateInfo(); }
  }
  requestAnimationFrame(frame);
}

$('ovBtn').addEventListener('click', () => {
  started = true; paused = false; amoveMode = false;
  resize(); newGame();
  $('overlay').classList.add('hide');
});
buildUI();
resize();
// geliştirme/test için
window.__celik = { get G() { return G; } };
requestAnimationFrame(frame);
