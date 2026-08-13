// 忠实单树(冰/水)进攻模型 v2：纳入游戏里冰系全部机制 + 所有 build 通用的进攻（基础枪火力强化伤害分支、地雷、炸弹、死亡射线）
// 目的：验证"缩短冰 CD"后，单树冰能否撑起主输出（对抗 v1.1.7 波次指数血量 G=1.18）
// 用法：node scripts/sim_freeze.js
const WAVE_COUNT = 20;
const INITIAL_DELAY = 1500;
const GAME_TIME_LIMIT = 5 * 60 * 1000;
const MAX_LEVEL = 20;
const DT = 1000 / 60;

const HP_MUL = 1.5;
const EXP_BASE = 2;
const BASE_DMG = 10;
const DMG_PER_LV = 1.14;

const ZOMBIE_ELEMENTS = ['金', '木', '水', '火', '土'];
function elemBonus(atkEl, zEl) {
  if (atkEl === '水' && zEl === '火') return 1.30;
  return 1.0;
}

const ZTYPE = {
  normal: { health: 60, radius: 22, damage: 10, speed: 0.5, exp: 1 },
  fast:   { health: 38, radius: 18, damage: 8,  speed: 1.2, exp: 1 },
  tank:   { health: 120, radius: 30, damage: 20, speed: 0.35, exp: 2 },
  boss:   { health: 240, radius: 42, damage: 30, speed: 0.3, exp: 4 },
};

let FREEZE_CFG = { base: 6000, min: 3000, step: 150 };   // 候选（已改游戏）
// 单树冰构建（19次三选一内）：火力强化拉基础伤害 + 冰树多重/急速/暴击 + 通用部署(地雷/炸弹/死亡射线) + 基础枪伤害分支
let BUILD = {
  fireLv: 10,            // 火力强化等级（×1.14/级，决定所有来源的基础伤害）
  fireBranchLv: 5,       // 基础枪伤害分支(重型枪管/蓄能：dmgMul ×1.20^bl 或 ×1.35^bl)
  freezeLv: 10,          // 干冰弹基础等级（影响爆炸半径、范围冻结概率）
  multiShot: 5, highSpeed: 5, crit: 5, pierce: 0, glacier: 0, frostBite: 0, deepFreeze: 0, frostNova: 0, polarField: 0, glacialDoom: 0,
  mineLv: 5, bombLv: 3, rayLv: 5   // 通用部署（任何 build 都有）
};

function buildWavePlan() {
  const plan = [];
  for (let i = 1; i <= WAVE_COUNT; i++) {
    const targetExp = EXP_BASE * i;
    const isBoss = (i % 5 === 0);
    const comp = [];
    let remaining = targetExp;
    if (isBoss) { comp.push('boss'); remaining -= 4; }
    if (i >= 3) { const tk = Math.min(Math.floor(i / 3), Math.floor(remaining / 2)); for (let k = 0; k < tk; k++) { comp.push('tank'); remaining -= 2; } }
    if (i >= 2 && !isBoss && i % 2 === 0) { const f = Math.min(3, remaining); for (let k = 0; k < f; k++) { comp.push('fast'); remaining -= 1; } }
    while (remaining > 0) { comp.push('normal'); remaining -= 1; }
    plan.push({ i, comp });
  }
  const totalCount = plan.reduce((s, w) => s + w.comp.length, 0);
  const WAVE_INTERVAL = (GAME_TIME_LIMIT - INITIAL_DELAY) / totalCount;
  let t = INITIAL_DELAY;
  for (const w of plan) { w.spawnAt = t; t += w.comp.length * WAVE_INTERVAL; }
  return { plan, totalCount, WAVE_INTERVAL };
}

function getFreezeCd() {
  const cfg = FREEZE_CFG;
  let cd = cfg.base - BUILD.highSpeed * cfg.step;
  const reduce = (BUILD.highSpeed > 0) ? (0.08 * BUILD.highSpeed) : 0;
  cd *= (1 - reduce);
  return Math.max(cfg.min, cd);
}

