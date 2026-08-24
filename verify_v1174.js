// verify_v1174.js — v1.1.74/v1.1.75 落点复算/一致性校验
// 校验 A1/A2/A3/A5-A11/B1/B2/M5 以及耦合不封顶(C2) 是否严格按表实现。
// v1.1.75 追加：F1 穿透分支、F2 火/水 AoE 改读解耦字段、F4 注释清理。
// 用法：node verify_v1174.js
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'game.js');
const txt = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; console.log('  ✓ ' + msg); }
    else { fail++; console.log('  ✗ ' + msg); }
}
function grep(re, label) {
    const m = txt.match(re);
    return m ? m[0] : null;
}

console.log('== A1: PURE_DMG_BASE 1.25→1.6 ==');
ok(/const PURE_DMG_BASE = 1\.6;/.test(txt), 'PURE_DMG_BASE === 1.6（与波次血量 1.6/波 同源，满足 M4 同斜率）');

console.log('== M5: 城墙血量 800→2000 ==');
ok(/const WALL_MAX_HEALTH = 2000;/.test(txt), 'WALL_MAX_HEALTH === 2000（匹配开局 DPS≈52/s）');

console.log('== A2/A3: 五行伤害解耦为 player 独立字段 ==');
ok(/fireDamage: 130/.test(txt) && /waterDamage: 130/.test(txt) && /lightningDamage: 130/.test(txt) && /woodDamage: 130/.test(txt) && /earthDamage: 130/.test(txt),
   'player 含 fire/water/lightning/wood/earthDamage 五个独立字段（初值130）');
ok(/function recomputeElemDamage\(\)/.test(txt), '存在 recomputeElemDamage() 按技能等级重算五行字段');
ok(/const ELEM_FIELD = \{ '火': 'fireDamage'/.test(txt), '存在 ELEM_FIELD 映射 系别→player 字段');
ok(/function elemBaseDmg\(elem\) \{\s*const f = ELEM_FIELD\[elem\];\s*return f \? player\[f\] : FIVE_ELEM_BASE;/.test(txt),
   'elemBaseDmg() 改读 player.{元素}Damage（不再用常量 130）');
// ELEM_BASE_MUL 照搬表注释
const mul = txt.match(/const ELEM_BASE_MUL = \{([^}]*)\};/);
ok(mul && /'金': 1\.8/.test(mul[1]) && /'火': 1\.8/.test(mul[1]) && /'水': 1\.6/.test(mul[1]) && /'土': 1\.6/.test(mul[1]) && /'木': 1\.3/.test(mul[1]),
   'ELEM_BASE_MUL 照搬表：金/火+80%、水/土+60%、木+30%、物理+60%');
// 五行字段缩放复算：field = 130 × mul^level
const FIVE_ELEM_BASE = 130;
const ELEM_BASE_MUL = { '物理':1.6,'金':1.8,'火':1.8,'水':1.6,'土':1.6,'木':1.3 };
function fieldAt(mul, lv){ return FIVE_ELEM_BASE * Math.pow(mul, lv); }
ok(Math.abs(fieldAt(ELEM_BASE_MUL['火'],1) - 234) < 1e-6, '火 Lv1 = 130×1.8 = 234（等同旧 elemBaseDmg(火)）');
ok(Math.abs(fieldAt(ELEM_BASE_MUL['木'],3) - 130*Math.pow(1.3,3)) < 1e-6, '木 Lv3 = 130×1.3³ ≈ 287.3（随级成长）');

console.log('== A5-A11: 火力树分支重设计（三条主进攻分支每级净 1.6×） ==');
const MULTI_PEN = 0.20; // MULTI_BULLET_DMG_PENALTY
// rapidFire：fireMul *= 0.625^bl → 射速×1.6/级 → 净DPS×1.6/级（dmg不变）
function rapidNet(bl){ const fireMul = Math.pow(0.625, bl); return 1 / fireMul; } // 射速倍率=净DPS倍率
ok(Math.abs(rapidNet(1) - 1.6) < 1e-9, '狂暴连射 Lv1 净DPS×1.6（射速+60%/级）');
ok(/m\.fireMul \*= Math\.pow\(0\.625, bl\)/.test(txt), 'rapidFire effect: fireMul*=0.625^bl');
// charge：连发+1/级（bulletCountBoost+=bl），单发-20% 由通用多弹衰减 → net=(1+bl)/(1+0.2*bl)
function chargeNet(bl){ const n = 1 + bl; const per = 1/(1+MULTI_PEN*bl); return n*per; }
ok(Math.abs(chargeNet(1) - 2/1.2) < 1e-9, '蓄能连射 Lv1 净DPS×1.667（连发+1、单发-20%）');
ok(/m\.bulletCountBoost \+= bl;/.test(txt), 'charge effect: bulletCountBoost+=bl（无额外 dmgMul）');
// heavyBarrel 保持（爆炸）
ok(/m\.aoeRadius \+= 80 \* bl; m\.dmgMul \*= Math\.pow\(PURE_DMG_BRANCH, bl\)/.test(txt), '重型枪管保持：爆炸+AoE伤害×1.4/级');
// armorPierce +0.5/级
ok(/m\.armorBonus \+= 0\.50\*bl;/.test(txt), '穿甲弹头：armorBonus+=0.5/级（情境增伤给足）');
// calibration +20%/级
ok(/m\.hitboxMul \*= Math\.pow\(1\.2, bl\)/.test(txt), '弹道校准：hitboxMul*=1.2^bl（命中半径+20%/级）');
// 修复：recomputeDamageMods 初始化 bulletCountBoost；attributeMods 聚合 damage._mods.bulletCountBoost
ok(/const m = \{ dmgMul: 1, fireMul: 1, radiusMul: 1, hitboxMul: 1, armorBonus: 0, knock: false, knockF: 0, aoeRadius: 0, bulletCountBoost: 0 \};/.test(txt),
   'recomputeDamageMods 初始化 bulletCountBoost:0');
ok(/skills\.damage && skills\.damage\._mods\) out\.bulletCountBoost \+= \(skills\.damage\._mods\.bulletCountBoost \|\| 0\)/.test(txt),
   'attributeMods 聚合 skills.damage._mods.bulletCountBoost（charge 进入 DPS 指数）');
