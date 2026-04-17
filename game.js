// 制霸新手村的骷髅怪 - 微信小游戏完整版
// 基于 H5闯关版完整移植
// 版本: 1.0.1

// ==================== 基础设置 ====================
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const screenWidth = canvas.width;
const screenHeight = canvas.height;

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
    { id: 6, name: '极寒地狱', icon: '💀', desc: '究极挑战', difficulty: 6, descColor: '#ff6666',
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

function saveProgress() {
    stageProgress[currentStage - 1] = true;
    wx.setStorageSync('zombieHunterProgress', JSON.stringify(stageProgress));
}

// ==================== 游戏状态 ====================
let gameState = 'mainMenu'; // start, mainMenu, stageSelect, playing, paused, gameOver, victory, upgrade
let isFirstEntry = true; // 是否为首次进入游戏
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

// ==================== 音效和暂停设置 ====================
let soundEnabled = true;
let musicEnabled = true;
const buttonSize = 44;
const buttonGap = 6;
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
    
    // ========== 顶部信息栏（复刻H5版本） ==========
    // 左上角信息面板（向上移动30px，避开刘海屏）
    const panelX = 10;
    const panelY = 30;
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
    ctx.fillText(`💀${player.kills} 💰${player.gold}`, panelX + 8, panelY + 48);
    
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
    ctx.fillText('💀 制霸新手村的骷髅怪 🎯', screenWidth / 2, screenHeight * 0.30);
    
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
    ctx.fillText('💀 游戏结束', screenWidth / 2, modalY + 35);
    
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
    AudioSystem.stopBGM();
    AudioSystem.playGameOver();
}

// 胜利
function victory() {
    gameState = 'victory';
    gameRunning = false;
    saveProgress();
    AudioSystem.stopBGM();
    AudioSystem.playVictory();
}

// 开始游戏
function startGame() {
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
    
    // 重置玩家
    player.x = screenWidth / 2;
    player.y = screenHeight - 80;
    player.health = 100;
    player.maxHealth = 100;
    player.exp = 0;
    player.level = 1;
    player.expToLevel = 50;
    player.gold = 0;
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

// ==================== 主界面（简化版-只有关卡Tab）====================
function drawMainMenu() {
    drawBackground();
    
    // 顶部标题
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎮 选择关卡', screenWidth / 2, 35);
    
    // 关卡网格
    const cols = 2;
    const cardW = (screenWidth - 50) / cols;
    const cardH = 80;
    const gap = 10;
    const startY = 60;
    
    STAGES.forEach((stage, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = 20 + col * (cardW + gap);
        const cy = startY + row * (cardH + gap);
        
        const isUnlocked = i === 0 || stageProgress[i - 1];
        
        // 卡片背景
        const gradient = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
        if (isUnlocked) {
            gradient.addColorStop(0, '#2a4a7a');
            gradient.addColorStop(1, '#1a3a6a');
        } else {
            gradient.addColorStop(0, '#3a3a4a');
            gradient.addColorStop(1, '#2a2a3a');
        }
        ctx.fillStyle = gradient;
        roundRect(ctx, cx, cy, cardW, cardH, 8);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = isUnlocked ? '#4a6a9a' : '#5a5a6a';
        ctx.lineWidth = 1;
        roundRect(ctx, cx, cy, cardW, cardH, 8);
        ctx.stroke();
        
        // 关卡名
        ctx.fillStyle = isUnlocked ? '#fff' : '#888';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`第${stage.id}关`, cx + cardW / 2, cy + 30);
        
        // 状态
        ctx.font = '11px Arial';
        if (isUnlocked) {
            ctx.fillStyle = '#7ac';
            ctx.fillText(stageProgress[i] ? '✅ 已通关' : '🕹️ 可挑战', cx + cardW / 2, cy + 52);
        } else {
            ctx.fillText('🔒 未解锁', cx + cardW / 2, cy + 52);
        }
    });
    
    // 底部提示
    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.fillText('点击关卡开始游戏', screenWidth / 2, screenHeight - 30);
}

function handleMainMenuTouch(x, y) {
    const cols = 2;
    const cardW = (screenWidth - 50) / cols;
    const cardH = 80;
    const gap = 10;
    const startY = 60;
    
    STAGES.forEach((stage, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = 20 + col * (cardW + gap);
        const cy = startY + row * (cardH + gap);
        
        const isUnlocked = i === 0 || stageProgress[i - 1];
        
        if (isUnlocked && x >= cx && x <= cx + cardW && y >= cy && y <= cy + cardH) {
            currentStage = stage.id;
            isAdDemoMode = (stage.id === 1);
            startGame();
        }
    });
}

// ==================== 游戏循环 ====================
function gameLoop() {
    const now = Date.now();
    const dt = Math.min(now - lastTime, 50);
    
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    
    if (gameState === 'mainMenu') {
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
        handleMainMenuTouch(x, y);
    } else if (gameState === 'start') {
        const btnW = 140, btnH = 45;
        const btnX = screenWidth / 2 - btnW / 2;
        const btnY = screenHeight * 0.68;

        // 开始游戏按钮 -> 进入主界面（关卡选择）
        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            gameState = 'mainMenu';
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
            }

            // 关卡按钮
            if (x >= startX + btnSize + gap && x <= startX + btnSize + gap + btnSize && y >= btnY && y <= btnY + btnSize) {
                gameState = 'mainMenu';
                gamePaused = false;
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
            } else if (x >= startX + btnW + gap && x <= startX + totalW) {
                gameState = 'mainMenu';
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
                } else if (x >= startX + btnW + gap && x <= startX + btnW * 2 + gap) {
                    startGame();
                } else if (x >= startX + (btnW + gap) * 2 && x <= startX + totalW) {
                    gameState = 'mainMenu';
                }
            }
        } else {
            const totalW = btnW * 2 + gap;
            const startX = screenWidth / 2 - totalW / 2;
            
            if (y >= btnY && y <= btnY + btnH) {
                if (x >= startX && x <= startX + btnW) {
                    startGame();
                } else if (x >= startX + btnW + gap && x <= startX + totalW) {
                    gameState = 'mainMenu';
                }
            }
        }
    }
});

// ==================== 初始化 ====================
gameLoop();
