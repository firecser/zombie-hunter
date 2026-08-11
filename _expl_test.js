// 爆炸弹分支树 —— 无头逻辑冒烟测试
// 从「game - 副本.js」抽取真实函数与 explosive.branches，验证：树语义 + 分支可持续升级 + 选分支不占槽 + 互斥/前置 + 派生修正
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
const applySrc = extractFn('applyUpgrade');

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
function fireQualNodes() {}
function levelUp() {}

eval(getAvailSrc);
eval(recomputeSrc);
eval(applySrc);

let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

console.log('== 1. getAvailableBranches 树语义（爆炸弹）==');
skills.explosive.level = 1;
assert(getAvailableBranches('explosive').length === 0, 'Lv1 无分支解锁');
skills.explosive.level = 2;
let av = getAvailableBranches('explosive');
assert(av.includes('fuelFill') && av.includes('thermalBurst'), 'Lv2 解锁 富燃料填充 / 热能爆发');
assert(!av.includes('thermalExplode') && !av.includes('shockwave'), 'Lv2 热能爆炸/温压冲击 未到 reqLevel3');
skills.explosive.branches.fuelFill = 1;
skills.explosive.level = 3;
av = getAvailableBranches('explosive');
assert(av.includes('fuelFill'), '分支未升满 → 仍被提供用于继续升级');
assert(av.includes('thermalExplode') && av.includes('shockwave'), 'Lv3 热能爆炸与温压冲击 同时出现（互斥但尚未二选一）');
skills.explosive.branches.thermalExplode = 1;
av = getAvailableBranches('explosive');
assert(!av.includes('shockwave'), '互斥：选热能爆炸后，温压冲击不再进池');
skills.explosive.level = 4;
av = getAvailableBranches('explosive');
assert(av.includes('ignite'), 'Lv4 引燃解锁');
assert(!av.includes('incinerate'), 'Lv4 焚身 未满足前置 引燃');
skills.explosive.branches.ignite = 1;
skills.explosive.level = 5;
av = getAvailableBranches('explosive');
assert(av.includes('incinerate'), 'Lv5 引燃已选 → 焚身解锁（前置满足）');

console.log('== 2. recomputeExplosiveMods 派生修正 ==');
skills.explosive.branches = { fuelFill: 1 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.explDmgMul - 1.20) < 1e-6, '富燃料 Lv1 explDmgMul=1.20');
assert(Math.abs(skills.explosive._mods.explRadiusMul - 1.00) < 1e-6, '富燃料 不改范围');
skills.explosive.branches = { thermalBurst: 3 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.explRadiusMul - Math.pow(1.20, 3)) < 1e-6, '热能爆发 Lv3 范围=1.728');
skills.explosive.branches = { thermalExplode: 5 };
recomputeExplosiveMods();
assert(Math.abs(skills.explosive._mods.explDmgMul - Math.pow(1.45, 5)) < 1e-6, '热能爆炸 Lv5 伤害=6.41');
assert(Math.abs(skills.explosive._mods.explRadiusMul - Math.pow(0.85, 5)) < 1e-6, '热能爆炸 Lv5 范围=0.444（惩罚）');
skills.explosive.branches = { shockwave: 2 };
recomputeExplosiveMods();
assert(skills.explosive._mods.explKnock === true && skills.explosive._mods.explKnockF === 60, '温压冲击 Lv2 击退=60');
skills.explosive.branches = { ignite: 4 };
recomputeExplosiveMods();
assert(skills.explosive._mods.explIgnite === true && skills.explosive._mods.igniteLevel === 4, '引燃 Lv4 启用火池');
skills.explosive.branches = { incinerate: 5 };
recomputeExplosiveMods();
assert(skills.explosive._mods.explIncinerate === 5, '焚身 Lv5 追加5档(15%最大生命)');

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

console.log(FAILED ? '\nEXPL_TEST_FAIL' : '\nEXPL_TEST_OK');
process.exit(FAILED ? 1 : 0);
