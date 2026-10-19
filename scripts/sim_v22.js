// 五行极简体系 v2.2 火力门校准模拟器 —— 泄漏生存队列模型
//
// 采用纸面模型 §3 的「泄漏生存」框架，避免单点锁敌的空间伪影（单目标开火会在击杀墙前清掉前排，
// 导致怪永远到不了城墙线、游戏不可能输）。模型直接比较：到达率 R(t) vs 清除率 K(t)。
//
// 核心公式（每 0.5s 步长）：
//   R(t) = 到达城墙线的怪/s （= 出怪率，含末段爆发；水控制→×0.8）
//   avgHP(t) = 类型混合平均基础血 ×(1+gts/hpGrow)×healthMult
//   DPS(t) = autoDPS + Σ(克制元素 E×LvMul×2.5) 加权 ／ 错配时该元素仅 ×0.2（读色选克的核心惩罚）
//   K(t) = DPS(t) / avgHP(t)  × AoE系数(火/金)         （清除率，单位 只/s）
//   leak(t) = max(0, R(t) - K(t))                        （漏怪/s）
//   health -= leak(t) × avgDmg × drainK × dt
//           += 木连携回血 / 土连携减伤 等缓冲
//   撑满 300s = 胜；health<=0 = 崩盘
//
// 说明：本模型不跑局内三选一成长（元素等级=入参固定），故结果是「保守下界」——真实局内成长让生存更宽松。

const RESTRAIN = { '金':'火', '火':'水', '土':'木', '水':'土', '木':'金' }; // 怪物元素 -> 克制它的玩家元素
const E_BASE = { '金':300, '火':240, '木':180, '土':120, '水':90 };       // 五元素基础 DPS（待校准）
const AOE = { '金':1.4, '火':1.6, '木':1.0, '土':1.0, '水':1.0 };        // 多目标等效（金穿透/火范围）

// 怪物类型混合（近似权重），用于平均血/平均伤害
const TYPE_MIX = [
  { t:'normal', w:0.70, hp:30, dmg:10 },
  { t:'fast',   w:0.15, hp:20, dmg:8 },
  { t:'tank',   w:0.10, hp:80, dmg:20 },
  { t:'boss',   w:0.05, hp:200, dmg:30 }
];
const AVG_BASE_HP  = TYPE_MIX.reduce((a,m)=>a+m.w*m.hp,0);   // 42
const AVG_BASE_DMG = TYPE_MIX.reduce((a,m)=>a+m.w*m.dmg,0);  // 11.7
const DRAIN_K = 1.2; // 1 只漏怪/s 折算的每秒掉血系数（与空间模型 z.damage*0.02*60 一致）

function avgElLevel(elLv, e) { return (elLv && elLv[e]) ? elLv[e] : 1; }

function runV22(opts) {
  let seed = opts.seed || 1;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  const GAME_TIME_LIMIT = 300, dt = 0.5;
  const stage = Object.assign({ spawnMult:1.4, healthMult:1.0, tankChance:0.10, fastChance:0.15, speedMult:1.0, hpGrow:120, spawnFloor:400, spawnDecay:12 }, opts.stage || {});
  const autoDPS = opts.autoDPS != null ? opts.autoDPS : 40;
  const restraintMult = opts.restraintMult != null ? opts.restraintMult : 2.5;
  const unlocked = opts.unlockedElements || ['火'];
  const monEls = opts.monsterElements || [{ el:'金', w:1 }];
  const elLv = opts.elementLevels || {};
  const comboBuffer = opts.comboBuffer || 0;          // 土盾/木回血等生存缓冲（折算为额外血量）
  const LvMul = (e) => Math.pow(1.15, avgElLevel(elLv, e) - 1);

  let health = 100 + comboBuffer, maxHealth = health;
  let gameTime = 0, spawnTimer = 0, spawnInterval = 1500, lastCollapse = null;
  const snaps = [];

  function pickMonEl() { let r = rnd(), acc = 0; for (const m of monEls) { acc += m.w; if (r <= acc) return m.el; } return monEls[monEls.length-1].el; }

  // 本配置下"玩家对当前目标的有效 DPS"：按怪物元素混合加权（smart play：有克制元素就用克制，否则错配0.2）
  function effectiveDPS() {
    const wsum = monEls.reduce((a,m)=>a+m.w,0) || 1;
    let total = 0;
    for (const m of monEls) {
      const restr = RESTRAIN[m.el];
      const e = unlocked.includes(restr) ? restr : (unlocked.length ? unlocked[0] : null);
      const matched = e && restr === e;
      const K = matched ? restraintMult : (e ? 0.2 : 1.0);
      const elemDPS = (e ? E_BASE[e] : 0) * LvMul(e || '火') * K;
      const aoe = (matched && AOE[e]) ? AOE[e] : 1.0;
      total += (m.w / wsum) * (autoDPS + elemDPS) * aoe;
    }
    return total;
  }
  const baseDPS = effectiveDPS();

  // 水控制 / 木回血 / 土减伤 占比
  let waterCtrlFrac = 0, woodHeal = 0, earthShield = 1.0;
  for (const m of monEls) { const restr = RESTRAIN[m.el]; if (unlocked.includes(restr)) { waterCtrlFrac += (restr==='水')?m.w:0; woodHeal += (restr==='木')?m.w*6:0; earthShield -= (restr==='土')?m.w*0.3:0; } }

  while (gameTime < GAME_TIME_LIMIT) {
    const gts = gameTime;
    spawnTimer += dt * 1000;
    let sm = stage.spawnMult, spawnCount = 1;
    const rem = GAME_TIME_LIMIT - gameTime;
    if (rem <= 30 && rem > 0) { const p = 1 - rem/30; sm *= (1 + p*0.4); if (p>0.9) spawnCount = 2; }
    if (spawnTimer >= spawnInterval / sm) { spawnTimer = 0; spawnInterval = Math.max(stage.spawnFloor, spawnInterval - stage.spawnDecay); }
    const instantaneousInterval = Math.max(stage.spawnFloor, spawnInterval - stage.spawnDecay) / sm;
    const R = (1000 / instantaneousInterval) * spawnCount * (1 - 0.2 * waterCtrlFrac);

    const avgHP = AVG_BASE_HP * (1 + gts / stage.hpGrow) * stage.healthMult;
    const avgDmg = AVG_BASE_DMG * stage.healthMult;
    const DPS = baseDPS;
    const K = DPS / avgHP;

    const leak = Math.max(0, R - K);
    health -= leak * avgDmg * DRAIN_K * dt;
    health += woodHeal * dt;
    health = Math.min(maxHealth, health);
    if (health <= 0) { lastCollapse = Math.round(gameTime); break; }

    gameTime += dt;
    if (Math.abs(gameTime % 10) < dt && snaps.length < 30) snaps.push({ t: Math.round(gameTime), R: +R.toFixed(2), K: +K.toFixed(2), hp: Math.round(health), leak: +leak.toFixed(2) });
  }
  return { collapseTime: lastCollapse, won: lastCollapse === null, snaps, finalHp: Math.round(health), baseDPS: Math.round(baseDPS) };
}

