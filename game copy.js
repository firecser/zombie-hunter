// 制霸新手村的骷髅怪 - 微信小游戏完整版
// 基于 H5闯关版完整移植
// 版本: 1.0.3

// ==================== 基础设置 ====================
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const screenWidth = canvas.width;
const screenHeight = canvas.height;
// 领域光晕纹理缓存：为每个 (类型, 半径) 组合创建一次离屏 Canvas，之后 drawImage 复用，
// 避免每帧每个领域都调用 createRadialGradient/arc/fill（Canvas 2D 在微信小游戏上的主要瓶颈）。
const _fieldTextureCache = {};  // key: 'ice:R' / 'elec:R' → offscreen canvas
// 跨环境创建离屏 Canvas：优先 wx.createOffscreenCanvas，其次 wx.createCanvas()（小程序游戏后续调用返回离屏画布），
// 再退到浏览器 document.createElement('canvas')。避免某些基础库/开发者工具环境没有 createOffscreenCanvas 而直接抛错。
function createOffscreenCanvasSafe() {
    try {
        if (typeof wx !== 'undefined') {
            if (typeof wx.createOffscreenCanvas === 'function') {
                return wx.createOffscreenCanvas({ type: '2d' });
            }
            if (typeof wx.createCanvas === 'function') {
                return wx.createCanvas();
            }
        }
    } catch (e) { /* 忽略并尝试下方回退 */ }
    if (typeof document !== 'undefined' && document.createElement) {
        return document.createElement('canvas');
    }
    return null;
}
function getFieldTexture(type, radius) {
    const key = type + ':' + radius;
    if (_fieldTextureCache[key]) return _fieldTextureCache[key];
    const size = Math.ceil(radius * 2);
    const oc = createOffscreenCanvasSafe();
    if (!oc) return null;
    oc.width = size; oc.height = size;
    const octx = oc.getContext('2d');
    const cx = radius, cy = radius;
    const grad = octx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
    if (type === 'ice') {
        grad.addColorStop(0, 'rgba(55,198,255,0.30)');
        grad.addColorStop(0.6, 'rgba(55,198,255,0.15)');
        grad.addColorStop(1, 'rgba(55,198,255,0)');
        octx.fillStyle = grad;
        octx.beginPath(); octx.arc(cx, cy, radius, 0, Math.PI * 2); octx.fill();
        // 内圈冰晶（静态纹理）
        octx.strokeStyle = 'rgba(220,245,255,0.40)';
        octx.lineWidth = 2;
        octx.beginPath(); octx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2); octx.stroke();
    } else {
        grad.addColorStop(0, 'rgba(255,230,120,0.24)');
        grad.addColorStop(0.6, 'rgba(255,210,80,0.11)');
        grad.addColorStop(1, 'rgba(255,210,80,0)');
        octx.fillStyle = grad;
        octx.beginPath(); octx.arc(cx, cy, radius, 0, Math.PI * 2); octx.fill();
        // 电弧简化为静态内圈星芒（6 条短线）
        octx.strokeStyle = 'rgba(255,245,180,0.50)';
        octx.lineWidth = 1.5;
        octx.beginPath();
        for (let k = 0; k < 6; k++) {
            const a0 = k * Math.PI / 3;
            octx.moveTo(cx + Math.cos(a0) * radius * 0.25, cy + Math.sin(a0) * radius * 0.25);
            octx.lineTo(cx + Math.cos(a0 + 0.4) * radius * 0.55, cy + Math.sin(a0 + 0.4) * radius * 0.55);
        }
        octx.stroke();
    }
    _fieldTextureCache[key] = oc;
    return oc;
}

// 坦克开火线（用户要求）：怪物需下降到「距屏幕底部 3/4 屏幕高度」处，坦克才能锁定射击。
//   距屏幕底部 3/4 → y = screenHeight − 0.75·screenHeight = 0.25·screenHeight（即屏幕顶部 1/4 以下才可被射击）
const TANK_FIRE_LINE_Y = screenHeight * 0.25;

// 城墙（阻挡敌人下落）：位于背景地平线处，横跨全屏；墙体承受原坦克的伤害，
// 敌人只攻击城墙、不再攻击坦克。
const WALL_Y = screenHeight * 0.82;   // 与背景 horizon groundY 一致（地平线处），刚好挡住坦克
const WALL_HEIGHT = 40;               // 墙体厚度（自地平线向下延伸）
const WALL_X0 = 0;
const WALL_X1 = screenWidth;          // 横跨全屏，完全阻拦
// 城墙玩法平衡：① 僵尸不再每帧啃墙，而是按间隔「啄」一次（大幅降低攻击频率，旧模型有 8px 击退等效 ~每 8/sp 帧一次）
const WALL_ATTACK_INTERVAL = 500;     // 僵尸啄墙攻击间隔(ms)
// ② 城墙基础血量大幅提高（替代原坦克 100），以承受竖直下落的持续堆积
const WALL_MAX_HEALTH = 3000;         // 城墙基础血量（原坦克 100 → 600 → 3000，承受竖直下落的持续堆积）

// 战场左右边界（敌人「身体边缘」不可越界）：与城墙两端对齐（即屏幕左右缘）。
// 即使被后坐力击退，敌人也停在边界处，避免被推出屏幕后无法被瞄准、却仍贴墙持续掉血。
// 注意：钳制以敌人「身体边缘」(z.x ± z.radius) 为基准，而非中心点。视觉提示见 drawFieldBorders()。
const FIELD_X0 = WALL_X0;             // 左边界（屏幕左缘）
const FIELD_X1 = WALL_X1;             // 右边界（屏幕右缘）

// 获取微信状态栏高度（安全区域）
let statusBarHeight = 20;
try {
    // 新基础库用 wx.getWindowInfo（同步，含 statusBarHeight）；旧库回退 getSystemInfoSync
    if (wx.getWindowInfo) {
        statusBarHeight = wx.getWindowInfo().statusBarHeight || 20;
    } else {
        statusBarHeight = wx.getSystemInfoSync().statusBarHeight || 20;
    }
} catch (e) {
    statusBarHeight = 20;
}

// 安全顶部偏移量（状态栏高度 + 10px间隙）
const SAFE_TOP_OFFSET = statusBarHeight + 10;

// ==================== 关卡系统 ====================
// 第一章（新手教学 + 五行入门）：每关有明确主题，难度平滑上升；
// 设计已纳入现有技能系统——五行克制(+30%)、属性技能独立cd(群伤/控场/弹射)、急速冷却、组合技。
// 注：僵尸血量会随时间线性增长（最高 ≈ 基础×(1+300/70)≈5.3 倍，旧默认50=7倍；难度缓和v用户反馈），故此处 healthMult 为基础倍率；
// bossTime 单位秒（>该秒数后有 8% 概率刷 Boss），999=本章不出 Boss。
// ==================== 9 段波次难度（v1.1.x 心流重做）====================
// 由"3 段粗阶 + 单点指数"改为 9 段 wave-tier 表：每 2-3 波一档 HP/伤害倍率，
// 数值按"玩家最优火力成长 ×1.14/级 + 多重/属性树叠加"反推，使两条曲线交叉上升、偏离≤20%。
// 每段相对前段 HP ×1.10–1.16（小步快走）。段间不强制按严格 2/3 波等宽，按 player.level 落点分配。
// 段 1-2 = 新手缓坡；段 3-7 = 平滑升压；段 8 = 极限；段 9 = 终极（仅 wave 20 一波 + Boss）。
// 各段独立叠加 stage.healthMult/damageMult，因此 STAGES 字段整体下调以让 tier 主控曲线。
const WAVE_TIER_TABLE = [
    { tier:1, from:1,  to:2,  hpT:1.00, dmgT:1.00, note:'新手' },
    { tier:2, from:3,  to:4,  hpT:1.12, dmgT:1.04, note:'热身' },
    { tier:3, from:5,  to:7,  hpT:1.32, dmgT:1.10, note:'升压' },
    { tier:4, from:8,  to:10, hpT:1.58, dmgT:1.18, note:'考验' },
    { tier:5, from:11, to:12, hpT:1.90, dmgT:1.30, note:'压力' },
    { tier:6, from:13, to:15, hpT:2.32, dmgT:1.48, note:'高压' },
    { tier:7, from:16, to:17, hpT:2.80, dmgT:1.72, note:'极限' },
    { tier:8, from:18, to:19, hpT:3.40, dmgT:2.00, note:'突破' },
    { tier:9, from:20, to:20, hpT:4.20, dmgT:2.40, note:'终极' }
];
function getWaveTier(wave) {
    for (const t of WAVE_TIER_TABLE) {
        if (wave >= t.from && wave <= t.to) return t;
    }
    return WAVE_TIER_TABLE[WAVE_TIER_TABLE.length - 1];
}

// ==================== 章节主题：五行 + 极地怪物世界观 ====================
// 每章赋予怪物一个主导五行「单系」属性，或一对「相生」双系属性，并指定极地特色怪物皮肤。
// 五行克制（攻击五行 → 被克五行）：火克金、金克木、木克土、土克水、水克火。
//   → 金怪用「火」技能克、木怪用「金」、土怪用「木」、水怪用「土」、火怪用「水」（推荐）。
// 五行相生（A 生 B）：火生土、土生金、金生水、水生木、木生火。
//   → 第 7~10 章为「双系相生」强化怪物：单属性技能难以同时压制（取各系最差克制），需对应相生配对或暴力物理流。
const CHAPTER_THEMES = [
    { id:1,  name:'冰雪初现', icon:'❄️', element:'normal', elements:null,
      creature:'seal',      bossCreature:'sealKing',
      desc:'教学关卡·普通冰雪僵尸',             descColor:'#88cc88', terrain:'#1b3a4b' },
    { id:2,  name:'暴风骤起', icon:'🌨️', element:'水',     elements:null,
      creature:'penguin',   bossCreature:'emperorPenguin',
      desc:'水属性·用「土」技能克制',             descColor:'#37c6ff', terrain:'#16384f' },
    { id:3,  name:'冰川裂缝', icon:'🧊', element:'木',     elements:null,
      creature:'polarBear', bossCreature:'bearTroll',
      desc:'木属性·用「金」技能克制',             descColor:'#46d35a', terrain:'#1d4f3a' },
    { id:4,  name:'寒霜要塞', icon:'🔥', element:'火',     elements:null,
      creature:'walrus',    bossCreature:'lavaWalrus',
      desc:'火属性·用「水」技能克制（推荐）',     descColor:'#ff7a1a', terrain:'#4b2a1b' },
    { id:5,  name:'永冻深渊', icon:'⚡', element:'金',     elements:null,
      creature:'arcticFox', bossCreature:'foxDemon',
      desc:'金属性·用「火」技能克制',             descColor:'#ffd23a', terrain:'#3a2f1b' },
    { id:6,  name:'冰封王座', icon:'🪨', element:'土',     elements:null,
      creature:'reindeer',  bossCreature:'reindeerKing',
      desc:'土属性·用「木」技能克制',             descColor:'#c8915a', terrain:'#43381f' },
    { id:7,  name:'极寒之地', icon:'🌊', element:null,     elements:['金','水'],
      creature:'orca',      bossCreature:'orcaKing',
      desc:'金+水双系相生·需土/水配对或暴力',    descColor:'#8fe3ff', terrain:'#14354a' },
    { id:8,  name:'霜雪领域', icon:'🦉', element:null,     elements:['火','土'],
      creature:'snowyOwl',  bossCreature:'owlKing',
      desc:'火+土双系相生·需水/木配对或暴力',    descColor:'#ff9a4a', terrain:'#3a2b1b' },
    { id:9,  name:'冰河世纪', icon:'🐧', element:null,     elements:['木','火'],
      creature:'puffin',    bossCreature:'puffinKing',
      desc:'木+火双系相生·需金/水配对或暴力',    descColor:'#ff6a6a', terrain:'#3f2230' },
    { id:10, name:'终结之战', icon:'🐉', element:null,     elements:['水','木'],
      creature:'iceDragon', bossCreature:'dragonKing',
      desc:'水+木双系相生·终焉之战',             descColor:'#ff4dff', terrain:'#2a1b3f' }
];

// 元素 → 推荐克制技能（用于 HUD / 关卡选择提示）
const ELEMENT_COUNTER = { '金':'火', '木':'金', '土':'木', '水':'土', '火':'水' };

// 难度锯齿曲线：
//   · 整体随章节按 pow(1.12, ch-1) 阶梯上升；
//   · 章内随关卡 1 + 0.03*(lvInCh-1) 平滑升压；
//   · 天赋解锁章节（2/4/6/8/10）首关给「喘息」×0.85——玩家能力跃升时难度回落，与能力交替上升；
//   · 每章末关为 Boss 高潮 ×1.12。
const TALENT_CHAPTERS = [2, 4, 6, 8, 10];
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _round2(v) { return Math.round(v * 100) / 100; }

function buildStages() {
    const stages = [];
    for (let lv = 1; lv <= 60; lv++) {
        const ch = Math.ceil(lv / 6);              // 1..10
        const lvInCh = ((lv - 1) % 6) + 1;          // 1..6
        const theme = CHAPTER_THEMES[ch - 1];

        const base = Math.pow(1.12, ch - 1);
        const within = 1 + 0.03 * (lvInCh - 1);
        const breather = (TALENT_CHAPTERS.includes(ch) && lvInCh === 1) ? 0.85 : 1;
        const climax = (lvInCh === 6) ? 1.12 : 1;
        const D = base * within * breather * climax;

        const healthMult = _round2(D);
        const damageMult = _round2(_clamp(D * 0.62, 0.6, 2.6));
        const speedMult  = _round2(_clamp(0.92 + 0.03 * (ch - 1) + 0.01 * (lvInCh - 1), 0.9, 1.5));
        const spawnMult  = _round2(_clamp(0.9 + 0.045 * (ch - 1) + 0.012 * (lvInCh - 1), 0.85, 1.6));

        // Boss 频率：越后期 Boss 越早出现（章末关强制高频 Boss）
        const bossTime = lvInCh === 6 ? 35 : _round2(_clamp(260 - (ch - 1) * 22, 40, 260));
        const tankChance = _round2(_clamp(0.08 + 0.03 * (ch - 1) + 0.015 * (lvInCh - 1), 0.05, 0.45));
        const fastChance = _round2(_clamp(0.12 + 0.02 * (ch - 1), 0.1, 0.45));

        stages.push({
            id: lv,
            name: `${theme.name} ${lvInCh}/6`,
            icon: theme.icon,
            desc: theme.desc,
            difficulty: ch,
            descColor: theme.descColor,
            terrain: theme.terrain,
            speedMult, healthMult, damageMult, spawnMult,
            bossTime: Math.round(bossTime), tankChance, fastChance,
            // 五行属性：单系用 element，双系相生用 elements（zombie.elements）；normal 章节两者皆无
            element: theme.elements ? 'normal' : theme.element,
            elements: theme.elements || null,
            creature: theme.creature,
            bossCreature: theme.bossCreature
        });
    }
    return stages;
}
const STAGES = buildStages();

let currentStage = 1;
let stageProgress = [];

// 加载进度
try {
    const saved = wx.getStorageSync('zombieHunterProgress');
    if (saved) stageProgress = JSON.parse(saved);
} catch (e) {
    stageProgress = [false, false, false, false, false, false];
}

function getCurrentStage() {
    const idx = Math.max(0, Math.min(STAGES.length - 1, (currentStage || 1) - 1));
    return STAGES[idx];
}

// ==================== 统一数据持久化 ====================
// 统一的玩家数据对象（用于持久化）
let playerData = {
    gold: 0,
    diamond: 0,
    level: 1,
    exp: 0,
    kills: 0,
    skills: {},        // 技能等级
    acquiredSkills: ['damage']  // 已获得的技能
};

// 保存玩家数据到Storage
function savePlayerData() {
    // 从当前player对象同步数据
    playerData.gold = player.gold;
    playerData.diamond = player.diamond;
    playerData.level = player.level;
    playerData.exp = player.exp;
    playerData.kills = player.kills;
    playerData.skills = { ...skills };
    playerData.acquiredSkills = [...acquiredSkills];
    
    // 保存天赋数据
    playerData.talentLevels = {};
    Object.keys(talentData).forEach(key => {
        playerData.talentLevels[key] = talentData[key].level;
    });
    
    wx.setStorageSync('zombieHunterPlayerData', JSON.stringify(playerData));
}

// 从Storage加载玩家数据
function loadPlayerData() {
    try {
        const saved = wx.getStorageSync('zombieHunterPlayerData');
        if (saved) {
            const data = JSON.parse(saved);
            playerData = {
                gold: data.gold || 0,
                diamond: data.diamond || 0,
                level: data.level || 1,
                exp: data.exp || 0,
                kills: data.kills || 0,
                skills: data.skills || {},
                acquiredSkills: data.acquiredSkills || ['damage'],
                talentLevels: data.talentLevels || {}
            };
            
            // 同步到player对象
            player.gold = playerData.gold;
            player.diamond = playerData.diamond;
            player.level = playerData.level;
            player.exp = playerData.exp;
            player.kills = playerData.kills;
            
            // 同步技能
            Object.keys(playerData.skills).forEach(key => {
                if (skills[key]) {
                    skills[key].level = playerData.skills[key].level;
                }
            });
            acquiredSkills = [...playerData.acquiredSkills];
            
            // 同步天赋数据
            if (playerData.talentLevels) {
                Object.keys(playerData.talentLevels).forEach(key => {
                    if (talentData[key]) {
                        talentData[key].level = playerData.talentLevels[key];
                    }
                });
            }
        }
    } catch (e) {
        console.log('加载玩家数据失败', e);
    }
}

function saveProgress() {
    stageProgress[currentStage - 1] = true;
    
    // 保存完整游戏数据（统一格式）
    const gameData = {
        stageProgress: stageProgress,
        playerEnergy: playerEnergy,
        lastEnergyUpdate: lastEnergyUpdate,
        energyItems: energyItemCount,
        // 新增：统一player数据
        playerGold: player.gold,
        playerDiamond: player.diamond,
        playerLevel: player.level,
        playerExp: player.exp,
        playerKills: player.kills,
        playerSkills: { ...skills },
        playerAcquiredSkills: [...acquiredSkills],
        // 第一关买量演示是否已展示过（整个生命周期只出现一次）
        l1IntroDone: l1IntroDone
    };
    wx.setStorageSync('zombieHunterProgress', JSON.stringify(stageProgress));
    wx.setStorageSync('zombieHunterGameData', JSON.stringify(gameData));
    
    // 保存离线时间
    wx.setStorageSync('zombieHunterLastTime', Date.now());
}

function loadGameData() {
    try {
        const savedData = wx.getStorageSync('zombieHunterGameData');
        if (savedData) {
            const data = JSON.parse(savedData);
            playerEnergy = data.playerEnergy || ENERGY_CONFIG.initEnergy;
            lastEnergyUpdate = data.lastEnergyUpdate || Date.now();
            energyItemCount = data.energyItems || { 'energy_1': 0, 'energy_2': 0, 'energy_3': 0 };
            
            // 加载统一player数据
            if (data.playerGold !== undefined) player.gold = data.playerGold;
            if (data.playerDiamond !== undefined) player.diamond = data.playerDiamond;
            if (data.playerLevel !== undefined) player.level = data.playerLevel;
            if (data.playerExp !== undefined) player.exp = data.playerExp;
            if (data.playerKills !== undefined) player.kills = data.playerKills;
            
            // 加载技能数据
            if (data.playerSkills) {
                Object.keys(data.playerSkills).forEach(key => {
                    if (skills[key]) {
                        skills[key].level = data.playerSkills[key].level;
                    }
                });
            }
            if (data.playerAcquiredSkills) {
                acquiredSkills = [...data.playerAcquiredSkills];
            }

            // 第一关买量演示是否已展示过（整个生命周期只出现一次）
            if (data.l1IntroDone) l1IntroDone = true;
        }
    } catch (e) {
        console.log('加载游戏数据失败', e);
    }
}

// ==================== 游戏状态 ====================
let gameState = 'start'; // start, mainMenu, playing, paused, gameOver, victory, upgrade
let gameRunning = false;
let gamePaused = false;
let adWatchCount = 0;                 // 本局通过看广告补炸弹的已观看次数
const AD_WATCH_MAX_PER_LEVEL = 3;     // 每关看广告上限
let gameTime = 0;
let lastTime = Date.now();
// 技能实验室模式：从「世界-山东」进入，复用第一关配置，但三选一改为列出全部技能自由选择；
// 该模式不修改任何技能数据（SKILL_DEFS 本就是全局共享），故对其它关卡无影响。
let isSkillLab = false;
const GAME_TIME_LIMIT = 5 * 60 * 1000;   // 保留用于血量膨胀时间轴（与波次出怪时间轴一致，约5分钟）
const MAX_LEVEL = 20;

// ==================== 波次系统（v1.1.1）====================
// 通关条件改为「消灭 20 波敌人」。20 波在约 5 分钟内按时间轴全部出现（重叠波次，不等待上一波清完）；
// 通关条件：消灭全部 20 波敌人即胜利。
// 耦合设计（用户指定）：每波怪物经验总和 = 该波升级所需经验 → 清完一波经验条刚好填满、自动升 1 级、触发一次三选一。
// 升级所需 cost(L→L+1) = 2L（1→2需2、2→3需4、3→4需6…），故第 i 波经验总和 = 2i。
// 出怪间隔越来越长、出怪数量越来越多（数量≈2i，随坦克/Boss 组合变化）；同波怪错峰出现，不成一排。
const WAVE_COUNT = 20;
const EXP_BASE = 2;           // 经验/升级基准：wave i 经验 = EXP_BASE*i，cost(L→L+1) = EXP_BASE*L（保持「每波刚好升1级」耦合）；v1.1.6 由3降为2：缓解 lv5 前怪量过密、打不过
const WAVE_INITIAL_DELAY = 1500;   // 第一波出现前的初始延迟(ms)
const WAVE_JITTER = 120;           // 出怪抖动(ms)，避免机械等距
let WAVE_INTERVAL = 800;           // 每怪平均出怪间隔(ms)，由 buildWavePlan 按总数精确计算（≈5分钟出完20波）
function buildWavePlan() {
    const plan = [];
    // 第一遍：构造每波组成（经验耦合：每波经验总和 = 2i，保证清完升 1 级）
    for (let i = 1; i <= WAVE_COUNT; i++) {
        const targetExp = EXP_BASE * i;                 // 该波升级所需经验 = 怪物经验总和
        const isBoss = (i % 5 === 0);
        const comp = [];                               // 怪物类型组成（普通1/精英2/BOSS4 经验）
        let remaining = targetExp;
        if (isBoss) { comp.push('boss'); remaining -= 4; }
        // 中后期加入精英(坦克, 2经验)增加厚度
        if (i >= 3) {
            const tanks = Math.min(Math.floor(i / 3), Math.floor(remaining / 2));
            for (let k = 0; k < tanks; k++) { comp.push('tank'); remaining -= 2; }
        }
        // 速度感：偶数非Boss波加几个快速怪(1经验)
        if (i >= 2 && !isBoss && i % 2 === 0) {
            const fast = Math.min(3, remaining);
            for (let k = 0; k < fast; k++) { comp.push('fast'); remaining -= 1; }
        }
        // 剩余用普通怪(1经验)填满，保证经验总和精确等于 targetExp
        while (remaining > 0) { comp.push('normal'); remaining -= 1; }
        plan.push({ i, comp, boss: isBoss });
    }
    // 第二遍：排「连绵不绝」时间轴——每波内部均匀铺开，波与波首尾相接(无空当)，
    // 整局约 GAME_TIME_LIMIT 出完。每怪平均间隔 = 余下时间 / 总怪数；后段波次怪多，
    // 其独占时间段更长，自然形成「越往后怪越多」的观感，但全程不断流、无波间空当。
    const totalCount = plan.reduce((s, w) => s + w.comp.length, 0);
    WAVE_INTERVAL = (GAME_TIME_LIMIT - WAVE_INITIAL_DELAY) / totalCount;
    let t = WAVE_INITIAL_DELAY;
    for (const w of plan) {
        w.spawnAt = t;
        t += w.comp.length * WAVE_INTERVAL;   // 下一波紧接本波最后一只之后，消除波间空当
    }
    return plan;
}
const WAVE_PLAN = buildWavePlan();

// ==================== 买量素材演示模式 ====================
let isAdDemoMode = false;       // 是否为买量素材演示模式
let adDemoState = 'waiting';    // waiting->guiding->exploding->result
let adDemoTimer = 0;

let adBombExploded = false;     // 炸弹是否已爆炸
let adZombieCount = 0;          // 统计击杀僵尸数
let adGoldEarned = 0;           // 实际获得金币数
let stageGoldEarned = 0;        // 本次关卡结算获得的金币（用于结算弹窗突出显示）
let goldAtStageStart = 0;        // 进入关卡前的金币（用于胜利后累积）
// 第一关买量演示（首个炸弹+初始金币怪）是否已展示过：整个玩家生命周期只出现一次，持久化
let l1IntroDone = false;

// ==================== 音效和暂停设置 ====================
let soundEnabled = true;
let musicEnabled = true;
let vibrationEnabled = true;  // 振动开关状态
const buttonSize = 44;
const buttonGap = 6;

// ========== 设置系统 ==========
// 设置弹窗状态
let settingsModal = {
    show: false
};
let settingsJustOpened = false;  // 防止打开弹窗时立即触发关闭逻辑

// 当前设置页面（'main' | 'rules' | 'about'）
let settingsPage = 'main';

// 关于我们信息
const GAME_INFO = {
    name: '制霸新手村的骷髅怪',
    version: '1.0.5',
    developer: '郭晓宇',
    email: 'firecser@163.com',
    description: '本游戏为冰雪世界塔防类微信小游戏，玩家操控骷髅主角在冰雪世界中与各种僵尸怪物战斗，提升等级和天赋，体验紧张刺激的闯关乐趣。'
};

// ==================== 体力系统 ====================

// 体力配置
const ENERGY_CONFIG = {
    maxEnergy: 100,              // 体力上限
    initEnergy: 100,            // 初始体力
    recoverTime: 5 * 60 * 1000, // 恢复时间（5分钟/点，毫秒）
    recoverAmount: 1            // 每次恢复量
};

// 玩家体力状态
let playerEnergy = ENERGY_CONFIG.initEnergy;  // 当前体力
let lastEnergyUpdate = Date.now();             // 上次体力更新时间

// 关卡体力消耗表（按关卡区间）
const ENERGY_COST = {
    1: 20,   // 1-10关 (测试用20点)
    11: 20,  // 11-20关
    21: 20,  // 21-30关
    31: 20,  // 31-40关
    41: 20,  // 41-50关
    51: 20   // 51-60关
};

// 体力道具
const ENERGY_ITEMS = [
    { id: 'energy_1', name: '体力药水(小)', icon: '🧪', amount: 30, price: 6 },
    { id: 'energy_2', name: '体力药水(中)', icon: '🧪', amount: 60, price: 15 },
    { id: 'energy_3', name: '体力药水(大)', icon: '🧪', amount: 100, price: 30 }
];

// 背包中的体力道具数量
let energyItemCount = {
    'energy_1': 0,
    'energy_2': 0,
    'energy_3': 0
};

// 体力不足弹窗
let energyModal = {
    show: false,
    targetStage: 1
};
let energyModalJustOpened = false;  // 弹窗刚打开的标志，用于避免本次触摸结束时误关闭

// 广告恢复体力
let adEnergyCount = 0;                      // 今日已观看广告次数
const MAX_AD_ENERGY_PER_DAY = 5;             // 每日最多观看5次
const AD_ENERGY_RECOVER = 30;                // 观看广告恢复30点体力
let lastAdEnergyDate = '';                   // 上次重置日期

// 按钮位置（放在左下角）
const soundBtnX = 10;
const soundBtnY = screenHeight - buttonSize - 10;
const pauseBtnX = soundBtnX + buttonSize + buttonGap;
const pauseBtnY = screenHeight - buttonSize - 10;

// ==================== 音频系统（Web Audio API）====================
const AudioSystem = {
    ctx: null,
    bgmGain: null,
    sfxGain: null,
    bgmOscillators: [],
    bgmInterval: null,
    isMuted: false,
    isInitialized: false,
    
    // 初始化音频上下文
    init() {
        if (this.isInitialized) return;
        try {
            // 微信小游戏使用 wx.createWebAudioContext()
            if (typeof wx !== 'undefined' && wx.createWebAudioContext) {
                this.ctx = wx.createWebAudioContext();
            } else if (typeof window !== 'undefined') {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (!this.ctx) {
                console.log('音频上下文创建失败');
                this.isInitialized = true;
                return;
            }
            
            // 主音量控制
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = 0.15;
            this.bgmGain.connect(this.ctx.destination);
            
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.3;
            this.sfxGain.connect(this.ctx.destination);
            
            this.isInitialized = true;
            console.log('音频系统初始化成功');
        } catch (e) {
            console.log('音频初始化失败:', e);
        }
    },
    
    // 恢复音频上下文（解决自动播放策略）
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },
    
    // 射击音效
    playShoot() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
            
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        } catch (e) {}
    },
    
    // 僵尸死亡音效
    playZombieDeath() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.2);
            
            gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        } catch (e) {}
    },
    
    // 拾取经验/金币音效
    playPickup() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.08);
            
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.08);
        } catch (e) {}
    },
    
    // 升级音效
    playLevelUp() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.value = freq;
                
                const startTime = this.ctx.currentTime + i * 0.1;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
                
                osc.connect(gain);
                gain.connect(this.sfxGain);
                
                osc.start(startTime);
                osc.stop(startTime + 0.3);
            });
        } catch (e) {}
    },
    
    // 受伤音效
    playHurt() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);
            
            gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
            
            osc.connect(gain);
            gain.connect(this.sfxGain);
            
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        } catch (e) {}
    },
    
    // 游戏结束音效
    playGameOver() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const notes = [392, 349.23, 329.63, 261.63]; // G4, F4, E4, C4
            
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.value = freq;
                
                const startTime = this.ctx.currentTime + i * 0.2;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
                
                osc.connect(gain);
                gain.connect(this.sfxGain);
                
                osc.start(startTime);
                osc.stop(startTime + 0.4);
            });
        } catch (e) {}
    },
    
    // 通关胜利音效
    playVictory() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50]; // C5, E5, G5, C6, G5, C6
            
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.value = freq;
                
                const startTime = this.ctx.currentTime + i * 0.12;
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.25, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.35);
                
                osc.connect(gain);
                gain.connect(this.sfxGain);
                
                osc.start(startTime);
                osc.stop(startTime + 0.35);
            });
        } catch (e) {}
    },
    
    // 炸弹爆炸音效（合成：浑厚低频轰鸣 + 超低频 sub + 拉长尾音，降低尖锐）
    playBombExplosion() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            const ctx = this.ctx;
            const now = ctx.currentTime;
            // 走独立高增益总线（仍受静音控制），比其它 sfx 更有冲击力
            const boomBus = ctx.createGain();
            boomBus.gain.value = 0.55;
            boomBus.connect(ctx.destination);

            const useNoise = typeof ctx.createBuffer === 'function' && typeof ctx.createBufferSource === 'function';

            // 1. 白噪声主体（浑厚的"轰"）：低通整体压在低频段，慢扫、长尾
            if (useNoise) {
                const dur = 1.6;
                const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                const src = ctx.createBufferSource();
                src.buffer = buf;
                const lp = ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(1100, now);            // 起始更低，减少尖锐
                lp.frequency.exponentialRampToValueAtTime(70, now + 1.4);  // 扫到很低频，更浑厚
                lp.Q.value = 0.9;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.8, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 1.6);
                src.connect(lp); lp.connect(g); g.connect(boomBus);
                src.start(now); src.stop(now + dur);
            } else {
                // 降级：振荡器近似低频轰鸣
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(80, now);
                osc.frequency.exponentialRampToValueAtTime(26, now + 0.7);
                g.gain.setValueAtTime(0.8, now);
                g.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
                osc.connect(g); g.connect(boomBus);
                osc.start(now); osc.stop(now + 0.8);
            }

            // 2. 低频 thump（身体冲击感，拉长衰减更厚）
            const thump = ctx.createOscillator();
            const tg = ctx.createGain();
            thump.type = 'sine';
            thump.frequency.setValueAtTime(130, now);
            thump.frequency.exponentialRampToValueAtTime(35, now + 0.6);
            tg.gain.setValueAtTime(0.9, now);
            tg.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
            thump.connect(tg); tg.connect(boomBus);
            thump.start(now); thump.stop(now + 0.7);

            // 3. 超低频 sub（浑厚核心，长尾"嗡"）
            const sub = ctx.createOscillator();
            const sg = ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(70, now);
            sub.frequency.exponentialRampToValueAtTime(28, now + 0.9);
            sg.gain.setValueAtTime(0.78, now);
            sg.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
            sub.connect(sg); sg.connect(boomBus);
            sub.start(now); sub.stop(now + 1.0);

            // 4. 中频碎片层（削弱、降低中心频率，减少尖锐）
            if (useNoise) {
                const cdur = 0.25;
                const cbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * cdur), ctx.sampleRate);
                const cd = cbuf.getChannelData(0);
                for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cd.length);
                const csrc = ctx.createBufferSource();
                csrc.buffer = cbuf;
                const bp = ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 700;     // 从 1400 降到 700，更闷
                bp.Q.value = 0.5;
                const cg = ctx.createGain();
                cg.gain.setValueAtTime(0.18, now);   // 从 0.4 降到 0.18，明显减弱尖锐
                cg.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                csrc.connect(bp); bp.connect(cg); cg.connect(boomBus);
                csrc.start(now); csrc.stop(now + cdur);
            }
        } catch (e) {}
    },
    
    // 背景音乐
    startBGM() {
        if (!this.ctx || this.isMuted || !musicEnabled) return;
        this.stopBGM();
        try {
            // 简单的低音循环
            const bassNotes = [65.41, 82.41, 73.42, 87.31]; // C2, E2, D2, F2
            let noteIndex = 0;
            
            const playBassNote = () => {
                if (this.isMuted || !musicEnabled) return;
                
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.value = bassNotes[noteIndex];
                
                gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
                
                osc.connect(gain);
                gain.connect(this.bgmGain);
                
                osc.start();
                osc.stop(this.ctx.currentTime + 0.4);
                
                noteIndex = (noteIndex + 1) % bassNotes.length;
            };
            
            // 每秒播放一个低音
            this.bgmInterval = setInterval(playBassNote, 500);
            playBassNote();
            
            // 添加氛围音效
            this.playAmbient();
        } catch (e) {}
    },
    
    // 氛围音效
    playAmbient() {
        if (!this.ctx || this.isMuted || !musicEnabled) return;
        try {
            const createDrone = (freq) => {
                const osc = this.ctx.createOscillator();
                const filter = this.ctx.createBiquadFilter();
                const gain = this.ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.value = freq;
                
                filter.type = 'lowpass';
                filter.frequency.value = 200;
                filter.Q.value = 1;
                
                gain.gain.value = 0.03;
                
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.bgmGain);
                
                osc.start();
                this.bgmOscillators.push(osc);
            };
            
            createDrone(55);    // A1
            createDrone(82.41); // E2
        } catch (e) {}
    },
    
    // 停止背景音乐
    stopBGM() {
        if (this.bgmInterval) {
            clearInterval(this.bgmInterval);
            this.bgmInterval = null;
        }
        this.bgmOscillators.forEach(osc => {
            try { osc.stop(); } catch(e) {}
        });
        this.bgmOscillators = [];
    },
    
    // 切换静音
    toggleMute() {
        this.isMuted = !this.isMuted;
        soundEnabled = !this.isMuted;
        if (this.isMuted) {
            this.stopBGM();
            if (this.bgmGain) this.bgmGain.gain.value = 0;
            if (this.sfxGain) this.sfxGain.gain.value = 0;
        } else {
            if (this.bgmGain) this.bgmGain.gain.value = 0.15;
            if (this.sfxGain) this.sfxGain.gain.value = 0.3;
            if (gameRunning && musicEnabled) this.startBGM();
        }
        return this.isMuted;
    }
};

// ==================== 内嵌小游戏音效播放器 ====================
// 与主游戏 AudioSystem 一致，全部用 Web Audio 实时合成（振荡器 + 噪声），不占用主包体积。
// 13 个内嵌小游戏共用这套反馈音效；受全局 soundEnabled / AudioSystem.isMuted 控制。
const MiniGameAudio = {
    // 复用主游戏 AudioSystem 的音频上下文与总线，避免多建 AudioContext（微信有数量限制）
    _ctx() {
        if (typeof AudioSystem !== 'undefined') {
            if (AudioSystem.ctx) return AudioSystem.ctx;
            if (AudioSystem.init) { AudioSystem.init(); return AudioSystem.ctx; }
        }
        return null;
    },
    _dest(ctx) {
        if (typeof AudioSystem !== 'undefined' && AudioSystem.sfxGain) return AudioSystem.sfxGain;
        return ctx.destination;
    },
    // 基础音色：振荡器扫频 + 包络（delay 用于多音序列的精确排程）
    _tone(type, f0, f1, dur, vol, delay) {
        const ctx = this._ctx(); if (!ctx) return;
        const dest = this._dest(ctx);
        const t0 = ctx.currentTime + (delay || 0);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(dest);
        osc.start(t0); osc.stop(t0 + dur + 0.03);
    },
    // 噪声爆裂：可带滤波扫频（delay 用于排程）
    _noise(dur, vol, filterType, f0, f1, delay) {
        const ctx = this._ctx(); if (!ctx) return;
        const dest = this._dest(ctx);
        const t0 = ctx.currentTime + (delay || 0);
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        let node = src;
        if (filterType) {
            const flt = ctx.createBiquadFilter();
            flt.type = filterType;
            flt.frequency.setValueAtTime(f0, t0);
            if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
            src.connect(flt); node = flt;
        }
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        node.connect(g); g.connect(dest);
        src.start(t0); src.stop(t0 + dur + 0.03);
    },
    // 13 个语义音效：name -> 合成函数（与主游戏风格统一）
    _fx: {
        slide:   function (m) { m._noise(0.25, 0.22, 'bandpass', 1800, 400); },                 // 滑动/连线：带通噪声扫频"嗖"
        merge:   function (m) { m._tone('square', 440, 660, 0.08, 0.16, 0); m._tone('square', 660, 880, 0.08, 0.16, 0.07); }, // 合并：两声上行 blip
        slash:   function (m) { m._noise(0.18, 0.30, 'highpass', 2000, 1200); },                 // 切水果：高通噪声短爆裂
        jump:    function (m) { m._tone('sine', 300, 600, 0.18, 0.22); },                        // 跳/落子：正弦上扫
        flap:    function (m) { m._noise(0.07, 0.22, 'lowpass', 1200, 600); },                  // 振翅：低通噪声轻 tick
        correct: function (m) { m._tone('sine', 660, 990, 0.10, 0.18, 0); m._tone('sine', 990, 1320, 0.12, 0.18, 0.09); }, // 找对：双音上行
        wrong:   function (m) { m._tone('sawtooth', 160, 110, 0.22, 0.25); },                   // 找错：低沉锯齿
        hit:     function (m) { m._tone('square', 500, 200, 0.06, 0.18); },                     // 命中：方波短促
        coin:    function (m) { m._tone('square', 987.77, 987.77, 0.07, 0.14, 0); m._tone('square', 1318.51, 1318.51, 0.12, 0.14, 0.07); }, // 数钱：经典双音
        place:   function (m) { m._tone('sine', 200, 80, 0.15, 0.25); },                       // 放石头：低频闷响
        shoot:   function (m) { m._tone('sawtooth', 700, 150, 0.12, 0.20); m._noise(0.10, 0.12, 'highpass', 1500, 800); }, // 射出：锯齿下扫 + 噪声
        win:     function (m) { const n = [523.25, 659.25, 783.99, 1046.5]; n.forEach(function (f, i) { m._tone('sine', f, f, 0.14, 0.16, i * 0.09); }); }, // 胜利：上行琶音
        lose:    function (m) { m._tone('sawtooth', 400, 120, 0.50, 0.25); }                    // 失败：锯齿下行长音
    },
    play(name) {
        if (typeof soundEnabled !== 'undefined' && !soundEnabled) return;
        if (typeof AudioSystem !== 'undefined' && AudioSystem.isMuted) return;
        const fn = this._fx[name];
        if (typeof fn === 'function') {
            try {
                const ctx = this._ctx();
                if (ctx && ctx.state === 'suspended') ctx.resume();
                fn(this);
            } catch (e) {}
        }
    }
};

// ==================== 玩家 ====================
const player = {
    x: screenWidth / 2,
    y: screenHeight - 80,
    radius: 22,
    maxHealth: WALL_MAX_HEALTH,
    health: WALL_MAX_HEALTH,
    exp: 0,
    level: 1,
    expToLevel: 50,
    gold: 0,
    diamond: 0,  // 钻石
    kills: 0,
    damage: 10,
    fireRate: 500,
    lastShot: 0,
    bulletSpeed: 10,
    bulletPiercing: 1,
    bulletCount: 1,
    gunAngle: -Math.PI / 2,
    hurtTime: 0
};

// ==================== 技能系统 ====================
// 技能主注册表（单一数据源）：每个技能声明 系别(element)/类别(category)/软上限(maxLevel)/描述/升级效果(apply)
// 运行时仅保留 skills[type].level；category: bullet=弹道, buff=增益, field=战场部署, cc=控场
const SKILL_DEFS = {
    damage:     { type:'damage',     name:'火力强化', icon:'🔫', element:'物理', category:'bullet', maxLevel:99, desc:'伤害 +14%',     apply(lv){ player.damage *= 1.14; },
                  // 大类分支树：选分支 = 火力强化继续升级（不占新槽）；reqLevel 解锁，prereq 前置，mutex 互斥不进池
                  // 分支可反复升级（branches[bid] 存整数等级，至 maxLevel 止）；图标沿用大类 icon（🔫），不另设
                  // 数值平衡（以 L20 极限为基准，逐级穷举）：三条进攻分支每级 DPS 倍率(dmgMul/fireMul) 收敛到同一曲线 ≈1+0.25*bl，
                  // 故无论走哪条路径，火力强化的总强度基本一致；穿甲(对坦克/Boss)、后坐力、弹道校准为情境向增益，强度同量级。
                  // 基础增幅 +14%/级（原 +12%）：爆炸弹主键不随自身等级增长、且半径随等级涨到 ~440px，
                  // 在「稍有聚集」时就反超火力强化；提至 14% 把 crossover 推到「密集群才反超」，还原火力强化=单体/Boss、爆炸弹=群伤的定位。
                  branches: {
                    heavyBarrel: { name:'重型枪管', desc:'子弹体型+20%/级、伤害+20%/级、射速-3%/级', reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                   effect(bl,m){ m.radiusMul *= Math.pow(1.20, bl); m.dmgMul *= Math.pow(1.20, bl); m.fireMul *= Math.pow(1.03, bl); } },
                    rapidFire:   { name:'狂暴连射', desc:'射速+22%/级，每发伤害-4%/级',             reqLevel:8, prereq:[], mutex:['charge'], maxLevel:5,
                                   effect(bl,m){ m.fireMul *= Math.pow(0.82, bl); m.dmgMul *= Math.pow(0.96, bl); } },
                    charge:      { name:'蓄能射击', desc:'射速-13%/级，命中伤害+35%/级',            reqLevel:8, prereq:[], mutex:['rapidFire'], maxLevel:5,
                                   effect(bl,m){ m.fireMul *= Math.pow(1.147, bl); m.dmgMul *= Math.pow(1.35, bl); } },
                    armorPierce: { name:'穿甲弹头', desc:'对坦克/Boss额外+30%/级伤害',               reqLevel:11, prereq:['heavyBarrel'], mutex:[], maxLevel:5,
                                   effect(bl,m){ m.armorBonus += 0.30*bl; } },
                    knockback:   { name:'后坐力',   desc:'命中击退敌人（力度随等级）',               reqLevel:14, prereq:[], mutex:[], maxLevel:5,
                                   effect(bl,m){ m.knock = true; m.knockF = 15*bl; } },
                    calibration: { name:'弹道校准', desc:'命中判定半径+18%/级',                      reqLevel:17, prereq:[], mutex:[], maxLevel:5,
                                   effect(bl,m){ m.hitboxMul *= Math.pow(1.18, bl); } }
                  } },
    health:     { type:'health',     name:'生命强化', icon:'❤️', element:'物理', category:'buff',   maxLevel:99, desc:'生命 +20',       apply(lv){ player.maxHealth += 20; player.health = Math.min(player.health + 20, player.maxHealth); },
                  qualNodes:{ 3:{ desc:'每级额外生命 +10', apply(){ player.maxHealth += 10; player.health += 10; } } } },
    explosive:  { type:'explosive',  name:'爆炸弹',   icon:'💥', element:'火',   category:'bullet', maxLevel:99, desc:'命中产生范围爆炸', apply(lv){},
                  // 大类分支树：选分支 = 爆炸弹继续升级（不占新槽）；reqLevel 解锁，prereq 前置，mutex 互斥不进池
                  // 分支可反复升级（branches[bid] 存整数等级，至 maxLevel 止）；图标沿用大类 icon（💥），不另设
                  // 互斥规则：互斥的两分支必须处于同一 reqLevel（出现的等级不能有先后），供玩家在同一档二选一
                  // 参考《向僵尸开炮》温压弹：增伤 / 破甲 / 引燃·焚身燃烧链；火属性树（属性树之一）
                  // 温压冲击(击退)因强度过高且不适合本游戏，已重设计为「破甲」（爆炸使敌人受伤增加，纯数值增益、不干扰走位）
                  // 阶段二：已把多重/暴击/穿透/高速等通用效果以"共享分支模板"移入此树，
                  // 即 multiShot/highSpeed/crit/pierce 四个分支——后续五行属性树（金木水火土）将复用同名结构，
                  // 实现「基础(火力强化) + 属性(五行)」架构。慢速/冻结效果暂不在此树，留待水（冰）属性树。
                  branches: {
                    // —— 通用「属性树共享模板」分支（火树先行；冰/雷/毒树后续复用同名结构）——
                    multiShot:  { name:'多重爆裂', desc:'每级额外 +1 发子弹（满级共+3，单发伤害衰减）', reqLevel:5, prereq:[], mutex:[], maxLevel:3,
                                  effect(bl,m){ m.bulletCountBoost += bl; } },
                    highSpeed:  { name:'急速冷却', desc:'技能释放 cd 缩短 +8%/级',               reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.cdReduce = (m.cdReduce || 0) + 0.08 * bl; } },
                    crit:       { name:'火焰暴击', desc:'暴击率+5%/级、暴击伤害+15%/级；满级暴击触发小爆炸', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.critChanceBoost += 0.05 * bl; m.critDamageBoost += 0.15 * bl; if (bl >= 5) m.critExplode = true; } },
                    pierce:     { name:'烈焰穿透', desc:'穿透 +1/级；满级命中溅射',            reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.pierceBoost += bl; if (bl >= 5) m.pierceSplash = true; } },
                    // —— 火属性专属分支 ——
                    // 注：爆炸弹基础等级已随等级扩大爆炸范围（explosionRadius = (40+level*20)），故不另设纯范围分支，避免与原始效果重复
                    // 富燃料填充 / 热能爆炸 二者互斥、同档(reqLevel 2)二选一：群伤增伤 vs 单体高伤+范围缩小
                    // 破甲 / 引燃 二者互斥、同档(reqLevel 4)二选一：爆发增幅路线 vs 灼伤链路线（引燃可继续点焚身 Lv5）
                    fuelFill:   { name:'富燃料填充', desc:'爆炸伤害+20%/级',                 reqLevel:5, prereq:[], mutex:['thermalExplode'], maxLevel:5,
                                  effect(bl,m){ m.explDmgMul *= Math.pow(1.20, bl); } },
                    thermalExplode:{ name:'热能爆炸', desc:'爆炸伤害+38%/级，范围明显缩小',    reqLevel:5, prereq:[], mutex:['fuelFill'], maxLevel:5,
                                  effect(bl,m){ m.explDmgMul *= Math.pow(1.38, bl); m.explRadiusCut += 40 * bl; } },
                    // 破甲 / 引燃 同档(Lv4)互斥二选一：爆发增幅路线 vs 灼伤链路线（引燃可继续点焚身 Lv5 走完灼烧链；破甲走爆发增幅）
                    armorBreak: { name:'破甲',       desc:'爆炸使范围内敌人受伤+8%/级',        reqLevel:11, prereq:[], mutex:['ignite'], maxLevel:5,
                                  effect(bl,m){ m.explArmorBreak = true; m.armorBreakF += 0.08 * bl; } },
                    ignite:     { name:'引燃',       desc:'灼烧伤害+20%/级（只增伤不延时长）', reqLevel:11, prereq:[], mutex:['armorBreak'], maxLevel:5,
                                  effect(bl,m){ m.explIgnite = true; m.burnDmgMul *= Math.pow(1.20, bl); } },
                    incinerate: { name:'焚身',       desc:'对引燃目标追加3%最大生命伤害/级', reqLevel:14, prereq:['ignite'], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.explIncinerate += bl; } }
                  } },
    lightning:  { type:'lightning',  name:'闪电链',   icon:'⚡', element:'金',   category:'bullet', maxLevel:99, desc:'命中弹射/麻痹/电伤领域',
                  // 金属性树（对应五行中的金）：玩法参考《向僵尸开炮》跃迁电子，命名为「闪电链」；弹射、导电、麻痹、电伤领域
                  apply(lv){},
                  branches: {
                    // —— 通用「属性树共享模板」（与火/水树同名同结构）——
                    multiShot:  { name:'多重电子', desc:'每级额外 +1 发子弹（满级共+3，单发伤害衰减）', reqLevel:5, prereq:[], mutex:[], maxLevel:3,
                                  effect(bl,m){ m.bulletCountBoost += bl; } },
                    highSpeed:  { name:'急速冷却', desc:'技能释放 cd 缩短 +8%/级',               reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.cdReduce = (m.cdReduce || 0) + 0.08 * bl; } },
                    crit:       { name:'雷霆暴击', desc:'暴击率+5%/级、暴击伤害+15%/级（雷霆一击的前置）', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.critChanceBoost += 0.05 * bl; m.critDamageBoost += 0.15 * bl; } },
                    pierce:     { name:'电子穿透', desc:'穿透 +1/级；满级命中溅射电火花',    reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.pierceBoost += bl; if (bl >= 5) m.pierceSpark = true; } },
                    // —— 金专属分支 ——
                    // 链式传导 / 高压电弧 同档(Lv2)互斥：多目标路线 vs 高伤远程路线
                    chainConduct:{ name:'链式传导', desc:'弹射目标 +1/级',                   reqLevel:5, prereq:[], mutex:['highVoltage'], maxLevel:5,
                                  effect(bl,m){ m.chainCountBoost += bl; } },
                    highVoltage:{ name:'高压电弧', desc:'弹射伤害 +20%/级，弹射距离 +8/级', reqLevel:5, prereq:[], mutex:['chainConduct'], maxLevel:5,
                                  effect(bl,m){ m.chainDmgMul *= Math.pow(1.20, bl); m.chainRangeBoost += 8 * bl; } },
                    // 电磁脉冲 / 静电场 同档(Lv4)互斥：单体硬控路线 vs 群体领域路线
                    emp:        { name:'电磁脉冲', desc:'命中麻痹概率 +6%/级，麻痹时长 +0.1s/级', reqLevel:11, prereq:[], mutex:['staticField'], maxLevel:5,
                                  effect(bl,m){ m.empStunChance += 0.06 * bl; m.empStunDuration += 100 * bl; } },
                    staticField:{ name:'静电场',   desc:'命中 20% 生成电伤领域/级（范围随等级扩大）', reqLevel:11, prereq:[], mutex:['emp'], maxLevel:5,
                                  effect(bl,m){ m.staticFieldChance += 0.20 * bl; m.staticFieldRadius = STATIC_FIELD_BASE_RADIUS + STATIC_FIELD_RADIUS_PER_LV * bl; m.staticFieldLife = STATIC_FIELD_BASE_LIFE + STATIC_FIELD_LIFE_PER_LV * bl; } },
                    // Lv5 质变：超导依赖「链式传导」分支；雷霆一击依赖「雷霆暴击」分支(key:crit) Lv1
                    // 超导与火(焚身)/水(冰爆)同为"对状态目标追加最大生命%伤害"的 Lv5 对称分支；金树以"导电"为状态钩子
                    // （导电 = 冻结/减速/麻痹），故金树自带电磁脉冲(麻痹)即可自闭环，无需依赖水树减速/冻结
                    superConductor:{ name:'超导', desc:'对导电(冻结/减速/麻痹)目标：弹射伤害 +20%/级、弹射次数 +1/级、追加 2% 最大生命伤害/级', reqLevel:14, prereq:['chainConduct'], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.superConductorDmgMul += 0.20 * bl; m.superConductorCountBoost += bl; m.superConductorMaxHp += 0.02 * bl; } },
                    thunderStrike:{ name:'雷霆一击', desc:'暴击时 50% 召唤落雷，造成 100% 伤害', reqLevel:18, prereq:['crit'], mutex:[], maxLevel:1,
                                  effect(bl,m){ m.thunderStrike = true; } }
                  } },
    shield:     { type:'shield',     name:'护盾',     icon:'🛡️', element:'物理', category:'buff',   maxLevel:8,  desc:'减伤能力',       apply(lv){},
                  qualNodes:{ 3:{ desc:'减伤 +5%', apply(){ skills.shield._reduceBonus = 0.05; } }, 5:{ desc:'受击反弹 10%', apply(){ skills.shield._reflect = true; } } } },
    freeze:     { type:'freeze',     name:'干冰弹',   icon:'❄️', element:'水',   category:'bullet', maxLevel:99, desc:'命中必定减速、炸出范围冰霜；五行弹道标配基础增伤+35%（冻结由分支提供）', apply(lv){},
                  // 水属性树（由冰属性重命名为水，对应五行中的水）：参考《向僵尸开炮》干冰弹
                  // 共享模板分支与火树同名同结构；水专属分支围绕「控制锁(冻结/减速) + 冰封处决(对冻结追最大生命%) + 冰霜新星(范围必冻爆发) + 极寒领域(冰域铺场)」
                  branches: {
                    // —— 通用「属性树共享模板」分支（与火树同名，全局叠加）——
                    multiShot:  { name:'多重干冰', desc:'每级额外 +1 发子弹（满级共+3，单发伤害衰减）', reqLevel:5, prereq:[], mutex:[], maxLevel:3,
                                  effect(bl,m){ m.bulletCountBoost += bl; } },
                    highSpeed:  { name:'急速冷却', desc:'技能释放 cd 缩短 +8%/级',               reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.cdReduce = (m.cdReduce || 0) + 0.08 * bl; } },
                    crit:       { name:'冰霜暴击', desc:'暴击率+5%/级、暴击伤害+15%/级；满级暴击触发冰霜迸发', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.critChanceBoost += 0.05 * bl; m.critDamageBoost += 0.15 * bl; if (bl >= 5) m.iceBurst = true; } },
                    pierce:     { name:'寒冰穿透', desc:'穿透 +1/级；满级命中溅射冰刺',            reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.pierceBoost += bl; if (bl >= 5) m.iceSpike = true; } },
                    // —— 水专属分支（水的特点：控制锁 · 冰封处决 · 冰域铺场 · 冰霜新星）——
                    // 冰川 / 霜寒 同档(Lv2)互斥：强化范围冰爆（群体铺场） vs 强化单体减速（控制更深）
                    glacier:    { name:'冰川',       desc:'冰霜爆炸范围 +12%/级，范围冻结概率 +8%/级', reqLevel:5, prereq:[], mutex:['frostBite'], maxLevel:5,
                                  effect(bl,m){ m.freezeRadiusBoost += 0.12 * bl; m.freezeChanceBoost += 0.08 * bl; } },
                    frostBite:  { name:'霜寒',       desc:'减速幅度 +5%/级（移动更慢）',       reqLevel:5, prereq:[], mutex:['glacier'], maxLevel:5,
                                  effect(bl,m){ m.slowFactorBoost += 0.05 * bl; } },
                    deepFreeze: { name:'深寒',       desc:'冻结持续时间 +20%/级',               reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.freezeDurationBoost += 0.20 * bl; } },
                    // 冰霜新星 / 极寒领域 同档(Lv4)互斥：爆发向（范围必冻+爆炸增伤） vs 场域向（持续冰域）
                    frostNova:  { name:'冰霜新星',   desc:'冰霜爆炸伤害+5%/级、范围+20%/级，范围内敌人概率冻结（+15%/级）', reqLevel:11, prereq:[], mutex:['polarField'], maxLevel:5,
                                  effect(bl,m){ m.frostNovaDmgMul *= Math.pow(1.05, bl); m.freezeRadiusBoost += 0.20 * bl; m.frostNovaFreezeChance += 0.15 * bl; } },
                    polarField: { name:'极寒领域',   desc:'冰弹击中敌人时，25%/级概率生成持续减速/冰冻领域', reqLevel:11, prereq:[], mutex:['frostNova'], maxLevel:5,
                                  effect(bl,m){ m.polarFieldChance += 0.25 * bl; } },
                    // Lv5 质变：冰封处决（对标火·焚身 / 金·超导）—— 对被冻结目标追加最大生命%伤害，随关卡血量膨胀放大，是单树后期核心
                    glacialDoom:{ name:'绝对零度',   desc:'对被冻结目标追加 3% 最大生命伤害/级（冰封处决）', reqLevel:14, prereq:['deepFreeze'], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.glacialDoomBonus += bl; } }
                  } },
    wood:       { type:'wood',       name:'滚木',     icon:'🪵', element:'木',   category:'bullet', maxLevel:99, desc:'从城墙底部释放滚木，竖直向上碾压路径上的敌人并造成伤害',
                  // 木属性树（对应五行中的木）：参考《向僵尸开炮》装甲车，改造为从城墙滚出的巨木
                  // 共享模板分支与火/水/金同名同结构；木专属分支围绕「生长碾压 · 藤蔓定身 · 荆棘处决 · 回弹/碎木」
                  apply(lv){},
                  branches: {
                    // —— 通用「属性树共享模板」（与火/水/金同名同结构）——
                    multiShot:  { name:'多重滚木', desc:'每级额外 +1 根滚木（满级共+3，单根伤害衰减）', reqLevel:5, prereq:[], mutex:['rapidLog'], maxLevel:3,
                                  effect(bl,m){ m.bulletCountBoost += bl; } },
                    highSpeed:  { name:'急速冷却', desc:'技能释放 cd 缩短 +8%/级',               reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.cdReduce = (m.cdReduce || 0) + 0.08 * bl; } },
                    crit:       { name:'荆棘暴击', desc:'暴击率+5%/级、暴击伤害+15%/级；满级暴击触发荆棘迸发', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.critChanceBoost += 0.05 * bl; m.critDamageBoost += 0.15 * bl; if (bl >= 5) m.thornBurst = true; } },
                    pierce:     { name:'木刺穿透', desc:'滚木粗细 +5/级；满级命中溅射木刺',     reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.pierceBoost += bl; if (bl >= 5) m.woodSpike = true; } },
                    // —— 木专属分支 ——
                    // 巨木 / 连发滚木 同档(Lv2)互斥：少而宽+重伤害 vs 多而窄+覆盖面
                    giantLog:   { name:'巨木',       desc:'滚木宽度+12%/级、伤害+12%/级（向 1/2 城墙宽度成长）', reqLevel:5, prereq:[], mutex:['rapidLog'], maxLevel:5,
                                  effect(bl,m){ m.logWidthMul *= Math.pow(1.12, bl); m.logDmgMul *= Math.pow(1.12, bl); } },
                    rapidLog:   { name:'连发滚木',   desc:'滚木数量+1/级（与多重滚木二选一，单根伤害随数量衰减）', reqLevel:5, prereq:[], mutex:['giantLog','multiShot'], maxLevel:5,
                                  effect(bl,m){ m.logCountBoost += bl; } },
                    // 深根：木系硬控（定身 = stun），也是 Lv5 绞杀藤蔓的状态钩子
                    deepRoot:   { name:'深根',       desc:'滚木命中 20%/级 概率使敌人定身 0.4s+0.1s/级', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.rootChance += 0.20 * bl; m.rootDuration += 400 + 100 * bl; } },
                    // 回弹 / 碎木飞溅 同档(Lv4)互斥：二次 passage vs 消失 AoE
                    rebound:    { name:'回弹',       desc:'滚木到达顶端后回弹一次，回弹伤害+20%/级', reqLevel:11, prereq:[], mutex:['splinter'], maxLevel:5,
                                  effect(bl,m){ m.rebound = true; m.reboundDmgMul *= Math.pow(1.20, bl); } },
                    splinter:   { name:'碎木飞溅',   desc:'滚动途中 30%/级 概率炸裂（一路碾压一路爆炸，不消失），对周围敌人造成伤害', reqLevel:11, prereq:[], mutex:['rebound'], maxLevel:5,
                                  effect(bl,m){ m.splinterChance += 0.30 * bl; m.splinterDmgMul *= Math.pow(1.15, bl); } },
                    // Lv5 质变：绞杀藤蔓（对标火·焚身 / 水·绝对零度 / 金·超导）—— 对被定身目标追加最大生命%伤害
                    strangleVine:{ name:'绞杀藤蔓',  desc:'对被定身目标追加 3% 最大生命伤害/级', reqLevel:14, prereq:['deepRoot'], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.strangleVineBonus += bl; } }
                  } },
    earth:      { type:'earth',      name:'地刺',     icon:'🪨', element:'土',   category:'field',  maxLevel:99, desc:'在战场上生成地刺簇，持续伤害周围敌人并概率留下岩盾阻挡敌人',
                  // 土属性树（对应五行中的土）：参考《向僵尸开炮》冰暴发生器，把冰主题改为土主题；
                  // 核心机制：① 地刺直接在战场目标点生成（不从坦克发射），停留一段时间后消失；② 岩盾（临时屏障挡敌人路径、有血量、会被攻击）。
                  apply(lv){},
                  branches: {
                    // —— 通用「属性树共享模板」（与火/水/金/木同名同结构）——
                    multiShot:  { name:'多重地刺', desc:'每级额外 +1 簇地刺（满级共+3，单簇伤害衰减）', reqLevel:5, prereq:[], mutex:[], maxLevel:3,
                                  effect(bl,m){ m.bulletCountBoost += bl; } },
                    highSpeed:  { name:'急速冷却', desc:'技能释放 cd 缩短 +8%/级',               reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.cdReduce = (m.cdReduce || 0) + 0.08 * bl; } },
                    crit:       { name:'岩心暴击', desc:'暴击率+5%/级、暴击伤害+15%/级；满级暴击触发碎岩迸发', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.critChanceBoost += 0.05 * bl; m.critDamageBoost += 0.15 * bl; if (bl >= 5) m.rockBurst = true; } },
                    pierce:     { name:'地刺贯穿', desc:'地刺伤害范围+8%/级；满级命中溅射岩片', reqLevel:8, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.earthHitRadiusMul *= Math.pow(1.08, bl); if (bl >= 5) m.rockShard = true; } },
                    // —— 土专属分支 ——
                    // 裂地穿刺：强化地刺每跳伤害与视觉高度（土系输出核心）
                    fissure:    { name:'裂地穿刺', desc:'地刺伤害+20%/级，地刺高度+10%/级',       reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.fissureDmgMul *= Math.pow(1.20, bl); m.earthLineLengthMul *= Math.pow(1.10, bl); } },
                    // 岩盾：命中概率留下临时屏障，阻挡并承受敌人攻击（土系防御核心）
                    rockShield: { name:'岩盾',       desc:'命中 20%/级 概率留下岩盾（持续 3s，可阻挡并承受敌人攻击）', reqLevel:5, prereq:[], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.shieldChance += 0.20 * bl; m.shieldHpMul *= Math.pow(1.25, bl); m.shieldDuration += 800 * bl; m.shieldWidthMul *= Math.pow(1.08, bl); } },
                    // 震地 / 陷坑 同档(Lv3)互斥：爆发硬控路线 vs 聚怪控制路线
                    quake:      { name:'震地',       desc:'命中 25%/级 概率引发震地，范围伤害+5%/级并眩晕 0.15s/级', reqLevel:8, prereq:[], mutex:['sinkhole'], maxLevel:5,
                                  effect(bl,m){ m.quakeChance += 0.25 * bl; m.quakeDmgMul *= Math.pow(1.05, bl); m.quakeRadius += 4 * bl; m.quakeStunDur += 150 * bl; } },
                    sinkhole:   { name:'陷坑',       desc:'命中 25%/级 概率产生陷坑，将周围敌人向命中点牵引', reqLevel:8, prereq:[], mutex:['quake'], maxLevel:5,
                                  effect(bl,m){ m.sinkholeChance += 0.25 * bl; m.sinkholeRadius += 5 * bl; m.sinkholePull += 25 * bl; } },
                    // 石化 / 碎甲 同档(Lv4)互斥：硬控路线 vs 爆发增幅路线（石化可继续点山崩 Lv5）
                    petrify:    { name:'石化',       desc:'命中 12%/级 概率石化（眩晕）敌人 0.25s/级', reqLevel:11, prereq:[], mutex:['armorCrush'], maxLevel:5,
                                  effect(bl,m){ m.petrifyChance += 0.12 * bl; m.petrifyDuration += 250 * bl; } },
                    armorCrush: { name:'碎甲',       desc:'被地刺命中的敌人受伤+2%/级',            reqLevel:11, prereq:[], mutex:['petrify'], maxLevel:5,
                                  effect(bl,m){ m.armorCrush = true; m.armorCrushF += 0.02 * bl; } },
                    // Lv5 质变：山崩（对标火·焚身 / 水·绝对零度 / 金·超导）—— 对被石化目标追加最大生命%伤害
                    landslide:  { name:'山崩',       desc:'对石化目标追加 3% 最大生命伤害/级',     reqLevel:14, prereq:['petrify'], mutex:[], maxLevel:5,
                                  effect(bl,m){ m.landslideBonus += bl; } }
                  } },
    // 注：战场部署 / 聚怪类（地雷 · 油渍 · 龙卷风）已于 v1.1.16 移除，待五行技能树（含土 / 木）补全后再评估是否回归。
};

// 运行时技能实例（仅 level 可变，其余元数据来自 SKILL_DEFS）
const skills = {};
for (const _t in SKILL_DEFS) {
    const _d = SKILL_DEFS[_t];
    skills[_t] = { level: 0, name: _d.name, icon: _d.icon, desc: _d.desc, element: _d.element, category: _d.category, maxLevel: _d.maxLevel };
}

const MAX_SKILLS = 6;          // damage + 火/水/金/木/土 五属性树，共 6 槽
let acquiredSkills = ['damage'];

// 灼烧(引燃/油渍)的固定持续时长（毫秒）：引燃只增伤不延长，故为常量
const BURN_DURATION = 1500;

// ==================== 游戏对象 ====================
let bullets = [];
let zombies = [];
let particles = [];
let expOrbs = [];
let goldOrbs = [];
let damageNumbers = [];
let lightningEffects = [];
let bombExplosionEffects = [];
let deathRayEffects = [];           // 死亡射线特效
let hitEffects = [];                // 命中特效（暴击 / 冰冻 / 减速）
let iceFields = [];                 // 干冰弹「极寒领域」生成的持续冰霜区域
let electricFields = [];            // 闪电链「静电场」生成的持续电伤区域
let logs = [];                      // 滚木（木属性树）生成的持续向上碾压的滚木
let pendingWoodLogs = [];           // 待释放的滚木队列：错峰依次 spawn，总时长可超过 CD
let earthShields = [];              // 地刺（土属性树）岩盾：临时屏障，阻挡敌人并被攻击
let earthSpikes = [];               // 地刺（土属性树）：战场上生成的静止石钟乳簇，持续伤害后消失
let earthSinkholes = [];            // 土属性树·陷坑场地：地刺消失后生成的持续牵引坑，逐帧将敌人拉向中心
let _zombieIdSeq = 0;               // 僵尸唯一 id（滚木按 id 节流每根僵尸的碾压结算）
const MAX_ICE_FIELDS = 5;           // 同时存在的极寒领域上限（避免大量半透明领域叠加拖垮 Canvas）
const MAX_ELECTRIC_FIELDS = 5;      // 同时存在的静电场上限
const MAX_PARTICLES = 250;          // 全局粒子数上限（超出时移除最旧）
// 带上限地加入粒子池，避免爆炸/命中特效叠加时数组无限膨胀
function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
}
// 静电场（闪电链 Lv4 分支）领域参数：范围/时长随「静电场」等级小幅扩大
const STATIC_FIELD_BASE_RADIUS = 55;     // Lv1 基础半径(px)
const STATIC_FIELD_RADIUS_PER_LV = 12;   // 每级 +12(px)：Lv1≈67 → Lv5≈115
const STATIC_FIELD_BASE_LIFE = 2600;     // Lv1 基础持续(ms)
const STATIC_FIELD_LIFE_PER_LV = 200;    // 每级 +200(ms)：Lv1≈2.8s → Lv5≈3.6s
let invincibleUntil = 0;            // 不朽之身复活后的「真无敌」截止时间
const IMMORTAL_INVINCIBLE_TIME = 10000;   // 复活后无敌时长（毫秒）

// ==================== 僵尸类型 ====================
// 移动速度为 px/帧（约 60fps）。v1.1.1 起大幅下调：
// 营造「僵尸大军压境」的压迫感，给玩家充足时间体验各种技能（原速过快、来不及反应）
// 经验值与血量严格成正比（用户设计）：普通=1经验/60血，精英(tank)=2经验/120血，BOSS=4经验/240血
// → 击杀所需伤害 ∝ 经验（1:2:4）。fast 为高速脆皮（同 1 经验，血略低），不在比例关系约束内
// v1.1.4 难度重平衡：基础血量 ×1.5（总血量负载约为原版 2.25 倍；EXP_BASE 在 v1.1.6 由3降为2以缓解 lv5 前怪量过密）
const zombieTypes = {
    // 击杀金币仅作战斗手感，量级已压低，使「直线型通关奖励」成为金币获取的主导直线
    normal: { health: 60, speed: 0.5, damage: 10, radius: 22, color: '#6b8ca3', exp: 1, gold: 2 },
    fast:   { health: 38, speed: 1.2, damage: 8, radius: 18, color: '#8b7ca3', exp: 1, gold: 3 },
    tank:   { health: 120, speed: 0.35, damage: 20, radius: 30, color: '#5a6a8a', exp: 2, gold: 5 },
    boss:   { health: 240, speed: 0.3, damage: 30, radius: 42, color: '#8b4a5a', exp: 4, gold: 15 }
};

// ==================== 升级选项 ====================
// 三选一池由 SKILL_DEFS 派生；攻击性技能架构 = 基础(火力强化) + 属性(五行：金木水火土)，故已删除独立的多重射击/高速子弹/穿透弹/致命暴击/缓速弹/油渍（其效果以"共享分支模板"并入各属性树分支）
const upgradePool = Object.keys(SKILL_DEFS).map(type => ({
    type: type,
    name: SKILL_DEFS[type].name,
    icon: SKILL_DEFS[type].icon,
    desc: SKILL_DEFS[type].desc
}));

let upgradeOptions = [];
let selectedUpgrade = -1;

// （v1.1.16）战场部署 / 聚怪类（地雷·油渍·龙卷风）及其常量、状态数组、辅助函数已移除；五行领域状态见上方 iceFields / electricFields。

// ==================== 弹药效果统一结算 ====================
// 天赋提供长线基础值（每级小幅），局内三选一技能提供当场高成长值（每级大幅），二者相加后封顶。
// 所有子弹相关效果都必须走这里，保证「天赋」与「三选一」表现完全一致。
function getCritChance(mods) {
    // 致命暴击独立技能已移除；暴击率 = 天赋基础值 + 属性树「暴击」分支加成（按子弹自身 skillType 取，不全局叠加）
    mods = mods || attributeMods();
    return Math.min(0.6, talentMods.critChance + (mods.critChanceBoost || 0));
}
function getCritMult(mods) {
    // 致命暴击独立技能已移除；暴击伤害倍率 = 天赋基础值 + 属性树「暴击」分支加成（按子弹自身 skillType 取）
    mods = mods || attributeMods();
    return talentMods.critDamageMult + (mods.critDamageBoost || 0);
}
function getEffBulletCount(mods)   { mods = mods || attributeMods(); return player.bulletCount + (mods.bulletCountBoost || 0); }
function getEffBulletSpeed(mods)   { mods = mods || attributeMods(); return player.bulletSpeed * (mods.speedMul || 1); }
function getEffBulletPiercing(mods){ mods = mods || attributeMods(); return player.bulletPiercing + (mods.pierceBoost || 0); }

// 各属性树独立修正的便捷访问
function explosiveMods() {
    return (skills.explosive && skills.explosive._mods) ? skills.explosive._mods
        : { explDmgMul: 1, explRadiusCut: 0, explArmorBreak: false, armorBreakF: 0, explIgnite: false, burnDmgMul: 1, explIncinerate: 0,
            bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, critExplode: false, pierceBoost: 0, pierceSplash: false };
}
function freezeMods() {
    return (skills.freeze && skills.freeze._mods) ? skills.freeze._mods
        : { bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, iceBurst: false, pierceBoost: 0, iceSpike: false,
            freezeChanceBoost: 0, freezeRadiusBoost: 0, slowFactorBoost: 0, freezeDurationBoost: 0, polarFieldChance: 0, frostNovaDmgMul: 1, frostNovaFreezeChance: 0, glacialDoomBonus: 0 };
}
function lightningMods() {
    return (skills.lightning && skills.lightning._mods) ? skills.lightning._mods
    : { bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0, pierceSpark: false,
        chainCountBoost: 0, chainDmgMul: 1, chainRangeBoost: 0,
        empStunChance: 0, empStunDuration: 0, staticFieldChance: 0, staticFieldRadius: STATIC_FIELD_BASE_RADIUS, staticFieldLife: STATIC_FIELD_BASE_LIFE,
        superConductorDmgMul: 0, superConductorCountBoost: 0, superConductorMaxHp: 0, thunderStrike: false };
}
function woodMods() {
    return (skills.wood && skills.wood._mods) ? skills.wood._mods
    : { bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0, woodSpike: false, cdReduce: 0, canSplit: false,
        logWidthMul: 1, logDmgMul: 1, logCountBoost: 0,
        rootChance: 0, rootDuration: 0,
        rebound: false, reboundDmgMul: 1,
        splinterChance: 0, splinterDmgMul: 1,
        strangleVineBonus: 0, thornBurst: false };
}
function earthMods() {
    return (skills.earth && skills.earth._mods) ? skills.earth._mods
    : { bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0, rockBurst: false, cdReduce: 0, canSplit: false, rockShard: false,
        fissureDmgMul: 1, earthLineLengthMul: 1, earthHitRadiusMul: 1,
        shieldChance: 0, shieldHpMul: 1, shieldDuration: 0, shieldWidthMul: 1,
        quakeChance: 0, quakeDmgMul: 1, quakeRadius: 0, quakeStunDur: 0,
        sinkholeChance: 0, sinkholeRadius: 0, sinkholePull: 0,
        petrifyChance: 0, petrifyDuration: 0,
        armorCrush: false, armorCrushF: 0,
        landslideBonus: 0 };
}

// ==================== 属性技能独立释放 CD（不受火力强化射速影响）====================
// 每个「子弹类」属性技能（爆炸/干冰/闪电链）按自身 cd 独立释放子弹；
// cd 初始较长，随技能等级与自身「疾速弹道」分支降低，完全不受火力强化 fireRate 影响。
// 各属性技能「独立释放 cd」配置：base=初始(最长)，min=下限(最短)，step=每级缩短(ms)
// 按用户要求：最长可达 10 秒(干冰弹)，最短可到 3 秒(闪电链/爆炸弹)，各属性互不相同
const ATTR_CD_CFG = {
    explosive: { base: 6000,  min: 3000, step: 100 },   // 火：6s → 3s
    freeze:    { base: 6000,  min: 3000, step: 150 },   // 水：6s → 3s（原 10s→4s 过长，单树冰撑不起主输出；改为与火同档）
    lightning: { base: 4000,  min: 3000, step: 50 },    // 金：4s → 3s（最短）
    wood:      { base: 6500,  min: 3500, step: 120 },   // 木：6.5s → 3.5s（滚木为线型 AoE，略长 CD 平衡厚重碾压）
    earth:     { base: 5000,  min: 3000, step: 80 }     // 土：5s → 3s（穿透+盾牌综合，CD 居中）
};
// 子弹类属性技能列表：按自身 cd 释放，与基础武器（火力强化）完全独立
const ATTRIBUTE_BULLET_TYPES = ['explosive', 'freeze', 'lightning', 'wood', 'earth'];
// 属性子弹相对普通子弹的「默认」参数：飞得更慢、个头更大（普通子弹 radius=6、speed=player.bulletSpeed）
const ATTR_BULLET_BASE_RADIUS = 11;   // 明显大于普通子弹(6)
const ATTR_BULLET_SPEED_MUL   = 0.7;  // 默认飞行速度 = 普通子弹的 70%（属性技能不再提速子弹，释放 cd 缩短由「急速冷却」分支负责）
// 多重弹每多发 1 颗子弹，单发伤害按此系数衰减（分母随额外子弹数线性增长）
// 例：多发 5 颗(共 6 发) → 单发伤害 ×(1/1.75≈0.57)，总伤 ≈ 单发×3.43（旧每2级+1上限+2、总伤≈×3.0）
const MULTI_BULLET_DMG_PENALTY = 0.15;
// 五行弹道标配基础伤害倍率：五行技能（非物理火力强化）基础直伤 +35%，作为五行压制的一部分；
// 原仅干冰弹独有，v1.1.16 起成为所有五行弹道的标配（火/金/水/木/土 一致）。
const ATTR_BASE_DMG_MUL = 1.35;
// 滚木（木属性树）参数：基础宽度占城墙宽 1/4，由「巨木」分支向 1/2 成长；厚重慢速、碾压间隔控制 DPS
const WOOD_LOG_BASE_WIDTH_RATIO = 0.25;   // 滚木基础宽度占城墙宽度比例
const WOOD_LOG_SPEED_MUL = 0.30;          // 滚木速度为属性子弹的 30%（厚重缓滚，明显比原 0.55 慢）
const WOOD_LOG_THICKNESS = 28;            // 滚木厚度(px)：视觉上是左右展开的圆柱直径，要小，不能粗
const WOOD_LOG_RELEASE_INTERVAL = 260;    // 多重滚木错峰释放间隔(ms)，总时长可超过 CD
const WOOD_LOG_HIT_INTERVAL = 280;        // 同一僵尸被同一根滚木碾压的间隔(ms)
const WOOD_LOG_DMG_FACTOR = 0.47;     // 碾压每击伤害系数（连续碾压，单跳系数低于单次属性子弹）
// 碎木飞溅（互斥于回弹）：滚动途中按间隔概率炸裂，滚木不消失，一路碾压一路爆炸
const WOOD_SPLINTER_INTERVAL = 600;   // 碎木飞溅炸裂间隔(ms)
const WOOD_SPLINTER_RADIUS = 70;      // 碎木飞溅爆炸半径(px)
const WOOD_SPLINTER_DMG = 0.25;       // 碎木飞溅每发伤害系数（占 player.damage 比例）
// 土系（地刺）参数：战场生成静止石钟乳簇 + 岩盾阻挡
const EARTH_SPIKE_BASE_DURATION = 1200; // 地刺基础持续时间(ms)
const EARTH_SPIKE_HIT_INTERVAL  = 600;  // 同一敌人被同一地刺伤害的间隔(ms)：出生 1 跳 + 中途 1 跳，共 2 跳
const EARTH_SPIKE_BASE_RADIUS   = 20;   // 地刺基础伤害范围(px)：v1.1.29 起减半（视觉与命中范围同步缩小至约一半）
const EARTH_SPIKE_DMG_FACTOR    = 1.45; // 地刺基础每跳伤害系数（与 sim_dps.js 同步；半径减半后上调以回正 T1）
const EARTH_SPIKE_MAX_COUNT     = 6;    // 场上地刺簇数量上限
// 土系·陷坑场地（地刺消失后生成的持续牵引坑）
const EARTH_SINKHOLE_DURATION   = 1400; // 陷坑持续时间(ms)：足够让敌人被缓慢拉入
const EARTH_SINKHOLE_MAX_COUNT  = 4;    // 场上陷坑数量上限（防铺满）
const EARTH_SINKHOLE_PULL_PER_FRAME = 0.006; // 陷坑每帧牵引步长缩放（再乘 sizeResist 与大怪抗性后极轻柔；配合 d*0.8 上限避免越过中心）。原 4 导致敌人瞬间被吸到中心
const EARTH_SHIELD_BASE_HP = 24;        // 岩盾基础血量（绝对基准，不再乘 player.damage）。原 hp = player.damage*80*… 导致单盾血近千、僵尸每500ms仅啄 zombie.damage*0.25（≈1.75），理论300s才破，等于无敌；现改为可被正常啃穿的绝对血量。最终 hp = 该值 ×(1+土树等级×0.06)×岩盾分支血量倍率
const EARTH_SHIELD_BASE_WIDTH = 90;     // 岩盾基础宽度(px)
const EARTH_SHIELD_BASE_DURATION = 3000; // 岩盾基础持续时间(ms)
const EARTH_SHIELD_MAX_COUNT = 4;       // 场上岩盾数量上限（防铺满）
const EARTH_SHIELD_ATTACK_INTERVAL = 500; // 敌人啄盾攻击间隔(ms)，同城墙啄墙
const EARTH_MAX_AOE_RADIUS = 53;       // 土系范围技能半径上限 = 陷坑原初始半径(80) × 2/3；仅应用于土系（陷坑/震地），其他属性树范围不变（v1.1.32 起）
// 取某属性树的「共享模板」修正（无属性树则返回默认空表）
function attrModsForType(type) {
    if (type === 'explosive') return explosiveMods();
    if (type === 'freeze')    return freezeMods();
    if (type === 'lightning') return lightningMods();
    if (type === 'wood')      return woodMods();
    if (type === 'earth')     return earthMods();
    return null;
}
// 由子弹的 skillType 取其实时修正（基础物理弹返回空表，不触发任何属性效果）
function attrModsForBullet(bullet) {
    return attrModsForType(bullet.skillType) || {};
}
// 某属性技能的实时释放 cd（独立于火力强化；可被自身「急速冷却」进一步缩短）
function getAttrReleaseCd(type) {
    const cfg = ATTR_CD_CFG[type] || { base: 6000, min: 3000, step: 100 };
    const s = skills[type];
    if (!s) return cfg.base;
    let cd = cfg.base - (s.level || 0) * cfg.step;
    const m = attrModsForType(type);
    if (m && m.cdReduce) cd *= (1 - m.cdReduce);   // 急速冷却：每级缩短释放 cd（封底在 cfg.min）
    return Math.max(cfg.min, cd);
}

function getFreezeDuration() {
    // 冻结时长：天赋 + 干冰弹等级 + 深寒分支百分比加成
    let base = 1000 + talentMods.freezeLevel * 40 + skills.freeze.level * 120;
    base *= (1 + freezeMods().freezeDurationBoost);
    return Math.min(3000, base);
}
function getAoeFreezeChance() {
    // 范围冻结概率由冰川分支(概率铺场)与冰霜新星分支(爆发概率)共同提供；
    // 基础冰霜爆炸不自带冻结（冻结下放大类分支，且均为概率、非必定）
    const m = freezeMods();
    return Math.min(0.95, m.freezeChanceBoost + (m.frostNovaFreezeChance || 0));
}
function getFreezeExplosionRadius() {
    // 冰霜爆炸半径随技能等级扩大，急冻分支进一步增幅
    // v1.1.22：基础截距 45→70，收紧水树 T0/T1 中期体验（T2 已近全覆盖，边际增益有限）
    const m = freezeMods();
    return (70 + skills.freeze.level * 5) * (1 + (m.freezeRadiusBoost || 0));
}
function getSlowChance() {
    // 干冰弹核心：命中主目标必定减速（不再掷骰）
    return 1.0;
}
function getSlowFactor() {
    // 数值越小移动越慢；天赋 + 霜寒分支
    let f = 0.7 - talentMods.slowLevel * 0.01 - freezeMods().slowFactorBoost;
    return Math.max(0.2, f);
}
function getShieldReduce() {
    // 技能护盾每级 −10%，天赋护盾每级 −2%，总减伤封顶 80%（防止负伤害回血）
    let r = skills.shield.level * 0.1 + talentMods.shieldLevel * 0.02;
    if (skills.shield._reduceBonus) r += skills.shield._reduceBonus;   // 护盾 Lv3 质变：减伤 +5%
    return Math.min(0.8, r);
}

// ==================== Phase 2：异常交互 / 质变节点 / 组合技 / 眩晕 ====================

// 异常状态 × 元素 被动增伤表（命中结算前乘倍率）
const STATUS_ELEMENT_BONUS = {
    frozen:  { '火': 1.0 },   // 冰冻中受火伤 +100%（融化蒸发）
    slow:    { '金': 0.3 },   // 减速中受金伤 +30%（导电）
    burning: { '风': 0.2 }    // 灼烧中受风伤 +20%（风助火势）
};

// 统一触发质变节点（升级到节点等级时调用一次，去重）
function fireQualNodes(type) {
    const def = SKILL_DEFS[type];
    if (!def || !def.qualNodes) return;
    const lv = skills[type].level;
    skills[type].qualified = skills[type].qualified || {};
    for (const nl in def.qualNodes) {
        if (lv >= Number(nl) && !skills[type].qualified[nl]) {
            def.qualNodes[nl].apply();
            skills[type].qualified[nl] = true;
        }
    }
}

// 大类衍生分支候选：到达 reqLevel、满足前置、未被互斥分支排除、且未达 maxLevel 的分支
// 已选过的分支若未升满，仍会再次出现，用于持续升级
function getAvailableBranches(type) {
    const def = SKILL_DEFS[type];
    if (!def || !def.branches) return [];
    const lv = skills[type].level;
    const taken = skills[type].branches || {};
    const out = [];
    for (const bid in def.branches) {
        const b = def.branches[bid];
        const bl = taken[bid] || 0;
        if (b.maxLevel && bl >= b.maxLevel) continue;            // 已升满
        if (lv < (b.reqLevel || 1)) continue;                    // 达到 reqLevel 即解锁
        if (b.prereq && !b.prereq.every(p => taken[p])) continue; // 前置未满足
        if (b.mutex && b.mutex.some(m => taken[m])) continue;     // 已被互斥分支排除
        out.push(bid);
    }
    return out;
}

// 由已选分支（含等级）派生 火力强化 的实时修正（不直改 player，避免重开丢失；每次选分支/开局重算）
function recomputeDamageMods() {
    const b = (skills.damage && skills.damage.branches) || {};
    const def = SKILL_DEFS.damage;
    const m = { dmgMul: 1, fireMul: 1, radiusMul: 1, hitboxMul: 1, armorBonus: 0, knock: false, knockF: 0 };
    for (const bid in b) {
        const bl = b[bid];
        if (!bl) continue;
        const bd = def.branches[bid];
        if (bd && bd.effect) bd.effect(bl, m);
    }
    if (skills.damage) skills.damage._mods = m;
}

// 由已选分支（含等级）派生 爆炸弹 的实时修正（命中爆炸的伤害/范围/击退/引燃/焚身）；不直改结算，每次选分支/开局重算
function recomputeExplosiveMods() {
    const b = (skills.explosive && skills.explosive.branches) || {};
    const def = SKILL_DEFS.explosive;
    const m = { explDmgMul: 1, explRadiusCut: 0, explArmorBreak: false, armorBreakF: 0, explIgnite: false, burnDmgMul: 1, explIncinerate: 0,
                // 共享模板分支派生（多重/疾速/暴击/穿透）
                bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, critExplode: false, pierceBoost: 0, pierceSplash: false, cdReduce: 0, canSplit: false };
    for (const bid in b) {
        const bl = b[bid];
        if (!bl) continue;
        const bd = def.branches[bid];
        if (bd && bd.effect) bd.effect(bl, m);
        if (bid === 'multiShot' && bl >= 5) m.canSplit = true;   // 多重 Lv5 质变：命中分裂（与子弹数公式解耦）
    }
    if (skills.explosive) skills.explosive._mods = m;
}

// 由已选分支派生 干冰弹（水属性树）的实时修正（冻结/减速/冰爆/领域）；每次选分支/开局重算
function recomputeFreezeMods() {
    const b = (skills.freeze && skills.freeze.branches) || {};
    const def = SKILL_DEFS.freeze;
    const m = {
        // 共享模板
        bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, iceBurst: false, pierceBoost: 0, iceSpike: false, cdReduce: 0, canSplit: false,
        // 水专属
        freezeChanceBoost: 0, freezeRadiusBoost: 0, slowFactorBoost: 0, freezeDurationBoost: 0, polarFieldChance: 0, frostNovaDmgMul: 1, frostNovaFreezeChance: 0, glacialDoomBonus: 0
    };
    for (const bid in b) {
        const bl = b[bid];
        if (!bl) continue;
        const bd = def.branches[bid];
        if (bd && bd.effect) bd.effect(bl, m);
        if (bid === 'multiShot' && bl >= 5) m.canSplit = true;   // 多重 Lv5 质变：命中分裂（与子弹数公式解耦）
    }
    if (skills.freeze) skills.freeze._mods = m;
}

// 由已选分支派生 闪电链（金属性树）的实时修正（弹射/麻痹/电伤领域/超导/雷霆）；每次选分支/开局重算
function recomputeLightningMods() {
    const b = (skills.lightning && skills.lightning.branches) || {};
    const def = SKILL_DEFS.lightning;
    const m = {
        // 共享模板
        bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0, pierceSpark: false, cdReduce: 0, canSplit: false,
        // 金专属
        chainCountBoost: 0, chainDmgMul: 1, chainRangeBoost: 0,
        empStunChance: 0, empStunDuration: 0, staticFieldChance: 0, staticFieldRadius: STATIC_FIELD_BASE_RADIUS, staticFieldLife: STATIC_FIELD_BASE_LIFE,
        superConductorDmgMul: 0, superConductorCountBoost: 0, superConductorMaxHp: 0, thunderStrike: false
    };
    for (const bid in b) {
        const bl = b[bid];
        if (!bl) continue;
        const bd = def.branches[bid];
        if (bd && bd.effect) bd.effect(bl, m);
        if (bid === 'multiShot' && bl >= 5) m.canSplit = true;   // 多重 Lv5 质变：命中分裂（与子弹数公式解耦）
    }
    if (skills.lightning) skills.lightning._mods = m;
}

// 由已选分支派生 滚木（木属性树）的实时修正（生长/定身/回弹/碎木/绞杀藤蔓）；每次选分支/开局重算
function recomputeWoodMods() {
    const b = (skills.wood && skills.wood.branches) || {};
    const def = SKILL_DEFS.wood;
    const m = {
        // 共享模板
        bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0, woodSpike: false, cdReduce: 0, canSplit: false,
        // 木专属
        logWidthMul: 1, logDmgMul: 1, logCountBoost: 0,
        rootChance: 0, rootDuration: 0,
        rebound: false, reboundDmgMul: 1,
        splinterChance: 0, splinterDmgMul: 1,
        strangleVineBonus: 0, thornBurst: false
    };
    for (const bid in b) {
        const bl = b[bid];
        if (!bl) continue;
        const bd = def.branches[bid];
        if (bd && bd.effect) bd.effect(bl, m);
        if (bid === 'multiShot' && bl >= 5) m.canSplit = true;   // 多重 Lv5 质变：命中分裂（与子弹数公式解耦）
    }
    if (skills.wood) skills.wood._mods = m;
}

// 由已选分支派生 地刺（土属性树）的实时修正（地刺簇/岩盾/震地/陷坑/石化/碎甲/山崩）；每次选分支/开局重算
function recomputeEarthMods() {
    const b = (skills.earth && skills.earth.branches) || {};
    const def = SKILL_DEFS.earth;
    const m = {
        // 共享模板
        bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0, rockBurst: false, cdReduce: 0, canSplit: false, rockShard: false,
        // 土专属
        fissureDmgMul: 1, earthLineLengthMul: 1, earthHitRadiusMul: 1,
        shieldChance: 0, shieldHpMul: 1, shieldDuration: 0, shieldWidthMul: 1,
        quakeChance: 0, quakeDmgMul: 1, quakeRadius: 0, quakeStunDur: 0,
        sinkholeChance: 0, sinkholeRadius: 0, sinkholePull: 0,
        petrifyChance: 0, petrifyDuration: 0,
        armorCrush: false, armorCrushF: 0,
        landslideBonus: 0
    };
    for (const bid in b) {
        const bl = b[bid];
        if (!bl) continue;
        const bd = def.branches[bid];
        if (bd && bd.effect) bd.effect(bl, m);
        if (bid === 'multiShot' && bl >= 5) m.canSplit = true;   // 多重 Lv5 质变：命中分裂
    }
    if (skills.earth) skills.earth._mods = m;
}

// ==================== 五行系统（金木水火土）====================
// 任意伤害元素 → 五行（保留雷/风等旧标签的向下兼容）
const WUXING_ELEMENT = {
    '金': '金', '木': '木', '水': '水', '火': '火', '土': '土',
    '雷': '金', '风': '木', '冰': '水'   // 旧标签映射到五行
};
// 相克：攻击五行 → 被克制五行 → 伤害加成倍率
const WUXING_OVERCOME = { '火': '金', '金': '木', '木': '土', '土': '水', '水': '火' };
const WUXING_OVERCOME_BONUS = 0.30;   // 克制时 +30% 伤害
const WUXING_BASE_BONUS = 0.30;     // 五行技能对（普通）僵尸的默认压制增伤；物理火力强化不享受，克制系数恒为 1
// 相生：A 生 B。五行属性树 = 火(爆炸)/金(雷)/水(冰)/木(风=龙卷风)，相生链 金→水→木→火 成立。
// 设计目标：2 棵「相生」配对的树发育最强；单树无协同、3+ 树因分散投资而衰减。
// 实现：相生对数提供全局增伤，超过 2 棵树后每多 1 树施加分散惩罚，使 2 树为峰值。
const WUXING_GENERATE = { '火': '土', '土': '金', '金': '水', '水': '木', '木': '火' };
const WUXING_GENERATE_BONUS = 0.20;     // 每对相生提供的全局增伤（作用于所有属性伤害）
const WUXING_SPREAD_PENALTY = 0.45;    // 超过 2 棵属性树后，每多 1 树的分散惩罚（令 2 树相生 > 单树 > 3 树 > 4 树，体现「2树相生最强、单树次之」）
let wuxingSynergy = {};                // { 被生五行: true }（保留供组合技/UI 使用）
let wuxingSynergyMult = 1;             // 全局五行相生倍率（峰值在恰好 2 棵相生树）

// 重新计算当前已拥有技能的五行相生协同（在开局/获得/升级技能后调用）
function recomputeWuxingSynergy() {
    wuxingSynergy = {};
    const elements = new Set();
    for (const t of acquiredSkills) {
        const el = SKILL_DEFS[t] && SKILL_DEFS[t].element;
        const wx = WUXING_ELEMENT[el];
        if (wx) elements.add(wx);
    }
    let pairs = 0;
    for (const a of elements) {
        const b = WUXING_GENERATE[a];
        if (b && elements.has(b)) { wuxingSynergy[b] = true; pairs++; }
    }
    // 全局相生倍率：相生对提供增益，超过 2 棵属性树则因分散投资衰减 → 2 树为峰值
    const treeCount = elements.size;
    wuxingSynergyMult = 1 + WUXING_GENERATE_BONUS * pairs - Math.max(0, treeCount - 2) * WUXING_SPREAD_PENALTY;
}

// 五行压制加值（不含相生全局倍率）：攻击五行 atkWx 对「目标单系 targetElement」的克制收益。
function _wuxingSuppressBonus(atkWx, targetElement) {
    if (!atkWx) return 0;
    if (!targetElement || targetElement === 'normal') return WUXING_BASE_BONUS;   // 普通僵尸：仅默认压制 +30%
    if (WUXING_OVERCOME[atkWx] === targetElement) return WUXING_BASE_BONUS + WUXING_OVERCOME_BONUS;     // 我克它：+30% + 克制 +30%
    if (atkWx === WUXING_OVERCOME[targetElement]) return WUXING_BASE_BONUS - WUXING_OVERCOME_BONUS;     // 它克我：+30% − 克制 30%
    return WUXING_BASE_BONUS;                                                                       // 无关属性：仅默认压制 +30%
}

// 计算元素伤害倍率：状态异常加成 + 五行克制 + 五行相生协同
function getElementBonus(zombie, element) {
    if (!zombie || !element) return 1;
    const now = Date.now();
    const atkWx = WUXING_ELEMENT[element];
    let mult = 1;
    // Phase2 异常交互：状态 × 元素 增伤
    if (zombie.frozenUntil > now && STATUS_ELEMENT_BONUS.frozen[element]) mult += STATUS_ELEMENT_BONUS.frozen[element];
    if (zombie.slowUntil > now && STATUS_ELEMENT_BONUS.slow[element]) mult += STATUS_ELEMENT_BONUS.slow[element];
    if (zombie.burningUntil > now && STATUS_ELEMENT_BONUS.burning[element]) mult += STATUS_ELEMENT_BONUS.burning[element];
    // 五行压制 + 克制：单系怪直接算；双系相生怪取「各系最差克制」的最小值，
    // 防止单属性技能同时碾压两系（需对应相生配对或暴力物理流才能突破）。
    let suppress;
    if (zombie.elements && zombie.elements.length > 1) {
        let worst = Infinity;
        for (const e of zombie.elements) worst = Math.min(worst, _wuxingSuppressBonus(atkWx, e));
        suppress = (worst === Infinity) ? WUXING_BASE_BONUS : worst;
    } else {
        suppress = _wuxingSuppressBonus(atkWx, zombie.element || 'normal');
    }
    mult += suppress;
    // 五行相生：全局倍率（峰值在恰好 2 棵相生树；单树无协同、3+ 树因分散而衰减）
    if (atkWx) mult *= wuxingSynergyMult;
    return mult;
}

// 当前子弹的主属性元素：由玩家已激活的属性树等级最高者决定（水>火>雷/金>风/木），默认物理
function getBulletElement() {
    const scores = {};
    if (skills.freeze && skills.freeze.level > 0) scores['水'] = skills.freeze.level;
    if (skills.explosive && skills.explosive.level > 0) scores['火'] = skills.explosive.level;
    if (skills.lightning && skills.lightning.level > 0) scores['金'] = skills.lightning.level;
    if (skills.wood && skills.wood.level > 0)       scores['木'] = skills.wood.level;
    if (skills.earth && skills.earth.level > 0)     scores['土'] = skills.earth.level;
    let best = '物理', bestScore = 0;
    const priority = ['水', '火', '金', '木', '土'];
    for (const wx of priority) {
        if (scores[wx] && scores[wx] > bestScore) { best = wx; bestScore = scores[wx]; }
    }
    return best;
}

// 聚合所有属性树的共享模板修正（火/水/金/木/土属性树都有 multiShot/highSpeed/crit/pierce）
function attributeMods() {
    const all = [skills.explosive && skills.explosive._mods, skills.freeze && skills.freeze._mods, skills.lightning && skills.lightning._mods, skills.wood && skills.wood._mods, skills.earth && skills.earth._mods];
    const out = { bulletCountBoost: 0, speedMul: 1, critChanceBoost: 0, critDamageBoost: 0, pierceBoost: 0 };
    for (const m of all) {
        if (!m) continue;
        out.bulletCountBoost += (m.bulletCountBoost || 0);
        out.speedMul *= (m.speedMul || 1);
        out.critChanceBoost += (m.critChanceBoost || 0);
        out.critDamageBoost += (m.critDamageBoost || 0);
        out.pierceBoost += (m.pierceBoost || 0);
    }
    return out;
}

function pushHit(z, type) {
    hitEffects.push({ x: z.x, y: z.y, type: type, life: 400, maxLife: 400, rot: 0 });
}

// 闪电链额外弹射（超导组合技）
function superConduct(from, count, dmg) {
    let last = from;
    const chained = [from];
    for (let c = 0; c < count; c++) {
        let best = null, bestD = 150;
        for (const z of zombies) {
            if (!chained.includes(z)) {
                const d = Math.hypot(last.x - z.x, last.y - z.y);
                if (d < bestD) { bestD = d; best = z; }
            }
        }
        if (best) { createLightning(last.x, last.y, best.x, best.y); damageZombie(best, dmg, false, '金'); chained.push(best); last = best; }
    }
}

// 组合技注册表：命中后判定（状态 + 元素 → 离散特效）
const COMBO_DEFS = [
    { id:'melt', test:(z,el)=> z.frozenUntil > Date.now() && el === '火',
      fx(z){ damageZombie(z, z.maxHealth * 0.08, false, '物理'); z.frozenUntil = 0; pushHit(z,'melt'); } },
    { id:'superconduct', test:(z,el)=> el === '金' && (z.frozenUntil > Date.now() || z.slowUntil > Date.now() || z.stunUntil > Date.now()),
      fx(z){ superConduct(z, 2, player.damage * 0.3); pushHit(z,'superconduct'); } },
    { id:'conduct', test:(z,el)=> z.slowUntil > Date.now() && el === '金',
      fx(z){ const now=Date.now(); z.stunUntil = Math.max(z.stunUntil||0, now+800); damageZombie(z, player.damage*0.3, false, '金'); pushHit(z,'conduct'); } },
    { id:'mire', test:(z,el)=> z.burningUntil > Date.now() && el === '水',
      fx(z){ const now=Date.now(); z.stunUntil = Math.max(z.stunUntil||0, now+600); pushHit(z,'mire'); } }
];

// 命中后判定组合技（每发伤害调用一次）
function checkCombos(z, element) {
    if (!z || z.health <= 0) return;
    for (const c of COMBO_DEFS) {
        if (c.test(z, element)) c.fx(z);
    }
}

// ==================== 炸弹系统 ====================
let bombCount = 0;
let bombCooldown = 0;
const BOMB_MAX_COUNT = 3;
let bombMaxCount = BOMB_MAX_COUNT;    // 实际炸弹上限（含天赋加成），战斗中由 startGame 重算
const BOMB_COOLDOWN_TIME = 30000;
let justGotBomb = false; // 刚获得炸弹的标志
let bombFull = false; // 炸弹已满标志

// ==================== 流量主：激励视频广告（看广告补发炸弹并立即释放） ====================
// 仅在微信小游戏运行环境下初始化；无头测试/wx 缺失时静默跳过，不影响逻辑测试
let rewardedAd = null;
function ensureRewardedAd() {
    if (rewardedAd) return rewardedAd;
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return null;
    try {
        rewardedAd = wx.createRewardedVideoAd({ adUnitId: 'adunit-d8eb7685a648ebc1' });
        rewardedAd.onError((err) => {
            console.error('激励视频广告加载/播放错误', err);
        });
    } catch (e) {
        rewardedAd = null;
    }
    return rewardedAd;
}

// 展示激励视频广告；onReward 仅当看完激励时长（达标）后回调
function showRewardedAd(onReward) {
    const ad = ensureRewardedAd();
    // 播放广告期间暂停游戏（仅当当前正在游玩且未被手动暂停）
    let pausedByAd = false;
    if (gameRunning && gameState === 'playing' && !gamePaused) {
        gamePaused = true;
        pausedByAd = true;
    }
    const resume = () => {
        if (pausedByAd) gamePaused = false;
        // 微信播放激励视频会挂起 AudioContext，广告结束后需恢复，否则背景音乐消失
        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.resume();
            if (gameRunning && musicEnabled && AudioSystem.ctx && AudioSystem.ctx.state === 'running') {
                AudioSystem.startBGM();
            }
        }
    };
    if (!ad) {
        // 非微信环境（如本地预览/测试）：直接视为已发放奖励，便于联调
        if (onReward) onReward();
        resume();
        return;
    }
    const handler = (res) => {
        // 新接口：res.isEnded === true 表示看完激励；旧接口：res 为 undefined 也表示发放
        if (res === undefined || (res && res.isEnded)) {
            if (onReward) onReward();
        }
        ad.offClose(handler);
        resume(); // 广告结束（无论是否看完）都恢复游戏
    };
    ad.onClose(handler);
    ad.show().catch(() => {
        // 失败重试
        ad.load()
            .then(() => ad.show())
            .catch(err => {
                console.error('激励视频 广告显示失败', err);
                resume();
            });
    });
}

// 看广告达标后：补发一颗炸弹并立即释放（无论当前是否在冷却/无弹）
function grantAdBombAndRelease() {
    if (!gameRunning) return;
    if (adWatchCount >= AD_WATCH_MAX_PER_LEVEL) return; // 已达本关上限，不再发放
    adWatchCount += 1;
    bombCount += 1;
    bombCooldown = 0;
    useBomb();
}

// ==================== 生成参数 ====================
let spawnTimer = 0;
let spawnInterval = 1500;

// 波次系统运行时状态
let wavesSpawned = 0;       // 已生成的波次数
let nextWaveIdx = 0;        // 下一个待生成波次下标（0-based）
let waveAlive = {};         // 每波当前存活僵尸数（含待生成 pending）
let waveAwarded = {};       // 该波是否已计入已清波（防重复）
let wavesCleared = 0;       // 已清波数
let pendingSpawns = [];     // 同波错峰出怪的待生成队列：{at, type, zElement, stage, wave}

// ==================== 绘制函数 ====================

// 绘制背景
function drawBackground() {
    // 深蓝夜空（皇室战争风战场，暗底凸显前景）
    const skyGradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
    skyGradient.addColorStop(0, '#0a1a30');
    skyGradient.addColorStop(0.55, '#102844');
    skyGradient.addColorStop(1, '#16385e');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // 远处暗色山峦
    const groundY = screenHeight * 0.82;
    ctx.fillStyle = 'rgba(40, 70, 110, 0.5)';
    for (let i = 0; i < 5; i++) {
        const x = (i / 5) * screenWidth;
        ctx.beginPath();
        ctx.moveTo(x - 100, groundY);
        ctx.lineTo(x, groundY - 70 - i * 18);
        ctx.lineTo(x + 100, groundY);
        ctx.fill();
    }

    // 战场地面（比天空更暗，让前景子弹/角色更跳）
    const groundGradient = ctx.createLinearGradient(0, groundY, 0, screenHeight);
    groundGradient.addColorStop(0, '#0e2540');
    groundGradient.addColorStop(1, '#081523');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, groundY, screenWidth, screenHeight - groundY);

    // 地面竞技场圆环（淡金，增强纵深）
    ctx.strokeStyle = 'rgba(255, 210, 74, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(screenWidth / 2, screenHeight * 0.92, screenWidth * 0.42, screenHeight * 0.08, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 飘动的微光（淡蓝白，低亮度不刺眼）
    const time = Date.now() / 1000;
    ctx.fillStyle = 'rgba(180, 210, 240, 0.35)';
    for (let i = 0; i < 36; i++) {
        const x = ((i * 137.5 + time * 14) % screenWidth);
        const y = ((i * 73.3 + time * 22) % groundY);
        const size = 1 + (i % 2);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 绘制玩家（越野车）
function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const r = player.radius;
    const now = Date.now();
    // 受击泛红已移至城墙（drawWall），坦克本体保持钢蓝（城墙玩法下坦克被墙遮挡）
    const hurtFlash = false;

    // 阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 车身（钢蓝 + 金色饰条，暗边增强对比）
    const bodyColor = hurtFlash ? '#ff4444' : '#3fa9f5';
    const bodyDark = hurtFlash ? '#cc2222' : '#1c5e93';
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x - 18, y - 14, 36, 28);

    // 车身暗边（立体）
    ctx.fillStyle = bodyDark;
    ctx.fillRect(x - 18, y - 14, 2, 28);
    ctx.fillRect(x + 16, y - 14, 2, 28);
    ctx.fillRect(x - 16, y - 14, 32, 2);
    ctx.fillRect(x - 16, y + 12, 32, 2);

    // 车身高光
    ctx.fillStyle = hurtFlash ? '#ff8888' : '#7fd4ff';
    ctx.fillRect(x - 14, y - 12, 4, 20);

    // 金色饰条
    ctx.fillStyle = ROYALE.gold;
    ctx.fillRect(x - 16, y + 2, 32, 2);

    // 车窗
    ctx.fillStyle = '#0a1a2e';
    ctx.fillRect(x - 8, y - 8, 16, 12);
    ctx.fillStyle = '#5fd0ff';
    ctx.fillRect(x - 6, y - 6, 4, 8);
    
    // 轮子
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - 20, y - 16, 6, 6);
    ctx.fillRect(x + 14, y - 16, 6, 6);
    ctx.fillRect(x - 20, y + 10, 6, 6);
    ctx.fillRect(x + 14, y + 10, 6, 6);
    
    // 机枪（旋转）- 顺时针偏移90度
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.gunAngle + Math.PI / 2);
    
    // 机枪底座
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(-2, -2, 4, 4);
    
    // 机枪枪管
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-2, -36, 4, 32);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, -34, 2, 28);
    
    // 枪口
    ctx.fillStyle = '#222';
    ctx.fillRect(-1, -40, 2, 6);
    
    ctx.restore();

    // 不朽之身：复活后的无敌护罩
    if (now < invincibleUntil) {
        drawInvincibleShield(x, y, r, now);
    }
}

// 不朽之身触发后的无敌护罩表现（紫色能量球 + 旋转六边形线框 + 剩余秒数）
function drawInvincibleShield(x, y, r, now) {
    now = now || Date.now();
    const remain = Math.max(0, invincibleUntil - now);
    const pulse = 0.65 + Math.sin(now * 0.008) * 0.25;
    const R = r * 1.9;

    ctx.save();
    const g = ctx.createRadialGradient(x, y, R * 0.35, x, y, R);
    g.addColorStop(0, 'rgba(160, 107, 255, 0.05)');
    g.addColorStop(0.75, `rgba(160, 107, 255, ${0.18 * pulse})`);
    g.addColorStop(1, `rgba(210, 170, 255, ${0.42 * pulse})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(x, y);
    ctx.rotate(now * 0.0012);
    ctx.strokeStyle = `rgba(215, 180, 255, ${0.85 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        const px = Math.cos(a) * R;
        const py = Math.sin(a) * R;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#e6d2ff';
    for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 剩余无敌秒数
    ctx.save();
    ctx.fillStyle = '#e6d2ff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🔮 无敌 ${Math.ceil(remain / 1000)}s`, x, y - R - 10);
    ctx.restore();
}

// 绘制城墙（石砖城墙 + 城垛）：位于背景地平线处，阻挡敌人下落；墙体泛红表示受击
function drawWall() {
    const now = Date.now();
    const hurtFlash = now - player.hurtTime < 120;   // 墙体受击泛红（坦克不再泛红）
    const topY = WALL_Y;
    const h = WALL_HEIGHT;
    const x0 = WALL_X0, x1 = WALL_X1;
    const w = x1 - x0;

    // 墙体底色（石青灰；受击泛红）
    const baseTop = hurtFlash ? '#7a3b3b' : '#5b6b7a';
    const baseBot = hurtFlash ? '#552020' : '#3c4856';
    const g = ctx.createLinearGradient(0, topY, 0, topY + h);
    g.addColorStop(0, baseTop);
    g.addColorStop(1, baseBot);
    ctx.fillStyle = g;
    ctx.fillRect(x0, topY, w, h);

    // 砖缝（横向层）
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    const brickH = 10;
    for (let by = topY + brickH; by < topY + h; by += brickH) {
        ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x1, by); ctx.stroke();
    }
    // 砖缝（错位竖线，棋盘式）
    const brickW = 28;
    for (let bx = 0; bx < w; bx += brickW) {
        for (let row = 0; row * brickH < h; row++) {
            const yy = topY + row * brickH;
            const xx = bx + (row % 2 ? brickW / 2 : 0);
            if (xx < x1) {
                ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + brickH); ctx.stroke();
            }
        }
    }

    // 城垛（顶部锯齿）
    ctx.fillStyle = baseTop;
    const merlonW = 26, gap = 18;
    for (let mx = x0; mx < x1; mx += merlonW + gap) {
        const mw = Math.min(merlonW, x1 - mx);
        ctx.fillRect(mx, topY - 12, mw, 12);
    }

    // 顶部高光
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x0, topY, w, 2);

    // 受击高亮描边
    if (hurtFlash) {
        ctx.strokeStyle = 'rgba(255,80,80,0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, topY - 12, w, h + 12);
    }
}

// 绘制城墙血条（比墙体略窄，整组下沿贴齐城墙下沿，绿色，只显示当前血量数字）
function drawWallHealthBar() {
    const w = (WALL_X1 - WALL_X0) * 0.84;          // 比墙体略窄
    const x = (WALL_X0 + WALL_X1) / 2 - w / 2;
    const h = 9;
    const wallBottom = WALL_Y + WALL_HEIGHT;
    const y = wallBottom - h - 6;                  // 血条整组下沿贴齐城墙下沿（怪物在城墙上方，不再遮挡）

    // 背板
    ctx.fillStyle = 'rgba(8, 20, 36, 0.82)';
    roundRect(ctx, x - 3, y - 2, w + 6, h + 8, 6);
    ctx.fill();
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x - 3, y - 2, w + 6, h + 8, 6);
    ctx.stroke();

    // 底槽
    ctx.fillStyle = 'rgba(40, 60, 80, 0.9)';
    ctx.fillRect(x, y, w, h);

    // 填充（绿色）
    const pct = Math.max(0, Math.min(1, player.health / player.maxHealth));
    ctx.fillStyle = '#3fcf5b';
    ctx.fillRect(x, y, w * pct, h);

    // 文案：只显示当前血量数字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, Math.ceil(player.health))), x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
}

// 战场左右透明边界（敌人身体边缘不可越界）：仅作视觉提示，逻辑钳制见 clampZombieToField()。
// 沿屏幕左右缘向场内渐隐的半透明光带，提示敌人被限制在该区域内。
function drawFieldBorders() {
    const strip = 6;                       // 边界提示带宽度（向场内渐隐）
    // 左边界
    const gL = ctx.createLinearGradient(FIELD_X0, 0, FIELD_X0 + strip, 0);
    gL.addColorStop(0, 'rgba(120,200,255,0.30)');
    gL.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = gL;
    ctx.fillRect(FIELD_X0, 0, strip, screenHeight);
    // 右边界
    const gR = ctx.createLinearGradient(FIELD_X1, 0, FIELD_X1 - strip, 0);
    gR.addColorStop(0, 'rgba(120,200,255,0.30)');
    gR.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = gR;
    ctx.fillRect(FIELD_X1 - strip, 0, strip, screenHeight);
}

// ====== 极地怪物皮肤（冰雪僵尸世界观：南北极海陆空动植物）======
// 每只怪物以「海豹僵尸」为基底造型，叠加 species 专属特征（耳/獠牙/喙/鳍/翼/角/尾/王冠）。
// body/coat/outline 为身体配色；feature 决定附加特征（空格分隔）；boss 系带 crown 且体型更大。
const CREATURE_VISUAL = {
    seal:          { body:'#3fa34d', coat:'#5cc04f', outline:'#1f5e26', feature:'' },
    sealKing:      { body:'#d63b40', coat:'#ff5a5f', outline:'#8a1f24', feature:'crown' },
    penguin:       { body:'#2b3a55', coat:'#3f5a82', outline:'#16233a', feature:'beak' },
    emperorPenguin:{ body:'#d63b40', coat:'#ff6a4d', outline:'#8a1f24', feature:'beak crown' },
    polarBear:     { body:'#9fb6c9', coat:'#cfe0ec', outline:'#5b7488', feature:'ears' },
    bearTroll:     { body:'#7a45d6', coat:'#a06bff', outline:'#4a2589', feature:'ears crown' },
    walrus:        { body:'#b5652e', coat:'#d98a4a', outline:'#7a3f12', feature:'tusks' },
    lavaWalrus:    { body:'#d63b40', coat:'#ff7a1a', outline:'#8a1f24', feature:'tusks crown' },
    arcticFox:     { body:'#cfd6e6', coat:'#eef3fb', outline:'#8a93a8', feature:'ears' },
    foxDemon:      { body:'#ffd23a', coat:'#ffe880', outline:'#9a7a10', feature:'ears crown' },
    reindeer:      { body:'#9c6b3f', coat:'#c8915a', outline:'#5e3c1f', feature:'horns' },
    reindeerKing:  { body:'#c8915a', coat:'#f1d4ad', outline:'#5e3c1f', feature:'horns crown' },
    orca:          { body:'#1c2733', coat:'#33485c', outline:'#0c141c', feature:'fins' },
    orcaKing:      { body:'#1c2733', coat:'#39e0ff', outline:'#0c141c', feature:'fins crown' },
    snowyOwl:      { body:'#dfe6ee', coat:'#f4f8fc', outline:'#9aa6b4', feature:'wings' },
    owlKing:       { body:'#ff9a4a', coat:'#ffd0a0', outline:'#9a5a10', feature:'wings crown' },
    puffin:        { body:'#2b3a55', coat:'#ff6a6a', outline:'#16233a', feature:'beak' },
    puffinKing:    { body:'#ff6a6a', coat:'#ffae3a', outline:'#8a1f24', feature:'beak crown' },
    iceDragon:     { body:'#2bd6c0', coat:'#7af0e0', outline:'#0f7a6e', feature:'wings tail' },
    dragonKing:    { body:'#ff4dff', coat:'#ff9aff', outline:'#7a1f7a', feature:'wings tail crown' }
};

// 怪物五行属性环：单系一圈；双系相生左右各半（让玩家一眼识别属性弱点）
const ELEMENT_RING = {
    '金':'#ffd23a', '木':'#46d35a', '水':'#37c6ff', '火':'#ff6a14', '土':'#c8915a', 'normal':null
};

// 绘制僵尸（冰雪风格 + 极地怪物皮肤）
function drawZombie(zombie, now) {
    const x = zombie.x;
    const y = zombie.y;
    const r = zombie.radius;
    // 简单裁剪：完全在屏幕外的不绘制
    if (x + r < 0 || x - r > screenWidth || y + r < 0 || y - r > screenHeight) return;

    // 阴影
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.7, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 150, 180, 0.3)';
    ctx.fill();
    
    // 身体颜色（由怪物皮肤决定；无皮肤回退海豹僵尸）
    const colors = CREATURE_VISUAL[zombie.creature] || CREATURE_VISUAL.seal;
    const feats = (colors.feature || '').split(' ').filter(Boolean);
    
    // 身体主体
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = colors.coat;
    ctx.fill();
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // 外套
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = colors.body;
    ctx.fill();
    
    // 头顶
    ctx.beginPath();
    ctx.arc(x, y - r * 0.15, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = colors.outline;
    ctx.fill();
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 脸部
    ctx.fillStyle = '#e8eef4';
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.4, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 眼睛（红色发光）
    const eyeSize = r * 0.12;
    
    // 左眼
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(x - r * 0.15, y - r * 0.3, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // 右眼
    ctx.beginPath();
    ctx.arc(x + r * 0.15, y - r * 0.3, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // 嘴巴（有喙的物种会被喙覆盖）
    ctx.fillStyle = '#2a1a1a';
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.1, r * 0.15, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 手臂
    ctx.fillStyle = colors.coat;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.9, y + r * 0.1, r * 0.25, r * 0.15, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + r * 0.9, y + r * 0.1, r * 0.25, r * 0.15, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // ============ 物种特征（耳/獠牙/喙/鳍/翼/角/尾/王冠）============
    for (const f of feats) {
        if (f === 'ears') {
            ctx.fillStyle = colors.outline;
            ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.62, r * 0.22, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.62, r * 0.22, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = colors.coat;
            ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.62, r * 0.11, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.62, r * 0.11, 0, Math.PI * 2); ctx.fill();
        } else if (f === 'beak') {
            ctx.fillStyle = '#ff9a2e';
            ctx.beginPath();
            ctx.moveTo(x - r * 0.16, y - r * 0.12);
            ctx.lineTo(x + r * 0.16, y - r * 0.12);
            ctx.lineTo(x, y + r * 0.05);
            ctx.closePath(); ctx.fill();
        } else if (f === 'tusks') {
            ctx.fillStyle = '#fdfdfd';
            ctx.beginPath();
            ctx.moveTo(x - r * 0.14, y - r * 0.02); ctx.lineTo(x - r * 0.08, y - r * 0.02); ctx.lineTo(x - r * 0.11, y + r * 0.24);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + r * 0.14, y - r * 0.02); ctx.lineTo(x + r * 0.08, y - r * 0.02); ctx.lineTo(x + r * 0.11, y + r * 0.24);
            ctx.closePath(); ctx.fill();
        } else if (f === 'fins') {
            ctx.fillStyle = colors.outline;
            ctx.beginPath();   // 背鳍
            ctx.moveTo(x - r * 0.18, y - r * 0.9); ctx.lineTo(x + r * 0.18, y - r * 0.9); ctx.lineTo(x, y - r * 1.38);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();   // 尾鳍
            ctx.moveTo(x + r * 0.82, y); ctx.lineTo(x + r * 1.35, y - r * 0.32); ctx.lineTo(x + r * 1.35, y + r * 0.32);
            ctx.closePath(); ctx.fill();
        } else if (f === 'wings') {
            ctx.fillStyle = colors.outline;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.8, y - r * 0.1);
            ctx.quadraticCurveTo(x - r * 1.45, y - r * 0.6, x - r * 1.1, y + r * 0.55);
            ctx.quadraticCurveTo(x - r * 0.9, y + r * 0.2, x - r * 0.8, y - r * 0.1);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(x + r * 0.8, y - r * 0.1);
            ctx.quadraticCurveTo(x + r * 1.45, y - r * 0.6, x + r * 1.1, y + r * 0.55);
            ctx.quadraticCurveTo(x + r * 0.9, y + r * 0.2, x + r * 0.8, y - r * 0.1);
            ctx.closePath(); ctx.fill();
        } else if (f === 'horns') {
            ctx.strokeStyle = colors.outline;
            ctx.lineWidth = Math.max(2, r * 0.08);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - r * 0.3, y - r * 0.55); ctx.lineTo(x - r * 0.5, y - r * 0.98);
            ctx.moveTo(x - r * 0.4, y - r * 0.82); ctx.lineTo(x - r * 0.62, y - r * 0.98);
            ctx.moveTo(x + r * 0.3, y - r * 0.55); ctx.lineTo(x + r * 0.5, y - r * 0.98);
            ctx.moveTo(x + r * 0.4, y - r * 0.82); ctx.lineTo(x + r * 0.62, y - r * 0.98);
            ctx.stroke();
        } else if (f === 'tail') {
            ctx.fillStyle = colors.outline;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.55, y + r * 0.7);
            ctx.quadraticCurveTo(x - r * 1.25, y + r * 1.1, x - r * 1.02, y + r * 1.55);
            ctx.lineTo(x - r * 0.72, y + r * 1.32);
            ctx.quadraticCurveTo(x - r * 0.82, y + r * 1.0, x - r * 0.4, y + r * 0.8);
            ctx.closePath(); ctx.fill();
        } else if (f === 'crown') {
            ctx.save();
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            ctx.fillStyle = '#ffd700';
            ctx.strokeStyle = '#9a7a10';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.5, y - r * 0.7);
            ctx.lineTo(x - r * 0.5, y - r * 1.05);
            ctx.lineTo(x - r * 0.25, y - r * 0.82);
            ctx.lineTo(x, y - r * 1.18);
            ctx.lineTo(x + r * 0.25, y - r * 0.82);
            ctx.lineTo(x + r * 0.5, y - r * 1.05);
            ctx.lineTo(x + r * 0.5, y - r * 0.7);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    }

    // ============ 五行属性环（单系整圈 / 双系相生左右各半）============
    const elems = (zombie.elements && zombie.elements.length > 1)
        ? zombie.elements
        : (ELEMENT_RING[zombie.element] ? [zombie.element] : null);
    if (elems) {
        ctx.save();
        ctx.lineWidth = Math.max(2, r * 0.08);
        if (elems.length === 1) {
            ctx.strokeStyle = ELEMENT_RING[elems[0]] || '#ffffff';
            ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.stroke();
        } else {
            ctx.strokeStyle = ELEMENT_RING[elems[0]] || '#ffffff';
            ctx.beginPath(); ctx.arc(x, y, r * 1.08, -Math.PI / 2, Math.PI / 2); ctx.stroke();
            ctx.strokeStyle = ELEMENT_RING[elems[1]] || '#ffffff';
            ctx.beginPath(); ctx.arc(x, y, r * 1.08, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
        }
        ctx.restore();
    }
    
    // ========== 状态表现：冰冻 / 减速 ==========
    const nowZ = now || Date.now();
    if (zombie.frozenUntil > nowZ) {
        // 冰壳：半透明冰蓝覆盖 + 内部冰晶棱线 + 边缘冰锥
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#8fe3ff';
        ctx.beginPath();
        ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
            const a = k * Math.PI / 3 + nowZ * 0.0005;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25);
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            ctx.stroke();
        }
        ctx.fillStyle = '#dff6ff';
        for (let k = 0; k < 5; k++) {
            const a = k * (Math.PI * 2 / 5) - 0.4;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
            ctx.lineTo(x + Math.cos(a + 0.22) * r * 1.05, y + Math.sin(a + 0.22) * r * 1.05);
            ctx.lineTo(x + Math.cos(a + 0.11) * r * 1.38, y + Math.sin(a + 0.11) * r * 1.38);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    } if (zombie.slowUntil > nowZ) {
        // 减速：脚下冰蓝黏液 + 上浮气泡 + 身上薄雾（与干冰弹水属性同色）
        ctx.save();
        ctx.fillStyle = 'rgba(70, 200, 255, 0.45)';
        ctx.beginPath();
        ctx.ellipse(x, y + r * 0.72, r * 0.95, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(160, 220, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(190, 235, 255, 0.8)';
        for (let k = 0; k < 3; k++) {
            const ph = ((nowZ * 0.002) + k * 0.7) % 1;
            ctx.beginPath();
            ctx.arc(x + (k - 1) * r * 0.4, y + r * 0.7 - ph * r * 0.9, 2.2 * (1 - ph * 0.6), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#a06bff';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ========== 状态表现：灼烧（独立显示，可与冰冻/减速叠加）==========
    if (zombie.burningUntil > nowZ) {
        ctx.save();
        const flick = 0.75 + 0.25 * Math.sin(nowZ * 0.02);   // 火焰抖动
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.arc(x, y, r * (0.98 + 0.06 * Math.sin(nowZ * 0.03)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.35 * flick;
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.arc(x, y - r * 0.1, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (Math.random() < 0.4) {                              // 上升火星
            addParticle({ x: x + (Math.random() - 0.5) * r, y: y - r * 0.6, vx: (Math.random() - 0.5) * 1.5, vy: -1.5 - Math.random() * 1.5, radius: 2 + Math.random() * 2, life: 400, color: '#ffae3a' });
        }
    }

    // 血条
    if (zombie.health < zombie.maxHealth) {
        const barWidth = r * 2.2;
        const barHeight = 5;
        const barY = y - r - 15;
        
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
        
        ctx.fillStyle = '#ff4444';
        ctx.fillRect(x - barWidth / 2, barY, barWidth * (zombie.health / zombie.maxHealth), barHeight);
    }
}

// 五行 + 物理 元素视觉（颜色 / 形状 / 体型），子弹彻底按元素区分，不再从普通子弹演化
const ELEMENT_VISUAL = {
    '物理': { core: '#ff4d4d', core2: '#ffd6d6', glow: 'rgba(255,80,80,0.55)',  shape: 'round',   size: 1.00, name: '物理' },
    '火':   { core: '#ff6a14', core2: '#ffd27a', glow: 'rgba(255,120,30,0.62)', shape: 'flame',   size: 1.20, name: '火' },
    '水':   { core: '#37c6ff', core2: '#daffff', glow: 'rgba(70,200,255,0.62)', shape: 'crystal', size: 0.92, name: '水' },
    '金':   { core: '#ffd23a', core2: '#fff7c8', glow: 'rgba(255,210,70,0.62)', shape: 'bolt',    size: 1.05, name: '金' },
    '木':   { core: '#46d35a', core2: '#cdf7d2', glow: 'rgba(80,210,90,0.55)',  shape: 'leaf',    size: 1.00, name: '木' },
    '土':   { core: '#c8915a', core2: '#f1d4ad', glow: 'rgba(200,145,90,0.55)', shape: 'chunk',   size: 1.14, name: '土' }
};
function elementVisual(el) { return ELEMENT_VISUAL[el] || ELEMENT_VISUAL['物理']; }

// 单颗子弹应叠加哪些「通用特效」元素（暴击/穿透/疾速），元素本身的颜色形状由 ELEMENT_VISUAL 决定
function getBulletVisual(bullet) {
    const m = attrModsForBullet(bullet || { skillType: 'damage' });
    return {
        crit: getCritChance(m) > 0,                                         // 暴击：金色描边（按本弹属性树）
        pierce: (player.bulletPiercing + (m.pierceBoost || 0)) > 1,         // 穿透：拉长 + 尖锐弹头
        fast: player.bulletSpeed * (m.speedMul || 1) > player.bulletSpeed + 0.001  // 疾速弹道：残影
    };
}

// 绘制子弹（红色能量弹为底，按已获得效果叠加各自美术，与金色/青色掉落物强区分）
function drawFields() {
    // 极寒领域（干冰弹 Lv4 分支）：冰霜减速/冻结场，冷色柔光晕
    // 使用缓存纹理 + drawImage，避免每领域每帧创建径向渐变
    const icePulse = 0.85 + 0.15 * Math.sin(Date.now() / 120);
    for (const f of iceFields) {
        if (f.x + f.radius < 0 || f.x - f.radius > screenWidth || f.y + f.radius < 0 || f.y - f.radius > screenHeight) continue;
        const tex = getFieldTexture('ice', Math.ceil(f.radius));
        if (!tex) continue;
        const lifeRatio = f.life / 3000;
        ctx.globalAlpha = lifeRatio * icePulse * 0.93;   // 纹理基准 alpha 0.30，缩放后≈原 0.28
        ctx.drawImage(tex, f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
    }

    // 静电场（闪电链 Lv4 分支）：金色电脉冲场
    const elecPulse = 0.85 + 0.15 * Math.sin(Date.now() / 80);
    for (const f of electricFields) {
        if (f.x + f.radius < 0 || f.x - f.radius > screenWidth || f.y + f.radius < 0 || f.y - f.radius > screenHeight) continue;
        const tex = getFieldTexture('elec', Math.ceil(f.radius));
        if (!tex) continue;
        const lifeRatio = f.life / (f.maxLife || STATIC_FIELD_BASE_LIFE);
        ctx.globalAlpha = lifeRatio * elecPulse * 0.92;  // 纹理基准 alpha 0.24，缩放后≈原 0.22
        ctx.drawImage(tex, f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
    }

    ctx.globalAlpha = 1;
}

// 滚木绘制（木属性树）：横躺的木质圆柱，左右展开、上下很细，向上滚动碾压
function drawLogs() {
    if (logs.length === 0) return;
    ctx.save();
    const t = Date.now();
    for (const log of logs) {
        const x = log.x - log.w / 2;
        const y = log.y - log.thick / 2;
        const r = log.thick / 2;
        const w = log.w;
        const h = log.thick;

        // 胶囊形木质主体
        ctx.globalAlpha = 0.95;
        const grd = ctx.createLinearGradient(x, y, x, y + h);
        grd.addColorStop(0, '#5c3a1e');   // 上暗
        grd.addColorStop(0.5, '#8b5a2b'); // 中亮
        grd.addColorStop(1, '#5c3a1e');   // 下暗
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.ellipse(x + w - r, y + r, r, r, 0, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + h);
        ctx.ellipse(x + r, y + r, r, r, 0, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fill();

        // 树皮竖纹
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#3e2716';
        ctx.lineWidth = 2;
        for (let kx = x + r + 6; kx < x + w - r; kx += 16) {
            ctx.beginPath();
            ctx.moveTo(kx, y + 2);
            ctx.lineTo(kx + Math.sin(kx * 0.15) * 2, y + h - 2);
            ctx.stroke();
        }

        // 滚动高光横带：向下滚动，模拟圆柱表面在向上滚
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#d4a86a';
        ctx.lineWidth = 2;
        const scroll = (t % 500) / 500 * h;
        for (let i = 0; i < 3; i++) {
            const yy = y + (scroll + i * h / 3) % h;
            if (yy < y + 2 || yy > y + h - 2) continue;
            ctx.beginPath();
            ctx.moveTo(x + r, yy);
            ctx.lineTo(x + w - r, yy);
            ctx.stroke();
        }

        // 左端面年轮（只露一端横截面；右端被圆柱侧面遮住，不做年轮）
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#c9a06a';
        ctx.beginPath(); ctx.arc(x + r, log.y, r * 0.82, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x + r, log.y, r * 0.45, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
}

// 岩盾绘制（土属性树）：岩石屏障 + 血条；绘制于僵尸上层（挡在敌人路径上）
function drawEarthShields() {
    if (earthShields.length === 0) return;
    const now = Date.now();
    for (const s of earthShields) {
        if (now - s.born > s.duration) continue;   // 过期不画（由 updateEarthShields 清理）
        const lifeRatio = 1 - (now - s.born) / s.duration;
        const x = s.x, y = s.y, w = s.w, h = s.h;

        // 岩石底座
        ctx.save();
        ctx.globalAlpha = 0.9 * Math.min(1, lifeRatio + 0.25);
        const grd = ctx.createLinearGradient(x, y, x, y + h);
        grd.addColorStop(0, '#9a8a78');   // 上亮
        grd.addColorStop(1, '#6b5d4d');   // 下暗
        ctx.fillStyle = grd;
        roundRectPath(x, y, w, h, 4);
        ctx.fill();
        // 裂纹高光
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#c9b9a3';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + h * 0.5);
        ctx.lineTo(x + w * 0.35, y + 2);
        ctx.lineTo(x + w * 0.55, y + h - 2);
        ctx.lineTo(x + w - 4, y + h * 0.5);
        ctx.stroke();
        ctx.restore();

        // 血条（盾顶）
        ctx.globalAlpha = 1;
        const hpRatio = Math.max(0, s.hp / s.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y - 6, w, 3);
        ctx.fillStyle = hpRatio > 0.5 ? '#8fd14f' : (hpRatio > 0.25 ? '#e8c14a' : '#e8604a');
        ctx.fillRect(x, y - 6, w * hpRatio, 3);
    }
    ctx.globalAlpha = 1;
}

// 地刺（土属性树）：在战场目标点生成静止石钟乳簇，停留一段时间后消失
function spawnEarthSpikes() {
    if (zombies.length === 0) return;
    const m = earthMods();
    const lvl = Math.max(1, skills.earth.level || 1);
    const count = Math.min(6, 1 + (m.bulletCountBoost || 0));
    const baseSlot = skillSlotOf('earth');
    const now = Date.now();

    const baseDmg = player.damage * ATTR_BASE_DMG_MUL * EARTH_SPIKE_DMG_FACTOR * (m.fissureDmgMul || 1)
                  * (1 + 0.05 * (lvl - 1))
                  / (1 + MULTI_BULLET_DMG_PENALTY * Math.max(0, count - 1));
    const critChance = getCritChance(m);
    const critMult = getCritMult(m);

    let spawned = false;
    for (let i = 0; i < count; i++) {
        const target = getSlotTarget(baseSlot + i);
        if (!target) continue;
        const radius = EARTH_SPIKE_BASE_RADIUS * (m.earthHitRadiusMul || 1);
        const x = Math.max(radius, Math.min(screenWidth - radius, target.x));
        const y = Math.max(radius, Math.min(WALL_Y - radius, target.y));

        if (earthSpikes.length >= EARTH_SPIKE_MAX_COUNT) earthSpikes.shift();
        earthSpikes.push({
            x, y, radius,
            born: now,
            duration: EARTH_SPIKE_BASE_DURATION + (m.shieldDuration || 0) * 0.5,
            dmg: baseDmg,
            critChance, critMult,
            m,
            hitMap: {},
            lineLenMul: m.earthLineLengthMul || 1,
            _tickCount: 0
        });
        createDustExplosion(x, y, radius * 0.7);
        spawned = true;
    }
    if (spawned) AudioSystem.playShoot();
}

// 地刺更新：超时移除（消失时触发陷坑/岩盾一次性场地效果）+ 按间隔结算伤害/分支效果
function updateEarthSpikes(dt) {
    const now = Date.now();
    for (let i = earthSpikes.length - 1; i >= 0; i--) {
        const spike = earthSpikes[i];
        if (now - spike.born > spike.duration) {
            // 地刺消失：触发陷坑 + 岩盾（一次性场地效果）。地震已在「第一跳」同时生效，此处不再重复。
            const m = spike.m;
            if (m.sinkholeChance > 0 && Math.random() < m.sinkholeChance) {
                spawnEarthSinkhole(spike.x, spike.y, m);
            }
            if (m.shieldChance > 0 && Math.random() < m.shieldChance) {
                createEarthShield(spike.x, spike.y, m);
            }
            earthSpikes.splice(i, 1);
            continue;
        }
        const age = now - spike.born;
        // 出生瞬间触发第 1 跳，之后每 EARTH_SPIKE_HIT_INTERVAL 一跳
        if (age >= spike._tickCount * EARTH_SPIKE_HIT_INTERVAL) {
            spike._tickCount++;
            applyEarthSpikeHit(spike, spike._tickCount === 1);
        }
    }
    updateEarthSinkholes();
}

// 土属性树·陷坑场地生成：地刺消失时调用，产生一个持续牵引坑
function spawnEarthSinkhole(x, y, m) {
    const sr = Math.min(EARTH_MAX_AOE_RADIUS, 28 + (m.sinkholeRadius || 0));
    if (earthSinkholes.length >= EARTH_SINKHOLE_MAX_COUNT) earthSinkholes.shift();
    earthSinkholes.push({
        x, y, radius: sr,
        born: Date.now(),
        duration: EARTH_SINKHOLE_DURATION,
        pull: m.sinkholePull || 0,
        rot: 0
    });
    createSinkholeEffect(x, y, sr);
}

// 土属性树·陷坑场地更新：逐帧将范围内敌人缓慢拉向中心（移动过程，非瞬间位移）
function updateEarthSinkholes() {
    const now = Date.now();
    for (let i = earthSinkholes.length - 1; i >= 0; i--) {
        const h = earthSinkholes[i];
        if (now - h.born > h.duration) { earthSinkholes.splice(i, 1); continue; }
        h.rot += 0.05;
        for (const z of zombies) {
            if (z.health <= 1) continue;
            const dx = h.x - z.x, dy = h.y - z.y;
            const d = Math.hypot(dx, dy);
            if (d < h.radius + z.radius && d > 1) {
                // 轻柔牵引：步长 = 强度 × 缩放 × 大怪抗性；上限为剩余距离的 0.8，避免越过中心、绝不瞬间吸附
                const sizeResist = 18 / (18 + z.radius);            // 越大的敌人越难吸（normal≈0.45 / tank≈0.375 / boss≈0.30）
                const step = Math.min(h.pull * EARTH_SINKHOLE_PULL_PER_FRAME * sizeResist, d * 0.8);
                z.x += dx / d * step;
                z.y += dy / d * step;
                clampZombieToField(z);
            }
        }
    }
}

// 土属性树·陷坑场地绘制：深色旋转漩涡坑（绘制于僵尸下层，与地刺一致）
function drawEarthSinkholes() {
    if (earthSinkholes.length === 0) return;
    const now = Date.now();
    for (const h of earthSinkholes) {
        if (now - h.born > h.duration) continue;
        const p = (now - h.born) / h.duration;
        const alpha = Math.min(1, (1 - p) * 1.4) * 0.9;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.globalAlpha = alpha;
        // 外圈暗色坑沿
        const grd = ctx.createRadialGradient(0, 0, h.radius * 0.15, 0, 0, h.radius);
        grd.addColorStop(0, 'rgba(20,14,10,0.95)');
        grd.addColorStop(0.7, 'rgba(60,42,30,0.85)');
        grd.addColorStop(1, 'rgba(90,66,46,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, h.radius, h.radius * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();
        // 旋转漩涡纹
        ctx.strokeStyle = 'rgba(30,20,14,0.7)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            const a0 = h.rot + k * (Math.PI * 2 / 3);
            ctx.arc(0, 0, h.radius * (0.35 + k * 0.18), a0, a0 + Math.PI * 1.3);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

// 地刺单跳结算（isFirstTick 仅在第一跳触发震地/陷坑/岩盾等一次性场地效果）
function applyEarthSpikeHit(spike, isFirstTick) {
    const now = Date.now();
    const m = spike.m;
    for (let k = zombies.length - 1; k >= 0; k--) {
        const z = zombies[k];
        if (z.health <= 1) continue;
        const dist = Math.hypot(spike.x - z.x, spike.y - z.y);
        if (dist > spike.radius + z.radius) continue;

        const lastHit = spike.hitMap[z.id] || 0;
        if (now - lastHit < EARTH_SPIKE_HIT_INTERVAL) continue;
        spike.hitMap[z.id] = now;

        // 基础伤害（含暴击）
        let dmg = spike.dmg;
        let isCrit = false;
        if (Math.random() < spike.critChance) {
            dmg *= spike.critMult;
            isCrit = true;
        }
        damageZombie(z, dmg, isCrit, '土');
        checkCombos(z, '土');

        // 岩片溅射（地刺贯穿 Lv5）
        if (m.rockShard) {
            for (let j = zombies.length - 1; j >= 0; j--) {
                const o = zombies[j];
                if (o === z || o.health <= 1) continue;
                if (Math.hypot(z.x - o.x, z.y - o.y) < 35) {
                    damageZombie(o, player.damage * 0.08, false, '土');
                    checkCombos(o, '土');
                }
            }
        }

        // 碎岩迸发（岩心暴击 Lv5）
        if (isCrit && m.rockBurst) {
            createDustExplosion(z.x, z.y, 55);
            for (let j = zombies.length - 1; j >= 0; j--) {
                const o = zombies[j];
                if (o === z || o.health <= 1) continue;
                if (Math.hypot(z.x - o.x, z.y - o.y) < 55) {
                    damageZombie(o, player.damage * 0.18, false, '土');
                    checkCombos(o, '土');
                }
            }
        }

        // 碎甲：受伤增加
        if (m.armorCrush) {
            z.vulnUntil = Math.max(z.vulnUntil || 0, now + 2500);
            z.vulnMul = 1 + m.armorCrushF;
        }

        // 石化：概率眩晕
        if (m.petrifyChance > 0 && Math.random() < m.petrifyChance) {
            z.stunUntil = Math.max(z.stunUntil || 0, now + m.petrifyDuration);
            createRockEffect(z.x, z.y);
        }

        // 山崩 Lv5：对石化目标追加最大生命%伤害
        if (m.landslideBonus > 0 && z.stunUntil > now) {
            damageZombie(z, z.maxHealth * 0.03 * m.landslideBonus, false, '土');
        }
    }

    // 第一跳一次性场地效果（每簇地刺仅一次，避免多重地刺叠加失控）
    // 注意：仅「震地」在第一跳同时生效；「陷坑」「岩盾」改在地刺消失时触发（见 updateEarthSpikes），
    // 避免被地刺本体遮挡而看不见。
    if (isFirstTick) {
        // 震地
        if (m.quakeChance > 0 && Math.random() < m.quakeChance) {
            const qr = Math.min(EARTH_MAX_AOE_RADIUS, Math.max(40, 60 + m.quakeRadius));  // 土系范围上限（v1.1.32）
            createQuakeEffect(spike.x, spike.y, qr);
            for (let j = zombies.length - 1; j >= 0; j--) {
                const z = zombies[j];
                if (z.health <= 1) continue;
                if (Math.hypot(spike.x - z.x, spike.y - z.y) < qr + z.radius) {
                    damageZombie(z, spike.dmg * 0.55 * m.quakeDmgMul, false, '土');
                    checkCombos(z, '土');
                    if (m.quakeStunDur > 0) z.stunUntil = Math.max(z.stunUntil || 0, now + m.quakeStunDur);
                }
            }
        }
    }
}

// 地刺绘制：棕色石钟乳簇（参考图：多根尖锥从裂开地面向上突起）
function drawEarthSpikes() {
    if (earthSpikes.length === 0) return;
    const now = Date.now();
    for (const spike of earthSpikes) {
        const age = now - spike.born;
        const lifeRatio = 1 - age / spike.duration;
        if (lifeRatio <= 0) continue;

        const grow = Math.min(1, age / 160);
        const alpha = lifeRatio < 0.25 ? lifeRatio / 0.25 : 1;
        const x = spike.x, y = spike.y, r = spike.radius;
        const h = r * 1.7 * spike.lineLenMul * grow;
        const spikeCount = 5;

        ctx.save();
        ctx.translate(x, y);

        // 裂开地面底座
        ctx.fillStyle = '#5c4a3a';
        ctx.globalAlpha = 0.95 * alpha;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();

        // 地裂细纹
        ctx.strokeStyle = '#3a2d22';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7 * alpha;
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, 0); ctx.lineTo(-r * 0.15, -r * 0.1);
        ctx.moveTo(r * 0.2, -r * 0.08); ctx.lineTo(r * 0.55, 0.02);
        ctx.stroke();

        // 石钟乳尖锥：扇形展开，中间最高、两侧依次降低、向外倾斜
        for (let i = 0; i < spikeCount; i++) {
            const t = (spikeCount > 1) ? (i / (spikeCount - 1)) * 2 - 1 : 0; // -1 ~ +1，0 为正中
            const sx = t * r * 0.55;                         // 地面根部水平排布
            const angle = t * 0.45;                           // 外侧刺向外倾斜（弧度），中间垂直
            const heightMul = 1 - Math.pow(Math.abs(t), 1.6) * 0.38; // 中间 100%，外侧降至约 62%
            const sh = h * heightMul;
            const sw = r * (0.30 - Math.abs(t) * 0.07);       // 外侧刺略细

            ctx.save();
            ctx.translate(sx, 0);
            ctx.rotate(angle);

            const grd = ctx.createLinearGradient(0, 0, 0, -sh);
            grd.addColorStop(0, '#4a3b2e');
            grd.addColorStop(0.45, '#8b6f4e');
            grd.addColorStop(1, '#c4a882');

            ctx.fillStyle = grd;
            ctx.globalAlpha = 0.98 * alpha;
            ctx.beginPath();
            ctx.moveTo(-sw / 2, 0);
            ctx.lineTo(0, -sh);
            ctx.lineTo(sw / 2, 0);
            ctx.closePath();
            ctx.fill();

            // 左侧高光（在旋转后的局部坐标里画，始终朝左上）
            ctx.strokeStyle = '#d9c4a8';
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.55 * alpha;
            ctx.beginPath();
            ctx.moveTo(-sw * 0.22, 0);
            ctx.lineTo(0, -sh);
            ctx.stroke();

            // 表面裂纹
            ctx.strokeStyle = '#2e241c';
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = 0.45 * alpha;
            ctx.beginPath();
            ctx.moveTo(0, -sh * 0.25);
            ctx.lineTo(sw * 0.18, -sh * 0.55);
            ctx.stroke();

            ctx.restore();
        }

        ctx.restore();
    }
    ctx.globalAlpha = 1;
}

// 绘制子弹：颜色 / 形状 / 体型 完全由元素决定（ELEMENT_VISUAL），不再从普通子弹演化
function drawBullets() {
    const t = Date.now();
    // 第一遍：基础物理子弹（skillType='damage'）画在底层
    for (const bullet of bullets) {
        if (bullet.skillType === 'damage') paintBullet(bullet, t);
    }
    // 第二遍：属性技能子弹画在普通子弹之上（更大更醒目，层级优先）
    for (const bullet of bullets) {
        if (bullet.skillType !== 'damage') paintBullet(bullet, t);
    }
}

// 单颗子弹绘制（颜色/形状/体型按元素；radius 已含元素体型系数，不再二次乘 ev.size）
function paintBullet(bullet, t) {
    const v = getBulletVisual(bullet);
    const ev = elementVisual(bullet.element);
    const ang = Math.atan2(bullet.vy, bullet.vx);
    const sz = bullet.radius;
    let len = sz * (v.pierce ? 4.6 : 3.4);   // 子弹拉成细长条，明显区别于圆形掉落物
    const w = sz * 1.5;
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(ang);

        // 高速子弹：后方残影（使用元素色，而非固定红）
        if (v.fast) {
            for (let k = 1; k <= 3; k++) {
                ctx.globalAlpha = 0.24 / k;
                ctx.fillStyle = ev.core;
                ctx.beginPath();
                ctx.ellipse(-k * len * 0.42, 0, (len / 2) * (1 - k * 0.18), (w / 2) * (1 - k * 0.18), 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // 元素光晕
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 3);
        glow.addColorStop(0, ev.glow);
        glow.addColorStop(1, ev.glow.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, sz * 3, 0, Math.PI * 2);
        ctx.fill();

        // 弹体：按元素形状绘制
        ctx.fillStyle = ev.core;
        ctx.beginPath();
        switch (ev.shape) {
            case 'flame': {   // 火：尾部尖、头部圆的泪滴火苗
                ctx.moveTo(-len * 0.5, 0);
                ctx.quadraticCurveTo(-len * 0.1, -w * 0.72, len * 0.5, 0);
                ctx.quadraticCurveTo(-len * 0.1, w * 0.72, -len * 0.5, 0);
                ctx.closePath();
                break;
            }
            case 'crystal': { // 水：六边形冰晶
                for (let i = 0; i < 6; i++) {
                    const a = Math.PI / 6 + i * Math.PI / 3;
                    const px = Math.cos(a) * len * 0.5;
                    const py = Math.sin(a) * w * 0.5;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.closePath();
                break;
            }
            case 'bolt': {    // 金：闪电箭形（锯齿）
                ctx.moveTo(len * 0.5, 0);
                ctx.lineTo(-len * 0.05, -w * 0.5);
                ctx.lineTo(-len * 0.32, -w * 0.2);
                ctx.lineTo(-len * 0.5, 0);
                ctx.lineTo(-len * 0.32, w * 0.2);
                ctx.lineTo(-len * 0.05, w * 0.5);
                ctx.closePath();
                break;
            }
            case 'leaf': {    // 木：叶形（细长椭圆）
                ctx.ellipse(0, 0, len / 2, w * 0.42, 0, 0, Math.PI * 2);
                break;
            }
            case 'chunk': {   // 土：圆角石块
                const r = Math.min(w * 0.4, len * 0.3);
                roundRectPath(-len / 2, -w / 2, len, w, r);
                break;
            }
            default: {        // 物理：红色能量弹（标准椭圆）
                ctx.ellipse(0, 0, len / 2, w / 2, 0, 0, Math.PI * 2);
            }
        }
        ctx.fill();

        // 高光内核（元素亮色）
        ctx.fillStyle = ev.core2;
        ctx.beginPath();
        ctx.ellipse(-len * 0.04, 0, len * 0.2, w * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // 元素专属点缀
        if (ev.shape === 'flame') {          // 火：尾部火星
            ctx.fillStyle = '#ffcf6a';
            for (let k = 0; k < 2; k++) {
                ctx.beginPath();
                ctx.arc(-len * (0.5 + k * 0.18), Math.sin(t * 0.03 + k * 2) * w * 0.3, w * 0.18, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (ev.shape === 'crystal') { // 水：冰面刻线
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-len * 0.3, 0); ctx.lineTo(len * 0.3, 0);
            ctx.moveTo(0, -w * 0.42); ctx.lineTo(0, w * 0.42);
            ctx.stroke();
        } else if (ev.shape === 'bolt') {    // 金：两侧电弧
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.1;
            for (const sgn of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(-len * 0.3, sgn * w * 0.5);
                ctx.lineTo(-len * 0.05, sgn * w * 0.95);
                ctx.lineTo(len * 0.2, sgn * w * 0.45);
                ctx.stroke();
            }
        }

        // 致命暴击：金色描边（覆盖在弹体之上）
        if (v.crit) {
            ctx.strokeStyle = '#ffd24a';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(0, 0, len / 2, w / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 穿透弹：尖锐弹头
        if (v.pierce) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(len * 0.5, 0);
            ctx.lineTo(len * 0.28, -w * 0.42);
            ctx.lineTo(len * 0.28, w * 0.42);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
}

// 圆角矩形路径（土属性石块用）
function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// 绘制经验球和金币（青蓝经验 + 金色硬币，与红色子弹强区分）
function drawOrbs() {
    // 经验球（青蓝 + 白色「＋」，强调经验）
    for (const orb of expOrbs) {
        const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius * 2);
        glow.addColorStop(0, 'rgba(80, 200, 255, 0.55)');
        glow.addColorStop(1, 'rgba(80, 200, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#19c3ff';
        ctx.fill();
        ctx.strokeStyle = '#bff0ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 中心「＋」号
        ctx.strokeStyle = '#eaffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(orb.x - orb.radius * 0.4, orb.y);
        ctx.lineTo(orb.x + orb.radius * 0.4, orb.y);
        ctx.moveTo(orb.x, orb.y - orb.radius * 0.4);
        ctx.lineTo(orb.x, orb.y + orb.radius * 0.4);
        ctx.stroke();
    }

    // 金币（金色圆饼 + ¥ 符号 + 深金描边，强调硬币）
    for (const orb of goldOrbs) {
        const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius * 2);
        glow.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
        glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 2;
        ctx.stroke();
        // ¥ 符号
        ctx.fillStyle = '#b8860b';
        ctx.font = 'bold ' + Math.round(orb.radius * 1.3) + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('¥', orb.x, orb.y + 1);
    }
}

// 绘制粒子
function drawParticles() {
    for (const p of particles) {
        if (p.radius < 0.5) continue;
        const alpha = p.life / 400;
        if (alpha < 0.05) continue;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// 绘制伤害数字
function drawDamageNumbers() {
    for (const dn of damageNumbers) {
        const alpha = dn.life / 800;
        if (alpha < 0.08) continue;
        if (dn.x < -30 || dn.x > screenWidth + 30 || dn.y < -30 || dn.y > screenHeight + 30) continue;
        ctx.fillStyle = dn.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.globalAlpha = alpha;
        if (dn.isCrit) {
            // 暴击：仅放大加粗 + 深色描边强化视觉冲击；颜色仍随元素，不使用红色
            ctx.font = 'bold 26px Arial';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.strokeText(dn.text, dn.x, dn.y);
            ctx.fillText(dn.text, dn.x, dn.y);
        } else {
            ctx.font = 'bold 15px Arial';
            ctx.fillText(dn.text, dn.x, dn.y);
        }
    }
    ctx.globalAlpha = 1;
}

// 绘制闪电
function drawLightnings() {
    for (let i = lightningEffects.length - 1; i >= 0; i--) {
        const lightning = lightningEffects[i];
        const alpha = lightning.life / 200;
        
        if (lightning.points && lightning.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(lightning.points[0].x, lightning.points[0].y);
            for (let j = 1; j < lightning.points.length; j++) {
                ctx.lineTo(lightning.points[j].x, lightning.points[j].y);
            }
            
            ctx.strokeStyle = `rgba(255, 210, 70, ${alpha * 0.5})`;
            ctx.lineWidth = 8;
            ctx.stroke();
            
            ctx.strokeStyle = `rgba(255, 225, 130, ${alpha * 0.75})`;
            ctx.lineWidth = 4;
            ctx.stroke();
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        lightning.life -= 16;
        if (lightning.life <= 0) {
            lightningEffects.splice(i, 1);
        }
    }
}

// 绘制死亡射线（天赋）特效：从玩家射出的竖向光束 + 全屏扫光
function drawDeathRays() {
    for (let i = deathRayEffects.length - 1; i >= 0; i--) {
        const r = deathRayEffects[i];
        const alpha = r.life / 400;

        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#7df9ff';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x, 0);
        ctx.stroke();

        ctx.globalAlpha = alpha * 0.22;
        ctx.fillStyle = '#7df9ff';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        ctx.restore();

        r.life -= 16;
        if (r.life <= 0) {
            deathRayEffects.splice(i, 1);
        }
    }
}

// 绘制爆炸效果
function drawBombExplosions() {
    for (let i = bombExplosionEffects.length - 1; i >= 0; i--) {
        const effect = bombExplosionEffects[i];
        effect.life -= 16;
        const maxR = effect.maxRadius || (screenWidth + screenHeight);   // 全屏炸弹效果默认扩至满屏
        const rate = maxR / 25;                                           // 约 25 帧扩至 maxRadius（爆炸范围越大环越大）
        effect.radius = Math.min(maxR, effect.radius + rate);

        const alpha = effect.life / 400;
        const lineW = (8 * (effect.radius / Math.max(1, maxR)) + 2) * alpha;  // 线宽随半径缩放
        const ringR = Math.max(0, Math.min(effect.radius, maxR - lineW / 2));  // 环外缘不超出爆炸半径

        ctx.beginPath();
        ctx.arc(effect.x, effect.y, ringR, 0, Math.PI * 2);
        // 支持冰霜爆炸等自定义颜色；默认火焰橙
        const color = effect.color || [255, 106, 20];
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.8})`;
        ctx.lineWidth = lineW;
        ctx.stroke();

        if (effect.life <= 0) {
            bombExplosionEffects.splice(i, 1);
        }
    }
}

// 绘制UI
function drawUI() {
    const stage = getCurrentStage();

    // ========== 顶部信息栏 ==========
    // 左上角信息面板（使用安全顶部偏移）
    const panelX = 10;
    const panelY = SAFE_TOP_OFFSET + 20;
    const panelW = 145;
    const panelH = 58;

    // 背景（皇室战争风面板）
    drawRoyalePanel(panelX, panelY, panelW, panelH, 8);
    
    // 第一行：关卡名称（黄色）
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`第${currentStage}关 ${stage.name}`, panelX + 8, panelY + 12);

    // 五行属性点（面板右上角）：提示本章怪物属性（单系圆点 / 双系相生双色）
    if (stage.elements && stage.elements.length > 1) {
        ctx.fillStyle = ELEMENT_RING[stage.elements[0]] || '#fff';
        ctx.beginPath(); ctx.arc(panelX + panelW - 14, panelY + 12, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ELEMENT_RING[stage.elements[1]] || '#fff';
        ctx.beginPath(); ctx.arc(panelX + panelW - 4, panelY + 12, 4, 0, Math.PI * 2); ctx.fill();
    } else if (ELEMENT_RING[stage.element]) {
        ctx.fillStyle = ELEMENT_RING[stage.element];
        ctx.beginPath(); ctx.arc(panelX + panelW - 9, panelY + 12, 4, 0, Math.PI * 2); ctx.fill();
    }
    
    // 第二行：等级 + 经验条
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Lv.${player.level}`, panelX + 8, panelY + 30);
    
    // 经验条（蓝色渐变风格）
    const expBarX = panelX + 40;
    const expBarY = panelY + 26;
    const expBarW = 60;
    const expBarH = 6;
    
    ctx.fillStyle = 'rgba(50,50,50,0.8)';
    ctx.fillRect(expBarX, expBarY, expBarW, expBarH);
    
    const expPercent = player.level < MAX_LEVEL ? (player.exp / player.expToLevel) : 1;
    const expGradient = ctx.createLinearGradient(expBarX, 0, expBarX + expBarW, 0);
    expGradient.addColorStop(0, '#4488ff');
    expGradient.addColorStop(1, '#44ccff');
    ctx.fillStyle = expGradient;
    ctx.fillRect(expBarX, expBarY, expBarW * expPercent, expBarH);
    
    // 第三行：击杀、金币、波次进度（同一行）
    const waveStr = `🌊 ${Math.min(wavesSpawned, WAVE_COUNT)}/${WAVE_COUNT}`;

    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`👾${player.kills} 💰${player.gold}`, panelX + 8, panelY + 48);

    // 波次进度放右边（当前波次 / 总波次）
    ctx.fillStyle = '#9fe3ff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(waveStr, panelX + panelW - 8, panelY + 48);
    
    // ========== 右上角按钮（音效+暂停）==========
    // 避开微信胶囊按钮区域（右上角约90像素宽度）
    drawTopRightButtons();
    
    // ========== 技能栏（底部） ==========
    drawSkillUI();
    
    // ========== 炸弹按钮（右下角圆形） ==========
    drawBombButton();
}

// 绘制炸弹按钮（圆形）
function drawBombButton() {
    const btnX = screenWidth - 48;
    const btnY = screenHeight - 48;
    const btnR = 27; // 55px直径 / 2
    
    // 发光效果（可用时）
    const isAvailable = bombCount > 0 && bombCooldown <= 0;
    if (isAvailable) {
        ctx.beginPath();
        ctx.arc(btnX, btnY, btnR + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 90, 95, 0.35)';
        ctx.fill();
    }

    // 按钮背景（暗底）
    ctx.beginPath();
    ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 20, 36, 0.92)';
    ctx.fill();

    // 边框（可用时金色，否则蓝灰）
    ctx.strokeStyle = isAvailable ? ROYALE.gold : 'rgba(125, 175, 225, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 炸弹图标（红色）
    ctx.fillStyle = '#ff5a5f';
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', btnX, btnY - 5);

    // 数量（金色）
    ctx.fillStyle = ROYALE.gold;
    ctx.font = 'bold 11px Arial';
    ctx.fillText(`x${bombCount}`, btnX, btnY + 14);
    
    // 冷却遮罩（使用conic-gradient效果模拟）
    if (bombCooldown > 0) {
        const cooldownPercent = bombCooldown / BOMB_COOLDOWN_TIME;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + cooldownPercent * Math.PI * 2;

        ctx.beginPath();
        ctx.moveTo(btnX, btnY);
        ctx.arc(btnX, btnY, btnR, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fill();

        // 冷却时间文字
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${Math.ceil(bombCooldown / 1000)}`, btnX, btnY);
    }

    // 流量主：广告遮罩 + 播放图标（无弹 或 冷却中，点击看广告补发炸弹）
    const showAdMask = (bombCount <= 0 || bombCooldown > 0);
    if (showAdMask && bombCount <= 0 && bombCooldown <= 0) {
        // 完全无弹且无冷却时，整圈加一层深色遮罩
        ctx.beginPath();
        ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();
    }
    if (showAdMask) {
        // 半透明高亮环，提示可点击
        ctx.beginPath();
        ctx.arc(btnX, btnY, btnR + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 播放三角（白色）
        const pSize = 10;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(btnX - pSize * 0.45, btnY - pSize * 0.8);
        ctx.lineTo(btnX - pSize * 0.45, btnY + pSize * 0.8);
        ctx.lineTo(btnX + pSize * 0.75, btnY);
        ctx.closePath();
        ctx.fill();

        // 小标签「看广告」
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('看广告', btnX, btnY + 19);
    }
}

// ==================== 买量素材演示引导 ====================
// 绘制素材演示引导动画
function drawAdDemoGuide() {
    if (!isAdDemoMode) return;

    adDemoTimer++;

    const bombBtnX = screenWidth - 48;
    const bombBtnY = screenHeight - 48;

    if (adDemoState === 'guiding') {
        // 炸弹按钮加强闪光边框
        const glowIntensity = 0.5 + Math.sin(adDemoTimer * 0.15) * 0.5;
        const glowSize = 45 + Math.sin(adDemoTimer * 0.1) * 8;

        // 外层发光
        ctx.beginPath();
        ctx.arc(bombBtnX, bombBtnY, glowSize, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 68, 68, ${glowIntensity * 0.4})`;
        ctx.lineWidth = 12;
        ctx.stroke();

        // 中层闪光
        ctx.beginPath();
        ctx.arc(bombBtnX, bombBtnY, 40, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 68, ${glowIntensity})`;
        ctx.lineWidth = 6;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -adDemoTimer * 0.8;
        ctx.stroke();
        ctx.setLineDash([]);

        // 内层实线
        ctx.beginPath();
        ctx.arc(bombBtnX, bombBtnY, 35, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 100, 100, ${0.6 + glowIntensity * 0.4})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        // 绘制"点击炸弹"文字
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 文字阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText('点击炸弹', bombBtnX + 1, bombBtnY - 65 + 1);
        ctx.fillStyle = '#ffdd44';
        ctx.fillText('点击炸弹', bombBtnX, bombBtnY - 65);

        // 文字闪烁
        if (Math.floor(adDemoTimer / 15) % 2 === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('💣 一发清屏！', bombBtnX, bombBtnY - 90);
        }

    } else if (adDemoState === 'exploding') {
        // 180帧后退出引导模式，继续正常游戏
        if (adDemoTimer >= 200) {
            isAdDemoMode = false;
            adDemoState = 'waiting';
        }
    }
}

// 绘制右上角按钮（音效+暂停）
function drawTopRightButtons() {
    // 音效按钮（皇室战争风：暗底 + 金边）
    ctx.fillStyle = 'rgba(8, 20, 36, 0.85)';
    roundRect(ctx, soundBtnX, soundBtnY, buttonSize, buttonSize, 10);
    ctx.fill();

    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, soundBtnX, soundBtnY, buttonSize, buttonSize, 10);
    ctx.stroke();
    
    // 音效图标
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(soundEnabled ? '🔊' : '🔇', soundBtnX + buttonSize / 2, soundBtnY + buttonSize / 2);
    
    // 暂停按钮（皇室战争风：暗底 + 金边）
    ctx.fillStyle = 'rgba(8, 20, 36, 0.85)';
    roundRect(ctx, pauseBtnX, pauseBtnY, buttonSize, buttonSize, 10);
    ctx.fill();

    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, pauseBtnX, pauseBtnY, buttonSize, buttonSize, 10);
    ctx.stroke();
    
    // 暂停图标
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gamePaused ? '▶️' : '⏸️', pauseBtnX + buttonSize / 2, pauseBtnY + buttonSize / 2);
}

// 绘制暂停弹窗
function drawPauseModal() {
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // 弹窗背景（皇室战争风面板）
    const modalW = 220;
    const modalH = 160;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = screenHeight - 130 - modalH;
    drawRoyalePanel(modalX, modalY, modalW, modalH, 10);

    // 标题
    ctx.fillStyle = ROYALE.gold;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏸ 游戏暂停', screenWidth / 2, modalY + 30);

    // 按钮（皇室战争风立体按钮）
    const btnSize = 48;
    const gap = 15;
    const totalW = btnSize * 2 + gap;
    const startX = screenWidth / 2 - totalW / 2;
    const btnY = modalY + 65;
    drawRoyaleBevelButton({ x: startX, y: btnY, w: btnSize, h: btnSize, r: 8 }, '继续', 'green');
    drawRoyaleBevelButton({ x: startX + btnSize + gap, y: btnY, w: btnSize, h: btnSize, r: 8 }, '关卡', 'blue');
}

// 绘制技能UI（复刻H5版本 - 底部居中，小方块）
function drawSkillUI() {
    const skillSize = 32;
    const skillGap = 4;
    const maxPerRow = 5;
    
    // 获取已获得的技能
    const activeSkills = [];
    for (const [key, skill] of Object.entries(skills)) {
        if (skill.level > 0) {
            activeSkills.push({ key, ...skill });
        }
    }
    
    if (activeSkills.length === 0) return;
    
    // 计算总宽度，居中显示
    const totalWidth = Math.min(activeSkills.length, maxPerRow) * (skillSize + skillGap) - skillGap;
    let skillX = (screenWidth - totalWidth) / 2;
    let skillY = screenHeight - 38;
    
    activeSkills.forEach((skill, index) => {
        // 换行处理
        if (index > 0 && index % maxPerRow === 0) {
            skillX = (screenWidth - totalWidth) / 2;
            skillY -= skillSize + skillGap + 2;
        }
        
        // 技能按钮背景（皇室战争风：暗底 + 金边 + 顶部高光）
        ctx.fillStyle = 'rgba(8, 20, 36, 0.85)';
        roundRect(ctx, skillX, skillY, skillSize, skillSize, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundRect(ctx, skillX + 1, skillY + 1, skillSize - 2, skillSize * 0.4, 5);
        ctx.fill();
        ctx.strokeStyle = ROYALE.gold;
        ctx.lineWidth = 1.5;
        roundRect(ctx, skillX, skillY, skillSize, skillSize, 6);
        ctx.stroke();
        
        // 图标
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(skill.icon, skillX + skillSize / 2, skillY + skillSize / 2 - 3);
        
        // 等级
        ctx.fillStyle = ROYALE.gold;
        ctx.font = '7px Arial';
        ctx.fillText(`Lv${skill.level}`, skillX + skillSize / 2, skillY + skillSize - 4);

        // 技能释放 CD 冷却遮罩（地雷/油渍/龙卷风）：参考炸弹，黑色径向扇形 + 剩余秒数
        const cdInfo = getSkillCooldown(skill.key);
        if (cdInfo && cdInfo.timer > 0 && cdInfo.timer < cdInfo.interval) {
            const remain = cdInfo.interval - cdInfo.timer;
            const cx = skillX + skillSize / 2;
            const cy = skillY + skillSize / 2;
            const cr = skillSize / 2 - 1;
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + (remain / cdInfo.interval) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, cr, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.ceil(remain / 1000)}`, cx, cy);
        }

        skillX += skillSize + skillGap;
    });
}

// 获取指定技能的释放 CD 进度（timer 从 0 计到 interval，返回剩余时间）
function getSkillCooldown(key) {
    // 子弹类属性技能：按自身独立 cd（_lastFire 时间戳）算进度
    if (ATTRIBUTE_BULLET_TYPES.indexOf(key) >= 0) {
        const interval = getAttrReleaseCd(key);
        const elapsed = Date.now() - ((skills[key] && skills[key]._lastFire) || 0);
        return { timer: Math.min(elapsed, interval), interval: interval };
    }
    return null;
}

// 圆角矩形辅助函数
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ==================== 皇室战争风（ROYALE）绘制体系 ====================
// 深蓝底 + 金色描边/高光 + 立体按钮，前景元素高对比，避免刺眼
const ROYALE = {
    bgTop: '#0c1f38',
    bgMid: '#102a4a',
    bgBottom: '#16385e',
    panel: 'rgba(11, 28, 50, 0.92)',
    panelLight: 'rgba(26, 54, 90, 0.92)',
    panelBorder: 'rgba(125, 175, 225, 0.55)',
    panelHighlight: 'rgba(255, 255, 255, 0.08)',
    gold: '#ffd24a',
    goldTop: '#ffe79a',
    goldBot: '#e6a417',
    goldEdge: '#b97e0c',
    blue: '#4fc3f7',
    blueTop: '#8fd6ff',
    blueBot: '#2a8fd6',
    blueEdge: '#1c5e93',
    purple: '#a06bff',
    green: '#5dd47f',
    red: '#ff5a5f',
    white: '#ffffff',
    textMuted: '#9fb4cc'
};

function drawRoyaleBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, screenHeight);
    g.addColorStop(0, ROYALE.bgTop);
    g.addColorStop(0.55, ROYALE.bgMid);
    g.addColorStop(1, ROYALE.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    // 顶部柔和蓝色光晕
    const rg = ctx.createRadialGradient(screenWidth / 2, -screenHeight * 0.2, 0, screenWidth / 2, -screenHeight * 0.2, screenWidth);
    rg.addColorStop(0, 'rgba(70, 120, 185, 0.30)');
    rg.addColorStop(1, 'rgba(70, 120, 185, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
}

// 圆角面板：阴影 + 顶部高光 + 描边
function drawRoyalePanel(x, y, w, h, r) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = ROYALE.panel;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = ROYALE.panelHighlight;
    roundRect(ctx, x + 2, y + 2, w - 4, Math.max(4, h * 0.35), r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = ROYALE.panelBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
}

// 立体按钮：底部暗边 + 渐变面 + 顶部高光 + 文字
function drawRoyaleBevelButton(btn, text, style) {
    const styles = {
        gold: { top: ROYALE.goldTop, bot: ROYALE.goldBot, edge: ROYALE.goldEdge, txt: '#5a3a00' },
        blue: { top: ROYALE.blueTop, bot: ROYALE.blueBot, edge: ROYALE.blueEdge, txt: '#06243a' },
        purple: { top: '#c79bff', bot: '#7a45d6', edge: '#542a9c', txt: '#ffffff' },
        green: { top: '#8be8a6', bot: '#34a35c', edge: '#1f7a40', txt: '#06351a' },
        red: { top: '#ff9a9e', bot: '#e23b40', edge: '#a31f24', txt: '#ffffff' }
    };
    const s = styles[style] || styles.gold;
    const r = btn.r || 10;
    // 底部暗边（立体感）
    ctx.fillStyle = s.edge;
    roundRect(ctx, btn.x, btn.y + 3, btn.w, btn.h, r);
    ctx.fill();
    // 主面渐变
    const g = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.h);
    g.addColorStop(0, s.top);
    g.addColorStop(1, s.bot);
    ctx.fillStyle = g;
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, r);
    ctx.fill();
    // 顶部高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    roundRect(ctx, btn.x + 3, btn.y + 3, btn.w - 6, Math.max(3, btn.h * 0.38), r * 0.6);
    ctx.fill();
    // 文字
    ctx.fillStyle = s.txt;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, btn.x + btn.w / 2, btn.y + btn.h / 2);
    ctx.textBaseline = 'alphabetic';
}

function royaleFmt(n) {
    n = n || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return '' + n;
}

function royaleCoin(cx, cy, r) {
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe89a';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

function royaleGem(cx, cy, r) {
    ctx.fillStyle = ROYALE.purple;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy);
    ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.8, cy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy);
    ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
}

function royaleBolt(cx, cy, r) {
    ctx.fillStyle = ROYALE.blue;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.2, cy - r);
    ctx.lineTo(cx - r * 0.5, cy + r * 0.1);
    ctx.lineTo(cx, cy + r * 0.1);
    ctx.lineTo(cx - r * 0.2, cy + r);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.1);
    ctx.lineTo(cx, cy - r * 0.1);
    ctx.closePath(); ctx.fill();
}

function royaleShield(cx, cy, r, level) {
    ctx.fillStyle = ROYALE.blueBot;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.8, cy + r * 0.7);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.8, cy + r * 0.7);
    ctx.lineTo(cx - r, cy - r * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ROYALE.gold; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(level, cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
}

// 主角界面顶部资源栏（等级盾 + 金币 + 钻石 + 能量）
function drawHeroResourceBar(topOffset) {
    updateEnergyRealtime();
    const barY = topOffset + 38;
    const barH = 34;
    const barX = 12;
    const barW = screenWidth - 24;
    ctx.fillStyle = 'rgba(8, 20, 36, 0.85)';
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();
    ctx.strokeStyle = ROYALE.panelBorder; ctx.lineWidth = 1.5;
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.stroke();

    const cyMid = barY + barH / 2;
    royaleShield(barX + 24, cyMid, 14, player.level);

    let cx = barX + 64;
    royaleCoin(cx, cyMid, 9);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(royaleFmt(player.gold), cx + 14, cyMid);

    cx += 96;
    royaleGem(cx, cyMid, 9);
    ctx.fillStyle = '#fff'; ctx.fillText(royaleFmt(player.diamond || 0), cx + 14, cyMid);

    cx += 96;
    royaleBolt(cx, cyMid, 10);
    ctx.fillStyle = '#fff'; ctx.fillText(playerEnergy + '/' + ENERGY_CONFIG.maxEnergy, cx + 14, cyMid);
    ctx.textBaseline = 'alphabetic';
}

// ==================== 开始界面 ====================
function drawStartScreen() {
    drawBackground();
    
    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👾 制霸新手村的骷髅怪 🎯', screenWidth / 2, screenHeight * 0.30);
    
    // 说明
    ctx.fillStyle = '#fff';
    ctx.font = '13px Arial';
    const instructions = [
        '🎮 角色固定在屏幕下方',
        '🔫 自动射击最近的敌人',
        '⬆️ 升级可选择技能强化',
        '⏱️ 坚持5分钟即可通关！'
    ];
    const startY = screenHeight * 0.42;
    instructions.forEach((text, i) => {
        ctx.fillText(text, screenWidth / 2, startY + i * 22);
    });
    
    // 开始按钮（皇室战争风立体金按钮）
    const btnW = 150;
    const btnH = 48;
    drawRoyaleBevelButton({ x: screenWidth / 2 - btnW / 2, y: screenHeight * 0.68, w: btnW, h: btnH, r: 12 }, '开始游戏', 'gold');
}

// 关卡选择界面
function drawStageSelect() {
    drawBackground();
    
    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎮 选择关卡', screenWidth / 2, 40);
    
    const cols = 2;
    const marginX = 20;
    const marginY = 70;
    const cardW = (screenWidth - marginX * 2 - (cols - 1) * 10) / cols;
    const cardH = 90;
    const cardGap = 10;
    
    STAGES.forEach((stage, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = marginX + col * (cardW + cardGap);
        const y = marginY + row * (cardH + cardGap);
        
        const isUnlocked = i === 0 || stageProgress[i - 1];
        const isCompleted = stageProgress[i];
        
        // 卡片背景
        ctx.fillStyle = isUnlocked ? ROYALE.panelLight : ROYALE.panel;
        roundRect(ctx, x, y, cardW, cardH, 8);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = isCompleted ? ROYALE.green : (isUnlocked ? ROYALE.blue : 'rgba(125,175,225,0.25)');
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, cardW, cardH, 8);
        ctx.stroke();

        // 五行属性徽标（单系圆点 / 双系相生双色）
        if (stage.elements && stage.elements.length > 1) {
            ctx.fillStyle = ELEMENT_RING[stage.elements[0]] || '#fff';
            ctx.beginPath(); ctx.arc(x + cardW - 17, y + 14, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = ELEMENT_RING[stage.elements[1]] || '#fff';
            ctx.beginPath(); ctx.arc(x + cardW - 5, y + 14, 6, 0, Math.PI * 2); ctx.fill();
        } else if (ELEMENT_RING[stage.element]) {
            ctx.fillStyle = ELEMENT_RING[stage.element];
            ctx.beginPath(); ctx.arc(x + cardW - 12, y + 14, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1; ctx.stroke();
        }
        
        // 图标
        ctx.font = '26px Arial';
        ctx.fillStyle = isUnlocked ? '#fff' : '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stage.icon, x + cardW / 2, y + 28);
        
        // 名称
        ctx.fillStyle = isUnlocked ? '#fff' : '#666';
        ctx.font = 'bold 11px Arial';
        ctx.fillText(`第${stage.id}关`, x + cardW / 2, y + 52);
        
        // 描述
        ctx.font = '9px Arial';
        ctx.fillStyle = isUnlocked ? '#aaa' : '#555';
        ctx.fillText(stage.name, x + cardW / 2, y + 70);
        
        // 锁定
        if (!isUnlocked) {
            ctx.fillStyle = '#666';
            ctx.font = '18px Arial';
            ctx.fillText('🔒', x + cardW / 2, y + cardH / 2);
        }
    });
}

// 游戏结束界面
// 结算弹窗中突出显示「本次获得金币」的金色横幅（绘制与点击无关，仅展示）
function drawGoldBanner(x, y, w, h, amount) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#fff4c2');
    g.addColorStop(0.5, '#ffd24d');
    g.addColorStop(1, '#efa515');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = '#b9790a';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7a4a00';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('🪙 本次获得金币', x + w / 2, y + 16);
    ctx.fillStyle = '#5a3300';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(String(amount), x + w / 2, y + 38);
}

function drawGameOver() {
    // 半透明遮罩
    ctx.fillStyle = 'rgba(8, 18, 33, 0.82)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗
    const modalW = Math.min(300, screenWidth * 0.85);
    const modalH = 248;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = screenHeight - 130 - modalH;

    drawRoyalePanel(modalX, modalY, modalW, modalH, 14);
    // 顶部红色描边强调
    ctx.strokeStyle = ROYALE.red;
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 14);
    ctx.stroke();
    
    // 标题
    ctx.fillStyle = ROYALE.red;
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👾 游戏结束', screenWidth / 2, modalY + 34);
    
    // 统计信息
    ctx.fillStyle = '#cfd8e3';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`最终等级: ${player.level}`, screenWidth / 2, modalY + 62);
    ctx.fillText(`击杀僵尸: ${player.kills}`, screenWidth / 2, modalY + 84);
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    ctx.fillText(`存活时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, screenWidth / 2, modalY + 106);
    
    // 突出显示：本次获得金币
    drawGoldBanner(modalX + 16, modalY + 118, modalW - 32, 50, stageGoldEarned);
    
    // 按钮（皇室战争风立体按钮）：重玩 / 变强 / 返回
    const btnSize = 42;
    const gap = 12;
    const totalW = btnSize * 3 + gap * 2;
    const startX = screenWidth / 2 - totalW / 2;
    const btnY = modalY + 184;

    drawRoyaleBevelButton({ x: startX, y: btnY, w: btnSize, h: btnSize, r: 10 }, '🔄', 'red');
    drawRoyaleBevelButton({ x: startX + (btnSize + gap), y: btnY, w: btnSize, h: btnSize, r: 10 }, '💪', 'gold');
    drawRoyaleBevelButton({ x: startX + (btnSize + gap) * 2, y: btnY, w: btnSize, h: btnSize, r: 10 }, '📋', 'blue');

    // 按钮文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('重玩', startX + btnSize / 2, btnY + btnSize + 14);
    ctx.fillText('变强', startX + (btnSize + gap) + btnSize / 2, btnY + btnSize + 14);
    ctx.fillText('返回', startX + (btnSize + gap) * 2 + btnSize / 2, btnY + btnSize + 14);
}

// 通关界面
function drawVictory() {
    // 半透明遮罩
    ctx.fillStyle = 'rgba(8, 18, 33, 0.82)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗
    const modalW = Math.min(300, screenWidth * 0.85);
    const modalH = 268;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = screenHeight - 130 - modalH;
    
    drawRoyalePanel(modalX, modalY, modalW, modalH, 14);
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 14);
    ctx.stroke();
    
    // 标题
    ctx.fillStyle = ROYALE.gold;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎉 通关成功！', screenWidth / 2, modalY + 34);
    
    // 统计信息
    ctx.fillStyle = '#cfd8e3';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🏆 第${currentStage}关 完成！`, screenWidth / 2, modalY + 62);
    ctx.fillText(`最终等级: ${player.level}`, screenWidth / 2, modalY + 84);
    ctx.fillText(`击杀僵尸: ${player.kills}`, screenWidth / 2, modalY + 106);
    
    // 突出显示：本次获得金币
    drawGoldBanner(modalX + 16, modalY + 118, modalW - 32, 50, stageGoldEarned);
    
    // 按钮（正方形，与技能图标样式一致）—— 下一关 / 重玩 / 关卡（全通关时无「下一关」）
    const btnSize = 48;
    const gap = 15;
    const btnY = modalY + 186;
    const buttons = (currentStage < STAGES.length)
        ? [ { icon: '▶️', color: 'green', label: '下一关' },
            { icon: '🔄', color: 'gold',  label: '重玩' },
            { icon: '📋', color: 'blue',  label: '关卡' } ]
        : [ { icon: '🔄', color: 'gold',  label: '重玩' },
            { icon: '📋', color: 'blue',  label: '关卡' } ];
    const totalW = btnSize * buttons.length + gap * (buttons.length - 1);
    const startX = screenWidth / 2 - totalW / 2;
    buttons.forEach((b, i) => {
        const bx = startX + i * (btnSize + gap);
        drawRoyaleBevelButton({ x: bx, y: btnY, w: btnSize, h: btnSize, r: 10 }, b.icon, b.color);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(b.label, bx + btnSize / 2, btnY + btnSize + 14);
    });
}

// 升级面板（带外框的精美弹窗）
// 按卡片可用宽度截断技能名（末尾加 …），自适应不同卡片宽度
function fitText(text, maxWidth) {
    if (!text) return text;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) {
        t = t.slice(0, -1);
    }
    return t + '…';
}

// 三选一升级面板卡片尺寸（全局常量，绘制与点击检测共用，避免不一致）
const UPGRADE_CARD_W = 95;
const UPGRADE_CARD_H = 148;
const UPGRADE_CARD_GAP = 8;

// 按卡片内侧宽度把描述折成最多 maxLines 行，超出时最后一行末尾加 …
// 优先在中文标点/空格处断行，避免行首出现标点
function wrapText(text, maxWidth, maxLines) {
    if (!text) return [];
    const SEP = ' ，；。、/+%-';
    // 把标点/空格贴在前面一个 token 上，保持行首不会是标点
    const tokens = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (SEP.includes(ch) && tokens.length) {
            tokens[tokens.length - 1] += ch;
        } else {
            tokens.push(ch);
        }
    }
    const lines = [];
    for (const tk of tokens) {
        const last = lines.length ? lines[lines.length - 1] : '';
        const next = last + tk;
        if (!last || ctx.measureText(next).width <= maxWidth) {
            if (lines.length) lines[lines.length - 1] = next;
            else lines.push(next);
        } else {
            lines.push(tk);
        }
    }
    if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        let last = kept[kept.length - 1];
        while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
            last = last.slice(0, -1);
        }
        kept[kept.length - 1] = last + '…';
        return kept;
    }
    return lines;
}

function drawUpgradePanel() {
    if (isSkillLab) { drawUpgradeList(); return; }
    // 计算面板尺寸
    const cardW = UPGRADE_CARD_W;
    const cardH = UPGRADE_CARD_H;
    const cardGap = UPGRADE_CARD_GAP;
    const totalWidth = cardW * 3 + cardGap * 2;

    // 计算高度（根据是否显示炸弹提示）
    let bombReminderH = 0;
    if (justGotBomb) {
        bombReminderH = 48; // 高度增加50%
    } else if (bombFull) {
        bombReminderH = 36;
    }

    const titleH = 45;
    const padding = 20;
    const panelH = titleH + bombReminderH + cardH + padding * 2 + 10;

    const panelX = Math.max(10, (screenWidth - totalWidth) / 2 - 25);
    const panelY = screenHeight - 130 - panelH;
    const panelW = Math.min(screenWidth - 20, totalWidth + 50);
    
    // 外框（皇室战争风深蓝面板 + 金色描边）
    drawRoyalePanel(panelX, panelY, panelW, panelH, 15);
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 3;
    roundRect(ctx, panelX, panelY, panelW, panelH, 15);
    ctx.stroke();
    
    // 内边框装饰线
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, panelX + 6, panelY + 6, panelW - 12, panelH - 12, 12);
    ctx.stroke();
    
    // 标题
    let currentY = panelY + titleH / 2 + 5;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⬆️ 选择升级', screenWidth / 2, currentY);
    
    // 炸弹获得提示（呼吸动画 + 与技能图标同宽）
    if (justGotBomb) {
        currentY += titleH / 2;
        // 宽度与三个技能图标总宽一致
        const reminderW = totalWidth;
        const reminderH = 48; // 高度增加50%（32 -> 48）
        const reminderX = (screenWidth - reminderW) / 2;
        const reminderY = currentY;

        // 呼吸动画（透明度0.7-1.0，缩放0.95-1.0）
        const breathe = Math.sin(Date.now() * 0.005) * 0.15 + 0.85;
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.03;

        ctx.save();
        ctx.globalAlpha = breathe;
        ctx.translate(screenWidth / 2, reminderY + reminderH / 2);
        ctx.scale(scale, scale);
        ctx.translate(-screenWidth / 2, -(reminderY + reminderH / 2));

        // 炸弹提示背景（渐变）
        const bombGradient = ctx.createLinearGradient(reminderX, reminderY, reminderX + reminderW, reminderY);
        bombGradient.addColorStop(0, '#ff6644');
        bombGradient.addColorStop(0.5, '#ff4433');
        bombGradient.addColorStop(1, '#cc3322');
        ctx.fillStyle = bombGradient;
        roundRect(ctx, reminderX, reminderY, reminderW, reminderH, 8);
        ctx.fill();

        // 边框发光效果
        ctx.shadowColor = '#ff6644';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = '#ffaa88';
        ctx.lineWidth = 2;
        roundRect(ctx, reminderX, reminderY, reminderW, reminderH, 8);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bombFull ? '💣 炸弹已满！(3/3)' : '💣 获得炸弹 x1！', screenWidth / 2, reminderY + reminderH / 2);

        ctx.restore();

        currentY += reminderH + 8;
    } else if (bombFull) {
        currentY += titleH / 2 + 5;
        // 宽度与三个技能图标总宽一致
        const reminderW = totalWidth;
        const reminderH = 36;
        const reminderX = (screenWidth - reminderW) / 2;
        const reminderY = currentY;

        // 呼吸动画
        const breathe = Math.sin(Date.now() * 0.004) * 0.1 + 0.9;

        ctx.save();
        ctx.globalAlpha = breathe;

        ctx.fillStyle = 'rgba(80, 80, 80, 0.9)';
        roundRect(ctx, reminderX, reminderY, reminderW, reminderH, 6);
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        roundRect(ctx, reminderX, reminderY, reminderW, reminderH, 6);
        ctx.stroke();

        ctx.fillStyle = '#ccc';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣 炸弹已满 (3/3)', screenWidth / 2, reminderY + reminderH / 2);

        ctx.restore();
        
        currentY += reminderH + 5;
    } else {
        currentY += titleH / 2 + 5;
    }
    
    // 三个卡片
    const startX = (screenWidth - totalWidth) / 2;
    const startY = currentY;
    
    upgradeOptions.forEach((opt, i) => {
        const x = startX + i * (cardW + cardGap);
        const y = startY;
        
        // 卡片阴影
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        // 卡片背景
        const cardGradient = ctx.createLinearGradient(x, y, x, y + cardH);
        cardGradient.addColorStop(0, '#1c3a5e');
        cardGradient.addColorStop(1, '#0f2440');
        ctx.fillStyle = cardGradient;
        roundRect(ctx, x, y, cardW, cardH, 10);
        ctx.fill();
        
        // 清除阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // 卡片边框
        let borderColor = '#ffd700';
        if (opt.type === 'skill') borderColor = '#66aaff';
        else if (opt.type === 'stat') borderColor = '#ff8844';
        
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, cardW, cardH, 10);
        ctx.stroke();
        
        // 图标
        ctx.fillStyle = '#fff';
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opt.icon, x + cardW / 2, y + 32);
        
        // 名称（分支卡名字带大类前缀，字号略小以适配卡片宽度）
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (opt.branch) {
            ctx.font = 'bold 10px Arial';
            ctx.fillText(fitText(opt.name, cardW - 10), x + cardW / 2, y + 58);
            // 等级放在名字下方，蓝色小字（向大类卡看齐）
            ctx.fillStyle = '#66aaff';
            ctx.font = '10px Arial';
            ctx.fillText('Lv.' + opt.branchLevel, x + cardW / 2, y + 74);
        } else {
            ctx.font = 'bold 11px Arial';
            ctx.fillText(fitText(opt.name, cardW - 10), x + cardW / 2, y + 60);
        }
        
        // 描述（按卡片内侧宽度自适应折行，最多 5 行，约可完整显示 50 个汉字）
        ctx.fillStyle = '#999';
        ctx.font = '8px Arial';
        const descLines = wrapText(opt.desc || '', cardW - 14, 5);
        const descY = opt.branch ? 90 : 88;
        if (descLines.length === 1) {
            ctx.fillText(descLines[0], x + cardW / 2, y + descY + 6);
        } else {
            descLines.forEach((line, i) => {
                ctx.fillText(line, x + cardW / 2, y + descY + i * 12);
            });
        }

        // 质变节点徽标（Phase2）：下一级为质变节点时显示金色「质变」角标
        const _nx = (skills[opt.type] ? skills[opt.type].level : 0) + 1;
        const _qn = SKILL_DEFS[opt.type] && SKILL_DEFS[opt.type].qualNodes && SKILL_DEFS[opt.type].qualNodes[_nx];
        if (_qn) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            roundRect(ctx, x + cardW - 28, y + 3, 24, 14, 4);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.fillText('质变', x + cardW - 16, y + 10);
        }

        // 衍生分支卡徽标：紫色「分支」（与右上「质变」区分）
        if (opt.branch) {
            ctx.fillStyle = '#b06bff';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            roundRect(ctx, x + 4, y + 3, 30, 14, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText('分支', x + 19, y + 10);
        }
    });
}

// 技能实验室：全技能网格布局（绘制与点击共用，保证命中一致）
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

// 技能实验室：把所有可选技能以网格列出，玩家点击任一即强化（5 槽上限同正式关）
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

        // 名称（分支卡名字带大类前缀）
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (opt.branch) {
            ctx.font = 'bold 11px Arial';
            ctx.fillText(fitText(opt.name, L.cellW - 12), x + L.cellW / 2, y + 46);
            // 等级放在名字下方，蓝色小字（向大类卡看齐）
            ctx.fillStyle = '#66aaff';
            ctx.font = '10px Arial';
            ctx.fillText('Lv.' + opt.branchLevel, x + L.cellW / 2, y + 62);
        } else {
            ctx.font = 'bold 13px Arial';
            ctx.fillText(fitText(opt.name, L.cellW - 12), x + L.cellW / 2, y + 52);
        }

        // 等级 / 状态（非分支卡显示 Lv. 或 未获得；分支卡用顶部「分支」徽标）
        if (!opt.branch) {
            ctx.fillStyle = isOwned ? '#66aaff' : '#888';
            ctx.font = 'bold 11px Arial';
            ctx.fillText(isOwned ? ('Lv.' + lv) : '未获得', x + L.cellW / 2, y + 70);
        }

        // 描述（按卡片内侧宽度自适应折行，最多 2 行；分支卡因多了等级行，整体下移）
        ctx.fillStyle = '#bbb';
        ctx.font = '10px Arial';
        const labDescLines = wrapText(opt.desc || '', L.cellW - 16, 2);
        const descBaseY = opt.branch ? 80 : 88;
        if (labDescLines.length === 1) {
            ctx.fillText(labDescLines[0], x + L.cellW / 2, y + descBaseY + 8);
        } else {
            labDescLines.forEach((line, i) => {
                ctx.fillText(line, x + L.cellW / 2, y + descBaseY + i * 13);
            });
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

        // 衍生分支卡徽标：紫色「分支」
        if (opt.branch) {
            ctx.fillStyle = '#b06bff';
            roundRect(ctx, x + 4, y + 4, 30, 14, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('分支', x + 19, y + 11);
        }
    }

    // 底部提示
    ctx.fillStyle = '#9aa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('点击任意技能强化 · 5 槽上限同正式关 · 暂停可退出', screenWidth / 2, screenHeight - 35);
}

// ==================== 游戏逻辑 ====================

// 射击
// 基础武器（火力强化）：持续发射物理子弹，射速仅由火力强化决定，完全独立于属性技能
// 计算某技能应瞄准的角度：打「离墙第 n 近」的可射击怪物。
// n = 该技能在技能树中的解锁顺序（普通子弹占第 1 槽，之后按解锁先后递增）。
// 离墙距离相同则进一步比较离坦克距离，取更近者。不足 n 个时取最靠后者兜底。
function getSlotTarget(n) {
    const shootable = [];
    for (const z of zombies) {
        if (!zombieShootable(z)) continue;
        const wallDist = WALL_Y - z.y - z.radius;                 // 僵尸底边到城墙顶面的竖直间隙（钉墙时为 0，最优先）
        const playerDist = Math.hypot(z.x - player.x, z.y - player.y);
        shootable.push({ z, wallDist, playerDist });
    }
    if (shootable.length === 0) return null;
    shootable.sort((a, b) => (a.wallDist - b.wallDist) || (a.playerDist - b.playerDist));
    return shootable[Math.min(n - 1, shootable.length - 1)].z;
}
function aimAngleForSlot(n) {
    const target = getSlotTarget(n);
    return target ? Math.atan2(target.y - player.y, target.x - player.x) : null;
}

// 技能槽序号：普通子弹(damage)=1，其余按技能树解锁顺序递增（acquiredSkills 即解锁顺序数组）
function skillSlotOf(type) {
    const idx = acquiredSkills.indexOf(type);
    return idx < 0 ? 1 : idx + 1;
}

function shootBase() {
    if (zombies.length === 0) return;

    // 播放射击音效
    AudioSystem.playShoot();

    const baseAngle = player.gunAngle;
    const gunLength = 40;

    // 火力强化分支派生修正（dmgMul 伤害、radiusMul 子弹体型）；基础武器单发，不继承属性树
    const _dm = (skills.damage && skills.damage._mods) || { dmgMul: 1, radiusMul: 1 };

    bullets.push({
        x: player.x + Math.cos(baseAngle) * gunLength,
        y: player.y + Math.sin(baseAngle) * gunLength,
        vx: Math.cos(baseAngle) * player.bulletSpeed,
        vy: Math.sin(baseAngle) * player.bulletSpeed,
        radius: 6 * _dm.radiusMul,
        damage: player.damage * _dm.dmgMul,
        piercing: player.bulletPiercing,
        element: '物理',
        skillType: 'damage',
        hitZombies: []
    });
}

// 属性技能（爆炸/干冰/闪电链/滚木）：按自身 cd 独立释放；吃本树分支、完全不吃火力强化射速
function shootAttribute(type) {
    if (zombies.length === 0) return;

    // 滚木（木属性树）使用独立弹道系统：从城墙底部竖直向上碾压
    if (type === 'wood') {
        shootWood();
        return;
    }

    // 地刺（土属性树）使用独立场地系统：直接在战场上生成静止石钟乳簇
    if (type === 'earth') {
        spawnEarthSpikes();
        return;
    }

    // 播放射击音效
    AudioSystem.playShoot();

    // 五行子弹各自按技能槽序号瞄准「离墙第 n 近」的怪（不再共用坦克炮管朝向）
    const baseAngle = aimAngleForSlot(skillSlotOf(type)) || player.gunAngle;
    const gunLength = 40;
    const def = SKILL_DEFS[type];
    const m = attrModsForType(type) || {};

    const n = 1 + (m.bulletCountBoost || 0);                 // 多重爆裂/多重干冰
    const _spd = player.bulletSpeed * ATTR_BULLET_SPEED_MUL * (m.speedMul || 1);  // 默认比普通子弹慢；疾速弹道（自身分支）可提速，仍独立于火力强化
    // 多发子弹：额外子弹数越多，单发伤害越低（整体总伤随子弹数亚线性增长，避免多重无脑碾压）
    // 五行弹道（非物理火力强化）统一 ×ATTR_BASE_DMG_MUL：自 v1.1.16 起 +35% 基础增伤成为五行标配（火/金/水/木/土 一致）
    const _baseMul = (type === 'damage') ? 1 : ATTR_BASE_DMG_MUL;   // 五行弹道（非物理）统一 +35% 基础增伤（标配）
    let dmg = player.damage / (1 + MULTI_BULLET_DMG_PENALTY * (m.bulletCountBoost || 0)) * _baseMul;
    let piercing = player.bulletPiercing + (m.pierceBoost || 0);
    const canSplit = !!m.canSplit;                          // 多重 Lv5 质变：命中分裂（由分支等级判定，与子弹数公式解耦）

    for (let i = 0; i < n; i++) {
        const spread = 0.15;
        let bulletAngle = baseAngle;
        if (n > 1) bulletAngle += (i - (n - 1) / 2) * spread;

        bullets.push({
            x: player.x + Math.cos(baseAngle) * gunLength,
            y: player.y + Math.sin(baseAngle) * gunLength,
            vx: Math.cos(bulletAngle) * _spd,
            vy: Math.sin(bulletAngle) * _spd,
            radius: ATTR_BULLET_BASE_RADIUS * elementVisual(def.element).size,
            damage: dmg,
            piercing: piercing,
            element: def.element,          // 火/水/雷/土 —— 由属性树自身元素决定
            skillType: type,
            canSplit: canSplit,
            hitZombies: []
        });
    }
}

// 滚木（木属性树）：从城墙底部竖直向上释放，碾压路径上的敌人
// 设计为独立弹道系统（非普通子弹）：从城墙底部 spawn、竖直向上、水平矩形 hitbox 一路碾压
function shootWood() {
    if (zombies.length === 0) return;
    const m = woodMods();
    const wallW = screenWidth;
    const baseW = wallW * WOOD_LOG_BASE_WIDTH_RATIO * m.logWidthMul;   // 基础 1/4 城墙宽，巨木向 1/2 成长
    const count = Math.min(6, 1 + (m.bulletCountBoost || 0) + (m.logCountBoost || 0));   // 多重滚木 / 连发滚木 互斥，硬上限 6 根防超模
    const speed = player.bulletSpeed * ATTR_BULLET_SPEED_MUL * WOOD_LOG_SPEED_MUL * (m.speedMul || 1);  // 厚重慢速
    const lvl = Math.max(1, skills.wood.level || 1);
    // 单根每击伤害：五行标配 +35% × 木专属(logDmgMul) × 基础技能等级成长；多根按多重系数衰减避免无脑碾压
    const perHit = player.damage * ATTR_BASE_DMG_MUL * m.logDmgMul
                 * (1 + 0.08 * (lvl - 1)) * WOOD_LOG_DMG_FACTOR
                 / (1 + MULTI_BULLET_DMG_PENALTY * (count - 1));

    // 与金火水一致：按技能槽位瞄准。第 m 根滚木（m=1..count）瞄「第 n+m-1 个离墙最近」的敌人，n=wood 的槽位
    const baseSlot = skillSlotOf('wood');
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const target = getSlotTarget(baseSlot + i);   // 已自动 clamp 到存在的僵尸数
        const targetX = target ? target.x : screenWidth / 2;
        const w = Math.min(baseW, wallW);
        const cx = Math.max(w / 2, Math.min(wallW - w / 2, targetX));
        pendingWoodLogs.push({
            releaseAt: now + i * WOOD_LOG_RELEASE_INTERVAL,
            config: {
                x: cx, y: WALL_Y, w: w,
                thick: WOOD_LOG_THICKNESS + (m.pierceBoost || 0) * 5,   // 木刺穿透：滚木略粗（仍然保持细）
                vy: -speed,
                dmg: perHit,
                critChance: getCritChance(m), critMult: getCritMult(m),   // 暴击属性在释放时快照，升级三选一不影响本次正在释放/排队的滚木
                rebound: !!m.rebound, reboundDmgMul: m.reboundDmgMul || 1,
                splinterChance: m.splinterChance || 0, splinterDmgMul: m.splinterDmgMul || 1,
                rootChance: m.rootChance || 0, rootDuration: m.rootDuration || 0,
                strangleVineBonus: m.strangleVineBonus || 0,
                thornBurst: !!m.thornBurst, woodSpike: !!m.woodSpike,
                hitMap: {}, phase: 'up', born: now
            }
        });
    }
    AudioSystem.playShoot();
}

// 错峰释放待滚木队列：按预定时间把 pending log 移入活动 logs
function updatePendingWoodLogs() {
    const now = Date.now();
    for (let i = pendingWoodLogs.length - 1; i >= 0; i--) {
        const p = pendingWoodLogs[i];
        if (now >= p.releaseAt) {
            logs.push(p.config);
            pendingWoodLogs.splice(i, 1);
        }
    }
}

// 多重射击 Lv5 质变：子弹首次命中后，在命中点向 6 个方向迸射小弹
function spawnSplitBullets(x, y, baseDamage, exclude, element) {
    const count = 6;
    const spd = getEffBulletSpeed() * 0.95;
    const dmg = baseDamage * 0.5;   // 分裂小弹伤害减半
    for (let k = 0; k < count; k++) {
        const a = (Math.PI * 2 / count) * k;
        bullets.push({
            x: x,
            y: y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            radius: 4,
            damage: dmg,
            piercing: 1,
            element: element || getBulletElement(),
            hitZombies: [exclude],   // 排除被命中的主目标，避免同点重复结算
            isSplit: true            // 标记：分裂弹不再触发分裂，防止级联
        });
    }
}

// 更新子弹
function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        
        if (bullet.x < 0 || bullet.x > screenWidth || bullet.y < 0 || bullet.y > screenHeight) {
            bullets.splice(i, 1);
            continue;
        }
        
        // 遍历快照副本：本帧一发爆炸/闪电链可能一次性清空一整片僵尸（多次 splice），
        // 若直接对实时 zombies 用索引 j 倒序遍历，单轮 j 只减 1 但数组已缩短数十个，
        // 下一轮 zombies[j] 会越过新长度 → undefined.x 崩溃。故用快照 + 存活校验。
        const _zs = zombies.slice();
        for (let j = _zs.length - 1; j >= 0; j--) {
            const zombie = _zs[j];
            if (zombies.indexOf(zombie) === -1) continue;   // 已被本帧其它命中/爆炸/闪电清除，跳过
            const dist = Math.hypot(bullet.x - zombie.x, bullet.y - zombie.y);
            
            if (bullet.hitZombies.includes(zombie)) continue;
            
            // 火力强化·弹道校准：命中判定半径放大
            const _hitboxMul = (skills.damage && skills.damage._mods) ? skills.damage._mods.hitboxMul : 1;
            if (dist < bullet.radius * _hitboxMul + zombie.radius) {
                const isFirstHit = bullet.hitZombies.length === 0;
                bullet.hitZombies.push(zombie);

                let damage = bullet.damage;
                let isCrit = false;
                // 暴击：按子弹自身 skillType 的属性树「暴击」分支（与基础武器/其它属性树互不干扰）
                const _m = attrModsForBullet(bullet);
                const critChance = getCritChance(_m);
                if (critChance > 0 && Math.random() < critChance) {
                    damage *= getCritMult(_m);
                    isCrit = true;
                    createCritEffect(zombie.x, zombie.y);
                }

                // 火力强化·穿甲弹头：仅基础武器子弹对坦克/Boss 额外增伤（与属性树解耦）
                if (bullet.skillType === 'damage' && skills.damage && skills.damage._mods && skills.damage._mods.armorBonus > 0 &&
                    (zombie.type === 'tank' || zombie.type === 'boss')) {
                    damage *= 1 + skills.damage._mods.armorBonus;
                }

                // 爆炸伤害（仅爆炸弹自身的子弹触发）
                if (bullet.skillType === 'explosive') {
                    const _em = skills.explosive._mods || { explDmgMul: 1, explRadiusCut: 0, explArmorBreak: false, armorBreakF: 0, explIgnite: false, burnDmgMul: 1, explIncinerate: 0 };
                    let explosionRadius = Math.max(35, (40 + skills.explosive.level * 20) - _em.explRadiusCut);  // 热能爆炸：随分支等级平减半径（基础等级仍放大，二者叠加体现“高伤小范围”取舍）
                    createExplosion(bullet.x, bullet.y, explosionRadius);

                    if (_em.explIgnite && zombie) {                        // 引燃：仅引燃被击中和被波及的怪物，不生成地面火池（避免与油渍冲突）
                        applyBurn(zombie, player.damage * _em.burnDmgMul, BURN_DURATION);
                    }

                    // 倒序索引遍历：循环内 damageZombie 可能把 z 从 zombies 立即 splice，
                    // 升序 for...of 会在删除位置<当前索引时下一步读到 undefined（z.x 报错）；倒序可避免
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie) {
                            const d = Math.hypot(bullet.x - z.x, bullet.y - z.y);
                            if (d < explosionRadius) {
                                let aoeDamage = damage * (0.22 + skills.explosive.level * 0.075) * _em.explDmgMul;
                                damageZombie(z, aoeDamage, false, '火');
                                if (_em.explIgnite) applyBurn(z, player.damage * _em.burnDmgMul, BURN_DURATION);
                                if (_em.explArmorBreak) {                   // 破甲：爆炸使范围内敌人受伤增加（持续一段时间，纯数值不干扰走位）
                                    z.vulnUntil = Math.max(z.vulnUntil || 0, Date.now() + BURN_DURATION);
                                    z.vulnMul = 1 + _em.armorBreakF;
                                }
                                checkCombos(z, '火');
                                if (_em.explIncinerate && z.health > 0) {   // 焚身：对仍存活的引燃目标追加最大生命%伤害（避免对已死目标二次结算/重复击杀计数）
                                    damageZombie(z, z.maxHealth * 0.03 * _em.explIncinerate, false, '火');
                                }
                            }
                        }
                    }
                }
                
                // 命中时间戳（闪电链/冰冻/减速/领域/麻痹 共用）
                const nowHit = Date.now();

                // 闪电链（仅金属性树自身的子弹触发）
                if (bullet.skillType === 'lightning') {
                    const _lm = lightningMods();
                    // 导电 = 冻结/减速/麻痹（金树自身电磁脉冲即可施加麻痹，纯金流也能触发超导，无需依赖水树减速/冻结）
                    const isConductive = (zombie.frozenUntil > nowHit || zombie.slowUntil > nowHit || zombie.stunUntil > nowHit);
                    let chainCount = skills.lightning.level + 1 + _lm.chainCountBoost + (isConductive ? _lm.superConductorCountBoost : 0);
                    let chainDamage = damage * 0.4 * _lm.chainDmgMul * (isConductive ? (1 + _lm.superConductorDmgMul) : 1);
                    let chainRange = 150 + _lm.chainRangeBoost;
                    let lastTarget = zombie;
                    let chainedTargets = [zombie];

                    for (let c = 0; c < chainCount; c++) {
                        let closestChain = null;
                        let closestDist = chainRange;

                        for (const z of zombies) {
                            if (z.health > 0 && !chainedTargets.includes(z)) {
                                const d = Math.hypot(lastTarget.x - z.x, lastTarget.y - z.y);
                                if (d < closestDist) {
                                    closestDist = d;
                                    closestChain = z;
                                }
                            }
                        }

                        if (closestChain) {
                            createLightning(lastTarget.x, lastTarget.y, closestChain.x, closestChain.y);
                            damageZombie(closestChain, chainDamage, false, '金');
                            // 超导(金 Lv5)：对导电目标的弹射追加最大生命%伤害（与火·焚身/水·冰爆对称）
                            if (isConductive && _lm.superConductorMaxHp > 0 && closestChain.health > 0)
                                damageZombie(closestChain, closestChain.maxHealth * _lm.superConductorMaxHp, false, '金');
                            checkCombos(closestChain, '金');

                            // 电磁脉冲：命中麻痹
                            if (_lm.empStunChance > 0 && Math.random() < _lm.empStunChance) {
                                closestChain.stunUntil = Math.max(closestChain.stunUntil || 0, nowHit + _lm.empStunDuration);
                            }

                            chainedTargets.push(closestChain);
                            lastTarget = closestChain;
                        }
                    }

                    // 静电场：命中概率生成持续电伤领域（范围/时长随静电场等级）
                    if (_lm.staticFieldChance > 0 && Math.random() < _lm.staticFieldChance) {
                        if (electricFields.length >= MAX_ELECTRIC_FIELDS) electricFields.shift();   // 超限时移除最旧领域
                        electricFields.push({ x: bullet.x, y: bullet.y, radius: _lm.staticFieldRadius, life: _lm.staticFieldLife, maxLife: _lm.staticFieldLife, born: nowHit, _tick: 0 });
                    }

                    // 雷霆一击：暴击时 50% 召唤落雷
                    if (isCrit && _lm.thunderStrike && Math.random() < 0.5) {
                        createLightning(bullet.x, bullet.y - 80, bullet.x, bullet.y);
                        damageZombie(zombie, damage, false, '金');
                    }
                }

                damageZombie(zombie, damage, isCrit, bullet.element);
                checkCombos(zombie, bullet.element);

                // 电磁脉冲：主目标也被麻痹
                if (bullet.skillType === 'lightning') {
                    const _lm = lightningMods();
                    if (_lm.empStunChance > 0 && Math.random() < _lm.empStunChance) {
                        zombie.stunUntil = Math.max(zombie.stunUntil || 0, nowHit + _lm.empStunDuration);
                    }
                }

                // 火力强化·后坐力：命中后将存活目标沿子弹来向击退一小段
                if (skills.damage && skills.damage._mods && skills.damage._mods.knock && zombies.indexOf(zombie) > -1) {
                    const _ka = Math.atan2(zombie.y - player.y, zombie.x - player.x);
                    zombie.x += Math.cos(_ka) * skills.damage._mods.knockF;
                    zombie.y += Math.sin(_ka) * skills.damage._mods.knockF;
                    // 击退后立即钳制到战场边界（身体边缘基准），避免被推到屏幕外后无法被瞄准
                    clampZombieToField(zombie);
                }

                // 多重射击 Lv5 质变：首次命中后，在命中点向多方向迸射小弹（仅主弹触发，分裂弹不再级联）
                if (isFirstHit && !bullet.isSplit && bullet.canSplit) {
                    spawnSplitBullets(bullet.x, bullet.y, damage, zombie, bullet.element);
                }

                // 穿透溅射 / 冰系质变（仅对应属性树的子弹触发）
                const _fm = (bullet.skillType === 'freeze') ? freezeMods() : null;
                const _lm = (bullet.skillType === 'lightning') ? lightningMods() : null;
                if (bullet.skillType === 'explosive' && skills.explosive._mods && skills.explosive._mods.pierceSplash) {
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 30) damageZombie(z, player.damage * 0.2, false, '火');
                    }
                }
                if (_fm && _fm.iceSpike) {
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 30) { damageZombie(z, player.damage * 0.2, false, '水'); checkCombos(z, '水'); }
                    }
                }
                if (_lm && _lm.pierceSpark) {
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 30) { damageZombie(z, player.damage * 0.2, false, '金'); checkCombos(z, '金'); }
                    }
                }
                // 岩片溅射 / 碎岩迸发（土属性树「地刺贯穿」Lv5 / 「岩心暴击」Lv5 质变）已迁移至地刺场地逻辑 applyEarthSpikeHit，此处不再由子弹触发
                // 暴击小爆炸 / 冰霜暴击（火/水属性树「暴击」满级质变）
                if (isCrit && bullet.skillType === 'explosive' && skills.explosive._mods && skills.explosive._mods.critExplode) {
                    createExplosion(zombie.x, zombie.y, 50);
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 50) { damageZombie(z, player.damage * 0.3, false, '火'); checkCombos(z, '火'); }
                    }
                }
                if (isCrit && _fm && _fm.iceBurst) {
                    createFreezeEffect(zombie.x, zombie.y);
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 45) { damageZombie(z, player.damage * 0.25, false, '水'); checkCombos(z, '水'); }
                    }
                }
                // 碎岩迸发（土「岩心暴击」Lv5）已迁移至地刺场地逻辑 applyEarthSpikeHit，此处不再由子弹触发

                // 命中附带：减速 / 冰霜爆炸（仅干冰弹水属性树的子弹触发）
                // 干冰弹基础：主目标必定减速(软控)，并产生范围冰霜爆炸(伤害+范围减速)；
                // 冻结(硬控)不再由基础提供，下放给大类分支——冰霜新星(必冻) / 极寒领域(领域冻结)
                if (bullet.skillType === 'freeze') {
                    // 主目标必定减速（软控，区别于冰冻）
                    zombie.slowUntil = nowHit + 2200;
                    zombie.slowFactor = getSlowFactor();
                    createSlowEffect(zombie.x, zombie.y);
                    checkCombos(zombie, '水');   // 支撑泥沼（灼烧 + 水）

                    // 冰霜爆炸：范围伤害 + 范围减速；范围冻结由冰川(概率)或冰霜新星(概率)分支提供，基础不冻
                    const iceRadius = getFreezeExplosionRadius();
                    createIceExplosion(zombie.x, zombie.y, iceRadius);
                    const aoeDmgMul = (_fm && _fm.frostNovaDmgMul) ? _fm.frostNovaDmgMul : 1;
                    const aoeFreezeChance = getAoeFreezeChance();   // 含冰川 + 冰霜新星的范围冻结概率加成
                    const novaFreezeChance = (_fm && _fm.frostNovaFreezeChance) ? _fm.frostNovaFreezeChance : 0;
                    for (let k = zombies.length - 1; k >= 0; k--) {
                        const z = zombies[k];
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < iceRadius + z.radius) {
                            damageZombie(z, damage * 0.72 * aoeDmgMul, false, '水');
                            checkCombos(z, '水');

                            z.slowUntil = nowHit + 2200;
                            z.slowFactor = getSlowFactor();
                            createSlowEffect(z.x, z.y);

                            if (Math.random() < aoeFreezeChance) {
                                z.frozenUntil = nowHit + getFreezeDuration();
                                createFreezeEffect(z.x, z.y);
                                checkCombos(z, '水');
                            }
                        }
                    }
                    // 冰霜新星：命中点主目标也按冰霜新星概率冻结，使绝对零度(处决)可对主目标生效（不再必定）
                    if (Math.random() < novaFreezeChance) {
                        zombie.frozenUntil = nowHit + getFreezeDuration();
                        createFreezeEffect(zombie.x, zombie.y);
                        checkCombos(zombie, '水');
                    }
                }

                // 冰封处决（绝对零度 Lv5）：对被冻结目标追加最大生命%伤害（随关卡血量膨胀放大，单树后期核心）
                if (_fm && _fm.glacialDoomBonus && zombie.frozenUntil > nowHit) {
                    damageZombie(zombie, zombie.maxHealth * 0.03 * _fm.glacialDoomBonus, false, '水');
                }

                // 极寒领域：命中概率在命中点生成冰霜领域（减速圈内敌人）
                if (_fm && _fm.polarFieldChance > 0 && Math.random() < _fm.polarFieldChance) {
                    if (iceFields.length >= MAX_ICE_FIELDS) iceFields.shift();   // 超限时移除最旧领域
                    iceFields.push({ x: bullet.x, y: bullet.y, radius: 60, life: 3000, born: nowHit, _tick: 0 });
                }

                if (bullet.hitZombies.length >= bullet.piercing) {
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
    }
}

// 伤害僵尸
function damageZombie(zombie, damage, isCrit, element) {
    const now = Date.now();
    damage *= getElementBonus(zombie, element);   // Phase2 异常交互：状态 × 元素 增伤（element 缺省'物理'→×1）
    if (zombie.vulnUntil > now) damage *= (zombie.vulnMul || 1);  // 破甲：爆炸后敌人受伤增加
    zombie.health -= damage;

    // 伤害数字：暴击必显；普通伤害按僵尸节流（同僵尸 120ms 内只显示一次），避免多重/范围伤害导致数字爆炸
    if (isCrit || !zombie._lastDamageNumberAt || now - zombie._lastDamageNumberAt >= 120) {
        zombie._lastDamageNumberAt = now;
        damageNumbers.push({
            x: zombie.x,
            y: zombie.y - zombie.radius,
            text: Math.round(damage).toString(),
            life: 800,
            vy: -2.5,
            color: (element && ELEMENT_VISUAL[element] ? ELEMENT_VISUAL[element].core : (damage > player.damage ? '#ffff00' : '#ffffff')),
            isCrit: isCrit
        });
    }

    // 粒子效果：每次受击 2 粒（原为 3），控制总量
    for (let i = 0; i < 2; i++) {
        addParticle({
            x: zombie.x,
            y: zombie.y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            radius: Math.random() * 4 + 2,
            life: 400,
            color: zombie.color
        });
    }
    
    if (zombie.health <= 0) {
        player.kills++;

        // 吞噬万物（天赋）：击杀回血
        if (talentMods.lifestealPerKill > 0) {
            player.health = Math.min(player.maxHealth, player.health + talentMods.lifestealPerKill);
        }
        
        // 播放僵尸死亡音效
        AudioSystem.playZombieDeath();
        
        // 恢复经验球掉落（左上角经验条随拾取逐步填充）；半径缩小到 4（原 8 的一半）以减小视觉体积
        // 普通=1经验、精英=2、BOSS=4，与 zombieTypes.exp 一致；素材演示僵尸不掉经验球
        if (!zombie.isAdZombie) {
            expOrbs.push({
                x: zombie.x + (Math.random() - 0.5) * 12,
                y: zombie.y + (Math.random() - 0.5) * 12,
                radius: 4,
                exp: zombie.exp || 1
            });
        }

        // 掉落金币（素材演示僵尸100%掉落）
        if (zombie.isAdZombie || Math.random() < 0.3) {
            goldOrbs.push({
                x: zombie.x,
                y: zombie.y,
                radius: 10
            });
        }
        
        // 死亡粒子
        for (let i = 0; i < 12; i++) {
            addParticle({
                x: zombie.x,
                y: zombie.y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                radius: Math.random() * 6 + 3,
                life: 600,
                color: zombie.color
            });
        }
        
        const idx = zombies.indexOf(zombie);
        if (idx > -1) zombies.splice(idx, 1);
        onZombieRemoved(zombie);   // 波次存活计数 + 清波经验结算
    }
}

// ==================== 命中特效：暴击 / 冰冻 / 减速 / 复活 ====================
function createCritEffect(x, y) {
    hitEffects.push({ x, y, type: 'crit', life: 320, maxLife: 320, rot: Math.random() * Math.PI });
    for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 4;
        addParticle({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            radius: Math.random() * 3 + 2, life: 260,
            color: i % 2 ? '#ffd24a' : '#ff4d4d'
        });
    }
}

function createFreezeEffect(x, y) {
    hitEffects.push({ x, y, type: 'freeze', life: 420, maxLife: 420, rot: Math.random() * Math.PI });
    for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 2.5;
        addParticle({
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
            radius: Math.random() * 2.5 + 1.5, life: 380,
            color: i % 2 ? '#bff2ff' : '#5fd0ff'
        });
    }
}

function createSlowEffect(x, y) {
    hitEffects.push({ x, y, type: 'slow', life: 380, maxLife: 380, rot: 0 });
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        addParticle({
            x, y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 + 1,
            radius: Math.random() * 3 + 2, life: 340, color: '#5fd0ff'
        });
    }
}

function createRootEffect(x, y) {
    hitEffects.push({ x, y, type: 'root', life: 360, maxLife: 360, rot: Math.random() * Math.PI });
    for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 2;
        addParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, radius: Math.random() * 3 + 2, life: 340, color: i % 2 ? '#7fe08a' : '#46d35a' });
    }
}

function createWoodSplinterEffect(x, y) {
    for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 5;
        addParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, radius: Math.random() * 4 + 2, life: 420, color: i % 2 ? '#a9763f' : '#46d35a' });
    }
}

function updateHitEffects() {
    for (let i = hitEffects.length - 1; i >= 0; i--) {
        hitEffects[i].life -= 16;
        if (hitEffects[i].life <= 0) hitEffects.splice(i, 1);
    }
}

function drawHitEffects() {
    for (const e of hitEffects) {
        const p = Math.max(0, e.life / e.maxLife);   // 1 → 0
        const grow = 1 + (1 - p) * 1.2;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.translate(e.x, e.y);

        if (e.type === 'crit') {
            // 暴击：金色冲击环（颜色随元素风格，不使用红色）
            ctx.rotate(e.rot);
            ctx.strokeStyle = '#ffd23a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 16 * grow, 0, Math.PI * 2);
            ctx.stroke();
        } else if (e.type === 'freeze') {
            // 冰冻：六角冰晶炸开
            ctx.rotate(e.rot + (1 - p) * 0.8);
            ctx.strokeStyle = '#bff2ff';
            ctx.lineWidth = 2.5;
            const R = 18 * grow;
            for (let k = 0; k < 6; k++) {
                ctx.save();
                ctx.rotate(k * Math.PI / 3);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -R);
                ctx.moveTo(0, -R * 0.6);
                ctx.lineTo(-R * 0.22, -R * 0.82);
                ctx.moveTo(0, -R * 0.6);
                ctx.lineTo(R * 0.22, -R * 0.82);
                ctx.stroke();
                ctx.restore();
            }
        } else if (e.type === 'revive') {
            // 不朽之身复活：紫色冲击波 + 上升符文环
            ctx.strokeStyle = '#c9a4ff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 30 * grow * 1.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(230, 210, 255, 0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 12 * (1 - p) - 6, 34 * grow, 12 * grow, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else if (e.type === 'root') {
            // 深根（定身）：绿色藤蔓环
            ctx.rotate(e.rot + (1 - p) * 0.6);
            ctx.strokeStyle = '#46d35a';
            ctx.lineWidth = 3;
            const R = 16 * grow;
            for (let k = 0; k < 5; k++) {
                ctx.save();
                ctx.rotate(k * Math.PI * 2 / 5);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(R * 0.3, -R * 0.5, 0, -R);
                ctx.stroke();
                ctx.restore();
            }
        } else {
            // 减速：冰蓝黏滞波纹（与干冰弹水属性同色）
            ctx.strokeStyle = '#37c6ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(0, 6, 20 * grow, 9 * grow, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(70, 200, 255, 0.25)';
            ctx.beginPath();
            ctx.ellipse(0, 6, 20 * grow, 9 * grow, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

// 创建爆炸效果
// 施加灼烧：设/续灼烧时长与每跳伤害（伤害取较高者，不叠加累乘）；引燃只增伤，故 duration 固定
function applyBurn(z, dmgPerTick, duration) {
    const now = Date.now();
    z.burnDmg = Math.max(z.burnDmg || 0, dmgPerTick);
    z.burningUntil = Math.max(z.burningUntil || 0, now + duration);
}

function createExplosion(x, y, radius) {
    // 爆炸冲击环：扩至实际爆炸半径（随爆炸范围分支同步放大/缩小）
    bombExplosionEffects.push({ x: x, y: y, radius: 0, life: 400, maxRadius: radius });
    // 火花：数量与扩散速度随半径缩放
    const n = Math.max(12, Math.round(radius / 3));
    const sp = 3 + radius / 12;
    for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 / n) * i;
        addParticle({
            x: x,
            y: y,
            ox: x,                  // 原点，用于把火花限制在实际爆炸半径内
            oy: y,
            maxR: radius,           // 火花可触及的最大半径 = 爆炸范围半径
            vx: Math.cos(angle) * sp,
            vy: Math.sin(angle) * sp,
            radius: 4 + radius / 30,
            life: 300,
            color: '#ff6a14'
        });
    }
}

// 冰霜爆炸：范围冻结/减速的视觉表现（冷色冲击环 + 冰晶粒子）
function createIceExplosion(x, y, radius) {
    bombExplosionEffects.push({ x: x, y: y, radius: 0, life: 400, maxRadius: radius, color: [95, 208, 255] });
    const n = Math.max(10, Math.round(radius / 4));
    const sp = 2 + radius / 14;
    for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 / n) * i;
        addParticle({
            x: x, y: y, ox: x, oy: y, maxR: radius,
            vx: Math.cos(angle) * sp,
            vy: Math.sin(angle) * sp,
            radius: 3 + radius / 40,
            life: 320,
            color: i % 2 ? '#bff2ff' : '#5fd0ff'
        });
    }
}

// 土系·震地：黄褐色尘土冲击环 + 碎石粒子
function createDustExplosion(x, y, radius) {
    bombExplosionEffects.push({ x: x, y: y, radius: 0, life: 400, maxRadius: radius, color: [198, 145, 90] });
    const n = Math.max(10, Math.round(radius / 4));
    const sp = 2 + radius / 14;
    for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 / n) * i;
        addParticle({
            x: x, y: y, ox: x, oy: y, maxR: radius,
            vx: Math.cos(angle) * sp,
            vy: Math.sin(angle) * sp,
            radius: 3 + radius / 35,
            life: 340,
            color: i % 2 ? '#c8915a' : '#8b6a45'
        });
    }
}

// 土系·陷坑视觉：短暂旋转的暗色漩涡
function createSinkholeEffect(x, y, radius) {
    hitEffects.push({ x: x, y: y, type: 'sinkhole', life: 500, maxLife: 500, rot: 0, radius: radius });
}

// 土系·震地视觉：强化的地震表现——屏幕抖动 + 双层棕色冲击波环 + 大量尘土（相比普通 dust 更明显）
function createQuakeEffect(x, y, radius) {
    if (typeof g !== 'undefined' && g && 'shake' in g) {
        g.shake = Math.max(g.shake || 0, 0.5);   // 触发屏幕抖动，强化“地震”感受
    }
    // 内层快环
    bombExplosionEffects.push({ x: x, y: y, radius: 0, life: 480, maxRadius: radius, color: [210, 160, 100] });
    // 外层大环（扩得更大、更醒目）
    bombExplosionEffects.push({ x: x, y: y, radius: 0, life: 600, maxRadius: radius * 1.6, color: [150, 110, 70] });
    createDustExplosion(x, y, radius * 1.1);
}

// 土系·石化视觉：敌人身上爆开小石块
function createRockEffect(x, y) {
    for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1 + Math.random() * 2;
        addParticle({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, radius: 2 + Math.random() * 2, life: 350, color: '#a89a8a' });
    }
}

// 土系·岩盾：在指定位置生成临时屏障（有血量、挡敌人、会被攻击）
function createEarthShield(x, y, m) {
    if (earthShields.length >= EARTH_SHIELD_MAX_COUNT) earthShields.shift();   // 超限时移除最旧盾
    const w = EARTH_SHIELD_BASE_WIDTH * (m.shieldWidthMul || 1);
    const hp = EARTH_SHIELD_BASE_HP * (1 + skills.earth.level * 0.06) * (m.shieldHpMul || 1);
    const dur = EARTH_SHIELD_BASE_DURATION + (m.shieldDuration || 0);
    earthShields.push({
        x: x - w / 2, y: y - 6, w: w, h: 12,
        hp: hp, maxHp: hp,
        born: Date.now(), duration: dur,
        _lastHitAt: 0
    });
}

// 土系·岩盾更新：超时（duration）的盾从场上移除（敌人交互的超时跳过由 updateZombies 内处理）
function updateEarthShields() {
    const now = Date.now();
    for (let i = earthShields.length - 1; i >= 0; i--) {
        if (now - earthShields[i].born > earthShields[i].duration) earthShields.splice(i, 1);
    }
}

// 创建闪电效果
function createLightning(x1, y1, x2, y2) {
    const points = [{x: x1, y: y1}];
    const segments = 8;
    
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const jitter = (1 - t) * 20 + 5;
        points.push({
            x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter,
            y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter
        });
    }
    points.push({x: x2, y: y2});
    
    lightningEffects.push({
        points: points,
        life: 200
    });
}

// 更新僵尸
// 敌人「身体边缘」钳制到战场左右边界（FIELD_X0 / FIELD_X1），被击退也不越界；
// 同时保证顶部不超出屏幕顶端。底部由 updateZombies 内城墙钳制（WALL_Y - radius）。
// 以身体边缘为基准：钳制后敌人左/右边缘恰好落在边界上，中心点留在场内（始终可被瞄准）。
function clampZombieToField(z) {
    const minX = FIELD_X0 + z.radius;
    const maxX = FIELD_X1 - z.radius;
    if (minX <= maxX) {
        if (z.x < minX) z.x = minX;
        else if (z.x > maxX) z.x = maxX;
    } else {
        z.x = (FIELD_X0 + FIELD_X1) / 2;   // 极小屏兜底：居中，避免越界
    }
    if (z.y - z.radius < 0) z.y = z.radius; // 不越过屏幕顶端（向上击退时）
}

function updateZombies(dt) {
    const now = Date.now();
    const _reflectTargets = [];   // 护盾反弹目标（循环外统一结算）
    for (const zombie of zombies) {
        // 冰冻 / 减速 / 眩晕（Phase2 硬控）
        let sp = zombie.speed;
        if (zombie.frozenUntil > now) {
            sp = 0;
        } else if (zombie.stunUntil > now) {
            sp = 0;   // 硬控：完全静止
        } else if (zombie.slowUntil > now) {
            sp *= (zombie.slowFactor || 0.5);
            // 冰冻残留减速（freeze Lv3 质变）：冰冻刚结束的僵尸继续缓慢移动
            if (zombie._residualSlowUntil && zombie._residualSlowUntil > now) sp *= 0.6;
        }
        // 竖直向下坠落（城墙玩法：敌人不再朝坦克 homing，改为竖直下落）
        zombie.y += sp;

        // 战场边界钳制：以身体边缘为基准，被击退也不越出左右屏幕边缘（保持可被瞄准）
        clampZombieToField(zombie);

        // 岩盾阻挡：敌人撞盾则停在盾顶并攻击岩盾（盾有血量，可被摧毁）
        let blockingShield = null;
        for (const shield of earthShields) {
            // 盾已超时则跳过（由 updateEarthShields 清理，但这里也过滤）
            if (now - shield.born > shield.duration) continue;
            // 水平方向：敌人身体边缘与盾有重叠
            const zLeft = zombie.x - zombie.radius, zRight = zombie.x + zombie.radius;
            if (zRight <= shield.x || zLeft >= shield.x + shield.w) continue;
            // 竖直方向：敌人底部到达或穿过盾顶，且敌人顶部在盾底之上（从上方来）
            if (zombie.y + zombie.radius >= shield.y && zombie.y - zombie.radius < shield.y + shield.h) {
                blockingShield = shield;
                zombie.y = shield.y - zombie.radius;   // 钉在盾顶
                break;
            }
        }
        if (blockingShield) {
            // 攻击间隔门控：同城墙啄墙逻辑
            if (now >= (blockingShield._lastHitAt || 0) + EARTH_SHIELD_ATTACK_INTERVAL) {
                blockingShield._lastHitAt = now;
                // 敌人对盾造成伤害（受盾减伤系数；boss 对盾伤害 +50%）
                const _shieldDmgMul = 1 + (zombie.type === 'boss' ? 0.5 : 0);
                blockingShield.hp -= Math.max(1, zombie.damage * 0.25 * _shieldDmgMul);
                if (blockingShield.hp <= 0) {
                    const idx = earthShields.indexOf(blockingShield);
                    if (idx >= 0) {
                        earthShields.splice(idx, 1);
                        createDustExplosion(blockingShield.x + blockingShield.w / 2, blockingShield.y, 55);
                    }
                }
            }
            continue;   // 被盾挡住，本帧不再啄墙
        }

        // 撞墙判定：僵尸触到城墙顶面即钉在墙顶、持续攻击城墙（城墙即坦克生命）
        if (zombie.y + zombie.radius >= WALL_Y) {
            // 钉在墙顶（紧贴，避免穿透）
            zombie.y = WALL_Y - zombie.radius;

            // 不朽之身无敌期：完全免伤
            if (now < invincibleUntil) continue;

            // 攻击间隔门控：每个僵尸按 WALL_ATTACK_INTERVAL 啄墙一次（大幅降低攻击频率，旧模型靠 8px 击退等效限速）
            if (now < (zombie._wallHitAt || 0) + WALL_ATTACK_INTERVAL) continue;
            zombie._wallHitAt = now;

            // 冻结=停掉破墙伤害：被冻结僵尸（含已贴墙者）完全不啄墙；冻结有时限，解冻即恢复，不会永久免伤
            if (zombie.frozenUntil > now) continue;

            let damage = zombie.damage;

            // 护盾减伤（技能 −10%/级 + 天赋 −2%/级，封顶 80%）
            damage *= (1 - getShieldReduce());

            player.health -= damage * 0.03;
            player.hurtTime = now;

            // 护盾反弹（shield Lv5 质变）：受击反弹 10% 伤害（循环外统一结算，避免遍历中 splice）
            if (skills.shield._reflect) _reflectTargets.push({ z: zombie, dmg: damage * 0.1 });

            // 播放受伤音效（限制频率，避免连续播放）
            AudioSystem.playHurt();

            if (player.health <= 0) {
                // 不朽之身（天赋）：消耗 1 次复活，回半血 + 10 秒真无敌
                if (talentMods.immortalCharges > 0) {
                    talentMods.immortalCharges--;
                    player.health = player.maxHealth * 0.5;
                    invincibleUntil = now + IMMORTAL_INVINCIBLE_TIME;
                    const _wx = (WALL_X0 + WALL_X1) / 2, _wy = WALL_Y;
                    hitEffects.push({ x: _wx, y: _wy, type: 'revive', life: 700, maxLife: 700, rot: 0 });
                    for (let i = 0; i < 26; i++) {
                        const a = Math.random() * Math.PI * 2;
                        const sp = 3 + Math.random() * 6;
                        addParticle({
                            x: _wx, y: _wy,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                            radius: Math.random() * 5 + 3, life: 620,
                            color: i % 2 ? '#a06bff' : '#e6d2ff'
                        });
                    }
                } else {
                    gameOver();
                }
            }
        }
    }

    // 护盾反弹结算（循环外，避免遍历中 splice 导致跳杀）
    for (const rt of _reflectTargets) damageZombie(rt.z, rt.dmg, false, '物理');

    // 灼烧 DOT（油渍 / 爆炸引燃）：节流 500ms 结算一次；逆序遍历，damageZombie 内 splice 安全
    const _now = Date.now();
    for (let j = zombies.length - 1; j >= 0; j--) {
        const z = zombies[j];
        if (z.burningUntil > _now && z.burnDmg > 0) {
            z._burnTick = (z._burnTick || 0) + (dt || 16);
            if (z._burnTick >= 500) {
                z._burnTick = 0;
                damageZombie(z, z.burnDmg, false, '火');   // 灼烧伤害按各自来源（油渍/引燃）结算；火：冰冻中僵尸踩油渍 → 融化 ×2
            }
        }
    }
}

// 五行领域持续技能：周期性结算生效（极寒领域 / 静电场）；部署/聚怪类已于 v1.1.16 移除
function updateFields(dt) {
    const now = Date.now();

    // 极寒领域：持续减速/概率冻结领域内僵尸（每 100ms 结算一次，避免每帧全量遍历）
    for (let i = iceFields.length - 1; i >= 0; i--) {
        const f = iceFields[i];
        f.life -= dt;
        if (f.life <= 0) { iceFields.splice(i, 1); continue; }
        f._tick = (f._tick || 0) + dt;
        if (f._tick >= 100) {
            f._tick = 0;
            for (const z of zombies) {
                if (Math.hypot(f.x - z.x, f.y - z.y) < f.radius + z.radius) {
                    z.slowUntil = Math.max(z.slowUntil || 0, now + 500);
                    z.slowFactor = getSlowFactor();
                    if (Math.random() < 0.15) {   // 每 100ms 15% 概率冻结（等效原每帧 5%×3）
                        z.frozenUntil = Math.max(z.frozenUntil || 0, now + getFreezeDuration());
                    }
                }
            }
        }
    }

    // 静电场：持续电伤领域内僵尸（每 300ms 一跳，不变；但加入 tick 标记与字段预筛选）
    for (let i = electricFields.length - 1; i >= 0; i--) {
        const f = electricFields[i];
        f.life -= dt;
        if (f.life <= 0) { electricFields.splice(i, 1); continue; }
        f._dpsTimer = (f._dpsTimer || 0) + dt;
        if (f._dpsTimer >= 300) {
            f._dpsTimer = 0;
            for (const z of zombies) {
                if (Math.hypot(f.x - z.x, f.y - z.y) < f.radius + z.radius) {
                    damageZombie(z, player.damage * 0.15, false, '金');
                    checkCombos(z, '金');
                }
            }
        }
    }
}

// 滚木（木属性树）：竖直向上碾压，矩形 hitbox 命中路径上所有僵尸（WOOD_LOG_HIT_INTERVAL 节流）
function updateLogs(dt) {
    const now = Date.now();
    const frame = dt || 16;
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i];
        log.y += log.vy * (frame / 16);   // vy 为负=向上；按 dt 归一化到 px/帧
        const top = log.y - log.thick / 2, bot = log.y + log.thick / 2;
        for (const z of zombies) {
            if (z.x < log.x - log.w / 2 || z.x > log.x + log.w / 2) continue;   // 不在横向带内
            if (z.y + z.radius < top || z.y - z.radius > bot) continue;          // 不在纵向长度内
            const last = log.hitMap[z.id] || 0;
            if (now - last < WOOD_LOG_HIT_INTERVAL) continue;                    // 节流，避免单帧连击
            log.hitMap[z.id] = now;
            // 暴击（荆棘暴击分支提供概率/倍率，受暴击天赋增益）；数值在释放时快照到 log.critChance/critMult，升级不影响本次
            const isCrit = Math.random() < log.critChance;
            let dmg = log.dmg * (isCrit ? log.critMult : 1);
            if (log.phase === 'down') dmg *= log.reboundDmgMul;   // 回弹阶段伤害增幅
            damageZombie(z, dmg, isCrit, '木');
            if (z.health <= 0) continue;
            // 深根（定身 = stun）：木系硬控，也是绞杀藤蔓的状态钩子
            if (log.rootChance > 0 && Math.random() < log.rootChance) {
                z.stunUntil = Math.max(z.stunUntil || 0, now + log.rootDuration);
                createRootEffect(z.x, z.y);
            }
            // 绞杀藤蔓（Lv5 质变）：对被定身目标追加最大生命%伤害（对标火·焚身/水·绝对零度/金·超导）
            if (log.strangleVineBonus > 0 && z.stunUntil > now) {
                damageZombie(z, z.maxHealth * 0.03 * log.strangleVineBonus, false, '木');
                if (z.health <= 0) continue;
            }
            // 荆棘暴击 Lv5：暴击触发荆棘迸发（范围溅射）
            if (isCrit && log.thornBurst) {
                createCritEffect(z.x, z.y);
                for (const o of zombies) {
                    if (o !== z && Math.hypot(z.x - o.x, z.y - o.y) < 45) damageZombie(o, player.damage * 0.25, false, '木');
                }
            }
            // 木刺穿透 Lv5：命中溅射木刺
            if (log.woodSpike) {
                for (const o of zombies) {
                    if (o !== z && Math.hypot(z.x - o.x, z.y - o.y) < 30) damageZombie(o, player.damage * 0.2, false, '木');
                }
            }
        }
        // 碎木飞溅（互斥于回弹）：滚动途中按间隔概率炸裂，滚木不消失，一路碾压一路爆炸
        if (log.splinterChance > 0) {
            log._splinterTimer = (log._splinterTimer || 0) + (dt || 16);
            if (log._splinterTimer >= WOOD_SPLINTER_INTERVAL) {
                log._splinterTimer = 0;
                if (Math.random() < Math.min(1, log.splinterChance)) {
                    createWoodSplinterEffect(log.x, log.y);
                    for (const z of zombies) {
                        if (Math.hypot(log.x - z.x, log.y - z.y) < WOOD_SPLINTER_RADIUS + z.radius) {
                            damageZombie(z, player.damage * WOOD_SPLINTER_DMG * log.splinterDmgMul, false, '木');
                        }
                    }
                }
            }
        }
        // 生命周期：到达顶端
        if (log.phase === 'up' && log.y + log.thick / 2 < 0) {
            if (log.rebound) { log.phase = 'down'; log.vy = -log.vy; }   // 回弹（互斥于碎木）
            else { logs.splice(i, 1); }
        } else if (log.phase === 'down' && log.y - log.thick / 2 > WALL_Y + 10) {
            logs.splice(i, 1);   // 回弹到底（互斥于碎木，不再炸裂）
        }
    }
}

// 更新粒子
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.maxR) {               // 爆炸火花：限制外缘不超过实际爆炸半径（中心夹到 maxR - 自身半径）
            const limit = Math.max(0, p.maxR - p.radius);
            const dx = p.x - p.ox, dy = p.y - p.oy;
            const dd = Math.hypot(dx, dy);
            if (dd > limit) {
                p.x = p.ox + dx / dd * limit;
                p.y = p.oy + dy / dd * limit;
                p.vx *= 0.2;        // 触顶后减速消散，不再外溢
                p.vy *= 0.2;
            }
        }
        p.life -= 16;
        p.radius *= 0.97;
        
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

// 更新掉落物
function updateOrbs() {
    for (let i = expOrbs.length - 1; i >= 0; i--) {
        const orb = expOrbs[i];
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        
        if (dist > 5) {
            const angle = Math.atan2(player.y - orb.y, player.x - orb.x);
            orb.x += Math.cos(angle) * 12;
            orb.y += Math.sin(angle) * 12;
        }
        
        if (dist < player.radius + orb.radius) {
            // 经验球提供经验：拾取后经验条逐步填充，满了自动升级（触发三选一）
            player.exp += (orb.exp || 1) * talentMods.expMult;
            expOrbs.splice(i, 1);
            
            // 播放拾取音效
            AudioSystem.playPickup();
            
            if (player.exp >= player.expToLevel && player.level < MAX_LEVEL) {
                levelUp();
            }
        }
    }
    
    for (let i = goldOrbs.length - 1; i >= 0; i--) {
        const orb = goldOrbs[i];
        const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
        
        if (dist > 5) {
            const angle = Math.atan2(player.y - orb.y, player.x - orb.x);
            orb.x += Math.cos(angle) * 12;
            orb.y += Math.sin(angle) * 12;
        }
        
        if (dist < player.radius + orb.radius) {
            player.gold += Math.round(5 * talentMods.goldMult);
            goldOrbs.splice(i, 1);
            
            // 播放拾取音效
            AudioSystem.playPickup();
        }
    }
}

// 更新伤害数字
function updateDamageNumbers() {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
        const dn = damageNumbers[i];
        dn.y += dn.vy;
        dn.life -= 16;
        
        if (dn.life <= 0) {
            damageNumbers.splice(i, 1);
        }
    }
}

// 生成僵尸（v1.1.1 波次系统）：按 WAVE_PLAN 时间轴整波生成，到时间就出（重叠波次，不等待上一波清完）
function spawnZombies(dt) {
    const stage = getCurrentStage();
    if (nextWaveIdx < WAVE_PLAN.length && gameTime >= WAVE_PLAN[nextWaveIdx].spawnAt) {
        spawnWave(WAVE_PLAN[nextWaveIdx], stage);
        wavesSpawned++;
        nextWaveIdx++;
    }
    updatePendingSpawns();   // 把到点的待生成怪推入战场（同波错峰）
}

function spawnWave(w, stage) {
    waveAlive[w.i] = w.comp.length;
    // 同一波的所有怪均匀错峰入队：每只在 w.spawnAt + s*WAVE_INTERVAL ± 抖动 入场，
    // 铺满本波独占的时间段；下一波在末尾紧接，全程连绵不绝、不会一排同时出现。
    // 五行属性 / 怪物皮肤：由关卡（stage）统一指定。
    //   · 单系章节：所有怪 element = stage.element（normal 章节为 'normal'，克制系数=1）。
    //   · 双系相生章节：elements = stage.elements（取各系最差克制，见 getElementBonus）。
    //   · creature 决定极地皮肤；Boss 使用 bossCreature。
    const zElement = stage.element || 'normal';
    const zElements = stage.elements || null;
    for (let s = 0; s < w.comp.length; s++) {
        const type = w.comp[s];
        pendingSpawns.push({
            at: w.spawnAt + s * WAVE_INTERVAL + (Math.random() * 2 - 1) * WAVE_JITTER,
            type: type,
            zElement: zElement,
            zElements: zElements,
            creature: type === 'boss' ? stage.bossCreature : stage.creature,
            stage: stage,
            wave: w.i
        });
    }
}

// 把到点的待生成怪真正推入战场（每帧调用；血量按当前时间膨胀；五行属性由 pendingSpawns.zElement 决定，当前统一普通）
function updatePendingSpawns() {
    if (pendingSpawns.length === 0) return;
    for (let i = pendingSpawns.length - 1; i >= 0; i--) {
        const p = pendingSpawns[i];
        if (gameTime < p.at) continue;
        const stage = p.stage;
        const template = zombieTypes[p.type];
        // 波次 tier 主控难度曲线（WAVE_TIER_TABLE，9 段心流重做）：怪物强度 = 关卡基线 × 波次 tier 倍率。
        // tier.hpT/dmgT 已按"玩家技能解锁等级(Lv5/8/11/14/17/18) + 火力成长"反推，使两条曲线交叉上升、偏离≤20%。
        // 原 hpWaveGrow/hpGrow 指数/时间线性增长已废弃，改由 tier 表单一主控（STAGES.healthMult 仅作关卡间基线差）。
        const tier = getWaveTier(p.wave);
        const healthMult = stage.healthMult * tier.hpT;
        const damageMult = stage.damageMult * tier.dmgT;
        zombies.push({
            id: _zombieIdSeq++,
            x: Math.random() * screenWidth,
            y: -50,
            element: p.zElement || 'normal',
            elements: p.zElements || null,
            creature: p.creature || 'seal',
            radius: template.radius,
            speed: template.speed * stage.speedMult,
            health: template.health * healthMult,
            maxHealth: template.health * healthMult,
            damage: template.damage * damageMult,
            color: template.color,
            exp: template.exp,
            gold: template.gold || 5,
            type: p.type,
            wave: p.wave,
            frozenUntil: 0,
            slowUntil: 0,
            stunUntil: 0,
            _residualSlowUntil: 0,
            _inTornado: false,
            slowFactor: 0.5
        });
        pendingSpawns.splice(i, 1);
    }
}

// 僵尸死亡后统一做波次存活计数（damageZombie 与炸弹清屏均调用）。
// 注：升级不再由清波结算发放——每波怪物经验总和已设计成正好等于该波升级所需，
//     击杀掉的经验球被拾取后经验条自然填满并自动升级（见 updateOrbs / damageZombie）。
function onZombieRemoved(z) {
    if (z.wave == null) return;
    waveAlive[z.wave] = (waveAlive[z.wave] || 0) - 1;
    if (waveAlive[z.wave] <= 0 && !waveAwarded[z.wave]) {
        waveAwarded[z.wave] = true;
        wavesCleared++;
    }
}

// 升级
function levelUp() {
    // 面板已显示时不再弹出/覆盖，避免「跳级」时第二次把第一次的三选一覆盖掉
    if (gameState === 'upgrade') return;
    if (player.level >= MAX_LEVEL) {
        player.exp = 0;
        return;
    }
    // 经验不足时不强行升级（可能已被前面的升级/连锁升级消耗），避免炸弹延迟回调误升
    if (player.exp < player.expToLevel) return;
    
    player.level++;
    player.exp -= player.expToLevel;
    player.expToLevel = EXP_BASE * player.level;   // 升级所需 cost(L→L+1) = EXP_BASE*L（1→2需EXP_BASE、2→3需2*EXP_BASE…）
    
    // 注：炸弹不再随等级获得；仅广告奖励与初始引导(bombCount=1)提供炸弹。
    
    // 播放升级音效
    AudioSystem.playLevelUp();
    
    showUpgradePanel();
}

// 显示升级面板
function showUpgradePanel() {
    gameState = 'upgrade';
    
    // 构建候选卡：已拥有大类的基础升级卡 + 其已解锁的衍生分支卡；未满槽时加入未拥有大类卡
    const cards = [];
    for (const t of acquiredSkills) {
        const def = SKILL_DEFS[t];
        if (!def) continue;   // 旧存档可能含已删除技能（多重/高速/穿透/暴击/缓速/油渍），跳过避免崩溃
        // 基础升级卡（火力强化等大类始终可继续升级；其余技能按原逻辑升级）
        cards.push({ type: t, name: def.name, icon: def.icon, desc: def.desc });
        // 衍生分支卡（仅带 branches 的大类有）；图标沿用大类 icon，不另设
        if (def.branches) {
            const _taken = skills[t].branches || {};
            for (const bid of getAvailableBranches(t)) {
                const b = def.branches[bid];
                const bl = _taken[bid] || 0;
                cards.push({
                    type: t, branch: bid, icon: def.icon,
                    name: def.name + '-' + b.name,
                    branchLevel: bl + 1,
                    desc: b.desc
                });
            }
        }
    }
    if (acquiredSkills.length < MAX_SKILLS) {
        for (const t of Object.keys(SKILL_DEFS)) {
            if (!acquiredSkills.includes(t)) {
                const def = SKILL_DEFS[t];
                cards.push({ type: t, name: def.name, icon: def.icon, desc: def.desc });
            }
        }
    }

    if (isSkillLab) {
        // 技能实验室：列出全部候选卡（含火力强化的所有可用分支），不随机抽 3
        upgradeOptions = cards;
    } else {
        // 加权抽取 3 张：基础大类卡（尤其火力强化基础）加权，避免被多条分支卡挤掉。
        // 基础与分支不互斥，都应能稳定刷出（"一定概率"）。
        upgradeOptions = weightedPick3(cards);
    }
    selectedUpgrade = -1;
}

// 三选一候选卡权重：火力强化基础卡加权（与分支不互斥，需稳定可刷出）；分支卡 1.0；其余已拥有/新技能 1.4
function upgradeCardWeight(card) {
    if (card.type === 'damage' && !card.branch) return 2.0;
    if (card.branch) return 1.0;
    return 1.4;
}
function weightedPick3(cards) {
    const pool = cards.slice();
    const out = [];
    while (out.length < 3 && pool.length) {
        let total = 0;
        for (const c of pool) total += upgradeCardWeight(c);
        let r = Math.random() * total;
        let idx = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
            r -= upgradeCardWeight(pool[i]);
            if (r <= 0) { idx = i; break; }
        }
        out.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return out;
}

// 应用升级
function applyUpgrade(upgrade) {
    // 注意：天赋会预先抬高部分技能等级（爆炸/闪电链等），
    // 因此这里必须用 acquiredSkills 判断是否首次获得，否则会绕过 MAX_SKILLS 槽位限制。
    if (!acquiredSkills.includes(upgrade.type)) {
        acquiredSkills.push(upgrade.type);
    }
    
    skills[upgrade.type].level++;
    
    // 衍生分支卡：选分支 = 该大类继续升级（不占新槽）；分支等级 +1 并重算派生修正
    if (upgrade.branch) {
        skills[upgrade.type].branches = skills[upgrade.type].branches || {};
        skills[upgrade.type].branches[upgrade.branch] = (skills[upgrade.type].branches[upgrade.branch] || 0) + 1;
        if (upgrade.type === 'damage') recomputeDamageMods();
        else if (upgrade.type === 'explosive') recomputeExplosiveMods();
        else if (upgrade.type === 'freeze') recomputeFreezeMods();
        else if (upgrade.type === 'lightning') recomputeLightningMods();
        else if (upgrade.type === 'wood') recomputeWoodMods();
        else if (upgrade.type === 'earth') recomputeEarthMods();
    }

    // 五行相生协同：获得/升级任何技能后重新计算
    recomputeWuxingSynergy();
    
    // 升级效果统一走 SKILL_DEFS[type].apply（每级增量，复用原 switch 语义）
    const _def = SKILL_DEFS[upgrade.type];
    if (_def && _def.apply) _def.apply(skills[upgrade.type].level);
    // 质变节点（qualNodes）：升级到指定等级触发一次性强化
    fireQualNodes(upgrade.type);

    gameState = 'playing';
    gameRunning = true;
    lastTime = Date.now();

    // 连锁升级：本次经验溢出跨多级时，选完上一项后立即继续弹下一级三选一，让玩家逐级都选
    if (player.exp >= player.expToLevel && player.level < MAX_LEVEL) {
        levelUp();
    }
    
    // 重置炸弹获得标志
    justGotBomb = false;
    bombFull = false;

    // 连锁升级：本次经验溢出跨多级（如炸弹清屏）时，继续弹出下一级三选一，让玩家逐级都选
    if (player.exp >= player.expToLevel && player.level < MAX_LEVEL) {
        levelUp();
    }
}

// 使用炸弹
function useBomb() {
    if (bombCount <= 0 || bombCooldown > 0 || !gameRunning) return;
    
    bombCount--;
    bombCooldown = BOMB_COOLDOWN_TIME;
    
    // 播放炸弹爆炸音效
    AudioSystem.playBombExplosion();
    
    // 全屏爆炸特效
    for (let wave = 0; wave < 5; wave++) {
        setTimeout(() => {
            bombExplosionEffects.push({
                x: screenWidth / 2,
                y: screenHeight / 2,
                radius: 0,
                life: 400
            });
        }, wave * 100);
    }
    
    // 清除所有僵尸：炸弹只清场并结算各波存活计数；经验以经验球形式掉落由玩家拾取（与普攻一致）
    for (const zombie of zombies) {
        player.gold += Math.round((zombie.gold || 5) * talentMods.goldMult);
        player.kills++;
        onZombieRemoved(zombie);

        // 掉经验球（素材演示僵尸不掉），保证炸弹击杀的经验也被拾取升级
        if (!zombie.isAdZombie) {
            expOrbs.push({
                x: zombie.x + (Math.random() - 0.5) * 20,
                y: zombie.y + (Math.random() - 0.5) * 20,
                radius: 4,
                exp: zombie.exp || 1
            });
        }

        for (let i = 0; i < 8; i++) {
            addParticle({
                x: zombie.x,
                y: zombie.y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                radius: Math.random() * 5 + 2,
                life: 300,
                color: zombie.color
            });
        }
    }

    zombies = [];
}

// 游戏结束
function gameOver() {
    gameState = 'gameOver';
    gameRunning = false;
    
    // 将本次关卡获得的金币累加到总金币（即使失败也不丢失之前的金币）
    player.gold = goldAtStageStart + player.gold;
    stageGoldEarned = player.gold - goldAtStageStart;   // 本次获得（仅击杀金币，失败无通关奖励）
    
    savePlayerData();  // 保存玩家数据
    AudioSystem.stopBGM();
    AudioSystem.playGameOver();
}

// 胜利
function victory() {
    gameState = 'victory';
    gameRunning = false;
    
    // 将本次关卡获得的金币累加到总金币（击杀金币 + 直线型通关奖励）
    player.gold = goldAtStageStart + player.gold + getStageGoldReward(currentStage);
    stageGoldEarned = player.gold - goldAtStageStart;   // 本次获得（击杀金币 + 通关奖励）
    
    saveProgress();
    savePlayerData();  // 保存玩家数据
    AudioSystem.stopBGM();
    AudioSystem.playVictory();
}

// 开始游戏
function startGame() {
    // 清除可能存在的关卡拖动状态
    if (levelLongPressTimer) {
        clearTimeout(levelLongPressTimer);
        levelLongPressTimer = null;
    }
    isLevelDragging = false;
    isLevelLongPressing = false;

    // 离开主菜单时销毁游戏圈按钮
    destroyGameClubButton();

    gameState = 'playing';
    gameRunning = true;
    gameTime = 0;
    lastTime = Date.now();
    adWatchCount = 0; // 每关重置看广告次数

    // 预加载激励视频广告（流量主），提前初始化以便随时展示
    ensureRewardedAd();

    // 初始化音频系统
    if (!AudioSystem.isInitialized) {
        AudioSystem.init();
    }
    AudioSystem.resume();
    AudioSystem.stopBGM();
    if (musicEnabled) {
        AudioSystem.startBGM();
    }
    
    // 保存进入关卡前的金币（用于胜利后累积）
    goldAtStageStart = player.gold;
    
    // 重置玩家（城墙血量即玩家血量）
    player.x = screenWidth / 2;
    player.y = screenHeight - 80;
    player.health = WALL_MAX_HEALTH;
    player.maxHealth = WALL_MAX_HEALTH;
    player.exp = 0;
    player.level = 1;
    player.expToLevel = EXP_BASE;   // cost(1→2) = EXP_BASE*1 = EXP_BASE
    player.gold = 0;  // 重置为0用于计算本次关卡获得金币
    player.kills = 0;
    player.damage = 10;
    player.fireRate = 500;
    player.bulletSpeed = 10;
    player.bulletPiercing = 1;
    player.bulletCount = 1;

    // 重置技能
    for (const key of Object.keys(skills)) {
        skills[key].level = 0;
        skills[key].qualified = {};        // 清理跨局残留的质变标记（避免重开后质变不重触）
        skills[key].branches = {};         // 清理跨局残留的衍生分支选择
        if (ATTRIBUTE_BULLET_TYPES.indexOf(key) >= 0) skills[key]._lastFire = 0;  // 属性技能独立释放 cd 计时归零
    }
    skills.damage.level = 1;
    acquiredSkills = ['damage'];

    // 应用永久天赋到本场战斗（在基础属性重置之后折入）
    applyTalentsToBattle();
    player.damage += talentMods.damageBonus;
    player.maxHealth += talentMods.healthBonus;
    player.health = player.maxHealth;
    player.fireRate = Math.max(120, player.fireRate + talentMods.fireRateBonus);
    player.bulletPiercing += talentMods.piercingBonus;
    player.bulletCount += talentMods.bulletCountBonus;
    // 护盾不折入技能等级（技能 −10%/级 与 天赋 −2%/级 权重不同，由 getShieldReduce 分别结算）
    skills.explosive.level += talentMods.explosiveLevel;
    skills.lightning.level += talentMods.lightningLevel;
    skills.freeze.level += talentMods.freezeSkillLevel;     // 干冰弹天赋起手等级（mirror 爆炸/闪电；skills.freeze 恒在 SKILL_DEFS，无需守卫）
    bombMaxCount = BOMB_MAX_COUNT + talentMods.bombMaxBonus;
    // 质变节点：天赋预置等级也可能达到节点，统一在等级确定后补触发一次
    for (const key of Object.keys(skills)) fireQualNodes(key);
    // 属性树分支派生修正：开局按已选分支重算（本局 branches 已清空，等价于纯基础）
    recomputeDamageMods();
    recomputeExplosiveMods();
    recomputeFreezeMods();
    recomputeLightningMods();
    recomputeWoodMods();
    recomputeEarthMods();
    // 五行相生协同：开局按初始已拥有技能计算
    recomputeWuxingSynergy();
    talentMods.deathrayTimer = 0;
    invincibleUntil = 0;

    // 清空对象
    bullets = [];
    zombies = [];
    particles = [];
    expOrbs = [];
    goldOrbs = [];
    damageNumbers = [];
    lightningEffects = [];
    bombExplosionEffects = [];
    deathRayEffects = [];
    hitEffects = [];

    // 清空五行领域状态（战场部署/聚怪类已于 v1.1.16 移除）
    iceFields = [];
    electricFields = [];
    logs = [];
    pendingWoodLogs = [];
    earthShields = [];
    earthSpikes = [];
    earthSinkholes = [];

    // 重置炸弹
    bombCount = 0;
    bombCooldown = 0;
    justGotBomb = false;
    bombFull = false;
    
    // 重置生成参数
    spawnTimer = 0;
    spawnInterval = 1500;

    // 重置波次系统状态
    wavesSpawned = 0;
    nextWaveIdx = 0;
    waveAlive = {};
    waveAwarded = {};
    wavesCleared = 0;
    pendingSpawns = [];   // 同波错峰出怪的待生成队列

    // 素材演示模式特殊处理
    // 整个玩家生命周期只出现一次：首次以演示模式进入第一关后，立即置位并持久化，
    // 之后（含重进第一关、重开游戏）都不再触发炸弹引导与初始金币怪批次。
    // 技能实验室（山东入口）复用第一关配置，但不走买量演示。
    isAdDemoMode = isAdDemoMode && !l1IntroDone && !isSkillLab;
    if (isAdDemoMode) {
        l1IntroDone = true;
        try { if (wx.setStorageSync) wx.setStorageSync('zombieHunterL1Intro', true); } catch (e) {}

        adDemoState = 'guiding';
        adDemoTimer = 0;
        adBombExploded = false;
        adZombieCount = 0;

        // 初始给1个炸弹
        bombCount = 1;
        bombCooldown = 0;

        // 初始生成15个各类僵尸
        spawnInitialAdZombies();
    }
}

// 素材演示模式：生成初始僵尸群
function spawnInitialAdZombies() {
    const stage = getCurrentStage();
    const count = 15 + Math.floor(Math.random() * 6); // 15-20个

    for (let i = 0; i < count; i++) {
        const x = Math.random() * (screenWidth - 100) + 50;
        const y = Math.random() * (screenHeight * 0.5) + 50; // 分布在上半屏

        let type = 'normal';
        const roll = Math.random();
        if (roll < 0.25) type = 'tank';
        else if (roll < 0.5) type = 'fast';

        const template = zombieTypes[type];
        const healthMult = stage.healthMult;

        zombies.push({
            id: _zombieIdSeq++,
            x: x,
            y: y,
            radius: template.radius,
            speed: template.speed * stage.speedMult * 0.5, // 慢速移动
            health: template.health * healthMult,
            maxHealth: template.health * healthMult,
            damage: template.damage * stage.damageMult,
            color: template.color,
            exp: template.exp,
            gold: template.gold || 5,
            type: type,
            frozenUntil: 0,
            slowUntil: 0,
            stunUntil: 0,
            _residualSlowUntil: 0,
            _inTornado: false,
            slowFactor: 0.5,
            isAdZombie: true  // 标记为素材演示僵尸（不掉经验）
        });
    }
}

// 素材演示模式专用炸弹爆炸
function adDemoBombExplosion() {
    if (adBombExploded) return;
    adBombExploded = true;

    const bombX = screenWidth - 48;
    const bombY = screenHeight - 48;
    const EXPLOSION_RADIUS = Math.max(screenWidth, screenHeight);

    // 播放爆炸音效
    AudioSystem.playBombExplosion();

    // 统计击杀数并掉落金币（素材演示僵尸100%金币不掉经验）
    adZombieCount = zombies.length;
    adGoldEarned = 0; // 重置金币计数
    for (const z of zombies) {
        if (z.isAdZombie) {
            // 素材僵尸掉落金币
            const goldAmount = z.gold || 5;
            adGoldEarned += goldAmount * 3; // 每个僵尸掉落3个金币球
            for (let i = 0; i < 3; i++) {
                goldOrbs.push({
                    x: z.x + (Math.random() - 0.5) * 30,
                    y: z.y + (Math.random() - 0.5) * 30,
                    radius: 10
                });
            }
        } else {
            // 买量演示：正常僵尸仅掉金币，不掉经验球（演示模式不依赖经验升级）
            if (Math.random() < 0.3) {
                goldOrbs.push({ x: z.x, y: z.y, radius: 10 });
            }
            onZombieRemoved(z);   // 素材演示炸弹也走波次存活计数
        }
    }

    // 清空僵尸数组
    zombies = [];

    // 全屏爆炸特效（与正常炸弹一致）
    for (let wave = 0; wave < 5; wave++) {
        setTimeout(() => {
            bombExplosionEffects.push({
                x: screenWidth / 2,
                y: screenHeight / 2,
                radius: 0,
                life: 400
            });
        }, wave * 100);
    }

    // 切换到爆炸状态
    adDemoState = 'exploding';
    adDemoTimer = 0;
}

// 坦克锁定规则（用户要求）：怪物必须已进入屏幕、且下降到开火线以下，坦克才能射击
function zombieShootable(z) {
    // 不射击超出屏幕外的敌人（含刚在顶部外生成、尚未完全入场的怪）
    if (z.y < 0 || z.y > screenHeight || z.x < 0 || z.x > screenWidth) return false;
    // 未下降到开火线以下（距屏幕底部 3/4 处）不开火
    if (z.y < TANK_FIRE_LINE_Y) return false;
    return true;
}

// ==================== 游戏更新 ====================
function update(dt) {
    // 通关条件：消灭全部 20 波敌人即胜利（20 波均已生成、场上僵尸清空、且同波错峰队列也空）
    if (!isSkillLab && wavesSpawned >= WAVE_COUNT && zombies.length === 0 && pendingSpawns.length === 0) {
        victory();
        return;
    }
    
    // 机枪跟踪（普通子弹占第 1 槽，瞄准「离墙最近」的可射击怪；属性子弹各自按技能槽序号独立瞄准，见 shootAttribute / aimAngleForSlot）。
    // 这里只负责坦克炮管朝向（普通子弹目标 = 离墙第 1 近）。
    if (zombies.length > 0) {
        const a = aimAngleForSlot(1);
        if (a !== null) player.gunAngle = a;
    }
    
    // 自动射击（基础武器：火力强化，物理子弹，射速仅由火力强化决定，独立于属性技能）
    const now = Date.now();
    const _fireMul = (skills.damage && skills.damage._mods) ? skills.damage._mods.fireMul : 1;
    const hasShootable = zombies.some(zombieShootable);
    if (hasShootable && now - player.lastShot > player.fireRate * _fireMul) {
        shootBase();
        player.lastShot = now;
    }

    // 属性技能：各自独立 cd 释放（完全不受火力强化射速影响；cd 随等级与自身「疾速弹道」降低）
    // 关键：仅当确有可射击目标、子弹真正射出时才重置 _lastFire，否则 CD 不转（避免无目标时空转冷却环）
    for (const type of ATTRIBUTE_BULLET_TYPES) {
        const s = skills[type];
        if (!s || s.level <= 0) continue;
        if (s._lastFire === undefined) s._lastFire = 0;
        if (hasShootable && now - s._lastFire >= getAttrReleaseCd(type)) {
            s._lastFire = now;
            shootAttribute(type);
        }
    }

    // 死亡射线（天赋）：每 8 秒对全场僵尸造成一次巨额伤害
    if (talentMods.deathrayLevel > 0 && zombies.length > 0) {
        talentMods.deathrayTimer += dt;
        if (talentMods.deathrayTimer >= 8000) {
            talentMods.deathrayTimer = 0;
            const dmg = player.damage * (2 + talentMods.deathrayLevel);
            for (let k = zombies.length - 1; k >= 0; k--) damageZombie(zombies[k], dmg);  // 倒序：damageZombie 可能 splice 移除僵尸
            deathRayEffects.push({ x: player.x, y: player.y, life: 400 });
            AudioSystem.playShoot();
        }
    } else {
        talentMods.deathrayTimer = 0;
    }

    updateBullets();
    updateZombies(dt);
    updateFields(dt);
    updatePendingWoodLogs();
    updateLogs(dt);
    updateEarthShields();
    updateEarthSpikes(dt);
    updateParticles();
    updateHitEffects();
    updateOrbs();
    updateDamageNumbers();
    spawnZombies(dt);
    
    // 炸弹冷却
    if (bombCooldown > 0) {
        bombCooldown -= dt;
        if (bombCooldown < 0) bombCooldown = 0;
    }
}

// ==================== 主界面-5Tab导航 ====================
let mainMenuTab = 'level'; // hero, level, talent, rank, world, shop
const MAIN_MENU_TABS = [
    { id: 'hero', icon: '🎮', name: '主角' },
    { id: 'level', icon: '🎯', name: '关卡' },
    { id: 'talent', icon: '⭐', name: '天赋' },
    { id: 'rank', icon: '🏆', name: '排行' },
    { id: 'world', icon: '🗺️', name: '世界' },
    { id: 'club', icon: '👥', name: '圈子' }
    // 商城暂时屏蔽
    // { id: 'shop', icon: '🛒', name: '商城' }
];
const MAIN_MENU_NAV_H = 65;

// ==================== 其他游戏（可拓展） ====================
// 往 OTHER_GAMES 数组里加项即可扩展「其他游戏」选择页。
// appId：目标小游戏的 AppID（wx 开头）。填写后点击图标会通过 wx.navigateToMiniProgram 跳转；
//        为空时点击仅提示「暂未配置」，不会报错。
// emoji：图标（小游戏里无法直接内嵌 HTML5 网页游戏，用 emoji 作图标最稳妥；有 AppID 后可换成对应小游戏封面图）。
const OTHER_GAMES = [
    { id: '2048', name: '2048', emoji: '🔢', icon: 'images/2048icon.png', appId: '', mode: 'ingame', alpha: '0' },
    { id: 'qiexigua', name: '忍者切水果', emoji: '🍉', icon: 'images/qiexiguaicon.png', appId: '', mode: 'ingame', alpha: 'R' },
    { id: 'feidegenggao', name: '我要飞的更高', emoji: '🚀', icon: 'images/feidegenggaoicon.png', appId: '', mode: 'ingame', alpha: 'W' },
    { id: 'bunengsi', name: '一个都不能死', emoji: '🏃', icon: 'images/bunengsiicon.png', appId: '', mode: 'ingame', alpha: 'Y' },
    { id: 'xiaoniaofeifei', name: '小鸟飞飞飞', emoji: '🐤', icon: 'images/xiaoniaofeifeiicon.png', appId: '', mode: 'ingame', alpha: 'X' },
    { id: 'qmxzfzm', name: '全民寻找房祖名', emoji: '🔍', icon: 'images/qmxzfzmicon.png', appId: '', mode: 'ingame', alpha: 'Q' },
    { id: 'bdsjm', name: '暴打神经猫', emoji: '🐱', icon: 'images/bdsjmicon.png', appId: '', mode: 'ingame', alpha: 'B' },
    { id: 'zuiqiangyanli', name: '最强眼力', emoji: '👀', icon: 'images/zuiqiangyanliicon.png', appId: '', mode: 'ingame', alpha: 'Z' },
    { id: 'qingwa', name: '小青蛙过河', emoji: '🐸', icon: 'images/qingwaicon.png', appId: '', mode: 'ingame', alpha: 'X' },
    { id: 'sqsdscj', name: '数钱数到手抽筋', emoji: '💰', icon: 'images/sqsdscjicon.png', appId: '', mode: 'ingame', alpha: 'S' },
    { id: 'shenjingmao', name: '围住神经猫', emoji: '😼', icon: 'images/shenjingmaoicon.png', appId: '', mode: 'ingame', alpha: 'W' },
    { id: 'yibihua', name: '一笔画', emoji: '✏️', icon: 'images/yibihuaicon.png', appId: '', mode: 'ingame', alpha: 'Y' },
    { id: 'sheqiu', name: '大力射手', emoji: '⚽', icon: 'images/sheqiuicon.png', appId: '', mode: 'ingame', alpha: 'D' },
    { id: 'beishumen', name: '守桥射击', emoji: '🛡️', icon: '', appId: '', mode: 'ingame', alpha: 'M' }
];

// 其他游戏图标图片表：id -> 已加载的 Image（优先于 emoji 显示）
const otherGameIcons = {};
let otherGameIconsLoaded = false;

// 微信开发者工具在「预编译」阶段会静态扫描 wx.createImage().src 引用的资源文件，
// 当 .src 被赋值为变量（如远程头像 URL、OTHER_GAMES 里的 g.icon）时无法静态解析，
// 会错误地尝试读取「项目根目录/undefined」而抛 ENOENT。
// 用间接调用规避该静态扫描（行为与原 wx.createImage() 完全一致）。
function createGameImage() {
    const factory = wx.createImage;
    return factory();
}

// 预加载「其他游戏」选择页中配置了 icon 的游戏图标
function loadOtherGameIcons() {
    if (otherGameIconsLoaded) return;
    OTHER_GAMES.forEach((g) => {
        if (g.icon && !otherGameIcons[g.id]) {
            const img = createGameImage();
            img.onload = () => { otherGameIcons[g.id] = img; };
            img.onerror = () => { console.log('游戏图标加载失败:', g.id); };
            img.src = g.icon;
        }
    });
    otherGameIconsLoaded = true;
}
let otherGamesModal = { show: false };

// 内嵌小游戏运行态（mode==='ingame' 的游戏直接在本小游戏内运行，无需 AppID）
let activeMiniGame = null;       // '2048' 或 null
let g2048 = null;                // 2048 棋盘状态
let g2048Best = 0;               // 2048 最高分（持久化到本地）
let miniGameTouchStartX = 0;     // 小游戏滑动起点
let miniGameTouchStartY = 0;

// 全民寻找房祖名 运行态（mode==='ingame' 的游戏直接在本小游戏内运行）
let qmxz = null;                 // qmxz 游戏状态
let qmxzBest = 0;                // 最高分（找到房祖名次数，持久化到本地）
let qmxzTrueImg = null, qmxzFalseImg = null, qmxzImgsLoaded = false; // 游戏内图片
let sqsdMoneyImg = null, sqsdMoneyLoaded = false; // 数钱数到手抽筋钞票图

// 暴打神经猫（内嵌）
let bdsjm = null;
let bdsjmBest = 0;

// 倍增门（内嵌）：确定性门运算 + 车道切换下落小游戏
let gSq = null;
let gSqBest = 0;

// ===== 其他游戏页：累计时长 / 最高分 / 滚动 状态 =====
let miniGamePlaySeconds = {};     // id -> 累计游玩秒数（持久化到本地）
let miniGameStatsLoaded = false;
let miniGameSessionStart = 0;    // 当前会话开始时间戳（进入小游戏时记录）
let miniGameLastFlush = 0;       // 上次落盘时间戳（每 10 秒刷一次，防崩溃丢数据）
let otherGamesScrollY = 0;       // 其他游戏页滚动偏移（<= 0）
let otherGamesExpanded = false;  // “我玩过的”是否展开全部
// 手指拖动状态（其他游戏页）
let ogTouchStartX = 0, ogTouchStartY = 0, ogDragStartY = 0, ogDragStartScrollY = 0, isOgDragging = false;

function loadMiniGameStats() {
    try { miniGamePlaySeconds = (wx.getStorageSync && wx.getStorageSync('miniGamePlaySeconds')) || {}; } catch (e) { miniGamePlaySeconds = {}; }
    if (typeof miniGamePlaySeconds !== 'object' || miniGamePlaySeconds === null) miniGamePlaySeconds = {};
}
function saveMiniGameStats() {
    try { if (wx.setStorageSync) wx.setStorageSync('miniGamePlaySeconds', miniGamePlaySeconds); } catch (e) {}
}
function ensureMiniGameStatsLoaded() {
    if (!miniGameStatsLoaded) { loadMiniGameStats(); miniGameStatsLoaded = true; }
}
// 累加某游戏累计游玩秒数
function addMiniGamePlaySeconds(id, sec) {
    if (!id || !sec || sec <= 0) return;
    miniGamePlaySeconds[id] = (miniGamePlaySeconds[id] || 0) + sec;
    saveMiniGameStats();
}
// 把当前进行中的会话时长结算进存储（进入/退出/每10秒调用）
function flushMiniGameSeconds() {
    if (!activeMiniGame || !miniGameSessionStart) return;
    const elapsed = Math.floor((Date.now() - miniGameSessionStart) / 1000);
    if (elapsed > 0) addMiniGamePlaySeconds(activeMiniGame, elapsed);
    miniGameSessionStart = Date.now();
}
// 仅展示用的最高分
function getMiniGameBest(id) {
    if (id === '2048') return g2048Best;
    if (id === 'qiexigua') return gQiexiguaBest;
    if (id === 'feidegenggao') return gFeidegenggaoBest;
    if (id === 'bunengsi') return gBunengsiBest;
    if (id === 'xiaoniaofeifei') return gXnfBest;
    if (id === 'qmxzfzm') return qmxzBest;
    if (id === 'bdsjm') return bdsjmBest;
    if (id === 'zuiqiangyanli') return gZqylBest;
    if (id === 'qingwa') return (gQingwaBest && gQingwaBest.length) ? (gQingwaBest[(gQingwa ? gQingwa.level : 1) - 1] || 0) : 0;
    if (id === 'sqsdscj') return gSqsdBest;
    if (id === 'shenjingmao') return gSjmaoBest;
    if (id === 'yibihua') return gYbhBest;
    if (id === 'sheqiu') return gDlsqBest;
    return 0;
}
// 卡片上的纪录文案：多数游戏"越高越好"，青蛙/围猫是"步数越少越好"，需要区分
function getMiniGameBestText(id) {
    const v = getMiniGameBest(id);
    if (id === 'qingwa' || id === 'shenjingmao') return v > 0 ? ('最少 ' + v + ' 步') : '最少 -';
    if (id === 'sqsdscj') return v > 0 ? ('最高 ¥' + v) : '最高 ¥0';
    if (id === 'sheqiu') return '最远 ' + v + ' km';
    if (id === 'yibihua') return '通关 ' + v + ' 关';
    if (id === 'zuiqiangyanli') return '最高 ' + v + ' 关';
    return '最高 ' + v;
}
// 玩过判定：累计 > 1 分钟
function isPlayed(id) {
    return (miniGamePlaySeconds[id] || 0) > 60;
}
let bdsjmCatImgs = [];      // 3 张神经猫图（随机显示）
let bdsjmImgsLoaded = false;
const BDSJM_ALL_TIME = 30;  // 限时（秒）
const QMXZ_COLOR_LVMAP = [2, 3, 4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 8, 8, 8, 9]; // 关卡→网格边长
const QMXZ_ALL_TIME = 60;        // 总时长（秒）

// 10章数据（每章6关，共60关）
const CHAPTERS = [
    { id: 1, name: '冰雪初现', icon: '❄️', levels: [1,2,3,4,5,6], unlocked: true },
    { id: 2, name: '暴风骤起', icon: '💨', levels: [7,8,9,10,11,12], unlocked: false },
    { id: 3, name: '冰川裂缝', icon: '🧊', levels: [13,14,15,16,17,18], unlocked: false },
    { id: 4, name: '寒霜要塞', icon: '🏔️', levels: [19,20,21,22,23,24], unlocked: false },
    { id: 5, name: '永冻深渊', icon: '👑', levels: [25,26,27,28,29,30], unlocked: false },
    { id: 6, name: '冰封王座', icon: '👑', levels: [31,32,33,34,35,36], unlocked: false },
    { id: 7, name: '极寒之地', icon: '🌨️', levels: [37,38,39,40,41,42], unlocked: false },
    { id: 8, name: '霜雪领域', icon: '❄️', levels: [43,44,45,46,47,48], unlocked: false },
    { id: 9, name: '冰河世纪', icon: '🧊', levels: [49,50,51,52,53,54], unlocked: false },
    { id: 10, name: '终结之战', icon: '🔥', levels: [55,56,57,58,59,60], unlocked: false }
];

let mainMenuExpandedChapter = 1; // 默认展开第1章

// 关卡滚动相关变量
let levelScrollY = 0; // 当前滚动偏移
let isLevelLongPressing = false; // 是否正在长按
let levelLongPressTimer = null; // 长按计时器
let levelDragStartY = 0; // 拖动开始的Y坐标
let levelDragStartScrollY = 0; // 拖动开始时的滚动偏移
let levelTouchStartX = 0; // 触摸开始X
let levelTouchStartY = 0; // 触摸开始Y
let isLevelDragging = false; // 是否正在拖动
let levelReturnHandled = false; // 是否已处理"返回关卡/主界面"按钮点击（防止触摸结束时误触发）
const LEVEL_LONG_PRESS_DURATION = 200; // 长按触发时间（毫秒）
const LEVEL_SCROLL_SENSITIVITY = 1.5; // 滚动灵敏度

// ========== 排行榜相关 ==========
let rankTab = 'global'; // 'global'=全服排行, 'friend'=好友排行
let rankScrollY = 0; // 当前滚动偏移
let rankTouchStartX = 0; // 触摸起始X
let rankTouchStartY = 0; // 触摸起始Y
let isRankDragging = false; // 是否正在拖动
let rankDragStartY = 0; // 拖动开始Y
let rankDragStartScrollY = 0; // 拖动开始时的滚动偏移

// 游戏圈按钮（原生覆盖层）
let gameClubButton = null;
let gameClubButtonVisible = false;   // 避免每帧重复 show/hide 触发原生视图重建

// 模拟全服排行榜数据（本地前100名）
const rankCityData = [
    { rank: 1, name: '冰霜之王', location: '黑龙江 哈尔滨', level: 45, power: 128500 },
    { rank: 2, name: '雪域狂魔', location: '吉林 长春', level: 43, power: 115200 },
    { rank: 3, name: '寒冰射手', location: '辽宁 沈阳', level: 42, power: 108300 },
    { rank: 4, name: '极地风暴', location: '内蒙古 呼和浩特', level: 40, power: 98500 },
    { rank: 5, name: '冰晶凤凰', location: '新疆 乌鲁木齐', level: 39, power: 92400 },
    { rank: 6, name: '冻土之心', location: '甘肃 兰州', level: 38, power: 87600 },
    { rank: 7, name: '凛冬将至', location: '青海 西宁', level: 37, power: 82300 },
    { rank: 8, name: '霜华漫天', location: '宁夏 银川', level: 36, power: 77800 },
    { rank: 9, name: '寒潮来袭', location: '陕西 西安', level: 35, power: 73500 },
    { rank: 10, name: '冰雪女王', location: '北京', level: 34, power: 69200 },
    { rank: 11, name: '北境之王', location: '天津', level: 33, power: 65800 },
    { rank: 12, name: '银装素裹', location: '河北 石家庄', level: 32, power: 62400 },
    { rank: 13, name: '冰封千里', location: '山西 太原', level: 31, power: 59100 },
    { rank: 14, name: '雪漫山河', location: '山东 济南', level: 30, power: 55800 },
    { rank: 15, name: '寒光闪烁', location: '河南 郑州', level: 29, power: 52600 },
    { rank: 16, name: '冰雨时节', location: '江苏 南京', level: 28, power: 49400 },
    { rank: 17, name: '霜雪漫天', location: '安徽 合肥', level: 27, power: 46300 },
    { rank: 18, name: '冻彻心扉', location: '上海', level: 26, power: 43200 },
    { rank: 19, name: '极寒之巅', location: '浙江 杭州', level: 25, power: 40200 },
    { rank: 20, name: '冰封王座', location: '福建 福州', level: 24, power: 37200 },
    { rank: 21, name: '寒意逼人', location: '江西 南昌', level: 23, power: 34300 },
    { rank: 22, name: '冰霜之魂', location: '湖北 武汉', level: 22, power: 31400 },
    { rank: 23, name: '霜刃飞舞', location: '广东 广州', level: 21, power: 28600 },
    { rank: 24, name: '寒冰冷酷', location: '广西 南宁', level: 20, power: 25800 },
];

// 模拟好友排行榜数据
const rankFriendData = [
    { rank: 1, name: '小明', location: '广东 深圳', level: 38, power: 89200, avatar: '🎮' },
    { rank: 2, name: '老王', location: '北京', level: 35, power: 75600, avatar: '🎯' },
    { rank: 3, name: '小李', location: '上海', level: 32, power: 62400, avatar: '⚔️' },
    { rank: 4, name: '阿强', location: '浙江 杭州', level: 28, power: 48600, avatar: '🛡️' },
];

// ========== 商城相关 ==========
// 商城分类
const SHOP_CATEGORIES = [
    { id: 'gold', name: '金币', icon: '🪙' },
    { id: 'diamond', name: '钻石', icon: '💎' },
    { id: 'bundle', name: '礼包', icon: '🎁' },
    { id: 'item', name: '道具', icon: '💣' }
];

// 当前选中的商城分类
let currentShopCategory = 'gold';

// 商城商品数据
const SHOP_ITEMS = {
    gold: [
        { id: 'gold_1', name: '金币小礼包', icon: '🪙', desc: '100金币', price: 6, amount: 100 },
        { id: 'gold_2', name: '金币中礼包', icon: '🪙', desc: '500金币', price: 30, amount: 500 },
        { id: 'gold_3', name: '金币大礼包', icon: '🪙', desc: '1200金币', price: 68, amount: 1200 },
        { id: 'gold_4', name: '金币豪华包', icon: '💰', desc: '2500金币', price: 128, amount: 2500 },
        { id: 'gold_5', name: '金币至尊包', icon: '👑', desc: '7000金币', price: 328, amount: 7000 },
    ],
    diamond: [
        { id: 'diamond_1', name: '钻石小礼包', icon: '💎', desc: '60钻石', price: 6, amount: 60 },
        { id: 'diamond_2', name: '钻石中礼包', icon: '💎', desc: '328钻石', price: 30, amount: 328 },
        { id: 'diamond_3', name: '钻石大礼包', icon: '💎', desc: '680钻石', price: 68, amount: 680 },
        { id: 'diamond_4', name: '钻石豪华包', icon: '💎', desc: '1400钻石', price: 128, amount: 1400 },
        { id: 'diamond_5', name: '钻石至尊包', icon: '👑', desc: '3500钻石', price: 328, amount: 3500 },
    ],
    bundle: [
        { id: 'bundle_1', name: '新手礼包', icon: '🎁', desc: '100金币+1体力', price: 6, amount: 101 },
        { id: 'bundle_2', name: '月卡', icon: '📅', desc: '30天每日100金币', price: 30, amount: 3000 },
        { id: 'bundle_3', name: '战令礼包', icon: '🎖️', desc: '专属皮肤+双倍经验', price: 68, amount: 1 },
    ],
    item: [
        { id: 'energy_1', name: '体力药水(小)', icon: '🧪', desc: '恢复30点体力', price: 6, amount: 30 },
        { id: 'energy_2', name: '体力药水(中)', icon: '🧪', desc: '恢复60点体力', price: 15, amount: 60 },
        { id: 'energy_3', name: '体力药水(大)', icon: '🧪', desc: '恢复100点体力', price: 30, amount: 100 },
    ]
};

// 商城弹窗状态
let shopModal = {
    show: false,
    type: 'confirm', // 'confirm'确认购买, 'alert'提示
    item: null,
    buttonText: '确定'
};

// 商城滚动相关变量
let shopScrollY = 0;
let shopTouchStartY = 0;
let shopDragStartY = 0;
let shopDragStartScrollY = 0;
let isShopDragging = false;

// 主角数据
let heroData = {
    name: '冰雪猎人',
    level: 12,
    rank: 888,
    power: 36666
};

// 微信头像
let wechatAvatarImage = null; // 加载后的 Image 对象

// 天赋数据（按章节解锁）
// prerequisite: { id: 'talent_id', level: N } - 前置天赋及其等级要求
// 天赋设计说明（v1.0.55 重做）：
// 前期基础属性类天赋（core/damage/health/attackspeed）由“百分比”改为“直接加数值”，
// 让玩家升级时能立刻感觉到数值变化。金币/经验类保留百分比（经济概念），攻速改为直接减 ms。
// 所有天赋在 startGame 时通过 applyTalentsToBattle() 折入本场战斗（player / skills / 机制标记）。
let talentData = {
    'core': { name: '怪物之心', icon: '👾', level: 0, max: 20, cost: 2000, perLevelPower: 200, effect: '攻击 +1，生命 +2', chapter: 1, prerequisite: null },
    'damage': { name: '攻击力', icon: '⚔️', level: 0, max: 30, cost: 300, perLevelPower: 30, effect: '攻击 +1', chapter: 2, prerequisite: { id: 'core', level: 5 } },
    'health': { name: '生命', icon: '❤️', level: 0, max: 30, cost: 300, perLevelPower: 30, effect: '生命 +6', chapter: 2, prerequisite: { id: 'core', level: 5 } },
    'goldearn': { name: '金币获取', icon: '🪙', level: 0, max: 20, cost: 400, perLevelPower: 40, effect: '金币 +5%', chapter: 2, prerequisite: { id: 'damage', level: 3 } },
    'expearn': { name: '经验获取', icon: '⭐', level: 0, max: 20, cost: 400, perLevelPower: 40, effect: '经验 +5%', chapter: 2, prerequisite: { id: 'damage', level: 3 } },
    'attackspeed': { name: '攻击速度', icon: '⚡', level: 0, max: 20, cost: 500, perLevelPower: 50, effect: '攻速 −10ms', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'crit': { name: '暴击率', icon: '💥', level: 0, max: 25, cost: 500, perLevelPower: 50, effect: '暴击率 +1%（暴击×2）', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'piercing': { name: '穿透', icon: '🗡️', level: 0, max: 10, cost: 800, perLevelPower: 80, effect: '穿透 +1', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'shield': { name: '护盾', icon: '🛡️', level: 0, max: 20, cost: 500, perLevelPower: 50, effect: '受伤 −2%', chapter: 4, prerequisite: { id: 'health', level: 10 } },
    'explosive': { name: '爆炸', icon: '💣', level: 0, max: 10, cost: 1000, perLevelPower: 100, effect: '爆炸范围 +1级', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'freeze': { name: '冰冻', icon: '❄️', level: 0, max: 15, cost: 800, perLevelPower: 80, effect: '命中冰冻 +1.5%，干冰弹起手 +1级', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'slow': { name: '减速', icon: '🐌', level: 0, max: 15, cost: 800, perLevelPower: 80, effect: '命中减速 +2%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'bombcount': { name: '炸弹上限', icon: '💣', level: 0, max: 8, cost: 1200, perLevelPower: 120, effect: '炸弹上限 +1', chapter: 6, prerequisite: { id: 'shield', level: 5 } },
    'lightning': { name: '闪电链', icon: '⚡', level: 0, max: 10, cost: 1500, perLevelPower: 150, effect: '闪电链 +1级', chapter: 8, prerequisite: { id: 'crit', level: 10 } },
    'multishot': { name: '连射', icon: '🏹', level: 0, max: 8, cost: 1500, perLevelPower: 150, effect: '子弹 +1', chapter: 8, prerequisite: { id: 'crit', level: 10 } },
    'deathray': { name: '死亡射线', icon: '💥', level: 0, max: 5, cost: 5000, perLevelPower: 500, effect: '全屏射线（每8秒）', chapter: 10, prerequisite: { id: 'lightning', level: 5 } },
    'immortal': { name: '不朽之身', icon: '🔮', level: 0, max: 3, cost: 8000, perLevelPower: 800, effect: '复活 +1次（无敌10秒）', chapter: 10, prerequisite: { id: 'lightning', level: 5 } },
    'devour': { name: '吞噬万物', icon: '🌪️', level: 0, max: 5, cost: 5000, perLevelPower: 500, effect: '击杀回血 +1', chapter: 10, prerequisite: { id: 'lightning', level: 5 } }
};

// ==================== 天赋分栏子页 + 五行深养成链 + 统御真前置树（v1.1.40 / v1.1.41） ====================
// 说明：原 v1.1.40~v1.1.41 的混淆产物不可还原，此处为忠实重建的数据驱动天赋系统。
// 四个分栏子页：根脉 / 五行 / 统御 / 防御。五行各含 I/II/III 三阶段深链 + 共鸣；统御为深前置树。

const TALENT_PAGES = [
    { id: 'root',    label: '根脉', icon: '🌱' },
    { id: 'element', label: '五行', icon: '☯️' },
    { id: 'supreme', label: '统御', icon: '👑' },
    { id: 'defense', label: '防御', icon: '🛡️' }
];

// 每个分栏子页的有序布局项：{h:true,text} 表头 或 {id} 节点
const talentLayout = { root: [], element: [], supreme: [], defense: [] };

function mkTalent(o) {
    return {
        level: 0, max: o.max, cost: o.cost, perLevelPower: o.pp, effect: o.effect,
        chapter: o.ch, prerequisite: o.prerequisite || null, page: o.page,
        icon: o.icon, name: o.name, contrib: o.contrib || null
    };
}
function scaleContrib(contrib, mul) {
    const r = {};
    for (const k in contrib) r[k] = contrib[k] * mul;
    return r;
}

function buildTalentTree() {
    const setPage = (id, page) => { if (talentData[id]) talentData[id].page = page; };

    // ---- 根脉页：基础属性 ----
    talentLayout.root.push({ h: true, text: '🌟 根脉 · 基础属性' });
    ['core', 'damage', 'health', 'goldearn', 'expearn'].forEach(id => { setPage(id, 'root'); talentLayout.root.push({ id }); });
    talentLayout.root.push({ h: true, text: '⚔️ 根脉 · 进阶属性' });
    ['attackspeed', 'crit', 'piercing', 'shield', 'bombcount'].forEach(id => { setPage(id, 'root'); talentLayout.root.push({ id }); });

    // ---- 五行页：基础技能 ----
    talentLayout.element.push({ h: true, text: '🔥 五行 · 基础技能' });
    ['explosive', 'freeze', 'slow', 'lightning', 'multishot'].forEach(id => { setPage(id, 'element'); talentLayout.element.push({ id }); });

    // ---- 统御页：终极天赋（基础3个） ----
    talentLayout.supreme.push({ h: true, text: '👑 统御 · 终极天赋' });
    ['deathray', 'immortal', 'devour'].forEach(id => { setPage(id, 'supreme'); talentLayout.supreme.push({ id }); });

    // ---- 五行深养成链（金/木/水/火/土 各 I/II/III + 共鸣） ----
    const ELEMENTS = [
        { key: 'jin',  name: '金', icon: '⚔️', src: 'lightning', contrib: { critChance: 0.005, lightningLevel: 1 },  desc: '暴击与雷电' },
        { key: 'mu',   name: '木', icon: '🌿', src: 'health',    contrib: { healthBonus: 4, lifestealPerKill: 1 },    desc: '生命与汲取' },
        { key: 'shui', name: '水', icon: '💧', src: 'freeze',    contrib: { freezeChance: 0.01, slowChance: 0.01 },   desc: '冰霜与减速' },
        { key: 'huo',  name: '火', icon: '🔥', src: 'damage',    contrib: { damageBonus: 1 },                       desc: '烈焰与焚伤' },
        { key: 'tu',   name: '土', icon: '⛰️', src: 'shield',    contrib: { shieldLevel: 1, healthBonus: 3 },       desc: '山岳与守护' }
    ];
    const TIERS = [
        { t: 'I',   max: 10, cost: 400,  pp: 40,  ch: 2, mul: 1 },
        { t: 'II',  max: 10, cost: 800,  pp: 80,  ch: 4, mul: 1.5 },
        { t: 'III', max: 10, cost: 1500, pp: 150, ch: 6, mul: 2 }
    ];
    ELEMENTS.forEach(el => {
        talentLayout.element.push({ h: true, text: el.icon + ' 五行 · ' + el.name + '系（' + el.desc + '）' });
        let prevB = null;
        TIERS.forEach((tier, ti) => {
            const a = el.key + '_t' + (ti + 1) + 'a';
            const b = el.key + '_t' + (ti + 1) + 'b';
            const pre = ti === 0 ? el.src : prevB;
            const mk = (id, sub) => talentData[id] = mkTalent({
                name: el.name + '·' + tier.t + sub, icon: el.icon, max: tier.max, cost: tier.cost, pp: tier.pp, ch: tier.ch,
                effect: el.desc + '强化（每级）', prerequisite: pre ? { id: pre, level: 5 } : null,
                page: 'element', contrib: scaleContrib(el.contrib, tier.mul)
            });
            mk(a, '甲'); mk(b, '乙');
            talentLayout.element.push({ id: a }, { id: b });
            prevB = b;
        });
        const cap = el.key + '_cap';
        talentData[cap] = mkTalent({
            name: el.name + '·共鸣', icon: '✨', max: 5, cost: 3000, pp: 300, ch: 8,
            effect: el.name + '系质变：全' + el.desc + '大幅提升', prerequisite: { id: prevB, level: 10 },
            page: 'element', contrib: scaleContrib(el.contrib, 3)
        });
        talentLayout.element.push({ id: cap });
    });

    // ---- 统御真前置树（12 节点） ----
    const S = (id, name, icon, max, cost, pp, ch, effect, pre, contrib) =>
        talentData[id] = mkTalent({ name, icon, max, cost, pp, ch, effect, prerequisite: pre, page: 'supreme', contrib });
    S('sup_war0',   '统御·战',   '⚔️', 10, 1000, 100, 8,  '战斗潜能（每级）',           { id: 'jin_cap',  level: 3 }, { damageBonus: 2 });
    S('sup_war1',   '统御·战·极', '🗡️', 10, 2000, 200, 10, '伤害大幅提升（每级）',       { id: 'sup_war0', level: 10 }, { damageBonus: 3 });
    S('sup_guard0', '统御·御',   '🛡️', 10, 1000, 100, 8,  '守护潜能（每级）',           { id: 'tu_cap',   level: 3 }, { shieldLevel: 2 });
    S('sup_guard1', '统御·御·极', '🏰', 10, 2000, 200, 10, '减伤大幅提升（每级）',       { id: 'sup_guard0', level: 10 }, { shieldLevel: 3, healthBonus: 20 });
    S('sup_celest', '统御·天',   '☀️', 5,  3000, 300, 10, '死亡射线 +1 级',             { id: 'huo_cap',  level: 3 }, { deathrayLevel: 1 });
    S('sup_life',   '统御·命',   '❤️', 5,  3000, 300, 10, '不朽 +1 / 汲取 +2',          { id: 'mu_cap',   level: 3 }, { immortalCharges: 1, lifestealPerKill: 2 });
    S('sup_wealth', '统御·财',   '🪙', 5,  3000, 300, 10, '金币/经验 +10%（每级）',      { id: 'shui_cap', level: 3 }, { goldMult: 0.1, expMult: 0.1 });
    S('sup_core',   '统御·心',   '💠', 10, 1500, 150, 8,  '攻血兼修（每级）',           { id: 'devour',   level: 3 }, { damageBonus: 1, healthBonus: 10 });
    S('sup_unify',  '统御·合',   '🔆', 10, 1500, 150, 8,  '五行协调（每级）',           { id: 'shui_cap', level: 3 }, { freezeChance: 0.005, slowChance: 0.005 });
    S('sup_apex',   '统御·极',   '🌟', 5,  5000, 500, 10, '全能质变：全局强化',         { id: 'sup_war1', level: 10 }, { damageBonus: 5, shieldLevel: 3, healthBonus: 30, lifestealPerKill: 3 });
    S('sup_apex2',  '统御·穹',   '🌌', 5,  5000, 500, 10, '全能质变：资源增益',         { id: 'sup_guard1', level: 10 }, { goldMult: 0.15, expMult: 0.15 });
    S('sup_origin', '统御·源',   '🔮', 10, 1500, 150, 8,  '本源潜能（每级）',           { id: 'immortal', level: 3 }, { healthBonus: 15, lifestealPerKill: 2 });
    ['sup_war0', 'sup_war1', 'sup_guard0', 'sup_guard1', 'sup_celest', 'sup_life', 'sup_wealth', 'sup_core', 'sup_unify', 'sup_apex', 'sup_apex2', 'sup_origin']
        .forEach(id => talentLayout.supreme.push({ id }));

    // ---- 防御深链（14 节点） ----
    const D = (id, name, icon, max, cost, pp, ch, effect, pre, contrib) => {
        talentData[id] = mkTalent({ name, icon, max, cost, pp, ch, effect, prerequisite: pre, page: 'defense', contrib });
        talentLayout.defense.push({ id });
    };
    talentLayout.defense.push({ h: true, text: '🛡️ 防御 · 守护系' });
    D('def_stone',  '岩盾',     '🪨', 10, 600,  60,  2,  '受伤 -1%/级',            { id: 'shield',    level: 5 }, { shieldLevel: 1 });
    D('def_thorn',  '荆棘',     '🌵', 10, 800,  80,  4,  '反伤护盾 +1/级',        { id: 'def_stone', level: 5 }, { shieldLevel: 1 });
    D('def_regen',  '回春',     '🌱', 10, 800,  80,  4,  '击杀回血 +1/级',        { id: 'def_stone', level: 5 }, { lifestealPerKill: 1 });
    D('def_iron',   '铁壁',     '🧱', 10, 1000, 100, 6,  '受伤 -2%/级',           { id: 'def_thorn', level: 5 }, { shieldLevel: 2 });
    D('def_unyield','不屈',     '💪', 5,  2000, 200, 8,  '复活 +1（每级）',       { id: 'def_iron',  level: 10 }, { immortalCharges: 1 });
    D('def_barrier','壁垒',     '⛩️', 10, 1000, 100, 6,  '生命 +15/级',           { id: 'def_regen', level: 5 }, { healthBonus: 15 });
    D('def_guard',  '守护',     '🔰', 10, 1500, 150, 8,  '受伤 -2%/级',           { id: 'def_barrier', level: 10 }, { shieldLevel: 2 });
    D('def_aegis',  '庇护',     '✨', 5,  3000, 300, 10, '全减伤质变',            { id: 'def_guard', level: 10 }, { shieldLevel: 3, healthBonus: 30 });
    talentLayout.defense.push({ h: true, text: '🩸 防御 · 汲取系' });
    D('def_leech',  '汲取',     '🩸', 10, 600,  60,  2,  '击杀回血 +1/级',        { id: 'bombcount', level: 3 }, { lifestealPerKill: 1 });
    D('def_vamp',   '嗜血',     '🧛', 10, 1000, 100, 6,  '击杀回血 +2/级',        { id: 'def_leech', level: 10 }, { lifestealPerKill: 2 });
    D('def_eternal','不朽之拥', '♾️', 5,  3000, 300, 10, '复活 +1/级',            { id: 'def_vamp',  level: 10 }, { immortalCharges: 1 });
    D('def_vital',  '生机',     '💗', 10, 800,  80,  4,  '生命 +10/级',           { id: 'def_leech', level: 5 }, { healthBonus: 10 });
    D('def_bastion','堡垒',     '🏯', 10, 1500, 150, 8,  '生命 +20/级',           { id: 'def_vital', level: 10 }, { healthBonus: 20 });
    D('def_sanct',  '圣域',     '⛪', 5,  3000, 300, 10, '生命质变 + 减伤',        { id: 'def_bastion', level: 10 }, { healthBonus: 40, shieldLevel: 2 });
}
buildTalentTree();

// 天赋分栏子页 Tab 栏几何（绘制与点击共用，保证一致）
function getTalentTabRects() {
    const topOffset = SAFE_TOP_OFFSET;
    const y = topOffset + 24;
    const h = 34;
    const padding = 12;
    const gap = 8;
    const w = (screenWidth - padding * 2 - gap * (TALENT_PAGES.length - 1)) / TALENT_PAGES.length;
    return TALENT_PAGES.map((p, i) => ({ id: p.id, label: p.icon + ' ' + p.label, x: padding + i * (w + gap), y, w, h }));
}

// 天赋分栏子页 Tab 点击处理（返回 true 表示命中并切换）
function handleTalentTabClick(x, y) {
    for (const r of getTalentTabRects()) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            if (talentPage !== r.id) { talentPage = r.id; talentScrollX = 0; }
            return true;
        }
    }
    return false;
}

// 本场战斗的天赋修正集合（startGame 时由 applyTalentsToBattle 计算填充）
let talentMods = {
    damageBonus: 0, healthBonus: 0, fireRateBonus: 0,
    critChance: 0, critDamageMult: 2, critLevel: 0,
    piercingBonus: 0, shieldLevel: 0,
    explosiveLevel: 0, lightningLevel: 0, freezeSkillLevel: 0,
    freezeChance: 0, slowChance: 0, freezeLevel: 0, slowLevel: 0,
    bulletCountBonus: 0, bombMaxBonus: 0,
    goldMult: 1, expMult: 1,
    deathrayLevel: 0, deathrayTimer: 0,
    immortalCharges: 0, lifestealPerKill: 0
};

// 根据已加点天赋，计算本场战斗的全部修正
function applyTalentsToBattle() {
    const t = talentData;
    const m = {
        damageBonus: 0, healthBonus: 0, fireRateBonus: 0,
        critChance: 0, critDamageMult: 2, critLevel: 0,
        piercingBonus: 0, shieldLevel: 0,
        explosiveLevel: 0, lightningLevel: 0, freezeSkillLevel: 0,
        freezeChance: 0, slowChance: 0, freezeLevel: 0, slowLevel: 0,
        bulletCountBonus: 0, bombMaxBonus: 0,
        goldMult: 1, expMult: 1,
        deathrayLevel: 0, deathrayTimer: 0,
        immortalCharges: 0, lifestealPerKill: 0
    };
    // 基础属性：直接加数值
    m.damageBonus += t.core.level * 1 + t.damage.level * 1;
    m.healthBonus += t.core.level * 2 + t.health.level * 6;
    m.fireRateBonus -= t.attackspeed.level * 10;            // 攻速：每级 −10ms
    // 机制类
    m.critChance += t.crit.level * 0.01;                    // 暴击率：每级 +1%（局内「致命暴击」每级 +5%）
    m.critLevel = t.crit.level;
    m.piercingBonus += t.piercing.level;                    // 穿透：每级 +1
    m.shieldLevel += t.shield.level;                        // 护盾：每级受伤 −2%（叠加技能护盾 −10%/级）
    m.explosiveLevel += t.explosive.level;                  // 爆炸：每级 +1 级范围
    m.lightningLevel += t.lightning.level;                  // 闪电链：每级 +1 级
    m.freezeSkillLevel += t.freeze.level;                   // 干冰弹起手等级：每级 +1 级（mirror 爆炸/闪电）
    m.freezeChance += t.freeze.level * 0.015;               // 命中冰冻：每级 +1.5%（局内「冰霜弹」每级 +6%）
    m.slowChance += t.slow.level * 0.02;                    // 命中减速：每级 +2%（局内「缓速弹」每级 +8%）
    m.freezeLevel = t.freeze.level;
    m.slowLevel = t.slow.level;
    m.bulletCountBonus += t.multishot.level;                // 连射：每级 +1 子弹
    m.bombMaxBonus += t.bombcount.level;                    // 炸弹上限：每级 +1
    m.goldMult *= (1 + t.goldearn.level * 0.05);            // 金币：每级 +5%
    m.expMult *= (1 + t.expearn.level * 0.05);              // 经验：每级 +5%
    m.deathrayLevel += t.deathray.level;                    // 死亡射线：每级 +1 级（每8秒全屏伤害）
    m.immortalCharges += t.immortal.level;                  // 不朽之身：每级 +1 次复活
    m.lifestealPerKill += t.devour.level;                   // 吞噬万物：每级击杀回血 +1

    // 五行深链 / 统御 / 防御 等新节点的通用贡献（声明了 contrib 才生效；基础18节点不含 contrib，不受影响）
    const CONTRIB_MULT = ['goldMult', 'expMult', 'critDamageMult'];
    for (const key in talentData) {
        const c = talentData[key].contrib;
        if (!c) continue;
        const lv = talentData[key].level;
        if (lv <= 0) continue;
        for (const k in c) {
            if (CONTRIB_MULT.indexOf(k) >= 0) {
                m[k] *= (1 + lv * c[k]);
            } else {
                m[k] += lv * c[k];
            }
        }
    }

    talentMods = m;
}

// 检查天赋是否满足前置条件
function isTalentUnlocked(talentId) {
    const talent = talentData[talentId];
    if (!talent.prerequisite) return true; // 无前置条件
    const preTalent = talentData[talent.prerequisite.id];
    return preTalent.level >= talent.prerequisite.level;
}

// 计算玩家总战力（基于天赋等级）
function calculatePower() {
    let total = 0;
    Object.keys(talentData).forEach(key => {
        total += talentData[key].level * talentData[key].perLevelPower;
    });
    return total;
}

// 获取玩家在全服排行榜中的名次
function getPlayerRank() {
    const playerPower = calculatePower();
    // rankCityData 按战力降序排列，找比玩家战力高的人数
    let higherCount = 0;
    for (const entry of rankCityData) {
        if (entry.power > playerPower) {
            higherCount++;
        } else {
            break; // 降序排列，遇到 <= 的就不用继续了
        }
    }
    return higherCount + 1;
}

// 升级天赋
// ========== 金币经济模型（v1.1.58 重算） ==========
// 获取曲线 = 直线：每关通关固定奖励 = GOLD_BASE + GOLD_SLOPE·(关序号-1)，斜率恒定、无波动。
// 消耗曲线 = 二次幂：升级到 L+1 级花费 = round(BASE·(L+1)² / COST_QUAD_SCALE)，
//   早期廉价、后期陡峭，与线性收入交替形成自然门槛（早期收入盖过消耗，高阶被二次幂卡住）。
const GOLD_BASE = 200;       // 第1关通关基础金币
const GOLD_SLOPE = 30;       // 直线斜率：每往后一关 +30 金币（第60关≈1970）
const COST_QUAD_SCALE = 4;   // 调谐系数：让既有 BASE 落到合理量级，不改变幂次
function getStageGoldReward(stageId) {
    return GOLD_BASE + GOLD_SLOPE * Math.max(0, (stageId | 0) - 1);
}
function getTalentCost(talent) {
    const next = talent.level + 1;                 // 目标等级（1 起）
    return Math.round((talent.cost * next * next) / COST_QUAD_SCALE);
}

function upgradeTalent(talentId) {
    const talent = talentData[talentId];
    if (talent.level >= talent.max) return false; // 已满级
    if (!isTalentUnlocked(talentId)) return false; // 未解锁
    const cost = getTalentCost(talent);
    if (player.gold < cost) return false; // 金币不足
    
    player.gold -= cost;
    talent.level++;
    savePlayerData();
    return true;
}

// 当前解锁的最高章节（用于判断天赋解锁状态）
let highestUnlockedChapter = 2;

function drawMainMenu() {
    // 游戏圈入口（原生按钮）采用“仅创建一次、事件驱动显隐”策略：
    // 原生视图只在首次进入圈子Tab时创建并 show 一次，切Tab离开时 hide、离开主菜单才 destroy，
    // 渲染循环里绝不每帧调用任何 wx 方法，从机制上杜绝原生视图反复重建导致的报错卡顿。

    // 皇室战争风深蓝渐变背景
    drawRoyaleBackground();
    
    // 根据当前Tab绘制内容
    if (mainMenuTab === 'hero') {
        drawMainMenuHero();
    } else if (mainMenuTab === 'level') {
        drawMainMenuLevel();
    } else if (mainMenuTab === 'talent') {
        drawMainMenuTalent();
    } else if (mainMenuTab === 'rank') {
        drawMainMenuRank();
    } else if (mainMenuTab === 'world') {
        drawMainMenuWorld();
    } else if (mainMenuTab === 'club') {
        drawMainMenuClub();
    }
    // 商城暂时屏蔽
    // else if (mainMenuTab === 'shop') {
    //     drawMainMenuShop();
    // }
    
    // 天赋升级弹窗
    if (talentModal.show) {
        drawTalentModal();
    }
    
    // 商城弹窗
    if (shopModal.show) {
        drawShopModal();
    }

    // 体力不足弹窗
    if (energyModal.show) {
        drawEnergyModal();
    }

    // 设置弹窗
    if (settingsModal.show) {
        drawSettingsModal();
    }

    // 底部导航栏
    drawMainMenuNav();

    // 其他游戏选择页（最后绘制，盖住主界面与底部导航，避免Tab透出/被点击）
    if (otherGamesModal.show) {
        drawOtherGamesPage();
    }
}

function drawMainMenuNav() {
    const navY = screenHeight - MAIN_MENU_NAV_H;
    const btnW = screenWidth / MAIN_MENU_TABS.length;  // 适配6个Tab

    // 导航背景（深蓝，带顶部分隔金线）
    ctx.fillStyle = 'rgba(8, 20, 36, 0.98)';
    ctx.fillRect(0, navY, screenWidth, MAIN_MENU_NAV_H);

    ctx.strokeStyle = 'rgba(255, 210, 74, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, navY);
    ctx.lineTo(screenWidth, navY);
    ctx.stroke();

    MAIN_MENU_TABS.forEach((tab, i) => {
        const bx = i * btnW;
        const isActive = mainMenuTab === tab.id;

        // 选中指示条（金色）
        if (isActive) {
            ctx.fillStyle = ROYALE.gold;
            ctx.fillRect(bx + 10, navY + 2, btnW - 20, 3);
        }

        // 图标
        ctx.fillStyle = isActive ? ROYALE.gold : '#5f7591';
        ctx.font = isActive ? 'bold 22px Arial' : '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(tab.icon, bx + btnW / 2, navY + 28);

        // 名称
        ctx.fillStyle = isActive ? '#ffffff' : '#7a8aa5';
        ctx.font = '10px Arial';
        ctx.fillText(tab.name, bx + btnW / 2, navY + 48);
    });
}

// 主角Tab
function drawMainMenuHero() {
    const topOffset = SAFE_TOP_OFFSET;

    // 标题
    ctx.fillStyle = ROYALE.gold;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('主角', screenWidth / 2, topOffset + 20);

    // ===== 顶部资源栏（皇室战争风：等级/金币/钻石/能量） =====
    drawHeroResourceBar(topOffset);
    ctx.textAlign = 'center';

    const centerX = screenWidth / 2;
    
    // ===== 计算布局（垂直居中） =====
    // 内容总高度：头像(80) + 间距(25) + 面板(115) ≈ 220，但需要加上体力条高度
    const contentTotalH = 220 + 40; // 额外40px给体力条
    const contentTop = (screenHeight - MAIN_MENU_NAV_H - contentTotalH) / 2;
    
    // ===== 主角装备区域（左右布局） =====
    const avatarY = contentTop + 40;
    const avatarSize = 80;
    const avatarR = avatarSize / 2;
    
    // 左侧3个装备槽
    const slotSize = 48;
    const slotGap = 8;
    const slotToAvatarGap = 25; // 装备槽与头像的间距
    const leftSlotsX = centerX - avatarSize / 2 - slotToAvatarGap - slotSize;
    const rightSlotsX = centerX + avatarSize / 2 + slotToAvatarGap;
    const slotsStartY = avatarY - (3 * slotSize + 2 * slotGap) / 2;
    
    const slotIcons = ['🔒', '🔒', '🔒', '🔒', '🔒', '🔒'];
    
    // 绘制6个装备槽
    for (let i = 0; i < 6; i++) {
        const col = i < 3 ? 0 : 1;
        const row = i % 3;
        const sx = col === 0 ? leftSlotsX : rightSlotsX;
        const sy = slotsStartY + row * (slotSize + slotGap);
        
        // 槽位背景（皇室战争风卡片）
        ctx.fillStyle = ROYALE.panelLight;
        roundRect(ctx, sx, sy, slotSize, slotSize, 10);
        ctx.fill();

        // 边框（蓝色细描边）
        ctx.strokeStyle = ROYALE.panelBorder;
        ctx.lineWidth = 1.5;
        roundRect(ctx, sx, sy, slotSize, slotSize, 10);
        ctx.stroke();

        // 图标
        ctx.fillStyle = ROYALE.textMuted;
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slotIcons[i], sx + slotSize / 2, sy + slotSize / 2);
    }
    
    ctx.textBaseline = 'alphabetic';
    
    // ===== 中央头像 =====
    // 光晕
    const glowGrad = ctx.createRadialGradient(centerX, avatarY, avatarR * 0.5, centerX, avatarY, avatarR * 1.5);
    glowGrad.addColorStop(0, 'rgba(255, 210, 74, 0.32)');
    glowGrad.addColorStop(1, 'rgba(255, 210, 74, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(centerX, avatarY, avatarR * 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // 头像边框（金色）
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, avatarY, avatarR, 0, Math.PI * 2);
    ctx.stroke();
    
    // 头像内部（径向渐变）
    const avatarGrad = ctx.createRadialGradient(centerX, avatarY - avatarR * 0.3, 0, centerX, avatarY, avatarR);
    avatarGrad.addColorStop(0, '#2a4a6a');
    avatarGrad.addColorStop(1, '#1a3a5a');
    ctx.fillStyle = avatarGrad;
    ctx.beginPath();
    ctx.arc(centerX, avatarY, avatarR - 2, 0, Math.PI * 2);
    ctx.fill();
    
    // 微信头像（加载成功后替换默认图标）
    if (wechatAvatarImage) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, avatarY, avatarR - 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(wechatAvatarImage, centerX - avatarR + 2, avatarY - avatarR + 2, avatarR * 2 - 4, avatarR * 2 - 4);
        ctx.restore();
    } else {
        // 默认怪物图标
        ctx.fillStyle = '#fff';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👾', centerX, avatarY);
        ctx.textBaseline = 'alphabetic';
    }
    
    // ===== 底部信息面板 =====
    const panelX = 15;
    const panelY = avatarY + avatarR + 45;
    const panelW = screenWidth - 30;
    const panelH = 115;
    
    // 面板背景（皇室战争风）
    drawRoyalePanel(panelX, panelY, panelW, panelH, 15);
    
    // 4行信息
    // 计算所有天赋等级之和
    const totalTalentLevel = Object.values(talentData).reduce((sum, t) => sum + t.level, 0);
    const rows = [
        { label: '玩家名字', value: heroData.name },
        { label: '天赋等级', value: 'Lv.' + totalTalentLevel },
        { label: '排行榜名次', value: '第 ' + getPlayerRank() + ' 名' },
        { label: '总战力', value: calculatePower().toLocaleString() }
    ];
    
    const rowH = 28;
    const labelX = panelX + 15;
    const valueX = panelX + panelW - 15;
    
    rows.forEach((row, i) => {
        const rowY = panelY + 18 + i * rowH;
        
        // 分割线（除最后一行）
        if (i < rows.length - 1) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(labelX, rowY + 8);
            ctx.lineTo(valueX, rowY + 8);
            ctx.stroke();
        }
        
        // 标签
        ctx.fillStyle = ROYALE.textMuted;
        ctx.font = '13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(row.label, labelX, rowY);
        
        // 数值
        ctx.fillStyle = ROYALE.gold;
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(row.value, valueX, rowY);
    });

    // ===== 设置按钮（皇室战争风立体按钮） =====
    const settingsBtnY = panelY + panelH + 20;
    const settingsBtnH = 45;

    drawRoyaleBevelButton({ x: panelX, y: settingsBtnY, w: panelW, h: settingsBtnH, r: 10 }, '⚙ 游戏设置', 'gold');

    // ===== 其他游戏按钮（位于游戏设置下方） =====
    const otherGamesBtnY = settingsBtnY + settingsBtnH + 12;
    const otherGamesBtnH = 45;

    drawRoyaleBevelButton({ x: panelX, y: otherGamesBtnY, w: panelW, h: otherGamesBtnH, r: 10 }, '🎮 其他游戏', 'blue');
}

// 关卡Tab
function drawMainMenuLevel() {
    const topOffset = SAFE_TOP_OFFSET;

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('关卡', screenWidth / 2, topOffset + 20);

    // 计算内容总高度
    let totalContentH = 0;
    CHAPTERS.forEach((chapter) => {
        const isExpanded = mainMenuExpandedChapter === chapter.id && chapter.unlocked;
        const chapterH = isExpanded ? 210 : 70;
        totalContentH += chapterH + 10;
    });

    const contentH = screenHeight - MAIN_MENU_NAV_H - topOffset;
    const maxScroll = Math.max(0, totalContentH - contentH);

    // 限制滚动范围
    levelScrollY = Math.max(-maxScroll, Math.min(0, levelScrollY));

    // 使用裁剪区域实现滚动
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, topOffset, screenWidth, contentH);
    ctx.clip();

    let currentY = topOffset + levelScrollY;
    
    CHAPTERS.forEach((chapter, ci) => {
        const isExpanded = mainMenuExpandedChapter === chapter.id && chapter.unlocked;
        const chapterH = isExpanded ? 210 : 70;
        
        // 章节背景
        ctx.fillStyle = 'rgba(15, 52, 96, 0.6)';
        roundRect(ctx, 15, currentY, screenWidth - 30, chapterH, 15);
        ctx.fill();
        
        // 章节头部区域
        const headerY = currentY + 10;
        
        // 展开/折叠箭头
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(isExpanded ? '▼' : '▶', 30, headerY + 25);
        
        // 章节图标（圆形背景）
        ctx.fillStyle = 'rgba(30, 58, 95, 0.8)';
        ctx.beginPath();
        ctx.arc(65, headerY + 20, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(chapter.icon, 65, headerY + 26);
        
        // 章节名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`第${chapter.id}章`, 95, headerY + 18);
        
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.fillText(chapter.name, 95, headerY + 36);
        
        // 状态标签
        const tagX = screenWidth - 90;
        const tagY = headerY + 12;
        if (chapter.unlocked) {
            let cleared = 0;
            chapter.levels.forEach(lv => {
                if (stageProgress[lv - 1]) cleared++;
            });
            ctx.fillStyle = '#2a5a8a';
            roundRect(ctx, tagX, tagY, 75, 26, 13);
            ctx.fill();
            ctx.fillStyle = '#7ac';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${cleared}/6 已通关`, tagX + 37, tagY + 17);
        } else {
            ctx.fillStyle = '#333';
            roundRect(ctx, tagX, tagY, 60, 26, 13);
            ctx.fill();
            ctx.fillStyle = '#666';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('未解锁', tagX + 30, tagY + 17);
        }
        
        // 绘制关卡网格（仅展开时）
        if (isExpanded) {
            const cardW = (screenWidth - 70) / 3;
            const cardH = 70;
            const gap = 8;
            const startX = 25;
            const startCardY = currentY + 75;
            
            chapter.levels.forEach((levelNum, li) => {
                const col = li % 3;
                const row = Math.floor(li / 3);
                const cx = startX + col * (cardW + gap);
                const cy = startCardY + row * (cardH + gap);
                
                const stageIdx = levelNum - 1;
                const isUnlocked = stageIdx === 0 || stageProgress[stageIdx - 1];
                const isCompleted = stageProgress[stageIdx];
                
                // 卡片背景
                ctx.fillStyle = 'rgba(30, 58, 95, 0.8)';
                roundRect(ctx, cx, cy, cardW, cardH, 12);
                ctx.fill();
                
                // 边框
                ctx.strokeStyle = isCompleted ? '#ffd700' : (isUnlocked ? '#4fc3f7' : '#3a5a7a');
                ctx.lineWidth = isCompleted ? 2 : 1;
                roundRect(ctx, cx, cy, cardW, cardH, 12);
                ctx.stroke();
                
                // 关卡数字
                ctx.fillStyle = isUnlocked ? '#fff' : '#555';
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`${levelNum}`, cx + cardW / 2, cy + 25);
                
                // 雪花图标
                ctx.font = '20px Arial';
                ctx.fillText('❄️', cx + cardW / 2, cy + 50);
                
                // 三颗星星
                ctx.fillStyle = isCompleted ? ROYALE.gold : 'rgba(125,175,225,0.3)';
                ctx.font = '10px Arial';
                ctx.fillText('★★★', cx + cardW / 2, cy + 65);
                
                // 体力消耗显示
                const energyCost = getEnergyCost(levelNum);
                const hasEnoughEnergy = playerEnergy >= energyCost;
                ctx.fillStyle = hasEnoughEnergy ? '#ffd700' : '#ff6b6b';
                ctx.font = '9px Arial';
                ctx.fillText('⚡ ' + energyCost + '点', cx + cardW / 2, cy + cardH - 5);
            });
        }
        
        currentY += chapterH + 10;
    });
    
    ctx.restore();
    
    // 绘制滚动指示器
    if (maxScroll > 0) {
        const scrollBarH = contentH * (contentH / totalContentH);
        const scrollBarY = 50 + (contentH - scrollBarH) * (-levelScrollY / maxScroll);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        roundRect(ctx, screenWidth - 6, scrollBarY, 4, scrollBarH, 2);
        ctx.fill();
    }
}

// 绘制天赋分栏子页 Tab
function drawTalentTab(r, active) {
    ctx.fillStyle = active ? '#ffd700' : '#222';
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = active ? '#fff' : '#444';
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.stroke();
    ctx.fillStyle = active ? '#1a1a1a' : '#aaa';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2);
    ctx.textBaseline = 'alphabetic';
}

// ---- 天赋拓扑布局（DAG）：按 prerequisite 链分层 + barycenter 排序，避免连线穿过图标 ----
// 对每个子页布局一次，结果缓存于 talentPageLayout[pageId]，命中检测使用同一缓存
const talentPageLayout = { root: null, element: null, supreme: null, defense: null };

function layoutTalentPage(pageId, contentTop, contentH, nodeSizeParam, xGap, colGap) {
    const paddingX = 14;
    const items = talentLayout[pageId] || [];
    const ids = items.filter(i => !i.h).map(i => i.id);
    if (!ids.length) {
        return { positions: {}, edges: [], layers: [], totalContentW: 60, nodeSize: nodeSizeParam || 54, nMax: 0 };
    }
    const idSet = new Set(ids);

    // 1. 拓扑分层：前置不在本页 → L0；前置在本页 → 1+max(parent.layer)
    const layer = {};
    for (const id of ids) layer[id] = 0;
    for (let iter = 0; iter < 50; iter++) {
        let changed = false;
        for (const id of ids) {
            const t = talentData[id];
            const pre = t.prerequisite;
            if (pre && idSet.has(pre.id)) {
                const pl = layer[pre.id];
                if (pl >= 0) {
                    const nl = pl + 1;
                    if (nl > layer[id]) { layer[id] = nl; changed = true; }
                }
            }
        }
        if (!changed) break;
    }
    // 层 0 含无前置或前置不在本页的节点；其余层号 ≥1
    const maxLayer = Math.max(...Object.values(layer));
    const layers = Array.from({ length: maxLayer + 1 }, () => []);
    for (const id of ids) layers[layer[id]].push(id);

    // 2. Barycenter 排序：双向 sweep × 24，极小化边交叉
    const idxIn = (row, id) => row.indexOf(id);
    for (let sweep = 0; sweep < 24; sweep++) {
        for (let l = 1; l < layers.length; l++) {
            const refPos = {};
            layers[l - 1].forEach((id, i) => refPos[id] = i);
            const bc = {};
            for (let i = 0; i < layers[l].length; i++) {
                const id = layers[l][i];
                const pre = talentData[id].prerequisite;
                if (pre && idSet.has(pre.id) && refPos[pre.id] !== undefined) {
                    bc[id] = refPos[pre.id];
                } else {
                    bc[id] = i;
                }
            }
            layers[l].sort((a, b) => bc[a] - bc[b]);
        }
        for (let l = layers.length - 2; l >= 0; l--) {
            const refPos = {};
            layers[l + 1].forEach((id, i) => refPos[id] = i);
            const bc = {};
            const childPos = {};
            for (const cid of layers[l + 1]) {
                const cpre = talentData[cid].prerequisite;
                if (cpre && idSet.has(cpre.id)) {
                    if (!childPos[cpre.id]) childPos[cpre.id] = [];
                    childPos[cpre.id].push(refPos[cid]);
                }
            }
            for (let i = 0; i < layers[l].length; i++) {
                const id = layers[l][i];
                if (childPos[id] && childPos[id].length) {
                    bc[id] = childPos[id].reduce((a, b) => a + b, 0) / childPos[id].length;
                } else {
                    bc[id] = i;
                }
            }
            layers[l].sort((a, b) => bc[a] - bc[b]);
        }
    }

    // 5. 自适应 nodeSize：同层节点最多的那层 = nMax（竖排进一列）；
    //    约束：该列 nMax 个图标在可用高度 contentH 内不重叠
    //    => adaptSize ≤ (contentH - 20 - gap·nMax) / nMax
    let nMax = 0;
    for (const row of layers) if (row.length > nMax) nMax = row.length;
    const minSize = 24, maxSize = nodeSizeParam || 54, vGap = 6;
    let adaptSize = Math.min(maxSize, Math.floor((contentH - 20 - vGap * nMax) / nMax));
    if (adaptSize < minSize) adaptSize = minSize;

    // 6. 横版坐标：层 = 列（x 递增），同层节点在列内竖排（y）
    const positions = {};
    const xStart = paddingX + adaptSize / 2 + 10;       // 第 0 列中心 x
    const colStep = adaptSize + colGap;                 // 列间距
    for (let l = 0; l < layers.length; l++) {
        const cx = xStart + l * colStep;
        const row = layers[l];
        const n = row.length;
        if (n === 1) {
            positions[row[0]] = { x: cx, y: contentTop + contentH / 2 };
        } else {
            const topMargin = 10 + adaptSize / 2;
            const usable = contentH - 20 - adaptSize;     // 列内可分配竖直空间
            const step = usable / (n - 1);
            for (let i = 0; i < n; i++) {
                positions[row[i]] = { x: cx, y: contentTop + topMargin + step * i };
            }
        }
    }

    // 7. edges（父在本页 → 子在本页 的直接前置关系；父列在左、子列在右）
    const edges = [];
    for (const id of ids) {
        const pre = talentData[id].prerequisite;
        if (pre && idSet.has(pre.id) && positions[pre.id] && positions[id]) {
            edges.push({ from: pre.id, to: id });
        }
    }

    const totalContentW = xStart + (layers.length - 1) * colStep + adaptSize / 2 + 10;
    return { positions, edges, layers, totalContentW, nodeSize: adaptSize, nMax };
}

// ---- 天赋边绘制：父底部 → 子顶部，L 形折线，不穿过其他图标 ----
function drawTalentEdge(x1, y1, x2, y2, unlocked) {
    ctx.strokeStyle = unlocked ? 'rgba(79,195,247,0.7)' : 'rgba(120,120,120,0.35)';
    ctx.lineWidth = 2;
    const midX = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // 子端点小圆点
    ctx.fillStyle = unlocked ? '#4fc3f7' : '#888';
    ctx.beginPath();
    ctx.arc(x2, y2, 3, 0, Math.PI * 2);
    ctx.fill();
}

// 天赋Tab（数据驱动：根脉 / 五行 / 统御 / 防御 四子页 + 滚动 + 前置连线）
// 天赋Tab：DAG 拓扑布局 + 前置连线 + 滚动
function drawMainMenuTalent() {
    // 清空节点位置（每帧重建，供点击命中检测）
    talentNodes = [];

    const topOffset = SAFE_TOP_OFFSET;

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('天赋', screenWidth / 2, topOffset + 15);

    // Tab 栏
    const tabRects = getTalentTabRects();
    tabRects.forEach(r => drawTalentTab(r, r.id === talentPage));

    // 内容区域（横版：水平滚动，竖直方向占满）
    const contentTop = tabRects[0].y + tabRects[0].h + 10;
    const contentBottom = screenHeight - MAIN_MENU_NAV_H;
    const contentH = contentBottom - contentTop;
    const contentW = screenWidth;

    const nodeSizeMax = 54, colGap = 26;

    // 计算/复用本次页布局
    const cached = talentPageLayout[talentPage];
    let layout;
    if (cached && cached.nodeSizeMax === nodeSizeMax && cached.colGap === colGap && cached.contentTop === contentTop && cached.contentH === contentH) {
        layout = cached.layout;
    } else {
        layout = layoutTalentPage(talentPage, contentTop, contentH, nodeSizeMax, 0, colGap);
        talentPageLayout[talentPage] = { nodeSizeMax, colGap, contentTop, contentH, layout };
    }
    const { positions, edges, totalContentW, nodeSize } = layout;

    // 水平滚动约束
    const maxScroll = Math.max(0, totalContentW - contentW);
    if (talentScrollX < -maxScroll) talentScrollX = -maxScroll;
    if (talentScrollX > 0) talentScrollX = 0;

    // 裁剪到内容区域
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, contentTop, contentW, contentH);
    ctx.clip();

    // ---- Pass 1：绘制前置连线（节点之下）；父列在左→子列在右，水平 L 形折线 ----
    for (const e of edges) {
        const a = positions[e.from], b = positions[e.to];
        if (!a || !b) continue;
        const childCh = talentData[e.to].chapter;
        const unlocked = highestUnlockedChapter >= childCh && isTalentUnlocked(e.to);
        const ax = a.x + talentScrollX + nodeSize / 2;   // 父节点右侧
        const ay = a.y;
        const bx = b.x + talentScrollX - nodeSize / 2;   // 子节点左侧
        const by = b.y;
        drawTalentEdge(ax, ay, bx, by, unlocked);
    }

    // ---- Pass 2：绘制节点 ----
    for (const id in positions) {
        const p = positions[id];
        const t = talentData[id];
        const dx = p.x + talentScrollX;
        const dy = p.y;
        talentNodes.push({ x: dx, y: dy, size: nodeSize, talentId: id });
        drawTalentNode(dx, dy, nodeSize, t, id, highestUnlockedChapter >= t.chapter);
    }

    ctx.restore();

    // 底部水平滚动条
    if (maxScroll > 0) {
        const barH = 4;
        const barW = Math.max(30, contentW * (contentW / totalContentW));
        const barX = (contentW - barW) * (-talentScrollX / maxScroll);
        const barY = contentBottom - 6;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        roundRect(ctx, barX, barY, barW, barH, 2);
        ctx.fill();
    }
}

// 绘制天赋节点
function drawTalentNode(x, y, size, talent, talentId, unlocked) {
    const halfSize = size / 2;
    
    // 检查前置条件解锁状态
    const preUnlocked = isTalentUnlocked(talentId);
    const isActive = unlocked && preUnlocked; // 需要章节解锁 + 前置天赋解锁
    
    // 背景
    const bgGrad = ctx.createRadialGradient(x, y - halfSize * 0.3, 0, x, y, halfSize);
    bgGrad.addColorStop(0, isActive ? '#1e3a5f' : '#1a1a1a');
    bgGrad.addColorStop(1, isActive ? '#0f3460' : '#111');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, x - halfSize, y - halfSize, size, size, 10);
    ctx.fill();
    
    // 边框
    const isMaxed = talent.level >= talent.max;
    ctx.strokeStyle = isMaxed ? '#ffd700' : (isActive ? '#4fc3f7' : '#444');
    ctx.lineWidth = 2;
    roundRect(ctx, x - halfSize, y - halfSize, size, size, 10);
    ctx.stroke();
    
    // 图标
    ctx.fillStyle = isActive ? '#fff' : '#555';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(talent.icon, x, y - 10);

    // 名称
    ctx.font = '9px Arial';
    ctx.fillStyle = isActive ? '#fff' : '#555';
    ctx.textAlign = 'center';
    ctx.fillText(talent.name, x, y + 8);

    // 等级
    ctx.font = '8px Arial';
    ctx.fillStyle = isMaxed ? '#ffd700' : (isActive ? '#4fc3f7' : '#444');
    ctx.textAlign = 'center';
    if (!unlocked) {
        ctx.fillText('章节' + talent.chapter, x, y + 20);
    } else if (!preUnlocked) {
        ctx.fillText('前置未满', x, y + 20);
    } else {
        ctx.fillText(talent.level >= talent.max ? 'MAX' : 'Lv.' + talent.level, x, y + 20);
    }

    ctx.textBaseline = 'alphabetic';
}

// 绘制天赋升级弹窗
function drawTalentModal() {
    const talent = talentData[talentModal.talentId];
    const isUnlocked = highestUnlockedChapter >= talent.chapter;
    const preUnlocked = isTalentUnlocked(talentModal.talentId);
    const isMaxed = talent.level >= talent.max;
    const canUpgrade = isUnlocked && preUnlocked && !isMaxed;
    
    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗
    const modalW = 280;
    const modalH = 260;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;
    
    // 弹窗（皇室战争风）
    drawRoyalePanel(modalX, modalY, modalW, modalH, 15);
    ctx.strokeStyle = ROYALE.blue;
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 15);
    ctx.stroke();
    
    // 图标
    ctx.font = '50px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(talent.icon, screenWidth / 2, modalY + 50);
    
    // 名称
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText(talent.name, screenWidth / 2, modalY + 95);
    
    // 当前等级
    ctx.font = '14px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText(isMaxed ? '已达最高等级' : '当前等级: Lv.' + talent.level, screenWidth / 2, modalY + 115);
    
    // 玩家当前金币
    ctx.font = '14px Arial';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('已有 🪙 ' + player.gold, screenWidth / 2, modalY + 130);
    
    // 升级效果
    ctx.font = '13px Arial';
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText('效果: ' + talent.effect, screenWidth / 2, modalY + 155);
    
    // 前置条件提示
    ctx.font = '11px Arial';
    ctx.fillStyle = '#ff6b6b';
    if (!preUnlocked && talent.prerequisite) {
        const preTalent = talentData[talent.prerequisite.id];
        ctx.fillText('前置: ' + preTalent.name + ' Lv.' + talent.prerequisite.level, screenWidth / 2, modalY + 175);
    }
    
    // 按钮
    const btnW = 100;
    const btnH = 40;
    const btnY = modalY + 200;
    const upgradeBtnX = screenWidth / 2 + 10;
    
    // 取消按钮
    drawRoyaleBevelButton({ x: screenWidth / 2 - btnW - 10, y: btnY, w: btnW, h: btnH, r: 10 }, '关闭', 'blue');
    
    // 升级按钮
    if (canUpgrade) {
        // 检查金币是否足够（二次幂消耗）
        const cost = getTalentCost(talent);
        const hasEnoughGold = player.gold >= cost;
        
        if (hasEnoughGold) {
            drawRoyaleBevelButton({ x: upgradeBtnX, y: btnY, w: btnW, h: btnH, r: 10 }, '升级', 'gold');
            ctx.fillStyle = '#5a3a00';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('🪙 ' + cost, screenWidth / 2 + btnW / 2 + 10, btnY + btnH - 8);
        } else {
            // 金币不足
            drawRoyaleBevelButton({ x: upgradeBtnX, y: btnY, w: btnW, h: btnH, r: 10 }, '升级', 'red');
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('🪙 ' + cost, screenWidth / 2 + btnW / 2 + 10, btnY + btnH - 8);
        }
    } else if (!isUnlocked) {
        ctx.fillStyle = '#444';
        roundRect(ctx, upgradeBtnX, btnY, btnW, btnH, 10);
        ctx.fill();
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.fillText('需第' + talent.chapter + '章', screenWidth / 2 + btnW / 2 + 10, btnY + 25);
    } else if (!preUnlocked) {
        ctx.fillStyle = '#444';
        roundRect(ctx, upgradeBtnX, btnY, btnW, btnH, 10);
        ctx.fill();
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.fillText('前置未满', screenWidth / 2 + btnW / 2 + 10, btnY + 25);
    } else {
        ctx.fillStyle = '#ffd700';
        roundRect(ctx, upgradeBtnX, btnY, btnW, btnH, 10);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.fillText('已满级', screenWidth / 2 + btnW / 2 + 10, btnY + 25);
    }
    
    ctx.textBaseline = 'alphabetic';
}

// 天赋弹窗按钮位置（用于点击检测）
let talentUpgradeBtn = { x: 0, y: 0, w: 0, h: 0 };
let talentCloseBtn = { x: 0, y: 0, w: 0, h: 0 };

// 处理天赋弹窗点击
function handleTalentModalClick(x, y) {
    if (!talentModal.show) return;
    
    const talent = talentData[talentModal.talentId];
    const isUnlocked = highestUnlockedChapter >= talent.chapter;
    const preUnlocked = isTalentUnlocked(talentModal.talentId);
    const isMaxed = talent.level >= talent.max;
    const canUpgrade = isUnlocked && preUnlocked && !isMaxed;
    
    const modalW = 280;
    const modalH = 260;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;
    const btnW = 100;
    const btnH = 40;
    const btnY = modalY + 200;
    
    // 关闭按钮
    talentCloseBtn = { x: screenWidth / 2 - btnW - 10, y: btnY, w: btnW, h: btnH };
    if (x >= talentCloseBtn.x && x <= talentCloseBtn.x + talentCloseBtn.w &&
        y >= talentCloseBtn.y && y <= talentCloseBtn.y + talentCloseBtn.h) {
        closeTalentModal();
        return;
    }
    
    // 升级按钮
    talentUpgradeBtn = { x: screenWidth / 2 + 10, y: btnY, w: btnW, h: btnH };
    if (canUpgrade && x >= talentUpgradeBtn.x && x <= talentUpgradeBtn.x + talentUpgradeBtn.w &&
        y >= talentUpgradeBtn.y && y <= talentUpgradeBtn.y + talentUpgradeBtn.h) {
        // 检查金币是否足够（二次幂消耗）
        if (player.gold < getTalentCost(talent)) {
            // 金币不足，提示
            wx.showToast({ title: '金币不足！', icon: 'none' });
            return;
        }
        if (upgradeTalent(talentModal.talentId)) {
            // 升级成功，保持弹窗打开
            wx.showToast({ title: '升级成功！', icon: 'success' });
        }
        return;
    }
}

// ========== 排行Tab ==========
function drawMainMenuRank() {
    const topOffset = SAFE_TOP_OFFSET;
    const navH = MAIN_MENU_NAV_H;

    // ===== 构建动态排名数据 =====
    let currentData;
    let playerOutOfList = false; // 玩家是否在可见列表之外（供底部固定显示）
    
    if (rankTab === 'global') {
        // 全服排行：根据真实战力动态插入玩家
        const playerPower = calculatePower();
        currentData = rankCityData.map(item => ({...item})); // 深拷贝
        
        // 找到插入位置（按战力降序排列）
        let insertIdx = currentData.length;
        for (let i = 0; i < currentData.length; i++) {
            if (playerPower > currentData[i].power) {
                insertIdx = i;
                break;
            }
        }
        
        // 插入玩家
        currentData.splice(insertIdx, 0, {
            rank: insertIdx + 1,
            name: heroData.name,
            location: '未知位置',
            level: heroData.level,
            power: playerPower
        });
        
        // 重排后续排名编号
        for (let i = insertIdx + 1; i < currentData.length; i++) {
            currentData[i].rank = i + 1;
        }
        
        // 玩家是否在可见列表内（前24名）
        playerOutOfList = (insertIdx >= rankCityData.length);
    } else {
        // 好友排行：如果玩家不在列表中则追加
        currentData = rankFriendData.map(item => ({...item}));
        const playerExists = currentData.some(item => item.name === heroData.name);
        if (!playerExists) {
            const playerPower = calculatePower();
            currentData.push({
                rank: currentData.length + 1,
                name: heroData.name,
                location: '未知位置',
                level: heroData.level,
                power: playerPower,
                avatar: '🎮'
            });
        }
        // 好友列表玩家自己总是在列表中
    }

    // 绘制标题栏背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, screenWidth, topOffset + 30);

    // 绘制标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('排行榜', screenWidth / 2, topOffset + 20);

    // Tab参数
    const tabY = topOffset + 40;
    const tabH = 40;
    const tabGap = 10;
    const tabW = (screenWidth - 30) / 2;
    const padding = 15;

    // 绘制Tab背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    roundRect(ctx, padding, tabY, screenWidth - padding * 2, tabH, 10);
    ctx.fill();

    // 绘制Tab项
    const tabs = [
        { id: 'global', label: '全服排行' },
        { id: 'friend', label: '好友排行' }
    ];

    tabs.forEach((tab, i) => {
        const tx = padding + 5 + i * (tabW + tabGap);
        const isActive = rankTab === tab.id;

        // Tab背景
        if (isActive) {
            ctx.fillStyle = 'rgba(79, 195, 247, 0.15)';
            ctx.beginPath();
            roundRect(ctx, tx, tabY + 3, tabW, tabH - 6, 8);
            ctx.fill();

            // Tab选中边框
            ctx.strokeStyle = '#4fc3f7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            roundRect(ctx, tx, tabY + 3, tabW, tabH - 6, 8);
            ctx.stroke();
        }

        // Tab文字
        ctx.fillStyle = isActive ? '#4fc3f7' : '#666';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(tab.label, tx + tabW / 2, tabY + tabH / 2 + 5);
    });

    // 列表区域
    const listY = tabY + tabH + 10;
    const listH = screenHeight - listY - navH - 10;

    // 列表背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.beginPath();
    roundRect(ctx, padding, listY, screenWidth - padding * 2, listH, 12);
    ctx.fill();

    // 设置裁剪区域，防止列表内容超出
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, padding, listY, screenWidth - padding * 2, listH, 12);
    ctx.clip();

    // 列表内容（带滚动）
    const itemH = 50;
    const avatarSize = 36;
    const startX = padding + 12;
    const contentWidth = screenWidth - padding * 2 - 24;

    // 计算可见范围
    const startIdx = Math.floor(rankScrollY / itemH);
    const endIdx = Math.min(currentData.length, startIdx + Math.ceil(listH / itemH) + 1);

    for (let i = startIdx; i < endIdx; i++) {
        const item = currentData[i];
        const itemY = listY + 8 + (i * itemH) - rankScrollY;

        // 检查是否是自己
        const isMe = item.name === heroData.name;

        // 列表项背景
        if (isMe) {
            // 高亮自己
            ctx.fillStyle = 'rgba(79, 195, 247, 0.15)';
            ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            roundRect(ctx, padding + 6, itemY, screenWidth - padding * 2 - 12, itemH - 6, 8);
            ctx.fill();
            ctx.stroke();
        }

        // 排名
        const rankX = startX;
        ctx.textAlign = 'center';
        if (item.rank <= 3) {
            // 前三名显示奖牌emoji
            const medals = ['🏆', '🥈', '🥉'];
            ctx.fillStyle = '#fff';
            ctx.font = '18px Arial';
            ctx.fillText(medals[item.rank - 1], rankX + 18, itemY + itemH / 2 + 6);
        } else {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(item.rank, rankX + 18, itemY + itemH / 2 + 5);
        }

        // 头像
        const avatarX = rankX + 45;
        const avatarY = itemY + (itemH - avatarSize) / 2 - 3;
        
        // 自己的头像用微信头像，其他人的用 emoji
        if (isMe && wechatAvatarImage) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(wechatAvatarImage, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(79, 195, 247, 0.3)';
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.fill();
            // 头像内的图标
            const avatarIcon = item.avatar || '🎮';
            ctx.font = '16px Arial';
            ctx.fillStyle = '#4fc3f7';
            ctx.textAlign = 'center';
            ctx.fillText(avatarIcon, avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 5);
        }

        // 玩家信息
        const infoX = avatarX + avatarSize + 10;
        ctx.textAlign = 'left';

        // 玩家名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Arial';
        ctx.fillText(item.name, infoX, itemY + itemH / 2 - 3);

        // 地区
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText(item.location, infoX, itemY + itemH / 2 + 12);

        // 等级和战力
        const rightX = screenWidth - padding - 12;
        ctx.textAlign = 'right';

        // 战力（如果是我自己，使用实时计算值）
        const displayPower = isMe ? calculatePower() : item.power;
        ctx.fillStyle = '#4fc3f7';
        ctx.font = 'bold 13px Arial';
        const powerStr = displayPower >= 10000 ? (displayPower / 10000).toFixed(1) + '万' : displayPower.toString();
        ctx.fillText(powerStr, rightX, itemY + itemH / 2 - 3);

        // 等级
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText('Lv.' + item.level, rightX, itemY + itemH / 2 + 12);
    }

    // 恢复上下文，结束裁剪
    ctx.restore();

    // ===== 玩家在列表外时，底部固定显示自己的信息 =====
    if (rankTab === 'global' && playerOutOfList) {
        const playerPower = calculatePower();
        const fixedY = listY + listH - itemH + 8; // 紧贴列表底部
        
        // 高亮背景（不透明）
        ctx.fillStyle = '#1e2d4d';
        ctx.strokeStyle = 'rgba(79, 195, 247, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        roundRect(ctx, padding + 6, fixedY, screenWidth - padding * 2 - 12, itemH - 6, 8);
        ctx.fill();
        ctx.stroke();
        
        // 排名（显示 N+名）
        const meRank = currentData.length; // 最后一名
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(meRank, startX + 18, fixedY + itemH / 2 + 5);
        
        // 头像（自己的微信头像）
        const avatarX = startX + 45;
        const avatarY = fixedY + (itemH - avatarSize) / 2 - 3;
        if (wechatAvatarImage) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(wechatAvatarImage, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(79, 195, 247, 0.3)';
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '16px Arial';
            ctx.fillStyle = '#4fc3f7';
            ctx.textAlign = 'center';
            ctx.fillText('🎮', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 5);
        }
        
        // 名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(heroData.name, avatarX + avatarSize + 10, fixedY + itemH / 2 - 3);
        
        // 地区
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText('未知位置', avatarX + avatarSize + 10, fixedY + itemH / 2 + 12);
        
        // 战力
        const rightX = screenWidth - padding - 12;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#4fc3f7';
        ctx.font = 'bold 13px Arial';
        const powerStr = playerPower >= 10000 ? (playerPower / 10000).toFixed(1) + '万' : playerPower.toString();
        ctx.fillText(powerStr, rightX, fixedY + itemH / 2 - 3);
        
        // 等级
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText('Lv.' + heroData.level, rightX, fixedY + itemH / 2 + 12);
    }

    // 底部提示
    const tipY = screenHeight - navH - 5;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#555';
    ctx.font = '10px Arial';
    if (rankTab === 'global') {
        ctx.fillText('全服前100名排行榜', screenWidth / 2, tipY);
    } else {
        ctx.fillText('微信好友排行榜', screenWidth / 2, tipY);
    }
}

// ========== 世界Tab ==========
// 省份数据（按UE SVG布局顺序）
const PROVINCES = [
    // 第1行: 5块 y:0-48
    { name: '黑龙江', x: 0, y: 0, w: 68, h: 48 },
    { name: '吉林', x: 68, y: 0, w: 62, h: 48 },
    { name: '辽宁', x: 130, y: 0, w: 70, h: 48 },
    { name: '内蒙古', x: 200, y: 0, w: 80, h: 48 },
    { name: '河北', x: 280, y: 0, w: 60, h: 48 },
    // 第2行: 6块 y:48-96
    { name: '北京', x: 0, y: 48, w: 55, h: 48 },
    { name: '天津', x: 55, y: 48, w: 45, h: 48 },
    { name: '山东', x: 100, y: 48, w: 70, h: 48 },
    { name: '山西', x: 170, y: 48, w: 60, h: 48 },
    { name: '陕西', x: 230, y: 48, w: 60, h: 48 },
    { name: '宁夏', x: 290, y: 48, w: 50, h: 48 },
    // 第3行: 5块 y:96-144
    { name: '江苏', x: 0, y: 96, w: 70, h: 48 },
    { name: '安徽', x: 70, y: 96, w: 65, h: 48 },
    { name: '河南', x: 135, y: 96, w: 75, h: 48 },
    { name: '甘肃', x: 210, y: 96, w: 70, h: 48 },
    { name: '青海', x: 280, y: 96, w: 60, h: 48 },
    // 第4行: 5块 y:144-192
    { name: '上海', x: 0, y: 144, w: 55, h: 48 },
    { name: '浙江', x: 55, y: 144, w: 60, h: 48 },
    { name: '江西', x: 115, y: 144, w: 65, h: 48 },
    { name: '湖北', x: 180, y: 144, w: 70, h: 48 },
    { name: '四川', x: 250, y: 144, w: 90, h: 48 },
    // 第5行: 5块 y:192-240
    { name: '福建', x: 0, y: 192, w: 75, h: 48 },
    { name: '湖南', x: 75, y: 192, w: 75, h: 48 },
    { name: '重庆', x: 150, y: 192, w: 65, h: 48 },
    { name: '贵州', x: 215, y: 192, w: 70, h: 48 },
    { name: '云南', x: 285, y: 192, w: 55, h: 48 },
    // 第6行: 5块 y:240-288
    { name: '广东', x: 0, y: 240, w: 110, h: 48 },
    { name: '广西', x: 110, y: 240, w: 90, h: 48 },
    { name: '海南', x: 200, y: 240, w: 60, h: 48 },
    { name: '新疆', x: 260, y: 240, w: 50, h: 48 },
    { name: '西藏', x: 310, y: 240, w: 30, h: 48 },
    // 第7行: 4块 y:288-340
    { name: '香港', x: 0, y: 288, w: 60, h: 52 },
    { name: '澳门', x: 60, y: 288, w: 40, h: 52 },
    { name: '台湾', x: 100, y: 288, w: 75, h: 52 },
    { name: '其他', x: 175, y: 288, w: 165, h: 52 },
];

let selectedProvince = null; // 当前选中的省份

function drawMainMenuWorld() {
    const topOffset = SAFE_TOP_OFFSET;
    const navH = MAIN_MENU_NAV_H;
    const padding = 15;

    // 绘制标题栏背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, screenWidth, topOffset + 30);

    // 绘制标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('世界', screenWidth / 2, topOffset + 20);

    // 地图区域（按UE: 340x340 viewBox映射到屏幕宽度）
    const mapY = topOffset + 40;
    const mapW = screenWidth - padding * 2;
    const mapH = mapW; // 保持正方形
    const mapX = padding;

    // 缩放比例（基于UE的340宽度）
    const scale = mapW / 340;

    // 地图发光背景
    ctx.fillStyle = 'rgba(79, 195, 247, 0.08)';
    ctx.beginPath();
    roundRect(ctx, mapX, mapY, mapW, mapH, 12);
    ctx.fill();

    // 绘制省份（使用裁剪确保不超出边界）
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, mapX, mapY, mapW, mapH, 12);
    ctx.clip();

    // 渐变色定义（与UE一致）
    const isGrad1 = (idx) => idx % 2 === 0;

    for (let i = 0; i < PROVINCES.length; i++) {
        const p = PROVINCES[i];
        const px = mapX + p.x * scale;
        const py = mapY + p.y * scale;
        const pw = p.w * scale;
        const ph = p.h * scale;

        const isSelected = selectedProvince === p.name;

        // 省份背景（使用渐变色）
        if (isSelected) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.4)';
        } else if (p.name === '山东') {
            ctx.fillStyle = '#7a4fa0'; // 技能实验室入口：紫色高亮区分
        } else if (isGrad1(i)) {
            ctx.fillStyle = '#2a5a8a';
        } else {
            ctx.fillStyle = '#3a7aca';
        }
        ctx.beginPath();
        roundRect(ctx, px, py, pw, ph, 4);
        ctx.fill();

        // 省份边框
        if (isSelected) {
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.beginPath();
            roundRect(ctx, px, py, pw, ph, 4);
            ctx.stroke();
        }

        // 省份名称
        ctx.fillStyle = isSelected ? '#ffd700' : 'rgba(255, 255, 255, 0.9)';
        ctx.font = `bold ${Math.max(7, 9 * scale)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(p.name, px + pw / 2, py + ph / 2 + 3);

        // 山东：技能实验室入口提示
        if (p.name === '山东') {
            ctx.fillStyle = '#ffd700';
            ctx.font = `bold ${Math.max(6, 8 * scale)}px Arial`;
            ctx.fillText('🧪 实验室', px + pw / 2, py + ph - 8);
        }
    }

    ctx.restore();

    // 统计卡片区域（在地图下方）
    const statsY = mapY + mapH + 10;
    const statsH = 60;
    const statsGap = 8;
    const statsCardW = (mapW - statsGap * 2) / 3;

    // 统计卡片数据
    const stats = [
        { value: '34', label: '省市区' },
        { value: '12.8k', label: '全国玩家' },
        { value: '567', label: '广东人数' },
    ];

    for (let i = 0; i < stats.length; i++) {
        const cardX = mapX + i * (statsCardW + statsGap);

        // 卡片背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        roundRect(ctx, cardX, statsY, statsCardW, statsH, 10);
        ctx.fill();

        // 数值
        ctx.fillStyle = '#4fc3f7';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(stats[i].value, cardX + statsCardW / 2, statsY + 28);

        // 标签
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText(stats[i].label, cardX + statsCardW / 2, statsY + 48);
    }

    // 底部提示按钮
    const btnY = screenHeight - navH - 35;
    const btnW = 180;
    const btnH = 28;
    const btnX = (screenWidth - btnW) / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    roundRect(ctx, btnX, btnY, btnW, btnH, 14);
    ctx.fill();

    ctx.fillStyle = '#666';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('点击省份查看区域数据', screenWidth / 2, btnY + 18);
}

// ========== 游戏圈Tab ==========
function drawMainMenuClub() {
    const topOffset = SAFE_TOP_OFFSET;
    const navH = MAIN_MENU_NAV_H;

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('游戏圈', screenWidth / 2, topOffset + 20);

    // 说明区域
    const panelY = topOffset + 60;
    const panelH = 140;
    const panelX = 15;
    const panelW = screenWidth - 30;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 15);
    ctx.fill();

    // 大图标
    ctx.font = '60px Arial';
    ctx.fillStyle = '#4fc3f7';
    ctx.textAlign = 'center';
    ctx.fillText('👥', screenWidth / 2, panelY + 75);

    // 文字
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText('加入游戏圈', screenWidth / 2, panelY + 115);

    ctx.font = '13px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText('与玩家交流心得、反馈建议、获取最新活动', screenWidth / 2, panelY + 138);

    // 显示原生游戏圈按钮
    showGameClubButton();
}

// 游戏圈原生按钮管理
function showGameClubButton() {
    if (gameClubButtonVisible) return;   // 已显示则跳过，避免每帧 show 触发原生视图重建(parent not found)
    if (!wx.createGameClubButton) {
        console.log('当前环境不支持游戏圈');
        return;
    }

    if (!gameClubButton) {
        const btnW = screenWidth - 60;
        const btnH = 48;
        const btnX = 30;
        const btnY = SAFE_TOP_OFFSET + 230;

        gameClubButton = wx.createGameClubButton({
            type: 'text',
            text: '   进入游戏圈互动',
            icon: 'green',
            style: {
                left: btnX,
                top: btnY - 10,
                width: btnW,
                height: btnH,
                borderRadius: 10,
                backgroundColor: '#4fc3f7',
                color: '#ffffff',
                fontSize: 16,
                lineHeight: btnH,
                textAlign: 'center'
            }
        });
    }
    // 微信引擎在部分基础库版本下 show 偶发 parent not found，吞掉避免刷屏卡顿
    try { gameClubButton.show(); } catch (e) { /* ignore native view rebuild error */ }
    gameClubButtonVisible = true;
}

function hideGameClubButton() {
    if (!gameClubButton || !gameClubButtonVisible) return;
    try { gameClubButton.hide(); } catch (e) { /* ignore */ }
    gameClubButtonVisible = false;
}

function destroyGameClubButton() {
    if (gameClubButton) {
        try { gameClubButton.destroy(); } catch (e) { /* ignore */ }
        gameClubButton = null;
    }
    gameClubButtonVisible = false;
}

// ========== 商城Tab ==========
function drawMainMenuShop() {
    const topOffset = SAFE_TOP_OFFSET;
    const navH = MAIN_MENU_NAV_H;
    const padding = 15;

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('商城', screenWidth / 2, topOffset + 20);

    // 玩家货币显示
    const currencyY = topOffset + 45;
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`💰 ${player.gold}`, screenWidth / 2 - 50, currencyY);
    ctx.fillText(`💎 ${player.diamond || 0}`, screenWidth / 2 + 50, currencyY);

    // ========== 分类标签 ==========
    const tabY = topOffset + 65;
    const tabH = 35;
    const tabGap = 8;
    const tabW = (screenWidth - padding * 2 - tabGap * (SHOP_CATEGORIES.length - 1)) / SHOP_CATEGORIES.length;

    SHOP_CATEGORIES.forEach((cat, i) => {
        const tx = padding + i * (tabW + tabGap);
        const isActive = currentShopCategory === cat.id;

        // 标签背景
        ctx.fillStyle = isActive ? '#4fc3f7' : 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        roundRect(ctx, tx, tabY, tabW, tabH, 8);
        ctx.fill();

        // 标签文字
        ctx.fillStyle = isActive ? '#fff' : '#888';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(cat.icon + ' ' + cat.name, tx + tabW / 2, tabY + 22);
    });

    // ========== 商品列表 ==========
    const listY = tabY + tabH + 15;
    const listH = screenHeight - listY - navH - 10;  // 修复：正确的列表高度
    const cols = 2;
    const cardGap = 10;
    const cardW = (screenWidth - padding * 2 - cardGap) / cols;
    const cardH = 120;
    const cardPadding = 15;

    const items = SHOP_ITEMS[currentShopCategory];
    const cardRows = Math.ceil(items.length / cols);

    // 裁剪区域
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, padding - 5, listY, screenWidth - padding * 2 + 10, listH - 20, 12);
    ctx.clip();

    // 计算总高度用于滚动
    const totalH = cardRows * (cardH + cardGap);

    for (let i = 0; i < items.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cx = padding + col * (cardW + cardGap);
        const cy = listY + row * (cardH + cardGap) + shopScrollY;

        // 跳过不可见卡片
        if (cy + cardH < listY - 10 || cy > listY + listH) continue;

        const item = items[i];

        // 卡片背景
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        roundRect(ctx, cx, cy, cardW, cardH, 12);
        ctx.fill();

        // 卡片边框
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 商品图标（emoji）
        ctx.fillStyle = '#fff';
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.icon, cx + cardW / 2, cy + 40);

        // 商品名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(item.name, cx + cardW / 2, cy + 62);

        // 商品描述
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText(item.desc, cx + cardW / 2, cy + 78);

        // 价格背景
        const priceY = cy + cardH - 35;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        roundRect(ctx, cx + 15, priceY, cardW - 30, 25, 12);
        ctx.fill();

        // 价格文字
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('¥' + item.price + '.00', cx + cardW / 2, priceY + 17);
    }

    ctx.restore();

    // 滚动条
    if (totalH > listH) {
        const scrollBarH = Math.max(30, listH * (listH / totalH));
        const scrollBarY = listY + (shopScrollY / (totalH - listH)) * (listH - scrollBarH);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        roundRect(ctx, screenWidth - padding - 4, scrollBarY, 4, scrollBarH, 2);
        ctx.fill();
    }
}

// 商城Tab点击处理
function handleShopClick(x, y) {
    const navH = MAIN_MENU_NAV_H;
    const padding = 15;
    const topOffset = SAFE_TOP_OFFSET;
    const tabY = topOffset + 65;
    const tabH = 35;
    const tabGap = 8;
    const tabW = (screenWidth - padding * 2 - tabGap * (SHOP_CATEGORIES.length - 1)) / SHOP_CATEGORIES.length;

    // 检查分类标签点击
    if (y >= tabY && y <= tabY + tabH) {
        SHOP_CATEGORIES.forEach((cat, i) => {
            const tx = padding + i * (tabW + tabGap);
            if (x >= tx && x <= tx + tabW) {
                currentShopCategory = cat.id;
                shopScrollY = 0; // 切换分类时重置滚动
            }
        });
        return;
    }

    // 检查商品卡片点击
    const listY = tabY + tabH + 15;
    const cardGap = 10;
    const cardW = (screenWidth - padding * 2 - cardGap) / 2;
    const cardH = 120;
    const items = SHOP_ITEMS[currentShopCategory];

    for (let i = 0; i < items.length; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        const cx = padding + col * (cardW + cardGap);
        const cy = listY + row * (cardH + cardGap) + shopScrollY;

        if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
            // 打开购买确认弹窗
            shopModal.show = true;
            shopModal.type = 'confirm';
            shopModal.item = items[i];
            return;
        }
    }
}

// 绘制商城弹窗
function drawShopModal() {
    const modalW = 280;
    const modalH = shopModal.type === 'confirm' ? 220 : 160;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // 弹窗（皇室战争风）
    drawRoyalePanel(modalX, modalY, modalW, modalH, 16);
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 16);
    ctx.stroke();

    if (shopModal.type === 'confirm') {
        // ========== 购买确认弹窗 ==========
        const item = shopModal.item;

        // 标题
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💰 购买确认', modalX + modalW / 2, modalY + 30);

        // 商品信息框
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.beginPath();
        roundRect(ctx, modalX + 20, modalY + 50, modalW - 40, 60, 10);
        ctx.fill();

        ctx.font = '14px Arial';
        ctx.fillStyle = '#fff';  // emoji需要白色
        ctx.fillText(item.icon + ' ' + item.name + ' x1', modalX + modalW / 2, modalY + 75);
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.fillText(item.desc, modalX + modalW / 2, modalY + 95);

        // 价格
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('¥' + item.price + '.00', modalX + modalW / 2, modalY + 130);

        // 按钮
        const btnW = 100;
        const btnH = 36;
        const btnY = modalY + modalH - 50;
        const cancelBtnX = modalX + modalW / 2 - btnW - 10;
        const confirmBtnX = modalX + modalW / 2 + 10;

        // 取消按钮
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        roundRect(ctx, cancelBtnX, btnY, btnW, btnH, 8);
        ctx.fill();
        ctx.fillStyle = '#888';
        ctx.font = '14px Arial';
        ctx.fillText('取消', cancelBtnX + btnW / 2, btnY + 23);

        // 确认按钮
        ctx.fillStyle = '#4fc3f7';
        ctx.beginPath();
        roundRect(ctx, confirmBtnX, btnY, btnW, btnH, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText('确认', confirmBtnX + btnW / 2, btnY + 23);

    } else {
        // ========== 提示弹窗 ==========
        // 标题
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ 提示', modalX + modalW / 2, modalY + 45);

        // 内容
        ctx.fillStyle = '#fff';
        ctx.font = '13px Arial';
        const lines = shopModal.item.split('\n');
        lines.forEach((line, i) => {
            ctx.fillText(line, modalX + modalW / 2, modalY + 80 + i * 22);
        });

        // 按钮
        const btnW = 120;
        const btnH = 36;
        const btnX = modalX + (modalW - btnW) / 2;
        const btnY = modalY + modalH - 50;

        ctx.fillStyle = '#4fc3f7';
        ctx.beginPath();
        roundRect(ctx, btnX, btnY, btnW, btnH, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.fillText(shopModal.buttonText || '确定', btnX + btnW / 2, btnY + 23);
    }
}

// 商城弹窗点击处理
function handleShopModalClick(x, y) {
    if (!shopModal.show) return;

    const modalW = 280;
    const modalH = shopModal.type === 'confirm' ? 220 : 160;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;

    // 检查是否点击弹窗外
    if (x < modalX || x > modalX + modalW || y < modalY || y > modalY + modalH) {
        shopModal.show = false;
        return;
    }

    if (shopModal.type === 'confirm') {
        // 按钮区域
        const btnW = 100;
        const btnH = 36;
        const btnY = modalY + modalH - 50;
        const cancelBtnX = modalX + modalW / 2 - btnW - 10;
        const confirmBtnX = modalX + modalW / 2 + 10;

        if (y >= btnY && y <= btnY + btnH) {
            if (x >= cancelBtnX && x <= cancelBtnX + btnW) {
                // 取消
                shopModal.show = false;
            } else if (x >= confirmBtnX && x <= confirmBtnX + btnW) {
                // 确认购买
                const item = shopModal.item;
                if (item) {
                    // 检查是否是体力道具
                    if (item.id === 'energy_1') {
                        recoverEnergy(30);
                        wx.showToast({ title: '体力恢复 +30', icon: 'none' });
                        shopModal.show = false;
                    } else if (item.id === 'energy_2') {
                        recoverEnergy(60);
                        wx.showToast({ title: '体力恢复 +60', icon: 'none' });
                        shopModal.show = false;
                    } else if (item.id === 'energy_3') {
                        recoverEnergy(100);
                        wx.showToast({ title: '体力恢复 +100', icon: 'none' });
                        shopModal.show = false;
                    } else {
                        // 其他商品，显示功能未开放
                        shopModal.type = 'alert';
                        shopModal.item = '支付功能正在申请中...\n请耐心等待';
                        shopModal.buttonText = '确定';
                    }
                } else {
                    shopModal.type = 'alert';
                    shopModal.item = '支付功能正在申请中...\n请耐心等待';
                    shopModal.buttonText = '确定';
                }
            }
        }
    } else {
        // 提示弹窗点击确定
        const btnW = 120;
        const btnH = 36;
        const btnX = modalX + (modalW - btnW) / 2;
        const btnY = modalY + modalH - 50;

        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            shopModal.show = false;
            shopModal.type = 'confirm'; // 重置为确认类型
        }
    }
}

// ==================== 体力不足弹窗 ====================

// 绘制体力不足弹窗
function drawEnergyModal() {
    const modalW = 280;
    const modalH = 380;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // 弹窗背景
    ctx.fillStyle = '#1a1a2e';
    roundRect(ctx, modalX, modalY, modalW, modalH, 16);
    ctx.fill();

    // 边框
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 16);
    ctx.stroke();

    // 警告图标
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️', modalX + modalW / 2, modalY + 55);

    // 标题
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('体力不足', modalX + modalW / 2, modalY + 85);

    // 当前体力
    const energyCost = getEnergyCost(energyModal.targetStage);
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.fillText('当前体力: ' + playerEnergy + '/' + ENERGY_CONFIG.maxEnergy, modalX + modalW / 2, modalY + 120);

    // 需要体力
    ctx.fillStyle = '#ffd700';
    ctx.font = '14px Arial';
    ctx.fillText('通关需要: ' + energyCost + '点', modalX + modalW / 2, modalY + 145);

    // 分割线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(modalX + 20, modalY + 160);
    ctx.lineTo(modalX + modalW - 20, modalY + 160);
    ctx.stroke();

    // 按钮样式
    const btnY = modalY + 175;
    const btnH = 40;
    const btnGap = 12;

    // 取消按钮
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, modalX + 20, btnY, (modalW - 50) / 2, btnH, 8);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.fillText('取消', modalX + 20 + (modalW - 50) / 4, btnY + 26);

    // 使用道具按钮
    const hasItem = energyItemCount['energy_1'] > 0 || energyItemCount['energy_2'] > 0 || energyItemCount['energy_3'] > 0;
    ctx.fillStyle = hasItem ? 'rgba(79, 195, 247, 0.8)' : 'rgba(100, 100, 100, 0.5)';
    roundRect(ctx, modalX + 30 + (modalW - 50) / 2, btnY, (modalW - 50) / 2, btnH, 8);
    ctx.fill();
    ctx.fillStyle = hasItem ? '#fff' : '#666';
    ctx.font = '14px Arial';
    ctx.fillText('使用道具', modalX + 30 + (modalW - 50) * 3 / 4, btnY + 26);

    // 观看广告恢复按钮
    const canWatchAd = adEnergyCount < MAX_AD_ENERGY_PER_DAY;
    ctx.fillStyle = canWatchAd ? 'rgba(76, 175, 80, 0.9)' : 'rgba(100, 100, 100, 0.5)';
    roundRect(ctx, modalX + 20, btnY + btnH + btnGap, modalW - 40, btnH, 8);
    ctx.fill();
    ctx.fillStyle = canWatchAd ? '#fff' : '#666';
    ctx.font = 'bold 14px Arial';
    if (canWatchAd) {
        ctx.fillText('📺 观看广告 +' + AD_ENERGY_RECOVER + '体力', modalX + modalW / 2, btnY + btnH + btnGap + 26);
    } else {
        ctx.fillText('📺 今日观看次数已用完', modalX + modalW / 2, btnY + btnH + btnGap + 26);
    }

    // 剩余次数提示
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.fillText('剩余 ' + (MAX_AD_ENERGY_PER_DAY - adEnergyCount) + '/' + MAX_AD_ENERGY_PER_DAY + ' 次', modalX + modalW / 2, btnY + btnH + btnGap + btnH + 8);

    // 立即购买按钮暂时屏蔽（商城暂不开放）
    // ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
    // roundRect(ctx, modalX + 20, btnY + (btnH + btnGap) * 2 + 10, modalW - 40, btnH, 8);
    // ctx.fill();
    // ctx.fillStyle = '#1a1a2e';
    // ctx.font = 'bold 14px Arial';
    // ctx.fillText('💰 立即购买体力', modalX + modalW / 2, btnY + (btnH + btnGap) * 2 + 40);

    // 提示文字
    ctx.fillStyle = '#555';
    ctx.font = '11px Arial';
    ctx.fillText('体力每5分钟恢复1点', modalX + modalW / 2, modalY + modalH - 15);
}

// 处理体力弹窗点击
function handleEnergyModalClick(x, y) {
    if (!energyModal.show) return;
    
    // 如果弹窗刚打开，跳过本次关闭检测，避免误关闭
    if (energyModalJustOpened) return;

    const modalW = 280;
    const modalH = 380;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;

    // 检查是否点击弹窗外（关闭弹窗）
    if (x < modalX || x > modalX + modalW || y < modalY || y > modalY + modalH) {
        energyModal.show = false;
        return;
    }

    const btnY = modalY + 175;
    const btnH = 40;
    const btnGap = 12;

    // 取消按钮
    if (x >= modalX + 20 && x <= modalX + 20 + (modalW - 50) / 2 &&
        y >= btnY && y <= btnY + btnH) {
        energyModal.show = false;
        return;
    }

    // 使用道具按钮
    if (x >= modalX + 30 + (modalW - 50) / 2 && x <= modalX + modalW - 20 &&
        y >= btnY && y <= btnY + btnH) {
        // 尝试使用体力道具
        useEnergyItem();
        return;
    }

    // 观看广告按钮
    if (x >= modalX + 20 && x <= modalX + modalW - 20 &&
        y >= btnY + btnH + btnGap && y <= btnY + btnH + btnGap + btnH) {
        // 观看广告恢复体力
        watchAdRecoverEnergy();
        return;
    }

    // 立即购买按钮暂时屏蔽（商城暂不开放）
    // if (x >= modalX + 20 && x <= modalX + modalW - 20 &&
    //     y >= btnY + (btnH + btnGap) * 2 + 10 && y <= btnY + (btnH + btnGap) * 2 + 10 + btnH) {
    //     // 切换到商城Tab的道具页面
    //     energyModal.show = false;
    //     mainMenuTab = 'shop';
    //     currentShopCategory = 'item';
    //     return;
    // }
}

// 使用体力道具
function useEnergyItem() {
    // 优先使用大药水，其次是中，最后是小
    if (energyItemCount['energy_3'] > 0) {
        energyItemCount['energy_3']--;
        recoverEnergy(100);
        wx.showToast({ title: '体力恢复 +100', icon: 'none' });
        energyModal.show = false;
    } else if (energyItemCount['energy_2'] > 0) {
        energyItemCount['energy_2']--;
        recoverEnergy(60);
        wx.showToast({ title: '体力恢复 +60', icon: 'none' });
        energyModal.show = false;
    } else if (energyItemCount['energy_1'] > 0) {
        energyItemCount['energy_1']--;
        recoverEnergy(30);
        wx.showToast({ title: '体力恢复 +30', icon: 'none' });
        energyModal.show = false;
    } else {
        wx.showToast({ title: '没有体力药水', icon: 'none' });
    }
}

// 观看广告恢复体力
function watchAdRecoverEnergy() {
    // 检查次数限制
    if (adEnergyCount >= MAX_AD_ENERGY_PER_DAY) {
        wx.showToast({ title: '今日观看次数已用完', icon: 'none' });
        return;
    }

    // 模拟微信激励视频广告（实际项目需要接入真实广告）
    wx.showModal({
        title: '观看广告',
        content: '观看完整广告可获得 +' + AD_ENERGY_RECOVER + ' 体力，是否继续？',
        success: (res) => {
            if (res.confirm) {
                // 模拟广告观看完成
                adEnergyCount++;
                recoverEnergy(AD_ENERGY_RECOVER);
                wx.showToast({ title: '体力恢复 +' + AD_ENERGY_RECOVER, icon: 'none' });

                // 检查体力是否足够开始关卡
                const energyCost = getEnergyCost(energyModal.targetStage);
                if (playerEnergy >= energyCost) {
                    // 体力足够，关闭弹窗（玩家可以再次点击开始）
                    energyModal.show = false;
                }
            }
        }
    });
}

// 检查并重置每日广告次数
function checkAdEnergyDailyReset() {
    const today = new Date().toDateString();
    if (lastAdEnergyDate !== today) {
        adEnergyCount = 0;
        lastAdEnergyDate = today;
    }
}

// ========== 设置系统 ==========
// 绘制设置弹窗
function drawSettingsModal() {
    const modalW = 300;
    const modalH = settingsPage === 'main' ? 360 : 420;  // 增加高度避免重叠
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;

    // 半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // 弹窗（皇室战争风）
    drawRoyalePanel(modalX, modalY, modalW, modalH, 16);
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 16);
    ctx.stroke();

    if (settingsPage === 'main') {
        // ===== 设置主页面 =====
        // 标题
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚙️  游戏设置', modalX + modalW / 2, modalY + 35);

        // 设置项
        const settingsY = modalY + 60;
        const itemH = 40;
        const itemGap = 5;
        const items = [
            { icon: '🔊', name: '音效', type: 'toggle', key: 'sound' },
            { icon: '🎵', name: '音乐', type: 'toggle', key: 'music' },
            { icon: '📳', name: '振动', type: 'toggle', key: 'vibration' },
            { icon: '📖', name: '游戏规则', type: 'link' },
            { icon: 'ℹ️', name: '关于我们', type: 'link' }
        ];

        items.forEach((item, i) => {
            const itemY = settingsY + i * (itemH + itemGap);

            // 背景
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            roundRect(ctx, modalX + 15, itemY, modalW - 30, itemH, 8);
            ctx.fill();

            // 图标和名称
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(item.icon + '  ' + item.name, modalX + 25, itemY + 25);

            if (item.type === 'toggle') {
                // 开关按钮
                let isOn = true;
                if (item.key === 'sound') isOn = soundEnabled;
                else if (item.key === 'music') isOn = musicEnabled;
                else if (item.key === 'vibration') isOn = vibrationEnabled;
                const toggleW = 50;
                const toggleH = 26;
                const toggleX = modalX + modalW - 25 - toggleW;
                const toggleY = itemY + (itemH - toggleH) / 2;

                // 开关背景
                ctx.fillStyle = isOn ? '#4fc3f7' : '#555';
                roundRect(ctx, toggleX, toggleY, toggleW, toggleH, 13);
                ctx.fill();

                // 开关圆点
                const knobX = isOn ? toggleX + toggleW - 16 : toggleX + 6;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(knobX + 7, toggleY + 13, 7, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // 箭头
                ctx.fillStyle = '#666';
                ctx.font = '14px Arial';
                ctx.textAlign = 'right';
                ctx.fillText('>', modalX + modalW - 25, itemY + 25);
            }
        });

        // 关闭按钮
        const closeBtnW = 120;
        const closeBtnH = 36;
        const closeBtnX = modalX + (modalW - closeBtnW) / 2;
        const closeBtnY = modalY + modalH - 50;

        drawRoyaleBevelButton({ x: closeBtnX, y: closeBtnY, w: closeBtnW, h: closeBtnH, r: 10 }, '关闭', 'blue');

    } else if (settingsPage === 'rules') {
        // ===== 游戏规则页面 =====
        // 返回按钮和标题
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📖  游戏规则', modalX + modalW / 2, modalY + 35);

        // 返回按钮
        ctx.fillStyle = '#4fc3f7';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('← 返回', modalX + 20, modalY + 35);

        // 规则内容
        const rules = [
            { title: '【游戏目标】', content: '在5分钟内击杀尽可能多的僵尸，获取经验和金币，挑战更高关卡。' },
            { title: '【操作方式】', content: '• 自动射击：角色自动攻击最近的敌人\n• 炸弹：点击屏幕右下角释放炸弹\n• 升级：战斗中获得的经验可升级，选择技能增强战斗能力' },
            // 商城暂时屏蔽，钻石描述也屏蔽
            // { title: '【货币系统】', content: '• 金币：用于升级天赋\n• 钻石：用于购买商城道具\n• 体力：每关卡需消耗体力' },
            { title: '【货币系统】', content: '• 金币：用于升级天赋\n• 体力：每关卡需消耗体力' },
            { title: '【关卡解锁】', content: '通关当前关卡后可解锁下一关卡，章节通关解锁对应天赋。' }
        ];

        let contentY = modalY + 55;
        const textPadding = 20;
        const maxTextWidth = modalW - textPadding * 2;
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';

        // 文字自动换行函数
        function wrapText(text, maxWidth) {
            const lines = [];
            let currentLine = '';
            for (const char of text) {
                const testLine = currentLine + char;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) lines.push(currentLine);
            return lines;
        }

        rules.forEach((rule, i) => {
            // 标题
            ctx.fillStyle = '#ffd700';
            ctx.fillText(rule.title, modalX + textPadding, contentY);
            contentY += 18;

            // 内容（支持多行+自动换行）
            ctx.fillStyle = '#ccc';
            const lines = rule.content.split('\n');
            lines.forEach(line => {
                const wrappedLines = wrapText(line, maxTextWidth);
                wrappedLines.forEach(wrappedLine => {
                    ctx.fillText(wrappedLine, modalX + textPadding, contentY);
                    contentY += 16;
                });
            });

            contentY += 10;
        });

    } else if (settingsPage === 'about') {
        // ===== 关于我们页面 =====
        // 返回按钮和标题
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ℹ️  关于', modalX + modalW / 2, modalY + 35);

        // 返回按钮
        ctx.fillStyle = '#4fc3f7';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('← 返回', modalX + 20, modalY + 35);

        // 游戏图标
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👾', modalX + modalW / 2, modalY + 85);

        // 游戏名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(GAME_INFO.name, modalX + modalW / 2, modalY + 115);

        // 版本
        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.fillText('版本: ' + GAME_INFO.version, modalX + modalW / 2, modalY + 135);

        // 分割线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(modalX + 20, modalY + 150);
        ctx.lineTo(modalX + modalW - 20, modalY + 150);
        ctx.stroke();

        // 开发者信息
        ctx.fillStyle = '#ccc';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('开发者: ' + GAME_INFO.developer, modalX + 25, modalY + 175);
        ctx.fillText('联系邮箱: ' + GAME_INFO.email, modalX + 25, modalY + 195);

        // 分割线
        ctx.beginPath();
        ctx.moveTo(modalX + 20, modalY + 210);
        ctx.lineTo(modalX + modalW - 20, modalY + 210);
        ctx.stroke();

        // 游戏描述
        ctx.fillStyle = '#999';
        ctx.font = '11px Arial';
        // 手动换行
        const descLines = [];
        let currentLine = '';
        const maxWidth = modalW - 40;
        for (const char of GAME_INFO.description) {
            currentLine += char;
            if (ctx.measureText(currentLine).width > maxWidth) {
                descLines.push(currentLine);
                currentLine = '';
            }
        }
        if (currentLine) descLines.push(currentLine);

        let descY = modalY + 230;
        descLines.forEach(line => {
            ctx.fillText(line, modalX + 25, descY);
            descY += 16;
        });

        // 版权
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('© 2026 All Rights Reserved', modalX + modalW / 2, modalY + modalH - 20);
    }
}

// ==================== 体力系统函数 ====================

// 获取关卡体力消耗
function getEnergyCost(stageId) {
    if (stageId >= 51) return ENERGY_COST[51];
    if (stageId >= 41) return ENERGY_COST[41];
    if (stageId >= 31) return ENERGY_COST[31];
    if (stageId >= 21) return ENERGY_COST[21];
    if (stageId >= 11) return ENERGY_COST[11];
    return ENERGY_COST[1];
}

// 消耗体力（不重置恢复倒计时，保持原有恢复节奏）
function consumeEnergy(amount) {
    if (playerEnergy >= amount) {
        playerEnergy -= amount;
        // 注意：这里不重置 lastEnergyUpdate，保持体力恢复节奏不变
        return true;
    }
    return false;
}

// 恢复体力
function recoverEnergy(amount) {
    const oldEnergy = playerEnergy;
    playerEnergy = Math.min(playerEnergy + amount, ENERGY_CONFIG.maxEnergy);
    lastEnergyUpdate = Date.now();
    return playerEnergy - oldEnergy;  // 返回实际恢复量
}

// 检查能否开始关卡
function canStartStage(stageId) {
    const cost = getEnergyCost(stageId);
    return playerEnergy >= cost;
}

// 实时更新体力（游戏中调用）
function updateEnergyRealtime() {
    if (playerEnergy >= ENERGY_CONFIG.maxEnergy) {
        lastEnergyUpdate = Date.now();
        return;
    }

    const now = Date.now();
    const elapsed = now - lastEnergyUpdate;
    const recoverInterval = ENERGY_CONFIG.recoverTime; // 5分钟

    if (elapsed >= recoverInterval) {
        const pointsToRecover = Math.floor(elapsed / recoverInterval);
        const actualRecover = Math.min(
            pointsToRecover,
            ENERGY_CONFIG.maxEnergy - playerEnergy
        );
        playerEnergy += actualRecover;
        lastEnergyUpdate = now - (elapsed % recoverInterval);
    }
}

// 计算离线恢复体力
function calculateOfflineEnergy() {
    try {
        const lastTime = wx.getStorageSync('zombieHunterLastTime');
        if (lastTime) {
            const elapsed = Date.now() - lastTime;
            const maxOfflineTime = 3 * 24 * 60 * 60 * 1000; // 最多离线3天
            const effectiveElapsed = Math.min(elapsed, maxOfflineTime);

            const pointsToRecover = Math.floor(effectiveElapsed / ENERGY_CONFIG.recoverTime);
            playerEnergy = Math.min(
                playerEnergy + pointsToRecover,
                ENERGY_CONFIG.maxEnergy
            );
        }
    } catch (e) {
        console.log('离线体力计算失败', e);
    }

    lastEnergyUpdate = Date.now();
}

// 获取体力恢复倒计时（分钟）
function getEnergyRecoverTime() {
    if (playerEnergy >= ENERGY_CONFIG.maxEnergy) {
        return 0;
    }
    const remaining = ENERGY_CONFIG.maxEnergy - playerEnergy;
    return remaining * 5;  // 每点需要5分钟
}

// 设置弹窗点击处理
function handleSettingsClick(x, y) {
    if (!settingsModal.show) return;

    const modalW = 300;
    const modalH = settingsPage === 'main' ? 360 : 420;  // 与drawSettingsModal保持一致
    const modalX = (screenWidth - modalW) / 2;
    const modalY = (screenHeight - modalH) / 2;

    // 检查是否点击弹窗外（关闭弹窗）
    if (x < modalX || x > modalX + modalW || y < modalY || y > modalY + modalH) {
        settingsModal.show = false;
        settingsPage = 'main';
        return;
    }

    if (settingsPage === 'main') {
        // 主设置页面点击
        const settingsY = modalY + 60;
        const itemH = 40;
        const itemGap = 5;
        const items = [
            { icon: '🔊', name: '音效', type: 'toggle', key: 'sound' },
            { icon: '🎵', name: '音乐', type: 'toggle', key: 'music' },
            { icon: '📳', name: '振动', type: 'toggle', key: 'vibration' },
            { icon: '📖', name: '游戏规则', type: 'link' },
            { icon: 'ℹ️', name: '关于我们', type: 'link' }
        ];

        items.forEach((item, i) => {
            const itemY = settingsY + i * (itemH + itemGap);
            if (y >= itemY && y <= itemY + itemH) {
                if (item.type === 'toggle') {
                    // 切换开关
                    if (item.key === 'sound') {
                        soundEnabled = !soundEnabled;
                    } else if (item.key === 'music') {
                        musicEnabled = !musicEnabled;
                    } else if (item.key === 'vibration') {
                        vibrationEnabled = !vibrationEnabled;
                        // 如果开启振动，触发一次振动反馈
                        if (vibrationEnabled && wx.vibrateShort) {
                            wx.vibrateShort({ type: 'medium' });
                        }
                    }
                } else if (item.type === 'link') {
                    // 切换页面
                    if (item.name === '游戏规则') {
                        settingsPage = 'rules';
                    } else if (item.name === '关于我们') {
                        settingsPage = 'about';
                    }
                }
            }
        });

        // 关闭按钮
        const closeBtnW = 120;
        const closeBtnH = 36;
        const closeBtnX = modalX + (modalW - closeBtnW) / 2;
        const closeBtnY = modalY + modalH - 50;

        if (x >= closeBtnX && x <= closeBtnX + closeBtnW && y >= closeBtnY && y <= closeBtnY + closeBtnH) {
            settingsModal.show = false;
            settingsPage = 'main';
        }

    } else {
        // 规则/关于页面：点击任意处返回
        settingsPage = 'main';
        settingsModal.show = false;
    }
}

// ==================== 其他游戏选择页 ====================
// ============ 其他游戏页布局（我玩过的 + 所有游戏 alpha 分组 + 字母索引 + 更多展开） ============
function computeOtherGamesLayout() {
    ensureMiniGameStatsLoaded();
    const cols = 3;
    const gap = 14;
    const gridX = 20;
    const gridRightPad = 36; // 右侧给字母索引留空间
    const gridW = screenWidth - gridX - gridRightPad;
    const cardW = (gridW - gap * (cols - 1)) / cols;
    const cardH = 104;
    const vgap = 12;

    const contentTop = SAFE_TOP_OFFSET + 48;
    const bottomPad = 16;
    const bottomBtnH = 32;
    const contentBottom = screenHeight - bottomPad - bottomBtnH - 8;
    const contentH = contentBottom - contentTop;

    let maxVirtualY = 0;

    // ---- 我玩过的（按累计时长降序） ----
    const played = OTHER_GAMES.filter(g => isPlayed(g.id))
        .sort((a, b) => (miniGamePlaySeconds[b.id] || 0) - (miniGamePlaySeconds[a.id] || 0));
    const playedHeaderY = 0;
    const playedGridStartY = 38;
    const playedCards = [];
    let moreBtn = null;
    if (played.length > 0) {
        const shown = otherGamesExpanded ? played.length : Math.min(played.length, 5);
        for (let i = 0; i < shown; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            playedCards.push({
                game: played[i],
                x: gridX + col * (cardW + gap),
                y: playedGridStartY + row * (cardH + vgap),
                w: cardW, h: cardH
            });
        }
        // 超过 5 个才有折叠需求：收起态显示「更多 ▾」，展开态显示「收起 ▴」
        if (played.length > 5) {
            const idx = shown; // 紧跟在最后一张卡之后
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            moreBtn = { x: gridX + col * (cardW + gap), y: playedGridStartY + row * (cardH + vgap), w: cardW, h: cardH };
        }
        const totalSlots = shown + (moreBtn ? 1 : 0);
        const rows = Math.ceil(totalSlots / cols);
        maxVirtualY = playedGridStartY + rows * (cardH + vgap);
    }

    // ---- 所有游戏（按 alpha 分组，A-Z 在前，'0' 在最后） ----
    const allHeaderY = maxVirtualY + 16;
    const groupsRaw = {};
    OTHER_GAMES.forEach(g => {
        const key = (g.alpha || '0').toUpperCase();
        (groupsRaw[key] = groupsRaw[key] || []).push(g);
    });
    const groupLetters = Object.keys(groupsRaw).sort((a, b) => {
        const ka = a === '0' ? ' ' : a;
        const kb = b === '0' ? ' ' : b;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const groups = [];
    const groupHeaders = [];
    let gy = allHeaderY + 34;
    groupLetters.forEach(letter => {
        const items = groupsRaw[letter].slice().sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        const headerY = gy;
        groupHeaders.push({ letter, y: headerY });
        const cards = [];
        items.forEach((g, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            cards.push({ game: g, x: gridX + col * (cardW + gap), y: headerY + 30 + row * (cardH + vgap), w: cardW, h: cardH });
        });
        const rows = Math.ceil(items.length / cols);
        const endY = headerY + 30 + rows * (cardH + vgap);
        groups.push({ letter, headerY, cards });
        gy = endY + 16;
    });
    if (groupLetters.length > 0) maxVirtualY = gy;

    const maxScroll = Math.max(0, maxVirtualY - contentH);

    return {
        contentTop, contentBottom, contentH, cardW, cardH,
        played, playedHeaderY, playedCards, moreBtn,
        allHeaderY, groups, groupHeaders,
        letters: groupLetters, maxScroll
    };
}

// 单个游戏卡（我玩过的 = 金边+时长；所有游戏 = 蓝边+最高分）
function drawOtherGameCard(x, y, w, h, game, isPlayedCard) {
    ctx.fillStyle = ROYALE.panelLight;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = isPlayedCard ? ROYALE.gold : 'rgba(125, 175, 225, 0.5)';
    ctx.lineWidth = isPlayedCard ? 1.5 : 1;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();

    const iconR = 24;
    const iconCx = x + w / 2;
    const iconCy = y + 36;
    const iconImg = otherGameIcons[game.id];
    if (iconImg) {
        const size = iconR * 2;
        const ix = iconCx - iconR, iy = iconCy - iconR;
        ctx.save();
        roundRect(ctx, ix, iy, size, size, 10);
        ctx.clip();
        ctx.drawImage(iconImg, ix, iy, size, size);
        ctx.restore();
    } else {
        ctx.fillStyle = 'rgba(79, 195, 247, 0.18)';
        ctx.beginPath();
        ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(game.emoji, iconCx, iconCy);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(game.name, x + w / 2, y + h - 30);

    ctx.font = '10px Arial';
    if (isPlayedCard) {
        const mins = Math.max(1, Math.round((miniGamePlaySeconds[game.id] || 0) / 60));
        ctx.fillStyle = ROYALE.gold;
        ctx.fillText('⏱ ' + mins + '分钟', x + w / 2, y + h - 14);
    } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillText(getMiniGameBestText(game.id), x + w / 2, y + h - 14);
    }
}

// “更多 / 收起”按钮（样式等同游戏卡）
function drawOtherGamesMoreBtn(x, y, w, h, expanded) {
    ctx.fillStyle = ROYALE.panelLight;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    ctx.fillStyle = ROYALE.gold;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(expanded ? '收起 ▴' : '更多 ▾', x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
}

// 右侧字母索引（固定层）
function drawOtherGamesLetterIndex(L) {
    const bandTop = L.contentTop + 6;
    const bandBottom = L.contentBottom - 6;
    const bandH = bandBottom - bandTop;
    const n = L.letters.length;
    const idxX = screenWidth - 20;
    // 当前激活字母：最靠近内容顶部的分组
    let activeLetter = L.letters[0];
    let bestDiff = Infinity;
    L.groupHeaders.forEach(gh => {
        const screenY = L.contentTop + gh.y + otherGamesScrollY;
        if (screenY <= L.contentTop + 30) {
            const d = Math.abs(screenY - L.contentTop);
            if (d < bestDiff) { bestDiff = d; activeLetter = gh.letter; }
        }
    });
    L.letters.forEach((letter, i) => {
        const cy = bandTop + (i + 0.5) * bandH / n;
        const isActive = letter === activeLetter;
        ctx.fillStyle = isActive ? ROYALE.gold : 'rgba(255, 255, 255, 0.55)';
        ctx.font = isActive ? 'bold 12px Arial' : '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, idxX, cy);
    });
    ctx.textBaseline = 'alphabetic';
}

function drawOtherGamesPage() {
    // 不透明底板：完全覆盖主界面（含底部Tab栏）
    drawRoyaleBackground();

    const L = computeOtherGamesLayout();
    const scrollY = otherGamesScrollY;
    const contentTop = L.contentTop;

    // 固定标题
    ctx.fillStyle = ROYALE.gold;
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('🎮  其他游戏', screenWidth / 2, SAFE_TOP_OFFSET + 28);

    // 固定返回按钮（左下），与内嵌小游戏返回按钮风格一致
    drawRoyaleBevelButton({ x: 15, y: screenHeight - 16 - 32, w: 70, h: 32, r: 8 }, '返回', 'blue');

    // 裁剪内容区后绘制（滚动效果）
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, contentTop, screenWidth, L.contentH);
    ctx.clip();

    // ---- 我玩过的 ----
    if (L.played.length > 0) {
        ctx.fillStyle = ROYALE.gold;
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('我玩过的', 20, contentTop + L.playedHeaderY + 20 + scrollY);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '11px Arial';
        ctx.fillText('按累计时长排序', 92, contentTop + L.playedHeaderY + 20 + scrollY);

        L.playedCards.forEach(c => {
            drawOtherGameCard(c.x, contentTop + c.y + scrollY, c.w, c.h, c.game, true);
        });
        if (L.moreBtn) {
            drawOtherGamesMoreBtn(L.moreBtn.x, contentTop + L.moreBtn.y + scrollY, L.moreBtn.w, L.moreBtn.h, otherGamesExpanded);
        }
    }

    // ---- 所有游戏（alpha 分组） ----
    if (L.groups.length > 0) {
        ctx.fillStyle = ROYALE.gold;
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('所有游戏', 20, contentTop + L.allHeaderY + 20 + scrollY);

        L.groups.forEach(grp => {
            const hsy = contentTop + grp.headerY + scrollY;
            if (hsy > contentTop - 30 && hsy < L.contentBottom + 30) {
                ctx.fillStyle = ROYALE.gold;
                roundRect(ctx, 16, hsy - 4, 26, 26, 6);
                ctx.fill();
                ctx.fillStyle = '#1a1a2e';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(grp.letter, 29, hsy + 9);
                ctx.textBaseline = 'alphabetic';
            }
            grp.cards.forEach(c => {
                drawOtherGameCard(c.x, contentTop + c.y + scrollY, c.w, c.h, c.game, false);
            });
        });
    }

    ctx.restore();

    // 右侧字母索引（固定层，仅在多于 1 个分组时显示）
    if (L.letters.length > 1) {
        drawOtherGamesLetterIndex(L);
    }
}

function handleOtherGamesClick(x, y) {
    if (!otherGamesModal.show) return;
    const L = computeOtherGamesLayout();
    const scrollY = otherGamesScrollY;
    const contentTop = L.contentTop;

    // 返回按钮（固定，左下）
    if (x >= 15 && x <= 15 + 70 && y >= screenHeight - 16 - 32 && y <= screenHeight - 16) {
        otherGamesModal.show = false;
        return;
    }

    // 右侧字母索引（固定）
    if (x >= screenWidth - 30) {
        const bandTop = L.contentTop + 6;
        const bandBottom = L.contentBottom - 6;
        const bandH = bandBottom - bandTop;
        const n = L.letters.length;
        if (n > 0 && y >= bandTop - 10 && y <= bandBottom + 10) {
            let idx = Math.floor((y - bandTop) / (bandH / n));
            idx = Math.max(0, Math.min(n - 1, idx));
            const letter = L.letters[idx];
            const gh = L.groupHeaders.find(g => g.letter === letter);
            if (gh) {
                otherGamesScrollY = Math.max(-L.maxScroll, Math.min(0, 6 - gh.y));
            }
        }
        return;
    }

    // 内容区：我玩过的卡片
    for (const c of L.playedCards) {
        const sy = contentTop + c.y + scrollY;
        if (x >= c.x && x <= c.x + c.w && y >= sy && y <= sy + c.h) {
            if (c.game.mode === 'ingame') startMiniGame(c.game);
            else openMiniGame(c.game);
            return;
        }
    }
    // 更多 / 收起 按钮
    if (L.moreBtn) {
        const sy = contentTop + L.moreBtn.y + scrollY;
        if (x >= L.moreBtn.x && x <= L.moreBtn.x + L.moreBtn.w && y >= sy && y <= sy + L.moreBtn.h) {
            otherGamesExpanded = !otherGamesExpanded;
            // 收起后内容变短，滚动量可能越界，重新钳制
            const L2 = computeOtherGamesLayout();
            otherGamesScrollY = Math.max(-L2.maxScroll, Math.min(0, otherGamesScrollY));
            return;
        }
    }
    // 内容区：所有游戏卡片
    for (const grp of L.groups) {
        for (const c of grp.cards) {
            const sy = contentTop + c.y + scrollY;
            if (x >= c.x && x <= c.x + c.w && y >= sy && y <= sy + c.h) {
                if (c.game.mode === 'ingame') startMiniGame(c.game);
                else openMiniGame(c.game);
                return;
            }
        }
    }
}

function openMiniGame(game) {
    if (!game.appId) {
        if (wx.showToast) {
            wx.showToast({ title: '该游戏暂未配置AppID', icon: 'none' });
        } else {
            console.log('未配置AppID:', game.name);
        }
        return;
    }
    if (!wx.navigateToMiniProgram) {
        if (wx.showToast) wx.showToast({ title: '当前环境不支持跳转', icon: 'none' });
        return;
    }
    wx.navigateToMiniProgram({
        appId: game.appId,
        envVersion: 'release',
        success() {},
        fail(err) {
            console.error('打开小游戏失败', err);
            if (wx.showToast) wx.showToast({ title: '打开失败，请重试', icon: 'none' });
        }
    });
}

// ==================== 内嵌小游戏：2048 ====================
// 直接移植经典 2048 算法（grid/tile/game_manager），用 Canvas 绘制 + 滑动输入，
// 在本小游戏内运行，无需任何 AppID。
function g2048Init() {
    const size = 4;
    const grid = [];
    for (let x = 0; x < size; x++) {
        grid[x] = [];
        for (let y = 0; y < size; y++) grid[x][y] = 0;
    }
    g2048 = { size: size, grid: grid, score: 0, won: false, over: false, keepPlaying: false };
    try { g2048Best = (wx.getStorageSync && wx.getStorageSync('g2048Best')) || 0; } catch (e) { g2048Best = 0; }
    g2048AddRandom();
    g2048AddRandom();
}

function g2048AvailableCells(g) {
    const cells = [];
    for (let x = 0; x < g.size; x++)
        for (let y = 0; y < g.size; y++)
            if (g.grid[x][y] === 0) cells.push({ x: x, y: y });
    return cells;
}

function g2048AddRandom() {
    const cells = g2048AvailableCells(g2048);
    if (!cells.length) return;
    const c = cells[Math.floor(Math.random() * cells.length)];
    g2048.grid[c.x][c.y] = Math.random() < 0.9 ? 2 : 4;
}

function g2048Within(g, x, y) {
    return x >= 0 && x < g.size && y >= 0 && y < g.size;
}

function g2048Vector(dir) {
    return { 0: { x: 0, y: -1 }, 1: { x: 1, y: 0 }, 2: { x: 0, y: 1 }, 3: { x: -1, y: 0 } }[dir];
}

// 核心移动：0上 1右 2下 3左，与原版算法一致
function g2048Move(dir) {
    const g = g2048;
    if (!g || g.over || (g.won && !g.keepPlaying)) return;
    MiniGameAudio.play('slide');

    const v = g2048Vector(dir);
    const trav = { x: [], y: [] };
    for (let i = 0; i < g.size; i++) { trav.x.push(i); trav.y.push(i); }
    if (v.x === 1) trav.x.reverse();
    if (v.y === 1) trav.y.reverse();

    const mergedFlag = {};
    let moved = false;

    trav.x.forEach((x) => {
        trav.y.forEach((y) => {
            if (g.grid[x][y] === 0) return;
            const val = g.grid[x][y];
            let prevX = x, prevY = y;
            let cx = x, cy = y;
            // 找到最远空格 & 下一个被阻挡的格子
            do {
                prevX = cx; prevY = cy;
                cx += v.x; cy += v.y;
            } while (g2048Within(g, cx, cy) && g.grid[cx][cy] === 0);

            const nextVal = g2048Within(g, cx, cy) ? g.grid[cx][cy] : 0;
            if (nextVal !== 0 && nextVal === val && !mergedFlag[cx + ',' + cy]) {
                // 合并
                MiniGameAudio.play('merge');
                const newVal = val * 2;
                g.grid[cx][cy] = newVal;
                g.grid[x][y] = 0;
                g.score += newVal;
                mergedFlag[cx + ',' + cy] = true;
                if (newVal === 2048) { g.won = true; MiniGameAudio.play('win'); }
                moved = true;
            } else if (prevX !== x || prevY !== y) {
                // 滑动到最远空格
                g.grid[prevX][prevY] = val;
                g.grid[x][y] = 0;
                moved = true;
            }
        });
    });

    if (moved) {
        g2048AddRandom();
        if (g2048Best < g.score) {
            g2048Best = g.score;
            try { if (wx.setStorageSync) wx.setStorageSync('g2048Best', g2048Best); } catch (e) {}
        }
        if (!g2048MovesAvailable()) { g.over = true; MiniGameAudio.play('lose'); }
    }
}

function g2048MovesAvailable() {
    const g = g2048;
    if (g2048AvailableCells(g).length) return true;
    for (let x = 0; x < g.size; x++) {
        for (let y = 0; y < g.size; y++) {
            const val = g.grid[x][y];
            if (val === 0) continue;
            for (let d = 0; d < 4; d++) {
                const v = g2048Vector(d);
                const nx = x + v.x, ny = y + v.y;
                if (g2048Within(g, nx, ny) && g.grid[nx][ny] === val) return true;
            }
        }
    }
    return false;
}

function g2048Layout() {
    const margin = 15;
    const maxBoard = Math.min(screenWidth - margin * 2, 360);
    const gap = Math.max(8, Math.round(maxBoard * 0.028));
    const boardW = maxBoard;
    const cell = (boardW - gap * 5) / 4;
    const boardX = (screenWidth - boardW) / 2;
    // 分层：标题 → 状态栏(分数/最高) → 棋盘 → 底部按钮，与主菜单/小游戏风格一致
    const titleY = SAFE_TOP_OFFSET + 10;
    const rowB = titleY + 34;
    const boardY = rowB + 36 + 16;
    const bottomY = screenHeight - 16 - 32;
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    return { margin: margin, gap: gap, boardW: boardW, cell: cell, boardX: boardX, boardY: boardY, backBtn: backBtn, restartBtn: restartBtn, rowB: rowB, titleY: titleY };
}

function g2048Color(val) {
    const map = {
        2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
        32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
        512: '#edc850', 1024: '#edc53f', 2048: '#edc22e'
    };
    return map[val] || '#3c3a32';
}

function drawMiniGameButton(btn, text, style) {
    const s = style === 'green' ? 'green' : 'blue';
    drawRoyaleBevelButton(btn, text, s);
}

function drawScoreBox(x, y, w, h, label, value) {
    ctx.fillStyle = ROYALE.panelLight;
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = ROYALE.blue;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + w / 2, y + 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(value), x + w / 2, y + h - 6);
}

function draw2048Tile(cx, cy, size, val) {
    ctx.fillStyle = g2048Color(val);
    roundRect(ctx, cx, cy, size, size, 6);
    ctx.fill();
    ctx.fillStyle = (val <= 4) ? '#776e65' : '#f9f6f2';
    const digits = String(val).length;
    let fontPx = size * 0.45;
    if (digits >= 4) fontPx = size * 0.3;
    else if (digits === 3) fontPx = size * 0.38;
    ctx.font = 'bold ' + Math.floor(fontPx) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(val), cx + size / 2, cy + size / 2);
    ctx.textBaseline = 'alphabetic';
}

function drawMiniGameOverlay(title, subtitle) {
    const L = g2048Layout();
    ctx.fillStyle = 'rgba(15, 27, 45, 0.88)';
    roundRect(ctx, L.boardX, L.boardY, L.boardW, L.boardW, 10);
    ctx.fill();
    ctx.strokeStyle = '#4a4e69';
    ctx.lineWidth = 2;
    roundRect(ctx, L.boardX, L.boardY, L.boardW, L.boardW, 10);
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, screenWidth / 2, L.boardY + L.boardW / 2 - 14);
    ctx.fillStyle = '#fff';
    ctx.font = '13px Arial';
    ctx.fillText(subtitle, screenWidth / 2, L.boardY + L.boardW / 2 + 14);
    ctx.textBaseline = 'alphabetic';
}

function drawMiniGame2048() {
    // 主游戏战场背景（夜空+远山+微光）
    drawBackground();

    const L = g2048Layout();

    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    // 标题（金色，与主游戏标题一致）
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('2048', L.margin, L.titleY);

    // 分数 / 最高
    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 36, '分数', g2048 ? g2048.score : 0);
    drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 36, '最高', g2048Best);

    // 棋盘背景（皇室战争风面板）
    drawRoyalePanel(L.boardX, L.boardY, L.boardW, L.boardW, 10);

    // 格子
    for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
            const cx = L.boardX + L.gap + x * (L.cell + L.gap);
            const cy = L.boardY + L.gap + y * (L.cell + L.gap);
            const val = g2048 ? g2048.grid[x][y] : 0;
            if (val === 0) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
                roundRect(ctx, cx, cy, L.cell, L.cell, 6);
                ctx.fill();
            } else {
                draw2048Tile(cx, cy, L.cell, val);
            }
        }
    }

    // 结束 / 胜利 遮罩
    if (g2048 && g2048.over) {
        drawMiniGameOverlay('游戏结束', '点「↻ 新游戏」再来一局');
    } else if (g2048 && g2048.won && !g2048.keepPlaying) {
        drawMiniGameOverlay('🎉 达成 2048！', '点此继续挑战更高分');
    }
}

function inRect(x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function handleMiniGame2048Input(x, y) {
    if (!g2048) return;
    const L = g2048Layout();
    const dx = x - miniGameTouchStartX;
    const dy = y - miniGameTouchStartY;
    const adx = Math.abs(dx), ady = Math.abs(dy);

    // 点击（非滑动）
    if (Math.max(adx, ady) < 24) {
        if (inRect(x, y, L.backBtn)) {
            flushMiniGameSeconds();
            activeMiniGame = null;
            otherGamesModal.show = true; // 回到「其他游戏」选择页
            return;
        }
        if (inRect(x, y, L.restartBtn)) {
            flushMiniGameSeconds();
            g2048Init();
            return;
        }
        // 胜利后点击棋盘：继续挑战
        if (g2048.won && !g2048.keepPlaying) {
            g2048.keepPlaying = true;
            return;
        }
        return;
    }

    // 滑动方向
    let dir;
    if (adx > ady) {
        dir = dx > 0 ? 1 : 3; // 右 / 左
    } else {
        dir = dy > 0 ? 2 : 0; // 下 / 上
    }
    g2048Move(dir);
}

// ==================== 守桥射击（内嵌小游戏，复刻豆包设计文档 V1.1） ====================
// 竖屏词条肉鸽 + 守桥防守：玩家在底部横向拖动，子弹自动竖直上射；
// 左侧宝箱可击碎掉落「词条符咒」强化自身，右侧敌人自上而下突破防线，越线扣防线生命；
// 清完所有波次即过关，防线生命归零则失败。金龙宝箱击碎触发「仙道/魔道」阵营二选一。
// 数值严格按文档 V1.1：初始攻击8/间隔0.5s/弹道3/暴击5%/暴伤150%/防线10/护盾3/移速450；
// 宝箱血=200×类型系数×位置系数×K（第1关+30%）；敌人血=40×类型系数×K×波增。
// 坐标用 1080×1920 比例映射到当前画布。当前范围：核心循环 + 第1关（L2–L5 数据已结构化预留，后续直接扩展）。
// 复用框架共用件：drawMiniGameButton / drawScoreBox / roundRect / inRect / flushMiniGameSeconds / drawBackground。

// ---- 关卡数据（V1.1 文档全量；此处先启用 L1，其余按文档扩展）----
const SQ_LEVELS = [
  { // 第1关 K=1.0
    K: 1.0,
    chestHPMul: 1.30, // 第1关宝箱血 +30%（V1.1）
    chests: [
      { pos:1, type:'wood',   hp:260,  drop:{white:1.0} },
      { pos:2, type:'wood',   hp:390,  drop:{white:0.7, green:0.3} },
      { pos:3, type:'wood',   hp:572,  drop:{green:1.0} },
      { pos:4, type:'jade',   hp:1950, drop:{green:0.6, blue:0.35, gold:0.05} },
      { pos:5, type:'dragon', hp:5460, drop:{gold:1.0} }
    ],
    waves: [
      { t:0,  list:[{type:'mob',count:12,hp:40}] },
      { t:6,  list:[{type:'mob',count:14,hp:43}] },
      { t:12, list:[{type:'mob',count:10,hp:46},{type:'fast',count:5,hp:144}] }
    ],
    loop: { interval:6, count:5, hpMul:1.07, hpCap:2.0, list:[{type:'mob',count:10,hp:46},{type:'fast',count:5,hp:144}] }
  }
  // TODO L2..L5 后续按文档接入
];

// 宝箱类型系数 / 颜色（V1.1）
const SQ_CHEST = {
  wood:   { coef:1.0,  color:'#b5793a', name:'木箱' },
  jade:   { coef:2.5,  color:'#3ad6a0', name:'玉箱' },
  timed:  { coef:1.8,  color:'#e0c14a', name:'限时' },
  ice:    { coef:4.0,  color:'#7fd4ff', name:'冰盾' },
  dragon: { coef:5.25, color:'#ffcf3a', name:'金龙' }
};

// 敌人类型系数（血/速/突破扣血）；速基 80×coef px/s（文档），绘制时按比例映射
const SQ_ENEMY = {
  mob:   { hpCoef:1.0, spdCoef:1.0, breach:1, color:'#ff8a5c', r:16 },
  fast:  { hpCoef:0.6, spdCoef:1.8, breach:1, color:'#ffe14d', r:13 },
  armor: { hpCoef:3.0, spdCoef:0.6, breach:2, color:'#9aa7b5', r:20 },
  elite: { hpCoef:8.0, spdCoef:0.8, breach:3, color:'#c46bff', r:24 },
  boss:  { hpCoef:25.0,spdCoef:0.5, breach:5, color:'#ff4d6d', r:42 }
};

// 词条品质颜色（V1.1）
const SQ_QUALITY = {
  white: { color:'#e8e8e8', name:'白' },
  green: { color:'#5fe06a', name:'绿' },
  blue:  { color:'#5aa8ff', name:'蓝' },
  gold:  { color:'#ffcf3a', name:'金' }
};

// 每个品质下的具体词条池（V1.1）；apply 对 gSq 直接修饰。百分比均为加法叠加。
const SQ_AFFIX_POOL = {
  white: [
    { name:'攻击符Ⅰ', apply:(s)=>{ s.attack+=3; } },
    { name:'速符Ⅰ',   apply:(s)=>{ s.interval=Math.max(0.1,s.interval-0.04); } },
    { name:'加固符',   apply:(s)=>{ s.lineHP+=2; s.lineHPMax+=2; } }
  ],
  green: [
    { name:'攻击符Ⅱ', apply:(s)=>{ s.attack+=10; } },
    { name:'攻击增幅Ⅰ', apply:(s)=>{ s.attackPct+=0.08; } },
    { name:'速符Ⅱ',   apply:(s)=>{ s.interval=Math.max(0.1,s.interval-0.08); } },
    { name:'爆符',     apply:(s)=>{ s.critRate+=0.08; } },
    { name:'穿透符',   apply:(s)=>{ s.pierce+=1; } }
  ],
  blue: [
    { name:'攻击符Ⅲ', apply:(s)=>{ s.attack+=30; } },
    { name:'攻击增幅Ⅱ', apply:(s)=>{ s.attackPct+=0.20; } },
    { name:'速符Ⅲ',   apply:(s)=>{ s.interval=Math.max(0.1,s.interval-0.12); } },
    { name:'爆伤符',   apply:(s)=>{ s.critDmg+=0.40; } },
    { name:'破甲符',   apply:(s)=>{ s.breakArmor=true; } },
    { name:'弹射符',   apply:(s)=>{ s.ricochet+=1; } }
  ],
  gold: [
    { name:'攻击符Ⅳ', apply:(s)=>{ s.attackPct+=0.30; s.projectile+=1; } },
    { name:'极速符',   apply:(s)=>{ s.interval=Math.max(0.1,s.interval-0.20); } },
    { name:'暴击宗师', apply:(s)=>{ s.critRate+=0.15; s.critDmg+=0.80; } },
    { name:'爆炸符',   apply:(s)=>{ s.explode=true; } }
  ]
};

function sqLayout() {
  const margin = 14;
  const DW = 1080, DH = 1920;
  const defLineY = (1600/DH)*screenHeight;       // 防线
  const playerY  = (1680/DH)*screenHeight;       // 玩家（1600-1750 区间）
  const chestTopY= (200/DH)*screenHeight;        // 宝箱区顶端
  const enemyX0  = (560/DW)*screenWidth;         // 敌人通路左
  const enemyX1  = (960/DW)*screenWidth;         // 敌人通路右
  const chestX   = (300/DW)*screenWidth;         // 宝箱列 x（120-520 区中部）
  const chestW   = (170/DW)*screenWidth;
  // 底部按钮与其他小游戏统一：w84 h32，bottomY = screenHeight-16-32
  const btnH = 32, btnY = screenHeight - 16 - btnH;
  const backBtn = { x:margin, y:btnY, w:84, h:btnH };
  const restartBtn = { x:screenWidth-margin-84, y:btnY, w:84, h:btnH };
  return { margin, DW, DH, defLineY, playerY, chestTopY, enemyX0, enemyX1, chestX, chestW, backBtn, restartBtn };
}

function sqChestY(L, pos) {
  const topY = L.chestTopY;
  const botY = L.defLineY - (90/L.DH)*screenHeight;
  return botY + (topY - botY) * ((pos-1)/6); // pos1 底 → pos7 顶
}

function sqInit() {
  const L = sqLayout();
  const lv = SQ_LEVELS[0];
  gSq = {
    level: 0, K: lv.K,
    attack: 8, attackPct: 0, interval: 0.5,
    projectile: 3, critRate: 0.05, critDmg: 1.5,
    pierce: 0, ricochet: 0, explode: false, breakArmor: false,
    lineHP: 10, lineHPMax: 10, lineShield: 3,
    faction: null,
    playerX: screenWidth/2, playerY: L.playerY, radius: 20,
    bullets: [], enemies: [], chests: [], orbs: [], floats: [],
    fireTimer: 0, enemyId: 0,
    waves: lv.waves.map(w=>({ t:w.t, list:w.list, done:false })),
    loop: lv.loop, waveTimer: 0, loopTimer: 0, loopCount: 0,
    spawnedAll: false, win: false, gameOver: false, factionChoice: false,
    pendingFactionAffix: null, factionBtns: null,
    score: 0, kills: 0, chestsBroken: 0,
    lastTick: Date.now(), shake: 0
  };
  for (const c of lv.chests) {
    gSq.chests.push({
      pos:c.pos, type:c.type, hp:c.hp, hpMax:c.hp, drop:c.drop,
      x:L.chestX, y:sqChestY(L,c.pos), w:L.chestW, h:(130/L.DH)*screenHeight,
      broken:false, shieldAcc:0, brokenShield:false,
      timer: c.type==='timed' ? 25 : 0
    });
  }
  try { gSqBest = (wx.getStorageSync && wx.getStorageSync('sqBest')) || 0; } catch(e){ gSqBest = 0; }
}

function sqUpdate(dsec) {
  const g = gSq, L = sqLayout();
  if (g.gameOver || g.win || g.factionChoice) return;

  // 自动开火（竖直上射，多弹道小幅散布）
  g.fireTimer -= dsec;
  if (g.fireTimer <= 0) {
    g.fireTimer += g.interval;
    const dmgBase = g.attack * (1 + g.attackPct);
    const n = g.projectile;
    const spread = (n>1) ? (g.radius*1.8) : 0;
    for (let i=0;i<n;i++) {
      const off = (n>1) ? (-spread/2 + spread*i/(n-1)) : 0;
      const crit = Math.random() < g.critRate;
      g.bullets.push({ x:g.playerX+off, y:g.playerY-g.radius, vy:-(1100/L.DH)*screenHeight,
        dmg:dmgBase*(crit?g.critDmg:1), crit, pierce:g.pierce, hitSet:[], explode:g.explode });
    }
  }

  // 子弹移动 + 命中（命中循环用 slice 快照，避免微信高混淆 splice 越界）
  for (const b of g.bullets.slice()) {
    b.y += b.vy*dsec;
    if (b.y < -20) { b.dead = true; continue; }
    for (const c of g.chests) {
      if (c.broken) continue;
      if (b.x > c.x-c.w/2 && b.x < c.x+c.w/2 && b.y < c.y+c.h/2 && b.y > c.y-c.h/2) {
        sqDamageChest(c, b.dmg);
        if (b.pierce > 0) b.pierce--; else b.dead = true;
        break;
      }
    }
    if (b.dead) continue;
    for (const e of g.enemies.slice()) {
      if (b.hitSet.indexOf(e.id) !== -1) continue;
      const dx=b.x-e.x, dy=b.y-e.y, rr=(e.r+4);
      if (dx*dx+dy*dy <= rr*rr) {
        sqDamageEnemy(e, b.dmg, b.crit);
        b.hitSet.push(e.id);
        if (b.explode) sqExplode(e, b.dmg*0.7);
        if (b.pierce > 0) b.pierce--; else { b.dead = true; break; }
      }
    }
  }
  g.bullets = g.bullets.filter(b=>!b.dead);

  // 敌人下移 + 越防线
  for (const e of g.enemies.slice()) {
    const spd = (80*SQ_ENEMY[e.type].spdCoef)/L.DH*screenHeight;
    e.y += spd*dsec;
    if (e.y - e.r >= L.defLineY) { sqBreach(e); e.dead = true; }
  }
  g.enemies = g.enemies.filter(e=>!e.dead);

  // 符咒下落 + 玩家触碰拾取（60px/s）
  for (const o of g.orbs.slice()) {
    o.y += (60/L.DH)*screenHeight*dsec;
    const dx=o.x-g.playerX, dy=o.y-g.playerY, rr=(g.radius+o.r);
    if (dx*dx+dy*dy <= rr*rr) { sqPickAffix(o); o.dead = true; }
    if (o.y > screenHeight+20) o.dead = true;
  }
  g.orbs = g.orbs.filter(o=>!o.dead);

  // 飘字
  for (const f of g.floats) { f.y -= 30*dsec; f.life -= dsec; }
  g.floats = g.floats.filter(f=>f.life>0);

  sqSpawnWaves(dsec);
  if (g.shake > 0) g.shake -= dsec;

  if (g.lineHP <= 0) { g.gameOver = true; sqSaveBest(); }
  if (g.spawnedAll && g.enemies.length === 0) { g.win = true; sqSaveBest(); }
}

function sqDamageChest(c, dmg) {
  const g = gSq;
  let dealt = dmg;
  if (c.type === 'ice' && !g.breakArmor) {
    dealt = Math.max(1, c.hpMax*0.01);
    c.shieldAcc += dealt;
    if (c.shieldAcc >= c.hpMax*0.10) c.brokenShield = true;
  }
  c.hp -= dealt;
  if (c.hp <= 0 && !c.broken) { c.broken = true; sqBreakChest(c); }
}

function sqBreakChest(c) {
  const g = gSq;
  g.chestsBroken++; g.score += 50;
  if (g.faction === 'xian') { g.lineHP = Math.min(g.lineHPMax, g.lineHP+1); g.lineShield += 1; }
  // 限时宝箱倒计时结束降级（蓝→绿 / 金→蓝），血量不变（L1 无，逻辑预留）
  let drop = c.drop;
  const qs = Object.keys(drop);
  let r = Math.random(), acc = 0, q = qs[0];
  for (const k of qs) { acc += drop[k]; if (r <= acc) { q = k; break; } }
  const pool = SQ_AFFIX_POOL[q];
  const aff = pool[Math.floor(Math.random()*pool.length)];
  if (c.type === 'dragon') { g.factionChoice = true; g.pendingFactionAffix = { q, aff }; return; }
  g.orbs.push({ x:c.x, y:c.y, r:14, q, aff });
}

function sqPickAffix(o) {
  const g = gSq;
  o.aff.apply(g);
  // 仙道：每碎宝箱回1生命+1护盾（已在 sqBreakChest 处理）；此处仅结算
  g.score += 20;
  g.floats.push({ x:o.x, y:o.y, text:o.aff.name, color:SQ_QUALITY[o.q].color, life:0.9 });
}

function sqDamageEnemy(e, dmg, crit) {
  const g = gSq;
  let dd = dmg;
  if (g.breakArmor && e.type === 'armor') dd *= 1.5;
  e.hp -= dd;
  g.floats.push({ x:e.x, y:e.y-10, text:Math.round(dd)+(crit?'!':''), color:crit?'#ffd700':'#fff', life:0.5 });
  if (e.hp <= 0 && !e.dead) {
    e.dead = true; g.kills++; g.score += 10;
    if (g.faction === 'mo' && Math.random() < 0.10) g.lineHP = Math.min(g.lineHPMax, g.lineHP+1);
  }
}

function sqExplode(e, dmg) {
  const g = gSq;
  const R = (120/L.DH)*screenHeight;
  for (const o of g.enemies.slice()) {
    if (o === e || o.dead) continue;
    const dx=o.x-e.x, dy=o.y-e.y;
    if (dx*dx+dy*dy <= (R+o.r)*(R+o.r)) sqDamageEnemy(o, dmg, false);
  }
}

function sqBreach(e) {
  const g = gSq;
  let rem = SQ_ENEMY[e.type].breach * (g.faction === 'mo' ? 1.5 : 1);
  if (g.lineShield > 0) { const a = Math.min(g.lineShield, rem); g.lineShield -= a; rem -= a; }
  if (rem > 0) g.lineHP -= rem;
  g.shake = 0.25;
}

function sqSpawnWaves(dsec) {
  const g = gSq;
  g.waveTimer += dsec;
  for (const w of g.waves) {
    if (!w.done && g.waveTimer >= w.t) { sqSpawnWave(w.list); w.done = true; }
  }
  if (g.waves.every(w=>w.done)) {
    if (g.loopCount < g.loop.count) {
      g.loopTimer += dsec;
      if (g.loopTimer >= g.loop.interval) {
        g.loopTimer = 0; g.loopCount++;
        const hpMul = Math.min(g.loop.hpCap, Math.pow(g.loop.hpMul, g.loopCount));
        const cntMul = Math.pow(1.15, g.loopCount);
        const list = g.loop.list.map(en=>({ type:en.type, count:Math.round(en.count*cntMul), hp:Math.round(en.hp*hpMul) }));
        sqSpawnWave(list);
      }
    } else {
      g.spawnedAll = true;
    }
  }
}

function sqSpawnWave(list) {
  const g = gSq, L = sqLayout();
  let idc = g.enemyId;
  for (const e of list) {
    for (let i=0;i<e.count;i++) {
      const x = L.enemyX0 + Math.random()*(L.enemyX1-L.enemyX0);
      const y = -20 - Math.random()*120;
      g.enemies.push({ id:idc++, type:e.type, x, y, r:SQ_ENEMY[e.type].r, hp:e.hp, hpMax:e.hp });
    }
  }
  g.enemyId = idc;
}

function sqApplyFaction(f) {
  const g = gSq;
  g.faction = f; g.factionChoice = false;
  if (f === 'xian') {
    g.attack *= 1.12; g.attackPct += 0.12; g.interval *= 0.88; // 全属性 +12%
    g.lineHP = Math.min(g.lineHPMax, g.lineHP+1); g.lineShield += 1;
  } else {
    g.attackPct += 0.45; g.interval *= 0.80; // 攻击+45% 攻速+20%
  }
  if (g.pendingFactionAffix) {
    g.orbs.push({ x:g.playerX, y:g.playerY-40, r:14, q:g.pendingFactionAffix.q, aff:g.pendingFactionAffix.aff });
    g.pendingFactionAffix = null;
  }
}

function sqSaveBest() {
  const g = gSq;
  if (g.score > gSqBest) {
    gSqBest = g.score;
    try { if (wx.setStorageSync) wx.setStorageSync('sqBest', gSqBest); } catch(e) {}
  }
}

function drawFactionBtn(b, title, desc) {
  ctx.fillStyle = 'rgba(78,168,255,0.25)';
  roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
  ctx.strokeStyle = '#4ea8ff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(title, b.x+b.w/2, b.y+24);
  ctx.font = '12px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(desc, b.x+b.w/2, b.y+48);
  ctx.textBaseline = 'alphabetic';
}

function drawMiniGameSq() {
  if (!gSq) { drawBackground(); return; }
  const g = gSq, L = sqLayout();
  const now = Date.now();
  const dsec = Math.min((now - g.lastTick)/1000, 0.05);
  g.lastTick = now;
  sqUpdate(dsec);

  drawBackground();

  ctx.save();
  if (g.shake > 0) { const s = g.shake*10; ctx.translate((Math.random()-0.5)*s, (Math.random()-0.5)*s); }

  // 防御线
  ctx.strokeStyle = 'rgba(255,80,80,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([10,8]);
  ctx.beginPath(); ctx.moveTo(0, L.defLineY); ctx.lineTo(screenWidth, L.defLineY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,80,80,0.7)'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('⚠ 防线', screenWidth/2, L.defLineY-4);

  // 宝箱
  for (const c of g.chests) {
    if (c.broken) continue;
    ctx.fillStyle = SQ_CHEST[c.type].color;
    roundRect(ctx, c.x-c.w/2, c.y-c.h/2, c.w, c.h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    const hpFrac = Math.max(0, c.hp/c.hpMax);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(c.x-c.w/2, c.y-c.h/2-8, c.w, 5);
    ctx.fillStyle = '#7CFC00'; ctx.fillRect(c.x-c.w/2, c.y-c.h/2-8, c.w*hpFrac, 5);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(SQ_CHEST[c.type].name, c.x, c.y);
    if (c.type === 'ice' && !c.brokenShield) { ctx.fillStyle = 'rgba(127,212,255,0.95)'; ctx.fillText('冰盾', c.x, c.y+14); }
    if (c.type === 'timed') { ctx.fillStyle = '#fff'; ctx.fillText(Math.ceil(c.timer)+'s', c.x, c.y+14); }
  }

  // 敌人
  for (const e of g.enemies) {
    ctx.fillStyle = SQ_ENEMY[e.type].color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    const f = Math.max(0, e.hp/e.hpMax);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(e.x-e.r, e.y-e.r-6, e.r*2, 4);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(e.x-e.r, e.y-e.r-6, e.r*2*f, 4);
  }

  // 子弹
  ctx.fillStyle = '#ffe066';
  for (const b of g.bullets) ctx.fillRect(b.x-2, b.y-8, 4, 12);

  // 符咒
  for (const o of g.orbs) {
    ctx.fillStyle = SQ_QUALITY[o.q].color;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  // 玩家
  ctx.fillStyle = '#4ea8ff';
  ctx.beginPath(); ctx.arc(g.playerX, g.playerY, g.radius, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(g.playerX, g.playerY-g.radius); ctx.lineTo(g.playerX, g.playerY-g.radius-10); ctx.stroke();

  // 飘字
  for (const f of g.floats) {
    ctx.fillStyle = f.color; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = Math.min(1, f.life*2); ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
  }

  ctx.restore();

  // 顶部 HUD
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('守桥射击', L.margin, 22);
  const barX = L.margin, barY = 30, barW = screenWidth*0.5, barH = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, barX, barY, barW, barH, 6); ctx.fill();
  const hpFrac = Math.max(0, Math.min(1, g.lineHP/g.lineHPMax));
  ctx.fillStyle = '#ff4d4d'; roundRect(ctx, barX, barY, barW*hpFrac, barH, 6); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '11px Arial';
  ctx.fillText('防线 '+Math.ceil(Math.max(0,g.lineHP))+'/'+g.lineHPMax+'  护盾'+g.lineShield, barX+4, barY+10);
  const scoreW = (screenWidth - L.margin*2 - 10)/2;
  drawScoreBox(L.margin, 48, scoreW, 34, '攻击', Math.round(g.attack*(1+g.attackPct)));
  drawScoreBox(L.margin+scoreW+10, 48, scoreW, 34, '得分', g.score);

  // 阵营选择遮罩
  if (g.factionChoice) {
    ctx.fillStyle = 'rgba(15,27,45,0.9)'; ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('金龙现世 · 选择阵营', screenWidth/2, screenHeight*0.3);
    const bw = screenWidth*0.72, bh = 70, bx = (screenWidth-bw)/2;
    const xianBtn = { x:bx, y:screenHeight*0.42, w:bw, h:bh };
    const moBtn = { x:bx, y:screenHeight*0.42+bh+20, w:bw, h:bh };
    g.factionBtns = { xian:xianBtn, mo:moBtn };
    drawFactionBtn(xianBtn, '仙道', '全属性+12% · 碎箱回血回盾 · 稳健');
    drawFactionBtn(moBtn, '魔道', '攻击+45% 攻速+20% · 击杀回血 · 受创+50%');
  }

  // 胜利 / 失败遮罩（按钮最后画，置顶）
  if (g.win || g.gameOver) {
    ctx.fillStyle = 'rgba(15,27,45,0.86)'; ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.fillStyle = g.win ? '#7CFC00' : '#ff5656'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(g.win ? '过关！' : '防线失守', screenWidth/2, screenHeight/2-18);
    ctx.fillStyle = '#fff'; ctx.font = '15px Arial';
    ctx.fillText('得分 '+g.score+' · 历史最高 '+gSqBest, screenWidth/2, screenHeight/2+12);
    ctx.fillText(g.win ? '（第1关 · 后续关卡开发中）' : '点「↻ 重玩」再来一局', screenWidth/2, screenHeight/2+36);
    ctx.textBaseline = 'alphabetic';
  }

  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 重玩', 'green');
}

function handleMiniGameSqInput(x, y) {
  if (!gSq) return;
  const L = sqLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); sqInit(); return; }
  if (gSq.gameOver || gSq.win) return;
  if (gSq.factionChoice) {
    if (gSq.factionBtns) {
      if (inRect(x, y, gSq.factionBtns.xian)) sqApplyFaction('xian');
      else if (inRect(x, y, gSq.factionBtns.mo)) sqApplyFaction('mo');
    }
    return;
  }
  gSq.playerX = Math.max(gSq.radius, Math.min(screenWidth - gSq.radius, x));
}


function startMiniGame(game) {
    ensureMiniGameStatsLoaded();
    if (game.id === '2048') {
        g2048Init();
        activeMiniGame = '2048';
        otherGamesModal.show = false;
    } else if (game.id === 'qmxzfzm') {
        gQmxzInit();
        activeMiniGame = 'qmxzfzm';
        otherGamesModal.show = false;
    } else if (game.id === 'bdsjm') {
        gBdsjmInit();
        activeMiniGame = 'bdsjm';
        otherGamesModal.show = false;
    } else if (game.id === 'beishumen') {
        sqInit();
        activeMiniGame = 'beishumen';
        otherGamesModal.show = false;
    } else if (game.id === 'qiexigua') {
        gQiexiguaInit();
        activeMiniGame = 'qiexigua';
        otherGamesModal.show = false;
    } else if (game.id === 'feidegenggao') {
        gFeidegenggaoInit();
        activeMiniGame = 'feidegenggao';
        otherGamesModal.show = false;
    } else if (game.id === 'bunengsi') {
        gBunengsiInit();
        activeMiniGame = 'bunengsi';
        otherGamesModal.show = false;
    } else if (game.id === 'xiaoniaofeifei') {
        gXnfInit();
        activeMiniGame = 'xiaoniaofeifei';
        otherGamesModal.show = false;
    } else if (game.id === 'zuiqiangyanli') {
        gZqylInit();
        activeMiniGame = 'zuiqiangyanli';
        otherGamesModal.show = false;
    } else if (game.id === 'qingwa') {
        gQingwaInit(1);
        activeMiniGame = 'qingwa';
        otherGamesModal.show = false;
    } else if (game.id === 'sqsdscj') {
        gSqsdInit();
        activeMiniGame = 'sqsdscj';
        otherGamesModal.show = false;
    } else if (game.id === 'shenjingmao') {
        gSjmaoInit();
        activeMiniGame = 'shenjingmao';
        otherGamesModal.show = false;
    } else if (game.id === 'yibihua') {
        gYbhInit();
        activeMiniGame = 'yibihua';
        otherGamesModal.show = false;
    } else if (game.id === 'sheqiu') {
        gDlsqInit();
        activeMiniGame = 'sheqiu';
        otherGamesModal.show = false;
    }
    // 记录会话开始时间，用于累计游玩时长
    miniGameSessionStart = Date.now();
    miniGameLastFlush = Date.now();
}

// ==================== 内嵌小游戏：全民寻找房祖名 ====================
// 移植自 HTML5 版「全民寻找房祖名」：网格里铺满干扰图(fanfalse)，随机藏一个房祖名(fantrue)，
// 其底色比周围略亮，点中即过关，网格随关卡变大、色差变小（更难）。总时长 60 秒，时间到结算，
// 得分 = 找到房祖名的次数（即到达的关卡数 lv）。
function loadQmxzImgs() {
    if (qmxzImgsLoaded) return;
    qmxzTrueImg = wx.createImage(); qmxzTrueImg.src = 'images/qmxz_true.png';
    qmxzFalseImg = wx.createImage(); qmxzFalseImg.src = 'images/qmxz_false.png';
    qmxzImgsLoaded = true;
}
function loadSqsdMoneyImg() {
    if (sqsdMoneyLoaded) return;
    sqsdMoneyImg = wx.createImage(); sqsdMoneyImg.src = 'images/sqsdscj_money.png';
    sqsdMoneyLoaded = true;
}

function gQmxzColor(max) {
    const r = Math.round(Math.random() * max);
    const g = Math.round(Math.random() * max);
    const b = Math.round(Math.random() * max);
    return [r, g, b];
}

function gQmxzTargetColor(rgb) {
    const d = (qmxz && qmxz.diff) || 100;
    const clamp = (v) => Math.max(0, Math.min(255, v + d + 10));
    return [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])];
}

function gQmxzStart() {
    qmxz.lv += 1;
    const n = QMXZ_COLOR_LVMAP[qmxz.lv] || QMXZ_COLOR_LVMAP[QMXZ_COLOR_LVMAP.length - 1];
    qmxz.gridN = n;
    // 难度：色差随网格变大而变小，高关卡进一步收紧
    let d = 15 * Math.max(9 - n, 1);
    if (qmxz.lv > 20) d = 10;
    if (qmxz.lv > 40) d = 8;
    if (qmxz.lv > 50) d = 5;
    qmxz.diff = d;
    const base = gQmxzColor(255 - d);
    const tgt = gQmxzTargetColor(base);
    qmxz.baseColor = 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')';
    qmxz.targetColor = 'rgb(' + tgt[0] + ',' + tgt[1] + ',' + tgt[2] + ')';
    const total = n * n;
    qmxz.targetIdx = Math.floor(Math.random() * total);
    qmxz.lastTick = Date.now();
}

function gQmxzInit() {
    loadQmxzImgs();
    qmxz = {
        lv: -1, timeLeft: QMXZ_ALL_TIME, gameOver: false,
        gridN: 2, diff: 100, baseColor: '#888', targetColor: '#aaa',
        targetIdx: 0, lastTick: Date.now()
    };
    try { qmxzBest = (wx.getStorageSync && wx.getStorageSync('qmxzBest')) || 0; } catch (e) { qmxzBest = 0; }
    gQmxzStart();
}

function gQmxzLayout() {
    const margin = 15;
    // 分层：标题 → 状态栏(找到/时间) → 图片网格 → 底部按钮
    const titleY = SAFE_TOP_OFFSET + 10;          // 标题行基线
    const rowB = titleY + 34;                     // 状态栏(找到/剩余时间) 顶边，标题下方留 14px
    const boardTop = rowB + 44;                   // 网格顶边，状态栏(h=32)下方留 12px
    const maxBoard = Math.min(screenWidth - margin * 2, 420);
    const boardW = maxBoard;
    const boardX = (screenWidth - boardW) / 2;
    const bottomY = screenHeight - 16 - 32;       // 返回/新游戏按钮固定在底部
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    return { margin: margin, titleY: titleY, boardX: boardX, boardY: boardTop, boardW: boardW, rowB: rowB, backBtn: backBtn, restartBtn: restartBtn };
}

function drawQmxzCell(cx, cy, size, isTarget, baseColor, targetColor, img) {
    ctx.fillStyle = isTarget ? targetColor : baseColor;
    roundRect(ctx, cx, cy, size, size, 6);
    ctx.fill();
    if (img && img.width) {
        ctx.save();
        roundRect(ctx, cx, cy, size, size, 6);
        ctx.clip();
        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, cx, cy, size, size);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

function drawMiniGameQmxz() {
    // 主游戏战场背景（夜空+远山+微光）
    drawBackground();

    const L = gQmxzLayout();
    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    // 计时（每帧按真实时间递减）
    if (!qmxz.gameOver) {
        const now = Date.now();
        const dsec = (now - qmxz.lastTick) / 1000;
        qmxz.lastTick = now;
        qmxz.timeLeft -= dsec;
        if (qmxz.timeLeft <= 0) {
            qmxz.timeLeft = 0;
            if (!qmxz.gameOver) MiniGameAudio.play('lose');
            qmxz.gameOver = true;
            if (qmxzBest < qmxz.lv) {
                qmxzBest = qmxz.lv;
                try { if (wx.setStorageSync) wx.setStorageSync('qmxzBest', qmxzBest); } catch (e) {}
            }
        }
    }

    // 标题（独立一行，在状态栏上方）
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('寻找房祖名', L.margin, L.titleY);

    // 分数（找到次数）/ 剩余时间
    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 32, '找到', qmxz.lv);
    // 剩余时间框（卡片风，与主游戏一致；最后 6 秒变红预警）
    ctx.fillStyle = qmxz.timeLeft <= 6 ? 'rgba(255, 68, 68, 0.18)' : ROYALE.panelLight;
    roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6);
    ctx.fill();
    ctx.strokeStyle = qmxz.timeLeft <= 6 ? '#ff4444' : ROYALE.blue;
    ctx.lineWidth = 1.5;
    roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('剩余时间', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 4);
    ctx.fillStyle = qmxz.timeLeft <= 6 ? '#ff6666' : '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.ceil(qmxz.timeLeft) + 's', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 32 - 6);

    // 网格
    const n = qmxz.gridN;
    const gap = 8;
    const cell = (L.boardW - gap * (n + 1)) / n;
    for (let idx = 0; idx < n * n; idx++) {
        const r = Math.floor(idx / n), c = idx % n;
        const cx = L.boardX + gap + c * (cell + gap);
        const cy = L.boardY + gap + r * (cell + gap);
        const isTarget = idx === qmxz.targetIdx;
        const img = isTarget ? qmxzTrueImg : qmxzFalseImg;
        drawQmxzCell(cx, cy, cell, isTarget, qmxz.baseColor, qmxz.targetColor, img);
    }

    // 结算遮罩（只覆盖游戏区，留出底部「返回/新游戏」按钮）
    if (qmxz.gameOver) {
        const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
        ctx.fillStyle = 'rgba(15, 27, 45, 0.82)';
        ctx.fillRect(0, 0, screenWidth, btnTop - 8);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('时间到！', screenWidth / 2, screenHeight / 2 - 40);
        ctx.fillStyle = '#fff';
        ctx.font = '18px Arial';
        ctx.fillText('本次找到 ' + qmxz.lv + ' 次房祖名', screenWidth / 2, screenHeight / 2);
        ctx.fillText('最高纪录 ' + qmxzBest + ' 次', screenWidth / 2, screenHeight / 2 + 28);
        ctx.textBaseline = 'alphabetic';
    }
}

function handleMiniGameQmxzInput(x, y) {
    if (!qmxz) return;
    const L = gQmxzLayout();
    if (inRect(x, y, L.backBtn)) {
        flushMiniGameSeconds();
        activeMiniGame = null;
        otherGamesModal.show = true; // 回到「其他游戏」选择页
        return;
    }
    if (inRect(x, y, L.restartBtn)) {
        flushMiniGameSeconds();
        gQmxzInit();
        return;
    }
    if (qmxz.gameOver) return; // 结算后点格子无效，需点「↻ 新游戏」
    // 判断点击的格子
    const n = qmxz.gridN;
    const gap = 8;
    const cell = (L.boardW - gap * (n + 1)) / n;
    for (let idx = 0; idx < n * n; idx++) {
        const r = Math.floor(idx / n), c = idx % n;
        const cx = L.boardX + gap + c * (cell + gap);
        const cy = L.boardY + gap + r * (cell + gap);
        if (x >= cx && x <= cx + cell && y >= cy && y <= cy + cell) {
            if (idx === qmxz.targetIdx) { MiniGameAudio.play('correct'); gQmxzStart(); } // 找到房祖名 → 下一关
            else { MiniGameAudio.play('wrong'); }
            return;
        }
    }
}

// ==================== 内嵌小游戏：暴打神经猫 ====================
// 移植自 HTML5 版「暴打神经猫」：4 列下落式打猫。神经猫从顶部下落，出现在不同行、随机列；
// 在猫所在行点中猫所在列 → 得分+1、命中反馈（红✕淡出）、新猫从顶部重新下落；在同行走错列 → 游戏结束；
// 猫落到底部行仍未被打中 → 视为漏接，游戏结束。限时 BDSJM_ALL_TIME 秒，时间到结算，得分 = 打爆猫的次数。
function loadBdsjmImgs() {
    if (bdsjmImgsLoaded) return;
    const names = ['images/bdsjm_cat0.jpg', 'images/bdsjm_cat1.jpg', 'images/bdsjm_cat2.jpg'];
    bdsjmCatImgs = names.map((s) => { const im = wx.createImage(); im.src = s; return im; });
    bdsjmImgsLoaded = true;
}

function gBdsjmInit() {
    loadBdsjmImgs();
    bdsjm = {
        score: 0, timeLeft: BDSJM_ALL_TIME, gameOver: false,
        catCol: Math.floor(Math.random() * 4),  // 神经猫所在列 0..3
        catRow: 0,                              // 神经猫所在行（浮点，0=顶行，rows-1=底行），随时间下落
        dropSpeed: 1.1,                         // 下落速度（行/秒），随分数提升
        flashRow: -1, flashCol: -1,             // 最近一次命中的格（用于红✕反馈）
        dropAnim: 1,       // 命中反馈进度 0..1（<1 时显示红✕）
        lastTick: Date.now()
    };
    try { bdsjmBest = (wx.getStorageSync && wx.getStorageSync('bdsjmBest')) || 0; } catch (e) { bdsjmBest = 0; }
}

function gBdsjmLayout() {
    const margin = 15;
    const titleY = SAFE_TOP_OFFSET + 10;
    const rowB = titleY + 34;
    const boardTop = rowB + 44;
    const maxBoard = Math.min(screenWidth - margin * 2, 420);
    const boardW = maxBoard;
    const boardX = (screenWidth - boardW) / 2;
    const gap = 10;
    const cell = (boardW - gap * 5) / 4;
    const bottomY = screenHeight - 16 - 32;
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    // 可见行数（底部目标行 + 上方历史行），按剩余高度算
    const availH = bottomY - 12 - boardTop;
    const rows = Math.max(3, Math.min(6, Math.floor(availH / (cell + gap))));
    return { margin: margin, titleY: titleY, boardX: boardX, boardY: boardTop, boardW: boardW, rowB: rowB, gap: gap, cell: cell, rows: rows, backBtn: backBtn, restartBtn: restartBtn };
}

function gBdsjmCatImg() {
    const ready = bdsjmCatImgs.filter((im) => im && im.width);
    const pool = ready.length ? ready : bdsjmCatImgs;
    return pool[Math.floor(Math.random() * pool.length)];
}

function drawMiniGameBdsjm() {
    drawBackground();
    const L = gBdsjmLayout();
    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    // 计时 + 命中反馈推进
    if (!bdsjm.gameOver) {
        const now = Date.now();
        const dsec = (now - bdsjm.lastTick) / 1000;
        bdsjm.lastTick = now;
        bdsjm.timeLeft -= dsec;
        if (bdsjm.dropAnim < 1) bdsjm.dropAnim = Math.min(1, bdsjm.dropAnim + dsec * 4);
        // 神经猫下落（速度随分数提升）
        bdsjm.dropSpeed = 1.1 + bdsjm.score * 0.05;
        bdsjm.catRow += bdsjm.dropSpeed * dsec;
        if (bdsjm.catRow >= L.rows - 1) {
            // 落到底部仍未被打中 → 漏接，游戏结束
            bdsjm.catRow = L.rows - 1;
            bdsjm.gameOver = true;
            if (bdsjmBest < bdsjm.score) {
                bdsjmBest = bdsjm.score;
                try { if (wx.setStorageSync) wx.setStorageSync('bdsjmBest', bdsjmBest); } catch (e) {}
            }
        }
        if (bdsjm.timeLeft <= 0) {
            bdsjm.timeLeft = 0;
            bdsjm.gameOver = true;
            if (bdsjmBest < bdsjm.score) {
                bdsjmBest = bdsjm.score;
                try { if (wx.setStorageSync) wx.setStorageSync('bdsjmBest', bdsjmBest); } catch (e) {}
            }
        }
    }

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('暴打神经猫', L.margin, L.titleY);

    // 状态栏：打爆 / 剩余时间
    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 32, '打爆', bdsjm.score);
    ctx.fillStyle = bdsjm.timeLeft <= 6 ? 'rgba(255, 68, 68, 0.18)' : ROYALE.panelLight;
    roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6);
    ctx.fill();
    ctx.strokeStyle = bdsjm.timeLeft <= 6 ? '#ff4444' : ROYALE.blue;
    ctx.lineWidth = 1.5;
    roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('剩余时间', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 4);
    ctx.fillStyle = bdsjm.timeLeft <= 6 ? '#ff6666' : '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.ceil(bdsjm.timeLeft) + 's', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 32 - 6);

    // 网格（4 列 × rows 行）普通块
    for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < 4; c++) {
            const cx = L.boardX + L.gap + c * (L.cell + L.gap);
            const cy = L.boardY + L.gap + r * (L.cell + L.gap);
            // 命中反馈：在最近命中的格画红✕
            const justHit = (r === bdsjm.flashRow && c === bdsjm.flashCol && bdsjm.dropAnim < 1);
            ctx.fillStyle = justHit ? 'rgba(255, 68, 68, 0.5)' : ROYALE.panelLight;
            roundRect(ctx, cx, cy, L.cell, L.cell, 8);
            ctx.fill();
            ctx.strokeStyle = 'rgba(125,175,225,0.4)';
            ctx.lineWidth = 1;
            roundRect(ctx, cx, cy, L.cell, L.cell, 8);
            ctx.stroke();
            if (justHit) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx + L.cell * 0.3, cy + L.cell * 0.3);
                ctx.lineTo(cx + L.cell * 0.7, cy + L.cell * 0.7);
                ctx.moveTo(cx + L.cell * 0.7, cy + L.cell * 0.3);
                ctx.lineTo(cx + L.cell * 0.3, cy + L.cell * 0.7);
                ctx.stroke();
            }
        }
    }
    // 神经猫（浮点行位置，平滑下落），单独绘制在普通块之上
    {
        const cx = L.boardX + L.gap + bdsjm.catCol * (L.cell + L.gap);
        const cy = L.boardY + L.gap + bdsjm.catRow * (L.cell + L.gap);
        ctx.fillStyle = ROYALE.panel;
        roundRect(ctx, cx, cy, L.cell, L.cell, 8);
        ctx.fill();
        ctx.strokeStyle = ROYALE.gold;
        ctx.lineWidth = 2;
        roundRect(ctx, cx, cy, L.cell, L.cell, 8);
        ctx.stroke();
        const im = gBdsjmCatImg();
        if (im && im.width) {
            ctx.save();
            roundRect(ctx, cx, cy, L.cell, L.cell, 8);
            ctx.clip();
            ctx.drawImage(im, cx, cy, L.cell, L.cell);
            ctx.restore();
        }
    }

    // 结算遮罩（只覆盖游戏区，留出底部「返回/新游戏」按钮）
    if (bdsjm.gameOver) {
        const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
        ctx.fillStyle = 'rgba(15, 27, 45, 0.82)';
        ctx.fillRect(0, 0, screenWidth, btnTop - 8);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('时间到！', screenWidth / 2, screenHeight / 2 - 40);
        ctx.fillStyle = '#fff';
        ctx.font = '18px Arial';
        ctx.fillText('打爆 ' + bdsjm.score + ' 只神经猫', screenWidth / 2, screenHeight / 2);
        ctx.fillText('最高纪录 ' + bdsjmBest + ' 只', screenWidth / 2, screenHeight / 2 + 28);
        ctx.textBaseline = 'alphabetic';
    }
}

function handleMiniGameBdsjmInput(x, y) {
    if (!bdsjm) return;
    const L = gBdsjmLayout();
    if (inRect(x, y, L.backBtn)) {
        flushMiniGameSeconds();
        activeMiniGame = null;
        otherGamesModal.show = true;
        return;
    }
    if (inRect(x, y, L.restartBtn)) {
        flushMiniGameSeconds();
        gBdsjmInit();
        return;
    }
    if (bdsjm.gameOver) return;
    // 响应猫所在行的点击；其他行点击忽略，猫所在行走错列 → 游戏结束
    const cx0 = L.boardX + L.gap;
    const cy0 = L.boardY + L.gap;
    const col = Math.floor((x - cx0) / (L.cell + L.gap));
    const row = Math.floor((y - cy0) / (L.cell + L.gap));
    const catRowInt = Math.round(bdsjm.catRow);
    if (row < 0 || row >= L.rows || col < 0 || col >= 4) return; // 点击棋盘外（含间隙）→ 忽略
    if (row === catRowInt && col === bdsjm.catCol) {
        // 命中：得分，红✕反馈在命中格，新猫从顶部重新下落
        MiniGameAudio.play('hit');
        bdsjm.score += 1;
        bdsjm.flashRow = catRowInt;
        bdsjm.flashCol = bdsjm.catCol;
        bdsjm.catCol = Math.floor(Math.random() * 4);
        bdsjm.catRow = 0;
        bdsjm.dropAnim = 0; // 触发命中反馈
    } else if (row === catRowInt) {
        // 同行走错列 → 游戏结束
        MiniGameAudio.play('wrong');
        bdsjm.gameOver = true;
        if (bdsjmBest < bdsjm.score) {
            bdsjmBest = bdsjm.score;
            try { if (wx.setStorageSync) wx.setStorageSync('bdsjmBest', bdsjmBest); } catch (e) {}
        }
    }
    // row !== catRowInt（点其他行）→ 忽略，不算失误
}

// ==================== 内嵌小游戏：忍者切水果 ====================
// 纯 Canvas 重写经典「水果忍者」玩法：水果/炸弹从底部抛出做抛物线运动，
// 手指滑动的轨迹线段切中水果 → 得分（连击加成），切中炸弹 → 游戏结束；限时 QX_ALL_TIME 秒，时间到结算。
const QX_ALL_TIME = 60;
let gQiexigua = null;
let gQiexiguaBest = 0;

const QX_FRUITS = ['🍉', '🍎', '🍊', '🍋', '🍓', '🍌', '🍇', '🍑'];
const QX_FRUIT_COLORS = ['#ff5e7e', '#ff4d4d', '#ff9f43', '#feca57', '#ff6b81', '#f6e58d', '#a55eea', '#ff9ff3'];

function gQiexiguaInit() {
    gQiexigua = {
        score: 0,
        timeLeft: QX_ALL_TIME,
        gameOver: false,
        fruits: [],
        particles: [],
        floaters: [],
        spawnTimer: 0.6,
        spawnInterval: 0.85,
        combo: 0,
        comboTimer: 0,
        trail: [],
        lastSlice: null,
        lastTick: Date.now()
    };
    try { gQiexiguaBest = (wx.getStorageSync && wx.getStorageSync('gQiexiguaBest')) || 0; } catch (e) { gQiexiguaBest = 0; }
}

function gQiexiguaSpawn() {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
        const isBomb = Math.random() < 0.15;
        const r = 26 + Math.random() * 10;
        const x = 40 + Math.random() * (screenWidth - 80);
        const G = 1500; // 与 gQiexiguaUpdate 中重力一致
        const spawnY = screenHeight + r + 10;
        const peakY = screenHeight * (0.15 + Math.random() * 0.25); // 最高点落在屏幕 15%~40% 处（上半部分）
        const vy = -Math.sqrt(2 * G * (spawnY - peakY));
        const vx = (Math.random() - 0.5) * 360;
        gQiexigua.fruits.push({
            bomb: isBomb,
            emoji: isBomb ? '💣' : QX_FRUITS[Math.floor(Math.random() * QX_FRUITS.length)],
            color: isBomb ? '#2d3436' : QX_FRUIT_COLORS[Math.floor(Math.random() * QX_FRUIT_COLORS.length)],
            x: x, y: screenHeight + r + 10,
            vx: vx, vy: vy, r: r,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 6,
            alive: true
        });
    }
}

function gQiexiguaUpdate(dt) {
    const g = gQiexigua;
    g.timeLeft -= dt;
    if (g.timeLeft <= 0) {
        g.timeLeft = 0; if (!g.gameOver) MiniGameAudio.play('lose'); g.gameOver = true;
        if (gQiexiguaBest < g.score) { gQiexiguaBest = g.score; try { wx.setStorageSync('gQiexiguaBest', gQiexiguaBest); } catch (e) {} }
        return;
    }
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
        gQiexiguaSpawn();
        g.spawnInterval = Math.max(0.42, 0.85 - g.score * 0.006);
        g.spawnTimer = g.spawnInterval * (0.8 + Math.random() * 0.4);
    }
    const G = 1500;
    for (const f of g.fruits) {
        if (!f.alive) continue;
        f.vy += G * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.y > screenHeight + f.r * 2.5) f.alive = false;
    }
    if (g.combo > 0) { g.comboTimer -= dt; if (g.comboTimer <= 0) g.combo = 0; }
    for (const p of g.particles) { p.vy += G * 0.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    g.particles = g.particles.filter(p => p.life > 0);
    for (const fl of g.floaters) { fl.y -= 40 * dt; fl.life -= dt; }
    g.floaters = g.floaters.filter(fl => fl.life > 0);
    g.fruits = g.fruits.filter(f => f.alive);
    if (g.trail.length) { for (const t of g.trail) t.life -= dt; g.trail = g.trail.filter(t => t.life > 0); }
}

function gPointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function gQiexiguaSlice(x, y) {
    const g = gQiexigua;
    if (!g || g.gameOver) return;
    const last = g.lastSlice;
    g.lastSlice = { x, y };
    g.trail.push({ x, y, life: 0.18 });
    if (g.trail.length > 16) g.trail.shift();
    if (!last) return;
    for (const f of g.fruits) {
        if (!f.alive) continue;
        if (gPointSegDist(f.x, f.y, last.x, last.y, x, y) <= f.r + 6) {
            if (f.bomb) {
                MiniGameAudio.play('wrong');
                g.gameOver = true;
                if (gQiexiguaBest < g.score) { gQiexiguaBest = g.score; try { wx.setStorageSync('gQiexiguaBest', gQiexiguaBest); } catch (e) {} }
                return;
            }
            f.alive = false;
            MiniGameAudio.play('slash');
            g.combo += 1;
            g.comboTimer = 0.6;
            const gain = g.combo > 1 ? g.combo : 1;
            g.score += gain;
            for (let i = 0; i < 8; i++) {
                const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 220;
                g.addParticle({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.5 + Math.random() * 0.3, color: f.color, r: 3 + Math.random() * 4 });
            }
            g.floaters.push({ x: f.x, y: f.y - f.r, text: '+' + gain + (g.combo > 1 ? (' x' + g.combo) : ''), life: 0.8, color: '#ffd700' });
        }
    }
}

function gQiexiguaLayout() {
    const margin = 15;
    const titleY = SAFE_TOP_OFFSET + 10;
    const rowB = titleY + 34;
    const boardX = margin;
    const boardW = screenWidth - margin * 2;
    const boardY = rowB + 44;
    const bottomY = screenHeight - 16 - 32;
    const boardH = bottomY - 12 - boardY;
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    return { margin, titleY, rowB, boardX, boardW, boardY, boardH, backBtn, restartBtn };
}

function drawMiniGameQiexigua() {
    drawBackground();
    const L = gQiexiguaLayout();
    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    if (!gQiexigua.gameOver) {
        const now = Date.now();
        const dt = Math.min(0.05, (now - gQiexigua.lastTick) / 1000);
        gQiexigua.lastTick = now;
        gQiexiguaUpdate(dt);
    }

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('忍者切水果', L.margin, L.titleY);

    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 32, '分数', gQiexigua.score);
    ctx.fillStyle = gQiexigua.timeLeft <= 10 ? 'rgba(255,68,68,0.18)' : ROYALE.panelLight;
    roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6); ctx.fill();
    ctx.strokeStyle = gQiexigua.timeLeft <= 10 ? '#ff4444' : ROYALE.blue;
    ctx.lineWidth = 1.5; roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6); ctx.stroke();
    ctx.fillStyle = '#aaa'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('剩余时间', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 4);
    ctx.fillStyle = gQiexigua.timeLeft <= 10 ? '#ff6666' : '#fff';
    ctx.font = 'bold 16px Arial'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.ceil(gQiexigua.timeLeft) + 's', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 32 - 6);

    ctx.save();
    roundRect(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10); ctx.clip();

    for (const f of gQiexigua.fruits) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.fillStyle = f.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(0, 0, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = (f.r * 1.8) + 'px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.emoji, 0, 2);
        ctx.restore();
    }
    for (const p of gQiexigua.particles) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (gQiexigua.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let i = 1; i < gQiexigua.trail.length; i++) {
            const a = gQiexigua.trail[i - 1], b = gQiexigua.trail[i];
            ctx.globalAlpha = Math.max(0, b.life * 4);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    for (const fl of gQiexigua.floaters) {
        ctx.globalAlpha = Math.max(0, fl.life);
        ctx.fillStyle = fl.color; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (gQiexigua.combo > 1 && !gQiexigua.gameOver) {
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText('连击 x' + gQiexigua.combo, screenWidth / 2, L.boardY + 8);
    }

    if (gQiexigua.gameOver) {
        ctx.fillStyle = 'rgba(15,27,45,0.82)';
        ctx.fillRect(0, L.boardY, screenWidth, L.boardH);
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('时间到！', screenWidth / 2, L.boardY + L.boardH / 2 - 40);
        ctx.fillStyle = '#fff'; ctx.font = '18px Arial';
        ctx.fillText('切了 ' + gQiexigua.score + ' 个水果', screenWidth / 2, L.boardY + L.boardH / 2);
        ctx.fillText('最高纪录 ' + gQiexiguaBest + ' 个', screenWidth / 2, L.boardY + L.boardH / 2 + 28);
        ctx.textBaseline = 'alphabetic';
    }
}

function handleMiniGameQiexiguaInput(x, y) {
    if (!gQiexigua) return;
    gQiexigua.lastSlice = null;
    const L = gQiexiguaLayout();
    if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
    if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gQiexiguaInit(); return; }
}

// ===================== 我要飞的更高（竖向自动弹跳爬升，SKY JUMP 玩法） =====================
let gFeidegenggao = null;
let gFeidegenggaoBest = 0;

const FD_PLAY_TIME = 60;
const FD_GRAVITY = 1500;
const FD_BOUNCE = -640;
const FD_PLAT_COUNT = 9;
const FD_SPACING = 100;
const FD_PLAT_COLORS = ['#7ed957', '#ffd166', '#4cc9f0', '#f72585', '#b5179e', '#ff9e00', '#90be6d', '#577590', '#f9844a'];

function gFeidegenggaoSaveBest(g) {
    if (gFeidegenggaoBest < g.score) {
        gFeidegenggaoBest = g.score;
        try { wx.setStorageSync && wx.setStorageSync('gFeidegenggaoBest', gFeidegenggaoBest); } catch (e) {}
    }
}

function gFeidegenggaoLayout() {
    const margin = 15;
    const titleY = SAFE_TOP_OFFSET + 10;
    const rowB = titleY + 34;
    const boardX = margin;
    const boardW = screenWidth - margin * 2;
    const boardY = rowB + 44;
    const bottomY = screenHeight - 16 - 32;
    const boardH = bottomY - 12 - boardY;
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    return { margin, titleY, rowB, boardX, boardW, boardY, boardH, backBtn, restartBtn };
}

function gFeidegenggaoInit() {
    gFeidegenggao = {
        score: 0,
        climb: 0,
        timeLeft: FD_PLAY_TIME,
        gameOver: false,
        overReason: '',
        player: { x: screenWidth / 2, y: 0, vy: 0, r: 16, targetX: screenWidth / 2 },
        platforms: [],
        particles: [],
        lastTick: Date.now()
    };
    try { gFeidegenggaoBest = (wx.getStorageSync && wx.getStorageSync('gFeidegenggaoBest')) || 0; } catch (e) { gFeidegenggaoBest = 0; }
    const L = gFeidegenggaoLayout();
    const startY = L.boardY + L.boardH - 60;
    gFeidegenggao.player.y = startY - gFeidegenggao.player.r;
    gFeidegenggao.player.x = screenWidth / 2;
    gFeidegenggao.player.targetX = screenWidth / 2;
    for (let i = 0; i < FD_PLAT_COUNT; i++) {
        gFeidegenggao.platforms.push({
            x: 30 + Math.random() * (screenWidth - 60),
            y: startY - i * FD_SPACING,
            w: 55 + Math.random() * 30,
            color: FD_PLAT_COLORS[i % FD_PLAT_COLORS.length]
        });
    }
    // 第一块平台必须正好在主角脚下，保证开局即站稳
    gFeidegenggao.platforms[0].x = screenWidth / 2;
    gFeidegenggao.platforms[0].w = Math.max(70, gFeidegenggao.platforms[0].w);
}

function gFeidegenggaoUpdate(dt) {
    const g = gFeidegenggao;
    const L = gFeidegenggaoLayout();
    const playTop = L.boardY;
    const playBottom = L.boardY + L.boardH;
    const targetY = playTop + (playBottom - playTop) * 0.6;
    const p = g.player;

    g.timeLeft -= dt;
    if (g.timeLeft <= 0) { g.timeLeft = 0; if (!g.gameOver) MiniGameAudio.play('lose'); g.gameOver = true; g.overReason = 'time'; gFeidegenggaoSaveBest(g); return; }

    p.vy += FD_GRAVITY * dt;
    const prevFeet = p.y + p.r;
    p.y += p.vy * dt;
    p.x += (p.targetX - p.x) * Math.min(1, dt * 12);
    p.x = Math.max(p.r, Math.min(screenWidth - p.r, p.x));

    if (p.vy > 0) {
        const feet = p.y + p.r;
        for (const pl of g.platforms) {
            if (prevFeet <= pl.y + 2 && feet >= pl.y - 2 && Math.abs(p.x - pl.x) < pl.w / 2 + p.r * 0.6) {
                p.y = pl.y - p.r;
                p.vy = FD_BOUNCE;
                MiniGameAudio.play('jump');
                for (let i = 0; i < 6; i++) {
                    const a = Math.random() * Math.PI * 2;
                    g.addParticle({ x: p.x, y: pl.y, vx: Math.cos(a) * 120, vy: -Math.random() * 120 - 40, life: 0.4, color: '#ffffff' });
                }
                break;
            }
        }
    }

    if (p.y < targetY) {
        const delta = targetY - p.y;
        p.y += delta;
        for (const pl of g.platforms) pl.y += delta;
        for (const pt of g.particles) pt.y += delta;
        g.climb += delta;
        g.score = Math.floor(g.climb * 0.1);
    }

    for (const pl of g.platforms) {
        if (pl.y > playBottom + 40) {
            pl.y -= FD_PLAT_COUNT * FD_SPACING;
            pl.x = 30 + Math.random() * (screenWidth - 60);
            pl.w = 55 + Math.random() * 30;
        }
    }

    for (const pt of g.particles) { pt.vy += FD_GRAVITY * 0.5 * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    g.particles = g.particles.filter(pt => pt.life > 0);

    if (p.y - p.r > playBottom + 30) { if (!g.gameOver) MiniGameAudio.play('lose'); g.gameOver = true; g.overReason = 'fall'; gFeidegenggaoSaveBest(g); }
}

function drawMiniGameFeidegenggao() {
    drawBackground();
    const L = gFeidegenggaoLayout();
    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    if (!gFeidegenggao.gameOver) {
        const now = Date.now();
        const dt = Math.min(0.05, (now - gFeidegenggao.lastTick) / 1000);
        gFeidegenggao.lastTick = now;
        gFeidegenggaoUpdate(dt);
    }

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('我要飞的更高', L.margin, L.titleY);

    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 32, '高度', gFeidegenggao.score);
    ctx.fillStyle = gFeidegenggao.timeLeft <= 10 ? 'rgba(255,68,68,0.18)' : ROYALE.panelLight;
    roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6); ctx.fill();
    ctx.strokeStyle = gFeidegenggao.timeLeft <= 10 ? '#ff4444' : ROYALE.blue;
    ctx.lineWidth = 1.5; roundRect(ctx, L.margin + scoreW + 10, L.rowB, scoreW, 32, 6); ctx.stroke();
    ctx.fillStyle = '#aaa'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('剩余时间', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 4);
    ctx.fillStyle = gFeidegenggao.timeLeft <= 10 ? '#ff6666' : '#fff';
    ctx.font = 'bold 16px Arial'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.ceil(gFeidegenggao.timeLeft) + 's', L.margin + scoreW + 10 + scoreW / 2, L.rowB + 32 - 6);

    ctx.save();
    roundRect(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10); ctx.clip();

    for (const pl of gFeidegenggao.platforms) {
        const px = pl.x - pl.w / 2;
        ctx.fillStyle = pl.color;
        roundRect(ctx, px, pl.y - 8, pl.w, 16, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        roundRect(ctx, px + 4, pl.y - 6, pl.w - 8, 4, 2); ctx.fill();
    }

    const p = gFeidegenggao.player;
    for (const pt of gFeidegenggao.particles) {
        ctx.globalAlpha = Math.max(0, pt.life * 2);
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#ffd54a';
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = (p.r * 1.5) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🐤', 0, 1);
    ctx.restore();

    ctx.restore();

    if (gFeidegenggao.gameOver) {
        ctx.fillStyle = 'rgba(15,27,45,0.82)';
        ctx.fillRect(0, L.boardY, screenWidth, L.boardH);
        ctx.fillStyle = '#ffd700'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(gFeidegenggao.overReason === 'fall' ? '你掉下去了！' : '时间到！', screenWidth / 2, L.boardY + L.boardH / 2 - 40);
        ctx.fillStyle = '#fff'; ctx.font = '18px Arial';
        ctx.fillText('飞到了 ' + gFeidegenggao.score + ' 米', screenWidth / 2, L.boardY + L.boardH / 2);
        ctx.fillText('最高纪录 ' + gFeidegenggaoBest + ' 米', screenWidth / 2, L.boardY + L.boardH / 2 + 28);
        ctx.textBaseline = 'alphabetic';
    }
}

function handleMiniGameFeidegenggaoInput(x, y) {
    if (!gFeidegenggao) return;
    const L = gFeidegenggaoLayout();
    if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
    if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gFeidegenggaoInit(); return; }
}

// ===================== 一个都不能死（多跑道跳障碍，任一小人被撞即失败） =====================
let gBunengsi = null;
let gBunengsiBest = 0;

const BNS_LANES = 4;
const BNS_GRAVITY = 2600;
const BNS_JUMP_V = 760;
const BNS_BASE_SPEED = 250;
const BNS_SPEED_GROW = 10;
const BNS_RUNNER_OFFSET = 76;
const BNS_RUNNER_W = 24;
const BNS_RUNNER_H = 30;
const BNS_LANE_TINT = ['rgba(76,201,240,0.10)', 'rgba(247,37,133,0.10)', 'rgba(126,217,87,0.10)', 'rgba(255,209,102,0.10)'];
const BNS_RUNNER_COLORS = ['#4cc9f0', '#f72585', '#7ed957', '#ffd166'];

function gBunengsiSaveBest(g) {
    const sec = Math.floor(g.time);
    if (gBunengsiBest < sec) {
        gBunengsiBest = sec;
        try { wx.setStorageSync && wx.setStorageSync('gBunengsiBest', gBunengsiBest); } catch (e) {}
    }
}

function gBunengsiLayout() {
    const margin = 15;
    const titleY = SAFE_TOP_OFFSET + 10;
    const rowB = titleY + 34;
    const boardX = margin;
    const boardW = screenWidth - margin * 2;
    const boardY = rowB + 44;
    const bottomY = screenHeight - 16 - 32;
    const boardH = bottomY - 12 - boardY;
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    return { margin, titleY, rowB, boardX, boardW, boardY, boardH, backBtn, restartBtn };
}

function gBunengsiInit() {
    gBunengsi = {
        time: 0,
        score: 0,
        gameOver: false,
        deadLane: -1,
        deadFlash: 0,
        hint: 3.5,
        lanes: [],
        particles: [],
        lastTick: Date.now()
    };
    try { gBunengsiBest = (wx.getStorageSync && wx.getStorageSync('gBunengsiBest')) || 0; } catch (e) { gBunengsiBest = 0; }
    const L = gBunengsiLayout();
    // 每条跑道占一个等高「格位」（点击热区），跑道条居中显示在格位里
    const slotH = L.boardH / BNS_LANES;
    const bandH = Math.min(190, slotH - 16);
    for (let i = 0; i < BNS_LANES; i++) {
        const slotTop = L.boardY + slotH * i;
        const bandTop = slotTop + (slotH - bandH) / 2;
        gBunengsi.lanes.push({
            index: i,
            slotTop: slotTop,
            slotH: slotH,
            bandTop: bandTop,
            bandH: bandH,
            groundY: bandTop + bandH - 22,
            off: 0,
            vy: 0,
            jumping: false,
            boxes: [],
            // 各跑道错开首次生成时间，开局不会同时涌来
            spawnTimer: 1.4 + Math.random() * 1.2 + i * 0.45
        });
    }
}

function gBunengsiUpdate(dt) {
    const g = gBunengsi;
    const L = gBunengsiLayout();
    g.time += dt;
    g.score = Math.floor(g.time);
    if (g.hint > 0) g.hint -= dt;

    const speed = BNS_BASE_SPEED + g.time * BNS_SPEED_GROW;
    const spawnBase = Math.max(0.62, 1.7 - g.time * 0.015);
    const runnerX = L.boardX + BNS_RUNNER_OFFSET;
    const rx1 = runnerX - BNS_RUNNER_W / 2;
    const rx2 = runnerX + BNS_RUNNER_W / 2;
    const rightX = L.boardX + L.boardW;

    for (const lane of g.lanes) {
        // 跳跃物理（off 为离地高度，vy 向下为正）
        if (lane.jumping) {
            lane.vy += BNS_GRAVITY * dt;
            lane.off -= lane.vy * dt;
            if (lane.off <= 0) { lane.off = 0; lane.vy = 0; lane.jumping = false; }
        }

        lane.spawnTimer -= dt;
        if (lane.spawnTimer <= 0) {
            lane.boxes.push({ x: rightX + 6, w: 14 + Math.random() * 16, h: 20 + Math.random() * 30 });
            lane.spawnTimer = spawnBase + Math.random() * spawnBase;
        }

        for (let i = lane.boxes.length - 1; i >= 0; i--) {
            const b = lane.boxes[i];
            b.x -= speed * dt;
            if (b.x + b.w < L.boardX - 20) { lane.boxes.splice(i, 1); continue; }
            // 碰撞：障碍横向压住小人 且 小人抬腿高度不够
            if (b.x < rx2 - 3 && b.x + b.w > rx1 + 3 && lane.off < b.h - 3) {
                if (!g.gameOver) MiniGameAudio.play('lose');
                g.gameOver = true;
                g.deadLane = lane.index;
                g.deadFlash = 1;
                const col = BNS_RUNNER_COLORS[lane.index % BNS_RUNNER_COLORS.length];
                for (let k = 0; k < 14; k++) {
                    const a = Math.random() * Math.PI * 2;
                    g.addParticle({
                        x: runnerX, y: lane.groundY - BNS_RUNNER_H / 2,
                        vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 - 80,
                        life: 0.7, color: col
                    });
                }
                gBunengsiSaveBest(g);
                return;
            }
        }
    }

    gBunengsiStepParticles(dt);
}

function gBunengsiStepParticles(dt) {
    const g = gBunengsi;
    for (const pt of g.particles) {
        pt.vy += 900 * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
    }
    g.particles = g.particles.filter(pt => pt.life > 0);
}

function gBunengsiTap(x, y) {
    const g = gBunengsi;
    if (!g || g.gameOver) return;
    const L = gBunengsiLayout();
    if (x < L.boardX || x > L.boardX + L.boardW || y < L.boardY || y > L.boardY + L.boardH) return;
    const laneH = L.boardH / BNS_LANES;
    let idx = Math.floor((y - L.boardY) / laneH);
    idx = Math.max(0, Math.min(BNS_LANES - 1, idx));
    const lane = g.lanes[idx];
    if (lane && !lane.jumping) { lane.jumping = true; lane.vy = -BNS_JUMP_V; MiniGameAudio.play('jump'); }
    g.hint = 0;
}

function drawMiniGameBunengsi() {
    drawBackground();
    const L = gBunengsiLayout();
    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    const now = Date.now();
    const dt = Math.min(0.05, (now - gBunengsi.lastTick) / 1000);
    gBunengsi.lastTick = now;
    if (!gBunengsi.gameOver) {
        gBunengsiUpdate(dt);
    } else {
        gBunengsiStepParticles(dt);
        if (gBunengsi.deadFlash > 0) gBunengsi.deadFlash -= dt * 2;
    }

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('一个都不能死', L.margin, L.titleY);

    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 32, '存活', gBunengsi.time.toFixed(1) + 's');
    drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最高纪录', gBunengsiBest + 's');

    ctx.save();
    roundRect(ctx, L.boardX, L.boardY, L.boardW, L.boardH, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(10,20,36,0.55)';
    ctx.fillRect(L.boardX, L.boardY, L.boardW, L.boardH);

    const runnerX = L.boardX + BNS_RUNNER_OFFSET;

    for (const lane of gBunengsi.lanes) {
        // 跑道条底板
        ctx.fillStyle = BNS_LANE_TINT[lane.index % BNS_LANE_TINT.length];
        roundRect(ctx, L.boardX + 4, lane.bandTop, L.boardW - 8, lane.bandH, 8); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        roundRect(ctx, L.boardX + 4, lane.bandTop, L.boardW - 8, lane.bandH, 8); ctx.stroke();

        if (gBunengsi.gameOver && gBunengsi.deadLane === lane.index && gBunengsi.deadFlash > 0) {
            ctx.fillStyle = 'rgba(255,68,68,' + (0.4 * Math.max(0, gBunengsi.deadFlash)).toFixed(3) + ')';
            roundRect(ctx, L.boardX + 4, lane.bandTop, L.boardW - 8, lane.bandH, 8); ctx.fill();
        }

        // 跑道编号
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('跑道 ' + (lane.index + 1), L.boardX + 14, lane.bandTop + 8);

        // 地面
        ctx.fillStyle = '#0d1729';
        ctx.fillRect(L.boardX + 4, lane.groundY, L.boardW - 8, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(L.boardX + 4, lane.groundY, L.boardW - 8, 2);

        // 障碍
        for (const b of lane.boxes) {
            ctx.fillStyle = '#122036';
            roundRect(ctx, b.x, lane.groundY - b.h, b.w, b.h, 3); ctx.fill();
            ctx.strokeStyle = '#4cc9f0';
            ctx.lineWidth = 1.5;
            roundRect(ctx, b.x, lane.groundY - b.h, b.w, b.h, 3); ctx.stroke();
        }

        // 小人
        const dead = gBunengsi.gameOver && gBunengsi.deadLane === lane.index;
        if (!dead) {
            const bob = lane.jumping ? 0 : Math.sin(gBunengsi.time * 16 + lane.index) * 1.5;
            const cy = lane.groundY - lane.off - BNS_RUNNER_H / 2 + bob;
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.translate(runnerX, lane.groundY + 2);
            ctx.scale(1, 0.28);
            ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            ctx.fillStyle = BNS_RUNNER_COLORS[lane.index % BNS_RUNNER_COLORS.length];
            ctx.beginPath(); ctx.arc(runnerX, cy, BNS_RUNNER_H / 2, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(runnerX, cy, BNS_RUNNER_H / 2, 0, Math.PI * 2); ctx.stroke();
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('🏃', runnerX, cy + 1);
        } else {
            // 阵亡跑道留下墓碑
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('💀', runnerX, lane.groundY - 16);
        }
    }

    for (const pt of gBunengsi.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 1.6));
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (gBunengsi.hint > 0 && !gBunengsi.gameOver) {
        ctx.globalAlpha = Math.min(1, gBunengsi.hint);
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('点哪条跑道，哪个小人就起跳', screenWidth / 2, L.boardY + 24);
        ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (gBunengsi.gameOver) {
        ctx.fillStyle = 'rgba(15,27,45,0.82)';
        ctx.fillRect(0, L.boardY, screenWidth, L.boardH);
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 26px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('第 ' + (gBunengsi.deadLane + 1) + ' 号小人挂了！', screenWidth / 2, L.boardY + L.boardH / 2 - 40);
        ctx.fillStyle = '#fff';
        ctx.font = '18px Arial';
        ctx.fillText('坚持了 ' + gBunengsi.time.toFixed(1) + ' 秒', screenWidth / 2, L.boardY + L.boardH / 2);
        ctx.fillText('最高纪录 ' + gBunengsiBest + ' 秒', screenWidth / 2, L.boardY + L.boardH / 2 + 28);
        ctx.textBaseline = 'alphabetic';
    }
}

function handleMiniGameBunengsiInput(x, y) {
    if (!gBunengsi) return;
    const L = gBunengsiLayout();
    if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
    if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gBunengsiInit(); return; }
}

// ==================== 内嵌小游戏：小鸟飞飞飞 ====================
// 移植自 HTML5 版「小鸟飞飞飞」(Flappy Bird 类)：点击让小鸟向上振翅，重力使其下坠，
// 穿越上下水管之间的缝隙得分，撞管或落地即结束。为保证与原版物理一致，内部用 320×550
// 虚拟坐标系 + 固定步长(0.03s≈33fps) 还原：重力 1.5、起跳冲量 -12、水管速度 -3、间距 57 帧、缝宽 100。
const XNF_VW = 320;
const XNF_VH = 550;
const XNF_FRAME = 0.03;            // 原版定时器节流 30ms
const XNF_GRAVITY = 1.5;           // 逐帧重力 (虚拟 px/帧²)
const XNF_JUMP_V = -12;            // 振翅冲量 (虚拟 px/帧)
const XNF_PIPE_SPEED = -3;         // 水管左移速度 (虚拟 px/帧)
const XNF_PIPE_W = 52;
const XNF_PIPE_H = 320;
const XNF_GAP = 100;               // 缝隙竖直高度
const XNF_GAP_MIN = 60;            // 缝隙顶(b) 随机下界
const XNF_GAP_MAX = 170;           // 缝隙顶(b) 随机上界
const XNF_SPAWN_FRAMES = 57;       // 每隔多少帧生成一对水管
const XNF_BIRD_X = 96;             // 小鸟固定横坐标 (虚拟，约 30% 宽，反应更从容)
const XNF_BIRD_HW = 16;            // 碰撞半宽
const XNF_BIRD_HH = 15;            // 碰撞半高
const XNF_GROUND_Y = XNF_VH - 112; // 地面线 (虚拟)
const XNF_READY_Y = XNF_VH * 0.42; // 待飞时小鸟中心 y

let gXnf = null;
let gXnfBest = 0;

function gXnfSaveBest() {
    if (gXnfBest < gXnf.score) {
        gXnfBest = gXnf.score;
        try { wx.setStorageSync && wx.setStorageSync('gXnfBest', gXnfBest); } catch (e) {}
    }
}

function gXnfLayout() {
    const margin = 15;
    const titleY = SAFE_TOP_OFFSET + 10;
    const rowB = titleY + 34;
    const bottomY = screenHeight - 16 - 32;
    const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
    const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
    return { margin, titleY, rowB, bottomY, backBtn, restartBtn };
}

function gXnfInit() {
    gXnf = {
        state: 'ready',          // ready -> flying -> dead
        by: XNF_READY_Y,         // 小鸟中心 y (虚拟)
        vy: 0,
        score: 0,
        pipes: [],
        spawnCounter: XNF_SPAWN_FRAMES + 17, // 起飞后先空 ~0.5s 再出第一对水管
        frame: 0,
        acc: 0,
        hint: 2.2,
        deadFlash: 0,
        bob: 0,
        lastTick: Date.now()
    };
    try { gXnfBest = (wx.getStorageSync && wx.getStorageSync('gXnfBest')) || 0; } catch (e) { gXnfBest = 0; }
}

function gXnfPopPipe() {
    const b = XNF_GAP_MIN + Math.random() * (XNF_GAP_MAX - XNF_GAP_MIN); // 缝隙顶 y
    gXnf.pipes.push({
        x: XNF_VW,                // 从右侧进入
        gapTop: b,                // 缝隙顶部 y
        gapBottom: b + XNF_GAP,   // 缝隙底部 y
        scored: false
    });
}

function gXnfCollide(p) {
    const g = gXnf;
    const bx1 = XNF_BIRD_X - XNF_BIRD_HW, by1 = g.by - XNF_BIRD_HH;
    const bx2 = XNF_BIRD_X + XNF_BIRD_HW, by2 = g.by + XNF_BIRD_HH;
    const px1 = p.x, px2 = p.x + XNF_PIPE_W;
    if (!(px2 > bx1 && px1 < bx2)) return false;                 // 水平不重叠
    if (by1 < p.gapTop && by2 > p.gapTop - XNF_PIPE_H) return true;   // 撞顶部水管
    if (by1 < p.gapBottom + XNF_PIPE_H && by2 > p.gapBottom) return true; // 撞底部水管
    return false;
}

function gXnfDie() {
    if (gXnf.state === 'dead') return;
    gXnf.state = 'dead';
    gXnf.deadFlash = 1;
    gXnfSaveBest();
}

function gXnfStepFrame() {
    const g = gXnf;
    g.frame++;
    if (g.state === 'flying') {
        g.vy += XNF_GRAVITY;
        g.by += g.vy;
        if (g.by - XNF_BIRD_HH < 0) { g.by = XNF_BIRD_HH; if (g.vy < 0) g.vy = 0; }
        if (g.by + XNF_BIRD_HH >= XNF_GROUND_Y) { g.by = XNF_GROUND_Y - XNF_BIRD_HH; gXnfDie(); return; }
        g.spawnCounter--;
        if (g.spawnCounter <= 0) { gXnfPopPipe(); g.spawnCounter = XNF_SPAWN_FRAMES; }
        for (const p of g.pipes) {
            p.x += XNF_PIPE_SPEED;
            if (!p.scored && p.x + XNF_PIPE_W < XNF_BIRD_X - 26) { p.scored = true; g.score++; }
            if (gXnfCollide(p)) { gXnfDie(); return; }
        }
        g.pipes = g.pipes.filter(p => p.x + XNF_PIPE_W > -4);
    } else if (g.state === 'ready') {
        g.bob += 1;
        g.by = XNF_READY_Y + Math.sin(g.bob * 0.12) * 6;
    }
}

function gXnfUpdate(dt) {
    const g = gXnf;
    g.acc += dt;
    let steps = 0;
    while (g.acc >= XNF_FRAME && steps < 6) {
        g.acc -= XNF_FRAME;
        gXnfStepFrame();
        steps++;
        if (g.state === 'dead') break;
    }
    if (g.hint > 0 && g.state === 'flying') g.hint -= dt;
}

function gXnfFlap(x, y) {
    const g = gXnf;
    if (!g) return;
    const L = gXnfLayout();
    if (inRect(x, y, L.backBtn) || inRect(x, y, L.restartBtn)) return; // 按钮不触发振翅
    if (g.state === 'ready') { g.state = 'flying'; g.vy = XNF_JUMP_V; g.hint = 0; }
    else if (g.state === 'flying') { g.vy = XNF_JUMP_V; MiniGameAudio.play('flap'); }
}

function gXnfDrawPipePart(x, y, w, h, capH, capOver, capAtTop) {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#3a8f1f');
    grad.addColorStop(0.5, '#7bd24a');
    grad.addColorStop(1, '#3a8f1f');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2c6b15';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    const capY = capAtTop ? y : (y + h - capH);
    ctx.fillStyle = '#8fe05a';
    ctx.fillRect(x - capOver, capY, w + capOver * 2, capH);
    ctx.strokeStyle = '#2c6b15';
    ctx.strokeRect(x - capOver, capY, w + capOver * 2, capH);
}

function gXnfDrawPipe(p, sx, sy) {
    const x = p.x * sx;
    const w = XNF_PIPE_W * sx;
    const topH = XNF_PIPE_H * sy;
    const topY = (p.gapTop - XNF_PIPE_H) * sy;
    const botY = p.gapBottom * sy;
    const botH = XNF_PIPE_H * sy;
    const capH = 14 * sy;
    const capOver = 4 * sx;
    gXnfDrawPipePart(x, topY, w, topH, capH, capOver, false); // 顶管：管帽在底部
    gXnfDrawPipePart(x, botY, w, botH, capH, capOver, true);  // 底管：管帽在顶部
}

function gXnfDrawBird(sx, sy) {
    const g = gXnf;
    const cx = XNF_BIRD_X * sx;
    const cy = g.by * sy;
    const r = XNF_BIRD_HH * sy;
    let ang = 0;
    if (g.state === 'flying') ang = g.vy < 0 ? -0.45 : Math.min(1.4, g.vy * 0.05);
    else if (g.state === 'dead') ang = 1.4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c98a00';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.25, r * 0.25, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.35, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(r * 0.48, -r * 0.35, r * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(r * 0.9, -r * 0.05);
    ctx.lineTo(r * 1.5, r * 0.02);
    ctx.lineTo(r * 0.9, r * 0.25);
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

function drawMiniGameXnf() {
    const L = gXnfLayout();
    const now = Date.now();
    const dt = Math.min(0.05, (now - gXnf.lastTick) / 1000);
    gXnf.lastTick = now;
    if (gXnf.state !== 'dead') gXnfUpdate(dt);
    else if (gXnf.deadFlash > 0) gXnf.deadFlash -= dt * 2;

    const sx = screenWidth / XNF_VW;
    const sy = screenHeight / XNF_VH;
    const groundScreenY = XNF_GROUND_Y * sy;

    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, groundScreenY);
    sky.addColorStop(0, '#4ec0ca');
    sky.addColorStop(1, '#9fe3e8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, screenWidth, groundScreenY);

    // 云
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const clouds = [[60, 120], [240, 80], [160, 200]];
    for (const c of clouds) {
        const ccx = c[0] * sx, ccy = c[1] * sy, cr = 22 * sy;
        ctx.beginPath();
        ctx.arc(ccx, ccy, cr, 0, Math.PI * 2);
        ctx.arc(ccx + cr, ccy + 4, cr * 0.8, 0, Math.PI * 2);
        ctx.arc(ccx - cr, ccy + 4, cr * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }

    // 世界（裁剪到天空区域）
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, screenWidth, groundScreenY); ctx.clip();
    for (const p of gXnf.pipes) gXnfDrawPipe(p, sx, sy);
    gXnfDrawBird(sx, sy);
    ctx.restore();

    // 地面
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, groundScreenY, screenWidth, screenHeight - groundScreenY);
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, groundScreenY, screenWidth, 18 * sy);
    ctx.fillStyle = '#5aa322';
    ctx.fillRect(0, groundScreenY, screenWidth, 6 * sy);
    const tileW = 28 * sx;
    let off = (gXnf.frame * XNF_PIPE_SPEED * sx);
    off = ((off % tileW) + tileW) % tileW;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let gx = -off; gx < screenWidth; gx += tileW) {
        ctx.fillRect(gx, groundScreenY + 22 * sy, 14 * sx, (screenHeight - groundScreenY) - 22 * sy);
    }

    // 准备 / 飞行提示
    if (gXnf.state === 'ready') {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐤', screenWidth / 2, groundScreenY * 0.5 - 34);
        ctx.fillText('点击屏幕，让小鸟振翅起飞', screenWidth / 2, groundScreenY * 0.5 + 4);
    } else if (gXnf.hint > 0 && gXnf.state === 'flying') {
        ctx.globalAlpha = Math.min(1, gXnf.hint);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('点一下振翅，别撞水管！', screenWidth / 2, 90);
        ctx.globalAlpha = 1;
    }

    // 死亡闪白 + 遮罩
    if (gXnf.state === 'dead') {
        if (gXnf.deadFlash > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * Math.max(0, gXnf.deadFlash)).toFixed(3) + ')';
            ctx.fillRect(0, 0, screenWidth, screenHeight);
        }
        ctx.fillStyle = 'rgba(15,27,45,0.8)';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('啪！撞了', screenWidth / 2, screenHeight / 2 - 50);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText('本局得分 ' + gXnf.score, screenWidth / 2, screenHeight / 2 - 6);
        ctx.fillText('最高纪录 ' + gXnfBest, screenWidth / 2, screenHeight / 2 + 28);
        ctx.fillStyle = '#ffd700';
        ctx.font = '14px Arial';
        ctx.fillText('点「↻ 新游戏」再来一局', screenWidth / 2, screenHeight / 2 + 64);
        ctx.textBaseline = 'alphabetic';
    }

    // HUD（始终置顶，确保按钮可见可点）
    drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
    drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText('小鸟飞飞飞', L.margin, L.titleY);
    ctx.fillText('小鸟飞飞飞', L.margin, L.titleY);

    const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
    drawScoreBox(L.margin, L.rowB, scoreW, 32, '得分', gXnf.score);
    drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最高', gXnfBest);
}

function handleMiniGameXnfInput(x, y) {
    if (!gXnf) return;
    const L = gXnfLayout();
    if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
    if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gXnfInit(); return; }
}

// 内嵌小游戏通用布局：标题/分数行 + 棋盘区 + 底部按钮
function gMiniCommonLayout() {
  const margin = 15;
  const titleY = SAFE_TOP_OFFSET + 10;
  const rowB = titleY + 34;
  const boardX = margin;
  const boardW = screenWidth - margin * 2;
  const boardY = rowB + 44;
  const bottomY = screenHeight - 16 - 32;
  const boardH = bottomY - 12 - boardY;
  const backBtn = { x: margin, y: bottomY, w: 70, h: 32 };
  const restartBtn = { x: screenWidth - margin - 84, y: bottomY, w: 84, h: 32 };
  return { margin, titleY, rowB, boardX, boardW, boardY, boardH, bottomY, backBtn, restartBtn };
}

// ==================== 内嵌小游戏：最强眼力（3 杯猜金币） ====================
// 移植自 HTML5「最强眼力」：3 个杯子扣住一枚金币，洗杯后凭眼力点中藏币的杯子。
// 猜中进下一关（洗杯更多更快），猜错扣 1 命，3 命用完结算。得分 = 到达关卡。
let gZqyl = null;
let gZqylBest = 0;
const ZQYL_CUPS = 3;

function gZqylSaveBest() {
  if (gZqylBest < gZqyl.level) {
    gZqylBest = gZqyl.level;
    try { wx.setStorageSync && wx.setStorageSync('gZqylBest', gZqylBest); } catch (e) {}
  }
}
function gZqylLayout() { return gMiniCommonLayout(); }
function gZqylSlotX(slot) {
  const L = gZqylLayout();
  return L.boardX + L.boardW * (slot + 0.5) / ZQYL_CUPS;
}
function gZqylInit() {
  gZqyl = { state: 'show', level: 1, lives: 3, cups: [], coinSlot: 0, swapQueue: [], swapT: 0, showT: 0, msg: '', msgT: 0, lastTick: Date.now() };
  try { gZqylBest = (wx.getStorageSync && wx.getStorageSync('gZqylBest')) || 0; } catch (e) { gZqylBest = 0; }
  // 三只杯子外观完全一致，避免靠颜色锁定、必须靠观察移动来追踪
  const cupColor = '#c97b4a';
  for (let i = 0; i < ZQYL_CUPS; i++) gZqyl.cups.push({ slot: i, x: gZqylSlotX(i), hasCoin: false, color: cupColor });
  gZqyl.coinSlot = Math.floor(Math.random() * ZQYL_CUPS);
  gZqyl.cups[gZqyl.coinSlot].hasCoin = true;
}
// 模拟洗牌序列下「装币杯子」的轨迹，统计在中间位置(slot 1)发生掉头的次数
function gZqylSimulateTurns(swaps, startSlot) {
  let cur = startSlot, dir = 0, turns = 0;
  for (const ab of swaps) {
    const a = ab[0], b = ab[1];
    let next = cur;
    if (cur === a) next = b;
    else if (cur === b) next = a;
    if (next !== cur) {
      const nd = next > cur ? 1 : -1;
      if (cur === 1 && dir !== 0 && nd !== dir) turns++; // 在中间掉头
      dir = nd;
      cur = next;
    }
  }
  return turns;
}
function gZqylBuildShuffle() {
  const n = 7 + gZqyl.level * 2;                 // 洗牌步数随关卡递增
  const targetTurns = Math.min(6, gZqyl.level);  // 中间位置掉头次数随关卡递增（封顶 6）
  const startSlot = gZqyl.cups[gZqyl.coinSlot].slot;
  let best = null, bestTurns = -1;
  for (let attempt = 0; attempt < 300; attempt++) {
    const swaps = [];
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.random() * 2); // 0→交换左邻接(0,1)，1→交换右邻接(1,2)，自由随机
      swaps.push([a, a + 1]);
    }
    const t = gZqylSimulateTurns(swaps, startSlot);
    if (t >= targetTurns) { best = swaps; bestTurns = t; break; }
    if (t > bestTurns) { best = swaps; bestTurns = t; }
  }
  gZqyl.swapQueue = best;
  gZqyl.swapT = 0;
}
function gZqylUpdate(dt) {
  const g = gZqyl;
  if (g.state === 'show') {
    g.showT += dt;
    if (g.showT >= 1.4) { g.state = 'shuffle'; gZqylBuildShuffle(); g.swapT = 0; }
  } else if (g.state === 'shuffle') {
    g.swapT += dt;
    const dur = Math.max(0.12, 0.5 - g.level * 0.03);
    const t = Math.min(1, g.swapT / dur);
    if (g.swapQueue.length) {
      // 队列里存的是「位置(slot)」，按 slot 找杯子来动画，金币跟着杯子走（不能交换 hasCoin，
      // 否则杯子的渲染位置与逻辑位置对不上，会出现杯子瞬移）
      const ab = g.swapQueue[0];
      const a = ab[0], b = ab[1];
      let ca = null, cb = null;
      for (const c of g.cups) { if (c.slot === a) ca = c; else if (c.slot === b) cb = c; }
      if (!ca || !cb) { g.swapQueue.shift(); g.swapT = 0; if (!g.swapQueue.length) g.state = 'guess'; return; }
      const ax = gZqylSlotX(a), bx = gZqylSlotX(b);
      ca.x = ax + (bx - ax) * t;
      cb.x = bx + (ax - bx) * t;
      if (t >= 1) {
        ca.slot = b; cb.slot = a;
        ca.x = gZqylSlotX(ca.slot); cb.x = gZqylSlotX(cb.slot);
        g.swapQueue.shift();
        g.swapT = 0;
        if (!g.swapQueue.length) g.state = 'guess';
      }
    } else { g.state = 'guess'; }
  } else if (g.state === 'reveal') {
    g.msgT -= dt;
    if (g.msgT <= 0) {
      if (g.lives <= 0) { MiniGameAudio.play('lose'); g.state = 'over'; }
      else { g.state = 'shuffle'; gZqylBuildShuffle(); }
    }
  }
}
function gZqylTap(x, y) {
  const g = gZqyl;
  if (!g) return;
  const L = gZqylLayout();
  if (inRect(x, y, L.backBtn) || inRect(x, y, L.restartBtn)) return;
  if (g.state === 'over') { gZqylInit(); return; }
  if (g.state !== 'guess') return;
  let picked = -1;
  for (let i = 0; i < g.cups.length; i++) {
    if (Math.abs(x - g.cups[i].x) < (L.boardW / ZQYL_CUPS) / 2) { picked = i; break; }
  }
  if (picked < 0) return;
  const cup = g.cups[picked];
  if (cup.hasCoin) { MiniGameAudio.play('correct'); gZqylSaveBest(); g.level++; g.msg = '👀 眼力不错！进下一关'; }
  else { MiniGameAudio.play('wrong'); g.lives--; g.msg = '😵 看走眼了，扣 1 命'; }
  g.state = 'reveal';
  g.msgT = 1.1;
}
function gZqylDrawCup(cx, baseY, w, h, color, lift) {
  const topW = w * 0.62;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2, baseY - h - lift);
  ctx.lineTo(cx + topW / 2, baseY - h - lift);
  ctx.lineTo(cx + w / 2, baseY - lift);
  ctx.lineTo(cx - w / 2, baseY - lift);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - h - lift, topW / 2, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
}
function drawZqylHeart(cx, cy, s, active) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.5, cy - s * 0.45, cx, cy - s * 0.15);
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 0.45, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.35);
  ctx.closePath();
  if (active) {
    ctx.fillStyle = '#ff3b3b';
    ctx.fill();
    ctx.strokeStyle = '#ffd0d0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}
function drawMiniGameZqyl() {
  const L = gZqylLayout();
  const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
  const now = Date.now();
  const dt = Math.min(0.05, (now - gZqyl.lastTick) / 1000);
  gZqyl.lastTick = now;
  if (gZqyl.state !== 'over') gZqylUpdate(dt);

  drawBackground();
  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('最强眼力', L.margin, L.titleY);
  const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
  drawScoreBox(L.margin, L.rowB, scoreW, 32, '关卡', gZqyl.level);
  drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最佳', gZqylBest);
  // 命数：初始 3 颗全红，扣命后从右往左逐个变白，全白即游戏结束
  const hSize = 17, hGap = 22;
  const hY = L.rowB + 16;
  const hStartX = screenWidth - L.margin - 2 * hGap - hSize / 2;
  for (let i = 0; i < 3; i++) {
    drawZqylHeart(hStartX + i * hGap, hY, hSize, i < gZqyl.lives);
  }

  const deskY = L.boardY + L.boardH * 0.62;
  ctx.fillStyle = '#caa472';
  ctx.fillRect(L.boardX, deskY, L.boardW, L.boardY + L.boardH - deskY);
  ctx.fillStyle = '#b8915c';
  ctx.fillRect(L.boardX, deskY, L.boardW, 6);

  const cupW = Math.min(86, (L.boardW / ZQYL_CUPS) * 0.6);
  const cupH = 92;
  // 放硬币展示阶段：抬起藏币的杯子露出金币，让玩家先记住位置
  let showLift = 0;
  if (gZqyl.state === 'show') {
    const t = gZqyl.showT / 1.4;
    const env = (t < 0.12 || t > 0.88) ? 0 : (t < 0.4 ? (t - 0.12) / 0.28 : (t < 0.7 ? 1 : (0.88 - t) / 0.18));
    showLift = 72 * env;
  }
  const coinCup = gZqyl.cups[gZqyl.coinSlot];
  if (gZqyl.state === 'show' || gZqyl.state === 'reveal') {
    ctx.fillStyle = '#ffd700'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(coinCup.x, deskY - 10, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8860b'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('¥', coinCup.x, deskY - 10);
  }
  for (const cup of gZqyl.cups) {
    let lift = 0;
    if (gZqyl.state === 'reveal' && cup.hasCoin) lift = 36;
    else if (gZqyl.state === 'show' && cup.hasCoin) lift = showLift;
    gZqylDrawCup(cup.x, deskY, cupW, cupH, cup.color, lift);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (gZqyl.state === 'show') {
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 17px Arial';
    ctx.fillText('记住金币藏在哪只杯子下！', screenWidth / 2, L.boardY + 30);
  } else if (gZqyl.state === 'shuffle') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Arial';
    ctx.fillText('盯紧杯子怎么移动…', screenWidth / 2, L.boardY + 30);
  } else if (gZqyl.state === 'guess') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial';
    ctx.fillText('点中藏有金币的杯子！', screenWidth / 2, L.boardY + 30);
  } else if (gZqyl.state === 'reveal') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px Arial';
    ctx.fillText(gZqyl.msg, screenWidth / 2, L.boardY + 30);
  } else if (gZqyl.state === 'over') {
    ctx.fillStyle = 'rgba(15,27,45,0.8)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('眼力耗尽', screenWidth / 2, screenHeight / 2 - 40);
    ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
    ctx.fillText('到达第 ' + gZqyl.level + ' 关', screenWidth / 2, screenHeight / 2);
    ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
    ctx.fillText('点「↻ 新游戏」再来一局', screenWidth / 2, screenHeight / 2 + 34);
  }
}
function handleMiniGameZqylInput(x, y) {
  if (!gZqyl) return;
  const L = gZqylLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gZqylInit(); return; }
  gZqylTap(x, y);
}

// ==================== 内嵌小游戏：小青蛙过河（青蛙换位谜题） ====================
// 移植自 HTML5「小青蛙过河」：7 个石墩，左 3 蛙面右、右 3 蛙面左，空 1 个。
// 点青蛙跳过空位或隔一蛙，让左右互换即胜。得分/最佳 = 用最少步数。
let gQingwa = null;
let gQingwaBest = [0, 0, 0];          // 各关最佳步数（关 1/2/3）
const QW_LEVELS = [2, 3, 4];          // 每关每边青蛙数：第1关 2+2+1 / 第2关 3+3+1 / 第3关 4+4+1

function gQingwaBuildSlots(n) {
  const s = [];
  for (let i = 0; i < n; i++) s.push('L');
  s.push(0);
  for (let i = 0; i < n; i++) s.push('R');
  return s;
}
function gQingwaGoal(n) {
  const s = [];
  for (let i = 0; i < n; i++) s.push('R');
  s.push(0);
  for (let i = 0; i < n; i++) s.push('L');
  return s;
}
function gQingwaWinCheck() {
  const s = gQingwa.slots, n = gQingwa.n;
  for (let i = 0; i < n; i++) if (s[i] !== 'R') return false;
  if (s[n] !== 0) return false;
  for (let i = 0; i < n; i++) if (s[n + 1 + i] !== 'L') return false;
  return true;
}
function gQingwaMoveTo(i, s) {
  const N = s.length, f = s[i];
  if (f === 'L') {
    if (i + 1 < N && s[i + 1] === 0) return i + 1;
    if (i + 2 < N && s[i + 1] === 'R' && s[i + 2] === 0) return i + 2;
  } else if (f === 'R') {
    if (i - 1 >= 0 && s[i - 1] === 0) return i - 1;
    if (i - 2 >= 0 && s[i - 1] === 'L' && s[i - 2] === 0) return i - 2;
  }
  return -1;
}
function gQingwaCanMoveTarget(i) { return gQingwaMoveTo(i, gQingwa.slots); }
function gQingwaHasMove() {
  const N = gQingwa.slots.length;
  for (let i = 0; i < N; i++) if (gQingwaCanMoveTarget(i) >= 0) return true;
  return false;
}
// BFS：求从当前局面到目标的最少步解，返回 { moves, first:{from,to} }
function gQingwaSolve() {
  const n = gQingwa.n, start = gQingwa.slots;
  const goal = gQingwaGoal(n);
  const key = a => a.map(x => x === 0 ? '.' : x).join('');
  if (key(start) === key(goal)) return { moves: 0 };
  const q = [{ s: start.slice(), path: [] }];
  const seen = new Set([key(start)]);
  while (q.length) {
    const { s, path } = q.shift();
    const N = s.length;
    for (let i = 0; i < N; i++) {
      const to = gQingwaMoveTo(i, s);
      if (to < 0) continue;
      const ns = s.slice(); ns[to] = ns[i]; ns[i] = 0;
      const k = key(ns);
      if (seen.has(k)) continue;
      seen.add(k);
      const np = path.concat([{ from: i, to: to }]);
      if (key(ns) === key(goal)) return { moves: np.length, first: np[0] };
      q.push({ s: ns, path: np });
    }
  }
  return null;
}
// 通用 BFS：从任意局面求到目标的最短步数（用于判断是否偏离最优路径）
function gQingwaMinMoves(start, n) {
  const goal = gQingwaGoal(n);
  const key = a => a.map(x => x === 0 ? '.' : x).join('');
  if (key(start) === key(goal)) return 0;
  const q = [{ s: start.slice(), d: 0 }];
  const seen = new Set([key(start)]);
  while (q.length) {
    const { s, d } = q.shift();
    const N = s.length;
    for (let i = 0; i < N; i++) {
      const to = gQingwaMoveTo(i, s);
      if (to < 0) continue;
      const ns = s.slice(); ns[to] = ns[i]; ns[i] = 0;
      const k = key(ns);
      if (seen.has(k)) continue;
      seen.add(k);
      if (key(ns) === key(goal)) return d + 1;
      q.push({ s: ns, d: d + 1 });
    }
  }
  return -1;
}
function gQingwaSaveBest() {
  const lv = gQingwa.level;
  if (gQingwaBest[lv - 1] === 0 || gQingwa.moves < gQingwaBest[lv - 1]) {
    gQingwaBest[lv - 1] = gQingwa.moves;
    try { wx.setStorageSync && wx.setStorageSync('gQingwaBest', JSON.stringify(gQingwaBest)); } catch (e) {}
  }
}
// 底部扩展两个按钮：撤销 / 提示（居中于返回与新游戏之间）
function gQingwaLayout() {
  const L = gMiniCommonLayout();
  const bw = 64, gap = 8;
  const leftEnd = L.backBtn.x + L.backBtn.w;
  const rightStart = L.restartBtn.x;
  const totalW = bw * 2 + gap;
  const cx0 = (leftEnd + rightStart) / 2 - totalW / 2;
  L.undoBtn = { x: cx0, y: L.backBtn.y, w: bw, h: 32 };
  L.hintBtn = { x: cx0 + bw + gap, y: L.backBtn.y, w: bw, h: 32 };
  return L;
}
function gQingwaSlotX(i) {
  const L = gQingwaLayout();
  return L.boardX + L.boardW * (i + 0.5) / gQingwa.slots.length;
}
function gQingwaInit(level) {
  const lv = (typeof level === 'number') ? level : (gQingwa ? gQingwa.level : 1);
  const n = QW_LEVELS[lv - 1];
  gQingwa = { level: lv, n: n, slots: gQingwaBuildSlots(n), moves: 0, time: 0, win: false, stuck: false, anim: null, history: [], hint: 0, hintFrom: -1, hintTo: -1, lastTick: Date.now() };
  gQingwa.optimalMoves = gQingwaMinMoves(gQingwa.slots, n);
  try { gQingwaBest = JSON.parse((wx.getStorageSync && wx.getStorageSync('gQingwaBest')) || '[0,0,0]'); if (!Array.isArray(gQingwaBest)) gQingwaBest = [0, 0, 0]; } catch (e) { gQingwaBest = [0, 0, 0]; }
}
function gQingwaUndo() {
  const g = gQingwa;
  if (!g || g.anim || !g.history.length) return;
  const prev = g.history.pop();
  g.slots = prev.slots;
  g.moves = prev.moves;
  g.win = false; g.stuck = false;
}
function gQingwaTap(x, y) {
  const g = gQingwa;
  if (!g || g.win || g.stuck || g.anim) return;
  const L = gQingwaLayout();
  if (inRect(x, y, L.backBtn) || inRect(x, y, L.restartBtn) || inRect(x, y, L.undoBtn) || inRect(x, y, L.hintBtn)) return;
  let picked = -1;
  const N = g.slots.length;
  for (let i = 0; i < N; i++) if (Math.abs(x - gQingwaSlotX(i)) < (L.boardW / N) / 2) { picked = i; break; }
  if (picked < 0) return;
  const target = gQingwaCanMoveTarget(picked);
  if (target < 0) return;
  MiniGameAudio.play('jump');
  g.anim = { from: picked, to: target, t: 0, frog: g.slots[picked] };
}
function gQingwaUpdate(dt) {
  const g = gQingwa;
  if (g.hint > 0) g.hint = Math.max(0, g.hint - dt);
  g.time += dt;
  if (g.anim) {
    g.anim.t += dt / 0.22;
    if (g.anim.t >= 1) {
      const prev = { slots: g.slots.slice(), moves: g.moves };
      g.slots[g.anim.to] = g.anim.frog;
      g.slots[g.anim.from] = 0;
      g.moves++;
      g.history.push(prev);
      g.anim = null;
      if (gQingwaWinCheck()) { g.win = true; MiniGameAudio.play('win'); gQingwaSaveBest(); }
      else if (!gQingwaHasMove()) g.stuck = true;
    }
  }
}
// 通关界面居中按钮：第1/2关=下一关，第3关=从第一关重玩
function gQingwaWinButton() {
  const w = 150, h = 42;
  return { x: screenWidth / 2 - w / 2, y: screenHeight / 2 + 48, w: w, h: h, action: gQingwa.level < 3 ? 'next' : 'replay1' };
}
function drawMiniGameQingwa() {
  const L = gQingwaLayout();
  const btnTop = Math.min(L.backBtn.y, L.restartBtn.y, L.undoBtn.y, L.hintBtn.y);
  const now = Date.now();
  const dt = Math.min(0.05, (now - gQingwa.lastTick) / 1000);
  gQingwa.lastTick = now;
  if (gQingwa.hint > 0 && !gQingwa.win) gQingwa.hint = Math.max(0, gQingwa.hint - dt);
  if (!gQingwa.win && !gQingwa.stuck) gQingwaUpdate(dt);

  drawBackground();
  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 重玩', 'green');
  drawMiniGameButton(L.undoBtn, '↶ 撤销', 'blue');
  drawMiniGameButton(L.hintBtn, '💡 提示', 'blue');
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('小青蛙过河', L.margin, L.titleY);
  ctx.fillStyle = '#fff'; ctx.font = '14px Arial';
  ctx.fillText('第 ' + gQingwa.level + ' 关 / 共 3 关', L.margin + 150, L.titleY);
  const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
  drawScoreBox(L.margin, L.rowB, scoreW, 32, '步数', gQingwa.moves);
  const qwBest = gQingwaBest[gQingwa.level - 1];
  drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '本关最佳', qwBest > 0 ? qwBest : '—');

  const N = gQingwa.slots.length;
  const slotW = L.boardW / N;
  const frogY = L.boardY + L.boardH * 0.5;
  const r = Math.min(slotW * 0.34, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < N; i++) { ctx.beginPath(); ctx.arc(gQingwaSlotX(i), frogY, r + 6, 0, Math.PI * 2); ctx.fill(); }
  // 提示：高亮最优解下一步的目标格
  if (gQingwa.hint > 0 && gQingwa.hintTo >= 0) {
    const hx = gQingwaSlotX(gQingwa.hintTo);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,0,' + (0.45 + 0.45 * Math.sin(now / 120)) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx, frogY, r + 12 + 4 * Math.sin(now / 150), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // 提示：从被推荐的青蛙指向目标格的金色虚线箭头
  if (gQingwa.hint > 0 && gQingwa.hintFrom >= 0 && gQingwa.hintTo >= 0) {
    const fx = gQingwaSlotX(gQingwa.hintFrom), tx = gQingwaSlotX(gQingwa.hintTo);
    const ay = frogY - r - 22;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,0,' + (0.65 + 0.3 * Math.sin(now / 120)) + ')';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.moveTo(fx, ay); ctx.lineTo(tx, ay); ctx.stroke();
    ctx.setLineDash([]);
    const dir = tx > fx ? 1 : -1;
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.moveTo(tx, ay); ctx.lineTo(tx - dir * 9, ay - 6); ctx.lineTo(tx - dir * 9, ay + 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < N; i++) {
    let cx = gQingwaSlotX(i), cy = frogY, frog = gQingwa.slots[i];
    if (gQingwa.anim && gQingwa.anim.from === i) { frog = 0; }
    if (gQingwa.anim && gQingwa.anim.to === i && gQingwa.anim.t < 1) {
      const a = gQingwaSlotX(gQingwa.anim.from), b = gQingwaSlotX(gQingwa.anim.to);
      cx = a + (b - a) * gQingwa.anim.t;
      frog = gQingwa.anim.frog;
    }
    if (frog === 'L' || frog === 'R') {
      const canMove = gQingwaCanMoveTarget(i) >= 0;
      const isHint = gQingwa.hint > 0 && i === gQingwa.hintFrom;
      ctx.save();
      if (!canMove) {
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = '#5a7a5a';
      } else if (isHint) {
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 18 + 8 * Math.sin(now / 100);
        ctx.fillStyle = '#3fbf3f';
      } else {
        ctx.shadowColor = 'rgba(255,215,0,0.8)'; ctx.shadowBlur = 10;
        ctx.fillStyle = '#3fbf3f';
      }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = canMove ? '#ffd700' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.4, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.4, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.4, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 0.4, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd700';
      const dir = frog === 'L' ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + dir * r * 0.9, cy + r * 0.1);
      ctx.lineTo(cx + dir * r * 0.5, cy - r * 0.1);
      ctx.lineTo(cx + dir * r * 0.5, cy + r * 0.3);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#fff'; ctx.font = '13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (gQingwa.win) {
    const wb = gQingwaWinButton();
    ctx.fillStyle = 'rgba(15,27,45,0.86)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#7fffa0'; ctx.font = 'bold 26px Arial';
    ctx.fillText('🎉 第 ' + gQingwa.level + ' 关通过！', screenWidth / 2, screenHeight / 2 - 50);
    ctx.fillStyle = '#fff'; ctx.font = '18px Arial';
    ctx.fillText('用了 ' + gQingwa.moves + ' 步 / ' + gQingwa.time.toFixed(1) + ' 秒', screenWidth / 2, screenHeight / 2 - 16);
    if (gQingwa.level < 3) {
      drawMiniGameButton(wb, '下一关 ›', 'green');
    } else {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 19px Arial';
      ctx.fillText('🏆 三关全部通关！', screenWidth / 2, screenHeight / 2 + 12);
      drawMiniGameButton(wb, '↻ 从第一关重玩', 'green');
    }
  } else if (gQingwa.stuck) {
    ctx.fillStyle = 'rgba(15,27,45,0.86)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#ff9b9b'; ctx.font = 'bold 24px Arial';
    ctx.fillText('卡住了～', screenWidth / 2, screenHeight / 2 - 30);
    ctx.fillStyle = '#fff'; ctx.font = '15px Arial';
    ctx.fillText('所有青蛙都跳不动了', screenWidth / 2, screenHeight / 2 + 2);
    ctx.fillStyle = '#ffd700'; ctx.font = '13px Arial';
    if (gQingwa.hint > 0) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px Arial';
      ctx.fillText('💡 已陷入死局：点「撤销」退一步，或「重玩」', screenWidth / 2, screenHeight / 2 + 30);
    } else {
      const tip = gQingwa.history.length ? '可「撤销」退回一步，或点屏幕重来' : '点屏幕重新开始';
      ctx.fillText(tip, screenWidth / 2, screenHeight / 2 + 30);
    }
  } else {
    if (gQingwa.hint > 0) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px Arial';
      if (gQingwa.hintFrom >= 0) {
        ctx.fillText('💡 提示：走这只金光青蛙到高亮格子', screenWidth / 2, L.boardY + 24);
      } else {
        ctx.fillText('💡 走错了！点「撤销 ↶」退回一步重走', screenWidth / 2, L.boardY + 24);
      }
    } else {
      ctx.fillText('绿圈=可动，灰=不可动。点青蛙跳过空位或隔一蛙', screenWidth / 2, L.boardY + 24);
    }
  }
}
function handleMiniGameQingwaInput(x, y) {
  if (!gQingwa) return;
  const L = gQingwaLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  const g = gQingwa;
  if (g.win) {
    const wb = gQingwaWinButton();
    if (inRect(x, y, wb)) {
      if (wb.action === 'next') gQingwaInit(g.level + 1);
      else gQingwaInit(1);
      return;
    }
    // 否则落到下方，让底部按钮（重玩/撤销/提示）继续生效
  }
  if (g.stuck) {
    if (inRect(x, y, L.hintBtn)) { g.hint = 2.5; g.hintFrom = -1; g.hintTo = -1; return; }
    if (inRect(x, y, L.undoBtn) && g.history.length) { gQingwaUndo(); return; }
    if (inRect(x, y, L.restartBtn)) { gQingwaInit(g.level); return; }
    if (g.history.length) gQingwaUndo(); else gQingwaInit(g.level);
    return;
  }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gQingwaInit(g.level); return; }
  if (inRect(x, y, L.undoBtn)) { gQingwaUndo(); return; }
  if (inRect(x, y, L.hintBtn)) {
    const sol = gQingwaSolve();
    // 偏离最优路径（走错）则提示撤销；仍在最优路径上才给金色箭头
    const onOptimal = sol && sol.first && sol.moves <= (gQingwa.optimalMoves - gQingwa.moves);
    if (onOptimal) { g.hint = 2.2; g.hintFrom = sol.first.from; g.hintTo = sol.first.to; }
    else { g.hint = 2.6; g.hintFrom = -1; g.hintTo = -1; }
    return;
  }
  gQingwaTap(x, y);
}

// ==================== 内嵌小游戏：数钱数到手抽筋（30 秒狂点） ====================
// 移植自 HTML5「数钱数到手抽筋」：30 秒倒计时，点屏幕每张钞票 +¥100，按金额定身份阶层。
let gSqsd = null;
let gSqsdBest = 0;
const SQSD_TIME = 30;

function gSqsdSaveBest() {
  if (gSqsdBest < gSqsd.score) {
    gSqsdBest = gSqsd.score;
    try { wx.setStorageSync && wx.setStorageSync('gSqsdBest', gSqsdBest); } catch (e) {}
  }
}
function gSqsdLayout() { return gMiniCommonLayout(); }
function gSqsdTier(score) {
  if (score < 5000) return '屌丝';
  if (score < 10000) return '贫农';
  if (score < 15000) return '富农';
  if (score < 20000) return '土豪';
  if (score < 25000) return '煤老板';
  return '资本家';
}
function gSqsdInit() {
  loadSqsdMoneyImg();
  gSqsd = { state: 'ready', score: 0, timeLeft: SQSD_TIME, lastTap: 0, pulse: 0, popups: [], lastTick: Date.now() };
  try { gSqsdBest = (wx.getStorageSync && wx.getStorageSync('gSqsdBest')) || 0; } catch (e) { gSqsdBest = 0; }
}
function gSqsdUpdate(dt) {
  const g = gSqsd;
  if (g.state === 'playing') {
    g.timeLeft -= dt;
    if (g.timeLeft <= 0) { g.timeLeft = 0; g.state = 'over'; gSqsdSaveBest(); }
  }
  // 钞票打击特效更新
  for (const p of g.popups) {
    p.t += dt;
    for (const c of p.coins) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 620 * dt; c.rot += c.vr * dt; }
  }
  g.popups = g.popups.filter(p => p.t < p.life);
  if (g.pulse > 0) g.pulse = Math.max(0, g.pulse - dt * 5);  // 约 0.2s 衰减完
}
function gSqsdTap(x, y) {
  const g = gSqsd;
  if (!g) return;
  const L = gSqsdLayout();
  if (inRect(x, y, L.backBtn) || inRect(x, y, L.restartBtn)) return;
  if (g.state === 'ready') { g.state = 'playing'; return; }
  if (g.state === 'over') { gSqsdInit(); return; }
  if (g.state !== 'playing') return;
  const now = Date.now();
  if (now - g.lastTap < 50) return;
  g.lastTap = now;
  MiniGameAudio.play('coin');
  g.score += 100;
  g.pulse = 1;            // 触发钞票缩放/抖动脉冲
  gSqsdSpawnHit(x, y);
}

// 数钱打击特效：金色「¥+100」弹跳 + 飞溅金币粒子，出现在点击位置
function gSqsdSpawnHit(x, y) {
  const coins = [];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
    const sp = 130 + Math.random() * 180;
    coins.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 12, t: 0, life: 0.5 + Math.random() * 0.35 });
  }
  gSqsd.popups.push({ x, y, t: 0, life: 0.7, coins });
}
function drawMiniGameSqsd() {
  const L = gSqsdLayout();
  const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
  const now = Date.now();
  const dt = Math.min(0.05, (now - gSqsd.lastTick) / 1000);
  gSqsd.lastTick = now;
  gSqsdUpdate(dt);

  drawBackground();
  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('数钱数到手抽筋', L.margin, L.titleY);
  const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
  drawScoreBox(L.margin, L.rowB, scoreW, 32, '已数(¥)', gSqsd.score);
  drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最佳', gSqsdBest);

  const barY = L.rowB + 40;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, L.margin, barY, L.boardW, 10, 5); ctx.fill();
  const frac = gSqsd.state === 'playing' ? gSqsd.timeLeft / SQSD_TIME : 1;
  ctx.fillStyle = frac < 0.3 ? '#ff6b6b' : '#7fffa0';
  roundRect(ctx, L.margin, barY, L.boardW * frac, 10, 5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(Math.ceil(gSqsd.timeLeft) + 's', screenWidth - L.margin, barY + 5);

  // 绘制红色钞票（原游戏 m0.png），放大并靠下；点击时缩放 + 抖动
  const cx = screenWidth / 2;
  const moneyCenterY = L.boardY + L.boardH * 0.58;
  let mw = Math.min(240, L.boardW * 0.72);
  let mh = mw * (759 / 371);
  if (mh > L.boardH * 0.78) { mh = L.boardH * 0.78; mw = mh * (371 / 759); }
  const moneyTop = moneyCenterY - mh / 2;
  const pulse = gSqsd.pulse || 0;
  const ps = 1 + pulse * 0.16;                       // 点击瞬间放大到 116%
  const shakeX = Math.sin(gSqsd.lastTick * 0.05) * pulse * 6;  // 水平抖动
  const shakeRot = Math.sin(gSqsd.lastTick * 0.08) * pulse * 0.05; // 轻微旋转抖动
  ctx.save();
  ctx.translate(cx + shakeX, moneyCenterY);
  ctx.rotate(shakeRot);
  ctx.scale(ps, ps);
  if (sqsdMoneyImg && sqsdMoneyImg.width) {
    ctx.drawImage(sqsdMoneyImg, -mw / 2, -mh / 2, mw, mh);
  } else {
    ctx.fillStyle = '#7bd24a';
    roundRect(ctx, -mw / 2, -mh / 2, mw, mh, 12); ctx.fill();
    ctx.strokeStyle = '#3a8f1f'; ctx.lineWidth = 3; roundRect(ctx, -mw / 2, -mh / 2, mw, mh, 12); ctx.stroke();
    ctx.fillStyle = '#3a8f1f'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('¥', 0, -24);
    ctx.font = 'bold 22px Arial'; ctx.fillText('100', 0, 18);
    ctx.font = '12px Arial'; ctx.fillText('人民币', 0, 46);
  }
  ctx.restore();
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('身份：' + gSqsdTier(gSqsd.score), cx, moneyTop + mh + 24);

  // 数钱打击特效：金色「¥+100」弹跳 + 飞溅金币粒子
  for (const p of gSqsd.popups) {
    const prog = p.t / p.life;
    const rise = 48 * prog;
    const alpha = prog < 0.7 ? 1 : Math.max(0, 1 - (prog - 0.7) / 0.3);
    let scale = prog < 0.28 ? 0.3 + (1.5 - 0.3) * (prog / 0.28) : 1.5 - (1.5 - 1.0) * ((prog - 0.28) / 0.72);
    const py = p.y - rise;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, py);
    ctx.scale(scale, scale);
    ctx.shadowColor = 'rgba(255,200,0,0.95)'; ctx.shadowBlur = 18;
    ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#7a3b00'; ctx.strokeText('¥+100', 0, 0);
    const grad = ctx.createLinearGradient(0, -22, 0, 22);
    grad.addColorStop(0, '#fff6c0'); grad.addColorStop(0.5, '#ffd000'); grad.addColorStop(1, '#ff9b00');
    ctx.fillStyle = grad; ctx.fillText('¥+100', 0, 0);
    ctx.restore();
    for (const c of p.coins) {
      const ca = c.t < c.life ? Math.max(0, 1 - c.t / c.life) : 0;
      if (ca <= 0) continue;
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      const r = 7, cg = ctx.createLinearGradient(-r, -r, r, r);
      cg.addColorStop(0, '#fff3b0'); cg.addColorStop(1, '#ffb300');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#c8881a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#c8881a'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('¥', 0, 0);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (gSqsd.state === 'ready') ctx.fillText('点屏幕开始数钱，30 秒狂点！', screenWidth / 2, L.boardY + 26);
  else if (gSqsd.state === 'over') {
    ctx.fillStyle = 'rgba(15,27,45,0.8)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 24px Arial';
    ctx.fillText('时间到！', screenWidth / 2, screenHeight / 2 - 40);
    ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
    ctx.fillText('数了 ¥' + gSqsd.score + '，' + gSqsdTier(gSqsd.score), screenWidth / 2, screenHeight / 2);
    ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
    ctx.fillText('点「↻ 新游戏」再来一次', screenWidth / 2, screenHeight / 2 + 34);
  }
}
function handleMiniGameSqsdInput(x, y) {
  if (!gSqsd) return;
  const L = gSqsdLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gSqsdInit(); return; }
  gSqsdTap(x, y);
}

// ==================== 内嵌小游戏：围住神经猫（六边格围堵） ====================
// 移植自 Egret「围住神经猫」：六边格(半径4)棋盘，猫居中。点空格放石头，猫走最短路逃向边缘；
// 猫逃出边缘=失败，被完全围住=胜利。最佳=最少步数。
let gSjmao = null;
let gSjmaoBest = 0;
const SJM_R = 4;

function gSjmaoSaveBest() {
  if (gSjmaoBest === 0 || gSjmao.steps < gSjmaoBest) {
    gSjmaoBest = gSjmao.steps;
    try { wx.setStorageSync && wx.setStorageSync('gSjmaoBest', gSjmaoBest); } catch (e) {}
  }
}
function gSjmaoLayout() { return gMiniCommonLayout(); }
function gSjmaoKey(q, r) { return q + ',' + r; }
function gSjmaoNeighbors(q, r) {
  return [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]];
}
function gSjmaoIsBorder(q, r) {
  return (Math.abs(q) === SJM_R || Math.abs(r) === SJM_R || Math.abs(-q - r) === SJM_R);
}
function gSjmaoInit() {
  gSjmao = { cells: {}, walls: {}, cat: { q: 0, r: 0 }, steps: 0, over: false, win: false, lastTick: Date.now() };
  for (let q = -SJM_R; q <= SJM_R; q++) {
    for (let r = Math.max(-SJM_R, -q - SJM_R); r <= Math.min(SJM_R, -q + SJM_R); r++) {
      gSjmao.cells[gSjmaoKey(q, r)] = true;
    }
  }
  gSjmao.cat = { q: 0, r: 0 };
  // 开局随机障碍（原版同款）：没有初始障碍的话猫 4 步必逃，玩家一回合只能放一颗石头，无法取胜
  const pool = [];
  for (const k in gSjmao.cells) {
    const pr = k.split(',');
    const q = Number(pr[0]), r = Number(pr[1]);
    if (q === 0 && r === 0) continue;           // 猫所在格
    if (Math.abs(q) + Math.abs(r) + Math.abs(-q - r) <= 2) continue; // 猫的 6 个邻格留空
    pool.push(k);
  }
  const wallCount = 11 + Math.floor(Math.random() * 4); // 11~14 颗
  for (let i = 0; i < wallCount && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    gSjmao.walls[pool[idx]] = true;
    pool.splice(idx, 1);
  }
  try { gSjmaoBest = (wx.getStorageSync && wx.getStorageSync('gSjmaoBest')) || 0; } catch (e) { gSjmaoBest = 0; }
}
function gSjmaoBorderDist() {
  // 多源 BFS：从所有边缘格出发，计算每个空格到边缘的最短步数（猫应朝该值最小的方向逃）
  const bd = {};
  const qq = [];
  for (const key in gSjmao.cells) {
    if (gSjmao.walls[key]) continue;
    const pr = key.split(',');
    const q = Number(pr[0]), r = Number(pr[1]);
    if (gSjmaoIsBorder(q, r)) { bd[key] = 0; qq.push({ q: q, r: r }); }
  }
  while (qq.length) {
    const cur = qq.shift();
    const ck = gSjmaoKey(cur.q, cur.r);
    for (const nb of gSjmaoNeighbors(cur.q, cur.r)) {
      const nk = gSjmaoKey(nb[0], nb[1]);
      if (!gSjmao.cells[nk] || gSjmao.walls[nk] || bd[nk] !== undefined) continue;
      bd[nk] = bd[ck] + 1;
      qq.push({ q: nb[0], r: nb[1] });
    }
  }
  return bd;
}
function gSjmaoPixel() {
  const L = gSjmaoLayout();
  const size = Math.min((L.boardW) / (SJM_R * 2 + 1.5) / Math.sqrt(3), (L.boardH) / (SJM_R * 1.5 + 1.2));
  const cx0 = screenWidth / 2;
  const cy0 = L.boardY + L.boardH / 2;
  const pos = {};
  for (const key in gSjmao.cells) {
    const pr = key.split(',');
    const q = Number(pr[0]), r = Number(pr[1]);
    const x = cx0 + size * Math.sqrt(3) * (q + r / 2);
    const y = cy0 + size * 1.5 * r;
    pos[key] = { x: x, y: y, rad: size * 0.86 };
  }
  return pos;
}
function gSjmaoTap(x, y) {
  const g = gSjmao;
  if (!g || g.over) return;
  const L = gSjmaoLayout();
  if (inRect(x, y, L.backBtn) || inRect(x, y, L.restartBtn)) return;
  const pos = gSjmaoPixel();
  let best = null, bd = 1e9, bp = null;
  for (const key in g.cells) {
    const p = pos[key];
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) { bd = d; best = key; bp = p; }
  }
  if (!best) return;
  if ((bp.rad * 1.1) * (bp.rad * 1.1) < bd) return;
  const pr = best.split(',');
  const bq = Number(pr[0]), br = Number(pr[1]);
  const bk = gSjmaoKey(bq, br);
  if (g.walls[bk] || (bq === g.cat.q && br === g.cat.r)) return;
  MiniGameAudio.play('place');
  g.walls[bk] = true;
  g.steps++;
  // 猫已在边缘 → 直接跑掉（保险判断）
  if (gSjmaoIsBorder(g.cat.q, g.cat.r)) { g.over = true; g.win = false; MiniGameAudio.play('lose'); return; }
  const bmap = gSjmaoBorderDist();
  const catKey = gSjmaoKey(g.cat.q, g.cat.r);
  // 猫所在格到边缘不可达 → 被围住，玩家胜
  if (bmap[catKey] === undefined) { g.win = true; g.over = true; MiniGameAudio.play('win'); gSjmaoSaveBest(); return; }
  // 猫朝"到边缘距离最小"的邻格走一步（多个同分时随机挑一个）
  let cands = [], bestDist = 1e9;
  for (const nb of gSjmaoNeighbors(g.cat.q, g.cat.r)) {
    const nk = gSjmaoKey(nb[0], nb[1]);
    if (!g.cells[nk] || g.walls[nk]) continue;
    if (bmap[nk] === undefined) continue;
    if (bmap[nk] < bestDist) { bestDist = bmap[nk]; cands = [{ q: nb[0], r: nb[1] }]; }
    else if (bmap[nk] === bestDist) cands.push({ q: nb[0], r: nb[1] });
  }
  if (!cands.length) { g.win = true; g.over = true; gSjmaoSaveBest(); return; }
  const bestStep = cands[Math.floor(Math.random() * cands.length)];
  g.cat = bestStep;
  if (gSjmaoIsBorder(g.cat.q, g.cat.r)) { g.over = true; g.win = false; }
}
function drawMiniGameSjmao() {
  const L = gSjmaoLayout();
  const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
  gSjmao.lastTick = Date.now();
  drawBackground();
  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 新游戏', 'green');
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('围住神经猫', L.margin, L.titleY);
  const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
  drawScoreBox(L.margin, L.rowB, scoreW, 32, '步数', gSjmao.steps);
  drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最佳', gSjmaoBest);

  const pos = gSjmaoPixel();
  for (const key in gSjmao.cells) {
    const p = pos[key];
    const pr = key.split(',');
    const q = Number(pr[0]), r = Number(pr[1]);
    const isWall = !!gSjmao.walls[key];
    const isCat = (q === gSjmao.cat.q && r === gSjmao.cat.r);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI / 180 * (60 * i - 90);
      const hx = p.x + p.rad * Math.cos(ang);
      const hy = p.y + p.rad * Math.sin(ang);
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    if (isCat) ctx.fillStyle = '#ffd23f';
    else if (isWall) ctx.fillStyle = '#5b6472';
    else ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    if (isWall) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.arc(p.x - p.rad * 0.2, p.y - p.rad * 0.1, p.rad * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + p.rad * 0.25, p.y + p.rad * 0.2, p.rad * 0.16, 0, Math.PI * 2); ctx.fill();
    }
    if (isCat) {
      ctx.fillStyle = '#222'; ctx.font = 'bold ' + Math.floor(p.rad * 0.95) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐱', p.x, p.y);
    }
  }
  ctx.fillStyle = '#fff'; ctx.font = '13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!gSjmao.over) ctx.fillText('点空格子放石头，别让猫逃到边缘', screenWidth / 2, L.boardY + 22);
  else {
    ctx.fillStyle = 'rgba(15,27,45,0.82)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (gSjmao.win) {
      ctx.fillStyle = '#7fffa0'; ctx.font = 'bold 26px Arial';
      ctx.fillText('🎉 围住啦！', screenWidth / 2, screenHeight / 2 - 36);
      ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
      ctx.fillText('用了 ' + gSjmao.steps + ' 步', screenWidth / 2, screenHeight / 2);
    } else {
      ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 26px Arial';
      ctx.fillText('猫跑掉了…', screenWidth / 2, screenHeight / 2 - 36);
      ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
      ctx.fillText('再试一次围住它', screenWidth / 2, screenHeight / 2);
    }
    ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
    ctx.fillText('点「↻ 新游戏」再来', screenWidth / 2, screenHeight / 2 + 34);
  }
}
function handleMiniGameSjmaoInput(x, y) {
  if (!gSjmao) return;
  const L = gSjmaoLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gSjmaoInit(); return; }
  if (gSjmao.over) { gSjmaoInit(); return; }
  gSjmaoTap(x, y);
}

// ==================== 内嵌小游戏：一笔画（一笔连完所有线） ====================
// 移植自「一笔画」：从任意点起笔，沿连线一笔画完所有边即过关。每关图形不同，关卡=已通关数。
let gYbh = null;
let gYbhBest = 0;
const YBH_LEVELS = [
  { name: '三角形', nodes: 3 },
  { name: '正方形', nodes: 4 },
  { name: '五边形', nodes: 5 },
  { name: '小房子', shape: 'house' },
  { name: '六边形', nodes: 6 },
  { name: '五角星', shape: 'star5' },
  { name: '双环', shape: 'fig8' },
  { name: '信封', shape: 'envelope' }
];

function gYbhBuild(idx) {
  const def = YBH_LEVELS[idx];
  let nodes = [], edges = [];
  if (def.shape === 'house') {
    nodes = [[0.2, 0.42], [0.8, 0.42], [0.8, 0.85], [0.2, 0.85], [0.5, 0.16]];
    edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 0], [4, 1]];
  } else if (def.shape === 'envelope') {
    // 经典「信封」：矩形 + 屋顶 + 两条对角线（2 个奇点，可一笔画）
    nodes = [[0.18, 0.34], [0.82, 0.34], [0.82, 0.84], [0.18, 0.84], [0.5, 0.12]];
    edges = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [0, 2], [1, 3]];
  } else if (def.shape === 'star5') {
    // 五角星（一笔画的经典闭合图形，全为偶点）
    const cx = 0.5, cy = 0.5, R = 0.38;
    for (let i = 0; i < 5; i++) { const a = Math.PI / 180 * (360 * i / 5 - 90); nodes.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    edges = [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]];
  } else if (def.shape === 'fig8') {
    nodes = [[0.5, 0.5], [0.3, 0.18], [0.7, 0.18], [0.3, 0.82], [0.7, 0.82]];
    edges = [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 0]];
  } else {
    const n = def.nodes;
    const cx = 0.5, cy = 0.5, R = 0.38;
    for (let i = 0; i < n; i++) { const a = Math.PI / 180 * (360 * i / n - 90); nodes.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
    for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
  }
  return { name: def.name, nodes: nodes, edges: edges };
}
function gYbhLayout() { return gMiniCommonLayout(); }
function gYbhNodePos(i) {
  const L = gYbhLayout();
  const n = gYbh.nodes[i];
  const pad = L.boardW * 0.12;
  const x = L.boardX + pad + n[0] * (L.boardW - pad * 2);
  const y = L.boardY + L.boardH * 0.12 + n[1] * (L.boardH * 0.7);
  return { x: x, y: y };
}
function gYbhInit() {
  gYbh = { level: 0, nodes: [], edges: [], traversed: {}, current: -1, win: false, stuck: false, name: '', lastTick: Date.now() };
  try { gYbhBest = (wx.getStorageSync && wx.getStorageSync('gYbhBest')) || 0; } catch (e) { gYbhBest = 0; }
  gYbhLoad(0);
}
function gYbhLoad(idx) {
  const b = gYbhBuild(idx);
  gYbh.nodes = b.nodes; gYbh.edges = b.edges; gYbh.name = b.name;
  gYbh.traversed = {}; gYbh.current = -1; gYbh.win = false; gYbh.stuck = false;
}
function gYbhNeighborsUntraversed(node) {
  const res = [];
  for (let e = 0; e < gYbh.edges.length; e++) {
    if (gYbh.traversed[e]) continue;
    const a = gYbh.edges[e][0], c = gYbh.edges[e][1];
    if (a === node) res.push({ e: e, to: c });
    else if (c === node) res.push({ e: e, to: a });
  }
  return res;
}
function gYbhTraverse(to) {
  const g = gYbh;
  const opts = gYbhNeighborsUntraversed(g.current);
  for (const o of opts) {
    if (o.to === to) {
      g.traversed[o.e] = true; g.current = to;
      if (Object.keys(g.traversed).length === g.edges.length) {
        g.win = true;
        if (gYbhBest < g.level + 1) { gYbhBest = g.level + 1; try { wx.setStorageSync && wx.setStorageSync('gYbhBest', gYbhBest); } catch (e) {} }
      } else {
        const nxt = gYbhNeighborsUntraversed(g.current);
        if (nxt.length === 0) g.stuck = true;
      }
      return true;
    }
  }
  return false;
}
function gYbhOddNodes() {
  // 奇点（度数为奇数的点）：存在奇点时必须从奇点起笔，否则一定走不通
  const deg = {};
  for (const e of gYbh.edges) { deg[e[0]] = (deg[e[0]] || 0) + 1; deg[e[1]] = (deg[e[1]] || 0) + 1; }
  const res = [];
  for (let i = 0; i < gYbh.nodes.length; i++) if ((deg[i] || 0) % 2 === 1) res.push(i);
  return res;
}
function gYbhNodeAt(x, y) {
  const L = gYbhLayout();
  const rad = Math.min(L.boardW, L.boardH) * 0.08;
  for (let i = 0; i < gYbh.nodes.length; i++) {
    const p = gYbhNodePos(i);
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < rad * rad) return i;
  }
  return -1;
}
function gYbhTap(x, y) {
  const g = gYbh;
  if (!g || g.win || g.stuck) return;
  const L = gYbhLayout();
  if (inRect(x, y, L.backBtn) || inRect(x, y, L.restartBtn)) return;
  const ni = gYbhNodeAt(x, y);
  if (ni < 0) return;
  if (g.current < 0) { g.current = ni; return; }
  MiniGameAudio.play('slide');
  gYbhTraverse(ni);
}
function gYbhDrag(x, y) {
  const g = gYbh;
  if (!g || g.win || g.stuck || g.current < 0) return;
  const ni = gYbhNodeAt(x, y);
  if (ni >= 0) gYbhTraverse(ni);
}
function drawMiniGameYbh() {
  const L = gYbhLayout();
  const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
  gYbh.lastTick = Date.now();
  drawBackground();
  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 重玩', 'green');
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('一笔画', L.margin, L.titleY);
  const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
  drawScoreBox(L.margin, L.rowB, scoreW, 32, '关卡', gYbh.level + 1);
  drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最佳', gYbhBest);

  for (let e = 0; e < gYbh.edges.length; e++) {
    const a = gYbh.edges[e][0], c = gYbh.edges[e][1];
    const pa = gYbhNodePos(a), pc = gYbhNodePos(c);
    ctx.strokeStyle = gYbh.traversed[e] ? '#7fffa0' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = gYbh.traversed[e] ? 6 : 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pc.x, pc.y); ctx.stroke();
  }
  const odd = gYbhOddNodes();
  for (let i = 0; i < gYbh.nodes.length; i++) {
    const p = gYbhNodePos(i);
    // 未起笔时，若图形存在奇点则高亮提示可行起点
    if (gYbh.current < 0 && odd.length > 0 && odd.indexOf(i) >= 0) {
      ctx.strokeStyle = 'rgba(255,215,0,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = (gYbh.current === i) ? '#ffd700' : '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = '#fff'; ctx.font = '13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (gYbh.win) {
    ctx.fillStyle = 'rgba(15,27,45,0.82)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#7fffa0'; ctx.font = 'bold 26px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('🎉 一笔连成！', screenWidth / 2, screenHeight / 2 - 36);
    ctx.fillStyle = '#fff'; ctx.font = '18px Arial';
    ctx.fillText('第 ' + (gYbh.level + 1) + ' 关：' + gYbh.name, screenWidth / 2, screenHeight / 2);
    ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
    ctx.fillText('点击屏幕进入下一关', screenWidth / 2, screenHeight / 2 + 34);
  } else if (gYbh.stuck) {
    ctx.fillStyle = 'rgba(15,27,45,0.82)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#ff9b9b'; ctx.font = 'bold 24px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('卡住了～', screenWidth / 2, screenHeight / 2 - 30);
    ctx.fillStyle = '#fff'; ctx.font = '16px Arial';
    ctx.fillText('这笔走不通，重玩本关', screenWidth / 2, screenHeight / 2 + 4);
    ctx.fillStyle = '#ffd700'; ctx.font = '14px Arial';
    ctx.fillText('点「↻ 重玩」再试', screenWidth / 2, screenHeight / 2 + 34);
  } else {
    ctx.fillText('从任意点起笔，一笔画完所有连线', screenWidth / 2, L.boardY + 20);
    if (gYbh.current < 0) ctx.fillText('👆 点一个圆点开始', screenWidth / 2, L.boardY + 40);
  }
}
function handleMiniGameYbhInput(x, y) {
  if (!gYbh) return;
  const L = gYbhLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  if (gYbh.win) { gYbh.level++; if (gYbh.level >= YBH_LEVELS.length) gYbh.level = 0; gYbhLoad(gYbh.level); return; }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gYbhLoad(gYbh.level); return; }
  if (gYbh.stuck) { gYbhLoad(gYbh.level); return; }
  gYbhTap(x, y);
}

// ==================== 内嵌小游戏：大力射手（拖拽蓄力射门） ====================
// 移植自 HTML5「大力射手」：按住球向后拉蓄力，松手沿抛物线射出，落地距离(km)即得分。最佳=最远。
let gDlsq = null;
let gDlsqBest = 0;
const DLSQ_GRAV = 1400;

function gDlsqSaveBest() {
  if (gDlsqBest < gDlsq.dist) {
    gDlsqBest = gDlsq.dist;
    try { wx.setStorageSync && wx.setStorageSync('gDlsqBest', gDlsqBest); } catch (e) {}
  }
}
function gDlsqLayout() { return gMiniCommonLayout(); }
function gDlsqBallPos() {
  const L = gDlsqLayout();
  // 球抬到棋盘中部偏左：原来贴底(y=boardH-40)导致向下/向左"拉弓"空间不足、蓄不满力。
  // 现在抬到 0.50*boardH 处，下方留约半屏、左侧留约 1/4 屏，可拉满 180px 蓄力。
  return { x: L.boardX + L.boardW * 0.26, y: L.boardY + L.boardH * 0.50 };
}
function gDlsqInit() {
  gDlsq = { state: 'aim', vx: 0, vy: 0, ball: gDlsqBallPos(), startBall: gDlsqBallPos(), drag: null, dist: 0, lastTick: Date.now() };
  try { gDlsqBest = (wx.getStorageSync && wx.getStorageSync('gDlsqBest')) || 0; } catch (e) { gDlsqBest = 0; }
}
function gDlsqUpdate(dt) {
  const g = gDlsq;
  if (g.state === 'fly') {
    g.vy += DLSQ_GRAV * dt;
    g.ball.x += g.vx * dt;
    g.ball.y += g.vy * dt;
    g.dist = Math.max(0, Math.round((g.ball.x - g.startBall.x) / 12)); // 飞行中实时跳数字
    if (g.ball.y >= g.startBall.y) {
      g.ball.y = g.startBall.y;
      g.state = 'land';
      const km = Math.max(0, Math.round((g.ball.x - g.startBall.x) / 12));
      g.dist = km;
      gDlsqSaveBest();
    }
  }
}
function gDlsqDragStart(x, y) {
  const g = gDlsq;
  if (g.state !== 'aim') return;
  const b = g.ball;
  const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
  if (d < 60 * 60) g.drag = { x: x, y: y };
}
function gDlsqDragMove(x, y) {
  const g = gDlsq;
  if (g.state === 'aim' && g.drag) g.drag = { x: x, y: y };
}
function gDlsqDragEnd(x, y) {
  const g = gDlsq;
  if (g.state !== 'aim' || !g.drag) return;
  const b = g.ball;
  const dx = b.x - g.drag.x, dy = b.y - g.drag.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 20) { g.drag = null; return; }
  const power = Math.min(1, len / 180);
  const speed = 300 + power * 1150;
  const ang = Math.atan2(dy, dx);
  g.vx = Math.cos(ang) * speed;
  g.vy = Math.sin(ang) * speed;
  MiniGameAudio.play('shoot');
  g.state = 'fly';
  g.drag = null;
}
function drawMiniGameDlsq() {
  const L = gDlsqLayout();
  const btnTop = Math.min(L.backBtn.y, L.restartBtn.y);
  const now = Date.now();
  const dt = Math.min(0.05, (now - gDlsq.lastTick) / 1000);
  gDlsq.lastTick = now;
  gDlsqUpdate(dt);

  // 复用主游戏战场背景（天空+远山+微光），避免内嵌小游戏背景过于单一
  drawBackground();
  drawMiniGameButton(L.backBtn, '‹ 返回', 'gray');
  drawMiniGameButton(L.restartBtn, '↻ 再来', 'green');
  ctx.fillStyle = '#ffd700'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('大力射手', L.margin, L.titleY);
  const scoreW = (screenWidth - L.margin * 2 - 10) / 2;
  drawScoreBox(L.margin, L.rowB, scoreW, 32, '距离(km)', gDlsq.dist);
  drawScoreBox(L.margin + scoreW + 10, L.rowB, scoreW, 32, '最佳', gDlsqBest);

  const g = gDlsq;
  const groundY = g.startBall.y;
  // 镜头跟随：球最远能飞 1500px，远超屏宽，不跟随就"射出去看不见了"
  const camX = Math.max(0, g.ball.x - (L.boardX + L.boardW * 0.45));
  const bx = g.ball.x - camX;
  // 地面：草地渐变 + 顶部高光，增强纵深（上方露出主游戏天空背景）
  const gg = ctx.createLinearGradient(0, groundY, 0, L.boardY + L.boardH);
  gg.addColorStop(0, '#4a9e3f'); gg.addColorStop(1, '#1f5418');
  ctx.fillStyle = gg;
  ctx.fillRect(L.boardX, groundY, L.boardW, L.boardY + L.boardH - groundY);
  ctx.fillStyle = '#6cc24a';
  ctx.fillRect(L.boardX, groundY, L.boardW, 4);
  // 弹弓（固定在起点的"世界坐标"，随镜头 camX 滚动，不跟着飞行中的球移动）
  const sx = g.startBall.x - camX, sy = g.startBall.y;
  ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx - 15, sy - 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx + 15, sy - 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx, sy + 24); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let km = 1; km * 12 - camX < L.boardW; km++) {
    const mx = L.boardX + km * 12 - camX;
    if (mx < L.boardX) continue;
    ctx.fillRect(mx, groundY, 1, 10);
    if (km % 5 === 0) ctx.fillText(km + 'km', mx, groundY + 12);
  }
  if (g.state === 'aim' && g.drag) {
    const dx = g.ball.x - g.drag.x, dy = g.ball.y - g.drag.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len >= 20) {
      const ang = Math.atan2(dy, dx);
      const power = Math.min(1, len / 180);
      const speed = 300 + power * 1150;
      let px = g.ball.x, py = g.ball.y, pvx = Math.cos(ang) * speed, pvy = Math.sin(ang) * speed;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 40; i++) { pvy += DLSQ_GRAV * 0.03; px += pvx * 0.03; py += pvy * 0.03; if (py > groundY) break; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(g.ball.x, g.ball.y); ctx.lineTo(g.drag.x, g.drag.y); ctx.stroke(); ctx.setLineDash([]);
  }
  // 球飞得过高超出棋盘顶部时，贴顶画个提示位，避免"球消失"
  const topY = L.boardY + 8;
  const drawY = Math.max(topY, g.ball.y);
  ctx.globalAlpha = (g.ball.y < topY) ? 0.5 : 1;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(bx, drawY, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 1;
  // 拉弓时画两根皮筋连到弹弓叉口
  if (g.state === 'aim' && g.drag) {
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx - 15, sy - 26); ctx.lineTo(bx, drawY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 15, sy - 26); ctx.lineTo(bx, drawY); ctx.stroke();
  }
  if (g.ball.y < topY) {
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▲', bx, topY - 6);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (g.state === 'aim') ctx.fillText('按住球向后拉，松手射门！', screenWidth / 2, L.boardY + 24);
  else if (g.state === 'land') {
    ctx.fillStyle = 'rgba(15,27,45,0.7)'; ctx.fillRect(0, 0, screenWidth, btnTop - 8);
    ctx.fillStyle = '#7fffa0'; ctx.font = 'bold 26px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText('射出 ' + g.dist + ' km！', screenWidth / 2, screenHeight / 2 - 30);
    ctx.fillStyle = '#fff'; ctx.font = '15px Arial';
    ctx.fillText('点「↻ 再来」再射一次', screenWidth / 2, screenHeight / 2 + 6);
  }
}
function handleMiniGameDlsqInput(x, y) {
  if (!gDlsq) return;
  const L = gDlsqLayout();
  if (inRect(x, y, L.backBtn)) { flushMiniGameSeconds(); activeMiniGame = null; otherGamesModal.show = true; return; }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gDlsqInit(); return; }
  if (gDlsq.state === 'land') { gDlsqInit(); return; }
  gDlsqDragEnd(x, y);
}

// 世界Tab点击处理
function handleWorldClick(x, y) {
    const navH = MAIN_MENU_NAV_H;
    const padding = 15;
    // 必须与 drawMainMenuWorld 的地图布局完全一致，否则点到的省份和命中的省份错位
    const mapY = SAFE_TOP_OFFSET + 40;
    const mapW = screenWidth - padding * 2;
    const mapX = padding;
    const mapH = mapW;

    // 检查是否点击了地图区域
    if (x < mapX || x > mapX + mapW || y < mapY || y > mapY + mapH) {
        selectedProvince = null;
        return;
    }

    // 计算在地图内的相对坐标
    const relX = (x - mapX) / mapW * 340;
    const relY = (y - mapY) / mapH * 340;

    // 查找点击的省份
    for (const p of PROVINCES) {
        if (relX >= p.x && relX < p.x + p.w && relY >= p.y && relY < p.y + p.h) {
            if (p.name === '山东') {
                // 技能实验室入口：复用第一关（霜冻平原）配置，进入全技能自由选择模式
                currentStage = 1;
                isSkillLab = true;
                startGame();
                return;
            }
            selectedProvince = p.name;
            return;
        }
    }

    selectedProvince = null;
}

function handleMainMenuTouch(x, y) {
    const navY = screenHeight - MAIN_MENU_NAV_H;
    
    // 点击底部导航
    if (y >= navY) {
        const btnW = screenWidth / MAIN_MENU_TABS.length;
        const tabIndex = Math.floor(x / btnW);
        if (tabIndex >= 0 && tabIndex < MAIN_MENU_TABS.length) {
            const newTab = MAIN_MENU_TABS[tabIndex].id;
            // 屏蔽商城Tab点击
            if (newTab === 'shop') return;
            // 离开游戏圈Tab时隐藏原生按钮
            if (mainMenuTab === 'club' && newTab !== 'club') {
                hideGameClubButton();
            }
            mainMenuTab = newTab;
            if (mainMenuTab === 'level') {
                mainMenuExpandedChapter = 1; // 切到关卡默认展开第1章
            }
        }
        return;
    }
    
    // 关卡Tab的章节/关卡点击
    if (mainMenuTab === 'level') {
        let currentY = 50;
        
        for (const chapter of CHAPTERS) {
            const isExpanded = mainMenuExpandedChapter === chapter.id && chapter.unlocked;
            const chapterH = isExpanded ? 210 : 70;
            
            // 点击章节头部（展开/折叠）
            if (y >= currentY && y <= currentY + 60 && x >= 15 && x <= screenWidth - 15) {
                if (chapter.unlocked) {
                    mainMenuExpandedChapter = mainMenuExpandedChapter === chapter.id ? 0 : chapter.id;
                }
                return;
            }
            
            // 点击关卡卡片
            if (isExpanded) {
                const cardW = (screenWidth - 70) / 3;
                const cardH = 70;
                const gap = 8;
                const startX = 25;
                const startCardY = currentY + 75;
                
                chapter.levels.forEach((levelNum, li) => {
                    const col = li % 3;
                    const row = Math.floor(li / 3);
                    const cx = startX + col * (cardW + gap);
                    const cy = startCardY + row * (cardH + gap);
                    
                    const stageIdx = levelNum - 1;
                    const isUnlocked = stageIdx === 0 || stageProgress[stageIdx - 1];
                    
                    if (isUnlocked && x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
                        currentStage = levelNum;
                        isAdDemoMode = (levelNum === 1);
                        isSkillLab = false;
                        startGame();
                    }
                });
            }
            
            currentY += chapterH + 10;
        }
    }

    // 主角Tab的设置按钮点击
    if (mainMenuTab === 'hero') {
        // 使用与drawMainMenuHero相同的计算逻辑
        const contentTotalH = 220;
        const contentTop = (screenHeight - MAIN_MENU_NAV_H - contentTotalH) / 2;
        const avatarY = contentTop + 40;
        const avatarR = 40;
        const panelY = avatarY + avatarR + 45;
        const panelH = 115;
        const panelW = screenWidth - 30;
        const settingsBtnY = panelY + panelH + 20;
        const settingsBtnH = 45;
        const panelX = 15;

        if (x >= panelX && x <= panelX + panelW && y >= settingsBtnY && y <= settingsBtnY + settingsBtnH) {
            settingsModal.show = true;
            settingsPage = 'main';
            settingsJustOpened = true;  // 标记弹窗刚打开，防止本次touchend触发关闭
        }

        // 其他游戏按钮（位于游戏设置下方）
        const otherGamesBtnY = settingsBtnY + settingsBtnH + 12;
        const otherGamesBtnH = 45;
        if (x >= panelX && x <= panelX + panelW && y >= otherGamesBtnY && y <= otherGamesBtnY + otherGamesBtnH) {
            otherGamesModal.show = true;
            otherGamesScrollY = 0;
            otherGamesExpanded = false;
            ensureMiniGameStatsLoaded();
        }
    }
}

// ==================== 游戏循环 ====================
function gameLoop() {
    const now = Date.now();
    const dt = Math.min(now - lastTime, 50);
    
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    
    // 内嵌小游戏累计时长：每 10 秒刷一次本地存储，避免崩溃丢数据
    if (gameState === 'mainMenu' && activeMiniGame && Date.now() - miniGameLastFlush > 10000) {
        flushMiniGameSeconds();
        miniGameLastFlush = Date.now();
    }

    if (gameState === 'mainMenu') {
        if (activeMiniGame === '2048') {
            drawMiniGame2048();
        } else if (activeMiniGame === 'qmxzfzm') {
            drawMiniGameQmxz();
        } else if (activeMiniGame === 'bdsjm') {
            drawMiniGameBdsjm();
        } else if (activeMiniGame === 'beishumen') {
            drawMiniGameSq();
        } else if (activeMiniGame === 'qiexigua') {
            drawMiniGameQiexigua();
        } else if (activeMiniGame === 'feidegenggao') {
            drawMiniGameFeidegenggao();
        } else if (activeMiniGame === 'bunengsi') {
            drawMiniGameBunengsi();
        } else if (activeMiniGame === 'xiaoniaofeifei') {
            drawMiniGameXnf();
        } else if (activeMiniGame === 'zuiqiangyanli') {
            drawMiniGameZqyl();
        } else if (activeMiniGame === 'qingwa') {
            drawMiniGameQingwa();
        } else if (activeMiniGame === 'sqsdscj') {
            drawMiniGameSqsd();
        } else if (activeMiniGame === 'shenjingmao') {
            drawMiniGameSjmao();
        } else if (activeMiniGame === 'yibihua') {
            drawMiniGameYbh();
        } else if (activeMiniGame === 'sheqiu') {
            drawMiniGameDlsq();
        } else {
            // 实时更新体力
            updateEnergyRealtime();
            drawMainMenu();
        }
    } else if (gameState === 'start') {
        drawStartScreen();
    } else if (gameState === 'stageSelect') {
        drawStageSelect();
    } else if (gameState === 'playing') {
        if (!gamePaused) {
            gameTime += dt;
            update(dt);
        }
        
        drawBackground();
        drawFieldBorders();       // 战场左右透明边界（敌人身体边缘不可越界，视觉提示）
        drawOrbs();
        drawWall();               // 城墙（先画，置于子弹下层；子弹绘制于城墙之上）
        drawBullets();
        drawParticles();
        drawHitEffects();
        drawLightnings();
        drawDeathRays();
        drawBombExplosions();
        drawFields();
        drawEarthSpikes();        // 地刺绘制于僵尸下层（从地面向上突起，被敌人压在上方，与滚木相反）
        drawEarthSinkholes();     // 陷坑场地绘制于僵尸下层（深色漩涡坑）

        const drawNow = Date.now();
        for (const zombie of zombies) {
            drawZombie(zombie, drawNow);
        }

        drawLogs();               // 滚木绘制于僵尸上层（碾压时压在怪身上）
        drawEarthShields();       // 岩盾绘制于僵尸上层（挡在敌人路径上）

        drawWallHealthBar();      // 城墙血条（整组下沿贴齐城墙下沿，先画）
        drawPlayer();             // 坦克绘制于血条上层
        drawDamageNumbers();
        drawUI();

        // 素材演示引导
        if (isAdDemoMode) {
            drawAdDemoGuide();
        }

        if (gamePaused) {
            drawPauseModal();
        }
    } else if (gameState === 'upgrade') {
        drawBackground();
        drawFieldBorders();       // 升级暂停时仍显示战场边界
        drawEarthSpikes();        // 升级暂停时仍把地刺压在怪下层
        drawEarthSinkholes();     // 升级暂停时仍把陷坑压在怪下层
        const drawNow2 = Date.now();
        for (const zombie of zombies) {
            drawZombie(zombie, drawNow2);
        }
        drawLogs();               // 升级暂停时仍把滚木压在怪上层
        drawEarthShields();       // 升级暂停时仍把岩盾压在怪上层
        drawWall();
        drawWallHealthBar();
        drawPlayer();
        drawFields();
        drawUpgradePanel();
    } else if (gameState === 'gameOver') {
        drawBackground();
        drawFieldBorders();       // 结算界面仍显示战场边界
        drawEarthSpikes();        // 结算界面仍把地刺压在怪下层
        drawEarthSinkholes();     // 结算界面仍把陷坑压在怪下层
        const drawNow3 = Date.now();
        for (const zombie of zombies) {
            drawZombie(zombie, drawNow3);
        }
        drawLogs();               // 结算界面仍把滚木压在怪上层
        drawEarthShields();       // 结算界面仍把岩盾压在怪上层
        drawWall();
        drawWallHealthBar();
        drawPlayer();
        drawGameOver();
    } else if (gameState === 'victory') {
        drawBackground();
        drawPlayer();
        drawVictory();
    }
    
    lastTime = now;
    requestAnimationFrame(gameLoop);
}

// ==================== 触摸事件 ====================
wx.onTouchStart((e) => {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    // 内嵌小游戏（2048等）：捕获滑动起点并拦截主界面交互
    if (gameState === 'mainMenu' && activeMiniGame) {
        miniGameTouchStartX = x;
        miniGameTouchStartY = y;
        if (activeMiniGame === 'qiexigua' && gQiexigua) gQiexigua.lastSlice = null;
        if (activeMiniGame === 'feidegenggao' && gFeidegenggao) gFeidegenggao.player.targetX = x;
        // 一个都不能死：起跳要跟手，放在 touchStart 立即响应
        if (activeMiniGame === 'bunengsi' && gBunengsi) gBunengsiTap(x, y);
        if (activeMiniGame === 'xiaoniaofeifei' && gXnf) gXnfFlap(x, y);
        if (activeMiniGame === 'sheqiu' && gDlsq) gDlsqDragStart(x, y);
        if (activeMiniGame === 'yibihua' && gYbh) gYbhTap(x, y);
        return;
    }

    if (gameState === 'mainMenu') {
        // 其他游戏选择页打开时，进入页内滚动/点击处理（屏蔽主界面交互）
        if (otherGamesModal.show) {
            ogTouchStartX = x; ogTouchStartY = y; ogDragStartY = y; ogDragStartScrollY = otherGamesScrollY; isOgDragging = false;
            return;
        }

        const navY = screenHeight - MAIN_MENU_NAV_H;
        
        // 点击底部导航
        if (y >= navY) {
            const btnW = screenWidth / MAIN_MENU_TABS.length;
            const tabIndex = Math.floor(x / btnW);
            if (tabIndex >= 0 && tabIndex < MAIN_MENU_TABS.length) {
                const newTab = MAIN_MENU_TABS[tabIndex].id;
                if (newTab !== mainMenuTab) {  // Tab有变化时才切换
                    // 离开游戏圈Tab时隐藏原生按钮
                    if (mainMenuTab === 'club') {
                        hideGameClubButton();
                    }
                    mainMenuTab = newTab;
                    if (mainMenuTab === 'level') {
                        mainMenuExpandedChapter = 1;
                        levelScrollY = 0; // 切换Tab时重置滚动
                    }
                    // 切换Tab时重置触摸起点，避免残留坐标导致误触
                    levelTouchStartX = x;
                    levelTouchStartY = y;
                }
            }
            return;
        }
        
        // 关卡Tab：启动长按检测
        if (mainMenuTab === 'level') {
            levelTouchStartX = x;
            levelTouchStartY = y;
            levelDragStartY = y;
            levelDragStartScrollY = levelScrollY;
            isLevelDragging = false;
            
            // 清除之前的长按定时器
            if (levelLongPressTimer) {
                clearTimeout(levelLongPressTimer);
            }
            
            // 启动1秒长按定时器
            isLevelLongPressing = true;
            levelLongPressTimer = setTimeout(() => {
                if (isLevelLongPressing) {
                    isLevelDragging = true;
                }
            }, LEVEL_LONG_PRESS_DURATION);
        }

        // 排行榜Tab：设置拖动参数
        if (mainMenuTab === 'rank') {
            rankTouchStartX = x;
            rankTouchStartY = y;
            rankDragStartY = y;
            rankDragStartScrollY = rankScrollY;
            isRankDragging = false;
        }

        // 商城暂时屏蔽
        // if (mainMenuTab === 'shop') {
        //     levelTouchStartX = x;
        //     levelTouchStartY = y;
        //     shopTouchStartY = y;
        //     shopDragStartY = y;
        //     shopDragStartScrollY = shopScrollY;
        //     isShopDragging = false;
        // }

        // 主角Tab：设置触摸起点
        if (mainMenuTab === 'hero') {
            levelTouchStartX = x;  // 复用levelTouchStart坐标
            levelTouchStartY = y;
        }

        // 天赋Tab：设置触摸起点 + 拖动滚动起点
        if (mainMenuTab === 'talent') {
            levelTouchStartX = x;  // 复用levelTouchStart坐标（用于点击命中）
            levelTouchStartY = y;
            talentDragStartY = y;
            talentDragStartX = x;
            talentDragStartScrollX = talentScrollX;
            isTalentDragging = false;
        }

        // 世界Tab：设置触摸起点（否则 handleWorldClick 用到的 levelTouchStart 会停留在切 tab 时的导航坐标，导致点省份无反应）
        if (mainMenuTab === 'world') {
            levelTouchStartX = x;
            levelTouchStartY = y;
        }
    } else if (gameState === 'start') {
        const btnW = 140, btnH = 45;
        const btnX = screenWidth / 2 - btnW / 2;
        const btnY = screenHeight * 0.68;

        // 开始游戏按钮 -> 直接开始第一关
        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            currentStage = 1;
            isAdDemoMode = true;
            startGame();
            return;
        }
    } else if (gameState === 'stageSelect') {
        const cols = 2;
        const cardW = (screenWidth - 40) / cols - 10;
        const cardH = 100;
        
        STAGES.forEach((stage, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = 20 + col * (cardW + 10);
            const cy = 80 + row * (cardH + 10);
            
            const isUnlocked = i === 0 || stageProgress[i - 1];
            
            if (isUnlocked && x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
                currentStage = stage.id;
                // 第一关自动启用买量引导模式
                isAdDemoMode = (stage.id === 1);
                startGame();
            }
        });
    } else if (gameState === 'playing') {
        // 清除可能存在的关卡拖动状态（从主菜单进入战斗后，定时器可能还在运行）
        if (levelLongPressTimer) {
            clearTimeout(levelLongPressTimer);
            levelLongPressTimer = null;
        }
        isLevelDragging = false;
        isLevelLongPressing = false;
        // 重置触摸坐标，防止残留的触摸位置在返回主菜单后误触发关卡点击
        levelTouchStartX = 0;
        levelTouchStartY = 0;

        // 检查右上角按钮（音效+暂停）
        if (x >= soundBtnX && x <= soundBtnX + buttonSize && y >= soundBtnY && y <= soundBtnY + buttonSize) {
            soundEnabled = !soundEnabled;
            return;
        }

        if (x >= pauseBtnX && x <= pauseBtnX + buttonSize && y >= pauseBtnY && y <= pauseBtnY + buttonSize) {
            gamePaused = !gamePaused;
            if (!gamePaused) {
                lastTime = Date.now();
            }
            return;
        }

        // 检查暂停面板按钮（与drawPauseModal一致）
        if (gamePaused) {
            const modalW = 220;
            const modalH = 160;
            const modalX = (screenWidth - modalW) / 2;
            const modalY = screenHeight - 130 - modalH;

            const btnSize = 48;
            const gap = 15;
            const totalW = btnSize * 2 + gap;
            const startX = screenWidth / 2 - totalW / 2;
            const btnY = modalY + 65;

            // 继续按钮
            if (x >= startX && x <= startX + btnSize && y >= btnY && y <= btnY + btnSize) {
                gamePaused = false;
                lastTime = Date.now();
                return;
            }

            // 关卡按钮
            if (x >= startX + btnSize + gap && x <= startX + btnSize + gap + btnSize && y >= btnY && y <= btnY + btnSize) {
                levelReturnHandled = true;  // 标记已处理，防止触摸结束时误触发
                // 将本次关卡获得的金币累加到总金币
                player.gold = goldAtStageStart + player.gold;
                savePlayerData();  // 保存玩家数据
                gameState = 'mainMenu';
                mainMenuTab = 'level';  // 确保回到关卡Tab
                isSkillLab = false;
                gamePaused = false;
                return;
            }
        } else {
            // 使用炸弹（圆形按钮检测，与drawBombButton一致）
            const btnX = screenWidth - 48;
            const btnY = screenHeight - 48;
            const btnR = 30; // 稍微大一点的点击区域
            const dist = Math.hypot(x - btnX, y - btnY);
            
            if (dist <= btnR) {
                if (bombCount > 0 && bombCooldown <= 0) {
                    if (isAdDemoMode && !adBombExploded) {
                        adDemoBombExplosion();
                    } else {
                        useBomb();
                    }
                } else {
                    // 无弹 / 冷却中：看激励视频广告，达标后补发一颗炸弹并立即释放
                    if (adWatchCount >= AD_WATCH_MAX_PER_LEVEL) {
                        // 每关看广告次数已达上限（3 次），不再弹出广告
                        if (typeof wx !== 'undefined' && wx.showToast) {
                            wx.showToast({ title: '本关观看次数已用完', icon: 'none' });
                        }
                    } else {
                        showRewardedAd(() => grantAdBombAndRelease());
                    }
                }
            }
        }
    } else if (gameState === 'upgrade') {
        if (isSkillLab) {
            // 技能实验室：网格点击检测（与getUpgradeListLayout一致）
            const L = getUpgradeListLayout();
            if (y >= L.gridTop && y <= L.gridTop + L.rows * L.rowH && x >= L.panelX && x <= L.panelX + L.panelW) {
                const col = Math.floor((x - L.panelX) / (L.cellW + L.cellGap));
                const row = Math.floor((y - L.gridTop) / L.rowH);
                const idx = row * L.cols + col;
                if (col >= 0 && col < L.cols && row >= 0 && row < L.rows && idx >= 0 && idx < L.n) {
                    applyUpgrade(upgradeOptions[idx]);
                    return;
                }
            }
        } else {
        // 三个卡片并排布局的点击检测（与drawUpgradePanel一致）
        const cardW = UPGRADE_CARD_W;
        const cardH = UPGRADE_CARD_H;
        const cardGap = UPGRADE_CARD_GAP;
        const totalWidth = cardW * 3 + cardGap * 2;

        // 计算面板高度（与绘制代码一致）
        let bombReminderH = 0;
        if (justGotBomb) {
            bombReminderH = 48;
        } else if (bombFull) {
            bombReminderH = 36;
        }
        const titleH = 45;
        const padding = 20;
        const panelH = titleH + bombReminderH + cardH + padding * 2 + 10;

        const panelX = Math.max(10, (screenWidth - totalWidth) / 2 - 25);
        const panelY = screenHeight - 130 - panelH;
        const panelW = Math.min(screenWidth - 20, totalWidth + 50);

        // 卡片起始Y = panelY + titleH + bombReminderH + padding + 5
        const startY = panelY + titleH + bombReminderH + padding + 5;
        const startX = (screenWidth - totalWidth) / 2;
        
        for (let i = 0; i < upgradeOptions.length; i++) {
            const cx = startX + i * (cardW + cardGap);
            const cy = startY;
            if (x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
                applyUpgrade(upgradeOptions[i]);
                break;
            }
        }
        }
    } else if (gameState === 'gameOver') {
        // 与drawGameOver一致的弹窗位置（正方形按钮：重玩 / 变强 / 返回）
        const modalW = Math.min(300, screenWidth * 0.85);
        const modalH = 248;
        const modalX = (screenWidth - modalW) / 2;
        const modalY = screenHeight - 130 - modalH;

        const btnSize = 42;
        const gap = 12;
        const totalW = btnSize * 3 + gap * 2;
        const startX = screenWidth / 2 - totalW / 2;
        const btnY = modalY + 184;

        if (y >= btnY && y <= btnY + btnSize) {
            if (x >= startX && x <= startX + btnSize) {
                // 重玩
                startGame();
                return;
            } else if (x >= startX + (btnSize + gap) && x <= startX + (btnSize + gap) + btnSize) {
                // 变强：进入天赋页
                levelReturnHandled = true;  // 标记已处理
                gameState = 'mainMenu';
                mainMenuTab = 'talent';
                talentPage = 'root';
                talentScrollX = 0;
                isSkillLab = false;
                return;
            } else if (x >= startX + (btnSize + gap) * 2 && x <= startX + totalW) {
                // 返回：回到关卡选择
                levelReturnHandled = true;  // 标记已处理
                gameState = 'mainMenu';
                mainMenuTab = 'level';  // 确保回到关卡Tab
                isSkillLab = false;
                return;
            }
        }
    } else if (gameState === 'victory') {
        // 与drawVictory一致的弹窗位置（正方形按钮：下一关 / 重玩 / 关卡）
        const modalW = Math.min(300, screenWidth * 0.85);
        const modalH = 268;
        const modalX = (screenWidth - modalW) / 2;
        const modalY = screenHeight - 130 - modalH;

        const btnSize = 48;
        const gap = 15;
        const btnY = modalY + 186;
        const btnCount = (currentStage < STAGES.length) ? 3 : 2;
        const totalW = btnSize * btnCount + gap * (btnCount - 1);
        const startX = screenWidth / 2 - totalW / 2;

        if (y >= btnY && y <= btnY + btnSize) {
            let idx = -1;
            for (let i = 0; i < btnCount; i++) {
                const bx = startX + i * (btnSize + gap);
                if (x >= bx && x <= bx + btnSize) { idx = i; break; }
            }
            if (idx < 0) return;
            if (currentStage < STAGES.length) {
                // 3 按钮：0=下一关, 1=重玩, 2=关卡
                if (idx === 0) {
                    currentStage++;
                    startGame();
                    return;
                } else if (idx === 1) {
                    startGame();
                    return;
                } else {
                    levelReturnHandled = true;
                    gameState = 'mainMenu';
                    mainMenuTab = 'level';
                    isSkillLab = false;
                    return;
                }
            } else {
                // 全通关 2 按钮：0=重玩, 1=关卡
                if (idx === 0) {
                    startGame();
                    return;
                } else {
                    levelReturnHandled = true;
                    gameState = 'mainMenu';
                    mainMenuTab = 'level';
                    isSkillLab = false;
                    return;
                }
            }
        }
    }
});

// 触摸移动处理（拖动滚动）
wx.onTouchMove((e) => {
    if (gameState !== 'mainMenu') return;

    // 内嵌小游戏（忍者切水果）：滑动切割
    if (gameState === 'mainMenu' && activeMiniGame === 'qiexigua') {
        const mt = e.touches[0];
        gQiexiguaSlice(mt.clientX, mt.clientY);
        return;
    }

    // 内嵌小游戏（我要飞的更高）：拖动控制左右
    if (gameState === 'mainMenu' && activeMiniGame === 'feidegenggao') {
        gFeidegenggao.player.targetX = e.touches[0].clientX;
        return;
    }

    // 内嵌小游戏（一个都不能死）：不响应拖动，避免误触发后面的菜单滚动
    if (gameState === 'mainMenu' && activeMiniGame === 'bunengsi') return;
    if (gameState === 'mainMenu' && activeMiniGame === 'xiaoniaofeifei') return;
    // 大力射手：拖动蓄力
    if (gameState === 'mainMenu' && activeMiniGame === 'sheqiu') {
        const sm = e.touches[0];
        if (gDlsq) gDlsqDragMove(sm.clientX, sm.clientY);
        return;
    }
    // 一笔画：拖动连线
    if (gameState === 'mainMenu' && activeMiniGame === 'yibihua') {
        const sm = e.touches[0];
        if (gYbh) gYbhDrag(sm.clientX, sm.clientY);
        return;
    }

    // 内嵌小游戏（守桥射击）：拖动控制玩家横向走位
    if (gameState === 'mainMenu' && activeMiniGame === 'beishumen') {
        const sqm = e.touches[0];
        if (gSq && !gSq.gameOver && !gSq.win && !gSq.factionChoice) {
            gSq.playerX = Math.max(gSq.radius, Math.min(screenWidth - gSq.radius, sqm.clientX));
        }
        return;
    }

    // 兜底：其余内嵌小游戏（2048/qmxzfzm/bdsjm/最强眼力/青蛙/数钱/围猫）不需要拖动，
    // 直接吞掉，避免手指划动穿透到背后的关卡Tab/其他游戏页滚动
    if (activeMiniGame) return;

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    // 其他游戏页滚动
    if (otherGamesModal.show) {
        if (!isOgDragging && Math.abs(y - ogDragStartY) > 10) isOgDragging = true;
        if (isOgDragging) {
            const layout = computeOtherGamesLayout();
            otherGamesScrollY = Math.max(-layout.maxScroll, Math.min(0, ogDragStartScrollY + (y - ogDragStartY)));
        }
        return;
    }

    // 关卡Tab滚动
    if (mainMenuTab === 'level' && isLevelDragging) {
        const deltaY = y - levelDragStartY;
        levelScrollY = levelDragStartScrollY + deltaY * LEVEL_SCROLL_SENSITIVITY;
    }

    // 天赋Tab滚动（横版：左右拖动；超过10px判定为滚动，避免误触节点）
    if (mainMenuTab === 'talent') {
        if (!isTalentDragging && Math.abs(x - talentDragStartX) > 10) {
            isTalentDragging = true;
        }
        if (isTalentDragging) {
            const deltaX = x - talentDragStartX;
            talentScrollX = talentDragStartScrollX + deltaX;
        }
    }

    // 排行榜Tab滚动
    if (mainMenuTab === 'rank') {
        // 判断是否开始拖动（移动超过10px）
        if (!isRankDragging && Math.abs(y - rankDragStartY) > 10) {
            isRankDragging = true;
        }

        if (isRankDragging) {
            const deltaY = y - rankDragStartY;
            rankScrollY = rankDragStartScrollY - deltaY;

            // 限制滚动范围（使用动态数据长度）
            let totalItems;
            if (rankTab === 'global') {
                const playerPower = calculatePower();
                // 判断玩家是否在列表中：玩家战力 > 列表最后一位
                const lastPower = rankCityData[rankCityData.length - 1].power;
                totalItems = playerPower > lastPower ? rankCityData.length + 1 : rankCityData.length;
            } else {
                const playerExists = rankFriendData.some(item => item.name === heroData.name);
                totalItems = playerExists ? rankFriendData.length : rankFriendData.length + 1;
            }
            const itemH = 50;
            const listY = 105;
            const listH = screenHeight - listY - MAIN_MENU_NAV_H - 10;
            const contentH = totalItems * itemH;
            const maxScroll = Math.max(0, contentH - listH);
            rankScrollY = Math.max(0, Math.min(maxScroll, rankScrollY));
        }
    }

    // 商城Tab滚动暂时屏蔽
    // if (mainMenuTab === 'shop' && isShopDragging) {
    //     const deltaY = y - shopDragStartY;
    //     shopScrollY = shopDragStartScrollY + deltaY * 1.5;
    //
    //     // 限制滚动范围
    //     const items = SHOP_ITEMS[currentShopCategory];
    //     const cardRows = Math.ceil(items.length / 2);
    //     const cardH = 120;
    //     const cardGap = 10;
    //     const padding = 15;
    //     const tabY = SAFE_TOP_OFFSET + 65 + 35 + 15;
    //     const listH = screenHeight - tabY - MAIN_MENU_NAV_H - 20;
    //     const totalH = cardRows * (cardH + cardGap);
    //     const maxScroll = Math.max(0, totalH - listH);
    //     shopScrollY = Math.max(0, Math.min(maxScroll, shopScrollY));
    // }
});

// 触摸结束处理
wx.onTouchEnd((e) => {
    // 获取触摸终点的实际坐标
    const touchEnd = e.changedTouches[0];
    const endX = touchEnd.clientX;
    const endY = touchEnd.clientY;

    // 清除长按定时器
    if (levelLongPressTimer) {
        clearTimeout(levelLongPressTimer);
        levelLongPressTimer = null;
    }

    // 如果点击了"返回关卡/主界面"按钮，不处理后续点击逻辑
    if (levelReturnHandled) {
        levelReturnHandled = false;  // 重置标记
        isLevelLongPressing = false;
        isLevelDragging = false;
        return;
    }

    // 其他游戏选择页显示时，只处理页内点击，屏蔽主界面交互（单次点击即生效）
    if (otherGamesModal.show) {
        if (!isOgDragging) handleOtherGamesClick(endX, endY);
        isOgDragging = false;
        return;
    }

    // 内嵌小游戏（2048）：滑动移动 + 按钮点击
    if (gameState === 'mainMenu' && activeMiniGame === '2048') {
        handleMiniGame2048Input(endX, endY);
        return;
    }

    // 内嵌小游戏（全民寻找房祖名）：点击找房祖名 + 按钮点击
    if (gameState === 'mainMenu' && activeMiniGame === 'qmxzfzm') {
        handleMiniGameQmxzInput(endX, endY);
        return;
    }

    // 内嵌小游戏（暴打神经猫）：点目标行的猫列 + 按钮点击
    if (gameState === 'mainMenu' && activeMiniGame === 'bdsjm') {
        handleMiniGameBdsjmInput(endX, endY);
        return;
    }

    // 内嵌小游戏（守桥射击）：按钮点击 + 拖动定位（拖动由 touchMove 处理）
    if (gameState === 'mainMenu' && activeMiniGame === 'beishumen') {
        handleMiniGameSqInput(endX, endY);
        return;
    }

    // 内嵌小游戏（忍者切水果）：按钮点击（切割由 touchMove 处理）
    if (gameState === 'mainMenu' && activeMiniGame === 'qiexigua') {
        handleMiniGameQiexiguaInput(endX, endY);
        return;
    }

    // 内嵌小游戏（我要飞的更高）：按钮点击（左右控制由 touchMove 处理）
    if (gameState === 'mainMenu' && activeMiniGame === 'feidegenggao') {
        handleMiniGameFeidegenggaoInput(endX, endY);
        return;
    }

    // 内嵌小游戏（一个都不能死）：按钮点击（起跳由 touchStart 处理）
    if (gameState === 'mainMenu' && activeMiniGame === 'bunengsi') {
        handleMiniGameBunengsiInput(endX, endY);
        return;
    }

    if (gameState === 'mainMenu' && activeMiniGame === 'xiaoniaofeifei') {
        handleMiniGameXnfInput(endX, endY);
        return;
    }

    // 内嵌小游戏（最强眼力）：点杯猜币
    if (gameState === 'mainMenu' && activeMiniGame === 'zuiqiangyanli') {
        handleMiniGameZqylInput(endX, endY);
        return;
    }

    // 内嵌小游戏（小青蛙过河）：点青蛙跳
    if (gameState === 'mainMenu' && activeMiniGame === 'qingwa') {
        handleMiniGameQingwaInput(endX, endY);
        return;
    }

    // 内嵌小游戏（数钱数到手抽筋）：点屏幕数钱
    if (gameState === 'mainMenu' && activeMiniGame === 'sqsdscj') {
        handleMiniGameSqsdInput(endX, endY);
        return;
    }

    // 内嵌小游戏（围住神经猫）：点格放石头
    if (gameState === 'mainMenu' && activeMiniGame === 'shenjingmao') {
        handleMiniGameSjmaoInput(endX, endY);
        return;
    }

    // 内嵌小游戏（一笔画）：起点/连线/按钮
    if (gameState === 'mainMenu' && activeMiniGame === 'yibihua') {
        handleMiniGameYbhInput(endX, endY);
        return;
    }

    // 内嵌小游戏（大力射手）：蓄力结束/按钮
    if (gameState === 'mainMenu' && activeMiniGame === 'sheqiu') {
        handleMiniGameDlsqInput(endX, endY);
        return;
    }

    // 如果没有真正拖动，且在关卡Tab，执行点击处理
    if (!isLevelDragging && gameState === 'mainMenu' && mainMenuTab === 'level' && !gamePaused) {
        const navY = screenHeight - MAIN_MENU_NAV_H;
        if (levelTouchStartY < navY && levelTouchStartY >= SAFE_TOP_OFFSET) {
            // 在内容区域，执行点击处理（使用记录的起始位置）
            handleLevelClick(levelTouchStartX, levelTouchStartY);
        }
    }

    // 如果没有真正拖动，且在天赋Tab，执行点击处理
    if (!isLevelDragging && gameState === 'mainMenu' && mainMenuTab === 'talent' && !gamePaused) {
        if (!talentModal.show) {
            // 先判断是否点中分栏子页 Tab（根脉/五行/统御/防御），命中则切换并不触发节点点击
            if (!isTalentDragging && handleTalentTabClick(levelTouchStartX, levelTouchStartY)) {
                // 已切换子页
            } else if (!isTalentDragging) {
                handleTalentClick(levelTouchStartX, levelTouchStartY);
            }
        } else {
            // 弹窗显示时，处理按钮点击（关闭/升级）
            handleTalentModalClick(endX, endY);
        }
    }

    // 排行榜Tab的Tab切换点击检测
    if (gameState === 'mainMenu' && mainMenuTab === 'rank' && !isRankDragging) {
        const topOffset = SAFE_TOP_OFFSET;
        const tabY = topOffset + 40;
        const tabH = 40;
        const tabGap = 10;
        const tabW = (screenWidth - 30) / 2;

        if (rankTouchStartY >= tabY && rankTouchStartY <= tabY + tabH) {
            if (rankTouchStartX >= 15 && rankTouchStartX <= 15 + tabW) {
                rankTab = 'global';
                rankScrollY = 0;
            } else if (rankTouchStartX >= 15 + tabW + tabGap && rankTouchStartX <= screenWidth - 15) {
                rankTab = 'friend';
                rankScrollY = 0;
            }
        }
    }

    // 世界Tab点击检测
    if (gameState === 'mainMenu' && mainMenuTab === 'world') {
        handleWorldClick(levelTouchStartX, levelTouchStartY);
    }

    // 主角Tab点击检测（设置按钮等）- 但设置弹窗显示时跳过，避免干扰
    if (gameState === 'mainMenu' && mainMenuTab === 'hero' && !settingsModal.show) {
        // 处理主角Tab的设置按钮点击
        handleMainMenuTouch(levelTouchStartX, levelTouchStartY);
    }

    // 商城暂时屏蔽
    // if (gameState === 'mainMenu' && mainMenuTab === 'shop') {
    //     if (!isShopDragging) {
    //         if (shopModal.show) {
    //             handleShopModalClick(levelTouchStartX, levelTouchStartY);
    //         } else {
    //             handleShopClick(levelTouchStartX, levelTouchStartY);
    //         }
    //     }
    // }

    // 体力不足弹窗点击检测
    if (gameState === 'mainMenu' && energyModal.show) {
        handleEnergyModalClick(endX, endY);
    }
    energyModalJustOpened = false;  // 重置标志位

    // 设置弹窗点击检测（优先处理，避免被其他Tab的点击处理干扰）
    // 只有当设置弹窗显示时才执行，并跳过本次刚打开的情况
    if (gameState === 'mainMenu' && settingsModal.show && !settingsJustOpened) {
        handleSettingsClick(endX, endY);  // 使用触摸终点坐标
    }
    settingsJustOpened = false;  // 重置标志位

    // 重置状态
    isLevelLongPressing = false;
    isLevelDragging = false;
    isTalentDragging = false;
    isRankDragging = false;
    isShopDragging = false;
});

// 关卡点击处理（从触摸事件中分离出来）
function handleLevelClick(x, y) {
    const topOffset = SAFE_TOP_OFFSET;
    let currentY = topOffset + levelScrollY;
    const contentH = screenHeight - MAIN_MENU_NAV_H - topOffset;
    
    // 检查是否在可见区域内
    if (y < topOffset || y >= topOffset + contentH) {
        return;
    }
    
    for (const chapter of CHAPTERS) {
        const isExpanded = mainMenuExpandedChapter === chapter.id && chapter.unlocked;
        const chapterH = isExpanded ? 210 : 70;
        
        // 点击章节头部（展开/折叠）
        if (y >= currentY && y <= currentY + 60 && x >= 15 && x <= screenWidth - 15) {
            if (chapter.unlocked) {
                mainMenuExpandedChapter = mainMenuExpandedChapter === chapter.id ? 0 : chapter.id;
            }
            return;
        }
        
        // 点击关卡卡片
        if (isExpanded) {
            const cardW = (screenWidth - 70) / 3;
            const cardH = 70;
            const gap = 8;
            const startX = 25;
            const startCardY = currentY + 75;
            
            chapter.levels.forEach((levelNum, li) => {
                const col = li % 3;
                const row = Math.floor(li / 3);
                const cx = startX + col * (cardW + gap);
                const cy = startCardY + row * (cardH + gap);
                
                const stageIdx = levelNum - 1;
                const isUnlocked = stageIdx === 0 || stageProgress[stageIdx - 1];
                
                if (isUnlocked && x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
                    currentStage = levelNum;
                    
                    // 检查体力是否充足
                    const energyCost = getEnergyCost(levelNum);
                    if (playerEnergy < energyCost) {
                        // 体力不足，打开体力不足弹窗
                        energyModal.show = true;
                        energyModal.targetStage = levelNum;
                        energyModalJustOpened = true;  // 标记弹窗刚打开，避免本次触摸结束时被关闭
                        return;
                    }
                    
                    // 体力充足，消耗体力并开始游戏
                    consumeEnergy(energyCost);
                    isAdDemoMode = (levelNum === 1);
                    startGame();
                }
            });
        }
        
        currentY += chapterH + 10;
    }
}

// 天赋节点位置存储（用于点击检测）
let talentNodes = [];

// 天赋分栏子页（v1.1.40 分栏子页：根脉/五行/统御/防御）+ 滚动偏移
let talentPage = 'root'; // 'root' | 'element' | 'supreme' | 'defense'
let talentScrollX = 0;
// 天赋页拖动滚动状态（横版：水平拖动）
let talentDragStartX = 0;
let talentDragStartY = 0;
let talentDragStartScrollX = 0;
let isTalentDragging = false;

// 天赋点击处理
function handleTalentClick(x, y) {
    // 遍历所有天赋节点检测点击
    for (const node of talentNodes) {
        const halfSize = node.size / 2;
        if (x >= node.x - halfSize && x <= node.x + halfSize &&
            y >= node.y - halfSize && y <= node.y + halfSize) {
            // 显示天赋信息弹窗
            showTalentModal(node.talentId);
            return;
        }
    }
}

// 天赋升级弹窗
let talentModal = {
    show: false,
    talentId: null
};

function showTalentModal(talentId) {
    talentModal.show = true;
    talentModal.talentId = talentId;
}

function closeTalentModal() {
    talentModal.show = false;
    talentModal.talentId = null;
}

// ==================== 初始化 ====================

// 加载游戏数据
loadGameData();
loadPlayerData();  // 加载玩家数据（统一数据存储）

// 检查并重置每日广告次数
checkAdEnergyDailyReset();

// 计算离线体力恢复
calculateOfflineEnergy();

// 获取微信昵称和头像
loadWechatInfo();

// 预加载「其他游戏」选择页图标
loadOtherGameIcons();

gameLoop();

// ==================== 微信信息获取 ====================
function loadWechatInfo() {
    // 优先使用缓存的昵称
    const cachedNickname = wx.getStorageSync('zombieHunterNickname');
    if (cachedNickname) {
        heroData.name = cachedNickname;
    }
    
    // 优先加载缓存的头像
    const cachedAvatarUrl = wx.getStorageSync('zombieHunterAvatarUrl');
    if (cachedAvatarUrl) {
        loadWechatAvatarImage(cachedAvatarUrl);
    }
    
    // 尝试获取微信用户信息（获取最新数据）
    if (wx.getUserProfile) {
        wx.getUserProfile({
            desc: '用于显示游戏昵称和头像',
            success: (res) => {
                const nickname = res.userInfo.nickName;
                const avatarUrl = res.userInfo.avatarUrl;
                heroData.name = nickname;
                wx.setStorageSync('zombieHunterNickname', nickname);
                
                // 缓存头像URL
                const cachedUrl = wx.getStorageSync('zombieHunterAvatarUrl');
                if (avatarUrl !== cachedUrl) {
                    wx.setStorageSync('zombieHunterAvatarUrl', avatarUrl);
                    loadWechatAvatarImage(avatarUrl);
                }
            },
            fail: () => {
                console.log('获取微信信息失败，使用默认值');
            }
        });
    }
}

// 加载微信头像图片
function loadWechatAvatarImage(url) {
    if (!url) return;
    const img = createGameImage();
    img.onload = () => {
        wechatAvatarImage = img;
    };
    img.src = url;
}
