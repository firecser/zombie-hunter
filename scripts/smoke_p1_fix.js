// P1 修复回归测试（行为级，不是"不报错"级）
// 覆盖两个已修 bug：
//   BUG-1 双系关卡（第7-10章）怪物 element='normal' + elements=['金','水'] → 旧代码渲染灰色「僵」，五行编码丢失
//   BUG-2 底部无安全区处理 → 五行坞图标落到全面屏 Home 指示条区（底部 34px）被系统手势吃掉
// 手法：ctx 用「记录型」桩，捕获 fillText/strokeText 的真实参数；wx.getWindowInfo 返回带 safeArea 的全面屏信息。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filePath = path.join(__dirname, '..', 'game.js');
let src = fs.readFileSync(filePath, 'utf8');

const SCREEN_W = 390, SCREEN_H = 844, SAFE_BOTTOM = 810;   // 模拟 iPhone 全面屏：底部安全区 34px
const SAFE_INSET = SCREEN_H - SAFE_BOTTOM;

// ---- 记录型 ctx ----
const calls = { fillText: [], strokeText: [] };
const gradientStub = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'fillText') return (text, x, y) => { calls.fillText.push({ text: String(text), x, y }); return ctxProxy; };
        if (p === 'strokeText') return (text, x, y) => { calls.strokeText.push({ text: String(text), x, y }); return ctxProxy; };
        if (p === 'measureText') return () => ({ width: 0 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradientStub;
        if (p === 'canvas') return { width: SCREEN_W, height: SCREEN_H };
        return (...a) => ctxProxy;
    },
    set() { return true; }
});

