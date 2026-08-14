// 五树 DPS 回归（火=爆炸弹 / 金=闪电链 / 水=干冰弹 / 木=滚木 / 土=地刺）
// 目的：在「相等构建预算 + 相同靶场」下，验证四棵属性树的可持续 DPS 是否平衡（单树相生倍率=1.0，四树共享口径）。
// 方法：静态不死僵尸阵（12 钉墙 + 12 上方列队，共 24）作为靶子，忠实复刻 game.js 的释放/CD/碾压/链电/领域/碎木/质变机制，
//       跑 30s×20 次取平均 DPS。
// 口径说明：
//  - 只测属性树自身输出（不含基础枪火力强化），隔离树机制；player.damage=10，全部 DPS 随其线性缩放。
//  - 五行标配 +35%（ATTR_BASE_DMG_MUL）；单树相生倍率 wuxingSynergyMult=1（pairs=0,treeCount=1）。
//  - 暴击：天赋基数 率0/伤2 + 分支(率+5%/级、伤+15%/级)；滚木暴击在释放时快照（与游戏一致）。
//  - 僵尸 element='normal'，故 getElementBonus 统一 ×(1+WUXING_BASE_BONUS=0.30)；单树状态×元素加成(slow→金 +0.3 等)在单树场景不触发(无对应状态施放方)。
// 用法：node scripts/sim_dps.js

// ===================== 常量（与 game.js 对齐）=====================
const SW = 720, SH = 1280, WALL_Y = SH * 0.82;   // 1049.6
const PX = SW / 2, PY = SH - 80;                  // 坦克位置
const PD = 10;                                    // player.damage（基准；DPS 随其线性缩放）
const ATTR_BASE_DMG_MUL = 1.35;
const MULTI_BULLET_DMG_PENALTY = 0.15;
const ATTR_BULLET_SPEED_MUL = 0.7;
const BULLET_SPEED = 10;                          // player.bulletSpeed 基准
const WUXING_BASE_BONUS = 0.30;
const WUXING_GENERATE_BONUS = 0.20;
const WUXING_SPREAD_PENALTY = 0.45;
const WUXING_GENERATE = { '火': '土', '土': '金', '金': '水', '水': '木', '木': '火' };
const WUXING_ELEMENT = { '火': '火', '金': '金', '水': '水', '木': '木', '土': '土' };
const STATUS_ELEMENT_BONUS = { frozen: { '火': 1.0 }, slow: { '金': 0.3 }, burning: { '风': 0.2 } };

// 滚木
const WOOD_LOG_BASE_WIDTH_RATIO = 0.25;
const WOOD_LOG_SPEED_MUL = 0.30;
const WOOD_LOG_THICKNESS = 28;
const WOOD_LOG_HIT_INTERVAL = 280;
const WOOD_LOG_DMG_FACTOR = 0.47;
const WOOD_SPLINTER_INTERVAL = 600;
const WOOD_SPLINTER_RADIUS = 70;
const WOOD_SPLINTER_DMG = 0.25;
const WOOD_LOG_RELEASE_INTERVAL = 260;

// 静电场
const STATIC_FIELD_BASE_RADIUS = 55, STATIC_FIELD_RADIUS_PER_LV = 12;
const STATIC_FIELD_BASE_LIFE = 2600, STATIC_FIELD_LIFE_PER_LV = 200;
const BURN_DURATION = 1500;

// 全局属性树范围技能半径上限 = 陷坑原初始半径(80) × 2/3；与 game.js GLOBAL_MAX_AOE_RADIUS 同步（v1.1.31）
const GLOBAL_MAX_AOE_RADIUS = 53;

const ATTR_CD_CFG = {
  explosive: { base: 6000, min: 3000, step: 100 },
  freeze:    { base: 6000, min: 3000, step: 150 },
  lightning: { base: 4000, min: 3000, step: 50 },
  wood:      { base: 6500, min: 3500, step: 120 },
  earth:     { base: 5000, min: 3000, step: 80 },
};

// 土系（地刺）：与 game.js 对齐
const EARTH_SPIKE_BASE_DURATION = 1200; // 地刺基础持续时间(ms)
const EARTH_SPIKE_HIT_INTERVAL  = 600;  // 同一敌人被同一地刺伤害的间隔(ms)
const EARTH_SPIKE_BASE_RADIUS   = 20;   // 地刺基础伤害范围(px)：与 game.js 同步（v1.1.29 起减半）
const EARTH_SPIKE_DMG_FACTOR    = 1.45; // 地刺基础每跳伤害系数（调平用，与 game.js 同步；半径减半后上调回正 T1）
const EARTH_SPIKE_MAX_COUNT     = 6;    // 场上地刺簇数量上限
const EARTH_SHIELD_BASE_HP = 80, EARTH_SHIELD_BASE_WIDTH = 90, EARTH_SHIELD_BASE_DURATION = 3000, EARTH_SHIELD_MAX_COUNT = 4, EARTH_SHIELD_ATTACK_INTERVAL = 500;

