// 当前模型(连续出怪+经验耦合)忠实模拟器：用于重平衡「怪物血量/数量」，验证多重子弹下仍不过易。
// 用法：node scripts/sim_balance.js
const WAVE_COUNT = 20;
const INITIAL_DELAY = 1500;
const GAME_TIME_LIMIT = 5 * 60 * 1000;
const MAX_LEVEL = 20;
const DT = 1000 / 60;

// ===== 可调平衡参数（与 game - 副本.js 对应）=====
let HP_MUL = 1.5;        // 全局血量倍率（作用于 ZTYPE 基础血量）
let EXP_BASE = 3;        // 经验/升级基准：wave i 经验 = EXP_BASE*i，cost(L)=EXP_BASE*L（保持每波升1级耦合）
const STAGE = { healthMult: 1.0, hpGrow: 150, speedMult: 1.0 };

const ZTYPE = {
  normal: { health: 40 * HP_MUL, radius: 22, damage: 10, speed: 0.5, exp: 1 },
  fast:   { health: 25 * HP_MUL, radius: 18, damage: 8,  speed: 1.2, exp: 1 },
  tank:   { health: 80 * HP_MUL, radius: 30, damage: 20, speed: 0.35, exp: 2 },
  boss:   { health: 160 * HP_MUL, radius: 42, damage: 30, speed: 0.3, exp: 4 },
};

// 复刻 buildWavePlan 的组成逻辑（经验耦合版本）
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

// 生成全局出怪时间表（含每只怪的出生时刻/类型/经验/血量基准）
function buildSpawnSchedule({ plan, WAVE_INTERVAL }) {
  const sched = [];
  const JIT = 120;
  for (const w of plan) {
    for (let s = 0; s < w.comp.length; s++) {
      const type = w.comp[s];
      sched.push({
        time: w.spawnAt + s * WAVE_INTERVAL + (Math.random() * 2 - 1) * JIT,
        type,
      });
    }
  }
  sched.sort((a, b) => a.time - b.time);
  return sched;
}

// 多重子弹每级增益公式（与 game - 副本.js 的 multiShot.effect 对应）
// old: 每级 +1 发（满 5 级 +5/树，三树合计 +15）
// new: 更高等级才 +1 发：Lv3 起每级 +1（满 5 级 +3/树，三树合计 +9），首发自 Lv3 才出现
let MS_MODE = 'old';  // 当前 game 公式：每级 +1 发（= old）；floor/new 仅为历史对比
function msBonus(level) {
  if (MS_MODE === 'old') return level;
  if (MS_MODE === 'floor') return Math.floor(level / 2);   // Lv2+1, Lv4+2, Lv5+2（首发Lv2, 满级+2/树）
  return Math.max(0, level - 2);                            // Lv3+1, Lv4+2, Lv5+3（首发Lv3, 满级+3/树）
}

