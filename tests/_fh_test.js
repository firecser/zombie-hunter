// 火力强化分支树 —— 无头逻辑冒烟测试
// 直接从「游戏 - 副本.js」抽取真实函数与数据，验证：树语义 + 分支可持续升级 + 选分支不占槽 + 互斥不进池 + 图标沿用大类
const fs = require('fs');
const src = fs.readFileSync('game - 副本.js', 'utf8');

// 按大括号平衡抽取一个函数定义文本
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
// 抽取 damage.branches 对象字面量
function extractBranches() {
  const bi = src.indexOf('branches: {');
  const bj = src.indexOf('{', bi);
  let depth = 0, k = bj;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(bj, k);
}

const getAvailSrc = extractFn('getAvailableBranches');
const recomputeSrc = extractFn('recomputeDamageMods');
const applySrc = extractFn('applyUpgrade');
const showSrc = extractFn('showUpgradePanel');
const weightSrc = extractFn('upgradeCardWeight');
const pickSrc = extractFn('weightedPick3');

// ---- 测试沙箱（仅提供被测函数所需的最小全局）----
const DAMAGE_ICON = '🔫';
const SKILL_DEFS = {
  damage: { type: 'damage', name: '火力强化', icon: DAMAGE_ICON, branches: eval('(' + extractBranches() + ')') },
  // 两个占位技能，验证「未满槽时加入未拥有大类卡」
  dummy1: { type: 'dummy1', name: '占位1', icon: 'A', element: '物理', category: 'bullet', maxLevel: 9, desc: 'x', apply() {} },
  dummy2: { type: 'dummy2', name: '占位2', icon: 'B', element: '物理', category: 'bullet', maxLevel: 9, desc: 'y', apply() {} }
};
const upgradePool = Object.keys(SKILL_DEFS).map(t => ({ type: t, name: SKILL_DEFS[t].name, icon: SKILL_DEFS[t].icon, desc: SKILL_DEFS[t].desc }));

let skills = {};
for (const k in SKILL_DEFS) skills[k] = { level: 0, name: SKILL_DEFS[k].name, icon: SKILL_DEFS[k].icon, desc: SKILL_DEFS[k].desc, element: '物理', category: 'bullet', maxLevel: 99, branches: {}, qualified: {} };
let acquiredSkills = ['damage'];
let isSkillLab = false;
let upgradeOptions = [];
let gameState = 'playing', gameRunning = true, lastTime = Date.now();
let justGotBomb = false, bombFull = false;
let selectedUpgrade = -1;
const MAX_SKILLS = 5;
const player = { damage: 10, fireRate: 500, bulletSpeed: 10, exp: 0, expToLevel: 100, level: 1 };
function fireQualNodes() {}   // damage 无 qualNodes，安全置空
function levelUp() {}

// 注入真实函数（非严格 eval 使其进入本作用域）
eval(getAvailSrc);
eval(recomputeSrc);
eval(applySrc);
eval(showSrc);
eval(weightSrc);
eval(pickSrc);

// 五行系统增量（applyUpgrade 末尾统一重算协同）
const WUXING_ELEMENT = { '金':'金','木':'木','水':'水','火':'火','土':'土','雷':'金','风':'木','冰':'水' };
const WUXING_GENERATE = { '火':'土','土':'金','金':'水','水':'木','木':'火' };
let wuxingSynergy = {};
const MAX_LEVEL = 999;
eval(extractFn('recomputeExplosiveMods'));
eval(extractFn('recomputeFreezeMods'));
eval(extractFn('recomputeWuxingSynergy'));

// ---- 断言工具 ----
let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

