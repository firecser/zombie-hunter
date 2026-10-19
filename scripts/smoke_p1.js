// Headless smoke test for P1 视觉身份层 (汉字怪物 + 五行坞 + 战场整体上移)
// 用 vm 加载真实 game.js（桩 wx / canvas），仅驱动新增绘制函数，捕捉运行时 ReferenceError/TypeError。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filePath = path.join(__dirname, '..', 'game.js');
let src = fs.readFileSync(filePath, 'utf8');

// ---- 桩：canvas ctx ----
const gradientStub = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'measureText') return () => ({ width: 0 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradientStub;
        if (p === 'canvas') return { width: 390, height: 844 };
        // 其它一律当作无副作用方法，返回自身以支持链式
        return (...a) => ctxProxy;
    },
    set() { return true; }
});

// ---- 桩：wx ----
const audioCtxStub = {
    currentTime: 0, state: 'running', destination: {}, resume() {}, suspend() {},
    createOscillator: () => ({ connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {} } }),
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, value: 0 } })
};
const wxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'getWindowInfo' || p === 'getSystemInfoSync') return () => ({ screenWidth: 390, screenHeight: 844, statusBarHeight: 20 });
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

// ---- 桩：全局 ----
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
    globalThis: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---- 驱动（追加到同一作用域，可访问模块内 const/let）----
const driver = `
;(function(){
  const results = [];
  function ok(name){ results.push('PASS ' + name); }
  function fail(name, e){ results.push('FAIL ' + name + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }

  // 1) WuXing 常量与解锁梯度
  try {
    if (WUXING_ORDER.join('') !== '金木水火土') throw new Error('WUXING_ORDER 错');
    const u1 = getStageUnlockedElements(1), u2 = getStageUnlockedElements(2), u3 = getStageUnlockedElements(3), u5 = getStageUnlockedElements(5);
    if (u1.join('') !== '火水') throw new Error('L1 解锁应为火水, 实=' + u1);
    if (u2.join('') !== '火水木') throw new Error('L2 解锁应为火水木');
    if (u3.join('') !== '火水木土') throw new Error('L3 解锁应为火水木土');
    if (u5.join('') !== '金木水火土') throw new Error('L5+ 应全5开');
    ok('WUXING 常量 + 解锁梯度');
  } catch(e){ fail('WUXING 常量 + 解锁梯度', e); }

  // 2) 布局常量已上移
  try {
    if (!(WALL_Y < screenHeight * 0.75)) throw new Error('WALL_Y 未上移: ' + WALL_Y);
    if (DOCK_H_RATIO <= 0 || DOCK_H_RATIO >= 0.3) throw new Error('DOCK_H_RATIO 异常');
    ok('布局常量上移 (WALL_Y=' + Math.round(WALL_Y) + ', DOCK_H_RATIO=' + DOCK_H_RATIO + ')');
  } catch(e){ fail('布局常量上移', e); }

  // 3) 注入怪物并绘制（各元素/各类型）
  try {
    zombies.length = 0;
    const sample = [
      { x:120, y:500, radius:22, type:'normal', element:'normal', elementRing:null, elements:null, frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 },
      { x:200, y:500, radius:22, type:'fast',   element:'火', elements:null, frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 },
      { x:280, y:500, radius:30, type:'tank',   element:'水', elements:null, frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 },
      { x:360, y:500, radius:40, type:'boss',   element:'金', elements:null, frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 },
      // 双系相生怪（用于克制提示）
      { x:60,  y:600, radius:24, type:'normal', element:'木', elements:['木','火'], frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 }
    ];
    for (const z of sample) { zombies.push(z); }
    currentStage = 1; activeElement = '火';
    for (const z of sample) drawZombie(z, Date.now());
    ok('drawZombie 汉字怪物 (5 例)');
  } catch(e){ fail('drawZombie 汉字怪物', e); }

  // 4) 五行坞绘制 + 克制提示 + 命中测试
  try {
    currentStage = 1; activeElement = '火';
    drawElementDock();                 // 场上木/火/金怪 → 克制提示应含 水/金/火
    const hints = getCounterHintElements();
    if (!(hints.indexOf('火') >= 0)) throw new Error('克制提示缺少对金怪的火, hints=' + hints);
    // 命中测试：取第1个图标中心
    const rects = getElementDockRects();
    const hit = hitElementDock(rects[0].x, rects[0].y);
    if (hit !== rects[0].e) throw new Error('hitElementDock 命中失败: ' + hit);
    ok('drawElementDock + 克制提示 + 命中 (' + hints.join('/') + ')');
  } catch(e){ fail('drawElementDock', e); }

  // 5) 坞点击切换 activeElement（仅解锁元素可切）
  try {
    currentStage = 1; activeElement = '火';
    const rects = getElementDockRects();
    const waterIdx = WUXING_ORDER.indexOf('水');
    // 模拟点击“水”图标
    const e = hitElementDock(rects[waterIdx].x, rects[waterIdx].y);
    if (e === '水') { const u = getStageUnlockedElements(currentStage); if (u.indexOf('水')>=0) activeElement = e; }
    if (activeElement !== '水') throw new Error('坞点击未切换为水, 实=' + activeElement);
    // 锁定的“金”不可切（L1 未解锁）
    const goldIdx = WUXING_ORDER.indexOf('金');
    const g = hitElementDock(rects[goldIdx].x, rects[goldIdx].y);
    if (g === '金') { const u = getStageUnlockedElements(currentStage); if (u.indexOf('金')>=0) activeElement = g; }
    if (activeElement !== '水') throw new Error('锁定元素不应被选中, 实=' + activeElement);
    ok('坞点击切换 (activeElement=' + activeElement + ')');
  } catch(e){ fail('坞点击切换', e); }

  console.log('\\n=== P1 SMOKE RESULT ===');
  console.log(results.join('\\n'));
  if (results.some(r => r.indexOf('FAIL') === 0)) { console.log('OVERALL: FAIL'); } else { console.log('OVERALL: PASS'); }
})();
`;

try {
    vm.runInContext(src + driver, sandbox, { filename: 'game.js' });
} catch (e) {
    console.log('LOAD/RUNTIME ERROR (likely pre-existing env need, not P1):');
    console.log(e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
    process.exit(2);
}