// 模拟参数
const DT = 16, WINDOW = 30000, TRIALS = 80;
const FIELD_COUNT = 24;

// ===================== 模拟状态 =====================
let now = 0;
let zombies = [];
let logs = [], pendingWoodLogs = [], electricFields = [], earthSpikes = [];
let totalDamage = 0;

function makeZombies() {
  const arr = [];
  let id = 0;
  const maxHealth = 200;            // 代表中后期限单目标血量（仅影响 % 机制，DPS 量级由 PD 决定）
  // 12 钉墙：y=WALL_Y，x 均匀铺满
  for (let i = 0; i < 12; i++) {
    arr.push({ id: id++, x: (i + 0.5) * SW / 12, y: WALL_Y, radius: 22, maxHealth, health: maxHealth,
      element: 'normal', frozenUntil: 0, slowUntil: 0, stunUntil: 0, burningUntil: 0, burnDmg: 0, vulnUntil: 0, vulnMul: 1, _burnTick: 0 });
  }
  // 12 上方列队：y 从 WALL_Y-50 到 WALL_Y-600，x 均匀铺满（错开半格）
  for (let i = 0; i < 12; i++) {
    arr.push({ id: id++, x: (i + 0.5) * SW / 12 + SW / 24, y: WALL_Y - 50 - i * 48, radius: 22, maxHealth, health: maxHealth,
      element: 'normal', frozenUntil: 0, slowUntil: 0, stunUntil: 0, burningUntil: 0, burnDmg: 0, vulnUntil: 0, vulnMul: 1, _burnTick: 0 });
  }
  return arr;
}

// 五行元素倍率（单树：wuxingSynergyMult=1）
function elemMult(z, element) {
  const atkWx = WUXING_ELEMENT[element];
  let mult = 1;
  if (z.frozenUntil > now && STATUS_ELEMENT_BONUS.frozen[element]) mult += STATUS_ELEMENT_BONUS.frozen[element];
  if (z.slowUntil > now && STATUS_ELEMENT_BONUS.slow[element]) mult += STATUS_ELEMENT_BONUS.slow[element];
  if (z.burningUntil > now && STATUS_ELEMENT_BONUS.burning[element]) mult += STATUS_ELEMENT_BONUS.burning[element];
  if (atkWx) mult += WUXING_BASE_BONUS;   // 普通僵尸：五行默认压制 +30%
  return mult;                            // 单树 wuxingSynergyMult=1
}

function dealDmg(z, amount, element) {
  if (z.health <= 1) return;
  let d = amount * elemMult(z, element);
  if (z.vulnUntil > now) d *= (z.vulnMul || 1);
  z.health = Math.max(1, z.health - d);
  totalDamage += d;
}

function applyBurn(z, dmgPerTick) { z.burningUntil = now + BURN_DURATION; z.burnDmg = dmgPerTick; }

// 暴击：天赋基数(率0/伤2) + 分支
function rollCrit(m) { return Math.random() < m.critChance; }
function applyHit(z, base, element, m) {
  const isCrit = rollCrit(m);
  const dmg = base * (isCrit ? m.critMult : 1);
  dealDmg(z, dmg, element);
  if (isCrit) {
    if (element === '火' && m.critExplode) {
      for (const o of zombies) if (o !== z && o.health > 1 && Math.hypot(z.x - o.x, z.y - o.y) < 50) dealDmg(o, PD * 0.3, '火');
    }
    if (element === '水' && m.iceBurst) {
      for (const o of zombies) if (o !== z && o.health > 1 && Math.hypot(z.x - o.x, z.y - o.y) < 45) dealDmg(o, PD * 0.25, '水');
    }
  }
  return isCrit;
}

// 离墙最近排序（复刻 getSlotTarget 口径）
function shootableSorted() {
  return zombies.filter(z => z.health > 1)
    .map(z => ({ z, wallDist: WALL_Y - z.y - z.radius }))
    .sort((a, b) => (a.wallDist - b.wallDist))
    .map(o => o.z);
}
function slotTarget(n) {
  const s = shootableSorted();
  if (s.length === 0) return null;
  return s[Math.min(n - 1, s.length - 1)];
}
function nearestToWall(n) { return shootableSorted().slice(0, n); }

