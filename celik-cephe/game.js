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
  radar:    { name: 'Radar',    w: 2, h: 2, hp: 500,  cost: 800, time: 600, power: -40, req: ['factory'] },
  airfield: { name: 'Hava Pisti', w: 3, h: 3, hp: 700, cost: 1000, time: 700, power: -45, req: ['factory', 'radar'] },
  turret:   { name: 'Taret',    w: 1, h: 1, hp: 450,  cost: 400, time: 420, power: -15, req: ['barracks'],
              range: 220, dmg: 14, rate: 28, bsp: 12, aa: true },
};
const UDEF = {
  inf:    { name: 'Piyade',    hp: 70,  speed: 1.5, cost: 100, time: 180, from: 'barracks', r: 7,  range: 120, dmg: 7,  rate: 20, bsp: 12, bm: 0.4, tm: 0.5, aa: true },
  rocket: { name: 'Roketatar', hp: 55,  speed: 1.3, cost: 250, time: 280, from: 'barracks', r: 7,  range: 190, dmg: 28, rate: 75, bsp: 7,  bm: 1.5, tm: 1.7, aa: true },
  tank:   { name: 'Tank',      hp: 300, speed: 1.9, cost: 700, time: 460, from: 'factory',  r: 13, range: 160, dmg: 32, rate: 50, bsp: 9,  splash: 28, heavy: true },
  harv:   { name: 'Toplayıcı', hp: 350, speed: 1.3, cost: 600, time: 560, from: 'factory',  r: 13, cap: 400, heavy: true },
  heli:   { name: 'Helikopter',  hp: 170, speed: 3.0, cost: 900,  time: 520, from: 'airfield', r: 11, range: 150, dmg: 13, rate: 16, bsp: 13, air: true, aa: true, bm: 0.7, acq: 260 },
  bomber: { name: 'Bombardıman', hp: 230, speed: 4.4, cost: 1100, time: 700, from: 'airfield', r: 12, range: 26,  dmg: 95, rate: 36, air: true, bomb: true, splash: 62, ammo: 2, acq: 340 },
};
const STRUCTS = ['power', 'refinery', 'barracks', 'factory', 'radar', 'airfield', 'turret'];
const STRIKE_CD = 5400;
const DIFFS = {
  easy:   { name: 'Kolay',  income: 0.7, wave: 5400, size: 5, credits: 1800, desc: 'Rakip yavaş büyür, saldırıları seyrek ve küçük gelir.' },
  normal: { name: 'Normal', income: 1.0, wave: 3600, size: 6, credits: 2500, desc: 'Dengeli rakip: eşit gelir, düzenli saldırı dalgaları.' },
  hard:   { name: 'Zor',    income: 1.35, wave: 2400, size: 8, credits: 3500, desc: 'Rakip daha çok kazanır, erken ve büyük saldırılar yapar.' },
};
let diff = 'normal';
const UNITS = ['inf', 'rocket', 'tank', 'harv', 'heli', 'bomber'];

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const idx = (tx, ty) => ty * MW + tx;
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const canvas = $('game'), hud = $('hud'), hctx = hud.getContext('2d'), view = $('view');
let VW = 800, VH = 600;
const mini = $('mini'), mctx = mini.getContext('2d');
let G = null, mouse = { x: 0, y: 0, in: false, down: false, dx: 0, dy: 0 };
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
  return { id, credits: 2500, prodB: null, q: { barracks: [], factory: [], airfield: [] }, power: 0, used: 0, low: false,
           ai: { wave: 0, next: 3600, size: 6, tick: 0 }, lastWarn: -9999, strikeCd: 2400 };
}

