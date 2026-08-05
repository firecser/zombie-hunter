// 制霸新手村的骷髅怪 - 微信小游戏完整版
// 基于 H5闯关版完整移植
// 版本: 1.0.3

// ==================== 基础设置 ====================
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const screenWidth = canvas.width;
const screenHeight = canvas.height;

// 获取微信状态栏高度（安全区域）
let statusBarHeight = 20;
try {
    const systemInfo = wx.getSystemInfoSync();
    statusBarHeight = systemInfo.statusBarHeight || 20;
} catch (e) {
    statusBarHeight = 20;
}

// 安全顶部偏移量（状态栏高度 + 10px间隙）
const SAFE_TOP_OFFSET = statusBarHeight + 10;

// ==================== 关卡系统 ====================
const STAGES = [
    { id: 1, name: '霜冻平原', icon: '❄️', desc: '基础关卡', difficulty: 1, descColor: '#88cc88',
      speedMult: 1.0, healthMult: 1.0, damageMult: 1.0, spawnMult: 1.0, bossTime: 120, tankChance: 0.18, fastChance: 0.28 },
    { id: 2, name: '暴风雪谷', icon: '🌨️', desc: '僵尸速度+30%', difficulty: 2, descColor: '#88aacc',
      speedMult: 1.3, healthMult: 1.0, damageMult: 1.1, spawnMult: 1.1, bossTime: 100, tankChance: 0.22, fastChance: 0.35 },
    { id: 3, name: '冰川裂隙', icon: '🧊', desc: '僵尸血量+50%', difficulty: 3, descColor: '#66bbcc',
      speedMult: 1.1, healthMult: 1.5, damageMult: 1.2, spawnMult: 1.2, bossTime: 90, tankChance: 0.25, fastChance: 0.30 },
    { id: 4, name: '冰霜要塞', icon: '🏔️', desc: 'Boss提前出现', difficulty: 4, descColor: '#aaaacc',
      speedMult: 1.2, healthMult: 1.3, damageMult: 1.3, spawnMult: 1.3, bossTime: 60, tankChance: 0.30, fastChance: 0.32 },
    { id: 5, name: '永冻之巅', icon: '👑', desc: '全属性增强', difficulty: 5, descColor: '#cc88cc',
      speedMult: 1.4, healthMult: 1.8, damageMult: 1.5, spawnMult: 1.5, bossTime: 50, tankChance: 0.35, fastChance: 0.35 },
    { id: 6, name: '极寒地狱', icon: '👾', desc: '究极挑战', difficulty: 6, descColor: '#ff6666',
      speedMult: 1.6, healthMult: 2.2, damageMult: 1.8, spawnMult: 1.8, bossTime: 40, tankChance: 0.40, fastChance: 0.40 }
];

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
    return STAGES[currentStage - 1];
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
        playerAcquiredSkills: [...acquiredSkills]
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
        }
    } catch (e) {
        console.log('加载游戏数据失败', e);
    }
}

// ==================== 游戏状态 ====================
let gameState = 'start'; // start, mainMenu, playing, paused, gameOver, victory, upgrade
let gameRunning = false;
let gamePaused = false;
let gameTime = 0;
let lastTime = Date.now();
const GAME_TIME_LIMIT = 5 * 60 * 1000;
const MAX_LEVEL = 20;

// ==================== 买量素材演示模式 ====================
let isAdDemoMode = false;       // 是否为买量素材演示模式
let adDemoState = 'waiting';    // waiting->guiding->exploding->result
let adDemoTimer = 0;

