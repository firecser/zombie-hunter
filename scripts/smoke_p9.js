// v2.5 词条/进化/弹道成长回归测试
// 覆盖：弹道数成长与封顶 / 扇形发射 / 词条卡生成与加点 / 进化卡生成与绑定 / 进化弹属性 / 词条命中特效
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const filePath = path.join(__dirname, '..', 'game.js');
const src = fs.readFileSync(filePath, 'utf8');

const gradientStub = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'measureText') return () => ({ width: 0 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradientStub;
        if (p === 'canvas') return { width: 390, height: 844 };
        return (...a) => ctxProxy;
    },
    set() { return true; }
});
const audioCtxStub = {
    currentTime: 0, state: 'running', destination: {}, resume() {}, suspend() {},
    createOscillator: () => ({ connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {} } }),
    createGain: () => ({ connect() {}, gain: { setValueAtTime() {}, value: 0 } })
};
const wxProxy = new Proxy({}, {
    get(t, p) {
        if (p === 'getWindowInfo' || p === 'getSystemInfoSync') return () => ({
            screenWidth: 390, screenHeight: 844, statusBarHeight: 20,
            safeArea: { left: 0, right: 390, top: 20, bottom: 810, width: 390, height: 790 }
        });
        if (p === 'createWebAudioContext') return () => audioCtxStub;
        if (p === 'createInnerAudioContext') return () => ({ play() {}, onEnded() {}, destroy() {}, src: '' });
        if (p === 'createCanvas') return () => ({ getContext: () => ctxProxy, width: 390, height: 844 });
        if (p === 'createGameClubButton') return () => ({ show() {}, hide() {}, destroy() {} });
        if (p === 'createRewardedVideoAd') return () => ({ show() {}, onClose() {}, load() {}, offClose() {} });
        if (p === 'getStorageSync') return () => '';
        if (p === 'setStorageSync') return () => {};
        if (p === 'createImage') return () => ({ onload: null, onerror: null, src: '', width: 0, height: 0 });
        if (p === 'getImageInfo') return () => ({ img: { onload: null, onerror: null, src: '' }, width: 0, height: 0 });
        if (p === 'vibrateShort') return () => {};
        return () => {};
    }
});