function newGame() {
  const rnd = mulberry32((Date.now() & 0xffffff) ^ 0x5bd1e995);
  G = { tick: 0, units: [], blds: [], bullets: [], parts: [], terrain: new Uint8Array(MW * MH), ore: new Int16Array(MW * MH),
        occ: new Uint8Array(MW * MH), teams: [mkTeam(0), mkTeam(1)], sel: [], nextId: 1, over: null, placing: null,
        groups: {}, msgs: [], rnd, vis: new Uint8Array(MW * MH), strikes: [], targeting: false, oreDirty: new Set(), fogDirty: true };
  genMap(rnd);
  G.teams[1].credits = DIFFS[diff].credits; G.teams[1].ai.next = DIFFS[diff].wave; G.teams[1].ai.size = DIFFS[diff].size;
  const P = { x: 8, y: 44 }, E = { x: 68, y: 12 };
  setupBase(0, P.x, P.y, 1);
  setupBase(1, E.x, E.y, -1);
  cam.x = (P.x + 1.5) * TILE; cam.y = (P.y + 1.5) * TILE; cam.yaw = 0; cam.dist = 26;
  clampCam(); buildWorld3D();
  updateFog();
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
              goal: null, cd: 0, dead: false, load: 0, state: 'seek', ot: -1, mt: 0, auto: null, repath: 0, wave: false, turret: 0, ammo: d.ammo || 0, reload: 0 };
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
  if (u.def.air) { u.path = [{ x: clamp(x, 10, WW - 10), y: clamp(y, 10, WH - 10) }]; u.repath = 0; return; }
  u.path = pathTo(u, x, y) || [];
  u.repath = 0;
}
function moveAlong(u) {
  if (!u.path.length) return true;
  const p = u.path[0];
  const ti = idx(clamp((p.x / TILE) | 0, 0, MW - 1), clamp((p.y / TILE) | 0, 0, MH - 1));
  if (G.occ[ti] && u.goal && !u.def.air) { setGoal(u, u.goal.x, u.goal.y); return !u.path.length; }
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
  for (const u of G.units) if (!u.dead && u.team !== e.team && (!u.def.air || e.def.aa)) { const d = distTo(e, u); if (d < bd) { bd = d; best = u; } }
  for (const b of G.blds) if (!b.dead && b.team !== e.team) { const d = distTo(e, b); if (d < bd) { bd = d; best = b; } }
  return best;
}
function acquire(e) {
  const rng = e.def.acq || (e.def.range + (e.kind === 'u' ? 60 : 0));
  if ((G.tick + e.id) % 10 === 0 || (e.auto && e.auto.dead)) e.auto = findTarget(e, rng);
  if (e.auto && (e.auto.dead || distTo(e, e.auto) > rng + 20)) e.auto = null;
  return e.auto;
}
function fire(a, t) {
  const d = a.def;
  a.cd = d.rate;
  if (d.bomb) {
    a.ammo--;
    const ang = Math.atan2(t.y - a.y, t.x - a.x);
    G.bullets.push({ x: a.x, y: a.y, h: 2.3, bomb: true, vx: Math.cos(ang) * 2.5, vy: Math.sin(ang) * 2.5, team: a.team, dmg: d.dmg, splash: d.splash, src: d });
    a.angle = ang; a.path = [{ x: clamp(a.x + Math.cos(ang) * 450, 20, WW - 20), y: clamp(a.y + Math.sin(ang) * 450, 20, WH - 20) }]; a.repath = 80;
    return;
  }
  G.bullets.push({ x: a.x, y: a.y, hy: d.air ? 2 : 0.5, t, dmg: d.dmg, sp: d.bsp, team: a.team, splash: d.splash || 0, src: d });
  a.angle = Math.atan2(t.y - a.y, t.x - a.x);
  if (a.kind === 'u') a.turret = a.angle;
  puff(a.x + Math.cos(a.angle) * 12, a.y + Math.sin(a.angle) * 12, 3, '#fde68a', 1.2, 8);
  if (onScreen(a.x, a.y)) snd('shot');
}
function engage(u, t) {
  const d = distTo(u, t);
  if (d <= u.def.range) {
    if (u.def.bomb) { if (u.cd <= 0) fire(u, t); moveAlong(u); return; }
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
    if (b.bomb) {
      b.x += b.vx; b.y += b.vy; b.h -= 0.11;
      if (b.h <= 0) {
        b.done = true;
        for (let i = 0; i < 22; i++) puff(b.x, b.y, 6 + Math.random() * 6, Math.random() < 0.5 ? '#f97316' : '#fde047', 3, 28);
        for (const u of G.units) if (!u.dead && u.team !== b.team && !u.def.air) { const d = Math.hypot(u.x - b.x, u.y - b.y); if (d < b.splash) damage(u, b.dmg * (1 - d / b.splash * 0.5), b.src, b.team); }
        for (const e of G.blds) if (!e.dead && e.team !== b.team) { const d = distTo({ x: b.x, y: b.y }, e); if (d < b.splash * 0.7) damage(e, b.dmg * 1.4, null, b.team); }
        if (onScreen(b.x, b.y)) snd('boom');
      }
      continue;
    }
    if (b.t.dead) { b.done = true; continue; }
    b.hy += (((b.t.def && b.t.def.air) ? 2 : 0.5) - b.hy) * 0.15;
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
      G.ore[u.ot] -= take; u.load += take; G.oreDirty.add(u.ot);
      puff(u.x, u.y, 2.5, '#facc15', 1, 14);
      if (u.load >= u.def.cap) { u.state = 'return'; u.pathSet = false; }
    }
  } else if (u.state === 'return') {
    const rf = nearestRefinery(u);
    if (!rf) { u.wait = 90; return; }
    if (distTo(u, rf) < TILE * 1.3) {
      G.teams[u.team].credits += u.load * (u.team === 1 ? DIFFS[diff].income : 1); if (u.team === 0 && u.load) snd('coin');
      u.load = 0; rf.flash = 20; u.state = 'seek'; u.pathSet = false; return;
    }
    if (!u.pathSet) { setGoal(u, (rf.tx + rf.w / 2) * TILE, (rf.ty + rf.h + 0.5) * TILE); u.pathSet = true; }
    if (moveAlong(u)) {
      if (distTo(u, rf) >= TILE * 1.3) u.pathSet = false;
    }
  }
}
function bomberReturn(u) {
  u.order = null; u.auto = null;
  let af = null, bd = 1e9;
  for (const b of G.blds) if (!b.dead && b.team === u.team && b.type === 'airfield') { const d = Math.hypot(b.x - u.x, b.y - u.y); if (d < bd) { bd = d; af = b; } }
  if (!af) { u.path = []; return; }
  if (distTo(u, af) < 24) { u.path = []; if (++u.reload >= 150) { u.ammo = u.def.ammo; u.reload = 0; } return; }
  if (!u.path.length || (G.tick + u.id) % 30 === 0) u.path = [{ x: af.x, y: af.y }];
  moveAlong(u);
}
function updateUnit(u) {
  if (u.cd > 0) u.cd--;
  if (u.type === 'harv') return updateHarv(u);
  if (u.def.bomb && u.ammo <= 0) return bomberReturn(u);
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
  if (b.hp < b.maxhp * 0.35 && G.tick % 8 === 0) puff(b.x + (Math.random() - 0.5) * b.w * TILE * 0.6, b.y, 5, '#8a7f74', 0.6, 40);
}
function separate() {
  const U = G.units;
  for (let i = 0; i < U.length; i++) {
    const a = U[i]; if (a.def.air) continue;
    for (let j = i + 1; j < U.length; j++) {
      const b = U[j]; if (b.def.air) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
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
  for (const k of ['barracks', 'factory', 'airfield']) {
    const q = T.q[k];
    if (!q.length) continue;
    const prods = G.blds.filter(b => b.team === T.id && b.type === k && !b.dead);
    if (!prods.length) continue;
    const it = q[0];
    it.p += spd;
    if (it.p >= UDEF[it.type].time) {
      q.shift();
      const pb = prods[(G.tick / 7 | 0) % prods.length], pos = UDEF[it.type].air ? { x: pb.x, y: pb.y } : freeSpotNear(pb);
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
    else if (cnt('radar') < 1 && T.credits > 1100) want = 'radar';
    else if (cnt('airfield') < 1 && hasB(id, 'radar') && T.credits > 1300) want = 'airfield';
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
  if (hasB(id, 'airfield') && T.q.airfield.length < 1) queueUnit(id, G.rnd() < 0.55 ? 'heli' : 'bomber');
  if (strikeReady(id)) {
    let best = null, bs = 0;
    for (const b of G.blds) if (b.team !== id && !b.dead) { const sc = G.blds.filter(o => o.team === b.team && !o.dead && Math.hypot(o.x - b.x, o.y - b.y) < 120).length + (b.type === 'factory' ? 2 : 0); if (sc > bs) { bs = sc; best = b; } }
    if (best && bs >= 2) callStrike(id, best.x, best.y);
  }
  // saldırı dalgası
  const army = G.units.filter(u => u.team === id && !u.dead && u.type !== 'harv');
  const A = T.ai;
  if (G.tick >= A.next && army.length >= A.size) {
    A.wave++; A.size += 2; A.next = G.tick + DIFFS[diff].wave * 0.8;
    for (const u of army) u.wave = true;
    msg('⚠ Düşman saldırı dalgası yaklaşıyor!');
  }
  for (const u of army) if (u.wave && !u.order) {
    const tgt = findTarget(u, 99999);
    if (tgt) { u.order = { t: 'amove' }; setGoal(u, tgt.x, tgt.y); }
  }
}

/* ---------------- sis ve özel güç ---------------- */
function updateFog() {
  const V = G.vis; G.fogDirty = true;
  for (let i = 0; i < V.length; i++) if (V[i] === 2) V[i] = 1;
  const reveal = (x, y, r) => {
    const cx = (x / TILE) | 0, cy = (y / TILE) | 0, rt = Math.ceil(r / TILE);
    for (let dy = -rt; dy <= rt; dy++) for (let dx = -rt; dx <= rt; dx++) {
      const tx = cx + dx, ty = cy + dy;
      if (tx >= 0 && ty >= 0 && tx < MW && ty < MH && dx * dx + dy * dy <= rt * rt) V[ty * MW + tx] = 2;
    }
  };
  for (const u of G.units) if (u.team === 0 && !u.dead) reveal(u.x, u.y, u.type === 'harv' ? 170 : u.def.air ? 290 : 230);
  for (const b of G.blds) if (b.team === 0 && !b.dead) reveal(b.x, b.y, b.type === 'turret' ? 300 : 260);
}
const visAt = (x, y) => G.vis[idx(clamp((x / TILE) | 0, 0, MW - 1), clamp((y / TILE) | 0, 0, MH - 1))];
const seen = e => e.team === 0 || (e.kind === 'b' ? visAt(e.x, e.y) >= 1 : visAt(e.x, e.y) === 2);
function strikeReady(team) { const T = G.teams[team]; return T.strikeCd <= 0 && hasB(team, 'radar') && !T.low; }
function callStrike(team, x, y) {
  if (!strikeReady(team)) return false;
  G.teams[team].strikeCd = STRIKE_CD;
  G.strikes.push({ x, y, team, t: 0, n: 0 });
  if (team === 1) msg('⚠ Düşman hava saldırısı çağırdı!');
  return true;
}
function updateStrikes() {
  for (const s of G.strikes) {
    s.t++;
    if (s.t > 90 && s.t % 8 === 0 && s.n < 9) {
      s.n++;
      const a = Math.random() * 6.283, r = Math.random() * 80, bx = s.x + Math.cos(a) * r, by = s.y + Math.sin(a) * r;
      for (let i = 0; i < 14; i++) puff(bx, by, 5 + Math.random() * 6, Math.random() < 0.5 ? '#f97316' : '#fde047', 3, 26);
      for (const u of G.units) if (!u.dead && u.team !== s.team && Math.hypot(u.x - bx, u.y - by) < 55) damage(u, 140, null, s.team);
      for (const b of G.blds) if (!b.dead && b.team !== s.team && distTo({ x: bx, y: by }, b) < 40) damage(b, 110, null, s.team);
      if (onScreen(bx, by)) snd('boom');
    }
    if (s.n >= 9) s.done = true;
  }
  for (const s of G.strikes) if (s.done && s.mesh) worldGroup.remove(s.mesh);
  G.strikes = G.strikes.filter(s => !s.done);
}

/* ---------------- ana güncelleme ---------------- */
function update() {
  G.tick++;
  for (const u of G.units) if (!u.dead) updateUnit(u);
  for (const b of G.blds) if (!b.dead) updateBuilding(b);
  separate();
  updateBullets(); updateStrikes();
  if (G.tick % 4 === 0) updateFog();
  for (const T of G.teams) if (T.strikeCd > 0) T.strikeCd--;
  for (const p of G.parts) { p.x += p.vx; p.y += p.vy; p.life--; }
  G.parts = G.parts.filter(p => p.life > 0);
  for (const T of G.teams) prodTick(T);
  if (G.tick % 20 === 0) aiTick(G.teams[1]);
  for (const u of G.units) if (u.dead && u.mesh) { entGroup.remove(u.mesh); u.mesh = null; }
  for (const b of G.blds) if (b.dead && b.mesh) { entGroup.remove(b.mesh); b.mesh = null; }
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
  if (r === 'win') { try { const k = 'celik_wins_' + diff; localStorage.setItem(k, (+localStorage.getItem(k) || 0) + 1); } catch (e) { /* yok */ } }
  $('ovTitle').textContent = r === 'win' ? 'ZAFER!' : 'YENİLGİ';
  $('ovText').innerHTML = r === 'win' ? 'Kızıl Pakt\'ın üssünü yok ettin.' : 'Üssün yok edildi.';
  $('ovBtn').textContent = 'Tekrar Oyna';
  $('overlay').classList.remove('hide');
}

/* ---------------- girdi ---------------- */
function myUnits() { return G.sel.filter(e => e.kind === 'u' && e.team === 0); }
const canHit = (u, t) => !(t.kind === 'u' && t.def.air) || !!u.def.aa;
function placeTile(type, wx, wy) {
  const d = BDEF[type];
  return [Math.floor(wx / TILE - (d.w - 1) / 2), Math.floor(wy / TILE - (d.h - 1) / 2)];
}
function issueOrder(wx, wy, tgt) {
  const us = myUnits();
  if (!us.length) return;
  if (tgt) {
    let any = false;
    for (const u of us) if (u.type !== 'harv' && canHit(u, tgt)) { u.order = { t: 'attack', target: tgt }; u.path = []; any = true; }
    if (any) { snd('ok'); return; }
  }
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
  const small = Math.abs(x1 - x0) < 5 && Math.abs(y1 - y0) < 5;
  let found = [];
  if (small) { const e = pickEntity(x1, y1, 0); if (e) found = [e]; }
  else {
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    found = G.units.filter(u => {
      if (u.dead || u.team !== 0) return false;
      const p = toScreen(u.x, u.y, u.def.air ? 2 : 0.3);
      return p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb;
    });
  }
  if (add) { for (const e of found) if (!G.sel.includes(e)) G.sel.push(e); } else G.sel = found;
}

canvas.addEventListener('mousedown', e => {
  if (!started || G.over) return;
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, w = screenToWorld(x, y);
  if (e.button === 0) {
    if (G.placing) { const [tx, ty] = placeTile(G.placing.type, w.x, w.y); if (placeBuilding(0, tx, ty)) G.placing = null; return; }
    if (G.targeting) { callStrike(0, w.x, w.y); G.targeting = false; return; }
    if (amoveMode) { issueOrder(w.x, w.y, pickEntity(x, y, 1)); amoveMode = false; return; }
    mouse.down = true; mouse.dx = x; mouse.dy = y;
  } else if (e.button === 2) {
    if (G.placing || G.targeting) { G.placing = null; G.targeting = false; return; }
    amoveMode = false; issueOrder(w.x, w.y, pickEntity(x, y, 1));
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
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 12, 48); }, { passive: false });
mini.addEventListener('contextmenu', e => e.preventDefault());

function miniPos(e) { const r = mini.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * WW, y: ((e.clientY - r.top) / r.height) * WH }; }
let miniDrag = false;
mini.addEventListener('mousedown', e => {
  if (!started) return;
  const p = miniPos(e);
  if (e.button === 2) { issueOrder(p.x, p.y, null); return; }
  miniDrag = true; cam.x = p.x; cam.y = p.y; clampCam();
});
window.addEventListener('mousemove', e => { if (miniDrag) { const p = miniPos(e); cam.x = p.x; cam.y = p.y; clampCam(); } });
window.addEventListener('mouseup', () => { miniDrag = false; });

const keys = {};
window.addEventListener('keydown', e => {
  if (!started) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'escape') { G.placing = null; G.targeting = false; amoveMode = false; }
  else if (k === 'p') paused = !paused;
  else if (k === 'a' && myUnits().length) amoveMode = true;
  else if (k === 's') { for (const u of myUnits()) { u.order = null; u.path = []; } }
  else if (k === 'x') { for (const b of G.sel) if (b.kind === 'b' && b.team === 0 && b.type !== 'yard') { G.teams[0].credits += b.def.cost >> 1; kill(b); } }
  else if (k === 'h') { const y = G.blds.find(b => b.team === 0 && b.type === 'yard'); if (y) { cam.x = y.x; cam.y = y.y; clampCam(); } }
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
  const el = document.createElement('div');
  el.className = 'btn';
  el.innerHTML = '<div class="n">Hava Saldırısı</div><div class="c">Radar gerekir</div><div class="s"></div><div class="p"></div>';
  el.addEventListener('click', () => { if (started && !G.over) { if (strikeReady(0)) { G.targeting = true; G.placing = null; msg('Hedefe tıkla (sağ tık iptal)'); } else msg('Hava saldırısı hazır değil (radar / bekleme / güç)'); } });
  $('spc').appendChild(el);
  btnEls.strike = { el, s: el.querySelector('.s'), p: el.querySelector('.p') };
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
  { const e = btnEls.strike, ok = strikeReady(0);
    e.el.classList.toggle('dis', !hasB(0, 'radar'));
    e.el.classList.toggle('ready', ok);
    e.s.textContent = ok ? 'HAZIR' : T.strikeCd > 0 ? Math.ceil(T.strikeCd / 60) + 's' : '';
    e.p.style.width = (100 - (T.strikeCd / STRIKE_CD) * 100) + '%'; }
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

/* ---------------- 3D sahne ---------------- */
const TC = [0x3b82f6, 0xef4444], TD = [0x1e3a8a, 0x7f1d1d];
const GRASS = ['#3d6b2a', '#41722d', '#386526', '#3f6d2c'];
const PR = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(PR);
renderer.setClearColor(0x0a1208);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a1208, 50, 120);
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x2d3b22, 0.8));
const sun = new THREE.DirectionalLight(0xfff1d6, 0.8); sun.position.set(-30, 50, 20); scene.add(sun);
const worldGroup = new THREE.Group(), entGroup = new THREE.Group();
scene.add(worldGroup, entGroup);
const cam = { x: 0, y: 0, yaw: 0, dist: 26, pitch: 0.95 };

const geo = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 16), sph: new THREE.SphereGeometry(1, 14, 10), cone: new THREE.ConeGeometry(1, 1, 12), oct: new THREE.OctahedronGeometry(1) };
const mats = {}, matsB = {};
const mat = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
const matB = c => matsB[c] || (matsB[c] = new THREE.MeshBasicMaterial({ color: c }));
function bx(p, w, h, d, c, x, y, z) { const m = new THREE.Mesh(geo.box, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); p.add(m); return m; }
function cy(p, r, h, c, x, y, z) { const m = new THREE.Mesh(geo.cyl, mat(c)); m.scale.set(r, h, r); m.position.set(x, y, z); p.add(m); return m; }
function sp(p, rx, ry, rz, c, x, y, z, basic) { const m = new THREE.Mesh(geo.sph, basic ? matB(c) : mat(c)); m.scale.set(rx, ry, rz); m.position.set(x, y, z); p.add(m); return m; }