// ---- wx 桩（带 safeArea）----
const audioCtxStub = {
    currentTime: 0, state: 'running', destination: {}, resume() {}, suspend() {},
    createOscillator: () => ({ connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {} } }),
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, value: 0 } })
};
const wxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'getWindowInfo' || p === 'getSystemInfoSync') return () => ({
            screenWidth: SCREEN_W, screenHeight: SCREEN_H, statusBarHeight: 20,
            safeArea: { left: 0, right: SCREEN_W, top: 20, bottom: SAFE_BOTTOM, width: SCREEN_W, height: SAFE_BOTTOM - 20 }
        });
        if (p === 'createWebAudioContext') return () => audioCtxStub;
        if (p === 'createInnerAudioContext') return () => ({ play() {}, onEnded() {}, destroy() {}, src: '' });
        if (p === 'createCanvas') return () => ({ getContext: () => ctxProxy, width: SCREEN_W, height: SCREEN_H });
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
    canvas: { getContext: () => ctxProxy, width: SCREEN_W, height: SCREEN_H },
    screenWidth: SCREEN_W,
    screenHeight: SCREEN_H,
    console,
    Math, Date, Object, Array, JSON, String, Number, Boolean, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    module: { exports: {} },
    require: () => ({}),
    globalThis: null,
    __calls: calls,
    __safeInset: SAFE_INSET,
    __screenH: SCREEN_H,
    __screenW: SCREEN_W,
    // 源码级残留检查：炸弹按钮纵坐标若还写死 screenHeight - 48，说明有绘制/爆炸点没跟随 P1 新位置
    __staleBombCount: (src.match(/screenHeight - 48/g) || []).length
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const driver = `
;(function(){
  const results = [];
  function ok(n){ results.push('PASS ' + n); }
  function fail(n, e){ results.push('FAIL ' + n + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }
  function glyphsDrawn(){ return __calls.fillText.map(c => c.text); }

  // ---------- BUG-1 双系怪汉字编码 ----------
  try {
    currentStage = 40;                       // 第7章（双系）
    zombies.length = 0;
    const dual = { x:200, y:500, radius:24, type:'normal', element:'normal', elements:['金','水'],
                   frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 };
    zombies.push(dual);
    __calls.fillText.length = 0; __calls.strokeText.length = 0;
    drawZombie(dual, Date.now());
    const g = glyphsDrawn();
    if (g.indexOf('金') < 0) throw new Error('主元素「金」未绘制, 实绘制=' + g.join(','));
    if (g.indexOf('水') < 0) throw new Error('第二元素「水」未绘制, 实绘制=' + g.join(','));
    if (g.indexOf('僵') >= 0) throw new Error('仍退化成灰色「僵」, 实绘制=' + g.join(','));
    ok('BUG-1 双系怪汉字编码 (' + g.join('+') + ')');
  } catch(e){ fail('BUG-1 双系怪汉字编码', e); }

  // ---------- BUG-1b 单系 / 无属性 不回归 ----------
  try {
    const single = { x:100, y:500, radius:22, type:'normal', element:'火', elements:null,
                     frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 };
    __calls.fillText.length = 0;
    drawZombie(single, Date.now());
    if (glyphsDrawn().indexOf('火') < 0) throw new Error('单系「火」未绘制: ' + glyphsDrawn().join(','));

    const plain = { x:300, y:500, radius:22, type:'normal', element:'normal', elements:null,
                    frozenUntil:0, slowUntil:0, burningUntil:0, health:100, maxHealth:100 };
    __calls.fillText.length = 0;
    drawZombie(plain, Date.now());
    if (glyphsDrawn().indexOf('僵') < 0) throw new Error('无属性怪应回退「僵」: ' + glyphsDrawn().join(','));
    ok('BUG-1b 单系「火」/ 无属性「僵」不回归');
  } catch(e){ fail('BUG-1b 单系/无属性', e); }

  // ---------- BUG-2 底部安全区 ----------
  try {
    if (SAFE_BOTTOM_OFFSET !== __safeInset) throw new Error('SAFE_BOTTOM_OFFSET 应为 ' + __safeInset + ', 实=' + SAFE_BOTTOM_OFFSET);
    if (Math.abs((DOCK_TOP + DOCK_HEIGHT) - (__screenH - __safeInset)) > 0.5)
      throw new Error('坞底未贴合安全区上沿: DOCK_TOP+DOCK_HEIGHT=' + (DOCK_TOP + DOCK_HEIGHT) + ', 期望=' + (__screenH - __safeInset));
    // 所有坞图标必须完全在安全区内
    const rects = getElementDockRects();
    let maxBottom = -Infinity;
    for (const rc of rects) maxBottom = Math.max(maxBottom, rc.y + rc.size / 2);
    if (maxBottom > __screenH - __safeInset + 0.5)
      throw new Error('坞图标越入安全区: bottom=' + maxBottom.toFixed(1) + ' > ' + (__screenH - __safeInset));
    ok('BUG-2 坞整体上移，图标底 ' + maxBottom.toFixed(1) + ' ≤ 安全区上沿 ' + (__screenH - __safeInset));
  } catch(e){ fail('BUG-2 底部安全区', e); }

  // ---------- 控制按钮 / 炸弹 不与坞重叠 ----------
  try {
    const btnBottom = CONTROL_Y + buttonSize;
    if (btnBottom > DOCK_TOP + 0.5) throw new Error('音效/暂停按钮压到坞: ' + btnBottom + ' > ' + DOCK_TOP);
    const bombBottom = BOMB_BTN_Y + 30;   // 绘制/命中半径 30
    if (bombBottom > DOCK_TOP + 0.5) throw new Error('炸弹按钮压到坞: ' + bombBottom + ' > ' + DOCK_TOP);
    ok('控制按钮与炸弹均不压坞 (btn底=' + btnBottom.toFixed(0) + ', bomb底=' + bombBottom.toFixed(0) + ', 坞顶=' + DOCK_TOP.toFixed(0) + ')');
  } catch(e){ fail('控制按钮不压坞', e); }

  // ---------- 绘制-命中共基准（安全区后仍一致）----------
  try {
    currentStage = 1; activeElement = '火';
    drawElementDock();
    const rects = getElementDockRects();
    for (const rc of rects) {
      const hit = hitElementDock(rc.x, rc.y);
      if (hit !== rc.e) throw new Error('命中错位: 期望' + rc.e + ' 实得' + hit);
    }
    // 坞外（安全区内）不应命中任何图标
    const inSafe = hitElementDock(195, __screenH - 5);
    if (inSafe !== null) throw new Error('安全区内误命中: ' + inSafe);
    ok('坞绘制/点击共基准 + 安全区内不误命中');
  } catch(e){ fail('坞绘制/点击共基准', e); }

  // ---------- BUG-3 买量素材演示模式的炸弹坐标 ----------
  try {
    if (__staleBombCount > 0) throw new Error('仍有 ' + __staleBombCount + ' 处写死 screenHeight - 48（引导/爆炸点未跟随炸弹新位置）');
    // 炸弹按钮必须在坞上方、且在屏幕内
    if (!(BOMB_BTN_Y + 30 <= DOCK_TOP + 0.5)) throw new Error('炸弹按钮越界压坞');
    if (!(BOMB_BTN_X + 30 <= __screenW + 0.5)) throw new Error('炸弹按钮越界出屏');
    ok('BUG-3 炸弹坐标统一（无写死 screenHeight-48，按钮在坞上方）');
  } catch(e){ fail('BUG-3 炸弹坐标统一', e); }

  console.log('\\n=== P1 FIX REGRESSION RESULT ===');
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
