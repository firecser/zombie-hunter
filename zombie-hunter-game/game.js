// 僵尸猎人 - 微信小游戏完整版
// 基于 H5闯关版完整移植

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
let gameState = 'start'; // start, stageSelect, playing, paused, gameOver, victory, upgrade
let gameRunning = false;
let gamePaused = false;
let gameTime = 0;
let lastTime = Date.now();
const GAME_TIME_LIMIT = 5 * 60 * 1000;
const MAX_LEVEL = 20;

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

// ==================== 生成参数 ====================
let spawnTimer = 0;
let spawnInterval = 1500;

// ==================== 音频系统 ====================
const audioCtx = wx.createInnerAudioContext();

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
    
    // 机枪（旋转）
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.gunAngle);
    
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
    // 顶部信息栏背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    roundRect(ctx, 10, 10, screenWidth - 20, 60, 8);
    ctx.fill();
    
    const stage = getCurrentStage();
    
    // 关卡信息
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`第${currentStage}关 ${stage.name}`, 20, 30);
    
    // 等级
    ctx.fillStyle = '#fff';
    ctx.fillText(`Lv.${player.level}`, 20, 50);
    
    // 经验条
    ctx.fillStyle = '#333';
    ctx.fillRect(70, 42, 80, 8);
    ctx.fillStyle = '#44cc44';
    if (player.level < MAX_LEVEL) {
        ctx.fillRect(70, 42, 80 * (player.exp / player.expToLevel), 8);
    } else {
        ctx.fillRect(70, 42, 80, 8);
    }
    
    // 击杀和金币
    ctx.fillText(`💀 ${player.kills}`, 160, 30);
    ctx.fillText(`💰 ${player.gold}`, 160, 50);
    
    // 时间
    const remainingTime = Math.max(0, GAME_TIME_LIMIT - gameTime);
    const minutes = Math.floor(remainingTime / 60000);
    const seconds = Math.floor((remainingTime % 60000) / 1000);
    ctx.fillStyle = remainingTime <= 30000 ? '#ff4444' : '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(`${minutes}:${seconds.toString().padStart(2, '0')}`, screenWidth - 20, 40);
    
    // 血条
    const healthBarWidth = screenWidth - 60;
    ctx.fillStyle = '#333';
    roundRect(ctx, 30, screenHeight - 40, healthBarWidth, 20, 4);
    ctx.fill();
    
    ctx.fillStyle = '#ff4444';
    roundRect(ctx, 30, screenHeight - 40, healthBarWidth * (player.health / player.maxHealth), 20, 4);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`❤️ ${Math.floor(player.health)}/${player.maxHealth}`, screenWidth / 2, screenHeight - 26);
    
    // 炸弹显示
    if (bombCount > 0) {
        ctx.fillStyle = '#ff8800';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`💣 x${bombCount}`, screenWidth - 20, screenHeight - 60);
    }
    
    // 技能显示
    drawSkillUI();
}

// 绘制技能UI
function drawSkillUI() {
    let skillX = 20;
    let skillY = screenHeight - 100;
    
    for (const [key, skill] of Object.entries(skills)) {
        if (skill.level > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            roundRect(ctx, skillX, skillY, 40, 30, 4);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(skill.icon, skillX + 20, skillY + 15);
            ctx.fillText(`Lv${skill.level}`, skillX + 20, skillY + 26);
            
            skillX += 45;
        }
    }
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
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🧟 僵尸猎人 🎯', screenWidth / 2, screenHeight / 3);
    
    // 说明
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    const instructions = [
        '🎮 角色固定在屏幕下方',
        '🔫 自动射击最近的敌人',
        '⬆️ 升级可选择技能强化',
        '⏱️ 坚持5分钟即可通关！'
    ];
    instructions.forEach((text, i) => {
        ctx.fillText(text, screenWidth / 2, screenHeight / 2 - 40 + i * 25);
    });
    
    // 开始按钮
    ctx.fillStyle = '#44aa44';
    roundRect(ctx, screenWidth / 2 - 75, screenHeight * 0.65, 150, 50, 10);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('开始游戏', screenWidth / 2, screenHeight * 0.65 + 32);
}

// 关卡选择界面
function drawStageSelect() {
    drawBackground();
    
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎮 选择关卡', screenWidth / 2, 50);
    
    const cols = 2;
    const cardW = (screenWidth - 40) / cols - 10;
    const cardH = 100;
    
    STAGES.forEach((stage, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 20 + col * (cardW + 10);
        const y = 80 + row * (cardH + 10);
        
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
        ctx.font = '30px Arial';
        ctx.fillStyle = isUnlocked ? '#fff' : '#666';
        ctx.fillText(stage.icon, x + cardW / 2, y + 35);
        
        // 名称
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`第${stage.id}关`, x + cardW / 2, y + 60);
        
        // 描述
        ctx.font = '10px Arial';
        ctx.fillStyle = isUnlocked ? '#aaa' : '#555';
        ctx.fillText(stage.name, x + cardW / 2, y + 80);
        
        // 锁定
        if (!isUnlocked) {
            ctx.fillStyle = '#666';
            ctx.font = '20px Arial';
            ctx.fillText('🔒', x + cardW / 2, y + cardH / 2);
        }
    });
}