/* yardımcılar: projeksiyon, ışın */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _v = new THREE.Vector3(), _hit = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function toScreen(xp, yp, h) { _v.set(xp / TILE, h, yp / TILE).project(camera); return { x: (_v.x + 1) / 2 * VW, y: (1 - _v.y) / 2 * VH, z: _v.z }; }
function groundPoint(sx, sy) {
  ndc.set(sx / VW * 2 - 1, -(sy / VH) * 2 + 1); ray.setFromCamera(ndc, camera);
  const p = ray.ray.intersectPlane(groundPlane, _hit);
  return p ? { x: p.x * TILE, y: p.z * TILE } : { x: cam.x, y: cam.y };
}
const screenToWorld = (sx, sy) => groundPoint(sx, sy);
function clampCam() { cam.x = clamp(cam.x, 0, WW); cam.y = clamp(cam.y, 0, WH); }
const onScreen = (x, y) => Math.abs(x - cam.x) < cam.dist * TILE * 0.9 && Math.abs(y - cam.y) < cam.dist * TILE * 0.9;
function updateCamera() {
  const tx = cam.x / TILE, tz = cam.y / TILE, ch = Math.cos(cam.pitch), sh = Math.sin(cam.pitch);
  camera.position.set(tx + Math.sin(cam.yaw) * ch * cam.dist, sh * cam.dist, tz + Math.cos(cam.yaw) * ch * cam.dist);
  camera.lookAt(tx, 0, tz); camera.updateMatrixWorld();
}
function pickEntity(sx, sy, team) {
  const ppu = VH / (2 * Math.tan(camera.fov * Math.PI / 360) * cam.dist);
  let best = null, bd = 1e9;
  for (const u of G.units) {
    if (u.dead || (team !== undefined && u.team !== team) || !seen(u)) continue;
    const p = toScreen(u.x, u.y, u.def.air ? (u.type === 'heli' ? 2 : 2.4) : 0.3);
    const rad = Math.max(12, (u.r / TILE + 0.25) * ppu), d = Math.hypot(p.x - sx, p.y - sy);
    if (d < rad && d < bd) { bd = d; best = u; }
  }
  if (best) return best;
  ndc.set(sx / VW * 2 - 1, -(sy / VH) * 2 + 1); ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(entGroup.children, true)) {
    let o = h.object;
    while (o && !o.userData.ent) o = o.parent;
    const e = o && o.userData.ent;
    if (e && e.kind === 'b' && !e.dead && (team === undefined || e.team === team) && seen(e)) return e;
  }
  return null;
}