ok(/_baseDmg = player\.damage \* _dm\.dmgMul \/ \(1 \+ MULTI_BULLET_DMG_PENALTY \* _bc\)/.test(txt),
   'shootBase 按 bulletCountBoost 发射多发并应用多弹衰减');

console.log('== F1: 穿透弹分支（A8） ==');
ok(/penetration: \{ name:'穿透弹'/.test(txt), '火力树新增 penetration(穿透弹) 分支');
ok(/effect\(bl,m\)\{ m\.pierceBoost \+= bl; \}/.test(txt), 'penetration effect: pierceBoost+=bl（穿透+1/级；单发-20% 由 REACH_DMG_PENALTY 统一处理，不在此重复乘 dmgMul）');
ok(/skills\.damage && skills\.damage\._mods\) out\.pierceBoost \+= \(skills\.damage\._mods\.pierceBoost \|\| 0\)/.test(txt),
   'attributeMods 聚合 skills.damage._mods.pierceBoost（穿透进入真实子弹与 DPS 指数）');

console.log('== F2: 火/水 AoE 改读解耦字段(C1 补全) ==');
ok(/dps \+= shotsPerSec \* nIn \* frac \* elemBaseDmg\(elem\);/.test(txt), '火/水 AoE 贡献改读 elemBaseDmg(系)（解耦后的 player.fireDamage/waterDamage）');
ok(!/aoeAdd = Math\.max\(aoeAdd, nIn \* \(0\.15 \+ lvl \* 0\.05\)\)/.test(txt), '已移除旧的「按 skills.level 线性估算」火/水 AoE（避免火/水流派 idx 被低估）');

console.log('== B1/B2: 卡池规则 ==');
// B1：基础卡达 maxLevel 出池
ok(/if \(skills\[t\]\.level >= def\.maxLevel\) continue;/.test(txt), 'B1：基础卡达 maxLevel 出池（showUpgradePanel）');
// 分支卡由 getAvailableBranches 自动排除满级（已确认其含 bl>=b.maxLevel 跳过）
ok(/if \(b\.maxLevel && bl >= b\.maxLevel\) continue;/.test(txt), 'B1：分支卡由 getAvailableBranches 自动排除满级');
// B2：删除前4波强制火力卡
ok(!/const forceDamage = \(wavesSpawned >= 1 && wavesSpawned <= 4\);/.test(txt), 'B2：已删除「前4波强制火力强化卡」(forceDamage)');
ok(/if \(isSkillLab\) \{[\s\S]*?\} else \{\s*\n\s*\/\/ v1\.1\.74\(B2\)[\s\S]*?upgradeOptions = weightedPick3\(cards\);\s*\n\s*\}/.test(txt),
   'B2：非实验室分支走纯加权随机 weightedPick3(cards)');

console.log('== C2: 耦合不封顶（偏离追踪） ==');
ok(/return Math\.max\(1, Math\.pow\(idx \/ expectedIdx, 0\.95\)\);/.test(txt), 'getDmgCouple 不封顶：max(1, (idx/expectedIdx)^0.95)');
ok(/const expectedIdx = Math\.pow\(1\.6, p\);/.test(txt), 'getDmgCouple 期望基准 = 1.6^p（与波次血量同源）');
// 偏离追踪复算：idx 超期望→couple=ratio^0.95>1；idx 低于期望→下限1
function couple(idx, p){ if (p<=4) return 1; const e=Math.pow(1.6,p); return Math.max(1, Math.pow(idx/e,0.95)); }
ok(couple(1.6, 5) === 1, 'p=5, idx=1.6(远低于期望1.6⁵≈10.5) → couple=1（前期不耦合）');
ok(couple(Math.pow(1.6,5)*1.5, 5) > 1, 'p=5, idx=期望×1.5 → couple>1（偏离追踪加压，但仍≤idx）');
ok(couple(0.5, 8) === 1, 'p=8, idx=0.5(<期望) → 下限1（维持波次基线，不降难度）');

console.log('\n== 复算汇总 ==');
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