const sandbox = {
    wx: wxProxy, ctx: ctxProxy,
    canvas: { getContext: () => ctxProxy, width: 390, height: 844 },
    screenWidth: 390, screenHeight: 844,
    console, Math, Date, Object, Array, JSON, String, Number, Boolean, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    module: { exports: {} }, require: () => ({}), globalThis: null,
    // M1 走位：源码级断言（拖动移动 + 经验球磁吸半径）
    __hasMove: /v2\.5 M1：战斗内拖动/.test(src) && /playerMoveTargetX = Math\.max\(_minX/.test(src),
    __hasMagnet: /dist > 5 && dist < ORB_MAGNET_R/.test(src) && /const ORB_MAGNET_R = 70;/.test(src),
    __hasMoveCost: /_fireGap = ELEMENT_AUTO_FIRE_RATE \* \(_moving \? 2 : 1\)/.test(src)
        && /moveUntil = Date\.now\(\) \+ 150/.test(src),
    __hasLey: /leyLines|updateLeyLines|drawLeyLines/.test(src),
    __hasStunFire: /now >= playerStunUntil/.test(src),
    __hasBossHud: /function drawBossHud\(\)/.test(src) && /drawBossHud\(\);/.test(src),
    __hasSharpShot: /moveTo\(0, -15\); ctx\.lineTo\(6\.5, 0\)/.test(src)
        && !/ctx\.rotate\(\(now \/ 90\)/.test(src),
    __hasChestSpawn: /chests\.push\(\{ x: 60 \+ Math\.random/.test(src),
    __hasReviveOrder: (() => {
        const start = src.indexOf('wx.onTouchStart');
        const branch = src.indexOf("} else if (gameState === 'playing') {", start);
        const revive = src.indexOf('复活窗口必须最先判定', branch);
        const pause = src.indexOf('if (gamePaused) {', branch);
        return branch > 0 && revive > branch && pause > revive;
    })(),
    __audioUsed: Array.from(new Set((src.match(/AudioSystem\.[a-zA-Z]+/g) || []).map(x => x.split('.')[1]))),
    __hasVisualCleanup: /maxR: 0\.260/.test(src)
        && /Math\.min\(r \* ts\.fs, screenWidth \* ts\.maxR\)/.test(src)
        && /y = SAFE_TOP_OFFSET \+ 88/.test(src)
        && /const btnR = 20;/.test(src)
        && /墙体塌一段/.test(src),
    __hasShakeFix: (() => {
        const iBg = src.indexOf('背景**不参与**震屏');
        const iTx = src.indexOf('ctx.translate((Math.random() - 0.5) * _sm');
        return iBg > 0 && iTx > iBg && /Math\.min\(10, shakeMag\)/.test(src);
    })(),
    __hasScene: /const AD_BRANCH = \{/.test(src)
        && /wx\.reportUserBehaviorBranchAnalytics/.test(src)
        && (src.match(/reportBranch\('/g) || []).length >= 6
        && /branchDim: String\(dim\)/.test(src)
        && /ad\.show\(_showArg\)/.test(src),
    __hasTrack: /wx\.reportAnalytics/.test(src)
        && ['bomb','shield','revive','reroll','chest','double_gold'].every(k => src.indexOf("'" + k + "')") > 0)
        && /track\('level_end'/.test(src),
    __hasReroll: /const REROLL_AD_MAX = 2;/.test(src) && /rerollAdUsed\+\+/.test(src) && /showUpgradePanel\(\);/.test(src),
    __hasDoubleGoldBoth: /function drawDoubleGoldBtn/.test(src) && /function tryDoubleGoldTap/.test(src)
        && (src.match(/tryDoubleGoldTap\(x, y, modalX, modalY, modalW\)/g) || []).length >= 2,
    __hasDoubleGold: /doubleGoldUsed = false;/.test(src) && /player\.gold \+= stageGoldEarned;/.test(src) && /stageGoldEarned \*= 2;/.test(src),
    __hasAdFreeze: /!adOpen && reviveOfferUntil > 0/.test(src) && /reviveOfferUntil \+= Math\.max\(0, Date\.now\(\) - adStartAt\)/.test(src),
    __hasRevive: /function grantRevive/.test(src) && /function drawReviveOffer/.test(src) && /grantRevive\(\)/.test(src),
    __hasShield: /const SHIELD_AD_MAX = 2;/.test(src) && /function grantShieldReinforcement/.test(src) && /function drawShieldSoldier/.test(src) && /grantShieldReinforcement\(_sol\)/.test(src),
    __hasWallLives: /const WALL_LIVES_BASE = 3;/.test(src) && /wallLives = wallLivesMax;/.test(src) && /roundRect\(ctx, sx - 2, y - 2, segW \+ 4/.test(src),
    __hasShotOrient: /ctx\.rotate\(Math\.atan2\(shot\.ty - shot\.y0/.test(src),
    __hasBounceFx: /createLightning\(src\.x, src\.y, best\.x, best\.y\)/.test(src),
    __hasBossScale: /bossScale = isBoss \? \(bossHP \/ BASE_HP\.boss\)/.test(src),
    __hasBossDyn: /currentCounterDPS\(\) \* BOSS_TTK_SECONDS/.test(src) && /const BOSS_TTK_SECONDS   = 10;/.test(src)
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const driver = `
;(function(){
  const results = [];
  function ok(n){ results.push('PASS ' + n); }
  function fail(n, e){ results.push('FAIL ' + n + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }
  try { AudioSystem.playShoot = function(){}; AudioSystem.playExplosion = function(){}; AudioSystem.playZombieDeath = function(){}; } catch(e){}
  function resetAll(){
    elementLevels = { '金':1,'木':1,'水':1,'火':1,'土':1 };
    perks = { multishot:0, pierce:0, explode:0, chill:0, burn:0, bounce:0 };
    evolution = null; bullets.length = 0; zombies.length = 0;
    autoDpsBonus = 0; synergyDmgBonus = 0; synergyUntil = 0; player.level = 1; player.exp = 0; player.expToLevel = 999999;
    talentMods.expMult = 1; talentMods.goldMult = 1;
    shieldWall = null; shieldSoldier = null; shieldAdUsed = 0;
    reviveUsed = false; reviveOfferUntil = 0; invincibleUntil = 0;
    wallLives = 3; leaksThisLevel = 0;
  }
  function zk(x,y,el){ return { x:x, y:y, radius:22, element:el||'金', elements:null, health:1e9, maxHealth:1e9,
                               frozenUntil:0, slowUntil:0, burningUntil:0, vulnUntil:0, vulnMul:1, burnDmg:0,
                               damage:10, color:'#fff', type:'normal', exp:1, gold:1 }; }

  // ---------- 1) 弹道数成长 ----------
  try {
    resetAll();
    elementLevels['火'] = 1; if (bulletCountFor('火') !== 1) throw new Error('Lv1 应 1 条');
    elementLevels['火'] = 5; if (bulletCountFor('火') !== 2) throw new Error('Lv5 应 2 条');
    elementLevels['火'] = 9; if (bulletCountFor('火') !== 3) throw new Error('Lv9 应 3 条');
    perks.multishot = 3;     if (bulletCountFor('火') !== 6) throw new Error('Lv9+连发3 应封顶 6 条, 实=' + bulletCountFor('火'));
    evolution = { perk:'multishot', el:'火', key:'multishot_火', name:'火焰喷射' };
    if (bulletCountFor('火') !== 6) throw new Error('进化后仍应封顶 6');
    ok('弹道成长：1/2/3 → +连发 → 封顶 6');
  } catch(e){ fail('弹道成长', e); }

  // ---------- 2) 扇形发射 ----------
  try {
    resetAll(); elementLevels['火'] = 9;   // 3 条
    shootElement('火');
    if (bullets.length !== 3) throw new Error('应发 3 条, 实=' + bullets.length);
    const a0 = Math.atan2(bullets[0].vy, bullets[0].vx);
    const a1 = Math.atan2(bullets[1].vy, bullets[1].vx);
    const a2 = Math.atan2(bullets[2].vy, bullets[2].vx);
    if (!(a0 < a1 && a1 < a2)) throw new Error('三条应呈扇形递增');
    ok('扇形发射：3 条角度递增');
  } catch(e){ fail('扇形发射', e); }

  // ---------- 3) 词条卡生成与加点 ----------
  try {
    resetAll(); isSkillLab = true;
    showUpgradePanel();
    const perkCards = upgradeOptions.filter(c => c.kind === 'perk');
    if (perkCards.length !== 6) throw new Error('应有 6 张词条卡, 实=' + perkCards.length);
    applyUpgrade({ kind:'perk', perk:'pierce' });
    if (perks.pierce !== 1) throw new Error('穿透应 1');
    applyUpgrade({ kind:'perk', perk:'pierce' });
    applyUpgrade({ kind:'perk', perk:'pierce' });
    applyUpgrade({ kind:'perk', perk:'pierce' });
    if (perks.pierce !== 3) throw new Error('穿透应封顶 3, 实=' + perks.pierce);
    ok('词条卡：6 张 / 加点 / 3 级封顶');
  } catch(e){ fail('词条卡', e); }

  // ---------- 4) 进化卡生成与绑定 ----------
  try {
    resetAll(); isSkillLab = true;
    elementLevels['火'] = 1;
    perks.multishot = 3;
    showUpgradePanel();
    const evoCard = upgradeOptions.filter(c => c.kind === 'evolve')[0];
    if (!evoCard) throw new Error('3 级连发应出现进化卡');
    if (evoCard.name.indexOf('火焰喷射') < 0) throw new Error('火元素应进化火焰喷射, 实=' + evoCard.name);
    applyUpgrade(evoCard);
    if (!evolution || evolution.key !== 'multishot_火') throw new Error('进化未绑定 multishot_火');
    ok('进化：连发Ⅲ + 火 → 火焰喷射');
  } catch(e){ fail('进化卡', e); }

  // ---------- 5) 进化弹属性 ----------
  try {
    resetAll();
    perks.multishot = 3;
    evolution = { perk:'multishot', el:'火', key:'multishot_火', name:'火焰喷射' };
    elementLevels['火'] = 1;
    shootElement('火');
    const b = bullets[0];
    if (b.evo !== 'multishot_火') throw new Error('子弹未携带进化标记');
    if (b.radius !== 22) throw new Error('火焰喷射弹体应为 22, 实=' + b.radius);
    ok('进化弹：携带 evo 标记 + 弹体 22');
  } catch(e){ fail('进化弹', e); }

  // ---------- 6) 词条命中：爆裂 + 霜冻 ----------
  try {
    resetAll();
    const main = zk(200,300); const near = zk(230,320); zombies.push(main, near);
    const b = { x:200, y:300, damage:100, element:'火', perkSnapshot:{ explode:2, chill:1, burn:0, bounce:0, pierce:0 }, evo:null, tapEffect:'none' };
    const h0 = near.health;
    applyPerkHit(b, main);
    if (!(near.health < h0)) throw new Error('爆裂应对 60px 内造成伤害');
    if (!(main.slowUntil > Date.now())) throw new Error('霜冻应施加减速');
    ok('词条命中：爆裂范围伤 + 霜冻减速');
  } catch(e){ fail('词条命中', e); }

  // ---------- 6b) 掉落物：统一下落 / 半径70 / 漏球返还 / 金币自动收 ----------
  try {
    resetAll(); expOrbs.length = 0; goldOrbs.length = 0;
    player.exp = 0; player.expToLevel = 999999; player.gold = 0;

    // 远处经验球：必须持续竖直下落（不再停在角色高度）
    const far = { x: 80, y: 200, radius: 4, exp: 1 };
    expOrbs.push(far); updateOrbs();
    if (!(far.y > 200)) throw new Error('经验球未竖直下落');

    // 150px：不应被磁吸（半径 70）
    const mid = { x: player.x + 150, y: player.y - 20, radius: 4, exp: 1 };
    expOrbs.length = 0; expOrbs.push(mid);
    const mx0 = mid.x; updateOrbs();
    if (expOrbs.length === 1 && Math.abs(mid.x - mx0) > 1) throw new Error('150px 处不应被磁吸（半径应≈70）');

    // 漏过墙线：消失 + 返还 50%
    const miss = { x: 40, y: WALL_Y + 40, radius: 4, exp: 8 };
    expOrbs.length = 0; expOrbs.push(miss);
    updateOrbs();
    if (expOrbs.length !== 0) throw new Error('漏过墙线的经验球应消失');
    if (Math.abs(player.exp - 4) > 0.01) throw new Error('漏球应返还 50% 经验(4), 实=' + player.exp);

    // 金币：竖直下落 + 到墙线自动收取（不漏）
    goldOrbs.length = 0;
    const g1 = { x: 60, y: 200, radius: 5 }; goldOrbs.push(g1);
    updateOrbs();
    if (!(g1.y > 200)) throw new Error('金币未竖直下落');
    goldOrbs.length = 0;
    const g2 = { x: 60, y: WALL_Y - 8, radius: 5 }; goldOrbs.push(g2);
    player.gold = 0;
    updateOrbs();
    if (goldOrbs.length !== 0) throw new Error('金币到墙线应自动收取');
    if (player.gold <= 0) throw new Error('金币未入账');

    ok('掉落物：统一下落 / 半径70 / 漏球返50% / 金币墙线自动收');
  } catch(e){ fail('掉落物', e); }

  // ---------- 6c) B：移动降射速接线 ----------
  try {
    if (!__hasMoveCost) throw new Error('缺少移动降射速逻辑');
    ok('B：移动时射速 ×0.5（含 150ms 移动判定）');
  } catch(e){ fail('移动降射速', e); }

  // ---------- 6d) C：投掷怪 ----------
  try {
    resetAll(); zombies.length = 0; enemyShots.length = 0;
    nextThrowerAt = 0; playerStunUntil = 0;

    // 指派投掷者
    const z = zk(120, 300); zombies.push(z);
    updateThrowers(Date.now());
    if (!z.thrower) throw new Error('应指派一只投掷者');

    // 到点投掷，锁定玩家当前位置
    z.throwAt = 0;
    updateEnemyShots(Date.now());
    if (enemyShots.length !== 1) throw new Error('投掷者应生成投掷物, 实=' + enemyShots.length);
    if (Math.abs(enemyShots[0].tx - player.x) > 0.01) throw new Error('落点应锁定玩家 x');

    // 命中：玩家在落点内 → 眩晕
    const now = Date.now();
    enemyShots = [{ x0: player.x, y0: player.y - 50, x: player.x, y: player.y, tx: player.x, ty: player.y, born: now - 900, landAt: now - 10, r: THROW_RADIUS }];
    updateEnemyShots(now);
    if (!(playerStunUntil > now)) throw new Error('命中应造成眩晕');

    // 未命中：玩家远离落点 → 不眩晕
    playerStunUntil = 0;
    enemyShots = [{ x0: 20, y0: 200, x: 20, y: 200, tx: 20, ty: 200, born: now - 900, landAt: now - 10, r: THROW_RADIUS }];
    updateEnemyShots(now);
    if (playerStunUntil !== 0) throw new Error('远离落点不应眩晕');

    ok('C：指派投掷者 / 锁定玩家 / 命中眩晕 / 远离不中');
  } catch(e){ fail('投掷怪', e); }

  // ---------- 6e) 灵脉已移除 + 眩晕停火接线 ----------
  try {
    if (__hasLey) throw new Error('灵脉代码未清除');
    if (!__hasStunFire) throw new Error('眩晕未接入停火判定');
    ok('灵脉已移除 / 眩晕期间停火');
  } catch(e){ fail('灵脉清理', e); }

  // ---------- 6f) 坦克物理移动：不瞬移 + 有加速 + 边界 ----------
  try {
    resetAll();
    player.x = 195; playerVX = 0; playerMoveTargetX = 300;
    updatePlayerMove(16);
    const moved = player.x - 195;
    if (moved <= 0) throw new Error('应向目标移动');
    if (moved > 30) throw new Error('单帧位移过大（疑似瞬移）: ' + moved.toFixed(1));
    for (let i = 0; i < 180; i++) updatePlayerMove(16);
    if (Math.abs(player.x - 300) > 3) throw new Error('应平滑到达目标, 实=' + player.x.toFixed(1));

    // 边界
    player.x = 195; playerVX = 0; playerMoveTargetX = 9999;
    for (let i = 0; i < 300; i++) updatePlayerMove(16);
    if (player.x > screenWidth - 43) throw new Error('越过右边界: ' + player.x.toFixed(1));

    ok('物理移动：单帧位移 ' + moved.toFixed(1) + 'px（不瞬移）+ 平滑到位 + 边界夹紧');
  } catch(e){ fail('物理移动', e); }

  // ---------- 6g) v2.10：Boss 演出 + 投掷物外观 ----------
  try {
    resetAll();
    const boss = zk(200, 300, '火'); boss.type = 'boss'; boss.health = 1; boss.maxHealth = 9000;
    zombies.push(boss);
    damageZombie(boss, 1e6, false, '水');
    if (!(bossKillUntil > Date.now())) throw new Error('BOSS 击杀应触发击破演出');
    if (!(slowUntil > Date.now())) throw new Error('BOSS 击破应有慢动作');
    if (!__hasBossHud) throw new Error('drawUI 未接入 Boss HUD');
    if (!__hasSharpShot) throw new Error('投掷物未改为不旋转的尖锐菱形');
    ok('Boss 演出：击破慢动作 + 顶部血条接线 + 投掷物尖锐菱形（不旋转）');
  } catch(e){ fail('Boss 演出', e); }

  // ---------- 6h) P8b：宝箱拾取 ----------
  try {
    resetAll();
    activeElement = '火';
    player.gold = 0; elementCharge['火'] = 0; autoDpsBonus = 0;
    chests = [{ x: player.x, y: player.y, r: 18, born: Date.now() }];
    updateChests(Date.now());
    if (chests.length !== 0) throw new Error('贴身宝箱应被拾取');
    const gained = player.gold > 0 || elementCharge['火'] > 0 || autoDpsBonus > 0;
    if (!gained) throw new Error('宝箱未发放任何奖励');
    if (!__hasChestSpawn) throw new Error('spawnWave 未接入宝箱掉落');
    ok('宝箱：贴身拾取 + 三选一奖励（金币/印/炮台）+ 每波掉落接线');
  } catch(e){ fail('宝箱', e); }

  // ---------- 6i) v2.11：特效/朝向/克制倍率/BOSS 血量 ----------
  try {
    // 中性伤害 0.55、错配 0.15
    const zNeutral = zk(200, 300, '金');
    if (Math.abs(getElementBonus(zNeutral, '木') - 0.55) > 1e-6) throw new Error('中性倍率应为 0.55');
    if (Math.abs(getElementBonus(zNeutral, '金') - 0.15) > 1e-6) throw new Error('错配倍率应为 0.15');
    if (Math.abs(getElementBonus(zNeutral, '火') - 2.5) > 1e-6) throw new Error('克制应 2.5');

    if (!__hasShotOrient) throw new Error('投掷物未按弹着点定向');
    if (!__hasBounceFx) throw new Error('弹射缺少连线特效');
    if (!__hasBossScale) throw new Error('BOSS 未使用独立血量份额');
    ok('v2.11：中性0.55/错配0.15 + 投掷物定向 + 弹射连线 + BOSS 独立血量');
  } catch(e){ fail('v2.11 修复', e); }

  // ---------- 6j) v2.12：BOSS 动态血量 ----------
  try {
    resetAll();
    activeElement = '火';
    elementLevels['火'] = 1;
    const d1 = currentCounterDPS();
    elementLevels['火'] = 9;
    perks.multishot = 3;
    const d6 = currentCounterDPS();
    if (!(d1 > 0)) throw new Error('DPS 估算应为正');
    if (!(d6 > d1 * 3)) throw new Error('满弹道 DPS 应远高于单弹道');
    if (!__hasBossDyn) throw new Error('BOSS 未接入动态血量');
    ok('BOSS 动态血量：单弹道 ' + Math.round(d1) + ' DPS → 满弹道 ' + Math.round(d6) + ' DPS（×10s 定血）');
  } catch(e){ fail('BOSS 动态血量', e); }

  // ---------- 6k) v2.12.1：BOSS 残血处决 ----------
  try {
    resetAll(); comboCount = 0;
    const b = zk(200, 300, '火'); b.type = 'boss'; b.maxHealth = 1000; b.health = 200;   // 20%
    zombies.push(b);
    const h0 = b.health;
    damageZombie(b, 100, false, '水');            // 水克火：100×2.5×AOE1.0×处决1.5 = 375
    const dealt = h0 - b.health;
    if (Math.abs(dealt - 375) > 1) throw new Error('残血处决伤害应 375, 实=' + dealt.toFixed(1));
    ok('BOSS 残血处决：<30% 血量时 ×1.5（实伤 ' + dealt.toFixed(0) + '）');
  } catch(e){ fail('残血处决', e); }

  // ---------- 6l) v2.13：护城值（漏怪扣格） ----------
  try {
    resetAll(); zombies.length = 0;
    wallLives = 3; leaksThisLevel = 0;
    const z = zk(200, 0, '金');
    z.speed = 0;                        // 站住（避免 y += undefined → NaN）
    z.y = WALL_Y - z.radius + 2;        // 已贴墙
    zombies.push(z);
    updateZombies(16);
    if (wallLives !== 2) throw new Error('普通怪漏过应扣 1 格, 实剩 ' + wallLives);
    if (zombies.indexOf(z) >= 0) throw new Error('漏过的怪应被移除');
    if (leaksThisLevel !== 1) throw new Error('漏怪计数应为 1');

    // BOSS 漏过扣 2 格
    zombies.length = 0; wallLives = 3;
    const b = zk(200, 0, '金'); b.type = 'boss';
    b.speed = 0;
    b.y = WALL_Y - b.radius + 2;
    zombies.push(b);
    updateZombies(16);
    if (wallLives !== 1) throw new Error('BOSS 漏过应扣 2 格, 实剩 ' + wallLives);

    if (!__hasWallLives) throw new Error('护城值未接入 HUD/重置');
    ok('护城值：普通怪 -1 / BOSS -2 / 漏过即移除 / HUD 接线');
  } catch(e){ fail('护城值', e); }

  // ---------- 6m) v2.14：盾兵援军（情境化广告点） ----------
  try {
    resetAll(); zombies.length = 0;
    wallLives = 2; wallLivesMax = 3; shieldAdUsed = 0; shieldWall = null;
    const nearWall = zk(200, 0, '金'); nearWall.speed = 0; nearWall.y = WALL_Y - 40;
    zombies.push(nearWall);
    grantShieldReinforcement({ x: 200, y: WALL_Y - 64 });
    if (wallLives !== 2) throw new Error('盾兵不应修墙（修墙是守将职责）, 实=' + wallLives);
    if (!(nearWall.y < WALL_Y - 40)) throw new Error('贴墙怪应被推退');
    if (!shieldWall) throw new Error('应生成盾墙');
    if (shieldAdUsed !== 1) throw new Error('广告次数应 +1');

    // v2.17：盾墙必须「逐步上升」——起点在墙底，终点在 WALL_Y-150
    const _y0 = getShieldWallY(shieldWall.start + 0);
    const _y1 = getShieldWallY(shieldWall.start + 2500);
    const _y2 = getShieldWallY(shieldWall.start + 5000);
    if (!(_y0 > _y1 && _y1 > _y2)) throw new Error('盾墙应逐步上升: ' + [_y0, _y1, _y2].join(' > '));
    if (Math.abs(_y2 - (WALL_Y - 150)) > 1) throw new Error('盾墙 5s 后应到 WALL_Y-150, 实=' + _y2);

    // 升满后：怪被顶到墙外
    shieldWall.start = Date.now() - 5200;
    const z2 = zk(200, 0, '金'); z2.speed = 0; z2.y = WALL_Y - 100;
    zombies.length = 0; zombies.push(z2);
    updateZombies(16);
    if (z2.y > WALL_Y - 170) throw new Error('盾墙升满后怪应被顶到 WALL_Y-176, 实 y=' + z2.y);
    if (wallLives !== 2) throw new Error('盾墙期间不应掉格');

    if (!__hasShield) throw new Error('盾兵未接入点击/绘制');
    ok('盾兵：推退 220px + 盾墙 5s 从墙底升起(WALL_Y+20 → WALL_Y-150) + 顶怪');
  } catch(e){ fail('盾兵援军', e); }

  // ---------- 6n) v2.15：守将复活 ----------
  try {
    resetAll(); zombies.length = 0;
    gameState = 'playing'; gamePaused = false;
    wallLives = 1; wallLivesMax = 3; reviveUsed = false; reviveOfferUntil = 0;
    const z = zk(200, 0, '金'); z.speed = 0; z.y = WALL_Y - z.radius + 2; zombies.push(z);
    updateZombies(16);
    if (wallLives !== 0) throw new Error('应扣到 0 格');
    if (!(reviveOfferUntil > Date.now())) throw new Error('归零应进入复活窗口');
    if (!gamePaused) throw new Error('复活窗口应暂停战斗');
    if (gameState !== 'playing') throw new Error('复活窗口不应直接结束');

    grantRevive();
    if (wallLives !== REVIVE_LIVES) throw new Error('复活后应回 ' + REVIVE_LIVES + ' 格');
    if (gamePaused) throw new Error('复活后应继续战斗');
    if (!(invincibleUntil > Date.now())) throw new Error('复活后应有无敌');
    if (!reviveUsed) throw new Error('复活次数应标记已用');
    if (!__hasRevive) throw new Error('复活未接入绘制/点击');
    ok('守将复活：归零进窗口 / 回 2 格 / 无敌 / 每局一次');
  } catch(e){ fail('守将复活', e); }

  // ---------- 6o) v2.15.1：复活按钮可点（触摸顺序） ----------
  try {
    if (!__hasReviveOrder) throw new Error('复活判定必须在「暂停弹窗」分支之前，否则永远点不到');
    ok('复活触摸顺序：复活判定先于暂停弹窗');
  } catch(e){ fail('复活触摸顺序', e); }

  // ---------- 6p) v2.15.2：破格是否真的生成盾兵 ----------
  try {
    resetAll(); zombies.length = 0;
    gameState = 'playing'; gamePaused = false;
    wallLives = 3; wallLivesMax = 3; shieldAdUsed = 0; shieldSoldier = null; reviveOfferUntil = 0;
    const z = zk(160, 0, '金'); z.speed = 0; z.y = WALL_Y - z.radius + 2;
    zombies.push(z);
    updateZombies(16);
    if (wallLives !== 2) throw new Error('应扣 1 格');
    if (!shieldSoldier) throw new Error('破格后未生成盾兵');
    if (!(shieldSoldier.until > Date.now())) throw new Error('盾兵时长异常');
    ok('破格生成盾兵：lives 3→2，盾兵 @x=' + Math.round(shieldSoldier.x));
  } catch(e){ fail('破格生成盾兵', e); }

  // ---------- 6q) v2.18：广告期间冻结复活倒计时 ----------
  try {
    if (!__hasAdFreeze) throw new Error('广告播放中未冻结复活判定（会被 watchdog 提前判负）');
    ok('广告期间：冻结复活倒计时 + 结束后补回时长');
  } catch(e){ fail('广告冻结', e); }

  // ---------- 6r) v2.19：结算双倍金币 ----------
  try {
    if (!__hasDoubleGold) throw new Error('结算双倍金币未接入（绘制/触摸/重置）');
    ok('结算双倍金币：按钮 + 加一份金币 + 每局重置');
  } catch(e){ fail('结算双倍金币', e); }

  // ---------- 6s) v2.20：三选一刷新 / 宝箱 ×2 ----------
  try {
    resetAll();
    // 奖励函数
    player.gold = 0;
    if (applyChestReward('gold') !== '+120 金币' || player.gold !== 120) throw new Error('金币奖励异常');
    elementCharge['火'] = 0; activeElement = '火';
    applyChestReward('charge');
    if (elementCharge['火'] !== 8) throw new Error('元素印奖励异常');
    autoDpsBonus = 0;
    applyChestReward('power');
    if (autoDpsBonus !== 12) throw new Error('炮台奖励异常');

    // 拾取宝箱 → 生成 ×2 提示
    chests = [{ x: player.x, y: player.y, r: 18, born: Date.now() }];
    chestDouble = null; chestAdUsed = 0;
    updateChests(Date.now());
    if (!chestDouble) throw new Error('拾取宝箱后应出现 ×2 提示');
    if (!(chestDouble.until > Date.now())) throw new Error('×2 提示时长异常');
    if (['gold', 'charge', 'power'].indexOf(chestDouble.kind) < 0) throw new Error('奖励 kind 异常');

    // 刷新按钮接线
    if (!__hasReroll) throw new Error('三选一刷新未接入（绘制/触摸/上限）');
    ok('宝箱 ×2：奖励函数 + 拾取生成提示 + 刷新接线');
  } catch(e){ fail('宝箱×2', e); }

  // ---------- 6t) v2.21：埋点 ----------
  try {
    resetAll();
    trackBuffer = [];
    track('ad_show', { slot: 'test', level: 1, wall: 3 });
    if (trackBuffer.length !== 1) throw new Error('埋点未进本地缓冲');
    if (trackBuffer[0].e !== 'ad_show' || trackBuffer[0].d.slot !== 'test') throw new Error('埋点内容异常');
    track('x', null);   // 空数据不应抛错
    if (!__hasTrack) throw new Error('埋点未覆盖六点位/结算');
    ok('埋点：本地缓冲 + 空数据容错 + 六点位/结算接线');
  } catch(e){ fail('埋点', e); }

  // ---------- 6u) v2.22：场景分析上报 ----------
  try {
    if (!__hasScene) throw new Error('场景分析未接入（branchId 配置/上报/曝光点击）');
    // 6 个 branchId 必须都已配置（长度 >10），否则会出现"某个点位没数据"
    const _bad = Object.keys(AD_BRANCH).filter(k => !AD_BRANCH[k] || AD_BRANCH[k].length < 10);
    if (_bad.length) throw new Error('branchId 未配置: ' + _bad.join(','));
    // 未配置 branchId 时必须静默返回，不抛错
    reportBranch('bomb', 1);
    reportBranch('not_exist', 2);
    ok('场景分析：6 点位曝光/点击接线 + 未配置时静默');
  } catch(e){ fail('场景分析', e); }

  // ---------- 6v) v2.23.1：广告回调 → 奖励必须发放 ----------
  try {
    resetAll();
    gameState = 'playing'; gameRunning = true; gamePaused = false;
    const mkAd = () => ({ onClose(){}, offClose(){}, show(){ return Promise.resolve(); }, load(){ return Promise.resolve(); } });

    const cases = [
      { name: 'isEnded:true', res: { isEnded: true }, expect: 1 },
      { name: 'undefined(旧接口)', res: undefined, expect: 1 },
      { name: '{}（无 isEnded）', res: {}, expect: 1 },
      { name: 'isEnded:false', res: { isEnded: false }, expect: 0 }
    ];
    for (const c of cases) {
      let got = 0;
      rewardedAd = mkAd();
      showRewardedAd(() => { got++; }, 'revive');
      finishAd(c.res);
      if (got !== c.expect) throw new Error(c.name + ' 期望 got=' + c.expect + ', 实=' + got);
    }
    ok('广告回调：true/undefined/{} 发奖，isEnded:false 不发');
  } catch(e){ fail('广告回调', e); }

  // ---------- 6x) v2.25：背景不参与震屏 ----------
  try {
    if (!__hasShakeFix) throw new Error('震屏仍会平移背景（会露黑边/看起来像缩小）');
    ok('震屏：背景先画满屏，只有战场层位移');
  } catch(e){ fail('震屏修复', e); }

  // ---------- 6y) v2.26：视觉降噪（怪物尺寸/HUD/炸弹/城墙破损） ----------
  try {
    if (!__hasVisualCleanup) throw new Error('视觉降噪未落地（怪物字号封顶/BOSS条位置/炸弹缩小/城墙破损）');
    ok('视觉降噪：怪物字号按类型封顶 + BOSS条下移 + 炸弹缩小 + 城墙破损');
  } catch(e){ fail('视觉降噪', e); }

  // ---------- 6z) v2.27：坦克移动不过冲（不回弹） ----------
  try {
    resetAll();
    player.x = 100; playerVX = 0; playerMoveTargetX = 200;
    let maxX = player.x;
    for (let i = 0; i < 120; i++) { updatePlayerMove(16); maxX = Math.max(maxX, player.x); }
    if (maxX > 201) throw new Error('出现回弹：最大 x=' + maxX.toFixed(1) + ' > 目标 200');
    if (Math.abs(player.x - 200) > 2) throw new Error('未到位：x=' + player.x.toFixed(1));
    ok('坦克移动：到位刹车无过冲（max=' + maxX.toFixed(1) + '，终点=' + player.x.toFixed(1) + '）');
  } catch(e){ fail('坦克移动', e); }

  // ---------- 6aa) v2.28：宝箱在不同屏高下都必须可达 ----------
  try {
    resetAll();
    const gap = player.y - chestSpawnY();
    if (gap > chestMagnetR() + 0.5) {
        throw new Error('宝箱超出磁吸范围: gap=' + gap.toFixed(1) + ' > magnet=' + chestMagnetR());
    }
    // 端到端：放在生成点，模拟 60 帧必须被吃掉
    chests = [{ x: player.x + 20, y: chestSpawnY(), r: 18, born: Date.now() }];
    chestDouble = null; chestAdUsed = 0;
    for (let i = 0; i < 60 && chests.length; i++) updateChests(Date.now());
    if (chests.length !== 0) throw new Error('宝箱 60 帧内未被拾取（gap=' + gap.toFixed(1) + '）');
    // 纯公式校验：常见屏高下「间距 ≤ 磁吸」都必须成立
    for (const h of [667, 812, 844, 896, 932, 1024]) {
        const chestY = Math.min(h * 0.58, (h * 0.70 - 34) - 60);
        const gapH = (h * 0.70 - 34) - chestY;
        const magH = Math.max(70, Math.round(h * 0.13));
        if (gapH > magH) throw new Error('屏高 ' + h + ' 不可达: gap=' + gapH.toFixed(0) + ' > mag=' + magH);
    }
    ok('宝箱可达性：生成间距 ' + gap.toFixed(0) + 'px ≤ 磁吸 ' + chestMagnetR() + 'px；667–1024 屏高全部可达');
  } catch(e){ fail('宝箱可达性', e); }

  // ---------- 6ab) v2.29：三选一面板位置上移 + 输入锁 ----------
  try {
    resetAll();
    const py = upgradePanelY(300);
    if (py + 300 > screenHeight * 0.80) throw new Error('面板仍然太靠下: bottom=' + (py + 300) + ' / h=' + screenHeight);
    if (py < SAFE_TOP_OFFSET) throw new Error('面板顶到状态栏');

    showUpgradePanel();
    if (gameState !== 'upgrade') throw new Error('未进入升级态');
    if (!(upgradeInputLock > Date.now())) throw new Error('未设置输入锁（拖动手指会误选）');
    ok('三选一：面板上移到 ' + Math.round(py) + 'px（底部不超 80% 屏高）+ 260ms 输入锁');
  } catch(e){ fail('三选一面板', e); }

  // ---------- 7) M1 走位接线 ----------
  try {
    if (!__hasMove) throw new Error('onTouchMove 缺少战斗内拖动走位');
    if (!__hasMagnet) throw new Error('经验球未改为常量磁吸半径');
    ok('走位：拖动移动角色 + 经验球 70px 磁吸');
  } catch(e){ fail('走位接线', e); }

  console.log('\\n=== V25 SMOKE RESULT ===');
  console.log(results.join('\\n'));
  const bad = results.some(r => r.indexOf('FAIL') === 0);
  console.log(bad ? 'OVERALL: FAIL' : 'OVERALL: PASS');
})();
`;

try {
    vm.runInContext(src + driver, sandbox, { filename: 'game.js' });
} catch (e) {
    console.log('LOAD/RUNTIME ERROR:');
    console.log(e.stack ? e.stack.split('\n').slice(0, 8).join('\n') : e);
    process.exit(2);
}
