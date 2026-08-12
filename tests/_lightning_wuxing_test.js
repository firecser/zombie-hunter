const fs = require('fs');
const src = fs.readFileSync('game - 副本.js', 'utf8');

function extractFn(name) {
    const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{', 'g');
    let match; let start = -1;
    while ((match = re.exec(src)) !== null) {
        start = match.index;
        break;
    }
    if (start < 0) throw new Error('function ' + name + ' not found');
    let depth = 0, i = start, inString = false, stringChar = '';
    for (; i < src.length; i++) {
        const c = src[i];
        if (inString) {
            if (c === '\\') { i++; continue; }
            if (c === stringChar) inString = false;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inString = true; stringChar = c; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return src.slice(start, i);
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

// 基础运行时
const player = { x: 400, y: 300, damage: 100, radius: 20, bulletSpeed: 10, bulletCount: 1, bulletPiercing: 1, gunAngle: 0, lastShot: 0, fireRate: 500 };
const zombies = [];
const bullets = [];
const skills = {};
const acquiredSkills = ['damage'];
const updateFields = {};
const talentMods = { critChance: 0, critDamageMult: 2, critLevel: 0, freezeChance: 0, freezeLevel: 0, slowChance: 0, slowLevel: 0, shieldLevel: 0, explosiveLevel: 0, lightningLevel: 0, freezeSkillLevel: 0, damageSkillLevel: 0, explosiveSkillLevel: 0, multishotLevel: 0, piercingLevel: 0, bulletLevel: 0, speedLevel: 0, bombMaxBonus: 0 };
let wuxingSynergy = {};
const particles = [], damageNumbers = [], expOrbs = [], goldOrbs = [], hitEffects = [];
const iceFields = [], electricFields = [], lightningEffects = [];
const BURN_DURATION = 1500;
let screenWidth = 800, screenHeight = 600;

// 注入常量
const SKILL_DEFS = eval(extractConst('SKILL_DEFS'));
const WUXING_ELEMENT = eval(extractConst('WUXING_ELEMENT'));
const WUXING_OVERCOME = eval(extractConst('WUXING_OVERCOME'));
const WUXING_GENERATE = eval(extractConst('WUXING_GENERATE'));
const WUXING_OVERCOME_BONUS = 0.30, WUXING_GENERATE_BONUS = 0.15;

// 注入标量常量（静电场领域参数，随源文件同步）
function extractScalar(name) {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([^;]+);'));
    if (!m) throw new Error('未找到常量 ' + name);
    return eval(m[1]);
}
const STATIC_FIELD_BASE_RADIUS = extractScalar('STATIC_FIELD_BASE_RADIUS');
const STATIC_FIELD_RADIUS_PER_LV = extractScalar('STATIC_FIELD_RADIUS_PER_LV');
const STATIC_FIELD_BASE_LIFE = extractScalar('STATIC_FIELD_BASE_LIFE');
const STATIC_FIELD_LIFE_PER_LV = extractScalar('STATIC_FIELD_LIFE_PER_LV');

// 初始化技能实例
for (const _t in SKILL_DEFS) {
    const _d = SKILL_DEFS[_t];
    skills[_t] = { level: 0, name: _d.name, icon: _d.icon, desc: _d.desc, element: _d.element, category: _d.category, maxLevel: _d.maxLevel, branches: {}, qualified: {} };
}

let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

// 注入函数
eval(extractFn('recomputeWuxingSynergy'));
eval(extractFn('recomputeDamageMods'));
eval(extractFn('recomputeExplosiveMods'));
eval(extractFn('recomputeFreezeMods'));
eval(extractFn('recomputeLightningMods'));
eval(extractFn('explosiveMods'));
eval(extractFn('freezeMods'));
eval(extractFn('lightningMods'));
eval(extractFn('attrModsForType'));
eval(extractFn('attrModsForBullet'));
eval(extractFn('attributeMods'));
eval(extractFn('getBulletElement'));
eval(extractFn('getElementBonus'));

console.log('== 1. 跃迁电子技能定义 ==');
const ldef = SKILL_DEFS.lightning;
assert(ldef.element === '金', 'lightning 元素为金（五行）');
assert(ldef.maxLevel === 99, 'lightning maxLevel=99');
assert(ldef.branches && ldef.branches.multiShot && ldef.branches.crit && ldef.branches.pierce && ldef.branches.highSpeed, '包含共享模板分支 multiShot/crit/pierce/highSpeed');
assert(ldef.branches.chainConduct && ldef.branches.highVoltage, '包含金专属分支 chainConduct / highVoltage');
assert(ldef.branches.emp && ldef.branches.staticField, '包含金专属分支 emp / staticField');
assert(ldef.branches.superConductor && ldef.branches.thunderStrike, '包含金专属质变 superConductor / thunderStrike');
assert(ldef.branches.chainConduct.mutex.includes('highVoltage'), 'chainConduct 与 highVoltage 互斥');
assert(ldef.branches.emp.mutex.includes('staticField'), 'emp 与 staticField 互斥');

console.log('== 2. recomputeLightningMods 分支派生 ==');
skills.lightning.level = 5;
skills.lightning.branches = { chainConduct: 3, highVoltage: 0, emp: 2, staticField: 0, superConductor: 2, thunderStrike: 0, crit: 0, pierce: 0, multiShot: 0, highSpeed: 0 };
recomputeLightningMods();
const lm = lightningMods();
assert(lm.chainCountBoost === 3, 'chainConduct Lv3 → chainCountBoost=3');
assert(lm.chainDmgMul === 1, '未选 highVoltage → chainDmgMul=1');
assert(lm.empStunChance === 0.12 && lm.empStunDuration === 200, 'emp Lv2 → stunChance=0.12, duration=200ms');
assert(lm.staticFieldChance === 0, '未选 staticField → staticFieldChance=0');
assert(Math.abs(lm.superConductorDmgMul - 0.4) < 0.001 && lm.superConductorCountBoost === 2, 'superConductor Lv2 → dmgMul+0.4(20%/级), count+2');
assert(Math.abs(lm.superConductorMaxHp - 0.04) < 0.001, 'superConductor Lv2 → 最大生命%追击 +0.04(2%/级)');
assert(lm.thunderStrike === false, '未选 thunderStrike → false');

skills.lightning.branches = { chainConduct: 0, highVoltage: 5, emp: 0, staticField: 4, superConductor: 0, thunderStrike: 1, crit: 5, multiShot: 0, highSpeed: 0, pierce: 0 };
recomputeLightningMods();
const lm2 = lightningMods();
assert(Math.abs(lm2.chainDmgMul - Math.pow(1.2, 5)) < 0.001, 'highVoltage Lv5 → chainDmgMul=1.2^5');
assert(lm2.chainRangeBoost === 40, 'highVoltage Lv5 → chainRangeBoost=40');
assert(lm2.staticFieldChance === 0.8, 'staticField Lv4 → staticFieldChance=0.8');
assert(lm2.thunderStrike === true, 'thunderStrike 选中 → true');
assert(lm2.critChanceBoost === 0.25 && lm2.critDamageBoost === 0.75, 'crit Lv5 → critChance+25%, critDamage+75%');
assert(Math.abs(lm2.staticFieldRadius - (STATIC_FIELD_BASE_RADIUS + STATIC_FIELD_RADIUS_PER_LV * 4)) < 0.001, 'staticField Lv4 → 领域半径=' + (STATIC_FIELD_BASE_RADIUS + STATIC_FIELD_RADIUS_PER_LV * 4) + 'px');
assert(Math.abs(lm2.staticFieldLife - (STATIC_FIELD_BASE_LIFE + STATIC_FIELD_LIFE_PER_LV * 4)) < 0.001, 'staticField Lv4 → 领域时长=' + (STATIC_FIELD_BASE_LIFE + STATIC_FIELD_LIFE_PER_LV * 4) + 'ms');
assert(lm2.superConductorMaxHp === 0 && lm2.superConductorDmgMul === 0, '未选 superConductor → 超导字段全 0');

console.log('== 2b. 雷霆暴击不再自带落雷（落雷仅由雷霆一击提供）==');
skills.lightning.branches = { chainConduct: 0, highVoltage: 0, emp: 0, staticField: 0, superConductor: 0, thunderStrike: 0, crit: 5, multiShot: 0, highSpeed: 0, pierce: 0 };
recomputeLightningMods();
const lm3 = lightningMods();
assert(lm3.critChanceBoost === 0.25 && lm3.critDamageBoost === 0.75, 'crit Lv5 → 仅暴击属性加成');
assert(lm3.thunderStrike === false, 'crit 满级不再自带落雷（雷霆一击才是落雷来源）');

console.log('== 2c. 超导满级(与火·焚身/水·冰爆对称的最大生命%追击) ==');
skills.lightning.branches = { chainConduct: 5, highVoltage: 0, emp: 3, staticField: 0, superConductor: 5, thunderStrike: 0, crit: 0, multiShot: 0, highSpeed: 0, pierce: 0 };
recomputeLightningMods();
const lm4 = lightningMods();
assert(Math.abs(lm4.superConductorDmgMul - 1.0) < 0.001, 'superConductor Lv5 → 弹射伤害 +100%(20%/级)');
assert(lm4.superConductorCountBoost === 5, 'superConductor Lv5 → 弹射次数 +5');
assert(Math.abs(lm4.superConductorMaxHp - 0.10) < 0.001, 'superConductor Lv5 → 追加最大生命% 10%(2%/级)，与火/水对称(金略低因导电触发更广)');
assert(lm4.empStunChance === 0.18 && lm4.empStunDuration === 300, 'emp Lv3 → 麻痹概率0.18, 时长300ms(麻痹=导电, 纯金流可触发超导)');

console.log('== 3. 五行映射与 getBulletElement ==');
assert(WUXING_ELEMENT['雷'] === '金' && WUXING_ELEMENT['风'] === '木' && WUXING_ELEMENT['冰'] === '水', '旧标签映射到五行');
skills.explosive.level = 3; recomputeExplosiveMods();
skills.freeze.level = 2; recomputeFreezeMods();
skills.lightning.level = 5; recomputeLightningMods();
assert(getBulletElement() === '金', 'lightning 等级最高 → 主元素为金');
skills.explosive.level = 6; recomputeExplosiveMods();
assert(getBulletElement() === '火', 'explosive 等级最高 → 主元素为火');

console.log('== 4. 金元素克制/相生伤害加成 ==');
const zMetal = { element: '金', x: 0, y: 0, health: 100, maxHealth: 100, radius: 10, speed: 1, type: 'normal' };
const zWood = { element: '木', x: 0, y: 0, health: 100, maxHealth: 100, radius: 10, speed: 1, type: 'normal' };
const zFire = { element: '火', x: 0, y: 0, health: 100, maxHealth: 100, radius: 10, speed: 1, type: 'normal' };
// 金克木
assert(getElementBonus(zWood, '金') === 1 + WUXING_OVERCOME_BONUS, '金克木：金伤对木 +30%');
// 火克金
assert(getElementBonus(zMetal, '金') === 1, '金打金：无克制加成');
assert(getElementBonus(zMetal, '火') === 1 + WUXING_OVERCOME_BONUS, '火克金：火伤对金 +30%');
// 土生金：持有土+金时，金伤 +15%
recomputeWuxingSynergy();
assert(getElementBonus(zMetal, '金') === 1, '未激活土生金时金伤无加成');

console.log(FAILED ? '\nLIGHTNING_WUXING_TEST 失败 ❌' : '\nLIGHTNING_WUXING_TEST 全部通过 ✅');
process.exit(FAILED ? 1 : 0);