console.log('== 1. getAvailableBranches 树语义 + 分支可持续升级 ==');
skills.damage.level = 1;
assert(getAvailableBranches('damage').length === 0, 'Lv1 无分支解锁');
skills.damage.level = 2;
let av = getAvailableBranches('damage');
assert(av.includes('heavyBarrel'), 'Lv2 出现 重型枪管');
assert(!av.includes('rapidFire') && !av.includes('charge'), 'Lv2 狂暴连射/蓄能射击 未到 reqLevel3');
// 选重型枪管 Lv1；未升满前，后续等级仍应再次提供（可持续升级）
skills.damage.branches.heavyBarrel = 1;
skills.damage.level = 3;
av = getAvailableBranches('damage');
assert(av.includes('heavyBarrel'), '分支未升满 → 仍被提供用于继续升级');
assert(av.includes('rapidFire') && av.includes('charge'), 'Lv3 狂暴连射与蓄能射击 同时出现（互斥但尚未二选一）');
skills.damage.branches.rapidFire = 1;
av = getAvailableBranches('damage');
assert(!av.includes('charge'), '互斥：选狂暴连射后，蓄能射击不再进池');
skills.damage.level = 4;
av = getAvailableBranches('damage');
assert(av.includes('armorPierce'), 'Lv4 穿甲弹头解锁（前置 重型枪管 已选）');
// 前置反例：无重型枪管时，穿甲弹头即使 Lv4 也不进池
skills.damage.branches = {}; skills.damage.level = 4;
assert(!getAvailableBranches('damage').includes('armorPierce'), '前置反例：未选重型枪管时 穿甲弹头不进池');
skills.damage.branches.heavyBarrel = 1;
skills.damage.level = 5;
assert(getAvailableBranches('damage').includes('knockback'), 'Lv5 后坐力解锁');
skills.damage.branches.knockback = 1;
skills.damage.level = 6;
assert(getAvailableBranches('damage').includes('calibration'), 'Lv6 弹道校准解锁');
// 升满后不再提供
skills.damage.branches.heavyBarrel = 5;
assert(!getAvailableBranches('damage').includes('heavyBarrel'), '分支升满(maxLevel=5)后不再提供');
// 其它分支未升满，仍应提供（验证「全部选完 ≠ 无分支」，而是「全部升满才无分支」）
skills.damage.branches.rapidFire = 1;
skills.damage.branches.armorPierce = 1;
skills.damage.branches.calibration = 1;
const remaining = getAvailableBranches('damage');
assert(remaining.includes('rapidFire') && remaining.includes('armorPierce') && remaining.includes('calibration'),
       '未升满的分支仍可被提供继续升级（rapidFire/armorPierce/calibration）');

console.log('== 2. recomputeDamageMods 派生修正（按分支等级，平衡后数值）==');
skills.damage.branches = { heavyBarrel: 1 };
recomputeDamageMods();
assert(Math.abs(skills.damage._mods.dmgMul - 1.20) < 1e-6, '重型枪管 Lv1 dmgMul=1.20(+20%/级)');
assert(Math.abs(skills.damage._mods.radiusMul - 1.20) < 1e-6, '重型枪管 Lv1 子弹体型=1.20(+20%/级)');
assert(skills.damage._mods.fireMul > 1, '射速下降(间隔变长, fireMul>1，真-3%/级惩罚)');
// 持续升级验证：重型枪管 Lv3 → 体型/伤害/弹速惩罚随等级放大（复合倍率）
skills.damage.branches = { heavyBarrel: 3 };
recomputeDamageMods();
assert(Math.abs(skills.damage._mods.dmgMul - Math.pow(1.20, 3)) < 1e-6, '重型枪管 Lv3 dmgMul=1.20^3');
assert(Math.abs(skills.damage._mods.radiusMul - Math.pow(1.20, 3)) < 1e-6, '重型枪管 Lv3 子弹体型=1.20^3');

skills.damage.branches = { charge: 1 };
recomputeDamageMods();
assert(skills.damage._mods.fireMul > 1.1 && skills.damage._mods.fireMul < 1.2, '蓄能射击 Lv1 射速微降(fireMul≈1.147)');
assert(Math.abs(skills.damage._mods.dmgMul - 1.35) < 1e-6, '蓄能射击 Lv1 伤害大增(dmgMul=1.35)');

skills.damage.branches = { rapidFire: 2 };
recomputeDamageMods();
assert(Math.abs(skills.damage._mods.fireMul - Math.pow(0.82, 2)) < 1e-6, '狂暴连射 Lv2 射速×0.82^2');
assert(Math.abs(skills.damage._mods.dmgMul - Math.pow(0.96, 2)) < 1e-6, '狂暴连射 Lv2 每发×0.96^2(-4%/级)');

skills.damage.branches = { armorPierce: 1 };
recomputeDamageMods();
assert(skills.damage._mods.armorBonus === 0.30, '穿甲弹头 Lv1 armorBonus=0.30(+30%/级，对坦克/Boss)');
skills.damage.branches = { armorPierce: 3 };
recomputeDamageMods();
assert(Math.abs(skills.damage._mods.armorBonus - 0.90) < 1e-6, '穿甲弹头 Lv3 armorBonus=0.90');

skills.damage.branches = { knockback: 1, calibration: 1 };
recomputeDamageMods();
assert(skills.damage._mods.knock === true && skills.damage._mods.knockF === 15, '后坐力 Lv1 击退=15');
skills.damage.branches = { knockback: 4 };
recomputeDamageMods();
assert(skills.damage._mods.knockF === 60, '后坐力 Lv4 击退=60(随等级)');
skills.damage.branches = { calibration: 1 };
recomputeDamageMods();
assert(skills.damage._mods.hitboxMul === 1.18, '弹道校准 Lv1 命中盒=1.18(+18%/级)');
skills.damage.branches = { calibration: 3 };
recomputeDamageMods();
assert(Math.abs(skills.damage._mods.hitboxMul - Math.pow(1.18, 3)) < 1e-6, '弹道校准 Lv3 命中盒=1.18^3');