function getCd(type, lvl, cdReduce) {
  const cfg = ATTR_CD_CFG[type];
  let cd = cfg.base - lvl * cfg.step;
  if (cdReduce) cd *= (1 - cdReduce);
  return Math.max(cfg.min, cd);
}

// ===================== 四树释放 =====================
function fireCast(m, lvl) {
  const n = 1 + m.bulletCountBoost;
  const perBullet = PD * ATTR_BASE_DMG_MUL / (1 + MULTI_BULLET_DMG_PENALTY * m.bulletCountBoost);
  const expR = Math.min(GLOBAL_MAX_AOE_RADIUS, Math.max(20, (40 + lvl * 20) - m.explRadiusCut));
  const targets = nearestToWall(n);
  for (const t of targets) {
    if (!t || t.health <= 1) continue;
    applyHit(t, perBullet, '火', m);
    if (m.explIgnite) applyBurn(t, PD * m.burnDmgMul);
    for (const z of zombies) {
      if (z === t || z.health <= 1) continue;
      if (Math.hypot(t.x - z.x, t.y - z.y) < expR) {
        dealDmg(z, perBullet * (0.22 + lvl * 0.075) * m.explDmgMul, '火');
        if (m.explIgnite) applyBurn(z, PD * m.burnDmgMul);
        if (m.explArmorBreak) { z.vulnUntil = now + BURN_DURATION; z.vulnMul = 1 + m.armorBreakF; }
        if (m.explIncinerate && z.health > 1) dealDmg(z, z.maxHealth * 0.03 * m.explIncinerate, '火');
      }
    }
  }
}

function waterCast(m, lvl) {
  const n = 1 + m.bulletCountBoost;
  const perBullet = PD * ATTR_BASE_DMG_MUL / (1 + MULTI_BULLET_DMG_PENALTY * m.bulletCountBoost);
  const iceR = Math.min(GLOBAL_MAX_AOE_RADIUS, (70 + lvl * 5) * (1 + m.freezeRadiusBoost));
  const aoeFreezeChance = Math.min(0.95, m.freezeChanceBoost + m.frostNovaFreezeChance);
  const targets = nearestToWall(n);
  for (const t of targets) {
    if (!t || t.health <= 1) continue;
    applyHit(t, perBullet, '水', m);
    // 主目标减速 + 冰霜新星概率冻结
    t.slowUntil = now + 2200;
    if (Math.random() < m.frostNovaFreezeChance) t.frozenUntil = now + getFreezeDuration(lvl, m);
    for (const z of zombies) {
      if (z === t || z.health <= 1) continue;
      if (Math.hypot(t.x - z.x, t.y - z.y) < iceR + z.radius) {
        dealDmg(z, perBullet * 0.72 * m.frostNovaDmgMul, '水');
        z.slowUntil = now + 2200;
        if (Math.random() < aoeFreezeChance) z.frozenUntil = now + getFreezeDuration(lvl, m);
      }
    }
    // 冰封处决（绝对零度）
    if (m.glacialDoomBonus && t.frozenUntil > now) dealDmg(t, t.maxHealth * 0.03 * m.glacialDoomBonus, '水');
  }
}
function getFreezeDuration(lvl, m) { return Math.min(3000, (1000 + lvl * 120) * (1 + m.freezeDurationBoost)); }

