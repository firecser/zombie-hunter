// 五行相生平衡模拟器：验证「2 树发育（相生）最强 / 单树与多树数值基本平衡 / 平均发育打不过」。
// 用法：node scripts/sim_synergy.js
const WAVE_COUNT = 20;
const INITIAL_DELAY = 1500;
const GAME_TIME_LIMIT = 5 * 60 * 1000;
const MAX_LEVEL = 20;
const DT = 1000 / 60;

let HP_MUL = 1.5;
let EXP_BASE = 3;
const STAGE = { healthMult: 1.0, hpGrow: 150, speedMult: 1.0 };

const ZTYPE = {
  normal: { health: 40 * HP_MUL, radius: 22, damage: 10, speed: 0.5, exp: 1 },
  fast:   { health: 25 * HP_MUL, radius: 18, damage: 8,  speed: 1.2, exp: 1 },
  tank:   { health: 80 * HP_MUL, radius: 30, damage: 20, speed: 0.35, exp: 2 },
  boss:   { health: 160 * HP_MUL, radius: 42, damage: 30, speed: 0.3, exp: 4 },
};

function buildWavePlan() {
  const plan = [];
  for (let i = 1; i <= WAVE_COUNT; i++) {
    const targetExp = EXP_BASE * i;
    const isBoss = (i % 5 === 0);
    const comp = [];
    let remaining = targetExp;
    if (isBoss) { comp.push('boss'); remaining -= 4; }
    if (i >= 3) {
      const tanks = Math.min(Math.floor(i / 3), Math.floor(remaining / 2));
      for (let k = 0; k < tanks; k++) { comp.push('tank'); remaining -= 2; }
    }
    if (i >= 2 && !isBoss && i % 2 === 0) {
      const fast = Math.min(3, remaining);
      for (let k = 0; k < fast; k++) { comp.push('fast'); remaining -= 1; }
    }
    while (remaining > 0) { comp.push('normal'); remaining -= 1; }
    plan.push({ i, comp, boss: isBoss });
  }
  const totalCount = plan.reduce((s, w) => s + w.comp.length, 0);
  const WAVE_INTERVAL = (GAME_TIME_LIMIT - INITIAL_DELAY) / totalCount;
  let t = INITIAL_DELAY;
  for (const w of plan) { w.spawnAt = t; t += w.comp.length * WAVE_INTERVAL; }
  return { plan, totalCount, WAVE_INTERVAL };
}

function buildSpawnSchedule({ plan, WAVE_INTERVAL }) {
  const sched = [];
  const JIT = 120;
  for (const w of plan) {
    for (let s = 0; s < w.comp.length; s++) {
      sched.push({ time: w.spawnAt + s * WAVE_INTERVAL + (Math.random() * 2 - 1) * JIT, type: w.comp[s] });
    }
  }
  sched.sort((a, b) => a.time - b.time);
  return sched;
}

// ===== 五行相生 =====
const WUXING_GENERATE = { '火': '土', '土': '金', '金': '水', '水': '木', '木': '火' };
// 属性树 → 五行元素：爆炸=火, 雷=金, 冰=水, 龙卷风(风)=木
const WUXING_ELEMENT = { '火': '火', '金': '金', '水': '水', '木': '木' };

let SYNERGY_BONUS = 0.20;     // 每对相生提供的全局增伤
let SPREAD_PENALTY = 0.25;    // 超过 2 树后每多 1 树的分散惩罚（使 2 树为峰值）

function synergyMult(trees) {
  const set = new Set(trees);
  let pairs = 0;
  for (const a of set) { const b = WUXING_GENERATE[a]; if (b && set.has(b)) pairs++; }
  const treeCount = set.size;
  return 1 + SYNERGY_BONUS * pairs - Math.max(0, treeCount - 2) * SPREAD_PENALTY;
}

// 属性树在等级 L 下的释放节奏（复刻 getAttrReleaseCd + multiShot + highSpeed）
function attrParams(L) {
  const ms = L;  // 当前 multiShot 公式：每级 +1 发
  const bullets = 1 + ms;
  const hs = Math.min(5, Math.floor(L / 2));
  let cd = Math.max(3000, 6000 - L * 100) * (1 - 0.08 * hs);
  return { bullets, cd };
}

