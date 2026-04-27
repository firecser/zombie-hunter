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
    // 天空渐变
    const skyGradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
    skyGradient.addColorStop(0, '#2a3a4a');
    skyGradient.addColorStop(0.6, '#4a5a6a');
    skyGradient.addColorStop(1, '#6a7a8a');
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 雪地地面
    const groundY = screenHeight * 0.85;
    const snowGradient = ctx.createLinearGradient(0, groundY, 0, screenHeight);
    snowGradient.addColorStop(0, '#d0dce8');
    snowGradient.addColorStop(1, '#a0b0c0');
    ctx.fillStyle = snowGradient;
    ctx.fillRect(0, groundY, screenWidth, screenHeight - groundY);
    
    // 远处冰山
    ctx.fillStyle = 'rgba(100, 130, 160, 0.4)';
    for (let i = 0; i < 5; i++) {
        const x = (i / 5) * screenWidth;
        ctx.beginPath();
        ctx.moveTo(x - 100, groundY);
        ctx.lineTo(x, groundY - 80 - i * 20);
        ctx.lineTo(x + 100, groundY);
        ctx.fill();
    }
    
    // 雪花
    const time = Date.now() / 1000;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 50; i++) {
        const x = ((i * 137.5 + time * 20) % screenWidth);
        const y = ((i * 73.3 + time * 30) % screenHeight);
        const size = 1 + (i % 3);
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x - 20, y - 16, 40, 32);
    
    // 车身
    ctx.fillStyle = hurtFlash ? '#ff4444' : '#4a7c4e';
    ctx.fillRect(x - 18, y - 14, 36, 28);
    
    // 车身边缘
    ctx.fillStyle = hurtFlash ? '#cc2222' : '#2d5a2e';
    ctx.fillRect(x - 18, y - 14, 2, 28);
    ctx.fillRect(x + 16, y - 14, 2, 28);
    ctx.fillRect(x - 16, y - 14, 32, 2);
    ctx.fillRect(x - 16, y + 12, 32, 2);
    
    // 车身高光
    ctx.fillStyle = hurtFlash ? '#ff6666' : '#5a9a5c';
    ctx.fillRect(x - 14, y - 12, 4, 20);
    
    // 车窗
    ctx.fillStyle = '#1a3a4a';
    ctx.fillRect(x - 8, y - 8, 16, 12);
    ctx.fillStyle = '#2a5a7a';
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
    
    // 身体颜色
    const bodyColors = {
        normal: { body: '#7a9ab0', coat: '#8aaac0', outline: '#5a7a90' },
        fast: { body: '#9a7ab0', coat: '#aa8ac0', outline: '#7a5a90' },
        tank: { body: '#7a7a9a', coat: '#8a8aaa', outline: '#5a5a7a' },
        boss: { body: '#aa5a6a', coat: '#ba6a7a', outline: '#8a4a5a' }
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
    ctx.fillStyle = '#8aaaba';
    ctx.fill();
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 脸部
    ctx.fillStyle = '#aacad8';
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

// 绘制子弹
function drawBullets() {
    for (const bullet of bullets) {
        // 发光效果
        const gradient = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, bullet.radius * 4);
        gradient.addColorStop(0, 'rgba(255, 150, 50, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius * 4, 0, Math.PI * 2);
        ctx.fill();
        
        // 核心
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffaa00';
        ctx.fill();
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

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 8);
    ctx.fill();

    // 描边（与暂停按钮一致：金色2px）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, panelX, panelY, panelW, panelH, 8);
    ctx.stroke();
    
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
    
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, barX - 4, barY - 2, barW + 8, barH + 10, 6);
    ctx.fill();
    
    // 心形图标
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('❤️', barX, barY + 5);
    
    // 血条背景
    const healthBarX = barX + 14;
    ctx.fillStyle = 'rgba(80,80,80,0.8)';
    ctx.fillRect(healthBarX, barY, barW - 35, 4);
    
    // 血条填充
    const healthPercent = player.health / player.maxHealth;
    const healthGradient = ctx.createLinearGradient(healthBarX, 0, healthBarX + barW - 35, 0);
    healthGradient.addColorStop(0, '#ff4444');
    healthGradient.addColorStop(1, '#ff6644');
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
        ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
        ctx.fill();
    }
    
    // 按钮背景
    ctx.beginPath();
    ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fill();
    
    // 边框（可用时红色，否则灰色）
    ctx.strokeStyle = isAvailable ? '#ff4444' : '#666';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 炸弹图标
    ctx.fillStyle = '#fff';
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', btnX, btnY - 5);
    
    // 数量
    ctx.fillStyle = '#ff4444';
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
    // 音效按钮
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(ctx, soundBtnX, soundBtnY, buttonSize, buttonSize, 10);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, soundBtnX, soundBtnY, buttonSize, buttonSize, 10);
    ctx.stroke();
    
    // 音效图标
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(soundEnabled ? '🔊' : '🔇', soundBtnX + buttonSize / 2, soundBtnY + buttonSize / 2);
    
    // 暂停按钮
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(ctx, pauseBtnX, pauseBtnY, buttonSize, buttonSize, 10);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
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

    // 弹窗背景
    const modalW = 220;
    const modalH = 160;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = screenHeight - 130 - modalH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    roundRect(ctx, modalX, modalY, modalW, modalH, 10);
    ctx.fill();

    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 10);
    ctx.stroke();

    // 标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏸️ 游戏暂停', screenWidth / 2, modalY + 30);

    // 按钮（正方形，与技能图标样式一致）
    const btnSize = 48;
    const gap = 15;
    const totalW = btnSize * 2 + gap;
    const startX = screenWidth / 2 - totalW / 2;
    const btnY = modalY + 65;

    // 继续按钮（绿色渐变 + 边框）
    const continueGradient = ctx.createLinearGradient(startX, btnY, startX, btnY + btnSize);
    continueGradient.addColorStop(0, '#44aa44');
    continueGradient.addColorStop(1, '#338833');
    ctx.fillStyle = continueGradient;
    roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
    ctx.fill();
    ctx.strokeStyle = '#66cc66';
    ctx.lineWidth = 2;
    roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
    ctx.stroke();

    // 返回关卡按钮（灰色渐变 + 边框）
    const backGradient = ctx.createLinearGradient(startX + btnSize + gap, btnY, startX + btnSize + gap, btnY + btnSize);
    backGradient.addColorStop(0, '#4a4e69');
    backGradient.addColorStop(1, '#2d2d44');
    ctx.fillStyle = backGradient;
    roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
    ctx.fill();
    ctx.strokeStyle = '#6a6e89';
    ctx.lineWidth = 2;
    roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
    ctx.stroke();

    // 按钮文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶️', startX + btnSize / 2, btnY + btnSize / 2 - 8);
    ctx.font = 'bold 10px Arial';
    ctx.fillText('继续', startX + btnSize / 2, btnY + btnSize / 2 + 10);
    ctx.font = 'bold 16px Arial';
    ctx.fillText('📋', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 - 8);
    ctx.font = 'bold 10px Arial';
    ctx.fillText('关卡', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 + 10);
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
        
        // 技能按钮背景（带金色边框）
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        roundRect(ctx, skillX, skillY, skillSize, skillSize, 6);
        ctx.fill();
        
        // 金色边框
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.lineWidth = 1;
        roundRect(ctx, skillX, skillY, skillSize, skillSize, 6);
        ctx.stroke();
        
        // 图标
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(skill.icon, skillX + skillSize / 2, skillY + skillSize / 2 - 3);
        
        // 等级
        ctx.fillStyle = '#ffd700';
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
    
    // 开始按钮
    const btnW = 140;
    const btnH = 45;
    const btnX = screenWidth / 2 - btnW / 2;
    const btnY = screenHeight * 0.68;

    const btnGradient = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGradient.addColorStop(0, '#44aa44');
    btnGradient.addColorStop(1, '#338833');
    ctx.fillStyle = btnGradient;
    roundRect(ctx, btnX, btnY, btnW, btnH, 8);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('开始游戏', screenWidth / 2, btnY + btnH / 2);
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
        ctx.fillStyle = isUnlocked ? '#2d2d44' : '#1a1a2e';
        roundRect(ctx, x, y, cardW, cardH, 8);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = isCompleted ? '#44cc44' : (isUnlocked ? '#4a4e69' : '#333');
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
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗背景
    const modalW = Math.min(300, screenWidth * 0.85);
    const modalH = 220;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = screenHeight - 130 - modalH;
    const padding = 20;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    roundRect(ctx, modalX, modalY, modalW, modalH, 12);
    ctx.fill();

    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 12);
    ctx.stroke();
    
    // 标题
    ctx.fillStyle = '#ff4444';
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
    
    // 按钮（正方形，与技能图标样式一致）
    const btnSize = 48;
    const gap = 15;
    const totalW = btnSize * 2 + gap;
    const startX = screenWidth / 2 - totalW / 2;
    const btnY = modalY + 155;

    // 重玩按钮（红色渐变 + 边框）
    const restartGradient = ctx.createLinearGradient(startX, btnY, startX, btnY + btnSize);
    restartGradient.addColorStop(0, '#ff4444');
    restartGradient.addColorStop(1, '#cc2222');
    ctx.fillStyle = restartGradient;
    roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
    ctx.fill();
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 2;
    roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
    ctx.stroke();

    // 返回关卡按钮（灰色渐变 + 边框）
    const backGradient = ctx.createLinearGradient(startX + btnSize + gap, btnY, startX + btnSize + gap, btnY + btnSize);
    backGradient.addColorStop(0, '#4a4e69');
    backGradient.addColorStop(1, '#2d2d44');
    ctx.fillStyle = backGradient;
    roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
    ctx.fill();
    ctx.strokeStyle = '#6a6e89';
    ctx.lineWidth = 2;
    roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
    ctx.stroke();

    // 按钮文字
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔄', startX + btnSize / 2, btnY + btnSize / 2 - 8);
    ctx.font = 'bold 10px Arial';
    ctx.fillText('重玩', startX + btnSize / 2, btnY + btnSize / 2 + 10);
    ctx.font = 'bold 16px Arial';
    ctx.fillText('📋', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 - 8);
    ctx.font = 'bold 10px Arial';
    ctx.fillText('关卡', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 + 10);
}

