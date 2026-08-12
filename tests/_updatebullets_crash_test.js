// 回归测试：修复「爆炸/穿透/暴击/地雷/龙卷风/死亡射线」遍历 zombies 时 splice 导致
// for...of 下一步读到 undefined（Cannot read property 'x' of undefined）的崩溃。
// 场景：爆炸弹一发命中，爆炸 AOE 同时击杀多只聚集僵尸。
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

// ---- 桩环境（updateBullets / damageZombie 依赖）----
const screenWidth = 1280, screenHeight = 720;
const BURN_DURATION = 1500;
let bullets = [];
let zombies = [];
const particles = [], damageNumbers = [], expOrbs = [], goldOrbs = [], hitEffects = [];
let iceFields = [];
const talentMods = { lifestealPerKill: 0 };
const player = { x: 640, y: 360, damage: 100, _splitOnHit: false, kills: 0, health: 100, maxHealth: 100 };
const skills = {
  damage:    { level: 0, _mods: { dmgMul: 1, radiusMul: 1, hitboxMul: 1, armorBonus: 0, knock: false, knockF: 0, fireMul: 1 } },
  explosive: { level: 5, _mods: { explDmgMul: 1, explRadiusCut: 0, explArmorBreak: false, armorBreakF: 0, explIgnite: false, burnDmgMul: 1, explIncinerate: 0, pierceSplash: false, critExplode: false, bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0 } },
  lightning: { level: 0, _mods: {}, _chainBonus: 0, _conduct: 0 },
  freeze:    { level: 0, _mods: {}, _residual: false, _stun: false }
};
const AudioSystem = { playZombieDeath() {}, playLevelUp() {}, playBombExplosion() {}, playShoot() {} };

// 波次系统全局（onZombieRemoved/awardWaveExp 依赖；本测试只验证「多杀不崩溃」，不校验升级，故 levelUp 置桩）
let gameState = 'playing';
let wavesCleared = 0;
const WAVE_COUNT = 20, MAX_LEVEL = 20;
let waveAlive = {}, waveAwarded = {};
player.level = 1; player.exp = 0; player.expToLevel = 50;
function levelUp() {}


// 纯桩函数（eval 作用域内可见）
function getCritChance() { return 0; }       // 关闭暴击/分裂/闪电/冰冻/减速分支，聚焦爆炸 AOE
function getCritMult() { return 1; }
function getElementBonus() { return 1; }
function getFreezeChance() { return 0; }
function getFreezeDuration() { return 0; }
function getSlowChance() { return 0; }
function getSlowFactor() { return 0.5; }
function createCritEffect() {}
function createExplosion() {}
function createFreezeEffect() {}
function createSlowEffect() {}
function applyBurn() {}
function checkCombos(z) {}
function getEffBulletSpeed() { return 10; }
function getEffBulletPiercing() { return 1; }
function spawnSplitBullets() {}
function spawnChainFrost() {}
function getBulletElement() { return '物理'; }
// 元素视觉调色板（damageZombie 飘字取 core 色；与 game - 副本.js ELEMENT_VISUAL 一致）
const ELEMENT_VISUAL = {
  '物理': { core: '#ff4d4d' }, '火': { core: '#ff6a14' }, '水': { core: '#37c6ff' },
  '金': { core: '#ffd23a' }, '木': { core: '#46d35a' }, '土': { core: '#c8915a' }
};

eval(extractFn('freezeMods'));
// 属性技能独立 cd 机制（updateBullets 现按 bullet.skillType 取 attrModsForBullet）
const ATTRIBUTE_BULLET_TYPES = ['explosive', 'freeze', 'lightning'];
const ATTR_RELEASE_CD_BASE = 2600, ATTR_RELEASE_CD_MIN = 700, ATTR_RELEASE_CD_STEP = 130;
eval(extractFn('explosiveMods'));
eval(extractFn('attrModsForType'));
eval(extractFn('attrModsForBullet'));
eval(extractFn('getAttrReleaseCd'));
eval(extractFn('damageZombie'));
eval(extractFn('onZombieRemoved'));
eval(extractFn('awardWaveExp'));
eval(extractFn('updateBullets'));