console.log('== 3. applyUpgrade 选分支 = 大类升级且不占新槽 ==');
skills = {};
for (const k in SKILL_DEFS) skills[k] = { level: 0, branches: {}, qualified: {} };
skills.damage.level = 1;
acquiredSkills = ['damage'];
const slotsBefore = acquiredSkills.length;
applyUpgrade({ type: 'damage', branch: 'heavyBarrel' });
assert(acquiredSkills.length === slotsBefore, '选分支后槽位数不变（不占新槽）');
assert(skills.damage.level === 2, '选分支 = 火力强化升到 Lv2');
assert(skills.damage.branches.heavyBarrel === 1, '分支等级记为 1（整数）');
assert(Math.abs(skills.damage._mods.dmgMul - 1.20) < 1e-6, 'applyUpgrade 后派生修正已重算(重型dm=1.20)');
// 再次选同一分支 → 升到 Lv2，大类继续升级
applyUpgrade({ type: 'damage', branch: 'heavyBarrel' });
assert(skills.damage.branches.heavyBarrel === 2, '再次选同分支 → 分支升到 Lv2');
assert(skills.damage.level === 3, '大类随之升到 Lv3');
assert(Math.abs(skills.damage._mods.dmgMul - Math.pow(1.20, 2)) < 1e-6, 'Lv2 派生修正 dmgMul=1.20^2');

console.log('== 4. showUpgradePanel 候选集（实验室模式）+ 图标沿用大类 ==');
skills = {};
for (const k in SKILL_DEFS) skills[k] = { level: 0, branches: {}, qualified: {} };
skills.damage.level = 1;
acquiredSkills = ['damage'];
isSkillLab = true;
showUpgradePanel();
const dmgBase = upgradeOptions.filter(o => o.type === 'damage' && !o.branch).length;
const dmgBranch = upgradeOptions.filter(o => o.type === 'damage' && o.branch).length;
assert(dmgBase === 1, '实验室列出 火力强化 基础升级卡');
assert(dmgBranch === 0, 'Lv1 时 火力强化 无分支卡（符合解锁阈值）');
// 升到 Lv3 后应有 狂暴连射/蓄能射击 分支卡
skills.damage.level = 3;
showUpgradePanel();
const branchCards = upgradeOptions.filter(o => o.type === 'damage' && o.branch);
const branchIds = branchCards.map(o => o.branch);
assert(branchIds.includes('rapidFire') && branchIds.includes('charge'), 'Lv3 实验室出现两个互斥分支卡');
// 图标必须沿用大类 icon，不得另设
assert(branchCards.every(o => o.icon === DAMAGE_ICON), '分支卡图标 === 大类图标(🔫)，未另设');
// 选狂暴连射后重开面板：蓄能射击应消失（互斥不进池）；且狂暴连射仍出现（可继续升级）
skills.damage.branches.rapidFire = 1;
showUpgradePanel();
const branchCards2 = upgradeOptions.filter(o => o.type === 'damage' && o.branch);
const ids2 = branchCards2.map(o => o.branch);
assert(!ids2.includes('charge'), '互斥不进池：选狂暴连射后 蓄能射击 卡消失');
assert(ids2.includes('rapidFire'), '已选未升满分支仍出现 → 可继续升级');
assert(upgradeOptions.some(o => o.type === 'dummy1' || o.type === 'dummy2'), '未满槽时加入未拥有大类卡');

console.log('== 5. 加权抽取：基础大类卡不被分支挤掉（基础与分支不互斥）==');
// 构造典型候选池：1 张火力强化基础卡 + 6 张分支卡（模拟 L6 已解锁全部分支场景）
const pool = [
  { type:'damage', branch:undefined },
  { type:'damage', branch:'heavyBarrel' },
  { type:'damage', branch:'rapidFire' },
  { type:'damage', branch:'charge' },
  { type:'damage', branch:'armorPierce' },
  { type:'damage', branch:'knockback' },
  { type:'damage', branch:'calibration' }
];
assert(upgradeCardWeight({ type:'damage' }) > upgradeCardWeight({ type:'damage', branch:'heavyBarrel' }),
       '基础火力强化卡权重(2.0) > 分支卡权重(1.0)：基础更易刷出');
// 统计：加权抽 5000 次，基础卡出现率应明显高于均匀分布基线（1-(C6,3/C7,3)=0.429）
let baseHits = 0; const N = 5000;
for (let i = 0; i < N; i++) {
  const picks = weightedPick3(pool);
  if (picks.some(c => c.type === 'damage' && !c.branch)) baseHits++;
}
const rate = baseHits / N;
console.log('  基础卡刷出率 =', rate.toFixed(3), '（均匀基线 0.429）');
assert(rate > 0.45, '基础卡在三选一中稳定可刷出（加权后 > 均匀基线）');

console.log(FAILED ? '\nFH_TEST_FAIL' : '\nFH_TEST_OK');
process.exit(FAILED ? 1 : 0);