// 游戏结束界面
function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('💀 游戏结束', screenWidth / 2, screenHeight / 2 - 60);
    
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.fillText(`最终等级: ${player.level}`, screenWidth / 2, screenHeight / 2 - 20);
    ctx.fillText(`击杀僵尸: ${player.kills}`, screenWidth / 2, screenHeight / 2 + 10);
    
    const minutes = Math.floor(gameTime / 60000);
    const seconds = Math.floor((gameTime % 60000) / 1000);
    ctx.fillText(`存活时间: ${minutes}:${seconds.toString().padStart(2, '0')}`, screenWidth / 2, screenHeight / 2 + 40);
    
    // 按钮
    const btnW = 90;
    const btnH = 40;
    const gap = 10;
    const startX = screenWidth / 2 - btnW - gap / 2;
    const btnY = screenHeight / 2 + 80;
    
    ctx.fillStyle = '#ff4444';
    roundRect(ctx, startX, btnY, btnW, btnH, 6);
    ctx.fill();
    
    ctx.fillStyle = '#4a4e69';
    roundRect(ctx, startX + btnW + gap, btnY, btnW, btnH, 6);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('🔄 重玩', startX + btnW / 2, btnY + 26);
    ctx.fillText('📋 关卡', startX + btnW + gap + btnW / 2, btnY + 26);
}

// 通关界面
function drawVictory() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎉 通关成功！', screenWidth / 2, screenHeight / 2 - 80);
    
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.fillText(`🏆 第${currentStage}关 完成！`, screenWidth / 2, screenHeight / 2 - 40);
    ctx.fillText(`最终等级: ${player.level}`, screenWidth / 2, screenHeight / 2 - 10);
    ctx.fillText(`击杀僵尸: ${player.kills}`, screenWidth / 2, screenHeight / 2 + 20);
    ctx.fillText(`获得金币: ${player.gold}`, screenWidth / 2, screenHeight / 2 + 50);
    
    // 按钮
    const btnW = 80;
    const btnH = 36;
    const gap = 8;
    const totalW = btnW * 3 + gap * 2;
    const startX = screenWidth / 2 - totalW / 2;
    const btnY = screenHeight / 2 + 90;
    
    // 下一关
    ctx.fillStyle = '#44aa44';
    roundRect(ctx, startX, btnY, btnW, btnH, 6);
    ctx.fill();
    
    // 重玩
    ctx.fillStyle = '#ffd700';
    roundRect(ctx, startX + btnW + gap, btnY, btnW, btnH, 6);
    ctx.fill();
    
    // 关卡
    ctx.fillStyle = '#4a4e69';
    roundRect(ctx, startX + (btnW + gap) * 2, btnY, btnW, btnH, 6);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.fillText(currentStage < STAGES.length ? '➡️ 下一关' : '🏆 全通', startX + btnW / 2, btnY + 24);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillText('🔄 重玩', startX + btnW + gap + btnW / 2, btnY + 24);
    ctx.fillStyle = '#fff';
    ctx.fillText('📋 关卡', startX + (btnW + gap) * 2 + btnW / 2, btnY + 24);
}