function lightningCast(m, lvl) {
  const n = 1 + m.bulletCountBoost;
  const perBullet = PD * ATTR_BASE_DMG_MUL / (1 + MULTI_BULLET_DMG_PENALTY * m.bulletCountBoost);
  const targets = nearestToWall(n);
  for (const t of targets) {
    if (!t || t.health <= 1) continue;
    const isCrit = applyHit(t, perBullet, '金', m);
    const conductive = t.frozenUntil > now || t.slowUntil > now || t.stunUntil > now;
    const chainCount = lvl + 1 + m.chainCountBoost + (conductive ? m.superConductorCountBoost : 0);
    const chainDmg = perBullet * 0.4 * m.chainDmgMul * (conductive ? (1 + m.superConductorDmgMul) : 1);
    let last = t; const chained = [t];
    for (let c = 0; c < chainCount; c++) {
      let best = null, bd = Math.min(GLOBAL_MAX_AOE_RADIUS, 150 + m.chainRangeBoost);
      for (const z of zombies) {
        if (z.health > 1 && !chained.includes(z)) {
          const d = Math.hypot(last.x - z.x, last.y - z.y);
          if (d < bd) { bd = d; best = z; }
        }
      }
      if (!best) break;
      dealDmg(best, chainDmg, '金');
      if (conductive && m.superConductorMaxHp > 0 && best.health > 1) dealDmg(best, best.maxHealth * m.superConductorMaxHp, '金');
      if (m.empStunChance > 0 && Math.random() < m.empStunChance) best.stunUntil = now + m.empStunDuration;
      chained.push(best); last = best;
    }
    if (m.empStunChance > 0 && Math.random() < m.empStunChance) t.stunUntil = now + m.empStunDuration;
    if (m.staticFieldChance > 0 && Math.random() < m.staticFieldChance)
      electricFields.push({ x: t.x, y: t.y, radius: Math.min(GLOBAL_MAX_AOE_RADIUS, m.staticFieldRadius), life: m.staticFieldLife, _t: 0 });
    if (isCrit && m.thunderStrike && Math.random() < 0.5) dealDmg(t, perBullet, '金');
  }
}

function earthCast(m, lvl) {
  const n = 1 + m.bulletCountBoost;
  const baseSlot = 2; // acquiredSkills=['damage','earth'] 时 earth 槽位 2；实际通过 slotTarget 复刻
  const baseDmg = PD * ATTR_BASE_DMG_MUL * EARTH_SPIKE_DMG_FACTOR * m.fissureDmgMul
                * (1 + 0.05 * (lvl - 1))
                / (1 + MULTI_BULLET_DMG_PENALTY * Math.max(0, n - 1));

  for (let i = 0; i < n; i++) {
    const target = slotTarget(baseSlot + i);
    if (!target) continue;
    const radius = EARTH_SPIKE_BASE_RADIUS * m.earthHitRadiusMul;
    const x = Math.max(radius, Math.min(SW - radius, target.x));
    const y = Math.max(radius, Math.min(WALL_Y - radius, target.y));

    if (earthSpikes.length >= EARTH_SPIKE_MAX_COUNT) earthSpikes.shift();
    earthSpikes.push({
      x, y, radius,
      born: now,
      duration: EARTH_SPIKE_BASE_DURATION + (m.shieldDuration || 0) * 0.5,
      dmg: baseDmg,
      critChance: m.critChance, critMult: m.critMult,
      m,
      hitMap: {},
      _tickCount: 0
    });
  }
}

function updateEarthSpikesSim() {
  for (let i = earthSpikes.length - 1; i >= 0; i--) {
    const spike = earthSpikes[i];
    if (now - spike.born > spike.duration) { earthSpikes.splice(i, 1); continue; }
    while (now - spike.born >= spike._tickCount * EARTH_SPIKE_HIT_INTERVAL) {
      spike._tickCount++;
      applyEarthSpikeHitSim(spike, spike._tickCount === 1);
    }
  }
}

function applyEarthSpikeHitSim(spike, isFirstTick) {
  const m = spike.m;
  for (const z of zombies) {
    if (z.health <= 1) continue;
    const dist = Math.hypot(spike.x - z.x, spike.y - z.y);
    if (dist > spike.radius + z.radius) continue;

    const lastHit = spike.hitMap[z.id] || 0;
    if (now - lastHit < EARTH_SPIKE_HIT_INTERVAL) continue;
    spike.hitMap[z.id] = now;

    // 基础伤害（含暴击）
    let dmg = spike.dmg;
    let isCrit = false;
    if (Math.random() < spike.critChance) { dmg *= spike.critMult; isCrit = true; }
    dealDmg(z, dmg, '土');

    // 岩片溅射（地刺贯穿 Lv5）
    if (m.rockShard) {
      for (const o of zombies) {
        if (o === z || o.health <= 1) continue;
        if (Math.hypot(z.x - o.x, z.y - o.y) < 35) dealDmg(o, PD * 0.08, '土');
      }
    }

    // 碎岩迸发（岩心暴击 Lv5）
    if (isCrit && m.rockBurst) {
      for (const o of zombies) {
        if (o === z || o.health <= 1) continue;
        if (Math.hypot(z.x - o.x, z.y - o.y) < 55) dealDmg(o, PD * 0.18, '土');
      }
    }

    // 碎甲
    if (m.armorCrush) { z.vulnUntil = now + 2500; z.vulnMul = 1 + m.armorCrushF; }

    // 石化
    if (m.petrifyChance > 0 && Math.random() < m.petrifyChance) z.stunUntil = now + m.petrifyDuration;

    // 山崩 Lv5
    if (m.landslideBonus > 0 && z.stunUntil > now) dealDmg(z, z.maxHealth * 0.03 * m.landslideBonus, '土');
  }

  // 第一跳一次性场地效果
  if (isFirstTick) {
    if (m.quakeChance > 0 && Math.random() < m.quakeChance) {
      const qr = Math.min(GLOBAL_MAX_AOE_RADIUS, Math.max(40, 60 + m.quakeRadius));
      for (const z of zombies) {
        if (z.health <= 1) continue;
        if (Math.hypot(spike.x - z.x, spike.y - z.y) < qr + z.radius) {
          dealDmg(z, spike.dmg * 0.55 * m.quakeDmgMul, '土');
          if (m.quakeStunDur > 0) z.stunUntil = Math.max(z.stunUntil || 0, now + m.quakeStunDur);
        }
      }
    }
    // 陷坑/岩盾：静态靶场无位移/不计 DPS，跳过
  }
}