/* arazi, sis, kayalar, madenler */
const PX = 16;
let terrainCanvas, tctx, terrainTex, fogCanvas, fctx, fogTex, fogImg, crystals, tileInst, ghost, cursorRing;
function paintTile(i) {
  const x = i % MW, y = (i / MW) | 0, px = x * PX, py = y * PX, t = G.terrain[i], c = tctx;
  if (t === 2) { c.fillStyle = (x + y) % 2 ? '#1d4e89' : '#1f5694'; c.fillRect(px, py, PX, PX); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(px + 3, py + 5, 8, 1.5); return; }
  c.fillStyle = GRASS[tileVar[i]]; c.fillRect(px, py, PX, PX);
  if (t === 1) { c.fillStyle = '#4a4f57'; c.fillRect(px, py, PX, PX); return; }
  if (G.ore[i] > 0) { c.fillStyle = 'rgba(120,90,30,.55)'; c.fillRect(px, py, PX, PX); }
}
function crystalMatrix(i, m) {
  const k = tileInst[i], x = i % MW, y = (i / MW) | 0, a = G.ore[i];
  const s = a > 0 ? 0.14 + 0.22 * Math.min(1, a / 900) : 0;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i * 7) % 6, 0));
  m.compose(new THREE.Vector3(x + 0.5 + (((i * 13) % 5) - 2) * 0.08, s * 0.9, y + 0.5 + (((i * 29) % 5) - 2) * 0.08), q, new THREE.Vector3(s * 0.8, s * 1.8, s * 0.8));
  crystals.setMatrixAt(k, m);
}
function buildWorld3D() {
  for (const g of [worldGroup, entGroup]) while (g.children.length) g.remove(g.children[0]);
  terrainCanvas = document.createElement('canvas'); terrainCanvas.width = MW * PX; terrainCanvas.height = MH * PX; tctx = terrainCanvas.getContext('2d');
  for (let i = 0; i < MW * MH; i++) paintTile(i);
  terrainTex = new THREE.CanvasTexture(terrainCanvas); terrainTex.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshLambertMaterial({ map: terrainTex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(MW / 2, 0, MH / 2); worldGroup.add(ground);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), matB(0x0a1208)); base.rotation.x = -Math.PI / 2; base.position.set(MW / 2, -0.05, MH / 2); worldGroup.add(base);
  // kayalar
  const rocks = []; for (let i = 0; i < MW * MH; i++) if (G.terrain[i] === 1) rocks.push(i);
  const rm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0x6b7280), Math.max(1, rocks.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  rocks.forEach((i, k) => {
    const s = 0.4 + ((i * 17) % 10) / 30;
    q.setFromEuler(new THREE.Euler((i % 7) * 0.4, (i % 11) * 0.5, 0));
    m4.compose(new THREE.Vector3((i % MW) + 0.5, s * 0.55, ((i / MW) | 0) + 0.5), q, new THREE.Vector3(s, s * 0.9, s)); rm.setMatrixAt(k, m4);
  });
  worldGroup.add(rm);
  // maden kristalleri
  const ores = []; tileInst = new Int32Array(MW * MH).fill(-1);
  for (let i = 0; i < MW * MH; i++) if (G.ore[i] > 0) { tileInst[i] = ores.length; ores.push(i); }
  crystals = new THREE.InstancedMesh(geo.oct, new THREE.MeshLambertMaterial({ color: 0xfacc15, emissive: 0x7a5a00 }), Math.max(1, ores.length));
  for (const i of ores) crystalMatrix(i, m4);
  worldGroup.add(crystals);
  // sis
  fogCanvas = document.createElement('canvas'); fogCanvas.width = MW; fogCanvas.height = MH; fctx = fogCanvas.getContext('2d'); fogImg = fctx.createImageData(MW, MH);
  fogTex = new THREE.CanvasTexture(fogCanvas); fogTex.minFilter = THREE.LinearFilter; fogTex.magFilter = THREE.LinearFilter; fogTex.generateMipmaps = false;
  const fog = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, depthWrite: false }));
  fog.rotation.x = -Math.PI / 2; fog.position.set(MW / 2, 0.07, MH / 2); fog.renderOrder = 5; worldGroup.add(fog);
  // yerleştirme hayaleti ve hedef halkası
  ghost = new THREE.Mesh(geo.box, new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.5, depthWrite: false })); ghost.visible = false; worldGroup.add(ghost);
  cursorRing = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.9, 48), new THREE.MeshBasicMaterial({ color: 0xf87171, side: THREE.DoubleSide })); cursorRing.rotation.x = -Math.PI / 2; cursorRing.position.y = 0.12; cursorRing.visible = false; worldGroup.add(cursorRing);
  G.fogDirty = true;
}
function updateFogTex() {
  const d = fogImg.data;
  for (let i = 0; i < MW * MH; i++) { const v = G.vis[i]; d[i * 4] = 5; d[i * 4 + 1] = 8; d[i * 4 + 2] = 11; d[i * 4 + 3] = v === 0 ? 255 : v === 1 ? 120 : 0; }
  fctx.putImageData(fogImg, 0, 0); fogTex.needsUpdate = true;
}