let FAILED = false;
function assert(cond, msg) { if (!cond) { console.log('  ✗ FAIL:', msg); FAILED = true; } else console.log('  ✓', msg); }

console.log('== 回归：爆炸 AOE 同时击杀多只僵尸不应崩溃 ==');
bullets = [{
  x: 640, y: 360, vx: 0, vy: 0, radius: 6, damage: 100, piercing: 1, element: '物理', skillType: 'explosive', hitZombies: []
}];
// 5 只僵尸聚集在子弹落点附近，血量极低，必被 AOE 秒杀（触发 splice）
zombies = [];
for (let i = 0; i < 5; i++) {
  zombies.push({ x: 640 + i * 2, y: 360, radius: 18, speed: 0, health: 1, maxHealth: 1,
    damage: 0, color: '#0f0', exp: 1, type: 'normal', frozenUntil: 0, slowUntil: 0,
    stunUntil: 0, _residualSlowUntil: 0, _inTornado: false, slowFactor: 0.5, vulnUntil: 0, vulnMul: 1 });
}
let threw = null;
try { updateBullets(); } catch (e) { threw = e; }
assert(threw === null, 'updateBullets 在多只僵尸被 AOE 击杀时不抛异常' + (threw ? '（实际: ' + threw.message + '）' : ''));
assert(zombies.length === 0, '5 只僵尸均被正确清除（无 undefined 跳杀/漏杀）');
assert(bullets.length === 0, '主弹命中后按 piercing 移除');

// 仅 1 只僵尸也走通（边界）
bullets = [{ x: 640, y: 360, vx: 0, vy: 0, radius: 6, damage: 100, piercing: 1, element: '物理', skillType: 'explosive', hitZombies: [] }];
zombies = [{ x: 641, y: 360, radius: 18, speed: 0, health: 1, maxHealth: 1, damage: 0, color: '#0f0',
  exp: 1, type: 'normal', frozenUntil: 0, slowUntil: 0, stunUntil: 0, _residualSlowUntil: 0,
  _inTornado: false, slowFactor: 0.5, vulnUntil: 0, vulnMul: 1 }];
threw = null;
try { updateBullets(); } catch (e) { threw = e; }
assert(threw === null, '单只僵尸场景也不抛异常');

// 关键回归：外层碰撞循环「单轮多杀越界」
// 子弹 piercing 足够大（不 break），命中最高索引僵尸时其爆炸 AOE 一次性清空其余低索引僵尸；
// 旧代码用实时 zombies[j] 倒序遍历，单轮 j 只减 1 但数组已缩短数十个 → 下一轮 zombies[j] 越界 → undefined.x 崩溃。
// 修复后外层遍历快照 + 存活校验，应安全跳过已被清除的僵尸。
console.log('== 回归：穿透子弹 + 爆炸清群导致外层 j 越界 ==');
bullets = [{ x: 640, y: 360, vx: 0, vy: 0, radius: 6, damage: 100, piercing: 6, element: '物理', skillType: 'explosive', hitZombies: [] }];
zombies = [];
for (let i = 0; i < 6; i++) {
  zombies.push({ x: 640 + i * 3, y: 360, radius: 18, speed: 0, health: 1, maxHealth: 1,
    damage: 0, color: '#0f0', exp: 1, type: 'normal', frozenUntil: 0, slowUntil: 0,
    stunUntil: 0, _residualSlowUntil: 0, _inTornado: false, slowFactor: 0.5, vulnUntil: 0, vulnMul: 1 });
}
threw = null;
try { updateBullets(); } catch (e) { threw = e; }
assert(threw === null, '穿透子弹 + 爆炸清群时外层循环不越界崩溃' + (threw ? '（实际: ' + threw.message + '）' : ''));
assert(zombies.length === 0, '全部 6 只僵尸被清除（无 undefined 漏杀）');

console.log(FAILED ? '\n结果: 有失败项 ❌' : '\n结果: 全部通过 ✅');
process.exit(FAILED ? 1 : 0);