function shootWoodSim(m, lvl) {
  const baseW = SW * WOOD_LOG_BASE_WIDTH_RATIO * m.logWidthMul;
  const count = Math.min(6, 1 + m.bulletCountBoost + m.logCountBoost);
  const speed = BULLET_SPEED * ATTR_BULLET_SPEED_MUL * WOOD_LOG_SPEED_MUL;
  const perHit = PD * ATTR_BASE_DMG_MUL * m.logDmgMul
    * (1 + 0.08 * (lvl - 1)) * WOOD_LOG_DMG_FACTOR
    / (1 + MULTI_BULLET_DMG_PENALTY * (count - 1));
  const baseSlot = 2; // acquiredSkills=['damage','wood'] → wood 槽位 2
  for (let i = 0; i < count; i++) {
    const target = slotTarget(baseSlot + i);
    const targetX = target ? target.x : SW / 2;
    const w = Math.min(baseW, SW);
    const cx = Math.max(w / 2, Math.min(SW - w / 2, targetX));
    pendingWoodLogs.push({
      releaseAt: now + i * WOOD_LOG_RELEASE_INTERVAL,
      config: {
        x: cx, y: WALL_Y, w, thick: WOOD_LOG_THICKNESS + m.pierceBoost * 5, vy: -speed, dmg: perHit,
        critChance: m.critChance, critMult: m.critMult,
        rebound: m.rebound, reboundDmgMul: m.reboundDmgMul,
        splinterChance: m.splinterChance, splinterDmgMul: m.splinterDmgMul,
        rootChance: m.rootChance, rootDuration: m.rootDuration,
        strangleVineBonus: m.strangleVineBonus, thornBurst: m.thornBurst, woodSpike: m.woodSpike,
        hitMap: {}, phase: 'up', _splinterTimer: 0,
      },
    });
  }
}
function updatePendingWoodLogsSim() {
  for (let i = pendingWoodLogs.length - 1; i >= 0; i--) {
    if (now >= pendingWoodLogs[i].releaseAt) { logs.push(pendingWoodLogs[i].config); pendingWoodLogs.splice(i, 1); }
  }
}
function updateLogsSim(m) {
  const frame = DT;
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    log.y += log.vy * (frame / 16);
    const top = log.y - log.thick / 2, bot = log.y + log.thick / 2;
    for (const z of zombies) {
      if (z.health <= 1) continue;
      if (z.x < log.x - log.w / 2 || z.x > log.x + log.w / 2) continue;
      if (z.y + z.radius < top || z.y - z.radius > bot) continue;
      const last = log.hitMap[z.id] || 0;
      if (now - last < WOOD_LOG_HIT_INTERVAL) continue;
      log.hitMap[z.id] = now;
      const isCrit = Math.random() < log.critChance;
      let dmg = log.dmg * (isCrit ? log.critMult : 1);
      if (log.phase === 'down') dmg *= log.reboundDmgMul;
      dealDmg(z, dmg, '木');
      if (z.health <= 1) continue;
      if (log.rootChance > 0 && Math.random() < log.rootChance) z.stunUntil = now + log.rootDuration;
      if (log.strangleVineBonus > 0 && z.stunUntil > now) { dealDmg(z, z.maxHealth * 0.03 * log.strangleVineBonus, '木'); if (z.health <= 1) continue; }
      if (isCrit && log.thornBurst) { for (const o of zombies) if (o !== z && o.health > 1 && Math.hypot(z.x - o.x, z.y - o.y) < 45) dealDmg(o, PD * 0.25, '木'); }
      if (log.woodSpike) { for (const o of zombies) if (o !== z && o.health > 1 && Math.hypot(z.x - o.x, z.y - o.y) < 30) dealDmg(o, PD * 0.2, '木'); }
    }
    if (log.splinterChance > 0) {
      log._splinterTimer += frame;
      if (log._splinterTimer >= WOOD_SPLINTER_INTERVAL) {
        log._splinterTimer = 0;
        if (Math.random() < Math.min(1, log.splinterChance)) {
          for (const z of zombies) if (z.health > 1 && Math.hypot(log.x - z.x, log.y - z.y) < WOOD_SPLINTER_RADIUS + z.radius)
            dealDmg(z, PD * WOOD_SPLINTER_DMG * log.splinterDmgMul, '木');
        }
      }
    }
    if (log.phase === 'up' && log.y + log.thick / 2 < 0) {
      if (log.rebound) { log.phase = 'down'; log.vy = -log.vy; }
      else logs.splice(i, 1);
    } else if (log.phase === 'down' && log.y - log.thick / 2 > WALL_Y + 10) logs.splice(i, 1);
  }
}

