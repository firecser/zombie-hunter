// 微信小游戏主入口
// 僵尸猎人 - WeChat Mini Game

// 获取画布和上下文
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');

// 屏幕尺寸
const screenWidth = canvas.width;
const screenHeight = canvas.height;

// ==================== 游戏状态 ====================
let gameState = 'start'; // start, playing, paused, gameOver, victory
let gameRunning = false;
let gamePaused = false;
let gameTime = 0;
let lastTime = Date.now();

// ==================== 关卡系统 ====================
const STAGES = [
    { id: 1, name: '霜冻平原', speedMult: 1.0, healthMult: 1.0, damageMult: 1.0, spawnMult: 1.0, bossTime: 120 },
    { id: 2, name: '暴风雪谷', speedMult: 1.3, healthMult: 1.0, damageMult: 1.1, spawnMult: 1.1, bossTime: 100 },
    { id: 3, name: '冰川裂隙', speedMult: 1.1, healthMult: 1.5, damageMult: 1.2, spawnMult: 1.2, bossTime: 90 },
    { id: 4, name: '冰霜要塞', speedMult: 1.2, healthMult: 1.3, damageMult: 1.3, spawnMult: 1.3, bossTime: 60 },
    { id: 5, name: '永冻之巅', speedMult: 1.4, healthMult: 1.8, damageMult: 1.5, spawnMult: 1.5, bossTime: 50 },
    { id: 6, name: '极寒地狱', speedMult: 1.6, healthMult: 2.2, damageMult: 1.8, spawnMult: 1.8, bossTime: 40 }
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

function saveProgress() {
    stageProgress[currentStage - 1] = true;
    wx.setStorageSync('zombieHunterProgress', JSON.stringify(stageProgress));
}

function getCurrentStage() {
    return STAGES[currentStage - 1];
}

// ==================== 玩家 ====================
const player = {
    x: screenWidth / 2,
    y: screenHeight - 120,
    radius: 25,
    health: 100,
    maxHealth: 100,
    level: 1,
    exp: 0,
    expToNext: 50,
    gold: 0,
    kills: 0,
    damage: 25,
    fireRate: 500,
    bulletSpeed: 12,
    bulletCount: 1,
    lastShot: 0,
    hurtFlash: 0
};

// ==================== 技能系统 ====================
const skills = {
    damage: { level: 0, max: 10 },
    fireRate: { level: 0, max: 10 },
    bulletSpeed: { level: 0, max: 5 },
    bulletCount: { level: 0, max: 3 },
    health: { level: 0, max: 10 },
    pickup: { level: 0, max: 5 }
};

// ==================== 子弹和僵尸 ====================
let bullets = [];
let zombies = [];
let particles = [];
let damageTexts = [];

// 僵尸类型
const zombieTypes = {
    normal: { radius: 18, speed: 1.5, health: 50, damage: 10, color: '#66aa66', exp: 15 },
    fast: { radius: 14, speed: 3, health: 30, damage: 8, color: '#66cccc', exp: 20 },
    tank: { radius: 28, speed: 0.8, health: 200, damage: 25, color: '#aa66aa', exp: 40 },
    boss: { radius: 45, speed: 0.5, health: 800, damage: 50, color: '#cc4444', exp: 150 }
};

// ==================== 炸弹系统 ====================
let bombCount = 0;
let bombCooldown = 0;
const BOMB_MAX = 3;
const BOMB_COOLDOWN = 30000;

// ==================== 生成参数 ====================
let spawnTimer = 0;
let spawnInterval = 1500;
const GAME_TIME = 5 * 60 * 1000;

// ==================== 音频系统 ====================
const AudioSystem = {
    ctx: null,
    isMuted: false,
    
    init() {
        // 微信小游戏音频初始化
    },
    
    playShoot() {
        // 播放射击音效
    },
    
    playHit() {
        // 播放命中音效
    },
    
    playExplosion() {
        // 播放爆炸音效
    }
};

// ==================== 绘制函数 ====================

// 绘制背景
function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, screenHeight);
    gradient.addColorStop(0, '#0d1b2a');
    gradient.addColorStop(0.5, '#1a3a4a');
    gradient.addColorStop(1, '#1b263b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 绘制雪花
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    const time = Date.now() / 1000;
    for (let i = 0; i < 50; i++) {
        const x = (i * 73 + time * 20) % screenWidth;
        const y = (i * 47 + time * 30) % screenHeight;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 绘制玩家（越野车）
function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const size = player.radius;
    
    // 车身
    ctx.fillStyle = player.hurtFlash > 0 ? '#ff4444' : '#4a7c4e';
    ctx.fillRect(x - size, y - size * 0.7, size * 2, size * 1.4);
    
    // 轮子
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - size - 3, y - size * 0.5, 6, size);
    ctx.fillRect(x + size - 3, y - size * 0.5, 6, size);
    
    // 枪
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x - 4, y - size * 1.5, 8, size);
    
    if (player.hurtFlash > 0) player.hurtFlash--;
}