function runSim() {
  const built = buildWavePlan();
  const sched = [];
  for (const w of built.plan) for (let s = 0; s < w.comp.length; s++) sched.push({ time: w.spawnAt + s * built.WAVE_INTERVAL, type: w.comp[s], wave: w.i, el: ZOMBIE_ELEMENTS[Math.floor(Math.random() * 5)] });
  sched.sort((a, b) => a.time - b.time);

  const SW = 720, SH = 1280, PX = SW / 2, PY = SH - 80, PR = 22;
  let zombies = [], scheduleIdx = 0, gameTime = 0;
  const playerDmg = BASE_DMG * Math.pow(DMG_PER_LV, BUILD.fireLv);
  // 基础枪伤害分支（重型枪管/蓄能，×1.20 或 ×1.35/级）
  const fireBranchMul = Math.pow(1.35, BUILD.fireBranchLv);
  let p = { health: 100, maxHealth: 100, level: 1, exp: 0, expToLevel: EXP_BASE, kills: 0 };
  let maxZ = 0, lowHealth = 100;
  let lastFreeze = -99999, lastBase = -99999, lastMine = -99999, lastBomb = -99999, lastRay = -99999;

  const hpOf = (type, wave) => ZTYPE[type].health * Math.pow(1.18, Math.max(0, wave - 5));
  const spawnOne = (e) => { const h = hpOf(e.type, e.wave); zombies.push({ x: Math.random() * SW, y: -50, speed: ZTYPE[e.type].speed, health: h, maxHealth: h, damage: ZTYPE[e.type].damage, radius: ZTYPE[e.type].radius, type: e.type, exp: ZTYPE[e.type].exp, el: e.el, wave: e.wave, frozen: 0, slow: 0, _polar: 0 }); };
  const killIdx = (idx) => { const z = zombies[idx]; zombies.splice(idx, 1); p.kills++; p.exp += z.exp; while (p.level < MAX_LEVEL && p.exp >= p.expToLevel) { p.exp -= p.expToLevel; p.level++; p.expToLevel = EXP_BASE * p.level; } };
  const nearestN = (n) => zombies.map((z, i) => ({ i, d: Math.hypot(z.x - PX, z.y - PY) })).sort((a, b) => a.d - b.d).slice(0, n).map(o => o.i);
  function damageZ(z, d, el) { d *= elemBonus(el || '水', z.el); z.health -= d; if (z.health <= 0) { const i = zombies.indexOf(z); if (i >= 0) killIdx(i); } }
  const aoe = (x, y, r, d, el) => { for (let k = zombies.length - 1; k >= 0; k--) { const o = zombies[k]; if (Math.hypot(o.x - x, o.y - y) < r) damageZ(o, d, el); } };
  const critChance = 0.05 * BUILD.crit, critDmg = 1 + 0.15 * BUILD.crit;

  // 干冰弹新机制：主目标必定冻结+减速；命中产生范围冰霜爆炸（伤害+范围减速+概率范围冻结）
  const freezeDuration = () => {
    let base = 1000 + BUILD.freezeLv * 120;
    base *= (1 + 0.20 * BUILD.deepFreeze);
    return Math.min(3000, base);
  };
  const slowFactor = () => Math.max(0.2, 0.7 - 0.01 * 0 - 0.05 * BUILD.frostBite); // 天赋简化取0
  const freezeRadius = () => (45 + BUILD.freezeLv * 5) * (1 + 0.12 * BUILD.glacier + 0.20 * BUILD.frostNova);
  const aoeFreezeChance = () => Math.min(0.95, 0.08 * BUILD.glacier + 0.15 * BUILD.frostNova);  // 冰川+冰霜新星共同提供范围冻结概率
  const frostNovaDmgMul = () => Math.pow(1.25, BUILD.frostNova);
  const frostNovaFreezeChance = () => Math.min(1, 0.15 * BUILD.frostNova);  // 冰霜新星：概率冻结（每级+15%）

  const MULTI_BULLET_DMG_PENALTY = 0.15;  // 与 game - 副本.js 一致
  const WATER_BASE_DMG_MUL = 1.35;        // 与 game - 副本.js 一致：基础去冰冻，以更高直伤补偿
  const freezeHit = (z) => {
    let dmg = playerDmg / (1 + MULTI_BULLET_DMG_PENALTY * BUILD.multiShot) * WATER_BASE_DMG_MUL;  // 多发衰减 + 水基础倍率
    if (BUILD.crit > 0 && Math.random() < critChance) dmg *= critDmg;
    if (BUILD.crit >= 5) aoe(z.x, z.y, 45, playerDmg * 0.25, '水');
    if (BUILD.pierce >= 5) aoe(z.x, z.y, 30, playerDmg * 0.20, '水');
    damageZ(z, dmg, '水');

    // 基础不再冻结(硬控)：主目标仅减速(软控)；冻结下放冰霜新星分支
    z.slow = 2200;
    z.slowFactor = slowFactor();

    // 冰霜爆炸：范围伤害(冰霜新星增伤) + 范围减速；冻结仅由冰川/冰霜新星概率提供
    const r = freezeRadius();
    const aoeMul = frostNovaDmgMul();
    const novaChance = frostNovaFreezeChance();
    for (const o of zombies) {
      if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < r + o.radius) {
        damageZ(o, dmg * 0.30 * aoeMul, '水');
        o.slow = 2200;
        o.slowFactor = slowFactor();
        if (Math.random() < aoeFreezeChance()) o.frozen = freezeDuration();
      }
    }
    // 冰霜新星：命中点主目标也按冰霜新星概率冻结，使绝对零度(处决)可对主目标生效（不再必定）
    if (Math.random() < novaChance) z.frozen = freezeDuration();

    // 冰封处决（绝对零度）：对所有被冻结目标(主目标+范围)追加最大生命%（随关卡血量膨胀放大）
    if (BUILD.glacialDoom > 0) {
      if (z.frozen > 0) damageZ(z, z.maxHealth * 0.03 * BUILD.glacialDoom, '水');
      for (const o of zombies) { if (o !== z && o.frozen > 0) damageZ(o, o.maxHealth * 0.03 * BUILD.glacialDoom, '水'); }
    }

    if (BUILD.polarField > 0 && Math.random() < Math.min(1, 0.25 * BUILD.polarField)) z._polar = 3000;
  };

  const freezeCd = getFreezeCd();
  const nBullets = 1 + BUILD.multiShot;
  const mineInterval = 3500, mineRadius = 40 + BUILD.mineLv * 12, mineDmg = playerDmg * (0.5 + BUILD.mineLv * 0.12) * 2;
  const bombInterval = 30000, bombRadius = 90, bombDmg = playerDmg * (1.0 + BUILD.bombLv * 0.4);
  const rayInterval = 15000, rayDmg = playerDmg * (2 + BUILD.rayLv);

  let frames = 0; const MAXF = 60 * 60 * 12;
  while (frames < MAXF) {
    frames++; gameTime += DT;
    while (scheduleIdx < sched.length && gameTime >= sched[scheduleIdx].time) { spawnOne(sched[scheduleIdx]); scheduleIdx++; }
    // 基础枪（火力强化单体，吃伤害分支 dmgMul）
    if (gameTime - lastBase >= 500 && zombies.length > 0) {
      lastBase = gameTime; const n = nearestN(1)[0];
      if (n != null) { let d = playerDmg * fireBranchMul; if (BUILD.crit > 0 && Math.random() < critChance) d *= critDmg; damageZ(zombies[n], d, '水'); }
    }
    // 冰系主输出
    if (gameTime - lastFreeze >= freezeCd && zombies.length > 0) {
      lastFreeze = gameTime; for (const ti of nearestN(nBullets)) if (ti != null && zombies[ti]) freezeHit(zombies[ti]);
    }
    // 地雷（自动，通用）
    if (gameTime - lastMine >= mineInterval && zombies.length > 0) {
      lastMine = gameTime; const t = nearestN(1)[0]; if (t != null) aoe(zombies[t].x, zombies[t].y, mineRadius, mineDmg, '物理');
    }
    // 炸弹（手动触发，按冷却建模为周期上限）
    if (gameTime - lastBomb >= bombInterval && zombies.length > 0) {
      lastBomb = gameTime; const t = nearestN(1)[0]; if (t != null) aoe(zombies[t].x, zombies[t].y, bombRadius, bombDmg, '物理');
    }
    // 死亡射线（通用，简化：全屏直线高伤）
    if (gameTime - lastRay >= rayInterval && zombies.length > 0) {
      lastRay = gameTime; for (const z of zombies.slice()) damageZ(z, rayDmg * 0.6, '物理');
    }
    // 极寒领域持续
    for (let q = zombies.length - 1; q >= 0; q--) { const z = zombies[q]; if (z._polar > 0) { z._polar -= DT; damageZ(z, playerDmg * 0.05, '水'); if (z.health <= 0) continue; z.slow = 1; } }
    // 移动（冻结/减速）
    for (let q = zombies.length - 1; q >= 0; q--) {
      const z = zombies[q];
      let sp = z.speed;
      if (z.frozen > 0) { z.frozen -= DT; sp = z.speed * 0.1; } else if (z.slow > 0) { z.slow -= DT; sp = z.speed * 0.5; }
      const ang = Math.atan2(PY - z.y, PX - z.x);
      z.x += Math.cos(ang) * sp; z.y += Math.sin(ang) * sp;
      const dist = Math.hypot(PX - z.x, PY - z.y);
      if (dist < PR + z.radius) { z.x += Math.cos(ang) * 8; z.y += Math.sin(ang) * 8; p.health -= z.damage * 0.03; if (p.health <= 0) return { win: false, lvl: p.level, t: gameTime / 1000, maxZ, low: lowHealth }; }
    }
    maxZ = Math.max(maxZ, zombies.length);
    lowHealth = Math.min(lowHealth, p.health);
    if (scheduleIdx >= sched.length && zombies.length === 0) return { win: true, t: gameTime / 1000, lvl: p.level, maxZ, low: lowHealth };
  }
  return { win: false, lvl: p.level, t: gameTime / 1000, maxZ, low: lowHealth, reason: 'timeout' };
}

