// v2.4 五行轮转回归测试
// 覆盖：克制击杀积印+连杀 / 错配断连 / 连杀倍率封顶 / 相生引爆清印 / 五连轮转 / 引爆不二次积印
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
        if (p === 'vibrateShort') return () => {};
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
  function near(a,b,tol){ return Math.abs(a-b) <= (tol||1e-6); }
  try { AudioSystem.playZombieDeath = function(){}; AudioSystem.playShoot = function(){}; AudioSystem.playExplosion = function(){}; } catch(e){}
  function resetAll(){
    elementCharge = { '金':0,'木':0,'水':0,'火':0,'土':0 };
    comboCount = 0; comboLastAt = 0; chainCount = 0; chainLastAt = 0;
    hitStopUntil = 0; shakeUntil = 0; slowUntil = 0; flashUntil = 0; _detonating = false;
    autoDpsBonus = 0; synergyDmgBonus = 0; synergyUntil = 0;
    elementLevels = { '金':1,'木':1,'水':1,'火':1,'土':1 };
    player.gold = 0;
  }
  function zk(el, hp){ return { x:200, y:300, radius:22, element:el, elements:null, health:hp===undefined?1e9:hp, maxHealth:1e9,
                                frozenUntil:0, slowUntil:0, burningUntil:0, vulnUntil:0, vulnMul:1, burnDmg:0,
                                damage:10, color:'#fff', type:'normal', exp:1, gold:1 }; }

  // ---------- 1) 克制击杀：积印 + 连杀 ----------
  try {
    resetAll(); zombies.length = 0;
    const z = zk('金', 1); zombies.push(z);
    damageZombie(z, 1e6, false, '火');          // 火克金
    if (elementCharge['火'] !== 1) throw new Error('火印应 1, 实=' + elementCharge['火']);
    if (comboCount !== 1) throw new Error('连杀应 1, 实=' + comboCount);
    ok('克制击杀：火印 +1 / 连杀 1');
  } catch(e){ fail('克制积印', e); }

  // ---------- 2) 错配击杀断连 ----------
  try {
    resetAll(); zombies.length = 0;
    const a = zk('金', 1); zombies.push(a);
    damageZombie(a, 1e6, false, '火');
    const b = zk('火', 1); zombies.push(b);
    damageZombie(b, 1e6, false, '火');          // 同元素 = 错配
    if (comboCount !== 0) throw new Error('错配击杀应断连, 实=' + comboCount);
    ok('错配击杀：连杀清零');
  } catch(e){ fail('错配断连', e); }

  // ---------- 3) 连杀倍率封顶 ×2.0 ----------
  try {
    resetAll();
    comboCount = 17;
    if (!near(comboMul(), 2.0)) throw new Error('17 连应 ×2.0, 实=' + comboMul().toFixed(3));
    comboCount = 100;
    if (!near(comboMul(), 2.0)) throw new Error('超上限应仍 ×2.0');
    comboCount = 0;
    if (!near(comboMul(), 1.0)) throw new Error('0 连应 ×1.0');
    ok('连杀倍率：×1.0 → ×2.0（17 层封顶）');
  } catch(e){ fail('连杀倍率', e); }

  // ---------- 4) 相生引爆：清印 + 全屏伤害 ----------
  try {
    resetAll(); zombies.length = 0;
    const z1 = zk('金'), z2 = zk('木');
    zombies.push(z1, z2);
    elementCharge['水'] = 5;
    detonateCharge('水');
    if (elementCharge['水'] !== 0) throw new Error('引爆后水印应清零');
    if (!(z1.health < 1e9 && z2.health < 1e9)) throw new Error('引爆应对全场造成伤害');
    if (chainCount !== 1) throw new Error('首次引爆链数应 1, 实=' + chainCount);
    ok('相生引爆：清印 + 全场伤害 + 链 1');
  } catch(e){ fail('相生引爆', e); }

  // ---------- 5) 引爆不二次积印 ----------
  try {
    resetAll(); zombies.length = 0;
    const z = zk('金', 1); zombies.push(z);     // 会被引爆伤害杀死
    elementCharge['水'] = 1;
    detonateCharge('水');
    if ((elementCharge['火'] || 0) !== 0) throw new Error('引爆击杀不应再积印');
    if (comboCount !== 0) throw new Error('引爆击杀不应增加连杀');
    ok('引爆击杀：不二次积印 / 不加连杀');
  } catch(e){ fail('引爆不积印', e); }

  // ---------- 6) 五连引爆 → 五行轮转 ----------
  try {
    resetAll(); zombies.length = 0;
    const z = zk('金'); zombies.push(z);
    const h0 = z.health;
    for (let i = 0; i < 5; i++) { elementCharge['水'] = 1; detonateCharge('水'); }
    if (chainCount !== 0) throw new Error('轮转后链数应归零, 实=' + chainCount);
    if (!(slowUntil > Date.now())) throw new Error('轮转应触发慢动作');
    if (!(flashUntil > Date.now())) throw new Error('轮转应触发全屏闪光');
    if (!(z.health < h0)) throw new Error('轮转应造成伤害');
    ok('五连引爆 → 五行轮转（慢动作 + 白闪 + 清场）');
  } catch(e){ fail('五行轮转', e); }

  console.log('\\n=== V24 SMOKE RESULT ===');
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