// 绘制僵尸
function drawZombies() {
    zombies.forEach(z => {
        // 身体
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 血条
        if (z.health < z.maxHealth) {
            const barWidth = z.radius * 2;
            const barHeight = 4;
            const barX = z.x - barWidth / 2;
            const barY = z.y - z.radius - 10;
            
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(barX, barY, barWidth * (z.health / z.maxHealth), barHeight);
        }
        
        // Boss标记
        if (z.type === 'boss') {
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('💀', z.x, z.y - z.radius - 20);
        }
    });
}

// 绘制子弹
function drawBullets() {
    ctx.fillStyle = '#ffdd44';
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

// 绘制粒子
function drawParticles() {
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

// 绘制伤害数字
function drawDamageTexts() {
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    damageTexts.forEach(dt => {
        ctx.fillStyle = `rgba(255, 255, 0, ${dt.life / dt.maxLife})`;
        ctx.fillText(dt.text, dt.x, dt.y);
    });
}

// 绘制UI
function drawUI() {
    const stage = getCurrentStage();
    
    // 顶部信息栏
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, screenWidth - 20, 80);
    
    // 关卡信息
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`第${currentStage}关 ${stage.name}`, 20, 30);
    
    // 等级和经验
    ctx.fillStyle = '#fff';
    ctx.fillText(`Lv.${player.level}`, 20, 50);
    
    // 经验条
    ctx.fillStyle = '#333';
    ctx.fillRect(70, 42, 100, 10);
    ctx.fillStyle = '#44cc44';
    ctx.fillRect(70, 42, 100 * (player.exp / player.expToNext), 10);
    
    // 击杀和时间
    ctx.fillText(`💀 ${player.kills}`, 20, 70);
    ctx.fillText(`💰 ${player.gold}`, 80, 70);
    
    const timeLeft = Math.max(0, GAME_TIME - gameTime);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    ctx.fillText(`⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`, 150, 70);
    
    // 血条（底部）
    const healthBarWidth = screenWidth - 40;
    const healthBarY = screenHeight - 30;
    
    ctx.fillStyle = '#333';
    ctx.fillRect(20, healthBarY, healthBarWidth, 15);
    
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(20, healthBarY, healthBarWidth * (player.health / player.maxHealth), 15);
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`❤️ ${Math.floor(player.health)}/${player.maxHealth}`, screenWidth / 2, healthBarY + 12);
    
    // 炸弹显示
    if (bombCount > 0) {
        ctx.fillStyle = '#ff8800';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`💣 x${bombCount}`, screenWidth - 20, 50);
    }
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
    const btnW = 150, btnH = 50;
    const btnX = screenWidth / 2 - btnW / 2;
    const btnY = screenHeight * 0.65;
    roundRect(ctx, btnX, btnY, btnW, btnH, 10);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('开始游戏', screenWidth / 2, btnY + 32);
}

// 关卡选择界面
function drawStageSelect() {
    drawBackground();
    
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎮 选择关卡', screenWidth / 2, 50);
    
    // 关卡卡片
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
        
        // 锁定标记
        if (!isUnlocked) {
            ctx.fillStyle = '#666';
            ctx.font = '20px Arial';
            ctx.fillText('🔒', x + cardW / 2, y + cardH / 2);
        }
    });
}

// ==================== 游戏结束界面 ====================
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
    drawButton(screenWidth / 2 - 70, screenHeight / 2 + 80, 140, 45, '🔄 重玩', '#ff4444');
    drawButton(screenWidth / 2 - 70, screenHeight / 2 + 135, 140, 45, '📋 关卡选择', '#4a4e69');
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
    const btnY = screenHeight / 2 + 90;
    const btnW = 90;
    const gap = 10;
    const startX = screenWidth / 2 - (btnW * 1.5 + gap);
    
    if (currentStage < STAGES.length) {
        drawButton(startX, btnY, btnW, 40, '➡️ 下一关', '#44aa44');
        drawButton(startX + btnW + gap, btnY, btnW, 40, '🔄 重玩', '#ffd700');
        drawButton(startX + (btnW + gap) * 2, btnY, btnW, 40, '📋 关卡', '#4a4e69');
    } else {
        drawButton(startX, btnY, btnW, 40, '🏆 全通', '#ffd700');
        drawButton(startX + btnW + gap, btnY, btnW, 40, '🔄 重玩', '#ffd700');
        drawButton(startX + (btnW + gap) * 2, btnY, btnW, 40, '📋 关卡', '#4a4e69');
    }
}