/* bina ve birim modelleri */
function makeBuilding(b) {
  const g = new THREE.Group(), w = b.w, h = b.h, tc = TC[b.team], td = TD[b.team];
  bx(g, w, 0.1, h, tc, 0, 0.05, 0); bx(g, w - 0.2, 0.08, h - 0.2, 0x3a4350, 0, 0.14, 0);
  switch (b.type) {
    case 'yard':
      bx(g, w - 0.9, 0.9, h - 0.9, td, 0, 0.6, 0); bx(g, w - 1.2, 0.12, h - 1.2, tc, 0, 1.12, 0);
      bx(g, 0.5, 1.5, 0.5, 0x6b7280, w * 0.25, 1.0, -h * 0.25); bx(g, 0.62, 0.2, 0.62, tc, w * 0.25, 1.85, -h * 0.25); cy(g, 0.03, 0.8, 0xe5e7eb, w * 0.25, 2.2, -h * 0.25);
      break;
    case 'power':
      cy(g, 0.42, 1.1, 0x9ca3af, -0.5, 0.7, 0); cy(g, 0.42, 1.1, 0x9ca3af, 0.5, 0.7, 0);
      cy(g, 0.44, 0.14, tc, -0.5, 1.2, 0); cy(g, 0.44, 0.14, tc, 0.5, 1.2, 0); sp(g, 0.2, 0.2, 0.2, 0xfde047, 0, 0.55, 0, true);
      break;
    case 'refinery':
      bx(g, 1.2, 0.8, h - 0.3, td, -0.75, 0.55, 0); cy(g, 0.55, 1.0, 0xb6bcc6, 0.8, 0.65, 0.0); cy(g, 0.57, 0.12, tc, 0.8, 1.2, 0);
      cy(g, 0.12, 1.3, 0x4b5563, -1.1, 1.3, -0.4); sp(g, 0.15, 0.15, 0.15, 0xfacc15, 0.8, 1.3, 0, true);
      break;
    case 'barracks':
      bx(g, w - 0.3, 0.8, h - 0.3, td, 0, 0.55, 0); bx(g, w - 0.1, 0.1, h - 0.1, tc, 0, 1.0, 0); bx(g, 0.5, 0.45, 0.06, 0x111827, 0, 0.4, h / 2 - 0.12);
      break;
    case 'factory':
      bx(g, w - 0.4, 1.1, h - 0.4, td, 0, 0.7, 0); bx(g, w - 0.3, 0.1, h - 0.3, tc, 0, 1.3, 0);
      for (let i = 0; i < 3; i++) bx(g, 0.5, 0.3, h - 0.8, 0x4b5563, -0.9 + i * 0.9, 1.5, 0);
      bx(g, 1.4, 0.8, 0.06, 0x111827, 0, 0.55, h / 2 - 0.2); cy(g, 0.12, 0.8, 0x4b5563, w / 2 - 0.4, 1.7, -0.6);
      break;
    case 'radar': {
      bx(g, w - 0.6, 0.7, h - 0.6, td, 0, 0.5, 0);
      const dish = new THREE.Group(); dish.position.set(0, 1.0, 0);
      cy(dish, 0.08, 0.4, 0x9ca3af, 0, 0, 0);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe5e7eb, side: THREE.DoubleSide }));
      bowl.rotation.set(Math.PI + 0.5, 0, 0); bowl.position.y = 0.35; dish.add(bowl);
      sp(dish, 0.06, 0.06, 0.06, 0x4ade80, 0, 0.55, 0.2, true);
      g.add(dish); g.userData.spin = dish;
      break;
    }
    case 'airfield':
      bx(g, w - 0.1, 0.06, 1.1, 0x1f2937, 0, 0.17, h / 2 - 0.65);
      for (let i = 0; i < 5; i++) bx(g, 0.35, 0.02, 0.08, 0xe5e7eb, -1.1 + i * 0.55, 0.21, h / 2 - 0.65);
      bx(g, w - 0.6, 0.85, 1.1, td, 0, 0.6, -h / 2 + 0.75); bx(g, w - 0.5, 0.1, 1.2, tc, 0, 1.05, -h / 2 + 0.75);
      bx(g, 0.35, 1.2, 0.35, 0x9ca3af, w / 2 - 0.3, 0.8, 0.0); bx(g, 0.55, 0.25, 0.55, 0x7dd3fc, w / 2 - 0.3, 1.5, 0.0);
      break;
    case 'turret': {
      cy(g, 0.36, 0.3, 0x4b5563, 0, 0.3, 0);
      const head = new THREE.Group(); head.position.y = 0.55; sp(head, 0.25, 0.2, 0.25, tc, 0, 0, 0); bx(head, 0.7, 0.1, 0.1, 0x9ca3af, 0.4, 0, 0);
      g.add(head); g.userData.head = head;
      break;
    }
  }
  const sel = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.25, h + 0.25), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.35, depthWrite: false }));
  sel.rotation.x = -Math.PI / 2; sel.position.y = 0.16; sel.visible = false; g.add(sel);
  g.userData.sel = sel; g.userData.ent = b;
  return g;
}
const shadowGeo = new THREE.CircleGeometry(1, 16), shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
const ringMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide });
function makeUnit(u) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const ud = root.userData, tc = TC[u.team], td = TD[u.team];
  ud.body = body;
  switch (u.type) {
    case 'inf': case 'rocket':
      cy(body, 0.11, 0.34, tc, 0, 0.22, 0); sp(body, 0.085, 0.085, 0.085, 0xe5c8a8, 0, 0.46, 0);
      if (u.type === 'rocket') bx(body, 0.55, 0.09, 0.09, 0x374151, 0.05, 0.42, -0.12); else bx(body, 0.3, 0.05, 0.05, 0x1f2937, 0.15, 0.3, 0.06);
      break;
    case 'tank': {
      bx(body, 0.95, 0.14, 0.2, 0x1f2937, 0, 0.12, 0.33); bx(body, 0.95, 0.14, 0.2, 0x1f2937, 0, 0.12, -0.33); bx(body, 0.8, 0.2, 0.5, td, 0, 0.26, 0);
      const tg = new THREE.Group(); tg.position.y = 0.42; bx(tg, 0.4, 0.18, 0.36, tc, 0, 0, 0); bx(tg, 0.6, 0.07, 0.07, 0x9ca3af, 0.45, 0, 0);
      body.add(tg); ud.tg = tg; break;
    }
    case 'harv':
      bx(body, 0.85, 0.3, 0.6, 0xa16207, 0, 0.25, 0); bx(body, 0.3, 0.3, 0.5, tc, 0.28, 0.5, 0); bx(body, 0.15, 0.2, 0.7, 0x6b7280, 0.5, 0.18, 0);
      ud.cargo = bx(body, 0.45, 0.2, 0.4, 0xfacc15, -0.18, 0.5, 0); break;
    case 'heli': {
      sp(body, 0.5, 0.28, 0.26, tc, 0, 0, 0); sp(body, 0.22, 0.16, 0.2, 0x7dd3fc, 0.28, 0.06, 0);
      bx(body, 0.75, 0.06, 0.06, td, -0.7, 0.05, 0); bx(body, 0.05, 0.24, 0.04, tc, -1.05, 0.15, 0);
      bx(body, 0.6, 0.03, 0.03, 0x374151, 0, -0.3, 0.18); bx(body, 0.6, 0.03, 0.03, 0x374151, 0, -0.3, -0.18);
      const rg = new THREE.Group(); rg.position.y = 0.3; bx(rg, 1.6, 0.02, 0.08, 0x374151, 0, 0, 0); bx(rg, 0.08, 0.02, 1.6, 0x374151, 0, 0, 0);
      body.add(rg); ud.rotor = rg; break;
    }
    case 'bomber': {
      const fus = new THREE.Mesh(geo.cyl, mat(0x9ca3af)); fus.scale.set(0.18, 1.5, 0.18); fus.rotation.z = Math.PI / 2; body.add(fus);
      const nose = new THREE.Mesh(geo.cone, mat(tc)); nose.scale.set(0.18, 0.5, 0.18); nose.rotation.z = -Math.PI / 2; nose.position.x = 1.0; body.add(nose);
      bx(body, 0.55, 0.04, 2.0, tc, -0.05, 0, 0); bx(body, 0.3, 0.03, 0.8, td, -0.7, 0, 0); bx(body, 0.3, 0.3, 0.04, tc, -0.7, 0.2, 0);
      sp(body, 0.2, 0.1, 0.12, 0x7dd3fc, 0.45, 0.14, 0); break;
    }
  }
  const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.06;
  const sr = (u.r / TILE) * (u.def.air ? 1.5 : 1.1); sh.scale.set(sr * (u.def.air ? 1.4 : 1), sr, sr); root.add(sh);
  const R = u.r / TILE + 0.1, ring = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.07, 24), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.visible = false; root.add(ring); ud.ring = ring;
  if (u.def.air) body.position.y = u.type === 'heli' ? 2 : 2.4;
  return root;
}
function syncScene() {
  const sel = new Set(G.sel);
  for (const u of G.units) {
    if (!u.mesh) { u.mesh = makeUnit(u); entGroup.add(u.mesh); }
    const m = u.mesh, ud = m.userData, vis = seen(u);
    m.visible = vis;
    if (!vis) continue;
    m.position.set(u.x / TILE, 0, u.y / TILE);
    ud.body.rotation.y = -u.angle;
    if (ud.tg) ud.tg.rotation.y = -(u.turret - u.angle);
    if (ud.cargo) ud.cargo.scale.y = 0.05 + 0.3 * (u.load / u.def.cap);
    if (ud.rotor) ud.rotor.rotation.y += 0.6;
    if (u.def.air) ud.body.position.y = (u.type === 'heli' ? 2 : 2.4) + Math.sin(G.tick / 25 + u.id) * 0.06;
    ud.ring.visible = sel.has(u);
  }
  for (const b of G.blds) {
    if (!b.mesh) { b.mesh = makeBuilding(b); b.mesh.position.set(b.x / TILE, 0, b.y / TILE); entGroup.add(b.mesh); }
    const m = b.mesh, ud = m.userData;
    m.visible = seen(b);
    ud.sel.visible = sel.has(b);
    if (ud.head) ud.head.rotation.y = -b.angle;
    if (ud.spin) ud.spin.rotation.y += 0.03;
    m.scale.y = b.flash > 0 ? 1.04 : 1;
  }
}

