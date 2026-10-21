// v2.3 操作层回归测试
// 覆盖：炮台降频 / 点击技能 5 元素形态 / 独立 CD / 五元素合击状态 / 伤害基数
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
  function near(a,b,tol){ return Math.abs(a-b) <= (tol||0.05); }
  const HZ = 1000 / 220;
  try { AudioSystem.playShoot = function(){}; AudioSystem.playExplosion = function(){}; } catch(e){}
  zombies.length = 0; bullets.length = 0;
  function resetCd(){ elementTapReadyAt = { '金':0, '木':0, '水':0, '火':0, '土':0 }; tapShieldUntil = 0; synergyUntil = 0; autoDpsBonus = 0; synergyDmgBonus = 0; elementLevels = { '金':1,'木':1,'水':1,'火':1,'土':1 }; }
  function zk(el){ return { x:200, y:300, radius:22, element:el, elements:null, health:1e9, maxHealth:1e9,
                            frozenUntil:0, slowUntil:0, burningUntil:0, vulnUntil:0, vulnMul:1, burnDmg:0,
                            damage:10, color:'#fff', type:'normal' }; }

  // ---------- 1) 炮台降频 ----------
  try {
    if (ELEMENT_AUTO_FIRE_RATE !== 600) throw new Error('炮台间隔应 600ms, 实=' + ELEMENT_AUTO_FIRE_RATE);
    ok('炮台降频：220ms → 600ms');
  } catch(e){ fail('炮台降频', e); }

  // ---------- 2) 5 元素点击形态 ----------
  try {
    resetCd(); bullets.length = 0;
    castElementSkill('火');
    if (bullets.length !== 1) throw new Error('火应发射 1 发');
    if (bullets[0].tapEffect !== 'explode') throw new Error('火应为 explode, 实=' + bullets[0].tapEffect);
    const expFire = (ELEMENT_AUTO_DPS + ELEMENT_BASE_DPS['火']) / HZ * 3;
    if (!near(bullets[0].damage, expFire, 0.5)) throw new Error('火点击伤害应 ' + expFire.toFixed(1) + ', 实=' + bullets[0].damage.toFixed(1));

    bullets.length = 0; castElementSkill('金');
    if (bullets[0].piercing !== 2) throw new Error('金应可穿 2 个, 实=' + bullets[0].piercing);
    bullets.length = 0; castElementSkill('木');
    if (bullets[0].tapEffect !== 'chain') throw new Error('木应为 chain');
    bullets.length = 0; castElementSkill('水');
    if (bullets[0].tapEffect !== 'slow') throw new Error('水应为 slow');

    bullets.length = 0; const before = Date.now();
    castElementSkill('土');
    if (bullets.length !== 0) throw new Error('土不应发射子弹');
    if (!(tapShieldUntil > before + 2500)) throw new Error('土应开 3s 护盾');
    ok('5 元素点击：火爆炸 / 金穿透2 / 木连锁 / 水减速 / 土护盾(无弹)');
  } catch(e){ fail('5元素点击', e); }

  // ---------- 3) 每元素独立 CD ----------
  try {
    resetCd(); bullets.length = 0;
    if (!tryCastElement('火', false, '火')) throw new Error('首次火应成功');
    if (tryCastElement('火', false, '火')) throw new Error('CD 内火不应再次释放');
    if (!tryCastElement('金', false, '金')) throw new Error('金应有独立 CD，可立即释放');
    if (!tryCastElement('木', false, '木')) throw new Error('木应有独立 CD');
    if (!tryCastElement('水', false, '水')) throw new Error('水应有独立 CD');
    if (!tryCastElement('土', false, '土')) throw new Error('土应有独立 CD');
    ok('独立 CD：火重复被拦，金/木/水/土互不影响');
  } catch(e){ fail('独立 CD', e); }

  // ---------- 4) 五元素合击：伤害 + 独立状态 ----------
  try {
    resetCd();
    const defs = Object.keys(COMBO_DEF);
    if (defs.length !== 5) throw new Error('应有 5 种合击, 实=' + defs.length);
    const cases = [
      ['水','木','frozenUntil'], ['木','火','burningUntil'], ['火','土','slowUntil'],
      ['土','金','vulnUntil'], ['金','水','slowUntil']
    ];
    for (const [from, to, field] of cases) {
      zombies.length = 0;
      const z = zk(to); zombies.push(z);
      const h0 = z.health;
      castCombo(from, to);
      if (!(z.health < h0)) throw new Error(from + '生' + to + ' 未造成伤害');
      if (!(z[field] > Date.now())) throw new Error(from + '生' + to + ' 未施加 ' + field);
    }
    ok('合击 5 种：藤蔓定身 / 燎原燃烧 / 熔岩减速 / 金锐破甲 / 寒潮冰缓');
  } catch(e){ fail('五元素合击', e); }

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