// 绘制按钮
function drawButton(x, y, w, h, text, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + h / 2 + 5);
}

// 圆角矩形
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

// ==================== 游戏逻辑 ====================

// 射击
function shoot() {
    if (zombies.length === 0) return;
    
    const now = Date.now();
    if (now - player.lastShot < player.fireRate) return;
    player.lastShot = now;
    
    // 找最近的僵尸
    let nearest = null;
    let minDist = Infinity;
    zombies.forEach(z => {
        const dist = Math.hypot(z.x - player.x, z.y - player.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = z;
        }
    });
    
    if (!nearest) return;
    
    // 发射子弹
    const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
    for (let i = 0; i < player.bulletCount; i++) {
        const spread = (i - (player.bulletCount - 1) / 2) * 0.1;
        bullets.push({
            x: player.x,
            y: player.y - player.radius,
            vx: Math.cos(angle + spread) * player.bulletSpeed,
            vy: Math.sin(angle + spread) * player.bulletSpeed,
            damage: player.damage
        });
    }
    
    AudioSystem.playShoot();
}

// 更新子弹
function updateBullets(dt) {
    bullets = bullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        
        // 检测碰撞
        for (let i = zombies.length - 1; i >= 0; i--) {
            const z = zombies[i];
            if (Math.hypot(b.x - z.x, b.y - z.y) < z.radius + 4) {
                z.health -= b.damage;
                createDamageText(z.x, z.y, b.damage);
                
                if (z.health <= 0) {
                    player.kills++;
                    player.gold += Math.floor(z.exp * 0.5);
                    addExp(z.exp);
                    createExplosion(z.x, z.y, z.color);
                    zombies.splice(i, 1);
                    AudioSystem.playExplosion();
                }
                return false;
            }
        }
        
        // 超出边界
        return b.x > 0 && b.x < screenWidth && b.y > 0 && b.y < screenHeight;
    });
}

// 更新僵尸
function updateZombies(dt) {
    const stage = getCurrentStage();
    
    zombies.forEach(z => {
        // 移向玩家
        const dx = player.x - z.x;
        const dy = player.y - z.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 0) {
            z.x += (dx / dist) * z.speed;
            z.y += (dy / dist) * z.speed;
        }
        
        // 碰撞检测
        if (Math.hypot(player.x - z.x, player.y - z.y) < player.radius + z.radius) {
            player.health -= z.damage * 0.1;
            player.hurtFlash = 10;
            
            // 击退
            z.x -= (dx / dist) * 20;
            z.y -= (dy / dist) * 20;
        }
    });
    
    // 检查死亡
    if (player.health <= 0) {
        gameState = 'gameOver';
        gameRunning = false;
    }
}

// 生成僵尸
function spawnZombies(dt) {
    const stage = getCurrentStage();
    spawnTimer += dt;
    
    const remainingTime = GAME_TIME - gameTime;
    let spawnMult = stage.spawnMult;
    if (remainingTime <= 30000 && remainingTime > 0) {
        const pressure = 1 - remainingTime / 30000;
        spawnMult *= (1 + pressure * 1.5);
    }
    
    if (spawnTimer >= spawnInterval / spawnMult) {
        spawnTimer = 0;
        spawnInterval = Math.max(400, spawnInterval - 8);
        
        const x = Math.random() * screenWidth;
        const y = -50;
        
        const gameTimeSec = gameTime / 1000;
        let type = 'normal';
        const roll = Math.random();
        
        if (gameTimeSec > stage.bossTime && roll < 0.08) {
            type = 'boss';
        } else if (gameTimeSec > 60 && roll < 0.25) {
            type = 'tank';
        } else if (roll < 0.3) {
            type = 'fast';
        }
        
        const template = zombieTypes[type];
        const healthMult = (1 + gameTimeSec / 50) * stage.healthMult;
        
        zombies.push({
            x, y,
            radius: template.radius,
            speed: template.speed * stage.speedMult,
            health: template.health * healthMult,
            maxHealth: template.health * healthMult,
            damage: template.damage * stage.damageMult,
            color: template.color,
            exp: template.exp * stage.difficulty,
            type
        });
    }
}

// 添加经验
function addExp(amount) {
    player.exp += amount;
    while (player.exp >= player.expToNext && player.level < 20) {
        player.exp -= player.expToNext;
        player.level++;
        player.expToNext = Math.floor(player.expToNext * 1.3);
        player.damage += 5;
        
        // 显示升级效果
        createExplosion(player.x, player.y, '#ffd700');
    }
}