// 持续效果
function updateBurns() {
  for (const z of zombies) {
    if (z.burningUntil > now && z.burnDmg > 0) {
      z._burnTick += DT;
      if (z._burnTick >= 500) { z._burnTick = 0; dealDmg(z, z.burnDmg, '火'); }
    }
  }
}
function updateFieldsSim() {
  for (let i = electricFields.length - 1; i >= 0; i--) {
    const f = electricFields[i];
    f.life -= DT;
    if (f.life <= 0) { electricFields.splice(i, 1); continue; }
    f._t += DT;
    if (f._t >= 300) {
      f._t = 0;
      for (const z of zombies) if (z.health > 1 && Math.hypot(f.x - z.x, f.y - z.y) < f.radius + z.radius) dealDmg(z, PD * 0.15, '金');
    }
  }
}

// ===================== 构建（公平预算）=====================
// T0 裸树 Lv10；T1 通用三分支(多重5+急速5+暴击5)；T2 各树满配质变。
function baseMods() {
  return { bulletCountBoost: 0, cdReduce: 0, critChanceBoost: 0, critDamageBoost: 0,
    critChance: 0, critMult: 2, critExplode: false, pierceBoost: 0, pierceSplash: false,
    explDmgMul: 1, explRadiusCut: 0, explArmorBreak: false, armorBreakF: 0, explIgnite: false, burnDmgMul: 1, explIncinerate: 0,
    freezeRadiusBoost: 0, freezeChanceBoost: 0, slowFactorBoost: 0, freezeDurationBoost: 0, frostNovaDmgMul: 1, frostNovaFreezeChance: 0, polarFieldChance: 0, glacialDoomBonus: 0, iceBurst: false, iceSpike: false,
    chainCountBoost: 0, chainDmgMul: 1, chainRangeBoost: 0, empStunChance: 0, empStunDuration: 0, staticFieldChance: 0, staticFieldRadius: STATIC_FIELD_BASE_RADIUS, staticFieldLife: STATIC_FIELD_BASE_LIFE, superConductorDmgMul: 0, superConductorCountBoost: 0, superConductorMaxHp: 0, thunderStrike: false,
    logWidthMul: 1, logDmgMul: 1, logCountBoost: 0, rootChance: 0, rootDuration: 0, rebound: false, reboundDmgMul: 1, splinterChance: 0, splinterDmgMul: 1, strangleVineBonus: 0, thornBurst: false, woodSpike: false,
    fissureDmgMul: 1, earthLineLengthMul: 1, earthHitRadiusMul: 1,
    shieldChance: 0, shieldHpMul: 1, shieldDuration: 0, shieldWidthMul: 1,
    quakeChance: 0, quakeDmgMul: 1, quakeRadius: 0, quakeStunDur: 0,
    sinkholeChance: 0, sinkholeRadius: 0, sinkholePull: 0,
    petrifyChance: 0, petrifyDuration: 0, armorCrush: false, armorCrushF: 0, landslideBonus: 0, rockShard: false, rockBurst: false };
}
function applyUniversal(m) { m.bulletCountBoost += 3; m.cdReduce += 0.08 * 3; m.critChanceBoost += 0.05 * 3; m.critDamageBoost += 0.15 * 3; m.critChance = m.critChanceBoost; m.critMult = 2 + m.critDamageBoost; }
function buildMods(tree, tier) {
  const m = baseMods();
  const lvl = 10;
  if (tier >= 1) applyUniversal(m);
  if (tier >= 2) {
    if (tree === 'explosive') { m.explDmgMul = Math.pow(1.20, 5) * Math.pow(1.38, 5); m.explRadiusCut = 40 * 5; m.explIgnite = true; m.burnDmgMul = Math.pow(1.20, 5); m.explIncinerate = 5; if (m.critChanceBoost >= 0.25) m.critExplode = true; }
    if (tree === 'freeze') { m.freezeRadiusBoost = 0.12 * 5 + 0.20 * 5; m.freezeChanceBoost = 0.08 * 5; m.frostNovaDmgMul = Math.pow(1.05, 5); m.frostNovaFreezeChance = 0.15 * 5; m.freezeDurationBoost = 0.20 * 5; m.glacialDoomBonus = 5; m.polarFieldChance = 0.25 * 5; if (m.critChanceBoost >= 0.25) m.iceBurst = true; }
    if (tree === 'lightning') { m.chainCountBoost = 5; m.chainDmgMul = Math.pow(1.20, 5); m.chainRangeBoost = 8 * 5; m.empStunChance = 0.06 * 5; m.empStunDuration = 100 * 5; m.staticFieldChance = 0.20 * 5; m.staticFieldRadius = STATIC_FIELD_BASE_RADIUS + STATIC_FIELD_RADIUS_PER_LV * 5; m.staticFieldLife = STATIC_FIELD_BASE_LIFE + STATIC_FIELD_LIFE_PER_LV * 5; m.superConductorDmgMul = 0.20 * 5; m.superConductorCountBoost = 5; m.superConductorMaxHp = 0.02 * 5; m.thunderStrike = true; }
    if (tree === 'wood') { m.logWidthMul = Math.pow(1.12, 5); m.logDmgMul = Math.pow(1.12, 5); m.rootChance = 0.20 * 5; m.rootDuration = 400 + 100 * 5; m.strangleVineBonus = 5; m.splinterChance = 0.30 * 5; m.splinterDmgMul = Math.pow(1.15, 5); if (m.critChanceBoost >= 0.25) m.thornBurst = true; }
    if (tree === 'earth') {
      m.fissureDmgMul = Math.pow(1.20, 5);            // 裂地穿刺：穿透伤害+20%/级
      m.earthHitRadiusMul = Math.pow(1.08, 5);        // 地刺贯穿：岩刺命中宽度+8%/级（半径减半后收敛 T2 覆盖，防 T2 爆炸）
      m.earthLineLengthMul = Math.pow(1.10, 5);       // 岩刺长度+10%/级（仅视觉）
      m.pierceBoost = 5;                              // 地刺贯穿 Lv5
      m.rockShard = true;                             // 地刺贯穿 Lv5 → 岩片溅射
      m.quakeChance = 0.25 * 5; m.quakeDmgMul = Math.pow(1.05, 5); m.quakeRadius = 4 * 5; m.quakeStunDur = 150 * 5;   // 震地（T2 收敛）
      m.petrifyChance = 0.12 * 5; m.petrifyDuration = 250 * 5; m.landslideBonus = 0;   // 石化保留；山崩从满配参考构建剔除（%最大生命在静态靶场过爆，单独评估）
      m.armorCrush = true; m.armorCrushF = 0.02 * 5;  // 碎甲（×1.10，避免穿透多目标叠加过爆）
      if (m.critChanceBoost >= 0.25) m.rockBurst = true;   // 岩心暴击 Lv5 → 碎岩迸发
    }
  }
  return { m, lvl };
}

