
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

function getUpgradeListLayout() {
    const cols = 3;
    const n = upgradeOptions.length;
    const rows = Math.max(1, Math.ceil(n / cols));
    const panelX = 20;
    const panelW = screenWidth - 40;
    const cellGap = 8;
    const cellW = (panelW - cellGap * (cols - 1)) / cols;
    const maxRowH = 130;
    const rowH = Math.min(maxRowH, (screenHeight - 170) / rows);
    const gridTop = Math.max(64, (screenHeight - rows * rowH) / 2);
    return { cols, rows, n, panelX, panelW, cellGap, cellW, rowH, gridTop };
}
function drawUpgradeList() {
    const L = getUpgradeListLayout();

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // 外框面板
    drawRoyalePanel(L.panelX, 30, L.panelW, screenHeight - 60, 15);
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 3;
    roundRect(ctx, L.panelX, 30, L.panelW, screenHeight - 60, 15);
    ctx.stroke();

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('技能实验室 · 自由选择（共 ' + L.n + ' 个）', screenWidth / 2, 55);

    // 网格卡片
    for (let i = 0; i < L.n; i++) {
        const opt = upgradeOptions[i];
        const c = i % L.cols;
        const r = Math.floor(i / L.cols);
        const x = L.panelX + c * (L.cellW + L.cellGap);
        const y = L.gridTop + r * L.rowH;
        const cellH = L.rowH - L.cellGap;
        const isOwned = acquiredSkills.includes(opt.type);
        const lv = (skills[opt.type] && skills[opt.type].level) || 0;

        // 卡片背景
        const grad = ctx.createLinearGradient(x, y, x, y + cellH);
        grad.addColorStop(0, '#1c3a5e');
        grad.addColorStop(1, '#0f2440');
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, L.cellW, cellH, 10);
        ctx.fill();

        // 边框（已获得蓝色，未获得金色）
        ctx.strokeStyle = isOwned ? '#66aaff' : '#ffd700';
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, L.cellW, cellH, 10);
        ctx.stroke();

        // 图标
        ctx.fillStyle = '#fff';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opt.icon, x + L.cellW / 2, y + 26);

        // 名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Arial';
        ctx.fillText(opt.name, x + L.cellW / 2, y + 52);

        // 等级 / 状态
        ctx.fillStyle = isOwned ? '#66aaff' : '#888';
        ctx.font = 'bold 11px Arial';
        ctx.fillText(isOwned ? ('Lv.' + lv) : '未获得', x + L.cellW / 2, y + 70);

        // 描述（最多两行，按卡片宽度截断）
        ctx.fillStyle = '#bbb';
        ctx.font = '10px Arial';
        const desc = opt.desc || '';
        const maxChars = Math.max(4, Math.floor(L.cellW / 7));
        if (desc.length > maxChars * 2) {
            ctx.fillText(desc.substring(0, maxChars), x + L.cellW / 2, y + 92);
            ctx.fillText(desc.substring(maxChars, maxChars * 2) + '…', x + L.cellW / 2, y + 106);
        } else if (desc.length > maxChars) {
            ctx.fillText(desc.substring(0, maxChars), x + L.cellW / 2, y + 92);
            ctx.fillText(desc.substring(maxChars), x + L.cellW / 2, y + 106);
        } else {
            ctx.fillText(desc, x + L.cellW / 2, y + 100);
        }

        // 质变节点角标
        const _nx = lv + 1;
        const _qn = SKILL_DEFS[opt.type] && SKILL_DEFS[opt.type].qualNodes && SKILL_DEFS[opt.type].qualNodes[_nx];
        if (_qn) {
            ctx.fillStyle = '#ffd700';
            roundRect(ctx, x + L.cellW - 34, y + 4, 30, 14, 4);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px Arial';
            ctx.fillText('质变', x + L.cellW - 19, y + 11);
        }
    }

    // 底部提示
    ctx.fillStyle = '#9aa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('点击任意技能强化 · 5 槽上限同正式关 · 暂停可退出', screenWidth / 2, screenHeight - 35);
}
function showUpgradePanel() {
    gameState = 'upgrade';
    
    // 选择升级选项
    let availableUpgrades;
    if (acquiredSkills.length >= MAX_SKILLS) {
        availableUpgrades = upgradePool.filter(u => acquiredSkills.includes(u.type));
    } else {
        availableUpgrades = [...upgradePool];
    }
    
    if (isSkillLab) {
        // 技能实验室：列出全部可选技能，不随机抽 3（5 槽上限逻辑仍与主游戏一致）
        upgradeOptions = availableUpgrades;
    } else {
        const shuffled = availableUpgrades.sort(() => Math.random() - 0.5);
        upgradeOptions = shuffled.slice(0, 3);
    }
    selectedUpgrade = -1;
}
function applyUpgrade(upgrade) {
    // 注意：天赋会预先抬高部分技能等级（爆炸/闪电链等），
    // 因此这里必须用 acquiredSkills 判断是否首次获得，否则会绕过 MAX_SKILLS 槽位限制。
    if (!acquiredSkills.includes(upgrade.type)) {
        acquiredSkills.push(upgrade.type);
    }
    
    skills[upgrade.type].level++;
    
    // 升级效果统一走 SKILL_DEFS[type].apply（每级增量，复用原 switch 语义）
    const _def = SKILL_DEFS[upgrade.type];
    if (_def && _def.apply) _def.apply(skills[upgrade.type].level);
    // 质变节点（qualNodes）：升级到指定等级触发一次性强化
    fireQualNodes(upgrade.type);

    gameState = 'playing';
    gameRunning = true;
    lastTime = Date.now();
    
    // 重置炸弹获得标志
    justGotBomb = false;
    bombFull = false;

    // 连锁升级：本次经验溢出跨多级（如炸弹清屏）时，继续弹出下一级三选一，让玩家逐级都选
    if (player.exp >= player.expToLevel && player.level < MAX_LEVEL) {
        levelUp();
    }
}

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
