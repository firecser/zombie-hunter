// P2 战斗重写回归测试
// 覆盖：克制 2.5 / 错配 0.2 / 中性 1.0 / 双系取最差 / 单发伤害公式 / 克制 AOE / 相生连携 ×1.2 / 旧发射链路停用
// 手法：vm 加载真实 game.js，直接调用真实函数（shootElement / damageZombie），不复刻逻辑。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filePath = path.join(__dirname, '..', 'game.js');
const src = fs.readFileSync(filePath, 'utf8');

const gradientStub = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'measureText') return () => ({ width: 0 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradientStub;
        if (p === 'canvas') return { width: 390, height: 844 };
        return (...a) => ctxProxy;
    },
    set() { return true; }
});

const audioCtxStub = {
    currentTime: 0, state: 'running', destination: {}, resume() {}, suspend() {},
    createOscillator: () => ({ connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {} } }),
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, value: 0 } })
};
const wxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'getWindowInfo' || p === 'getSystemInfoSync') return () => ({
            screenWidth: 390, screenHeight: 844, statusBarHeight: 20,
            safeArea: { left: 0, right: 390, top: 20, bottom: 810, width: 390, height: 790 }
        });
        if (p === 'createWebAudioContext') return () => audioCtxStub;
        if (p === 'createInnerAudioContext') return () => ({ play() {}, onEnded() {}, destroy() {}, src: '' });
        if (p === 'createCanvas') return () => ({ getContext: () => ctxProxy, width: 390, height: 844 });
        if (p === 'createGameClubButton') return () => ({ show() {}, hide() {}, destroy() {} });
        if (p === 'createRewardedVideoAd') return () => ({ show() {}, onClose() {}, load() {}, offClose() {} });
        if (p === 'getStorageSync') return () => '';
        if (p === 'setStorageSync') return () => {};
        if (p === 'createImage') return () => ({ onload: null, onerror: null, src: '', width: 0, height: 0 });
        if (p === 'getImageInfo') return () => ({ img: { onload: null, onerror: null, src: '' }, width: 0, height: 0 });
        return () => {};
    }
});

