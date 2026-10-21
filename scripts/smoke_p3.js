// P3 三选一池重写回归测试
// 覆盖：4 类卡生成 / 元素精通生效（含 LvMul 反映到单发）/ 克制增幅 / 相生连携 / 通用属性(城墙/炮台) / 满级后仍有 3 张可选 / 不再改旧 skills
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
        return () => {};
    }
});

const sandbox = {
    wx: wxProxy,
    ctx: ctxProxy,
    canvas: { getContext: () => ctxProxy, width: 390, height: 844 },
    screenWidth: 390,
    screenHeight: 844,
    console,
    Math, Date, Object, Array, JSON, String, Number, Boolean, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    module: { exports: {} },
    require: () => ({}),
    globalThis: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const driver = `
;(function(){
  const results = [];
  function ok(n){ results.push('PASS ' + n); }
  function fail(n, e){ results.push('FAIL ' + n + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }
  function near(a,b,tol){ return Math.abs(a-b) <= (tol||0.01); }
  const HZ = 1000 / 220;

  try { AudioSystem.playShoot = function(){}; } catch(e){}
  zombies.length = 0; bullets.length = 0;
  // 防止 applyUpgrade 末尾的连锁升级递归
  player.exp = 0; player.level = 1; player.expToLevel = 999999;
  isSkillLab = false;

  function resetState(){
    for (const k of ['金','木','水','火','土']) elementLevels[k] = 1;
    restraintMult = 2.5; synergyDurBonus = 0; synergyDmgBonus = 0; autoDpsBonus = 0;
    player.maxHealth = 2000; player.health = 2000;
  }
  function keyOf(c){ return c.kind + ':' + (c.el || c.sub || c.name); }

  // ---------- 1) 候选生成：3 张、有 kind、无重复 ----------
  try {
    resetState(); currentStage = 5;      // 全 5 元素解锁
    showUpgradePanel();
    if (upgradeOptions.length !== 3) throw new Error('应出 3 张卡, 实=' + upgradeOptions.length);
    const keys = upgradeOptions.map(keyOf);
    if (new Set(keys).size !== keys.length) throw new Error('出现重复卡: ' + keys.join(' / '));
    for (const c of upgradeOptions) {
      if (!c.kind) throw new Error('卡缺 kind: ' + JSON.stringify(c));
      if (!c.name || !c.icon || !c.desc) throw new Error('卡缺 name/icon/desc: ' + c.name);
    }
    ok('候选生成 3 张不重复 (' + keys.join(' / ') + ')');
  } catch(e){ fail('候选生成', e); }

  // ---------- 2) 元素精通：等级 +1 且反映到单发伤害 ----------
  try {
    resetState(); currentStage = 5;
    bullets.length = 0; synergyUntil = 0;
    shootElement('火');
    const dmg1 = bullets[0].damage;                       // Lv1
    applyUpgrade({ kind: 'elem', el: '火' });
    if (elementLevels['火'] !== 2) throw new Error('火等级应 2, 实=' + elementLevels['火']);
    bullets.length = 0;
    shootElement('火');
    const dmg2 = bullets[0].damage;                       // Lv2：元素部分 ×1.15，但 autoDPS 40 不缩放 → 整体 ≈×1.129
    const exp2 = (ELEMENT_AUTO_DPS + autoDpsBonus + ELEMENT_BASE_DPS['火'] * 1.15) / HZ;
    if (!near(dmg2, exp2, 0.05)) throw new Error('Lv2 单发应为 ' + exp2.toFixed(2) + ', 实=' + dmg2.toFixed(2));
    if (!(dmg2 > dmg1)) throw new Error('元素精通未提升伤害');
    const _grow = dmg2 / dmg1;
    if (!(_grow > 1.10 && _grow < 1.15)) throw new Error('Lv1→Lv2 综合增幅应在 1.10~1.15, 实=' + _grow.toFixed(3));
    // 上限保护
    elementLevels['火'] = ELEM_MASTERY_MAX;
    applyUpgrade({ kind: 'elem', el: '火' });
    if (elementLevels['火'] !== ELEM_MASTERY_MAX) throw new Error('元素等级越过上限');
    ok('元素精通：Lv1→Lv2 单发 ' + dmg1.toFixed(1) + '→' + dmg2.toFixed(1) + '（元素部分×1.15，被 autoDPS 稀释为×' + (dmg2/dmg1).toFixed(3) + '），上限 ' + ELEM_MASTERY_MAX);
  } catch(e){ fail('元素精通', e); }

  // ---------- 3) 克制增幅：2.5→2.6 且 getElementBonus 跟随 ----------
  try {
    resetState();
    if (getElementBonus({ element:'金', elements:null }, '火') !== 2.5) throw new Error('初始克制应 2.5');
    applyUpgrade({ kind: 'restraint' });
    if (!near(restraintMult, 2.6, 1e-9)) throw new Error('克制倍率应 2.6, 实=' + restraintMult);
    if (getElementBonus({ element:'金', elements:null }, '火') !== 2.6) throw new Error('getElementBonus 未跟随 restraintMult');
    restraintMult = RESTRAINT_MAX;
    applyUpgrade({ kind: 'restraint' });
    if (restraintMult !== RESTRAINT_MAX) throw new Error('克制倍率越过上限');
    ok('克制增幅：2.5→2.6 生效，上限 ' + RESTRAINT_MAX.toFixed(1));
  } catch(e){ fail('克制增幅', e); }

  // ---------- 4) 相生连携：时长/增伤提升 ----------
  try {
    resetState();
    applyUpgrade({ kind: 'synergy' });
    if (synergyDurBonus !== 1000) throw new Error('连携时长加成应 1000, 实=' + synergyDurBonus);
    if (!near(synergyDmgBonus, 0.10, 1e-9)) throw new Error('连携增伤应 +0.10, 实=' + synergyDmgBonus);
    bullets.length = 0; synergyUntil = 0;
    shootElement('木'); const noSyn = bullets[0].damage;
    synergyUntil = Date.now() + 9999;
    bullets.length = 0; shootElement('木'); const syn = bullets[0].damage;
    if (!near(syn / noSyn, 1.30, 0.001)) throw new Error('连携增伤应 ×1.30, 实=' + (syn/noSyn).toFixed(3));
    ok('相生连携：+1s / 增伤 ×1.30');
  } catch(e){ fail('相生连携', e); }

  // ---------- 5) 通用属性：城墙加固 / 抢修 / 炮台校准 ----------
  try {
    resetState();
    player.maxHealth = 2000; player.health = 500;
    applyUpgrade({ kind: 'general', sub: 'wall' });
    if (player.maxHealth !== 2120) throw new Error('城墙上限应 2120, 实=' + player.maxHealth);
    if (player.health !== 2120) throw new Error('城墙加固应回满, 实=' + player.health);
    player.health = 1000;
    applyUpgrade({ kind: 'general', sub: 'repair' });
    if (!near(player.health, 1000 + 2120 * 0.25, 0.5)) throw new Error('抢修应 +25%, 实=' + player.health);
    bullets.length = 0; synergyUntil = 0; elementLevels['火'] = 1;
    shootElement('火'); const d0 = bullets[0].damage;
    applyUpgrade({ kind: 'general', sub: 'power' });
    if (autoDpsBonus !== 20) throw new Error('炮台校准应 +20, 实=' + autoDpsBonus);
    bullets.length = 0; shootElement('火'); const d1 = bullets[0].damage;
    if (!near(d1 - d0, 20 / HZ, 0.05)) throw new Error('炮台校准单发应 +' + (20/HZ).toFixed(2) + ', 实=' + (d1-d0).toFixed(2));
    ok('通用属性：城墙+120回满 / 抢修+25% / 炮台+20');
  } catch(e){ fail('通用属性', e); }

  // ---------- 6) 满级兜底：全部满级仍有 3 张通用卡 ----------
  try {
    resetState(); currentStage = 5;
    for (const k of ['金','木','水','火','土']) elementLevels[k] = ELEM_MASTERY_MAX;
    restraintMult = RESTRAINT_MAX;
    synergyDurBonus = 4000; synergyDmgBonus = 0.40;
    autoDpsBonus = 0;                      // 炮台卡仍可选
    // v2.5：词条与进化也必须满，才谈得上「只剩通用卡」
    perks = { multishot: 3, pierce: 3, explode: 3, chill: 3, burn: 3, bounce: 3 };
    evolution = { perk: 'multishot', el: '火', key: 'multishot_火', name: '火焰喷射' };
    showUpgradePanel();
    if (upgradeOptions.length !== 3) throw new Error('满级后应仍有 3 张, 实=' + upgradeOptions.length);
    if (!upgradeOptions.every(c => c.kind === 'general')) throw new Error('满级后应只剩通用卡: ' + upgradeOptions.map(keyOf).join('/'));
    ok('满级兜底：仍有 3 张通用卡可选');
  } catch(e){ fail('满级兜底', e); }

  // ---------- 7) 不再改动旧 skills（旧 15 技能体系彻底退出三选一）----------
  try {
    resetState();
    const before = JSON.stringify({ d: skills.damage && skills.damage.level, e: skills.explosive && skills.explosive.level, acq: acquiredSkills.slice() });
    applyUpgrade({ kind: 'elem', el: '木' });
    applyUpgrade({ kind: 'general', sub: 'wall' });
    const after = JSON.stringify({ d: skills.damage && skills.damage.level, e: skills.explosive && skills.explosive.level, acq: acquiredSkills.slice() });
    if (before !== after) throw new Error('旧 skills/acquiredSkills 被改动: ' + before + ' → ' + after);
    ok('旧 skills / acquiredSkills 不再被三选一改动');
  } catch(e){ fail('旧 skills 不被改动', e); }

  console.log('\\n=== P3 SMOKE RESULT ===');
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
