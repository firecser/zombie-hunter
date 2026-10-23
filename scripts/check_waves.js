// 检查波次编制：每关总怪数 / 出怪间隔 / 单只血量
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

const grad = { addColorStop() {} };
const ctx = new Proxy({}, {
    get(t, p) {
        if (p === 'measureText') return () => ({ width: 0 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
        if (p === 'canvas') return { width: 390, height: 844 };
        return () => ctx;
    },
    set() { return true; }
});
const audioCtx = { currentTime: 0, state: 'running', destination: {}, resume() {}, suspend() {},
    createOscillator: () => ({ connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {} } }),
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, value: 0 } }) };
const wx = new Proxy({}, {
    get(t, p) {
        if (p === 'getWindowInfo' || p === 'getSystemInfoSync') return () => ({ screenWidth: 390, screenHeight: 844, statusBarHeight: 20,
            safeArea: { left: 0, right: 390, top: 20, bottom: 810, width: 390, height: 790 } });
        if (p === 'createWebAudioContext') return () => audioCtx;
        if (p === 'createInnerAudioContext') return () => ({ play() {}, onEnded() {}, destroy() {}, src: '' });
        if (p === 'createCanvas') return () => ({ getContext: () => ctx, width: 390, height: 844 });
        if (p === 'getStorageSync') return () => '';
        if (p === 'createImage') return () => ({ onload: null, onerror: null, src: '', width: 0, height: 0 });
        return () => {};
    }
});
const sb = { wx, ctx, canvas: { getContext: () => ctx, width: 390, height: 844 },
    screenWidth: 390, screenHeight: 844, console, Math, Date, Object, Array, JSON, String, Number,
    Boolean, isNaN, parseInt, parseFloat, setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, module: { exports: {} }, require: () => ({}), globalThis: null };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(src + ';globalThis.__P=WAVE_PLAN;globalThis.__I=WAVE_INTERVAL;globalThis.__ST=STAGES;globalThis.__Z=zombieTypes;', sb, { filename: 'game.js' });

const P = sb.__P;
const total = P.reduce((a, w) => a + w.comp.length, 0);
console.log('每关总怪数 =', total, '| 出怪间隔 =', Math.round(sb.__I), 'ms | 平均每秒 =', (1000 / sb.__I).toFixed(2));
console.log('第1波 数量=', P[0].comp.length, 'hpScale=', P[0].hpScale.toFixed(3),
    '| normal 血量=', (90 * sb.__ST[0].healthMult * P[0].hpScale).toFixed(1));
console.log('第10波 数量=', P[9].comp.length, 'hpScale=', P[9].hpScale.toFixed(2),
    '| normal 血量=', (90 * sb.__ST[0].healthMult * P[9].hpScale).toFixed(1));
console.log('第20波 数量=', P[19].comp.length, 'hpScale=', P[19].hpScale.toFixed(2),
    '| normal 血量=', (90 * 11.1 * P[19].hpScale).toFixed(0));
console.log('BOSS 波:', P.filter(w => w.boss).map(w => w.i).join('/'));

// 金币核算（当前单只金币）
const GOLD = {}; for (const k in sb.__Z) GOLD[k] = sb.__Z[k].gold;
let g = 0;
for (const w of P) for (const t of w.comp) g += GOLD[t] || 0;
console.log('当前单关击杀金币 =', g, '| 旧值 25380 | 倍数 =', (g / 25380).toFixed(2));