// 玩家构建：baseAlways(单体连射) + 至多 2 个属性技能(多重子弹 + 溅射)，更贴近后期真实负载
function runSim({ attrs = [{ cd: 4000, multishot: 5, aoeRadius: 80, aoeFactor: 0.6 }, { cd: 4000, multishot: 5, aoeRadius: 80, aoeFactor: 0.6 }] } = {}) {
  const built = buildWavePlan();
  const sched = buildSpawnSchedule(built);
  const SW = 720, SH = 1280, PX = SW / 2, PY = SH - 80, PR = 22;
  let zombies = [], scheduleIdx = 0, gameTime = 0;
  let wavesSpawned = 0;
  let p = { health: 100, maxHealth: 100, level: 1, exp: 0, expToLevel: EXP_BASE, damage: 10, fireRate: 500, lastBase: -9999, lastAttr: attrs.map(() => -9999), kills: 0 };
  let maxZombies = 0, lowHealthMoment = 100;

  const spawnOne = (e) => {
    const tpl = ZTYPE[e.type];
    const hm = (1 + gameTime / 1000 / STAGE.hpGrow) * STAGE.healthMult;
    zombies.push({
      x: Math.random() * SW, y: -50, speed: tpl.speed * STAGE.speedMult,
      health: tpl.health * hm, maxHealth: tpl.health * hm, damage: tpl.damage,
      radius: tpl.radius, type: e.type, exp: tpl.exp,
    });
  };

  const killIdx = (idx) => {
    const z = zombies[idx];
    zombies.splice(idx, 1);
    p.kills++;
    p.exp += z.exp;
    while (p.level < MAX_LEVEL && p.exp >= p.expToLevel) {
      p.exp -= p.expToLevel;
      p.level++;
      p.expToLevel = EXP_BASE * p.level;
      p.damage *= 1.14;
    }
  };

  const nearestN = (n) => {
    const arr = zombies.map((z, i) => ({ i, d: Math.hypot(z.x - PX, z.y - PY) }))
      .sort((a, b) => a.d - b.d).slice(0, n).map(o => o.i);
    return arr;
  };

  const fireAttr = (a, slot) => {
    const targets = nearestN(1 + msBonus(a.multishot));
    for (const ti of targets) {
      if (ti == null || !zombies[ti]) continue;
      zombies[ti].health -= p.damage;
      const hx = zombies[ti].x, hy = zombies[ti].y;
      for (let k = zombies.length - 1; k >= 0; k--) {
        if (k === ti) continue;
        if (Math.hypot(zombies[k].x - hx, zombies[k].y - hy) < a.aoeRadius)
          zombies[k].health -= p.damage * a.aoeFactor;
      }
    }
    for (let k = zombies.length - 1; k >= 0; k--) if (zombies[k].health <= 0) killIdx(k);
  };

  let frames = 0;
  const MAXF = 60 * 60 * 12;
  while (frames < MAXF) {
    frames++;
    gameTime += DT;
    while (scheduleIdx < sched.length && gameTime >= sched[scheduleIdx].time) {
      spawnOne(sched[scheduleIdx]); scheduleIdx++;
    }
    // 基础武器
    if (gameTime - p.lastBase >= p.fireRate && zombies.length > 0) {
      p.lastBase = gameTime;
      const n = nearestN(1)[0];
      if (n != null) { zombies[n].health -= p.damage; if (zombies[n].health <= 0) killIdx(n); }
    }
    // 属性技能（多重子弹 + 溅射）
    for (let s = 0; s < attrs.length; s++) {
      const a = attrs[s];
      if (gameTime - p.lastAttr[s] >= a.cd && zombies.length > 0) {
        p.lastAttr[s] = gameTime;
        fireAttr(a, s);
      }
    }
    // 移动 + 贴身掉血
    for (let q = zombies.length - 1; q >= 0; q--) {
      const z = zombies[q];
      const ang = Math.atan2(PY - z.y, PX - z.x);
      z.x += Math.cos(ang) * z.speed;
      z.y += Math.sin(ang) * z.speed;
      const dist = Math.hypot(PX - z.x, PY - z.y);
      if (dist < PR + z.radius) {
        z.x += Math.cos(ang) * 8; z.y += Math.sin(ang) * 8;
        p.health -= z.damage * 0.03;
        if (p.health <= 0) return { win: false, wave: wavesSpawned, t: gameTime / 1000, lvl: p.level, maxZombies, low: lowHealthMoment };
      }
    }
    maxZombies = Math.max(maxZombies, zombies.length);
    lowHealthMoment = Math.min(lowHealthMoment, p.health);
    wavesSpawned = Math.min(WAVE_COUNT, Math.floor((gameTime - INITIAL_DELAY) / built.WAVE_INTERVAL) + 1);
    if (scheduleIdx >= sched.length && zombies.length === 0) {
      return { win: true, t: gameTime / 1000, lvl: p.level, maxZombies, low: lowHealthMoment, health: p.health };
    }
  }
  return { win: false, wave: wavesSpawned, t: gameTime / 1000, lvl: p.level, maxZombies, low: lowHealthMoment, reason: 'timeout' };
}

function trial(opts, n = 30) {
  let wins = 0; const ends = [], maxZ = [], lows = [];
  for (let k = 0; k < n; k++) {
    const r = runSim(opts);
    if (r.win) { wins++; ends.push(r.t); }
    maxZ.push(r.maxZombies); lows.push(r.low);
  }
  ends.sort((a, b) => a - b);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return { wins, n, medEnd: ends.length ? ends[Math.floor(ends.length / 2)].toFixed(0) : '-', avgMaxZ: avg(maxZ).toFixed(0), avgLow: avg(lows).toFixed(0) };
}