/* parçacıklar ve mermiler */
const MAXP = 1500, MAXB = 400;
const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), bPos = new Float32Array(MAXB * 3);
function mkPoints(pos, col, size, additive) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: !!col, color: col ? 0xffffff : 0xfff2a8, transparent: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
  p.frustumCulled = false; scene.add(p); return p;
}
const pPoints = mkPoints(pPos, pCol, 0.34, true), bPoints = mkPoints(bPos, null, 0.28, false);
const colCache = {};
const rgb = h => colCache[h] || (colCache[h] = new THREE.Color(h));
function renderParticles() {
  let n = 0;
  for (const p of G.parts) {
    if (n >= MAXP) break;
    if (visAt(p.x, p.y) === 0) continue;
    const f = Math.max(0, p.life / p.max), c = rgb(p.col);
    pPos[n * 3] = p.x / TILE; pPos[n * 3 + 1] = 0.35 + (1 - f) * 0.9; pPos[n * 3 + 2] = p.y / TILE;
    pCol[n * 3] = c.r * f; pCol[n * 3 + 1] = c.g * f; pCol[n * 3 + 2] = c.b * f; n++;
  }
  pPoints.geometry.setDrawRange(0, n); pPoints.geometry.attributes.position.needsUpdate = true; pPoints.geometry.attributes.color.needsUpdate = true;
  let k = 0;
  for (const b of G.bullets) {
    if (k >= MAXB) break;
    bPos[k * 3] = b.x / TILE; bPos[k * 3 + 1] = b.bomb ? b.h : (b.hy || 0.5); bPos[k * 3 + 2] = b.y / TILE; k++;
  }
  bPoints.geometry.setDrawRange(0, k); bPoints.geometry.attributes.position.needsUpdate = true;
}