function trial(n = 40) {
  let wins = 0; const maxZ = [], low = [];
  for (let k = 0; k < n; k++) { const r = runSim(); if (r.win) wins++; maxZ.push(r.maxZ); low.push(r.low); }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return { wins, n, avgMaxZ: avg(maxZ).toFixed(0), avgLow: avg(low).toFixed(0), freezeCd: getFreezeCd().toFixed(0) };
}

function scenario(name, build) {
  BUILD = build;
  const radius = (45 + build.freezeLv * 5) * (1 + 0.12 * build.glacier + 0.20 * build.frostNova);
  const aoeChance = Math.min(0.95, 0.08 * build.glacier);  // 仅冰川分支提供范围冻结概率（基础0）
  console.log(`\n[${name}] 火力强化Lv${build.fireLv} 干冰弹Lv${build.freezeLv} 冰多重${build.multiShot} 急速${build.highSpeed} 暴击${build.crit} 基础枪分支Lv${build.fireBranchLv} 雷${build.mineLv} 弹${build.bombLv} 射线${build.rayLv}`);
  console.log('  单发基础伤害=', (BASE_DMG * Math.pow(DMG_PER_LV, build.fireLv)).toFixed(1), ' 冰CD=', getFreezeCd().toFixed(0) + 'ms', ' 爆炸半径=', radius.toFixed(0), ' 范围冻结=', (aoeChance*100).toFixed(0) + '%');
  console.log('  ', JSON.stringify(trial(40)));
}