// 龙卷风（风/木）已被大幅削弱：小范围 + 仅轻微减速，无中心吸附
function tornadoRadius(L) { return 70 + L * 8; }

function runSim(build) {
  const built = buildWavePlan();
  const sched = buildSpawnSchedule(built);
  const SW = 720, SH = 1280, PX = SW / 2, PY = SH - 80, PR = 22;
  const TORX = SW / 2, TORY = SH * 0.45;   // 龙卷风固定中位缓速区
  let zombies = [], scheduleIdx = 0, gameTime = 0;
  let p = { health: 100, maxHealth: 100, level: 1, exp: 0, expToLevel: EXP_BASE, damage: 10, fireRate: 500, lastBase: -9999, kills: 0 };
  const syn = synergyMult(build.trees);
  const slots = build.trees.filter(t => t !== '木').map(t => ({ elem: t, ...attrParams(build.levels[t] || 0), last: -9999 }));
  const tornadoLv = build.trees.includes('木') ? (build.levels['木'] || 0) : 0;
  let maxZ = 0, low = 100;

  const spawnOne = (e) => {
    const tpl = ZTYPE[e.type];
    const hm = (1 + gameTime / 1000 / STAGE.hpGrow) * STAGE.healthMult;
    zombies.push({ x: Math.random() * SW, y: -50, speed: tpl.speed * STAGE.speedMult, health: tpl.health * hm, maxHealth: tpl.health * hm, damage: tpl.damage, radius: tpl.radius, type: e.type, exp: tpl.exp, slowUntil: 0, slowFactor: 1 });
  };
  const killIdx = (idx) => {
    const z = zombies[idx];
    zombies.splice(idx, 1);
    p.kills++;
    p.exp += z.exp;
    while (p.level < MAX_LEVEL && p.exp >= p.expToLevel) {
      p.exp -= p.expToLevel; p.level++; p.expToLevel = EXP_BASE * p.level; p.damage *= 1.14;
    }
  };
  const nearestN = (n) => zombies.map((z, i) => ({ i, d: Math.hypot(z.x - PX, z.y - PY) })).sort((a, b) => a.d - b.d).slice(0, n).map(o => o.i);

  let frames = 0;
  const MAXF = 60 * 60 * 12;
  while (frames < MAXF) {
    frames++;
    gameTime += DT;
    while (scheduleIdx < sched.length && gameTime >= sched[scheduleIdx].time) { spawnOne(sched[scheduleIdx]); scheduleIdx++; }
    // 基础武器（单体）
    if (gameTime - p.lastBase >= p.fireRate && zombies.length > 0) {
      p.lastBase = gameTime;
      const n = nearestN(1)[0];
      if (n != null) { zombies[n].health -= p.damage; if (zombies[n].health <= 0) killIdx(n); }
    }
    // 属性技能（多重 + 溅射，受相生全局倍率）
    for (const s of slots) {
      if (gameTime - s.last >= s.cd && zombies.length > 0) {
        s.last = gameTime;
        const targets = nearestN(s.bullets);
        for (const ti of targets) {
          if (ti == null || !zombies[ti]) continue;
          zombies[ti].health -= p.damage * syn;
          const hx = zombies[ti].x, hy = zombies[ti].y;
          for (let k = zombies.length - 1; k >= 0; k--) {
            if (k === ti) continue;
            if (Math.hypot(zombies[k].x - hx, zombies[k].y - hy) < 80) zombies[k].health -= p.damage * syn * 0.5;
          }
        }
        for (let k = zombies.length - 1; k >= 0; k--) if (zombies[k].health <= 0) killIdx(k);
      }
    }
    // 龙卷风：小范围轻微减速（无吸附）
    if (tornadoLv > 0) {
      const tr = tornadoRadius(tornadoLv);
      for (const z of zombies) { if (Math.hypot(TORX - z.x, TORY - z.y) < tr) { z.slowUntil = gameTime + 200; z.slowFactor = 0.6; } }
    }
    for (let q = zombies.length - 1; q >= 0; q--) {
      const z = zombies[q];
      let sp = z.speed * STAGE.speedMult;
      if (z.slowUntil > gameTime) sp *= z.slowFactor;
      const ang = Math.atan2(PY - z.y, PX - z.x);
      z.x += Math.cos(ang) * sp; z.y += Math.sin(ang) * sp;
      const dist = Math.hypot(PX - z.x, PY - z.y);
      if (dist < PR + z.radius) {
        z.x += Math.cos(ang) * 8; z.y += Math.sin(ang) * 8;
        p.health -= z.damage * 0.03;
        if (p.health <= 0) return { win: false, t: gameTime / 1000, lvl: p.level, maxZ, low };
      }
    }
    maxZ = Math.max(maxZ, zombies.length);
    low = Math.min(low, p.health);
    if (scheduleIdx >= sched.length && zombies.length === 0) return { win: true, t: gameTime / 1000, lvl: p.level, maxZ, low };
  }
  return { win: false, t: gameTime / 1000, lvl: p.level, maxZ, low };
}