function render3D() {
  updateCamera();
  const m4 = render3D.m || (render3D.m = new THREE.Matrix4());
  if (G.oreDirty.size) {
    for (const i of G.oreDirty) { paintTile(i); if (tileInst[i] >= 0) crystalMatrix(i, m4); }
    G.oreDirty.clear(); terrainTex.needsUpdate = true; crystals.instanceMatrix.needsUpdate = true;
  }
  if (G.fogDirty) { updateFogTex(); G.fogDirty = false; }
  syncScene(); renderParticles();
  for (const s of G.strikes) {
    if (!s.mesh) {
      s.mesh = new THREE.Group();
      const r = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.85, 48), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, side: THREE.DoubleSide }));
      const d = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.15, depthWrite: false }));
      r.rotation.x = d.rotation.x = -Math.PI / 2; s.mesh.add(r, d); s.mesh.position.set(s.x / TILE, 0.12, s.y / TILE); s.mesh.userData.ring = r; worldGroup.add(s.mesh);
    }
    s.mesh.userData.ring.material.opacity = 0.6 + 0.3 * Math.sin(G.tick / 4);
  }
  if (G.placing) {
    const d = BDEF[G.placing.type], gp = groundPoint(mouse.x, mouse.y), [tx, ty] = placeTile(G.placing.type, gp.x, gp.y);
    ghost.visible = true; ghost.scale.set(d.w, 0.9, d.h); ghost.position.set(tx + d.w / 2, 0.45, ty + d.h / 2);
    ghost.material.color.setHex(canPlace(0, G.placing.type, tx, ty) ? 0x4ade80 : 0xef4444);
  } else ghost.visible = false;
  cursorRing.visible = !!G.targeting;
  if (G.targeting) { const gp = groundPoint(mouse.x, mouse.y); cursorRing.position.set(gp.x / TILE, 0.12, gp.y / TILE); }
  renderer.render(scene, camera);
  drawHUD();
  drawMini();
}

/* 2B katman: can çubukları, seçim kutusu, mesajlar */
function drawHUD() {
  const c = hctx, W = VW, H = VH;
  c.clearRect(0, 0, W, H);
  const ppu = VH / (2 * Math.tan(camera.fov * Math.PI / 360) * cam.dist), sel = new Set(G.sel);
  const bar = (x, y, w, f) => { c.fillStyle = '#000a'; c.fillRect(x, y, w, 4); c.fillStyle = f > 0.5 ? '#4ade80' : f > 0.25 ? '#facc15' : '#ef4444'; c.fillRect(x, y, w * Math.max(0, f), 4); };
  for (const u of G.units) {
    if (u.dead || !seen(u) || !(u.hp < u.maxhp || sel.has(u))) continue;
    const p = toScreen(u.x, u.y, u.def.air ? 2.7 : 0.8);
    if (p.x < -40 || p.y < -40 || p.x > W + 40 || p.y > H + 40) continue;
    const w = Math.max(22, (u.r / TILE) * 2.2 * ppu); bar(p.x - w / 2, p.y - 6, w, u.hp / u.maxhp);
  }
  for (const b of G.blds) {
    if (b.dead || !seen(b) || !(b.hp < b.maxhp || sel.has(b) || (b.team === 1 && visAt(b.x, b.y) === 2))) continue;
    const p = toScreen(b.x, b.y, 1.9);
    if (p.x < -60 || p.y < -40 || p.x > W + 60 || p.y > H + 40) continue;
    const w = Math.max(30, b.w * ppu * 0.8); bar(p.x - w / 2, p.y - 6, w, b.hp / b.maxhp);
  }
  if (mouse.down) {
    const x = Math.min(mouse.dx, mouse.x), y = Math.min(mouse.dy, mouse.y), w = Math.abs(mouse.x - mouse.dx), h = Math.abs(mouse.y - mouse.dy);
    if (w > 4 || h > 4) { c.fillStyle = 'rgba(74,222,128,.12)'; c.fillRect(x, y, w, h); c.strokeStyle = '#4ade80'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w, h); }
  }
  c.font = '600 14px system-ui,sans-serif'; c.textBaseline = 'top';
  G.msgs.slice(-5).forEach((m, i) => { c.globalAlpha = clamp(1 - (G.tick - m.t - 220) / 80, 0, 1); c.fillStyle = '#000a'; const tw = c.measureText(m.text).width; c.fillRect(10, 10 + i * 24, tw + 16, 22); c.fillStyle = '#f1f5f9'; c.fillText(m.text, 18, 14 + i * 24); });
  c.globalAlpha = 1;
  if (amoveMode) { c.fillStyle = '#fca5a5'; c.fillText('Saldırarak ilerle: hedefe tıkla (Esc iptal)', 10, H - 26); }
  if (G.targeting) { c.fillStyle = '#fca5a5'; c.fillText('Hava saldırısı: hedefe tıkla (sağ tık iptal)', 10, H - 26); }
  if (paused) { c.fillStyle = '#0008'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 32px system-ui'; c.fillText('DURAKLATILDI', W / 2 - 105, H / 2 - 16); }
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
  for (let i = 0; i < MW * MH; i++) {
    const v = G.vis[i], px = (i % MW) * sw, py = ((i / MW) | 0) * sh;
    if (v === 0) { mctx.fillStyle = '#000'; mctx.fillRect(px, py, sw + 0.5, sh + 0.5); }
    else if (G.ore[i] > 0) { mctx.fillStyle = '#facc15'; mctx.fillRect(px, py, sw, sh); }
    if (v === 1) { mctx.fillStyle = 'rgba(0,0,0,.45)'; mctx.fillRect(px, py, sw + 0.5, sh + 0.5); }
  }
  for (const b of G.blds) if (seen(b)) { mctx.fillStyle = TEAMCOL[b.team]; mctx.fillRect(b.tx * sw, b.ty * sh, b.w * sw, b.h * sh); }
  for (const u of G.units) if (seen(u)) { mctx.fillStyle = TEAMCOL[u.team]; mctx.fillRect((u.x / TILE) * sw - 1, (u.y / TILE) * sh - 1, u.def.air ? 4 : 3, u.def.air ? 4 : 3); }
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath();
  [[0, 0], [VW, 0], [VW, VH], [0, VH]].forEach(([x, y], i) => {
    const p = groundPoint(x, y), qx = (p.x / WW) * mini.width, qy = (p.y / WH) * mini.height;
    if (i) mctx.lineTo(qx, qy); else mctx.moveTo(qx, qy);
  });
  mctx.closePath(); mctx.stroke();
}