let adBombExploded = false;     // 炸弹是否已爆炸
let adZombieCount = 0;          // 统计击杀僵尸数
let adGoldEarned = 0;           // 实际获得金币数
let goldAtStageStart = 0;        // 进入关卡前的金币（用于胜利后累积）

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
    
    // 炸弹爆炸音效
    playBombExplosion() {
        if (!this.ctx || this.isMuted || !soundEnabled) return;
        try {
            // 低频爆炸声
            const noise = this.ctx.createOscillator();
            const noiseGain = this.ctx.createGain();
            noise.type = 'sawtooth';
            noise.frequency.setValueAtTime(100, this.ctx.currentTime);
            noise.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);
            noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
            noise.connect(noiseGain);
            noiseGain.connect(this.sfxGain);
            noise.start();
            noise.stop(this.ctx.currentTime + 0.5);
            
            // 高频冲击波
            for (let i = 0; i < 3; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 200 + i * 100;
                const startTime = this.ctx.currentTime + i * 0.1;
                gain.gain.setValueAtTime(0.3, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(startTime);
                osc.stop(startTime + 0.2);
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

// ==================== 玩家 ====================
const player = {
    x: screenWidth / 2,
    y: screenHeight - 80,
    radius: 22,
    maxHealth: 100,
    health: 100,
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
const skills = {
    damage: { level: 1, name: '火力强化', icon: '🔫', desc: '伤害 +20%' },
    fireRate: { level: 0, name: '急速射击', icon: '»', desc: '射速 +15%' },
    bulletCount: { level: 0, name: '多重射击', icon: '🎯', desc: '子弹数 +1' },
    bulletSpeed: { level: 0, name: '高速子弹', icon: '💨', desc: '弹速 +20%' },
    piercing: { level: 0, name: '穿透弹', icon: '🗡️', desc: '穿透 +1' },
    health: { level: 0, name: '生命强化', icon: '❤️', desc: '生命 +20' },
    explosive: { level: 0, name: '爆炸弹', icon: '💥', desc: '范围伤害' },
    lightning: { level: 0, name: '闪电链', icon: '⚡', desc: '弹射攻击' },
    shield: { level: 0, name: '护盾', icon: '🛡️', desc: '减伤能力' }
};

const MAX_SKILLS = 5;
let acquiredSkills = ['damage'];

// ==================== 游戏对象 ====================
let bullets = [];
let zombies = [];
let particles = [];
let expOrbs = [];
let goldOrbs = [];
let damageNumbers = [];
let lightningEffects = [];
let bombExplosionEffects = [];

// ==================== 僵尸类型 ====================
const zombieTypes = {
    normal: { health: 30, speed: 1.5, damage: 10, radius: 22, color: '#6b8ca3', exp: 10, gold: 5 },
    fast: { health: 20, speed: 3, damage: 8, radius: 18, color: '#8b7ca3', exp: 15, gold: 8 },
    tank: { health: 80, speed: 1, damage: 20, radius: 30, color: '#5a6a8a', exp: 25, gold: 15 },
    boss: { health: 200, speed: 0.8, damage: 30, radius: 42, color: '#8b4a5a', exp: 100, gold: 50 }
};

// ==================== 升级选项 ====================
const upgradePool = [
    { type: 'damage', name: '火力强化', icon: '🔫', desc: '伤害 +20%' },
    { type: 'fireRate', name: '急速射击', icon: '»', desc: '射速 +15%' },
    { type: 'bulletCount', name: '多重射击', icon: '🎯', desc: '子弹数 +1' },
    { type: 'bulletSpeed', name: '高速子弹', icon: '💨', desc: '弹速 +20%' },
    { type: 'piercing', name: '穿透弹', icon: '🗡️', desc: '穿透 +1' },
    { type: 'health', name: '生命强化', icon: '❤️', desc: '最大生命 +20' },
    { type: 'explosive', name: '爆炸弹', icon: '💥', desc: '范围伤害' },
    { type: 'lightning', name: '闪电链', icon: '⚡', desc: '弹射攻击' },
    { type: 'shield', name: '护盾', icon: '🛡️', desc: '减伤能力' }
];

let upgradeOptions = [];
let selectedUpgrade = -1;

// ==================== 炸弹系统 ====================
let bombCount = 0;
let bombCooldown = 0;
const BOMB_MAX_COUNT = 3;
const BOMB_COOLDOWN_TIME = 30000;
let justGotBomb = false; // 刚获得炸弹的标志
let bombFull = false; // 炸弹已满标志

// ==================== 生成参数 ====================
let spawnTimer = 0;
let spawnInterval = 1500;

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
    const hurtFlash = Date.now() - player.hurtTime < 100;
    
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
}

// 绘制僵尸（冰雪风格）
function drawZombie(zombie) {
    const x = zombie.x;
    const y = zombie.y;
    const r = zombie.radius;
    
    // 阴影
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.7, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 150, 180, 0.3)';
    ctx.fill();
    
    // 身体颜色（高饱和 + 强描边，暗背景上高对比）
    const bodyColors = {
        normal: { body: '#3fa34d', coat: '#5cc04f', outline: '#1f5e26' },
        fast: { body: '#e8932e', coat: '#ffb347', outline: '#9a5a10' },
        tank: { body: '#7a45d6', coat: '#a06bff', outline: '#4a2589' },
        boss: { body: '#d63b40', coat: '#ff5a5f', outline: '#8a1f24' }
    };
    const colors = bodyColors[zombie.type] || bodyColors.normal;
    
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
    
    // 嘴巴
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

// 绘制子弹（高对比：近白核心 + 金描边 + 亮黄光晕）
function drawBullets() {
    for (const bullet of bullets) {
        // 发光（亮黄橙）
        const gradient = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, bullet.radius * 4);
        gradient.addColorStop(0, 'rgba(255, 230, 120, 0.85)');
        gradient.addColorStop(0.5, 'rgba(255, 170, 40, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 120, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        // 核心（近白高亮 + 金描边，暗背景上极跳）
        ctx.fillStyle = '#fff7e0';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffb300';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// 绘制经验球和金币
function drawOrbs() {
    // 经验球
    for (const orb of expOrbs) {
        const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius * 2);
        glow.addColorStop(0, 'rgba(100, 180, 255, 0.5)');
        glow.addColorStop(1, 'rgba(100, 180, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#00bfff';
        ctx.fill();
    }
    
    // 金币
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
    }
}

// 绘制粒子
function drawParticles() {
    for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 400;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

// 绘制伤害数字
function drawDamageNumbers() {
    for (const dn of damageNumbers) {
        ctx.fillStyle = dn.color || '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.globalAlpha = dn.life / 800;
        ctx.fillText(dn.text, dn.x, dn.y);
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
            
            ctx.strokeStyle = `rgba(150, 220, 255, ${alpha * 0.5})`;
            ctx.lineWidth = 8;
            ctx.stroke();
            
            ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.7})`;
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

// 绘制爆炸效果
function drawBombExplosions() {
    for (let i = bombExplosionEffects.length - 1; i >= 0; i--) {
        const effect = bombExplosionEffects[i];
        effect.life -= 16;
        effect.radius += 20;
        
        const alpha = effect.life / 400;
        
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 100, 50, ${alpha * 0.8})`;
        ctx.lineWidth = 10 * alpha;
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
    
    // 第三行：击杀、金币、倒计时（同一行）
    const remainingTime = Math.max(0, GAME_TIME_LIMIT - gameTime);
    const minutes = Math.floor(remainingTime / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`👾${player.kills} 💰${player.gold}`, panelX + 8, panelY + 48);
    
    // 倒计时放右边
    ctx.fillStyle = remainingTime <= 30000 ? '#ff4444' : '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`⏱️${timeStr}`, panelX + panelW - 8, panelY + 48);
    
    // ========== 右上角按钮（音效+暂停）==========
    // 避开微信胶囊按钮区域（右上角约90像素宽度）
    drawTopRightButtons();
    
    // ========== 底部血条（小车下方） ==========
    drawPlayerHealthBar();
    
    // ========== 技能栏（底部） ==========
    drawSkillUI();
    
    // ========== 炸弹按钮（右下角圆形） ==========
    drawBombButton();
}

// 绘制玩家血条（小车下方）
function drawPlayerHealthBar() {
    const barY = screenHeight - 65;
    const barX = player.x - 45;
    const barW = 90;
    const barH = 8;

    // 背景（暗底 + 金边）
    ctx.fillStyle = 'rgba(8, 20, 36, 0.8)';
    roundRect(ctx, barX - 4, barY - 2, barW + 8, barH + 10, 6);
    ctx.fill();
    ctx.strokeStyle = ROYALE.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, barX - 4, barY - 2, barW + 8, barH + 10, 6);
    ctx.stroke();

    // 心形图标
    ctx.fillStyle = '#ff5a5f';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤', barX, barY + 2);
    ctx.textBaseline = 'alphabetic';

    // 血条背景
    const healthBarX = barX + 14;
    ctx.fillStyle = 'rgba(40, 60, 80, 0.9)';
    ctx.fillRect(healthBarX, barY, barW - 35, 4);

    // 血条填充（绿色，暗背景上清晰）
    const healthPercent = player.health / player.maxHealth;
    const healthGradient = ctx.createLinearGradient(healthBarX, 0, healthBarX + barW - 35, 0);
    healthGradient.addColorStop(0, '#5dd47f');
    healthGradient.addColorStop(1, '#34a35c');
    ctx.fillStyle = healthGradient;
    ctx.fillRect(healthBarX, barY, (barW - 35) * healthPercent, 4);

    // 血量数字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(player.health)}`, barX + barW - 12, barY + 5);
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
        
        skillX += skillSize + skillGap;
    });
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
function drawGameOver() {
    // 半透明遮罩
    ctx.fillStyle = 'rgba(8, 18, 33, 0.82)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗
    const modalW = Math.min(300, screenWidth * 0.85);
    const modalH = 220;
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
    ctx.fillText('👾 游戏结束', screenWidth / 2, modalY + 35);
    
    // 统计信息
    ctx.fillStyle = '#fff';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`最终等级: ${player.level}`, screenWidth / 2, modalY + 75);
    ctx.fillText(`击杀僵尸: ${player.kills}`, screenWidth / 2, modalY + 100);
    
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    ctx.fillText(`存活时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, screenWidth / 2, modalY + 125);
    
    // 按钮（皇室战争风立体按钮）
    const btnSize = 48;
    const gap = 15;
    const totalW = btnSize * 2 + gap;
    const startX = screenWidth / 2 - totalW / 2;
    const btnY = modalY + 155;

    drawRoyaleBevelButton({ x: startX, y: btnY, w: btnSize, h: btnSize, r: 10 }, '🔄', 'red');
    drawRoyaleBevelButton({ x: startX + btnSize + gap, y: btnY, w: btnSize, h: btnSize, r: 10 }, '📋', 'blue');

    // 按钮文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('重玩', startX + btnSize / 2, btnY + btnSize + 14);
    ctx.fillText('关卡', startX + btnSize + gap + btnSize / 2, btnY + btnSize + 14);
}

// 通关界面
function drawVictory() {
    // 半透明遮罩
    ctx.fillStyle = 'rgba(8, 18, 33, 0.82)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗
    const modalW = Math.min(300, screenWidth * 0.85);
    const modalH = 250;
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
    ctx.fillText('🎉 通关成功！', screenWidth / 2, modalY + 38);
    
    // 统计信息
    ctx.fillStyle = '#fff';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🏆 第${currentStage}关 完成！`, screenWidth / 2, modalY + 78);
    ctx.fillText(`最终等级: ${player.level}`, screenWidth / 2, modalY + 106);
    ctx.fillText(`击杀僵尸: ${player.kills}`, screenWidth / 2, modalY + 130);
    ctx.fillText(`获得金币: ${player.gold}`, screenWidth / 2, modalY + 154);
    
    // 按钮（正方形，与技能图标样式一致）
    const btnSize = 48;
    const gap = 15;
    const btnY = modalY + 185;

    if (currentStage < STAGES.length) {
        const btnSize = 48;
        const gap = 15;
        const totalW = btnSize * 3 + gap * 2;
        const startX = screenWidth / 2 - totalW / 2;
        const btnY = modalY + 185;

        drawRoyaleBevelButton({ x: startX, y: btnY, w: btnSize, h: btnSize, r: 10 }, '▶️', 'green');
        drawRoyaleBevelButton({ x: startX + btnSize + gap, y: btnY, w: btnSize, h: btnSize, r: 10 }, '🔄', 'gold');
        drawRoyaleBevelButton({ x: startX + (btnSize + gap) * 2, y: btnY, w: btnSize, h: btnSize, r: 10 }, '📋', 'blue');

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('下一关', startX + btnSize / 2, btnY + btnSize + 14);
        ctx.fillText('重玩', startX + btnSize + gap + btnSize / 2, btnY + btnSize + 14);
        ctx.fillText('关卡', startX + (btnSize + gap) * 2 + btnSize / 2, btnY + btnSize + 14);
    } else {
        // 全通关 - 只显示两个按钮
        const btnSize = 48;
        const gap = 15;
        const totalW = btnSize * 2 + gap;
        const startX = screenWidth / 2 - totalW / 2;
        const btnY = modalY + 185;

        drawRoyaleBevelButton({ x: startX, y: btnY, w: btnSize, h: btnSize, r: 10 }, '🔄', 'gold');
        drawRoyaleBevelButton({ x: startX + btnSize + gap, y: btnY, w: btnSize, h: btnSize, r: 10 }, '📋', 'blue');

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('重玩', startX + btnSize / 2, btnY + btnSize + 14);
        ctx.fillText('关卡', startX + btnSize + gap + btnSize / 2, btnY + btnSize + 14);
    }
}

// 升级面板（带外框的精美弹窗）
function drawUpgradePanel() {
    // 计算面板尺寸
    const cardW = 80;
    const cardH = 95;
    const cardGap = 8;
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

    const panelX = (screenWidth - totalWidth) / 2 - 25;
    const panelY = screenHeight - 130 - panelH;
    const panelW = totalWidth + 50;
    
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
        ctx.font = '28px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opt.icon, x + cardW / 2, y + 26);
        
        // 名称
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.fillText(opt.name, x + cardW / 2, y + 52);
        
        // 描述
        ctx.fillStyle = '#999';
        ctx.font = '8px Arial';
        const desc = opt.desc;
        if (desc.length > 10) {
            ctx.fillText(desc.substring(0, 10), x + cardW / 2, y + 70);
            ctx.fillText(desc.substring(10), x + cardW / 2, y + 82);
        } else {
            ctx.fillText(desc, x + cardW / 2, y + 76);
        }
    });
}

