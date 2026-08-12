
const screenWidth = 375;
const screenHeight = 667;
var activeMiniGame = null;
var otherGamesModal = { show: false };
let __t = 1000;
Date.now = () => { __t += 16; return __t; };
const ctx = new Proxy({}, {
  get: (t, p) => { if (p in t) return t[p]; return () => {}; },
  set: (t, p, v) => { t[p] = v; return true; }
});
const wx = {
  getStorageSync: () => 0,
  setStorageSync: () => {},
  onTouchMove: () => {}, onTouchStart: () => {}, onTouchEnd: () => {}
};
function roundRect() {}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function drawScoreBox() {}
function drawMiniGameButton() {}
function flushMiniGameSeconds() {}
function drawBackground() {}
function drawRoyalePanel() {}

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


let __err = null;
try {
  sqInit();
  for (let i = 0; i < 400; i++) drawMiniGameSq();
  handleMiniGameSqInput(120, gSq.playerY);          // 拖动到左侧（对准宝箱）
  for (let i = 0; i < 200; i++) drawMiniGameSq();
  if (gSq.chests[4]) sqBreakChest(gSq.chests[4]);  // 金龙 → 阵营选择
  sqApplyFaction('xian');
  sqPickAffix({ x:gSq.playerX, y:gSq.playerY, r:14, q:'blue', aff:SQ_AFFIX_POOL.blue[0] });
  sqDamageEnemy({ id:999, type:'mob', x:200, y:200, r:16, hp:100, hpMax:100, dead:false }, 50, true);
  sqSpawnWave([{type:'mob',count:3,hp:40},{type:'fast',count:2,hp:144},{type:'armor',count:1,hp:200}]);
  for (let i = 0; i < 300; i++) drawMiniGameSq();
  gSq.lineHP = 0; gSq.lineShield = 0; sqSaveBest();
  drawMiniGameSq();
  console.log('SQ_SMOKE_OK kills=' + gSq.kills + ' enemies=' + gSq.enemies.length +
    ' chestsBroken=' + gSq.chestsBroken + ' faction=' + gSq.faction + ' score=' + gSq.score);
} catch (e) {
  console.log('SQ_SMOKE_FAIL', (e && e.stack) ? e.stack : e);
}