/* ---------------- döngü ---------------- */
function resize() {
  const r = view.getBoundingClientRect();
  VW = Math.max(300, r.width | 0); VH = Math.max(300, r.height | 0);
  renderer.setSize(VW, VH, false);
  camera.aspect = VW / VH; camera.updateProjectionMatrix();
  hud.width = VW * PR; hud.height = VH * PR; hctx.setTransform(PR, 0, 0, PR, 0, 0);
  if (G) clampCam();
}
window.addEventListener('resize', resize);

let last = 0, acc = 0, uiT = 0;
function frame(ts) {
  const dt = Math.min(100, ts - last); last = ts;
  if (started && G) {
    const ed = 18, sp2 = 12 * (cam.dist / 26);
    let mx = 0, my = 0;
    if (keys['arrowleft'] || (mouse.in && mouse.x < ed)) mx -= 1;
    if (keys['arrowright'] || (mouse.in && mouse.x > VW - ed)) mx += 1;
    if (keys['arrowup'] || (mouse.in && mouse.y < ed)) my += 1;
    if (keys['arrowdown'] || (mouse.in && mouse.y > VH - ed)) my -= 1;
    if (keys['q']) cam.yaw -= 0.03;
    if (keys['e']) cam.yaw += 0.03;
    const sy = Math.sin(cam.yaw), cyw = Math.cos(cam.yaw);
    cam.x += (cyw * mx - sy * my) * sp2; cam.y += (-sy * mx - cyw * my) * sp2;
    clampCam();
    if (!paused && !G.over) { acc += dt; while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; } } else acc = 0;
    render3D();
    if (++uiT % 6 === 0) { updateUI(); if (G.sel.length) updateInfo(); }
  }
  requestAnimationFrame(frame);
}

function startGame() {
  started = true; paused = false; amoveMode = false;
  $('menu').classList.add('hide'); $('overlay').classList.add('hide');
  resize(); newGame();
}
function showMenu() {
  started = false; $('overlay').classList.add('hide'); $('menu').classList.remove('hide');
  refreshMenu(); menuLoop();
}
function refreshMenu() {
  document.querySelectorAll('#diffs button').forEach(b => b.classList.toggle('on', b.dataset.d === diff));
  $('diffDesc').textContent = DIFFS[diff].desc;
  let t = [];
  try { for (const k of Object.keys(DIFFS)) t.push(DIFFS[k].name + ': ' + (+localStorage.getItem('celik_wins_' + k) || 0)); } catch (e) { /* yok */ }
  $('wins').textContent = t.length ? '🏆 Zaferler — ' + t.join(' · ') : '';
}
document.querySelectorAll('#diffs button').forEach(b => b.addEventListener('click', () => { diff = b.dataset.d; refreshMenu(); }));
$('startBtn').addEventListener('click', startGame);
$('ovBtn').addEventListener('click', startGame);
$('ovMenu').addEventListener('click', showMenu);
$('howBtn').addEventListener('click', () => { $('mainPanel').classList.add('hide'); $('howPanel').classList.remove('hide'); });
$('backBtn').addEventListener('click', () => { $('howPanel').classList.add('hide'); $('mainPanel').classList.remove('hide'); });

/* menü arka planı: hareketli ızgara ve süzülen birlikler */
const mbg = $('menuBg'), mg = mbg.getContext('2d');
const mUnits = Array.from({ length: 14 }, (_, i) => ({ x: Math.random() * 1600, y: Math.random() * 900, s: 0.4 + Math.random() * 1.2, team: i % 2, big: Math.random() < 0.4 }));
function menuLoop() {
  if (started || $('menu').classList.contains('hide')) return;
  const W = mbg.width = mbg.clientWidth, H = mbg.height = mbg.clientHeight, t = performance.now() / 1000;
  const g = mg.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1420'); g.addColorStop(1, '#16251a');
  mg.fillStyle = g; mg.fillRect(0, 0, W, H);
  mg.strokeStyle = 'rgba(56,189,248,.07)'; mg.lineWidth = 1;
  const off = (t * 14) % 48;
  for (let x = -48 + off; x < W; x += 48) { mg.beginPath(); mg.moveTo(x, 0); mg.lineTo(x, H); mg.stroke(); }
  for (let y = -48 + off; y < H; y += 48) { mg.beginPath(); mg.moveTo(0, y); mg.lineTo(W, y); mg.stroke(); }
  for (const u of mUnits) {
    u.x += u.s * (u.team ? -1 : 1); if (u.x > W + 40) u.x = -40; if (u.x < -40) u.x = W + 40;
    const y = (u.y % H), sz = u.big ? 14 : 8;
    mg.fillStyle = TEAMCOL[u.team] + '99'; mg.fillRect(u.x - sz, y - sz * 0.7, sz * 2, sz * 1.4);
    mg.fillStyle = '#0008'; mg.fillRect(u.x - 2, y - 2, sz + 4, 4);
  }
  requestAnimationFrame(menuLoop);
}
buildUI();
resize();
refreshMenu();
menuLoop();
// geliştirme/test için
window.__celik = { get G() { return G; } };
requestAnimationFrame(frame);