// ==================== 游戏逻辑 ====================

// 射击
function shoot() {
    if (zombies.length === 0) return;
    
    // 播放射击音效
    AudioSystem.playShoot();
    
    const angle = player.gunAngle;
    const spread = 0.15;
    const gunLength = 40;
    
    for (let i = 0; i < player.bulletCount; i++) {
        let bulletAngle = angle;
        if (player.bulletCount > 1) {
            bulletAngle += (i - (player.bulletCount - 1) / 2) * spread;
        }
        
        const startX = player.x + Math.cos(angle) * gunLength;
        const startY = player.y + Math.sin(angle) * gunLength;
        
        bullets.push({
            x: startX,
            y: startY,
            vx: Math.cos(bulletAngle) * player.bulletSpeed,
            vy: Math.sin(bulletAngle) * player.bulletSpeed,
            radius: 6,
            damage: player.damage,
            piercing: player.bulletPiercing,
            hitZombies: []
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
        
        for (let j = zombies.length - 1; j >= 0; j--) {
            const zombie = zombies[j];
            const dist = Math.hypot(bullet.x - zombie.x, bullet.y - zombie.y);
            
            if (bullet.hitZombies.includes(zombie)) continue;
            
            if (dist < bullet.radius + zombie.radius) {
                bullet.hitZombies.push(zombie);
                
                let damage = bullet.damage;
                
                // 爆炸伤害
                if (skills.explosive.level > 0) {
                    const explosionRadius = 40 + skills.explosive.level * 20;
                    createExplosion(bullet.x, bullet.y, explosionRadius);
                    
                    for (const z of zombies) {
                        if (z !== zombie) {
                            const d = Math.hypot(bullet.x - z.x, bullet.y - z.y);
                            if (d < explosionRadius) {
                                const aoeDamage = damage * (0.3 + skills.explosive.level * 0.1);
                                damageZombie(z, aoeDamage);
                            }
                        }
                    }
                }
                
                // 闪电链
                if (skills.lightning.level > 0) {
                    const chainCount = skills.lightning.level + 1;
                    const chainDamage = damage * 0.4;
                    let lastTarget = zombie;
                    let chainedTargets = [zombie];
                    
                    for (let c = 0; c < chainCount; c++) {
                        let closestChain = null;
                        let closestDist = 150;
                        
                        for (const z of zombies) {
                            if (!chainedTargets.includes(z)) {
                                const d = Math.hypot(lastTarget.x - z.x, lastTarget.y - z.y);
                                if (d < closestDist) {
                                    closestDist = d;
                                    closestChain = z;
                                }
                            }
                        }
                        
                        if (closestChain) {
                            createLightning(lastTarget.x, lastTarget.y, closestChain.x, closestChain.y);
                            damageZombie(closestChain, chainDamage);
                            chainedTargets.push(closestChain);
                            lastTarget = closestChain;
                        }
                    }
                }
                
                damageZombie(zombie, damage);
                
                if (bullet.hitZombies.length >= bullet.piercing) {
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
    }
}

// 伤害僵尸
function damageZombie(zombie, damage) {
    zombie.health -= damage;
    
    damageNumbers.push({
        x: zombie.x,
        y: zombie.y - zombie.radius,
        text: Math.round(damage).toString(),
        life: 800,
        vy: -2.5,
        color: damage > player.damage ? '#ffff00' : '#ffffff'
    });
    
    // 粒子效果
    for (let i = 0; i < 3; i++) {
        particles.push({
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
        
        // 播放僵尸死亡音效
        AudioSystem.playZombieDeath();
        
        // 掉落经验球（素材演示僵尸不掉经验）
        if (!zombie.isAdZombie) {
            for (let i = 0; i < 3; i++) {
                expOrbs.push({
                    x: zombie.x + (Math.random() - 0.5) * 25,
                    y: zombie.y + (Math.random() - 0.5) * 25,
                    radius: 8,
                    exp: zombie.exp / 3
                });
            }
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
            particles.push({
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
    }
}

// 创建爆炸效果
function createExplosion(x, y, radius) {
    for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 / 18) * i;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * 4,
            vy: Math.sin(angle) * 4,
            radius: 5,
            life: 300,
            color: '#ff6600'
        });
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
function updateZombies() {
    for (const zombie of zombies) {
        const angle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
        zombie.x += Math.cos(angle) * zombie.speed;
        zombie.y += Math.sin(angle) * zombie.speed;
        
        const dist = Math.hypot(player.x - zombie.x, player.y - zombie.y);
        if (dist < player.radius + zombie.radius) {
            let damage = zombie.damage;
            
            if (skills.shield.level > 0) {
                damage *= (1 - skills.shield.level * 0.1);
            }
            
            player.health -= damage * 0.03;
            player.hurtTime = Date.now();
            
            // 播放受伤音效（限制频率，避免连续播放）
            AudioSystem.playHurt();
            
            // 击退
            const pushAngle = Math.atan2(zombie.y - player.y, zombie.x - player.x);
            zombie.x += Math.cos(pushAngle) * 8;
            zombie.y += Math.sin(pushAngle) * 8;
            
            if (player.health <= 0) {
                gameOver();
            }
        }
    }
}

// 更新粒子
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
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
            player.exp += orb.exp;
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
            player.gold += 5;
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

// 生成僵尸
function spawnZombies(dt) {
    const stage = getCurrentStage();
    spawnTimer += dt;
    
    const remainingTime = GAME_TIME_LIMIT - gameTime;
    let spawnMult = stage.spawnMult;
    let spawnCount = 1;
    
    if (remainingTime <= 30000 && remainingTime > 0) {
        const pressure = 1 - (remainingTime / 30000);
        spawnMult *= (1 + pressure * 1.5);
        
        if (pressure > 0.6) spawnCount = 2;
        if (pressure > 0.85) spawnCount = 2 + Math.floor(Math.random() * 2);
    }
    
    if (spawnTimer >= spawnInterval / spawnMult) {
        spawnTimer = 0;
        spawnInterval = Math.max(400, spawnInterval - 8);
        
        for (let s = 0; s < spawnCount; s++) {
            const x = Math.random() * screenWidth;
            const y = -50;
            
            let type = 'normal';
            const roll = Math.random();
            const gameTimeSec = gameTime / 1000;
            
            const bossChance = gameTimeSec > stage.bossTime ? 0.08 : 0;
            const tankChance = gameTimeSec > 60 ? stage.tankChance : stage.tankChance * 0.5;
            const fastChance = stage.fastChance;
            
            if (gameTimeSec > stage.bossTime && roll < bossChance) {
                type = 'boss';
            } else if (gameTimeSec > 60 && roll < bossChance + tankChance) {
                type = 'tank';
            } else if (roll < bossChance + tankChance + fastChance) {
                type = 'fast';
            }
            
            const template = zombieTypes[type];
            const healthMult = (1 + gameTimeSec / 50) * stage.healthMult;
            
            zombies.push({
                x: x,
                y: y,
                radius: template.radius,
                speed: template.speed * stage.speedMult,
                health: template.health * healthMult,
                maxHealth: template.health * healthMult,
                damage: template.damage * stage.damageMult,
                color: template.color,
                exp: template.exp,
                gold: template.gold || 5,
                type: type
            });
        }
    }
}

// 升级
function levelUp() {
    if (player.level >= MAX_LEVEL) {
        player.exp = 0;
        return;
    }
    
    player.level++;
    player.exp -= player.expToLevel;
    player.expToLevel = Math.floor(player.expToLevel * 1.3);
    
    // 每5级获得炸弹（5级、10级、15级、20级）
    justGotBomb = false;
    bombFull = false;
    if (player.level % 5 === 0) {
        if (bombCount < BOMB_MAX_COUNT) {
            bombCount++;
            justGotBomb = true;
        } else {
            // 炸弹已满，仍然显示提示但告知已满
            bombFull = true;
            justGotBomb = true;
        }
    }
    
    // 播放升级音效
    AudioSystem.playLevelUp();
    
    showUpgradePanel();
}

// 显示升级面板
function showUpgradePanel() {
    gameState = 'upgrade';
    
    // 选择升级选项
    let availableUpgrades;
    if (acquiredSkills.length >= MAX_SKILLS) {
        availableUpgrades = upgradePool.filter(u => acquiredSkills.includes(u.type));
    } else {
        availableUpgrades = [...upgradePool];
    }
    
    const shuffled = availableUpgrades.sort(() => Math.random() - 0.5);
    upgradeOptions = shuffled.slice(0, 3);
    selectedUpgrade = -1;
}

// 应用升级
function applyUpgrade(upgrade) {
    if (skills[upgrade.type].level === 0) {
        acquiredSkills.push(upgrade.type);
    }
    
    skills[upgrade.type].level++;
    
    switch (upgrade.type) {
        case 'damage':
            player.damage *= 1.2;
            break;
        case 'fireRate':
            player.fireRate *= 0.85;
            break;
        case 'bulletCount':
            player.bulletCount++;
            break;
        case 'bulletSpeed':
            player.bulletSpeed *= 1.2;
            break;
        case 'piercing':
            player.bulletPiercing++;
            break;
        case 'health':
            player.maxHealth += 20;
            player.health = Math.min(player.health + 20, player.maxHealth);
            break;
    }
    
    gameState = 'playing';
    gameRunning = true;
    lastTime = Date.now();
    
    // 重置炸弹获得标志
    justGotBomb = false;
    bombFull = false;
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
    
    // 清除所有僵尸
    for (const zombie of zombies) {
        player.exp += zombie.exp;
        player.gold += zombie.gold || 5;
        player.kills++;
        
        for (let i = 0; i < 8; i++) {
            particles.push({
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
    
    if (player.exp >= player.expToLevel && player.level < MAX_LEVEL) {
        setTimeout(levelUp, 1000);
    }
}

// 游戏结束
function gameOver() {
    gameState = 'gameOver';
    gameRunning = false;
    
    // 将本次关卡获得的金币累加到总金币（即使失败也不丢失之前的金币）
    player.gold = goldAtStageStart + player.gold;
    
    savePlayerData();  // 保存玩家数据
    AudioSystem.stopBGM();
    AudioSystem.playGameOver();
}

// 胜利
function victory() {
    gameState = 'victory';
    gameRunning = false;
    
    // 将本次关卡获得的金币累加到总金币
    player.gold = goldAtStageStart + player.gold;
    
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
    
    // 重置玩家
    player.x = screenWidth / 2;
    player.y = screenHeight - 80;
    player.health = 100;
    player.maxHealth = 100;
    player.exp = 0;
    player.level = 1;
    player.expToLevel = 50;
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
    }
    skills.damage.level = 1;
    acquiredSkills = ['damage'];
    
    // 清空对象
    bullets = [];
    zombies = [];
    particles = [];
    expOrbs = [];
    goldOrbs = [];
    damageNumbers = [];
    lightningEffects = [];
    bombExplosionEffects = [];
    
    // 重置炸弹
    bombCount = 0;
    bombCooldown = 0;
    justGotBomb = false;
    bombFull = false;
    
    // 重置生成参数
    spawnTimer = 0;
    spawnInterval = 1500;

    // 素材演示模式特殊处理
    if (isAdDemoMode) {
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
            // 正常僵尸：经验球 + 30%金币
            for (let i = 0; i < 3; i++) {
                expOrbs.push({
                    x: z.x + (Math.random() - 0.5) * 25,
                    y: z.y + (Math.random() - 0.5) * 25,
                    radius: 8,
                    exp: z.exp / 3
                });
            }
            if (Math.random() < 0.3) {
                goldOrbs.push({ x: z.x, y: z.y, radius: 10 });
            }
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

// ==================== 游戏更新 ====================
function update(dt) {
    if (gameTime >= GAME_TIME_LIMIT) {
        victory();
        return;
    }
    
    // 机枪跟踪
    if (zombies.length > 0) {
        let nearest = null;
        let minDist = Infinity;
        for (const z of zombies) {
            const d = Math.hypot(z.x - player.x, z.y - player.y);
            if (d < minDist) {
                minDist = d;
                nearest = z;
            }
        }
        if (nearest) {
            player.gunAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
        }
    }
    
    // 自动射击
    const now = Date.now();
    if (zombies.length > 0 && now - player.lastShot > player.fireRate) {
        shoot();
        player.lastShot = now;
    }
    
    updateBullets();
    updateZombies();
    updateParticles();
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
    { id: 'sheqiu', name: '大力射手', emoji: '⚽', icon: 'images/sheqiuicon.png', appId: '', mode: 'ingame', alpha: 'D' }
];

// 其他游戏图标图片表：id -> 已加载的 Image（优先于 emoji 显示）
const otherGameIcons = {};
let otherGameIconsLoaded = false;

// 预加载「其他游戏」选择页中配置了 icon 的游戏图标
function loadOtherGameIcons() {
    if (otherGameIconsLoaded) return;
    OTHER_GAMES.forEach((g) => {
        if (g.icon && !otherGameIcons[g.id]) {
            const img = wx.createImage();
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
let talentData = {
    'core': { name: '怪物之心', icon: '👾', level: 0, max: 20, cost: 2000, perLevelPower: 200, effect: '全体属性+2%', chapter: 1, prerequisite: null },
    'damage': { name: '攻击力', icon: '⚔️', level: 0, max: 30, cost: 300, perLevelPower: 30, effect: '攻击力+3%', chapter: 2, prerequisite: { id: 'core', level: 5 } },
    'health': { name: '生命', icon: '❤️', level: 0, max: 30, cost: 300, perLevelPower: 30, effect: '生命+30', chapter: 2, prerequisite: { id: 'core', level: 5 } },
    'goldearn': { name: '金币获取', icon: '🪙', level: 0, max: 20, cost: 400, perLevelPower: 40, effect: '金币+8%', chapter: 2, prerequisite: { id: 'damage', level: 3 } },
    'expearn': { name: '经验获取', icon: '⭐', level: 0, max: 20, cost: 400, perLevelPower: 40, effect: '经验+8%', chapter: 2, prerequisite: { id: 'damage', level: 3 } },
    'attackspeed': { name: '攻击速度', icon: '⚡', level: 0, max: 20, cost: 500, perLevelPower: 50, effect: '攻速+2%', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'crit': { name: '暴击率', icon: '💥', level: 0, max: 25, cost: 500, perLevelPower: 50, effect: '暴击+1.5%', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'piercing': { name: '穿透', icon: '🗡️', level: 0, max: 10, cost: 800, perLevelPower: 80, effect: '穿透+1', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'shield': { name: '护盾', icon: '🛡️', level: 0, max: 20, cost: 500, perLevelPower: 50, effect: '护盾+20', chapter: 4, prerequisite: { id: 'health', level: 10 } },
    'explosive': { name: '爆炸', icon: '💣', level: 0, max: 10, cost: 1000, perLevelPower: 100, effect: '范围+10%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'freeze': { name: '冰冻', icon: '❄️', level: 0, max: 15, cost: 800, perLevelPower: 80, effect: '冰冻+1.5%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'slow': { name: '减速', icon: '🐌', level: 0, max: 15, cost: 800, perLevelPower: 80, effect: '减速+2%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'bombcount': { name: '炸弹上限', icon: '💣', level: 0, max: 8, cost: 1200, perLevelPower: 120, effect: '上限+1', chapter: 6, prerequisite: { id: 'shield', level: 5 } },
    'lightning': { name: '闪电链', icon: '⚡', level: 0, max: 10, cost: 1500, perLevelPower: 150, effect: '弹射+1', chapter: 8, prerequisite: { id: 'crit', level: 10 } },
    'multishot': { name: '连射', icon: '🏹', level: 0, max: 8, cost: 1500, perLevelPower: 150, effect: '子弹+1', chapter: 8, prerequisite: { id: 'crit', level: 10 } },
    'deathray': { name: '死亡射线', icon: '💥', level: 0, max: 5, cost: 5000, perLevelPower: 500, effect: '全屏伤害', chapter: 10, prerequisite: { id: 'lightning', level: 5 } },
    'immortal': { name: '不朽之身', icon: '🔮', level: 0, max: 3, cost: 8000, perLevelPower: 800, effect: '复活1次', chapter: 10, prerequisite: { id: 'lightning', level: 5 } },
    'devour': { name: '吞噬万物', icon: '🌪️', level: 0, max: 5, cost: 5000, perLevelPower: 500, effect: '吸收伤害', chapter: 10, prerequisite: { id: 'lightning', level: 5 } }
};

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
function upgradeTalent(talentId) {
    const talent = talentData[talentId];
    if (talent.level >= talent.max) return false; // 已满级
    if (!isTalentUnlocked(talentId)) return false; // 未解锁
    if (player.gold < talent.cost) return false; // 金币不足
    
    player.gold -= talent.cost;
    talent.level++;
    savePlayerData();
    return true;
}

// 当前解锁的最高章节（用于判断天赋解锁状态）
let highestUnlockedChapter = 2;

function drawMainMenu() {
    // 确保游戏圈按钮只在圈子Tab显示
    if (mainMenuTab !== 'club') {
        destroyGameClubButton();
    }

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

// 天赋Tab
function drawMainMenuTalent() {
    const topOffset = SAFE_TOP_OFFSET;

    // 清空节点位置
    talentNodes = [];

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('天赋', screenWidth / 2, topOffset + 15);

    const centerX = screenWidth / 2;
    // 增加顶部间距，给核心天赋光晕留出空间
    const contentTop = topOffset + 45;
    const contentWidth = screenWidth - 24;
    const nodeGap = 8;
    
    // ===== 当前进度提示 =====
    const currentChapterText = highestUnlockedChapter <= 2 ? '第1-2章 · 入门篇' :
                               highestUnlockedChapter <= 4 ? '第3-4章 · 进阶篇' :
                               highestUnlockedChapter <= 6 ? '第5-6章 · 强化篇' :
                               highestUnlockedChapter <= 8 ? '第7-8章 · 高级篇' : '第9-10章 · 终极篇';
    
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '10px Arial';
    ctx.fillText('📍 当前: ' + currentChapterText, centerX, contentTop + 10);
    
    // ===== 天赋树结构 =====
    // 核心天赋位置下移，避免挡住顶部文字
    let currentY = contentTop + 50;
    
    // --- 核心天赋（怪物之心）---
    const coreNodeR = 35;
    
    // 判断是否解锁
    const coreUnlocked = highestUnlockedChapter >= 1;
    
    // 光晕效果
    if (coreUnlocked) {
        const coreGlow = ctx.createRadialGradient(centerX, currentY, coreNodeR * 0.5, centerX, currentY, coreNodeR * 2);
        coreGlow.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
        coreGlow.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(centerX, currentY, coreNodeR * 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 核心节点背景
    const coreGrad = ctx.createRadialGradient(centerX, currentY - coreNodeR * 0.3, 0, centerX, currentY, coreNodeR);
    coreGrad.addColorStop(0, coreUnlocked ? '#3a7aca' : '#333');
    coreGrad.addColorStop(1, coreUnlocked ? '#1e5a9a' : '#222');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(centerX, currentY, coreNodeR, 0, Math.PI * 2);
    ctx.fill();
    
    // 边框
    ctx.strokeStyle = coreUnlocked ? '#ffd700' : '#444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, currentY, coreNodeR, 0, Math.PI * 2);
    ctx.stroke();
    
    // 图标和文字
    ctx.fillStyle = coreUnlocked ? '#fff' : '#666';
    ctx.font = '28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👾', centerX, currentY - 8);
    
    ctx.font = '9px Arial';
    ctx.fillText('怪物之心', centerX, currentY + 16);
    ctx.fillStyle = coreUnlocked ? '#ffd700' : '#666';
    ctx.font = '8px Arial';
    ctx.fillText('核心 Lv.' + talentData['core'].level, centerX, currentY + 26);
    
    ctx.textBaseline = 'alphabetic';
    
    // 将核心天赋添加到点击检测数组
    talentNodes.push({ x: centerX, y: currentY, size: coreNodeR * 2, talentId: 'core' });
    
    currentY += coreNodeR + 15;
    
    // --- 连接线 ---
    ctx.strokeStyle = coreUnlocked ? '#4fc3f7' : '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, currentY - 10);
    ctx.lineTo(centerX, currentY);
    ctx.stroke();
    
    // ===== 第二章·基础属性 =====
    currentY += 5;
    
    // 分组标题
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '10px Arial';
    ctx.fillText('📖 第二章 · 基础属性', centerX, currentY);
    
    // 装饰线
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 60, currentY - 5);
    ctx.lineTo(centerX + 60, currentY - 5);
    ctx.stroke();
    
    currentY += 15;
    
    // 4个节点
    const row2Talents = ['damage', 'health', 'goldearn', 'expearn'];
    const nodeSize = 50;
    const row2Width = nodeSize * 4 + nodeGap * 3;
    const row2StartX = centerX - row2Width / 2;
    
    const chapter2Unlocked = highestUnlockedChapter >= 2;
    
    row2Talents.forEach((talentId, i) => {
        const t = talentData[talentId];
        const nx = row2StartX + i * (nodeSize + nodeGap) + nodeSize / 2;
        const ny = currentY + nodeSize / 2;
        
        talentNodes.push({ x: nx, y: ny, size: nodeSize, talentId: talentId });
        drawTalentNode(nx, ny, nodeSize, t, talentId, chapter2Unlocked);
    });
    
    currentY += nodeSize + 15;
    
    // 连接线
    if (chapter2Unlocked) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, currentY - 10);
        ctx.lineTo(centerX, currentY);
        ctx.stroke();
    }
    
    currentY += 5;
    
    // ===== 第四章·进阶战斗 =====
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '10px Arial';
    ctx.fillText('📖 第四章 · 进阶战斗', centerX, currentY);
    
    currentY += 15;
    
    const chapter4Unlocked = highestUnlockedChapter >= 4;
    const row3Talents = ['attackspeed', 'crit', 'piercing', 'shield'];
    
    row3Talents.forEach((talentId, i) => {
        const t = talentData[talentId];
        const nx = row2StartX + i * (nodeSize + nodeGap) + nodeSize / 2;
        const ny = currentY + nodeSize / 2;
        
        talentNodes.push({ x: nx, y: ny, size: nodeSize, talentId: talentId });
        drawTalentNode(nx, ny, nodeSize, t, talentId, chapter4Unlocked);
    });
    
    currentY += nodeSize + 15;
    
    // 连接线
    if (chapter4Unlocked) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, currentY - 10);
        ctx.lineTo(centerX, currentY);
        ctx.stroke();
    }
    
    currentY += 5;
    
    // ===== 第六章·技能强化 =====
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '10px Arial';
    ctx.fillText('📖 第六章 · 技能强化', centerX, currentY);
    
    currentY += 15;
    
    const chapter6Unlocked = highestUnlockedChapter >= 6;
    const row4Talents = ['explosive', 'freeze', 'slow', 'bombcount'];
    
    row4Talents.forEach((talentId, i) => {
        const t = talentData[talentId];
        const nx = row2StartX + i * (nodeSize + nodeGap) + nodeSize / 2;
        const ny = currentY + nodeSize / 2;
        
        talentNodes.push({ x: nx, y: ny, size: nodeSize, talentId: talentId });
        drawTalentNode(nx, ny, nodeSize, t, talentId, chapter6Unlocked);
    });
    
    currentY += nodeSize + 15;
    
    // 连接线
    if (chapter6Unlocked) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, currentY - 10);
        ctx.lineTo(centerX, currentY);
        ctx.stroke();
    }
    
    currentY += 5;
    
    // ===== 第八章·高级技能 =====
    ctx.fillStyle = '#4fc3f7';
    ctx.font = '10px Arial';
    ctx.fillText('📖 第八章 · 高级技能', centerX, currentY);
    
    currentY += 15;
    
    const chapter8Unlocked = highestUnlockedChapter >= 8;
    const row5Talents = ['lightning', 'multishot'];
    
    // 两个节点居中
    const row5Width = nodeSize * 2 + nodeGap;
    const row5StartX = centerX - row5Width / 2;
    
    row5Talents.forEach((talentId, i) => {
        const t = talentData[talentId];
        const nx = row5StartX + i * (nodeSize + nodeGap) + nodeSize / 2;
        const ny = currentY + nodeSize / 2;
        
        talentNodes.push({ x: nx, y: ny, size: nodeSize, talentId: talentId });
        drawTalentNode(nx, ny, nodeSize, t, talentId, chapter8Unlocked);
    });
    
    currentY += nodeSize + 15;
    
    // 连接线
    if (chapter8Unlocked) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, currentY - 10);
        ctx.lineTo(centerX, currentY);
        ctx.stroke();
    }
    
    currentY += 5;
    
    // ===== 终极天赋（章节10） =====
    ctx.fillStyle = '#ffd700';
    ctx.font = '10px Arial';
    ctx.fillText('👑 终极天赋 (章节10)', centerX, currentY);
    
    currentY += 15;
    
    const chapter10Unlocked = highestUnlockedChapter >= 10;
    const row6Talents = ['deathray', 'immortal', 'devour'];
    
    const row6Width = nodeSize * 3 + nodeGap * 2;
    const row6StartX = centerX - row6Width / 2;
    
    row6Talents.forEach((talentId, i) => {
        const t = talentData[talentId];
        const nx = row6StartX + i * (nodeSize + nodeGap) + nodeSize / 2;
        const ny = currentY + nodeSize / 2;
        
        talentNodes.push({ x: nx, y: ny, size: nodeSize, talentId: talentId });
        drawTalentNode(nx, ny, nodeSize, t, talentId, chapter10Unlocked);
    });
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
        // 检查金币是否足够
        const hasEnoughGold = player.gold >= talent.cost;
        
        if (hasEnoughGold) {
            drawRoyaleBevelButton({ x: upgradeBtnX, y: btnY, w: btnW, h: btnH, r: 10 }, '升级', 'gold');
            ctx.fillStyle = '#5a3a00';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('🪙 ' + talent.cost, screenWidth / 2 + btnW / 2 + 10, btnY + btnH - 8);
        } else {
            // 金币不足
            drawRoyaleBevelButton({ x: upgradeBtnX, y: btnY, w: btnW, h: btnH, r: 10 }, '升级', 'red');
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('🪙 ' + talent.cost, screenWidth / 2 + btnW / 2 + 10, btnY + btnH - 8);
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
        // 检查金币是否足够
        if (player.gold < talent.cost) {
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
    if (gameClubButton) {
        gameClubButton.show();
        return;
    }
    if (!wx.createGameClubButton) {
        console.log('当前环境不支持游戏圈');
        return;
    }

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

function hideGameClubButton() {
    if (gameClubButton) {
        gameClubButton.hide();
    }
}

function destroyGameClubButton() {
    if (gameClubButton) {
        gameClubButton.destroy();
        gameClubButton = null;
    }
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
                const newVal = val * 2;
                g.grid[cx][cy] = newVal;
                g.grid[x][y] = 0;
                g.score += newVal;
                mergedFlag[cx + ',' + cy] = true;
                if (newVal === 2048) g.won = true;
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
        if (!g2048MovesAvailable()) g.over = true;
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
            if (idx === qmxz.targetIdx) gQmxzStart(); // 找到房祖名 → 下一关
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
        bdsjm.score += 1;
        bdsjm.flashRow = catRowInt;
        bdsjm.flashCol = bdsjm.catCol;
        bdsjm.catCol = Math.floor(Math.random() * 4);
        bdsjm.catRow = 0;
        bdsjm.dropAnim = 0; // 触发命中反馈
    } else if (row === catRowInt) {
        // 同行走错列 → 游戏结束
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
        g.timeLeft = 0; g.gameOver = true;
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
                g.gameOver = true;
                if (gQiexiguaBest < g.score) { gQiexiguaBest = g.score; try { wx.setStorageSync('gQiexiguaBest', gQiexiguaBest); } catch (e) {} }
                return;
            }
            f.alive = false;
            g.combo += 1;
            g.comboTimer = 0.6;
            const gain = g.combo > 1 ? g.combo : 1;
            g.score += gain;
            for (let i = 0; i < 8; i++) {
                const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 220;
                g.particles.push({ x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.5 + Math.random() * 0.3, color: f.color, r: 3 + Math.random() * 4 });
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
    if (g.timeLeft <= 0) { g.timeLeft = 0; g.gameOver = true; g.overReason = 'time'; gFeidegenggaoSaveBest(g); return; }

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
                for (let i = 0; i < 6; i++) {
                    const a = Math.random() * Math.PI * 2;
                    g.particles.push({ x: p.x, y: pl.y, vx: Math.cos(a) * 120, vy: -Math.random() * 120 - 40, life: 0.4, color: '#ffffff' });
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

    if (p.y - p.r > playBottom + 30) { g.gameOver = true; g.overReason = 'fall'; gFeidegenggaoSaveBest(g); }
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
                g.gameOver = true;
                g.deadLane = lane.index;
                g.deadFlash = 1;
                const col = BNS_RUNNER_COLORS[lane.index % BNS_RUNNER_COLORS.length];
                for (let k = 0; k < 14; k++) {
                    const a = Math.random() * Math.PI * 2;
                    g.particles.push({
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
    if (lane && !lane.jumping) { lane.jumping = true; lane.vy = -BNS_JUMP_V; }
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
    else if (g.state === 'flying') { g.vy = XNF_JUMP_V; }
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
function gZqylBuildShuffle() {
  const n = 3 + gZqyl.level;
  gZqyl.swapQueue = [];
  let prev = -1;
  for (let i = 0; i < n; i++) {
    let a = Math.floor(Math.random() * (ZQYL_CUPS - 1));
    if (a === prev) a = (a + 1) % (ZQYL_CUPS - 1);
    gZqyl.swapQueue.push([a, a + 1]);
    prev = a;
  }
  gZqyl.swapT = 0;
}
function gZqylUpdate(dt) {
  const g = gZqyl;
  if (g.state === 'show') {
    g.showT += dt;
    if (g.showT >= 1.4) { g.state = 'shuffle'; gZqylBuildShuffle(); g.swapT = 0; }
  } else if (g.state === 'shuffle') {
    g.swapT += dt;
    const dur = Math.max(0.18, 0.42 - g.level * 0.02);
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
      if (g.lives <= 0) g.state = 'over';
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
  if (cup.hasCoin) { gZqylSaveBest(); g.level++; g.msg = '👀 眼力不错！进下一关'; }
  else { g.lives--; g.msg = '😵 看走眼了，扣 1 命'; }
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
  ctx.fillStyle = '#fff'; ctx.font = '14px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  let hearts = '';
  for (let i = 0; i < 3; i++) hearts += (i < gZqyl.lives ? '❤' : '🤍');
  ctx.fillText(hearts, screenWidth - L.margin, L.rowB + 16);

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
      if (gQingwaWinCheck()) { g.win = true; gQingwaSaveBest(); }
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
    const tip = gQingwa.history.length ? '可「撤销」退回一步，或点屏幕重来' : '点屏幕重新开始';
    ctx.fillText(tip, screenWidth / 2, screenHeight / 2 + 30);
  } else {
    ctx.fillText('绿圈=可动，灰=不可动。点青蛙跳过空位或隔一蛙', screenWidth / 2, L.boardY + 24);
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
    if (inRect(x, y, L.undoBtn) && g.history.length) { gQingwaUndo(); return; }
    if (inRect(x, y, L.restartBtn)) { gQingwaInit(g.level); return; }
    if (g.history.length) gQingwaUndo(); else gQingwaInit(g.level);
    return;
  }
  if (inRect(x, y, L.restartBtn)) { flushMiniGameSeconds(); gQingwaInit(g.level); return; }
  if (inRect(x, y, L.undoBtn)) { gQingwaUndo(); return; }
  if (inRect(x, y, L.hintBtn)) {
    const sol = gQingwaSolve();
    if (sol && sol.first) { g.hint = 2.2; g.hintFrom = sol.first.from; g.hintTo = sol.first.to; }
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
  g.walls[bk] = true;
  g.steps++;
  // 猫已在边缘 → 直接跑掉（保险判断）
  if (gSjmaoIsBorder(g.cat.q, g.cat.r)) { g.over = true; g.win = false; return; }
  const bmap = gSjmaoBorderDist();
  const catKey = gSjmaoKey(g.cat.q, g.cat.r);
  // 猫所在格到边缘不可达 → 被围住，玩家胜
  if (bmap[catKey] === undefined) { g.win = true; g.over = true; gSjmaoSaveBest(); return; }
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
    const headerH = 50;
    const mapY = headerH + 10;
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
            // 离开游戏圈Tab时销毁原生按钮
            if (mainMenuTab === 'club' && newTab !== 'club') {
                destroyGameClubButton();
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
        drawOrbs();
        drawBullets();
        drawParticles();
        drawLightnings();
        drawBombExplosions();
        
        for (const zombie of zombies) {
            drawZombie(zombie);
        }
        
        drawPlayer();
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
        for (const zombie of zombies) {
            drawZombie(zombie);
        }
        drawPlayer();
        drawUpgradePanel();
    } else if (gameState === 'gameOver') {
        drawBackground();
        for (const zombie of zombies) {
            drawZombie(zombie);
        }
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
                    // 离开游戏圈Tab时销毁原生按钮
                    if (mainMenuTab === 'club') {
                        destroyGameClubButton();
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

        // 天赋Tab：设置触摸起点
        if (mainMenuTab === 'talent') {
            levelTouchStartX = x;  // 复用levelTouchStart坐标
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
                gamePaused = false;
                return;
            }
        } else {
            // 使用炸弹（圆形按钮检测，与drawBombButton一致）
            const btnX = screenWidth - 48;
            const btnY = screenHeight - 48;
            const btnR = 30; // 稍微大一点的点击区域
            const dist = Math.hypot(x - btnX, y - btnY);
            
            if (dist <= btnR && bombCount > 0 && bombCooldown <= 0) {
                if (isAdDemoMode && !adBombExploded) {
                    adDemoBombExplosion();
                } else {
                    useBomb();
                }
            }
        }
    } else if (gameState === 'upgrade') {
        // 三个卡片并排布局的点击检测（与drawUpgradePanel一致）
        const cardW = 80;
        const cardH = 95;
        const cardGap = 8;
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

        const panelX = (screenWidth - totalWidth) / 2 - 25;
        const panelY = screenHeight - 130 - panelH;
        const panelW = totalWidth + 50;

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
    } else if (gameState === 'gameOver') {
        // 与drawGameOver一致的弹窗位置
        const modalW = Math.min(300, screenWidth * 0.85);
        const modalH = 220;
        const modalX = (screenWidth - modalW) / 2;
        const modalY = screenHeight - 130 - modalH;
        
        const btnW = 90;
        const btnH = 32;
        const gap = 10;
        const totalW = btnW * 2 + gap;
        const startX = screenWidth / 2 - totalW / 2;
        const btnY = modalY + 160;
        
        if (y >= btnY && y <= btnY + btnH) {
            if (x >= startX && x <= startX + btnW) {
                startGame();
                return;
            } else if (x >= startX + btnW + gap && x <= startX + totalW) {
                levelReturnHandled = true;  // 标记已处理
                gameState = 'mainMenu';
                mainMenuTab = 'level';  // 确保回到关卡Tab
                return;
            }
        }
    } else if (gameState === 'victory') {
        // 与drawVictory一致的弹窗位置
        const modalW = Math.min(300, screenWidth * 0.85);
        const modalH = 250;
        const modalX = (screenWidth - modalW) / 2;
        const modalY = screenHeight - 130 - modalH;
        
        const btnW = 68;
        const btnH = 30;
        const gap = 6;
        const btnY = modalY + 185;
        
        if (currentStage < STAGES.length) {
            const btnCount = 3;
            const totalW = btnW * btnCount + gap * (btnCount - 1);
            const startX = screenWidth / 2 - totalW / 2;
            
            if (y >= btnY && y <= btnY + btnH) {
                if (x >= startX && x <= startX + btnW) {
                    // 下一关
                    if (currentStage < STAGES.length) {
                        currentStage++;
                    }
                    startGame();
                    return;
                } else if (x >= startX + btnW + gap && x <= startX + btnW * 2 + gap) {
                    startGame();
                    return;
                } else if (x >= startX + (btnW + gap) * 2 && x <= startX + totalW) {
                    levelReturnHandled = true;  // 标记已处理
                    gameState = 'mainMenu';
                    mainMenuTab = 'level';  // 确保回到关卡Tab
                    return;
                }
            }
        } else {
            const totalW = btnW * 2 + gap;
            const startX = screenWidth / 2 - totalW / 2;

            if (y >= btnY && y <= btnY + btnH) {
                if (x >= startX && x <= startX + btnW) {
                    startGame();
                    return;
                } else if (x >= startX + btnW + gap && x <= startX + totalW) {
                    levelReturnHandled = true;  // 标记已处理
                    gameState = 'mainMenu';
                    mainMenuTab = 'level';  // 确保回到关卡Tab
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
            handleTalentClick(levelTouchStartX, levelTouchStartY);
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
    const img = wx.createImage();
    img.onload = () => {
        wechatAvatarImage = img;
    };
    img.src = url;
}
