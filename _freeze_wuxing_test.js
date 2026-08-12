// 干冰弹（水属性树）+ 五行系统 无头逻辑冒烟测试
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
function extractBranches(type) {
  const ex = src.indexOf("type:'" + type + "'");
  const bi = src.indexOf('branches: {', ex);
  const bj = src.indexOf('{', bi);
  let depth = 0, k = bj;
  for (; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(bj, k);
}

const WUXING_ELEMENT = eval(extractConst('WUXING_ELEMENT'));
const WUXING_OVERCOME = eval(extractConst('WUXING_OVERCOME'));
const WUXING_GENERATE = eval(extractConst('WUXING_GENERATE'));
// 标量常量：extractConst 按对象花括号提取，不适用于标量，这里直接用源码值
const WUXING_OVERCOME_BONUS = 0.30;
const WUXING_GENERATE_BONUS = 0.15;

eval(extractFn('getElementBonus'));
eval(extractFn('recomputeWuxingSynergy'));
eval(extractFn('attributeMods'));
eval(extractFn('getBulletElement'));
eval(extractFn('explosiveMods'));
eval(extractFn('recomputeExplosiveMods'));
eval(extractFn('freezeMods'));
eval(extractFn('recomputeFreezeMods'));
eval(extractFn('getFreezeChance'));
eval(extractFn('getFreezeDuration'));
eval(extractFn('getSlowChance'));
eval(extractFn('getSlowFactor'));

const SKILL_DEFS = {
  freeze:    { type:'freeze',    name:'干冰弹', icon:'❄️', element:'水', category:'bullet', maxLevel:99, desc:'x', apply(){},
              branches: eval('(' + extractBranches('freeze') + ')') },
  explosive: { type:'explosive', name:'爆炸弹', icon:'💥', element:'火', category:'bullet', maxLevel:99, desc:'y', apply(){},
              branches: eval('(' + extractBranches('explosive') + ')') },
  tornado:   { type:'tornado',   name:'龙卷风', icon:'🌪️', element:'风', category:'cc',     maxLevel:10, desc:'z', apply(){} }
};

let skills = {};
for (const k in SKILL_DEFS) skills[k] = { level:0, name:SKILL_DEFS[k].name, icon:SKILL_DEFS[k].icon, desc:SKILL_DEFS[k].desc, element:SKILL_DEFS[k].element, category:SKILL_DEFS[k].category, maxLevel:SKILL_DEFS[k].maxLevel, branches:{}, qualified:{} };
let acquiredSkills = [];
let wuxingSynergy = {};
const talentMods = { freezeChance:0, freezeLevel:0, slowChance:0, slowLevel:0, critChance:0, critDamageMult:2 };
const STATUS_ELEMENT_BONUS = { frozen:{}, slow:{}, burning:{} };
const player = { damage:10, fireRate:500, bulletSpeed:10, exp:0, expToLevel:100, level:1, bulletCount:1, bulletPiercing:1 };
function fireQualNodes() {}

let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

console.log('== 1. 五行映射与克制 ==');
assert(WUXING_ELEMENT['火'] === '火', '火 映射为 火');
assert(WUXING_ELEMENT['冰'] === '水', '冰 映射为 水');
assert(WUXING_ELEMENT['雷'] === '金', '雷 映射为 金');
assert(WUXING_ELEMENT['风'] === '木', '风 映射为 木');
assert(WUXING_OVERCOME['火'] === '金', '火克金');
assert(WUXING_OVERCOME['水'] === '火', '水克火');

console.log('== 2. getElementBonus：克制与相生 ==');
const zGold = { element:'金' };
const zFire = { element:'火' };
assert(Math.abs(getElementBonus(zGold, '火') - 1.30) < 1e-9, '火攻击金目标：克制+30%');
assert(Math.abs(getElementBonus(zFire, '水') - 1.30) < 1e-9, '水攻击火目标：克制+30%');
assert(Math.abs(getElementBonus(zGold, '水') - 1.0) < 1e-9, '水攻击金目标：无克制');
// 相生：全局 wuxingSynergy[被生元素]=true 时该元素伤害+15%
// 火生土 → 土属性伤害获得+15%；火本身攻击不因此获得加成
wuxingSynergy = { '土': true };
assert(Math.abs(getElementBonus(zGold, '火') - 1.30) < 1e-9, '火攻击金：只有克制30%，火生土加成给土不是给火');
const zEarth = { element: '土' };
assert(Math.abs(getElementBonus(zEarth, '土') - 1.15) < 1e-9, '土属性攻击：火生土协同给土+15%');
wuxingSynergy = {};

console.log('== 3. recomputeWuxingSynergy：同时持有相生技能才激活 ==');
acquiredSkills = ['explosive'];
recomputeWuxingSynergy();
assert(!wuxingSynergy['土'], '只有火：未激活火生土');
acquiredSkills = ['explosive', 'freeze']; // 火 + 水：非相生也非相克（无协同）
recomputeWuxingSynergy();
assert(!wuxingSynergy['水'] && !wuxingSynergy['火'], '火+水：无相生协同');
acquiredSkills = ['explosive', 'tornado']; // 火(生土) + 风→木；木生火 → 火被生
recomputeWuxingSynergy();
assert(wuxingSynergy['火'] === true, '木(风)+火 同时存在：木生火 → 火协同激活');
assert(!wuxingSynergy['土'], '木+火：火生土不激活（缺土）');

console.log('== 4. getBulletElement：主属性元素随最高属性树变化 ==');
skills.explosive.level = 3; skills.freeze.level = 0;
assert(getBulletElement() === '火', '只有火树激活：子弹元素为火');
skills.freeze.level = 5;
assert(getBulletElement() === '水', '水树等级更高：子弹元素为水');
skills.freeze.level = 3; skills.explosive.level = 3;
assert(getBulletElement() === '水', '同等级：按优先级 水>火>金>木 选水');
skills.explosive.level = 0; skills.freeze.level = 0;
assert(getBulletElement() === '物理', '无属性树：物理');

console.log('== 5. recomputeFreezeMods：水属性树派生修正 ==');
skills.freeze.branches = { flashFreeze: 3 };
recomputeFreezeMods();
assert(Math.abs(skills.freeze._mods.freezeChanceBoost - 0.24) < 1e-6, '急冻 Lv3 冻结概率+24%');
skills.freeze.branches = { deepFreeze: 5 };
recomputeFreezeMods();
assert(Math.abs(skills.freeze._mods.freezeDurationBoost - 1.0) < 1e-6, '深寒 Lv5 冻结时长+100%');
skills.freeze.branches = { frostBite: 5 };
recomputeFreezeMods();
assert(Math.abs(skills.freeze._mods.slowFactorBoost - 0.25) < 1e-6, '霜寒 Lv5 减速幅度+25%');
skills.freeze.branches = { crit: 5 };
recomputeFreezeMods();
assert(skills.freeze._mods.iceBurst === true, '冰霜暴击 Lv5 质变 iceBurst');
assert(Math.abs(skills.freeze._mods.critChanceBoost - 0.25) < 1e-6, '冰霜暴击 Lv5 暴击率+25%（全局共享模板）');
skills.freeze.branches = { pierce: 5 };
recomputeFreezeMods();
assert(skills.freeze._mods.iceSpike === true, '寒冰穿透 Lv5 质变 iceSpike');

console.log('== 6. getFreezeChance/Duration/SlowFactor：读水树 _mods ==');
talentMods.freezeChance = 0.05; talentMods.freezeLevel = 2;
talentMods.slowLevel = 1;
skills.freeze.level = 4;
skills.freeze.branches = { flashFreeze: 2, deepFreeze: 1 };
recomputeFreezeMods();
assert(Math.abs(getFreezeChance() - (0.05 + 4*0.06 + 0.16)) < 1e-6, '冻结概率 = 天赋+等级+急冻分支');
assert(getFreezeDuration() > 1000, '深寒 Lv1 提升冻结时长');
assert(Math.abs(getSlowFactor() - (0.7 - 0.01 - 0)) < 1e-6, '减速系数读天赋，无霜寒时不变');
skills.freeze.branches = { frostBite: 5 };
recomputeFreezeMods();
assert(Math.abs(getSlowFactor() - (0.7 - 0.01 - 0.25)) < 1e-6, '霜寒 Lv5 进一步降低移速系数');

console.log('== 7. attributeMods：多属性树共享模板全局叠加 ==');
skills.explosive.branches = { multiShot: 2, crit: 1 };
skills.freeze.branches = { multiShot: 3, crit: 2 };
recomputeExplosiveMods(); // 注入 _mods
recomputeFreezeMods();
const am = attributeMods();
assert(am.bulletCountBoost === 5, '火树子弹+2 与 水树子弹+3 叠加 = 5');
assert(Math.abs(am.critChanceBoost - 0.15) < 1e-6, '火树暴击+5% 与 水树暴击+10% 叠加 = 15%');
assert(Math.abs(am.speedMul - 1) < 1e-6, '无 highSpeed 时 speedMul=1');

console.log(FAILED ? '\nFREEZE_WUXING_TEST_FAIL' : '\nFREEZE_WUXING_TEST_OK');
process.exit(FAILED ? 1 : 0);