// 升级面板
function drawUpgradePanel() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⬆️ 选择升级', screenWidth / 2, 80);
    
    // 升级选项卡片
    const cardW = screenWidth - 40;
    const cardH = 60;
    const startY = 120;
    
    upgradeOptions.forEach((opt, i) => {
        const y = startY + i * (cardH + 10);
        const isSelected = selectedUpgrade === i;
        
        ctx.fillStyle = isSelected ? '#4a4e69' : '#2d2d44';
        roundRect(ctx, 20, y, cardW, cardH, 8);
        ctx.fill();
        
        ctx.strokeStyle = isSelected ? '#ffd700' : '#4a4e69';
        ctx.lineWidth = 2;
        roundRect(ctx, 20, y, cardW, cardH, 8);
        ctx.stroke();
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${opt.icon} ${opt.name}`, 40, y + 28);
        
        ctx.fillStyle = '#aaa';
        ctx.font = '12px Arial';
        ctx.fillText(opt.desc, 40, y + 48);
    });
}

// 暂停面板
function drawPausePanel() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⏸️ 游戏暂停', screenWidth / 2, screenHeight / 2 - 40);
    
    const btnW = 100;
    const btnH = 40;
    const gap = 15;
    const startX = screenWidth / 2 - btnW - gap / 2;
    const btnY = screenHeight / 2 + 20;
    
    ctx.fillStyle = '#44aa44';
    roundRect(ctx, startX, btnY, btnW, btnH, 6);
    ctx.fill();
    
    ctx.fillStyle = '#4a4e69';
    roundRect(ctx, startX + btnW + gap, btnY, btnW, btnH, 6);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('▶️ 继续', startX + btnW / 2, btnY + 26);
    ctx.fillText('📋 关卡', startX + btnW + gap + btnW / 2, btnY + 26);
}

// ==================== 游戏逻辑 ====================

// 射击
function shoot() {
    if (zombies.length === 0) return;
    
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
        
        // 掉落经验球
        for (let i = 0; i < 3; i++) {
            expOrbs.push({
                x: zombie.x + (Math.random() - 0.5) * 25,
                y: zombie.y + (Math.random() - 0.5) * 25,
                radius: 8,
                exp: zombie.exp / 3
            });
        }
        
        // 掉落金币
        if (Math.random() < 0.3) {
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
                exp: template.exp * stage.difficulty,
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
    
    // 每5级获得炸弹
    if (player.level % 5 === 0 && bombCount < BOMB_MAX_COUNT) {
        bombCount++;
    }
    
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
}

// 使用炸弹
function useBomb() {
    if (bombCount <= 0 || bombCooldown > 0 || !gameRunning) return;
    
    bombCount--;
    bombCooldown = BOMB_COOLDOWN_TIME;
    
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
}

// 胜利
function victory() {
    gameState = 'victory';
    gameRunning = false;
    saveProgress();
}

// 开始游戏
function startGame() {
    gameState = 'playing';
    gameRunning = true;
    gameTime = 0;
    lastTime = Date.now();
    
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
    
    // 重置生成参数
    spawnTimer = 0;
    spawnInterval = 1500;
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

// ==================== 游戏循环 ====================
function gameLoop() {
    const now = Date.now();
    const dt = Math.min(now - lastTime, 50);
    
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    
    if (gameState === 'start') {
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
        
        if (gamePaused) {
            drawPausePanel();
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
    
    if (gameState === 'start') {
        const btnW = 150, btnH = 50;
        const btnX = screenWidth / 2 - btnW / 2;
        const btnY = screenHeight * 0.65;
        
        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            gameState = 'stageSelect';
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
                startGame();
            }
        });
    } else if (gameState === 'playing') {
        // 检查暂停面板按钮
        if (gamePaused) {
            const btnW = 100, btnH = 40;
            const gap = 15;
            const startX = screenWidth / 2 - btnW - gap / 2;
            const btnY = screenHeight / 2 + 20;
            
            if (y >= btnY && y <= btnY + btnH) {
                if (x >= startX && x <= startX + btnW) {
                    gamePaused = false;
                    lastTime = Date.now();
                } else if (x >= startX + btnW + gap && x <= startX + btnW * 2 + gap) {
                    gamePaused = false;
                    gameRunning = false;
                    gameState = 'stageSelect';
                }
            }
        } else {
            // 使用炸弹
            if (y > screenHeight - 80 && bombCount > 0 && bombCooldown <= 0) {
                useBomb();
            }
        }
    } else if (gameState === 'upgrade') {
        const cardW = screenWidth - 40;
        const cardH = 60;
        const startY = 120;
        
        for (let i = 0; i < upgradeOptions.length; i++) {
            const cy = startY + i * (cardH + 10);
            if (x >= 20 && x <= 20 + cardW && y >= cy && y <= cy + cardH) {
                applyUpgrade(upgradeOptions[i]);
                break;
            }
        }
    } else if (gameState === 'gameOver') {
        const btnW = 90, btnH = 40;
        const gap = 10;
        const startX = screenWidth / 2 - btnW - gap / 2;
        const btnY = screenHeight / 2 + 80;
        
        if (y >= btnY && y <= btnY + btnH) {
            if (x >= startX && x <= startX + btnW) {
                startGame();
            } else if (x >= startX + btnW + gap && x <= startX + btnW * 2 + gap) {
                gameState = 'stageSelect';
            }
        }
    } else if (gameState === 'victory') {
        const btnW = 80, btnH = 36;
        const gap = 8;
        const totalW = btnW * 3 + gap * 2;
        const startX = screenWidth / 2 - totalW / 2;
        const btnY = screenHeight / 2 + 90;
        
        if (y >= btnY && y <= btnY + btnH) {
            if (x >= startX && x <= startX + btnW) {
                // 下一关
                if (currentStage < STAGES.length) {
                    currentStage++;
                }
                startGame();
            } else if (x >= startX + btnW + gap && x <= startX + btnW * 2 + gap) {
                startGame();
            } else if (x >= startX + (btnW + gap) * 2 && x <= startX + btnW * 3 + gap * 2) {
                gameState = 'stageSelect';
            }
        }
    }
});

// ==================== 初始化 ====================
gameLoop();