// ===================== 主基准 =====================
function benchmark(tree, tier) {
  let acc = 0;
  for (let tr = 0; tr < TRIALS; tr++) {
    const { m, lvl } = buildMods(tree, tier);
    zombies = makeZombies();
    logs = []; pendingWoodLogs = []; electricFields = []; earthSpikes = []; totalDamage = 0;
    let lastCast = -1e9, lastWood = -1e9;
    const steps = Math.floor(WINDOW / DT);
    now = 0;
    for (let s = 0; s < steps; s++) {
      now += DT;
      if (tree === 'wood') {
        if (now - lastWood >= getCd('wood', lvl, m.cdReduce)) { lastWood = now; shootWoodSim(m, lvl); }
        updatePendingWoodLogsSim();
      } else {
        if (now - lastCast >= getCd(tree, lvl, m.cdReduce)) { lastCast = now; if (tree === 'explosive') fireCast(m, lvl); else if (tree === 'freeze') waterCast(m, lvl); else if (tree === 'lightning') lightningCast(m, lvl); else earthCast(m, lvl); }
      }
      updateBurns(); updateFieldsSim(); updateEarthSpikesSim(); if (tree === 'wood') updateLogsSim(m);
    }
    acc += totalDamage;
  }
  return acc / (TRIALS * WINDOW / 1000);
}

