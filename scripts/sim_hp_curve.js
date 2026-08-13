// 校准：怪物血量增长曲线（波次指数型）vs 技能指数型增长
// 目标：1~5 波(前lv5)血量≈当前(×1.0)，之后指数上升以匹配技能强度，避免后期"秒杀"
// 用法：node scripts/sim_hp_curve.js
const WAVE_COUNT = 20;
const INITIAL_DELAY = 1500;
const GAME_TIME_LIMIT = 5 * 60 * 1000;
const MAX_LEVEL = 20;
const DT = 1000 / 60;

const HP_MUL = 1.5;            // 与 game - 副本.js 一致（zombieTypes 已含）
const EXP_BASE = 2;            // 与 game - 副本.js 一致（v1.1.6 降回 2）
const BASE_DMG = 10;
const DMG_PER_LV = 1.14;       // 火力强化每级 ×1.14（强构建近似：每级都点伤害）

// 当前 game 的实际基础血量（已含 ×1.5）
const ZTYPE = {
  normal: { health: 60, radius: 22, damage: 10, speed: 0.5, exp: 1 },
  fast:   { health: 38, radius: 18, damage: 8,  speed: 1.2, exp: 1 },
  tank:   { health: 120, radius: 30, damage: 20, speed: 0.35, exp: 2 },
  boss:   { health: 240, radius: 42, damage: 30, speed: 0.3, exp: 4 },
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

// 强构建：每级点伤害（×1.14），属性树满级 + floor 多重(每树+2) + 溅射
// 用来估算"后期单发/单波次伤害"相对怪物血量的关系
function runSim({ HP_GROW = 1.0, HP_ANCHOR = 5, attrs = 2, multishot = 5, aoeRadius = 80, aoeFactor = 0.6, damageEveryLevel = true }) {
  const built = buildWavePlan();
  const totalCount = built.totalCount, WAVE_INTERVAL = built.WAVE_INTERVAL;
  const sched = [];
  for (const w of built.plan) {
    for (let s = 0; s < w.comp.length; s++) {
      sched.push({ time: w.spawnAt + s * WAVE_INTERVAL, type: w.comp[s], wave: w.i });
    }
  }
  sched.sort((a, b) => a.time - b.time);
  const SW = 720, SH = 1280, PX = SW / 2, PY = SH - 80, PR = 22;
  let zombies = [], scheduleIdx = 0, gameTime = 0;
  let p = { health: 100, maxHealth: 100, level: 1, exp: 0, expToLevel: EXP_BASE, damage: BASE_DMG, fireRate: 500, lastBase: -9999, lastAttr: Array(attrs).fill(-9999), kills: 0 };
  let maxZ = 0, earlyPeak = 0, lowHealth = 100, dmgAtWave = {};

  const hpOf = (type, wave) => ZTYPE[type].health * Math.pow(HP_GROW, Math.max(0, wave - HP_ANCHOR));
  const spawnOne = (e) => {
    const h = hpOf(e.type, e.wave);
    zombies.push({ x: Math.random() * SW, y: -50, speed: ZTYPE[e.type].speed, health: h, maxHealth: h, damage: ZTYPE[e.type].damage, radius: ZTYPE[e.type].radius, type: e.type, exp: ZTYPE[e.type].exp, wave: e.wave });
  };
  const killIdx = (idx) => {
    const z = zombies[idx]; zombies.splice(idx, 1); p.kills++; p.exp += z.exp;
    while (p.level < MAX_LEVEL && p.exp >= p.expToLevel) {
      p.exp -= p.expToLevel; p.level++; p.expToLevel = EXP_BASE * p.level;
      if (damageEveryLevel) p.damage *= DMG_PER_LV;
    }
  };
  const nearestN = (n) => zombies.map((z, i) => ({ i, d: Math.hypot(z.x - PX, z.y - PY) })).sort((a, b) => a.d - b.d).slice(0, n).map(o => o.i);

  let frames = 0; const MAXF = 60 * 60 * 12;
  while (frames < MAXF) {
    frames++; gameTime += DT;
    while (scheduleIdx < sched.length && gameTime >= sched[scheduleIdx].time) { spawnOne(sched[scheduleIdx]); scheduleIdx++; }
    // 基础武器：单体
    if (gameTime - p.lastBase >= p.fireRate && zombies.length > 0) {
      p.lastBase = gameTime; const n = nearestN(1)[0];
      if (n != null) { zombies[n].health -= p.damage; if (zombies[n].health <= 0) killIdx(n); }
    }
    // 属性技能：多重 + 溅射
    for (let a = 0; a < attrs; a++) {
      if (gameTime - p.lastAttr[a] >= 4000 && zombies.length > 0) {
        p.lastAttr[a] = gameTime;
        const targets = nearestN(1 + multishot);   // 当前 multiShot：每级 +1 发
        for (const ti of targets) {
          if (ti == null || !zombies[ti]) continue;
          zombies[ti].health -= p.damage;
          const hx = zombies[ti].x, hy = zombies[ti].y;
          for (let k = zombies.length - 1; k >= 0; k--) {
            if (k === ti) continue;
            if (Math.hypot(zombies[k].x - hx, zombies[k].y - hy) < aoeRadius) zombies[k].health -= p.damage * aoeFactor;
          }
        }
        for (let k = zombies.length - 1; k >= 0; k--) if (zombies[k].health <= 0) killIdx(k);
      }
    }
    // 移动 + 贴身掉血
    for (let q = zombies.length - 1; q >= 0; q--) {
      const z = zombies[q];
      const ang = Math.atan2(PY - z.y, PX - z.x);
      z.x += Math.cos(ang) * z.speed; z.y += Math.sin(ang) * z.speed;
      const dist = Math.hypot(PX - z.x, PY - z.y);
      if (dist < PR + z.radius) { z.x += Math.cos(ang) * 8; z.y += Math.sin(ang) * 8; p.health -= z.damage * 0.03; if (p.health <= 0) return { win: false, wave: p.level, t: gameTime / 1000, maxZ, earlyPeak, low: lowHealth }; }
    }
    maxZ = Math.max(maxZ, zombies.length);
    if (p.level <= 5) earlyPeak = Math.max(earlyPeak, zombies.length);
    lowHealth = Math.min(lowHealth, p.health);
    if (scheduleIdx >= sched.length && zombies.length === 0) return { win: true, t: gameTime / 1000, lvl: p.level, maxZ, earlyPeak, low: lowHealth };
  }
  return { win: false, wave: p.level, t: gameTime / 1000, lvl: p.level, maxZ, earlyPeak, low: lowHealth, reason: 'timeout' };
}

function trial(opts, n = 24) {
  let wins = 0; const maxZ = [], early = [];
  for (let k = 0; k < n; k++) { const r = runSim(opts); if (r.win) wins++; maxZ.push(r.maxZ); early.push(r.earlyPeak); }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return { wins, n, avgMaxZ: avg(maxZ).toFixed(0), avgEarly: avg(early).toFixed(0) };
}

const built = buildWavePlan();
// 1) 理论：强构建"单发/单波次伤害" vs 各波怪物血量，看几波开始被"秒杀"
console.log('=== 理论：强构建(每级点伤害) 单发伤害 vs 怪物血量（normal/boss）===');
console.log('波次 | 玩家单发伤害 | normal血(线性旧) | boss血(线性旧) | normal血(G^波) | boss血(G^波)');
for (let w = 1; w <= 20; w += (w <= 5 ? 1 : (w % 5 === 0 ? 1 : 4))) {
  const dmg = BASE_DMG * Math.pow(DMG_PER_LV, w - 1);
  const linN = 60 * (1 + 0); // 近似：用旧时间曲线在波次w的倍率较复杂，这里只算 G 曲线
  const gN = 60 * Math.pow(1.18, Math.max(0, w - 5));
  const gB = 240 * Math.pow(1.18, Math.max(0, w - 5));
  console.log(`${String(w).padStart(2)} | ${dmg.toFixed(0).padStart(6)} |  -  |  -  | ${gN.toFixed(0).padStart(6)} (${ (gN/dmg).toFixed(1)}发) | ${gB.toFixed(0).padStart(6)} (${ (gB/dmg).toFixed(1)}发)`);
}

console.log('\n=== 全量扫描 HP_GROW（强构建2树多重Lv5，前5波峰值应≈不变）===');
console.log('HP_GROW | 胜率 | 峰值同屏 | 前5波峰值');
for (const G of [1.0, 1.10, 1.15, 1.18, 1.22, 1.28, 1.35]) {
  const r = trial({ HP_GROW: G, HP_ANCHOR: 5 }, 20);
  console.log(`${G.toFixed(2)} | ${r.wins}/${r.n} | ${r.avgMaxZ} | ${r.avgEarly}`);
}