// 通关界面
function drawVictory() {
    // 半透明背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 弹窗背景
    const modalW = Math.min(300, screenWidth * 0.85);
    const modalH = 250;
    const modalX = (screenWidth - modalW) / 2;
    const modalY = screenHeight - 130 - modalH;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    roundRect(ctx, modalX, modalY, modalW, modalH, 12);
    ctx.fill();
    
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    roundRect(ctx, modalX, modalY, modalW, modalH, 12);
    ctx.stroke();
    
    // 标题
    ctx.fillStyle = '#ffd700';
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
        const btnCount = 3;
        const totalW = btnSize * btnCount + gap * (btnCount - 1);
        const startX = screenWidth / 2 - totalW / 2;

        // 下一关按钮（绿色渐变 + 边框）
        const nextGradient = ctx.createLinearGradient(startX, btnY, startX, btnY + btnSize);
        nextGradient.addColorStop(0, '#44aa44');
        nextGradient.addColorStop(1, '#228822');
        ctx.fillStyle = nextGradient;
        roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
        ctx.fill();
        ctx.strokeStyle = '#66cc66';
        ctx.lineWidth = 2;
        roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
        ctx.stroke();

        // 重玩按钮（金色渐变 + 边框）
        const replayGradient = ctx.createLinearGradient(startX + btnSize + gap, btnY, startX + btnSize + gap, btnY + btnSize);
        replayGradient.addColorStop(0, '#ffd700');
        replayGradient.addColorStop(1, '#ff8c00');
        ctx.fillStyle = replayGradient;
        roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
        ctx.fill();
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 2;
        roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
        ctx.stroke();

        // 关卡按钮（灰色渐变 + 边框）
        const stageGradient = ctx.createLinearGradient(startX + (btnSize + gap) * 2, btnY, startX + (btnSize + gap) * 2, btnY + btnSize);
        stageGradient.addColorStop(0, '#4a4e69');
        stageGradient.addColorStop(1, '#2d2d44');
        ctx.fillStyle = stageGradient;
        roundRect(ctx, startX + (btnSize + gap) * 2, btnY, btnSize, btnSize, 8);
        ctx.fill();
        ctx.strokeStyle = '#6a6e89';
        ctx.lineWidth = 2;
        roundRect(ctx, startX + (btnSize + gap) * 2, btnY, btnSize, btnSize, 8);
        ctx.stroke();

        // 按钮文字
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('▶️', startX + btnSize / 2, btnY + btnSize / 2 - 8);
        ctx.font = 'bold 9px Arial';
        ctx.fillText('下一关', startX + btnSize / 2, btnY + btnSize / 2 + 10);
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('🔄', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 - 8);
        ctx.font = 'bold 9px Arial';
        ctx.fillText('重玩', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 + 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('📋', startX + (btnSize + gap) * 2 + btnSize / 2, btnY + btnSize / 2 - 8);
        ctx.font = 'bold 9px Arial';
        ctx.fillText('关卡', startX + (btnSize + gap) * 2 + btnSize / 2, btnY + btnSize / 2 + 10);
    } else {
        // 全通关 - 只显示两个按钮
        const totalW = btnSize * 2 + gap;
        const startX = screenWidth / 2 - totalW / 2;

        const replayGradient = ctx.createLinearGradient(startX, btnY, startX, btnY + btnSize);
        replayGradient.addColorStop(0, '#ffd700');
        replayGradient.addColorStop(1, '#ff8c00');
        ctx.fillStyle = replayGradient;
        roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
        ctx.fill();
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 2;
        roundRect(ctx, startX, btnY, btnSize, btnSize, 8);
        ctx.stroke();

        const stageGradient = ctx.createLinearGradient(startX + btnSize + gap, btnY, startX + btnSize + gap, btnY + btnSize);
        stageGradient.addColorStop(0, '#4a4e69');
        stageGradient.addColorStop(1, '#2d2d44');
        ctx.fillStyle = stageGradient;
        roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
        ctx.fill();
        ctx.strokeStyle = '#6a6e89';
        ctx.lineWidth = 2;
        roundRect(ctx, startX + btnSize + gap, btnY, btnSize, btnSize, 8);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('🔄', startX + btnSize / 2, btnY + btnSize / 2 - 8);
        ctx.font = 'bold 9px Arial';
        ctx.fillText('重玩', startX + btnSize / 2, btnY + btnSize / 2 + 10);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('📋', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 - 8);
        ctx.font = 'bold 9px Arial';
        ctx.fillText('关卡', startX + btnSize + gap + btnSize / 2, btnY + btnSize / 2 + 10);
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
    
    // 外框阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    
    // 外框背景
    const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGradient.addColorStop(0, '#2a2a3e');
    panelGradient.addColorStop(1, '#1a1a28');
    ctx.fillStyle = panelGradient;
    roundRect(ctx, panelX, panelY, panelW, panelH, 15);
    ctx.fill();
    
    // 清除阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // 外框边框（金色）
    ctx.strokeStyle = '#ffd700';
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
        cardGradient.addColorStop(0, '#3a3a5a');
        cardGradient.addColorStop(1, '#252538');
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
    { id: 'world', icon: '🗺️', name: '世界' }
    // 商城暂时屏蔽
    // { id: 'shop', icon: '🛒', name: '商城' }
];
const MAIN_MENU_NAV_H = 65;

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
    { rank: 23, name: '冰雪猎人', location: '湖南 长沙', level: 12, power: 12800 },
    { rank: 24, name: '霜刃飞舞', location: '广东 广州', level: 21, power: 28600 },
    { rank: 25, name: '寒冰冷酷', location: '广西 南宁', level: 20, power: 25800 },
];