const NO_ATTR = [];
const SINGLE_AOE = [{ cd: 4000, multishot: 0, aoeRadius: 80, aoeFactor: 0.6 }];
const MULTI_1 = [{ cd: 4000, multishot: 5, aoeRadius: 80, aoeFactor: 0.6 }];
const MULTI_2 = [{ cd: 4000, multishot: 5, aoeRadius: 80, aoeFactor: 0.6 }, { cd: 4000, multishot: 5, aoeRadius: 80, aoeFactor: 0.6 }];

console.log('=== 平衡模拟（HP_MUL=' + HP_MUL + ' EXP_BASE=' + EXP_BASE + '）===');
console.log('总怪数=', buildWavePlan().totalCount, ' WAVE_INTERVAL=', buildWavePlan().WAVE_INTERVAL.toFixed(0) + 'ms');
console.log('【仅单体(无属性)】      :', JSON.stringify(trial({ attrs: NO_ATTR })));
console.log('【单属性 无多重+AoE】    :', JSON.stringify(trial({ attrs: SINGLE_AOE })));
console.log('【单属性 多重Lv5+AoE】   :', JSON.stringify(trial({ attrs: MULTI_1 })));
console.log('【双属性 多重Lv5+AoE】   :', JSON.stringify(trial({ attrs: MULTI_2 })));

console.log('\n=== 早期难度对比：弱玩家(仅基础枪) 在 EXP_BASE=3 vs 2 下的峰值同屏/最低血 ===');
HP_MUL = 1.5; STAGE.healthMult = 1.0; STAGE.hpGrow = 150;
for (const eb of [3, 2]) {
  EXP_BASE = eb;
  console.log(`EXP_BASE=${eb} 总怪数=${buildWavePlan().totalCount} 间隔=${buildWavePlan().WAVE_INTERVAL.toFixed(0)}ms`);
  console.log(`  仅基础枪 :`, JSON.stringify(trial({ attrs: NO_ATTR }, 30)));
  console.log(`  单属性AoE:`, JSON.stringify(trial({ attrs: SINGLE_AOE }, 30)));
}

console.log('\n=== 多重削弱对比：old(每级+1) / floor(Lv2+1,Lv5+2) / new(Lv3+1,Lv5+3) ===');
HP_MUL = 1.5; EXP_BASE = 3; STAGE.healthMult = 1.0; STAGE.hpGrow = 150;
for (const mode of ['old', 'floor', 'new']) {
  MS_MODE = mode;
  console.log(`[${mode}] 单属性Lv5 :`, JSON.stringify(trial({ attrs: MULTI_1 }, 30)));
  console.log(`[${mode}] 双属性Lv5 :`, JSON.stringify(trial({ attrs: MULTI_2 }, 30)));
}

console.log('\n=== 网格扫描（HP_MUL / EXP_BASE，stage.healthMult=1 hpGrow=150）===');
console.log('-- 单属性 多重Lv5 --');
for (const hm of [1.5, 2.0, 2.5]) {
  for (const eb of [4, 6, 8, 10]) {
    HP_MUL = hm; EXP_BASE = eb; STAGE.healthMult = 1.0; STAGE.hpGrow = 150;
    const r = trial({ attrs: MULTI_1 }, 16);
    console.log(`HP_MUL=${hm} EXP_BASE=${eb} -> ${r.wins}/${r.n} 中位${r.medEnd}s 峰值${r.avgMaxZ} 最低血${r.avgLow}`);
  }
}
console.log('-- 双属性 多重Lv5 --');
for (const hm of [1.5, 2.0, 2.5]) {
  for (const eb of [4, 6, 8, 10]) {
    HP_MUL = hm; EXP_BASE = eb; STAGE.healthMult = 1.0; STAGE.hpGrow = 150;
    const r = trial({ attrs: MULTI_2 }, 16);
    console.log(`HP_MUL=${hm} EXP_BASE=${eb} -> ${r.wins}/${r.n} 中位${r.medEnd}s 峰值${r.avgMaxZ} 最低血${r.avgLow}`);
  }
}