function trial(build, n = 40) {
  let wins = 0; const ends = [], maxZ = [], lows = [];
  for (let k = 0; k < n; k++) {
    const r = runSim(build);
    if (r.win) { wins++; ends.push(r.t); }
    maxZ.push(r.maxZ); lows.push(r.low);
  }
  ends.sort((a, b) => a - b);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return { wins, n, medEnd: ends.length ? ends[Math.floor(ends.length / 2)].toFixed(0) : '-', avgMaxZ: avg(maxZ).toFixed(0), avgLow: avg(lows).toFixed(0) };
}

// 19 次三选一 = 19 级可分配；基础火力强化常驻
const BUILDS = {
  '1树-火(单树极致)':     { trees: ['火'],                levels: { 火: 19 } },
  '2树-雷+冰(相生金→水)': { trees: ['金', '水'],          levels: { 金: 10, 水: 9 } },
  '2树-火+雷(非相生)':    { trees: ['火', '金'],          levels: { 火: 10, 金: 9 } },
  '3树-雷+冰+风(链)':     { trees: ['金', '水', '木'],     levels: { 金: 7, 水: 6, 木: 6 } },
  '4树-平均(全属性)':     { trees: ['火', '金', '水', '木'], levels: { 火: 5, 金: 5, 水: 5, 木: 4 } },
};

function runAll() {
  console.log(`\n=== 相生平衡（SYNERGY_BONUS=${SYNERGY_BONUS} SPREAD_PENALTY=${SPREAD_PENALTY} HP_MUL=${HP_MUL} EXP_BASE=${EXP_BASE}）===`);
  console.log('总怪数=', buildWavePlan().totalCount, ' WAVE_INTERVAL=', buildWavePlan().WAVE_INTERVAL.toFixed(0) + 'ms');
  for (const name in BUILDS) {
    const b = BUILDS[name];
    const sm = synergyMult(b.trees);
    const r = trial(b);
    console.log(`syn×${sm.toFixed(2)}  ${name.padEnd(22)} -> ${r.wins}/${r.n}  中位${r.medEnd}s 峰值同屏${r.avgMaxZ} 最低血${r.avgLow}`);
  }
}

// 默认参数
runAll();
// 扫描 (BONUS, PENALTY) 组合，找 2树相生最高、平均(4树)最低 的参数
console.log('\n=== 参数扫描 ===');
for (const B of [0.15, 0.20, 0.25, 0.30]) {
  for (const P of [0.15, 0.20, 0.25, 0.30, 0.35]) {
    SYNERGY_BONUS = B; SPREAD_PENALTY = P;
    const r2 = trial(BUILDS['2树-雷+冰(相生金→水)'], 20);
    const r4 = trial(BUILDS['4树-平均(全属性)'], 20);
    const r1 = trial(BUILDS['1树-火(单树极致)'], 20);
    console.log(`B=${B} P=${P} | 2树相生 ${r2.wins}/20 最低血${r2.avgLow} | 1树 ${r1.wins}/20 最低血${r1.avgLow} | 4树 ${r4.wins}/20 最低血${r4.avgLow}`);
  }
}