// 五行相生倍率（与 recomputeWuxingSynergy 同款）
function synergyMult(elements) {
  const set = new Set(elements);
  let pairs = 0;
  for (const a of set) { const b = WUXING_GENERATE[a]; if (b && set.has(b)) pairs++; }
  return 1 + WUXING_GENERATE_BONUS * pairs - Math.max(0, set.size - 2) * WUXING_SPREAD_PENALTY;
}

// ===================== 输出 =====================
const trees = [
  { key: 'explosive', name: '火·爆炸弹' },
  { key: 'lightning', name: '金·闪电链' },
  { key: 'freeze', name: '水·干冰弹' },
  { key: 'wood', name: '木·滚木' },
  { key: 'earth', name: '土·地刺' },
];
console.log('=== 五树 DPS 回归（属性树自身输出；player.damage=10；静态靶场 24 僵尸；30s×' + TRIALS + ' 次均值）===');
console.log('五行标配 +35% 已计入；单树相生倍率=1.0；暴击 率+5%/级、伤+15%/级（天赋基数 率0/伤2）。\n');

const results = {};
for (const t of trees) {
  results[t.key] = {};
  for (const tier of [0, 1, 2]) {
    results[t.key][tier] = benchmark(t.key, tier);
  }
}

console.log('┌──────────────┬──────────┬──────────┬──────────┐');
console.log('│ 树           │ T0裸Lv10 │ T1通用三 │ T2满配质 │');
console.log('├──────────────┼──────────┼──────────┼──────────┤');
for (const t of trees) {
  const r = results[t.key];
  console.log('│ ' + t.name.padEnd(10) + ' │ ' + r[0].toFixed(0).padStart(6) + '  │ ' + r[1].toFixed(0).padStart(6) + '  │ ' + r[2].toFixed(0).padStart(6) + '  │');
}
console.log('└──────────────┴──────────┴──────────┴──────────┘');
console.log('（DPS 单位：伤害/秒，对 player.damage=10；实际随玩家基础伤害线性缩放）\n');

// T1 平衡性判定
const t1 = trees.map(t => ({ name: t.name, dps: results[t.key][1] })).sort((a, b) => b.dps - a.dps);
const maxD = t1[0].dps, minD = t1[t1.length - 1].dps;
console.log('【T1 单树平衡性】最高 ' + t1[0].name + '=' + maxD.toFixed(0) + '，最低 ' + t1[t1.length - 1].name + '=' + minD.toFixed(0) +
  '，极差比=' + (maxD / minD).toFixed(2) + '（目标≤1.5 视为平衡）\n');

// 二树相生叠加演示（近似：假设独立叠加，各自 DPS × 相生倍率后求和）
console.log('【2树相生叠加演示（近似独立叠加；相生对=1.20，非相生对=1.0）】');
const KEY2EL = { explosive: '火', lightning: '金', freeze: '水', wood: '木', earth: '土' };
const pairsList = [['explosive', 'freeze'], ['freeze', 'wood'], ['wood', 'explosive'], ['lightning', 'freeze'], ['lightning', 'explosive'], ['lightning', 'wood'], ['explosive', 'earth'], ['earth', 'lightning'], ['freeze', 'earth'], ['wood', 'earth']];
for (const [a, b] of pairsList) {
  const na = trees.find(t => t.key === a).name, nb = trees.find(t => t.key === b).name;
  const sm = synergyMult([KEY2EL[a], KEY2EL[b]]);
  const combined = (results[a][1] + results[b][1]) * sm;
  const generating = sm > 1.0;
  console.log('  ' + na + ' + ' + nb + (generating ? '（相生对 ×1.20）' : '（非相生 ×1.0）') + ' ≈ ' + combined.toFixed(0) + ' DPS');
}
console.log('\n注：2树相生倍率 1.20（pairs=1,treeCount=2）；单树 1.0；3树(金+水+木) 0.95；4树 0.70 —— 满足「2树相生最强>单树>3树>4树」。');
