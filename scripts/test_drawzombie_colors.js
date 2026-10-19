// 抽离 drawZombie + ELEMENT_RING，用桩 canvas 验证"按类型四色"映射与无运行时报错
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('game.js', 'utf8');

// 1) 抽取 ELEMENT_RING 定义
const erStart = src.indexOf('const ELEMENT_RING = {');
if (erStart < 0) throw new Error('ELEMENT_RING not found');
let i = src.indexOf('};', erStart);
const elementRingSrc = src.slice(erStart, i + 2);

// 2) 抽取 function drawZombie(...) 完整函数（括号平衡）
const dzStart = src.indexOf('function drawZombie(');
if (dzStart < 0) throw new Error('drawZombie not found');
let depth = 0, j = src.indexOf('{', dzStart);
for (let k = j; k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (depth === 0) { j = k + 1; break; } }
}
const dzSrc = src.slice(dzStart, j);

// 3) 桩 canvas
const fillStyles = [];
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'fillStyle' || p === 'strokeStyle' || p === 'lineWidth' ||
        p === 'globalAlpha' || p === 'lineCap') return t[p];
    return (...args) => {
      if (p === 'fill' || p === 'fillRect') fillStyles.push('FILL:' + (t.fillStyle || ''));
      if (p === 'stroke') fillStyles.push('STROKE:' + (t.strokeStyle || ''));
    };
  },
  set(t, p, v) { t[p] = v; return true; }
});

const sandbox = {
  ctx,
  screenWidth: 1080,
  screenHeight: 1920,
  Math, Date, console,
  addParticle: () => {}
};
vm.createContext(sandbox);
vm.runInContext(elementRingSrc + '\n' + dzSrc + '\nthis.__drawZombie = drawZombie;', sandbox);
const drawZombie = sandbox.__drawZombie;

const COAT = {
  normal: '#5cc04f', fast: '#ffb347', tank: '#a06bff', boss: '#ff5a5f'
};
let pass = true;
for (const type of ['normal', 'fast', 'tank', 'boss']) {
  fillStyles.length = 0;
  try {
    drawZombie({ x: 500, y: 500, radius: 40, type, maxHealth: 100, health: 100,
                 element: 'normal', elements: null }, Date.now());
  } catch (e) {
    console.log(`FAIL ${type}: threw ${e.message}`);
    pass = false;
    continue;
  }
  const used = fillStyles.map(s => s.replace(/^(FILL|STROKE):/, ''));
  const coat = used.find(c => Object.values(COAT).includes(c));
  const ok = coat === COAT[type];
  if (!ok) pass = false;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${type}: body coat = ${coat} (期望 ${COAT[type]}); 共绘制 ${fillStyles.length} 次填充/描边`);
}
console.log(pass ? '\nALL_PASS' : '\nHAS_FAIL');
