// P5 关卡元素对齐回归测试
// 核心不变量：每一关、每一波出现的怪物元素，其「克制元素」必须已在该关解锁。
// 另覆盖：第 1 章教学节奏（L1 前半金/后半火）、第 2 章起沿用章节元素、spawnWave 真的按波投放。
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

  // 收集某关所有可能出现的怪物元素（waveElements 优先，其次 stage.element / elements）
  function stageMonsterElements(st){
    if (st.waveElements && st.waveElements.length) {
      return Array.from(new Set(st.waveElements));
    }
    if (st.elements && st.elements.length) return st.elements.slice();
    return [st.element || 'normal'];
  }

  // ---------- 1) 全 60 关：克制元素必须已解锁 ----------
  try {
    const bad = [];
    for (const st of STAGES) {
      const unlocked = getStageUnlockedElements(st.id);
      for (const m of stageMonsterElements(st)) {
        if (m === 'normal') continue;
        const counter = ELEMENT_COUNTER[m];
        if (!counter) { bad.push(st.id + ':元素' + m + '无克制映射'); continue; }
        if (unlocked.indexOf(counter) < 0) bad.push('第' + st.id + '关 怪=' + m + ' 需' + counter + ' 但未解锁[' + unlocked.join('') + ']');
      }
    }
    if (bad.length) throw new Error(bad.slice(0, 5).join(' ; ') + (bad.length > 5 ? ' …共' + bad.length + '处' : ''));
    ok('全 60 关：每只怪的克制元素均已解锁');
  } catch(e){ fail('60关克制可用性', e); }

  // ---------- 2) 第 1 章教学节奏 ----------
  try {
    const l1 = STAGES[0];
    if (!l1.waveElements || l1.waveElements.length !== 20) throw new Error('L1 应有 20 波元素');
    if (l1.waveElements[0] !== '金') throw new Error('L1 第1波应为金怪（火克）, 实=' + l1.waveElements[0]);
    if (l1.waveElements[19] !== '火') throw new Error('L1 末波应为火怪（水克）, 实=' + l1.waveElements[19]);
    const firstHalf = l1.waveElements.slice(0, 10).every(x => x === '金');
    const secondHalf = l1.waveElements.slice(10).every(x => x === '火');
    if (!firstHalf || !secondHalf) throw new Error('L1 应为前半金/后半火');

    // L2 含土怪（木克，L2 解锁木）；L3 含水土（土克，L3 解锁土）；L4+ 含木怪（金克，L4 全开）
    if (STAGES[1].waveElements.indexOf('土') < 0) throw new Error('L2 应引入土怪');
    if (STAGES[2].waveElements.indexOf('水') < 0) throw new Error('L3 应引入水怪');
    if (STAGES[3].waveElements.indexOf('木') < 0) throw new Error('L4 应引入木怪');
    ok('教学节奏：L1 金→火 / L2 土 / L3 水 / L4 木');
  } catch(e){ fail('教学节奏', e); }

  // ---------- 3) 第 2 章起沿用章节元素 ----------
  try {
    for (let i = 6; i < STAGES.length; i++) {
      if (STAGES[i].waveElements) throw new Error('第' + STAGES[i].id + '关不应有 waveElements');
    }
    const ch2 = STAGES[6];   // 第7关（第2章）
    if (ch2.element !== '水') throw new Error('第7关应为水属性章节, 实=' + ch2.element);
    ok('第 7~60 关沿用章节元素（第7关=水）');
  } catch(e){ fail('章节元素沿用', e); }

  // ---------- 4) spawnWave 真的按波投放 ----------
  try {
    pendingSpawns.length = 0;
    const st = STAGES[0];
    spawnWave({ i: 1, comp: ['normal'], spawnAt: 0 }, st);
    if (pendingSpawns[0].zElement !== '金') throw new Error('第1波 zElement 应金, 实=' + pendingSpawns[0].zElement);
    pendingSpawns.length = 0;
    spawnWave({ i: 20, comp: ['normal'], spawnAt: 0 }, st);
    if (pendingSpawns[0].zElement !== '火') throw new Error('第20波 zElement 应火, 实=' + pendingSpawns[0].zElement);
    // 非教学关：沿用章节元素
    pendingSpawns.length = 0;
    spawnWave({ i: 1, comp: ['normal'], spawnAt: 0 }, STAGES[6]);
    if (pendingSpawns[0].zElement !== '水') throw new Error('第7关第1波应为水, 实=' + pendingSpawns[0].zElement);
    pendingSpawns.length = 0;
    ok('spawnWave 按波投放（L1 第1波金 / 第20波火；第7关水）');
  } catch(e){ fail('spawnWave 投放', e); }

  console.log('\\n=== P5 SMOKE RESULT ===');
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
