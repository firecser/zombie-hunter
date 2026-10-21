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
    __hasStunFire: /now >= playerStunUntil/.test(src)
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