console.log('=== 单树冰 忠实模拟(含全部通用进攻) vs G=1.18 波次指数血量 ===');
console.log('玩家单发基础伤害 = 火力强化等级决定；所有来源(基础枪/冰弹/地雷/炸弹/射线)都吃它');
scenario('A.均衡单树冰(全机制)', { fireLv: 10, fireBranchLv: 5, freezeLv: 10, multiShot: 5, highSpeed: 5, crit: 5, pierce: 0, glacier: 0, frostBite: 0, deepFreeze: 0, frostNova: 0, polarField: 0, glacialDoom: 0, mineLv: 5, bombLv: 3, rayLv: 5 });
scenario('B.全力堆伤害单树冰', { fireLv: 14, fireBranchLv: 5, freezeLv: 14, multiShot: 5, highSpeed: 0, crit: 0, pierce: 0, glacier: 0, frostBite: 0, deepFreeze: 0, frostNova: 0, polarField: 0, glacialDoom: 0, mineLv: 5, bombLv: 3, rayLv: 5 });
scenario('C.冰系质变全开(牺牲基础伤害)', { fireLv: 6, fireBranchLv: 3, freezeLv: 16, multiShot: 5, highSpeed: 5, crit: 5, pierce: 5, glacier: 5, frostBite: 0, deepFreeze: 5, frostNova: 5, polarField: 5, glacialDoom: 5, mineLv: 5, bombLv: 3, rayLv: 5 });
