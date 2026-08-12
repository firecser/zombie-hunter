// 回归测试：属性技能（爆炸/干冰/闪电链）独立于基础「火力强化」释放
// 1) 各属性技能有自身释放 cd（初始长、随等级降低、受自身疾速弹道降低），不受火力强化 fireRate 影响
// 2) 基础武器 shootBase 发射物理子弹(skillType:'damage')；属性技能 shootAttribute 发射自身元素子弹
// 3) 多重 Lv5 质变：属性子弹 canSplit 且数量 +1/级
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

const screenWidth = 1280, screenHeight = 720;
let bullets = [], zombies = [{ x: 0, y: 0, radius: 10 }];
const player = { x: 640, y: 360, gunAngle: 0, damage: 50, bulletSpeed: 10, bulletPiercing: 1, fireRate: 500, _splitOnHit: false };
const AudioSystem = { playShoot() {}, playZombieDeath() {} };
// 仅需 explosive/freeze/lightning 的 element 与少量分支 effect 供 shootAttribute / recompute 使用
const SKILL_DEFS = {
  damage:    { type: 'damage', name: '火力强化', element: '物理', branches: {} },
  explosive: { type: 'explosive', name: '爆炸弹', element: '火',
               branches: { multiShot: { effect(bl, m){ m.bulletCountBoost += bl; } },
                           highSpeed: { effect(bl, m){ m.speedMul *= Math.pow(1.20, bl); } } } },
  freeze:    { type: 'freeze', name: '干冰弹', element: '水', branches: {} },
  lightning: { type: 'lightning', name: '闪电链', element: '雷', branches: {} }
};
const skills = {
  damage:    { level: 1, _mods: { dmgMul: 1, radiusMul: 1, hitboxMul: 1, armorBonus: 0, knock: false, knockF: 0, fireMul: 1 } },
  explosive: { level: 0, _mods: {}, branches: {} },
  freeze:    { level: 0, _mods: {}, branches: {} },
  lightning: { level: 0, _mods: {}, _chainBonus: 0, _conduct: 0 }
};

// cd 常量（模块作用域，供注入的函数可见）+ 函数
const ATTRIBUTE_BULLET_TYPES = ['explosive', 'freeze', 'lightning'];
const ATTR_RELEASE_CD_BASE = 2600, ATTR_RELEASE_CD_MIN = 700, ATTR_RELEASE_CD_STEP = 130;
eval(extractFn('explosiveMods'));
eval(extractFn('freezeMods'));
eval(extractFn('attrModsForType'));
eval(extractFn('attrModsForBullet'));
eval(extractFn('getAttrReleaseCd'));
eval(extractFn('elementVisual'));
const ELEMENT_VISUAL = { '物理': { size: 1 }, '火': { size: 1.2 }, '水': { size: 0.92 }, '金': { size: 1.05 }, '木': { size: 1 }, '土': { size: 1.14 } };
eval(extractFn('recomputeExplosiveMods'));
eval(extractFn('recomputeFreezeMods'));
eval(extractFn('shootBase'));
eval(extractFn('shootAttribute'));

let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

console.log('== 1. 属性技能独立释放 cd ==');
skills.explosive.level = 0;
assert(getAttrReleaseCd('explosive') === 2600, 'Lv0 cd = 2600(初始较长)');
skills.explosive.level = 5;
assert(getAttrReleaseCd('explosive') === 1950, 'Lv5 cd = 2600 - 5*130 = 1950');
skills.explosive.level = 99;
assert(getAttrReleaseCd('explosive') === 700, 'Lv99 cd 触底到下限 700');
skills.explosive.level = 5;

console.log('== 2. cd 不受火力强化 fireRate 影响 ==');
skills.damage._mods.fireMul = 50;          // 火力强化把射速拉到极快
assert(getAttrReleaseCd('explosive') === 1950, '火力强化 fireMul=50 时，爆炸弹 cd 仍为 1950（独立）');
skills.damage._mods.fireMul = 1;
// 自身疾速弹道进一步降低 cd
skills.explosive.branches = { highSpeed: 5 };
recomputeExplosiveMods();
assert(getAttrReleaseCd('explosive') < 1950, '自身疾速弹道 Lv5 后 cd 进一步降低(<1950)');
skills.explosive.branches = {};
recomputeExplosiveMods();

console.log('== 3. 基础武器 vs 属性子弹（skillType / element 解耦）==');
bullets = [];
shootBase();
assert(bullets.length === 1, '基础武器发射 1 发');
assert(bullets[0].skillType === 'damage' && bullets[0].element === '物理', '基础子弹 skillType=damage / element=物理（不受属性树）');

bullets = [];
skills.explosive.level = 5;
shootAttribute('explosive');
assert(bullets.length === 1 && bullets[0].skillType === 'explosive' && bullets[0].element === '火', '爆炸弹发射火属性子弹(skillType=explosive)');

bullets = [];
skills.freeze.level = 3;
shootAttribute('freeze');
assert(bullets.length === 1 && bullets[0].skillType === 'freeze' && bullets[0].element === '水', '干冰弹发射水属性子弹(skillType=freeze)');

bullets = [];
skills.lightning.level = 2;
shootAttribute('lightning');
assert(bullets.length === 1 && bullets[0].skillType === 'lightning' && bullets[0].element === '雷', '闪电链发射雷属性子弹(skillType=lightning)');

console.log('== 4. 多重 Lv5 质变：属性子弹分裂 ==');
bullets = [];
skills.explosive.branches = { multiShot: 5 };
recomputeExplosiveMods();
shootAttribute('explosive');
assert(bullets.length === 6, '多重爆裂 Lv5 → 1+5=6 发');
assert(bullets[0].canSplit === true, '多重 Lv5 标记 canSplit=true（命中可分裂）');
skills.explosive.branches = {};
recomputeExplosiveMods();

console.log(FAILED ? '\n结果: 有失败项 ❌' : '\n结果: 全部通过 ✅');
process.exit(FAILED ? 1 : 0);