const sandbox = {
    wx: wxProxy,
    ctx: ctxProxy,
    canvas: { getContext: () => ctxProxy, width: 390, height: 844 },
    screenWidth: 390,
    screenHeight: 844,
    console,
    Math, Date, Object, Array, JSON, String, Number, Boolean, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    module: { exports: {} },
    require: () => ({}),
    globalThis: null,
    // 源码级：旧自动发射是否还有调用点
    __oldShootBaseCalls: (src.match(/shootBase\(\);/g) || []).length,
    __oldShootAttrCalls: (src.match(/shootAttribute\(type\);/g) || []).length
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const driver = `
;(function(){
  const results = [];
  function ok(n){ results.push('PASS ' + n); }
  function fail(n, e){ results.push('FAIL ' + n + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }
  function near(a, b, tol){ return Math.abs(a - b) <= (tol || 0.5); }
  const HZ = 1000 / 220;   // ELEMENT_FIRE_HZ

  // 静音，避免音频桩干扰
  try { AudioSystem.playShoot = function(){}; } catch(e){}
  zombies.length = 0;
  bullets.length = 0;

  function zk(el, els){ return { x:200, y:300, radius:22, element:el, elements:els||null, type:'normal',
                                  health:1e9, maxHealth:1e9, frozenUntil:0, slowUntil:0, burningUntil:0,
                                  vulnUntil:0, color:'#fff', damage:10 }; }

  // ---------- 1) 三态倍率 ----------
  try {
    const zGold = zk('金');
    if (getElementBonus(zGold, '火') !== 2.5) throw new Error('克制应 2.5, 实=' + getElementBonus(zGold, '火'));
    if (getElementBonus(zGold, '金') !== 0.2) throw new Error('错配应 0.2, 实=' + getElementBonus(zGold, '金'));
    if (getElementBonus(zGold, '水') !== 1.0) throw new Error('中性应 1.0, 实=' + getElementBonus(zGold, '水'));
    const zWater = zk('水');
    if (getElementBonus(zWater, '土') !== 2.5) throw new Error('水怪应被土克制');
    if (getElementBonus(zWater, '水') !== 0.2) throw new Error('水怪错配水应 0.2');
    const zNormal = zk('normal');
    if (getElementBonus(zNormal, '火') !== 1.0) throw new Error('无属性怪应中性');
    ok('三态倍率：克制2.5 / 错配0.2 / 中性1.0 / normal=1.0');
  } catch(e){ fail('三态倍率', e); }

  // ---------- 2) 双系取「各系最差」 ----------
  try {
    const zDual = zk('normal', ['金','水']);
    // 火 vs 金 = 2.5（克制）；火 vs 水 = 1.0（中性）→ 取最差 1.0
    if (getElementBonus(zDual, '火') !== 1.0) throw new Error('双系 火应取最差 1.0, 实=' + getElementBonus(zDual, '火'));
    // 金 vs 金 = 0.2（错配）；金 vs 水 = 1.0 → 0.2
    if (getElementBonus(zDual, '金') !== 0.2) throw new Error('双系 金应取最差 0.2, 实=' + getElementBonus(zDual, '金'));
    ok('双系相生怪取最差克制 (火→1.0, 金→0.2)');
  } catch(e){ fail('双系取最差', e); }

  // ---------- 3) shootElement 子弹与数值 ----------
  try {
    bullets.length = 0; synergyUntil = 0; elementLevels['火'] = 1;
    shootElement('火');
    if (bullets.length !== 1) throw new Error('应发射 1 颗, 实=' + bullets.length);
    const b = bullets[0];
    if (b.element !== '火') throw new Error('子弹 element 错: ' + b.element);
    if (b.skillType !== 'element') throw new Error('skillType 应为 element: ' + b.skillType);
    const expFire = (ELEMENT_AUTO_DPS + ELEMENT_BASE_DPS['火']) / HZ;   // (40+240)/4.545
    if (!near(b.damage, expFire, 0.05)) throw new Error('火单发应为 ' + expFire.toFixed(2) + ', 实=' + b.damage.toFixed(2));
    bullets.length = 0; elementLevels['水'] = 1;
    shootElement('水');
    const expWater = (ELEMENT_AUTO_DPS + ELEMENT_BASE_DPS['水']) / HZ;
    if (!near(bullets[0].damage, expWater, 0.05)) throw new Error('水单发应为 ' + expWater.toFixed(2) + ', 实=' + bullets[0].damage.toFixed(2));
    ok('shootElement 元素/类型/单发数值 (火=' + expFire.toFixed(1) + ', 水=' + expWater.toFixed(1) + ')');
  } catch(e){ fail('shootElement', e); }

  // ---------- 4) damageZombie 端到端：克制 ×2.5 × AOE(火1.6) ----------
  try {
    const z = zk('金');
    const before = z.health;
    damageZombie(z, 100, false, '火');
    const dealt = before - z.health;
    const exp = 100 * 2.5 * 1.6;   // 400
    if (!near(dealt, exp, 0.5)) throw new Error('克制火伤害应为 ' + exp + ', 实=' + dealt.toFixed(2));
    // 错配（金打金）：100 × 0.2 = 20，无 AOE
    const z2 = zk('金');
    const b2 = z2.health;
    damageZombie(z2, 100, false, '金');
    if (!near(b2 - z2.health, 20, 0.5)) throw new Error('错配伤害应为 20, 实=' + (b2 - z2.health).toFixed(2));
    ok('damageZombie 端到端：克制火=400 / 错配金=20');
  } catch(e){ fail('damageZombie 端到端', e); }

  // ---------- 5) 相生连携 ×1.2 ----------
  try {
    bullets.length = 0; synergyUntil = 0; elementLevels['木'] = 1;
    const baseWood = (ELEMENT_AUTO_DPS + ELEMENT_BASE_DPS['木']) / HZ;
    shootElement('木');
    const noSyn = bullets[0].damage;
    if (!near(noSyn, baseWood, 0.05)) throw new Error('木基础单发错: ' + noSyn.toFixed(2));
    // 模拟坞点击：上个元素=水，切到木（水生木）
    lastActiveElement = '水'; activeElement = '水';
    const dockE = '木';
    if (ELEMENT_SHENG[lastActiveElement] === dockE) synergyUntil = Date.now() + SYNERGY_DURATION;
    lastActiveElement = activeElement; activeElement = dockE;
    if (!(synergyUntil > Date.now())) throw new Error('水生木 未激活连携');
    bullets.length = 0;
    shootElement('木');
    const syn = bullets[0].damage;
    if (!near(syn / noSyn, 1.2, 0.01)) throw new Error('连携应 ×1.2, 实=' + (syn / noSyn).toFixed(3));
    // 非相生不应激活（火→木，火生土不相生木）
    synergyUntil = 0; lastActiveElement = '火';
    if (ELEMENT_SHENG['火'] === '木') throw new Error('火生木 映射错误');
    ok('相生连携：水生木 ×1.2 (' + noSyn.toFixed(1) + '→' + syn.toFixed(1) + ')');
  } catch(e){ fail('相生连携', e); }

  // ---------- 6) 旧自动发射链路已停用 ----------
  try {
    if (__oldShootBaseCalls > 0) throw new Error('仍有 shootBase(); 调用点 ' + __oldShootBaseCalls + ' 处');
    if (__oldShootAttrCalls > 0) throw new Error('仍有 shootAttribute(type); 调用点 ' + __oldShootAttrCalls + ' 处');
    ok('旧发射链路已停用（无 shootBase/shootAttribute 调用点）');
  } catch(e){ fail('旧发射链路停用', e); }

  // ---------- 7) 子弹速度单位（px/帧）：一帧不得飞出屏幕 ----------
  try {
    bullets.length = 0; zombies.length = 0;
    elementLevels['火'] = 1; synergyUntil = 0;
    shootElement('火');
    if (bullets.length !== 1) throw new Error('未发射');
    const b = bullets[0], x0 = b.x, y0 = b.y;
    updateBullets();
    if (bullets.indexOf(b) < 0) throw new Error('子弹单帧内被回收（速度单位写成 px/s 了？）');
    const d = Math.hypot(b.x - x0, b.y - y0);
    if (!(d > 1 && d < 30)) throw new Error('单帧位移异常: ' + d.toFixed(1) + 'px（应≈10px/帧）');
    ok('子弹速度单位：单帧位移 ' + d.toFixed(1) + 'px（≈10px/帧，不是 640px/s）');
  } catch(e){ fail('子弹速度单位', e); }

  console.log('\\n=== P2 SMOKE RESULT ===');
  console.log(results.join('\\n'));
  const bad = results.some(r => r.indexOf('FAIL') === 0);
  console.log(bad ? 'OVERALL: FAIL' : 'OVERALL: PASS');
})();
`;

try {
    vm.runInContext(src + driver, sandbox, { filename: 'game.js' });
} catch (e) {
    console.log('LOAD/RUNTIME ERROR:');
    console.log(e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
    process.exit(2);
}