// 模拟好友排行榜数据
const rankFriendData = [
    { rank: 1, name: '小明', location: '广东 深圳', level: 38, power: 89200, avatar: '🎮' },
    { rank: 2, name: '老王', location: '北京', level: 35, power: 75600, avatar: '🎯' },
    { rank: 3, name: '小李', location: '上海', level: 32, power: 62400, avatar: '⚔️' },
    { rank: 4, name: '阿强', location: '浙江 杭州', level: 28, power: 48600, avatar: '🛡️' },
    { rank: 5, name: '冰雪猎人', location: '湖南 长沙', level: 12, power: 12800, avatar: '❄️' },
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

// 天赋数据（按章节解锁）
// prerequisite: { id: 'talent_id', level: N } - 前置天赋及其等级要求
let talentData = {
    'core': { name: '怪物之心', icon: '👾', level: 0, max: 20, cost: 2000, effect: '全体属性+2%', chapter: 1, prerequisite: null },
    'damage': { name: '攻击力', icon: '⚔️', level: 0, max: 30, cost: 300, effect: '攻击力+3%', chapter: 2, prerequisite: { id: 'core', level: 5 } },
    'health': { name: '生命', icon: '❤️', level: 0, max: 30, cost: 300, effect: '生命+30', chapter: 2, prerequisite: { id: 'core', level: 5 } },
    'goldearn': { name: '金币获取', icon: '🪙', level: 0, max: 20, cost: 400, effect: '金币+8%', chapter: 2, prerequisite: { id: 'damage', level: 3 } },
    'expearn': { name: '经验获取', icon: '⭐', level: 0, max: 20, cost: 400, effect: '经验+8%', chapter: 2, prerequisite: { id: 'damage', level: 3 } },
    'attackspeed': { name: '攻击速度', icon: '⚡', level: 0, max: 20, cost: 500, effect: '攻速+2%', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'crit': { name: '暴击率', icon: '💥', level: 0, max: 25, cost: 500, effect: '暴击+1.5%', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'piercing': { name: '穿透', icon: '🗡️', level: 0, max: 10, cost: 800, effect: '穿透+1', chapter: 4, prerequisite: { id: 'damage', level: 10 } },
    'shield': { name: '护盾', icon: '🛡️', level: 0, max: 20, cost: 500, effect: '护盾+20', chapter: 4, prerequisite: { id: 'health', level: 10 } },
    'explosive': { name: '爆炸', icon: '💣', level: 0, max: 10, cost: 1000, effect: '范围+10%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'freeze': { name: '冰冻', icon: '❄️', level: 0, max: 15, cost: 800, effect: '冰冻+1.5%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'slow': { name: '减速', icon: '🐌', level: 0, max: 15, cost: 800, effect: '减速+2%', chapter: 6, prerequisite: { id: 'attackspeed', level: 5 } },
    'bombcount': { name: '炸弹上限', icon: '💣', level: 0, max: 8, cost: 1200, effect: '上限+1', chapter: 6, prerequisite: { id: 'shield', level: 5 } },
    'lightning': { name: '闪电链', icon: '⚡', level: 0, max: 10, cost: 1500, effect: '弹射+1', chapter: 8, prerequisite: { id: 'crit', level: 10 } },
    'multishot': { name: '连射', icon: '🏹', level: 0, max: 8, cost: 1500, effect: '子弹+1', chapter: 8, prerequisite: { id: 'crit', level: 10 } },
    'deathray': { name: '死亡射线', icon: '💥', level: 0, max: 5, cost: 5000, effect: '全屏伤害', chapter: 10, prerequisite: { id: 'lightning', level: 5 } },
    'immortal': { name: '不朽之身', icon: '🔮', level: 0, max: 3, cost: 8000, effect: '复活1次', chapter: 10, prerequisite: { id: 'lightning', level: 5 } },
    'devour': { name: '吞噬万物', icon: '🌪️', level: 0, max: 5, cost: 5000, effect: '吸收伤害', chapter: 10, prerequisite: { id: 'lightning', level: 5 } }
};

// 检查天赋是否满足前置条件
function isTalentUnlocked(talentId) {
    const talent = talentData[talentId];
    if (!talent.prerequisite) return true; // 无前置条件
    const preTalent = talentData[talent.prerequisite.id];
    return preTalent.level >= talent.prerequisite.level;
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
    // 渐变背景
    const bgGrad = ctx.createLinearGradient(0, 0, 0, screenHeight);
    bgGrad.addColorStop(0, '#0f3460');
    bgGrad.addColorStop(1, '#16213e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
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
}

function drawMainMenuNav() {
    const navY = screenHeight - MAIN_MENU_NAV_H;
    const btnW = screenWidth / MAIN_MENU_TABS.length;  // 适配6个Tab
    
    // 导航背景
    ctx.fillStyle = 'rgba(22, 33, 62, 0.98)';
    ctx.fillRect(0, navY, screenWidth, MAIN_MENU_NAV_H);
    
    // 顶部细线
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, navY);
    ctx.lineTo(screenWidth, navY);
    ctx.stroke();
    
    MAIN_MENU_TABS.forEach((tab, i) => {
        const bx = i * btnW;
        const isActive = mainMenuTab === tab.id;
        
        // 选中指示条
        if (isActive) {
            ctx.fillStyle = '#4fc3f7';
            ctx.fillRect(bx + 10, navY + 2, btnW - 20, 3);
        }
        
        // 图标
        ctx.fillStyle = isActive ? '#4fc3f7' : '#666';
        ctx.font = isActive ? 'bold 22px Arial' : '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(tab.icon, bx + btnW / 2, navY + 28);
        
        // 名称
        ctx.fillStyle = isActive ? '#fff' : '#666';
        ctx.font = '10px Arial';
        ctx.fillText(tab.name, bx + btnW / 2, navY + 48);
    });
}

// 主角Tab
function drawMainMenuHero() {
    const topOffset = SAFE_TOP_OFFSET;

    // 标题
    ctx.fillStyle = '#e8d5b7';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('主角', screenWidth / 2, topOffset + 20);

    // ===== 体力条区域 =====
    const energyBarY = topOffset + 35;
    const energyBarX = 20;
    const energyBarW = screenWidth - 40;
    const energyBarH = 24;
    const energyBarRadius = 12;

    // 更新体力实时恢复
    updateEnergyRealtime();

    // 体力条背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    roundRect(ctx, energyBarX, energyBarY, energyBarW, energyBarH, energyBarRadius);
    ctx.fill();

    // 体力条填充
    const energyPercent = playerEnergy / ENERGY_CONFIG.maxEnergy;
    const energyFillW = (energyBarW - 4) * energyPercent;
    if (energyFillW > 0) {
        const energyGrad = ctx.createLinearGradient(energyBarX, 0, energyBarX + energyBarW, 0);
        energyGrad.addColorStop(0, '#4fc3f7');
        energyGrad.addColorStop(1, '#81d4fa');
        ctx.fillStyle = energyGrad;
        roundRect(ctx, energyBarX + 2, energyBarY + 2, energyFillW, energyBarH - 4, energyBarRadius - 2);
        ctx.fill();
    }

    // 体力文字：左侧图标+数值
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', energyBarX + 10, energyBarY + energyBarH / 2);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(playerEnergy + '/' + ENERGY_CONFIG.maxEnergy, energyBarX + 26, energyBarY + energyBarH / 2);

    // 右侧：恢复进度文字
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 10px Arial';
    if (playerEnergy >= ENERGY_CONFIG.maxEnergy) {
        ctx.fillText('已满', energyBarX + energyBarW - 10, energyBarY + energyBarH / 2);
    } else {
        const recoverMs = ENERGY_CONFIG.recoverTime;
        const elapsed = Date.now() - lastEnergyUpdate;
        const nextRecoverIn = Math.max(0, recoverMs - elapsed);
        const minutes = Math.ceil(nextRecoverIn / 60000);
        ctx.fillText(minutes + '分钟后+1', energyBarX + energyBarW - 10, energyBarY + energyBarH / 2);
    }

    ctx.textBaseline = 'alphabetic';
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
        
        // 槽位背景
        ctx.fillStyle = 'rgba(50, 50, 60, 0.8)';
        roundRect(ctx, sx, sy, slotSize, slotSize, 10);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        roundRect(ctx, sx, sy, slotSize, slotSize, 10);
        ctx.stroke();
        
        // 图标
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slotIcons[i], sx + slotSize / 2, sy + slotSize / 2);
    }
    
    ctx.textBaseline = 'alphabetic';
    
    // ===== 中央头像 =====
    // 光晕
    const glowGrad = ctx.createRadialGradient(centerX, avatarY, avatarR * 0.5, centerX, avatarY, avatarR * 1.5);
    glowGrad.addColorStop(0, 'rgba(79, 195, 247, 0.3)');
    glowGrad.addColorStop(1, 'rgba(79, 195, 247, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(centerX, avatarY, avatarR * 1.5, 0, Math.PI * 2);
    ctx.fill();
    
    // 头像边框
    ctx.strokeStyle = '#4fc3f7';
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
    
    // 怪物图标
    ctx.fillStyle = '#fff';
    ctx.font = '40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👾', centerX, avatarY);
    ctx.textBaseline = 'alphabetic';
    
    // ===== 底部信息面板 =====
    const panelX = 15;
    const panelY = avatarY + avatarR + 45;
    const panelW = screenWidth - 30;
    const panelH = 115;
    
    // 面板背景
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 15);
    ctx.fill();
    
    // 4行信息
    const rows = [
        { label: '玩家名字', value: heroData.name },
        { label: '天赋等级', value: 'Lv.' + heroData.level },
        { label: '排行榜名次', value: '第 ' + heroData.rank + ' 名' },
        { label: '总战力', value: heroData.power.toLocaleString() }
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
        ctx.fillStyle = '#888';
        ctx.font = '13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(row.label, labelX, rowY);
        
        // 数值
        ctx.fillStyle = '#4fc3f7';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(row.value, valueX, rowY);
    });

    // ===== 设置按钮 =====
    const settingsBtnY = panelY + panelH + 20;
    const settingsBtnH = 45;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    roundRect(ctx, panelX, settingsBtnY, panelW, settingsBtnH, 10);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚙️  游戏设置', centerX, settingsBtnY + 28);
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
                ctx.fillStyle = isCompleted ? '#ffd700' : '#3a4a5a';
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
    
    // 弹窗背景
    const bgGrad = ctx.createLinearGradient(0, modalY, 0, modalY + modalH);
    bgGrad.addColorStop(0, '#1e3a5f');
    bgGrad.addColorStop(1, '#16213e');
    ctx.fillStyle = bgGrad;
    roundRect(ctx, modalX, modalY, modalW, modalH, 15);
    ctx.fill();
    
    // 边框
    ctx.strokeStyle = '#4fc3f7';
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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, screenWidth / 2 - btnW - 10, btnY, btnW, btnH, 10);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = '14px Arial';
    ctx.fillText('关闭', screenWidth / 2 - btnW / 2 - 10, btnY + 25);
    
    // 升级按钮
    if (canUpgrade) {
        // 检查金币是否足够
        const hasEnoughGold = player.gold >= talent.cost;
        
        if (hasEnoughGold) {
            ctx.fillStyle = '#4fc3f7';
            roundRect(ctx, upgradeBtnX, btnY, btnW, btnH, 10);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.fillText('升级', screenWidth / 2 + btnW / 2 + 10, btnY + 25);
            
            // 消耗
            ctx.font = '12px Arial';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('🪙 ' + talent.cost, screenWidth / 2 + btnW / 2 + 10, btnY + 38);
        } else {
            // 金币不足，灰色按钮
            ctx.fillStyle = '#444';
            roundRect(ctx, upgradeBtnX, btnY, btnW, btnH, 10);
            ctx.fill();
            ctx.fillStyle = '#888';
            ctx.font = '14px Arial';
            ctx.fillText('升级', screenWidth / 2 + btnW / 2 + 10, btnY + 25);
            
            // 显示消耗（红色表示不足）
            ctx.font = '12px Arial';
            ctx.fillStyle = '#ff6b6b';
            ctx.fillText('🪙 ' + talent.cost, screenWidth / 2 + btnW / 2 + 10, btnY + 38);
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
    const currentData = rankTab === 'global' ? rankCityData : rankFriendData;
    const navH = MAIN_MENU_NAV_H;

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
        const isMe = item.name === heroData.name && rankTab === 'global';

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
            const medals = ['🥇', '🥈', '🥉'];
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
        ctx.fillStyle = 'rgba(79, 195, 247, 0.3)';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // 头像内的图标
        ctx.font = '16px Arial';
        ctx.fillStyle = '#4fc3f7';
        ctx.textAlign = 'center';
        ctx.fillText('🎮', avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 5);

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

        // 战力
        ctx.fillStyle = '#4fc3f7';
        ctx.font = 'bold 13px Arial';
        const powerStr = item.power >= 10000 ? (item.power / 10000).toFixed(1) + '万' : item.power.toString();
        ctx.fillText(powerStr, rightX, itemY + itemH / 2 - 3);

        // 等级
        ctx.fillStyle = '#888';
        ctx.font = '10px Arial';
        ctx.fillText('Lv.' + item.level, rightX, itemY + itemH / 2 + 12);
    }

    // 恢复上下文，结束裁剪
    ctx.restore();

    // 底部提示
    const tipY = screenHeight - navH - 5;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#555';
    ctx.font = '10px Arial';
    if (rankTab === 'global') {
        ctx.fillText('本地前100名排行榜', screenWidth / 2, tipY);
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

    // 弹窗背景
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    roundRect(ctx, modalX, modalY, modalW, modalH, 16);
    ctx.fill();

    // 弹窗边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
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

    // 弹窗背景
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    roundRect(ctx, modalX, modalY, modalW, modalH, 16);
    ctx.fill();

    // 弹窗边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
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

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundRect(ctx, closeBtnX, closeBtnY, closeBtnW, closeBtnH, 8);
        ctx.fill();

        ctx.fillStyle = '#888';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('关闭', closeBtnX + closeBtnW / 2, closeBtnY + 23);

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
    }
}

