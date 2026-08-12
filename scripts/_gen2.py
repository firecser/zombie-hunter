src = open('game - 副本.js', encoding='utf-8').read()

def extract(name):
    i = src.index('function ' + name + '(')
    j = src.index('{', i)
    depth = 0; k = j
    while k < len(src):
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: return src[i:k+1]
        k += 1
    raise RuntimeError('unbalanced ' + name)

fns = [extract('getUpgradeListLayout'), extract('drawUpgradeList'),
       extract('showUpgradePanel'), extract('applyUpgrade')]

harness = r'''
// ---- 桩 ----
let screenWidth = 360, screenHeight = 1280;
const ROYALE = { gold: '#ffd700' };
let gameState = 'playing', gameRunning = true, lastTime = Date.now();
let justGotBomb = false, bombFull = false;
const MAX_SKILLS = 5, MAX_LEVEL = 20;

// 15 个技能（模拟真实 SKILL_DEFS 规模）
const SKILL_DEFS = {};
const upgradePool = [];
for (let i = 0; i < 15; i++) {
  const t = 's' + i;
  SKILL_DEFS[t] = { type: t, name: '技能' + i, icon: '★', element: '物理', category: 'bullet',
    maxLevel: 99, desc: '强化' + i + ' +20%', apply(lv){}, qualNodes: {} };
  upgradePool.push({ type: t, name: '技能' + i, icon: '★', desc: '强化' + i + ' +20%' });
}
const skills = {};
for (const k in SKILL_DEFS) skills[k] = { level: 0 };
let acquiredSkills = ['s0'];
let isSkillLab = false;
let upgradeOptions = [];
let selectedUpgrade = -1;

function fireQualNodes(){}
function levelUp(){ if (player.level < MAX_LEVEL && player.exp >= player.expToLevel) {} }
function drawRoyalePanel(){}
function roundRect(){}
const player = { exp: 0, expToLevel: 100, level: 1, damage: 10 };

__FNS__

// ---- ctx 桩 ----
let calls = 0;
const grad = { addColorStop(){} };
const ctx = new Proxy({}, {
  get(_, p){
    if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => grad;
    if (p === 'setLineDash') return () => {};
    return (...a) => { calls++; for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('NaN arg to '+p); };
  },
  set(){ return true; }
});

// ===== 测试1：实验室模式列出全部技能（非抽3） =====
isSkillLab = true;
showUpgradePanel();
console.log('T1 upgradeOptions.length =', upgradeOptions.length, '(期望 15 全部)');
const ok1 = upgradeOptions.length === 15;

// ===== 测试2：正常模式只抽3 =====
isSkillLab = false;
showUpgradePanel();
console.log('T2 upgradeOptions.length =', upgradeOptions.length, '(期望 3)');
const ok2 = upgradeOptions.length === 3;

// ===== 测试3：网格布局 + 点击命中映射 =====
isSkillLab = true;
showUpgradePanel();
const L = getUpgradeListLayout();
console.log('T3 layout cols=', L.cols, 'rows=', L.rows, 'cellW=', L.cellW.toFixed(1), 'rowH=', L.rowH.toFixed(1), 'gridTop=', L.gridTop.toFixed(1));
// 取 index=5 (col=2,row=1) 的格子中心
const idx = 5, col = idx % L.cols, row = Math.floor(idx / L.cols);
const cx = L.panelX + col * (L.cellW + L.cellGap) + L.cellW / 2;
const cy = L.gridTop + row * L.rowH + L.rowH / 2;
// 复用与 touchEnd 完全一致的映射公式
const c2 = Math.floor((cx - L.panelX) / (L.cellW + L.cellGap));
const r2 = Math.floor((cy - L.gridTop) / L.rowH);
const mapped = r2 * L.cols + c2;
console.log('T3 点击(idx=5) ->', mapped, '(期望 5)');
const ok3 = (c2 === col && r2 === row && mapped === 5);

// ===== 测试4：drawUpgradeList 无异常 =====
drawUpgradeList();
console.log('T4 drawUpgradeList calls=', calls, '(无 NaN/缺方法)');

// ===== 测试5：applyUpgrade 在实验室点击路径上正确调用 =====
let applied = null;
const _apply = applyUpgrade;
// 模拟 touchEnd 实验室分支：命中 idx 对应 upgradeOptions[idx]
applyUpgrade(upgradeOptions[mapped]);
console.log('T5 applied type=', (acquiredSkills.includes('s5') ? 's5 已入槽' : '未入槽'), 'skills[s5].level=', skills['s5'].level);
const ok5 = skills['s5'].level === 1 && acquiredSkills.includes('s5');

const ALL = ok1 && ok2 && ok3 && ok5;
console.log(ALL ? 'LAB_TEST_OK' : 'LAB_TEST_FAIL');
'''

harness = harness.replace('__FNS__', '\n'.join(fns))
open('_lab_test.js', 'w', encoding='utf-8').write(harness)
print('extracted fns ok')
