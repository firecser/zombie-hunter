// v2.3 A+B 轻量版回归测试
// 覆盖：炮台不降频 / 点击补射 3 发等效 / 共享 1.2s CD / 合击弹 ×2.5 + 80px 范围 / 非合击无范围伤
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
    wx: wxProxy, ctx: ctxProxy,
    canvas: { getContext: () => ctxProxy, width: 390, height: 844 },
    screenWidth: 390, screenHeight: 844,
    console, Math, Date, Object, Array, JSON, String, Number, Boolean, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    module: { exports: {} }, require: () => ({}), globalThis: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const driver = `
;(function(){
  const results = [];
  function ok(n){ results.push('PASS ' + n); }
  function fail(n, e){ results.push('FAIL ' + n + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }
  function near(a,b,tol){ return Math.abs(a-b) <= (tol||0.5); }
  const HZ = 1000 / 220;
  try { AudioSystem.playShoot = function(){}; AudioSystem.playExplosion = function(){}; } catch(e){}
  zombies.length = 0; bullets.length = 0;
  function resetAll(){
    elementTapReadyAt = 0; synergyUntil = 0; autoDpsBonus = 0; synergyDmgBonus = 0;
    elementLevels = { '金':1,'木':1,'水':1,'火':1,'土':1 };
  }
  function zk(x,y,el){ return { x:x, y:y, radius:22, element:el||'金', elements:null, health:1e9, maxHealth:1e9,
                               frozenUntil:0, slowUntil:0, burningUntil:0, vulnUntil:0, vulnMul:1, burnDmg:0,
                               damage:10, color:'#fff', type:'normal' }; }

  // ---------- 1) 炮台保持 220ms ----------
  try {
    if (ELEMENT_AUTO_FIRE_RATE !== 220) throw new Error('炮台应保持 220ms, 实=' + ELEMENT_AUTO_FIRE_RATE);
    ok('炮台节奏不变（220ms）');
  } catch(e){ fail('炮台节奏', e); }

  // ---------- 2) 点击补射 = 3 发等效 ----------
  try {
    resetAll(); bullets.length = 0;
    castElementSkill('火', false, '火');
    if (bullets.length !== 1) throw new Error('应发射 1 发');
    const b = bullets[0];
    const exp = (ELEMENT_AUTO_DPS + ELEMENT_BASE_DPS['火']) / HZ * 3;
    if (!near(b.damage, exp, 0.5)) throw new Error('点击伤害应 ' + exp.toFixed(1) + ', 实=' + b.damage.toFixed(1));
    if (b.tapEffect !== 'none') throw new Error('普通点击不应带特效');
    if (b.combo) throw new Error('普通点击不应标记合击');
    ok('点击补射：3 发等效（' + exp.toFixed(1) + '）+ 无额外特效');
  } catch(e){ fail('点击补射', e); }

  // ---------- 3) 共享 1.2s CD ----------
  try {
    resetAll(); bullets.length = 0;
    if (!tryCastElement('火', false, '火')) throw new Error('首次点击应成功');
    if (tryCastElement('金', false, '金')) throw new Error('CD 内换元素也应被拦（共享 CD）');
    elementTapReadyAt = 0;                         // 模拟 CD 结束
    if (!tryCastElement('金', false, '金')) throw new Error('CD 结束后应可再次点击');
    ok('共享 1.2s CD：换元素同样受 CD 限制');
  } catch(e){ fail('共享 CD', e); }

  // ---------- 4) 合击弹：×2.5 + 标记 ----------
  try {
    resetAll(); bullets.length = 0;
    castElementSkill('木', true, '水');
    const b = bullets[0];
    const base = (ELEMENT_AUTO_DPS + ELEMENT_BASE_DPS['木']) / HZ * 3;
    if (!near(b.damage, base * 2.5, 1)) throw new Error('合击伤害应 ×2.5, 实=' + b.damage.toFixed(1));
    if (!b.combo) throw new Error('未标记 combo');
    if (b.comboKey !== '水生木') throw new Error('comboKey 应水生木, 实=' + b.comboKey);
    if (b.tapEffect !== 'combo') throw new Error('tapEffect 应 combo');
    ok('合击弹：水生木 ×2.5（' + (base*2.5).toFixed(1) + '）');
  } catch(e){ fail('合击弹', e); }

  // ---------- 5) 合击范围伤：80px 内受伤、外不受伤 ----------
  try {
    resetAll(); zombies.length = 0;
    const main = zk(200, 300); zombies.push(main);
    const nearZ = zk(230, 320); zombies.push(nearZ);     // 距 36px
    const farZ  = zk(340, 300); zombies.push(farZ);      // 距 140px
    const b = { x:200, y:300, damage:100, element:'木', tapEffect:'combo', comboKey:'水生木' };
    const h0 = nearZ.health, h1 = farZ.health;
    applyTapHitEffect(b, main);
    if (!(nearZ.health < h0)) throw new Error('80px 内应受范围伤');
    if (farZ.health !== h1) throw new Error('80px 外不应受伤');
    ok('合击范围：80px 内受伤 / 外不受伤');
  } catch(e){ fail('合击范围', e); }

  // ---------- 6) 普通弹不带范围伤 ----------
  try {
    resetAll(); zombies.length = 0;
    const main = zk(200, 300); zombies.push(main);
    const nearZ = zk(230, 320); zombies.push(nearZ);
    const b = { x:200, y:300, damage:100, element:'火', tapEffect:'none' };
    const h0 = nearZ.health;
    applyTapHitEffect(b, main);
    if (nearZ.health !== h0) throw new Error('普通弹不应有范围伤');
    ok('普通弹无范围伤');
  } catch(e){ fail('普通弹范围', e); }

  console.log('\\n=== V23 SMOKE RESULT ===');
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