// ==================== 游戏循环 ====================
function gameLoop() {
    const now = Date.now();
    const dt = Math.min(now - lastTime, 50);
    
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    
    if (gameState === 'mainMenu') {
        // 实时更新体力
        updateEnergyRealtime();
        drawMainMenu();
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
    
    if (gameState === 'mainMenu') {
        const navY = screenHeight - MAIN_MENU_NAV_H;
        
        // 点击底部导航
        if (y >= navY) {
            const btnW = screenWidth / MAIN_MENU_TABS.length;
            const tabIndex = Math.floor(x / btnW);
            if (tabIndex >= 0 && tabIndex < MAIN_MENU_TABS.length) {
                const newTab = MAIN_MENU_TABS[tabIndex].id;
                if (newTab !== mainMenuTab) {  // Tab有变化时才切换
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

    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

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

            // 限制滚动范围
            const currentData = rankTab === 'global' ? rankCityData : rankFriendData;
            const totalItems = currentData.length;
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
        const tabY = 55;
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

// 获取微信昵称
loadWechatNickname();

gameLoop();

// ==================== 微信昵称获取 ====================
function loadWechatNickname() {
    // 优先使用缓存的昵称
    const cachedNickname = wx.getStorageSync('zombieHunterNickname');
    if (cachedNickname) {
        heroData.name = cachedNickname;
        return;
    }
    
    // 尝试获取微信用户信息
    if (wx.getUserProfile) {
        wx.getUserProfile({
            desc: '用于显示游戏昵称',
            success: (res) => {
                const nickname = res.userInfo.nickName;
                heroData.name = nickname;
                wx.setStorageSync('zombieHunterNickname', nickname);
            },
            fail: () => {
                // 授权失败，使用默认昵称
                console.log('获取微信昵称失败，使用默认昵称');
            }
        });
    }
}