function median(a) { a = a.slice().sort((x, y) => x - y); return a[Math.floor(a.length/2)]; }
function scan(label, opts) {
  const cs = []; for (let s = 1; s <= 6; s++) { const r = runV22(Object.assign({ seed: s }, opts)); cs.push(r.collapseTime === null ? 300 : r.collapseTime); }
  console.log(`[${label}] 崩盘中位数=${median(cs)}s (300=通关) | ${cs.join(',')} | baseDPS=${runV22(Object.assign({seed:1},opts)).baseDPS}`);
  return cs;
}

console.log('================ v2.2 五行极简 火力门校准（泄漏生存队列模型） ================');

const ALL5 = ['火','水','木','土','金'];
const MON5 = [{el:'金',w:2},{el:'火',w:2},{el:'土',w:2},{el:'水',w:2},{el:'木',w:2}];
function floorScan(opts){ return scan('  地板(仅火/5怪·错配0.2)', Object.assign({unlockedElements:['火'],monsterElements:MON5,elementLevels:{火:1}}, opts)); }
function restrScan(opts){ return scan('  克制(全5/lv1)', Object.assign({unlockedElements:ALL5,monsterElements:MON5,elementLevels:{火:1,水:1,木:1,土:1,金:1}}, opts)); }

console.log('\n=== 60关梯度校准（正确克制操作下的崩盘时间；300=稳过）===');

// 各档 stage 预设 + 元素等级 + 怪物元素（按 v2.2 调度：怪登场时其克制元素已解锁）
const TIERS = [
  { name:'L1 金怪/火技',      st:{hpGrow:160,spawnFloor:680,spawnDecay:4,spawnMult:0.9,healthMult:1.0}, unlocked:['火'],                mon:[{el:'金',w:1}],                       lv:{},        combo:0 },
  { name:'L2 金火/火水',       st:{hpGrow:160,spawnFloor:660,spawnDecay:4,spawnMult:0.95,healthMult:1.0},unlocked:['火','水'],           mon:[{el:'金',w:1},{el:'火',w:1}],         lv:{},        combo:0 },
  { name:'L4 全5/全5 lv1',     st:{hpGrow:150,spawnFloor:620,spawnDecay:5,spawnMult:1.1,healthMult:1.0}, unlocked:ALL5,                   mon:MON5,                                lv:{},        combo:0 },
  { name:'L6 小考 全5 lv1',    st:{hpGrow:140,spawnFloor:600,spawnDecay:6,spawnMult:1.2,healthMult:1.1}, unlocked:ALL5,                   mon:MON5,                                lv:{},        combo:0 },
  { name:'L13 引相生 全5 lv3', st:{hpGrow:130,spawnFloor:560,spawnDecay:7,spawnMult:1.3,healthMult:1.3}, unlocked:ALL5,                   mon:MON5,                                lv:{火:3,水:3,木:3,土:3,金:3}, combo:60 },
  { name:'L30 全5 lv5',        st:{hpGrow:115,spawnFloor:520,spawnDecay:8,spawnMult:1.5,healthMult:1.7}, unlocked:ALL5,                   mon:MON5,                                lv:{火:5,水:5,木:5,土:5,金:5}, combo:100 },
  { name:'L55 全5 lv8',        st:{hpGrow:100,spawnFloor:480,spawnDecay:9,spawnMult:1.8,healthMult:2.2}, unlocked:ALL5,                   mon:MON5,                                lv:{火:8,水:8,木:8,土:8,金:8}, combo:150 },
  { name:'L55 全5 lv1(未养成)',st:{hpGrow:100,spawnFloor:480,spawnDecay:9,spawnMult:1.8,healthMult:2.2}, unlocked:ALL5,                   mon:MON5,                                lv:{},        combo:0 },
  { name:'L60 终章 全5 lv10',  st:{hpGrow:95, spawnFloor:460,spawnDecay:10,spawnMult:1.9,healthMult:2.5}, unlocked:ALL5,                   mon:MON5,                                lv:{火:10,水:10,木:10,土:10,金:10}, combo:180 },
];
for (const t of TIERS) {
  scan(t.name, { unlockedElements:t.unlocked, monsterElements:t.mon, elementLevels:t.lv, comboBuffer:t.combo, stage:t.st });
}