// 创建爆炸效果
function createExplosion(x, y, color) {
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 3;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 3 + Math.random() * 3,
            color,
            life: 30,
            maxLife: 30
        });
    }
}

// 创建伤害数字
function createDamageText(x, y, damage) {
    damageTexts.push({
        x, y,
        text: Math.floor(damage).toString(),
        life: 30,
        maxLife: 30,
        vy: -2
    });
}

// 更新粒子
function updateParticles() {
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
    });
    
    damageTexts = damageTexts.filter(dt => {
        dt.y += dt.vy;
        dt.life--;
        return dt.life > 0;
    });
}

// 使用炸弹
function useBomb() {
    if (bombCount <= 0) return;
    
    bombCount--;
    const damage = 300 + player.level * 50;
    
    zombies.forEach(z => {
        z.health -= damage;
        createDamageText(z.x, z.y, damage);
        if (z.health <= 0) {
            player.kills++;
            player.gold += Math.floor(z.exp * 0.5);
            addExp(z.exp);
            createExplosion(z.x, z.y, '#ff8800');
        }
    });
    
    zombies = zombies.filter(z => z.health > 0);
    AudioSystem.playExplosion();
}

// ==================== 游戏循环 ====================

function gameLoop() {
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;
    
    // 清空画布
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    
    if (gameState === 'start') {
        drawStartScreen();
    } else if (gameState === 'stageSelect') {
        drawStageSelect();
    } else if (gameState === 'playing') {
        if (!gamePaused) {
            gameTime += dt;
            
            // 检查通关
            if (gameTime >= GAME_TIME) {
                gameState = 'victory';
                saveProgress();
            }
            
            shoot();
            updateBullets(dt);
            updateZombies(dt);
            spawnZombies(dt);
            updateParticles();
            
            // 炸弹冷却
            if (bombCount < BOMB_MAX && gameTime >= bombCount * BOMB_COOLDOWN) {
                bombCount++;
            }
        }
        
        drawBackground();
        drawParticles();
        drawBullets();
        drawZombies();
        drawPlayer();
        drawDamageTexts();
        drawUI();
    } else if (gameState === 'gameOver') {
        drawBackground();
        drawParticles();
        drawBullets();
        drawZombies();
        drawPlayer();
        drawUI();
        drawGameOver();
    } else if (gameState === 'victory') {
        drawBackground();
        drawParticles();
        drawPlayer();
        drawUI();
        drawVictory();
    }
    
    requestAnimationFrame(gameLoop);
}

// ==================== 触摸事件 ====================

wx.onTouchStart((e) => {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    
    if (gameState === 'start') {
        // 检查开始按钮
        const btnW = 150, btnH = 50;
        const btnX = screenWidth / 2 - btnW / 2;
        const btnY = screenHeight * 0.65;
        
        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            gameState = 'stageSelect';
        }
    } else if (gameState === 'stageSelect') {
        // 检查关卡卡片点击
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
        // 游戏中 - 使用炸弹
        if (y > screenHeight - 100 && bombCount > 0) {
            useBomb();
        }
    } else if (gameState === 'gameOver') {
        // 游戏结束按钮
        const btnY = screenHeight / 2 + 80;
        const btnW = 140, btnH = 45;
        const startX = screenWidth / 2 - 70;
        
        if (y >= btnY && y <= btnY + btnH) {
            if (x >= startX && x <= startX + btnW) {
                startGame();
            } else if (x >= startX + btnW + 10 && x <= startX + btnW * 2 + 10) {
                gameState = 'stageSelect';
            }
        }
    } else if (gameState === 'victory') {
        // 通关按钮
        const btnY = screenHeight / 2 + 90;
        const btnW = 90, btnH = 40;
        const gap = 10;
        const startX = screenWidth / 2 - (btnW * 1.5 + gap);
        
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

// ==================== 开始游戏 ====================

function startGame() {
    gameState = 'playing';
    gameRunning = true;
    gamePaused = false;
    gameTime = 0;
    lastTime = Date.now();
    
    // 重置玩家
    player.x = screenWidth / 2;
    player.y = screenHeight - 120;
    player.health = 100;
    player.maxHealth = 100;
    player.level = 1;
    player.exp = 0;
    player.expToNext = 50;
    player.gold = 0;
    player.kills = 0;
    player.damage = 25;
    player.fireRate = 500;
    player.bulletSpeed = 12;
    player.bulletCount = 1;
    
    // 重置游戏状态
    bullets = [];
    zombies = [];
    particles = [];
    damageTexts = [];
    spawnTimer = 0;
    spawnInterval = 1500;
    bombCount = 0;
}

// ==================== 初始化 ====================

function init() {
    console.log('僵尸猎人小游戏启动');
    gameLoop();
}

init();
