// 爆炸弹分支树 —— 无头逻辑冒烟测试
// 从「game - 副本.js」抽取真实函数与 explosive.branches，验证：树语义 + 分支可持续升级 + 选分支不占槽 + 互斥/前置 + 派生修正 + 爆炸特效缩放
const fs = require('fs');
const src = fs.readFileSync('game - 副本.js', 'utf8');

function extractFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('未找到函数 ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}
function extractConst(name) {
  const i = src.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error('未找到常量 ' + name);
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return '(' + src.slice(j, k) + ')';
}
// 抽取 explosive 的 branches 对象字面量（定位 explosive 定义后的第一个 branches: {）
function extractExplosiveBranches() {
  const ex = src.indexOf("explosive:  { type:'explosive'");
  const bi = src.indexOf('branches: {', ex);
  const bj = src.indexOf('{', bi);
  let depth = 0, k = bj;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(bj, k);
}

const getAvailSrc = extractFn('getAvailableBranches');
const recomputeSrc = extractFn('recomputeExplosiveMods');
const recomputeWuxingSrc = extractFn('recomputeWuxingSynergy');
const applySrc = extractFn('applyUpgrade');
const createExplSrc = extractFn('createExplosion');

const SKILL_DEFS = {
  explosive: { type: 'explosive', name: '爆炸弹', icon: '💥', branches: eval('(' + extractExplosiveBranches() + ')') },
  dummy1: { type: 'dummy1', name: '占位1', icon: 'A', element: '物理', category: 'bullet', maxLevel: 9, desc: 'x', apply() {} },
  dummy2: { type: 'dummy2', name: '占位2', icon: 'B', element: '物理', category: 'bullet', maxLevel: 9, desc: 'y', apply() {} }
};

let skills = {};
for (const k in SKILL_DEFS) skills[k] = { level: 0, name: SKILL_DEFS[k].name, icon: SKILL_DEFS[k].icon, desc: SKILL_DEFS[k].desc, element: '物理', category: 'bullet', maxLevel: 99, branches: {}, qualified: {} };
let acquiredSkills = ['explosive'];
let isSkillLab = false, upgradeOptions = [];
let gameState = 'playing', gameRunning = true, lastTime = Date.now();
let justGotBomb = false, bombFull = false, selectedUpgrade = -1;
const MAX_SKILLS = 5;
const player = { damage: 10, fireRate: 500, bulletSpeed: 10, exp: 0, expToLevel: 100, level: 1 };
let bombExplosionEffects = [];   // createExplosion 依赖
let particles = [];              // createExplosion 依赖
function addParticle(p) { particles.push(p); }  // game - 副本.js 中的带上限入池函数（测试里直接 push）
let wuxingSynergy = {};   // applyUpgrade 现在会调用 recomputeWuxingSynergy
let wuxingSynergyMult = 1;
const WUXING_ELEMENT = eval(extractConst('WUXING_ELEMENT'));
const WUXING_GENERATE = eval(extractConst('WUXING_GENERATE'));
const WUXING_GENERATE_BONUS = 0.20;
const WUXING_SPREAD_PENALTY = 0.25;
function fireQualNodes() {}
function levelUp() {}

eval(getAvailSrc);
eval(recomputeSrc);
eval(recomputeWuxingSrc);
eval(applySrc);
eval(createExplSrc);

let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

console.log('== 1. getAvailableBranches 树语义（爆炸弹·火属性树）==');
skills.explosive.level = 1;
assert(getAvailableBranches('explosive').length === 0, 'Lv1 无分支解锁');
skills.explosive.level = 2;
let av = getAvailableBranches('explosive');
// 共享模板分支（多重/疾速）+ 火专属（富燃料/热能爆炸 同档互斥二选一），均在 Lv2 解锁
assert(av.includes('multiShot'), 'Lv2 解锁 多重爆裂(共享模板)');
assert(av.includes('highSpeed'), 'Lv2 解锁 急速冷却(共享模板)');
assert(av.includes('fuelFill') && av.includes('thermalExplode'), 'Lv2 解锁 富燃料填充 / 热能爆炸（同档互斥，二选一）');
// 选 fuelFill → 互斥排除 thermalExplode
skills.explosive.branches.fuelFill = 1;
skills.explosive.level = 3;
av = getAvailableBranches('explosive');
assert(av.includes('fuelFill'),
  '分支未升满 → 仍被提供用于继续升级');
assert(!av.includes('thermalExplode'), '已选富燃料 → 互斥排除热能爆炸');
assert(av.includes('crit'), 'Lv3 解锁 火焰暴击(共享模板)');
assert(av.includes('pierce'), 'Lv3 解锁 烈焰穿透(共享模板)');
skills.explosive.branches.fuelFill = 2;   // 升满富燃料
skills.explosive.level = 4;
av = getAvailableBranches('explosive');
assert(av.includes('armorBreak') && av.includes('ignite'), 'Lv4 破甲 / 引燃 同档解锁（均未选时二者同现）');
assert(!av.includes('incinerate'), 'Lv4 焚身 未满足前置 引燃');
// 破甲 / 引燃 同档(Lv4)互斥二选一：已选其一则排除另一
skills.explosive.branches.ignite = 1;
skills.explosive.level = 5;
av = getAvailableBranches('explosive');
assert(av.includes('incinerate'), 'Lv5 引燃已选 → 焚身解锁（前置满足）');
assert(!av.includes('armorBreak'), '已选引燃 → 互斥排除破甲（爆发增幅 vs 灼伤链 二选一）');
// 反向校验：选破甲则排除引燃
skills.explosive.branches = { armorBreak: 1 };
skills.explosive.level = 5;
av = getAvailableBranches('explosive');
assert(!av.includes('ignite'), '已选破甲 → 互斥排除引燃');

console.log('== 2. recomputeExplosiveMods 派生修正 ==');
skills.explosive.branches = { fuelFill: 1 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.explDmgMul - 1.20) < 1e-6, '富燃料 Lv1 explDmgMul=1.20');
assert(skills.explosive._mods.explRadiusCut === 0, '富燃料 不缩小范围（范围扩大仅由基础等级决定）');
skills.explosive.branches = { thermalExplode: 5 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.explDmgMul - Math.pow(1.38, 5)) < 1e-6, '热能爆炸 Lv5 伤害=5.05');
assert(skills.explosive._mods.explRadiusCut === 200, '热能爆炸 Lv5 范围平减=200px（每级-40，抵消并超过基础每级+20，取舍可见）');
skills.explosive.branches = { armorBreak: 2 };
recomputeExplosiveMods();
assert(skills.explosive._mods.explArmorBreak === true && Math.abs(skills.explosive._mods.armorBreakF - 0.16) < 1e-6, '破甲 Lv2 受伤+16%（无击退）');
skills.explosive.branches = { ignite: 4 };
recomputeExplosiveMods();
assert(skills.explosive._mods.explIgnite === true && Math.abs(skills.explosive._mods.burnDmgMul - Math.pow(1.20, 4)) < 1e-6, '引燃 Lv4 只增灼烧伤害(burnDmgMul=2.07)，不改时长');
skills.explosive.branches = { incinerate: 5 };
recomputeExplosiveMods();
assert(skills.explosive._mods.explIncinerate === 5, '焚身 Lv5 追加5档(15%最大生命)');
// 共享模板分支派生（多重/疾速/暴击/穿透）
skills.explosive.branches = { multiShot: 5 };
recomputeExplosiveMods();
assert(skills.explosive._mods.bulletCountBoost === 5, '多重爆裂 Lv5 子弹+5（每级+1，满级共+5）');
skills.explosive.branches = { highSpeed: 5 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.cdReduce - 0.40) < 1e-6, '急速冷却 Lv5 释放 cd 缩短 40%');
skills.explosive.branches = { crit: 5 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.critChanceBoost - 0.25) < 1e-6, '火焰暴击 Lv5 暴击率+25%');
assert(Math.abs(skills.explosive._mods.critDamageBoost - 0.75) < 1e-6, '火焰暴击 Lv5 暴击伤害+75%');
assert(skills.explosive._mods.critExplode === true, '火焰暴击 Lv5 质变：暴击触发小爆炸');
skills.explosive.branches = { pierce: 5 };
recomputeExplosiveMods();
assert(skills.explosive._mods.pierceBoost === 5, '烈焰穿透 Lv5 穿透+5');
assert(skills.explosive._mods.pierceSplash === true, '烈焰穿透 Lv5 质变：命中溅射');
skills.explosive.branches = { crit: 4 };
recomputeExplosiveMods();
assert(skills.explosive._mods.critExplode === false, '火焰暴击 Lv4 未质变（critExplode=false）');

console.log('== 3. applyUpgrade：选分支 = 大类继续升级，不占新槽 ==');
skills.explosive = { level: 1, branches: {}, _mods: { explDmgMul: 1, explRadiusMul: 1 } };
acquiredSkills = ['explosive'];
applyUpgrade({ type: 'explosive', branch: 'fuelFill' });
assert(skills.explosive.branches.fuelFill === 1, '分支升到 Lv1');
assert(skills.explosive.level === 2, '大类随之升到 Lv2');
assert(acquiredSkills.length === 1, '选分支不占新槽（acquiredSkills 仍为1）');
assert(Math.abs(skills.explosive._mods.explDmgMul - 1.20) < 1e-6, '派生修正已重算(explDmgMul=1.20)');
applyUpgrade({ type: 'explosive', branch: 'fuelFill' });
assert(skills.explosive.branches.fuelFill === 2, '再次选同分支 → 升到 Lv2');
assert(skills.explosive.level === 3, '大类随之升到 Lv3');

console.log('== 4. createExplosion：特效半径随爆炸范围缩放 ==');
bombExplosionEffects = [];
createExplosion(100, 100, 40);
assert(bombExplosionEffects.length === 1 && Math.abs(bombExplosionEffects[0].maxRadius - 40) < 1e-6, '小半径爆炸：maxRadius=40');
bombExplosionEffects = [];
createExplosion(100, 100, 240);
assert(bombExplosionEffects.length === 1 && Math.abs(bombExplosionEffects[0].maxRadius - 240) < 1e-6, '大半径爆炸(范围分支放大后)：maxRadius=240');

// 火花外缘（中心+自身半径）最大触及 = 爆炸半径（确保特效不超出伤害范围）
const updatePartSrc = extractFn('updateParticles');
eval(updatePartSrc);
function maxSparkOuter(radius) {
  particles = [];
  createExplosion(0, 0, radius);
  let mx = 0;
  for (let i = 0; i < 30; i++) {        // 粒子生命周期内逐帧追踪最大外缘半径
    updateParticles();
    for (const p of particles) if (p.maxR) mx = Math.max(mx, Math.hypot(p.x - p.ox, p.y - p.oy) + p.radius);
  }
  return mx;
}
assert(maxSparkOuter(40) <= 40 + 1.5, '火花外缘≤爆炸半径(40)');
assert(maxSparkOuter(240) <= 240 + 1.5, '火花外缘≤爆炸半径(240)');

console.log(FAILED ? '\nEXPL_TEST_FAIL' : '\nEXPL_TEST_OK');
process.exit(FAILED ? 1 : 0);
