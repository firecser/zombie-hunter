// P4 局外养成（5 元素树）回归测试
// 覆盖：40 节点结构 / 只允许 6 类合规 contrib / 旧 119 节点已消失 / applyTalentsToBattle 各项产出 /
//       元素攻击进单发 / 城墙减伤入账 / 开局元素等级接线 / 天赋消耗 2 次幂
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
    wx: wxProxy, ctx: ctxProxy,
    canvas: { getContext: () => ctxProxy, width: 390, height: 844 },
    screenWidth: 390, screenHeight: 844,
    console, Math, Date, Object, Array, JSON, String, Number, Boolean, isNaN, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    module: { exports: {} }, require: () => ({}), globalThis: null,
    __hasElemInit: /elementLevels\[_el\] = Math\.min\(ELEM_MASTERY_MAX, 1 \+ \(elementBaseLevels\[_el\] \|\| 0\)\)/.test(src),
    // 跨局重置：局内三选一增益/连携状态必须每局归零（防上一局残留）
    __hasRunReset: /局内三选一增益与连携状态必须每局重置/.test(src) && /restraintMult = 2\.5;/.test(src)
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const driver = `
;(function(){
  const results = [];
  function ok(n){ results.push('PASS ' + n); }
  function fail(n, e){ results.push('FAIL ' + n + ' :: ' + (e && e.stack ? e.stack.split('\\n').slice(0,3).join(' | ') : e)); }
  function near(a,b,tol){ return Math.abs(a-b) <= (tol||1e-9); }
  const HZ = 1000 / 220;
  try { AudioSystem.playShoot = function(){}; } catch(e){}
  zombies.length = 0; bullets.length = 0;

  function zeroAll(){ for (const k in talentData) talentData[k].level = 0; applyTalentsToBattle(); }

  // ---------- 1) 结构：5 页 × 8 节点 ----------
  try {
    if (TALENT_PAGES.length !== 5) throw new Error('应有 5 个元素页, 实=' + TALENT_PAGES.length);
    const ids = Object.keys(talentData);
    if (ids.length !== 40) throw new Error('应有 40 个节点, 实=' + ids.length + '（旧 119 节点应已删除）');
    for (const p of TALENT_PAGES) {
      const n = (talentLayout[p.id] || []).filter(i => !i.h).length;
      if (n !== 8) throw new Error(p.id + ' 页应有 8 节点, 实=' + n);
    }
    ok('结构：5 元素 × 8 节点 = 40（旧 119 节点已移除）');
  } catch(e){ fail('结构', e); }

  // ---------- 2) 合规：contrib 只允许 6 类 ----------
  try {
    const ALLOWED = ['atkFlat','hpFlat','defPct','critChance','critDamage','elemLevel'];
    for (const id in talentData) {
      const c = talentData[id].contrib || {};
      for (const k in c) {
        if (ALLOWED.indexOf(k) < 0) throw new Error(id + ' 含非法 contrib: ' + k);
      }
    }
    // 不应再出现旧机制字段
    for (const bad of ['damageBonus','fireRate','piercingBonus','bulletCountBonus','explosiveLevel','lightningLevel','freezeSkillLevel','bombMaxBonus','wallHealthMul','goldMult','expMult','deathrayLevel','immortalCharges','lifestealPerKill']) {
      if (JSON.stringify(talentData).indexOf('"' + bad + '"') >= 0) throw new Error('仍存在旧机制字段: ' + bad);
    }
    ok('合规：contrib 仅 atkFlat/hpFlat/defPct/critChance/critDamage/elemLevel');
  } catch(e){ fail('合规', e); }

  // ---------- 3) 全 0 基线 ----------
  try {
    zeroAll();
    if (talentMods.critChance !== 0) throw new Error('暴击率基线应 0');
    if (talentMods.critDamageMult !== 1.5) throw new Error('暴击倍率基线应 1.5×, 实=' + talentMods.critDamageMult);
    if (talentMods.healthBonus !== 0) throw new Error('生命基线应 0');
    if (wallDefPct !== 0) throw new Error('城墙减伤基线应 0');
    for (const el of ['金','木','水','火','土']) {
      if (elemAtkFlat[el] !== 0) throw new Error(el + ' 攻击基线应 0');
      if (elementBaseLevels[el] !== 0) throw new Error(el + ' 开局等级基线应 0');
    }
    ok('基线：暴击倍率 1.5× / 其余 0');
  } catch(e){ fail('基线', e); }

  // ---------- 4) 元素攻击：进单发伤害 ----------
  try {
    zeroAll(); elementLevels['火'] = 1; synergyUntil = 0; autoDpsBonus = 0;
    bullets.length = 0; shootElement('火');
    const d0 = bullets[0].damage;
    talentData['huo_atk1'].level = 10;     // +2 × 10 = +20
    applyTalentsToBattle();
    if (elemAtkFlat['火'] !== 20) throw new Error('火攻击应 20, 实=' + elemAtkFlat['火']);
    bullets.length = 0; shootElement('火');
    const d1 = bullets[0].damage;
    if (!near(d1 - d0, 20 / HZ, 0.05)) throw new Error('单发应 +' + (20/HZ).toFixed(2) + ', 实=' + (d1-d0).toFixed(2));
    ok('元素攻击：+20 → 单发 +' + (d1-d0).toFixed(2));
  } catch(e){ fail('元素攻击', e); }

  // ---------- 5) HP / 减伤 / 暴击 / 精通 ----------
  try {
    zeroAll();
    talentData['huo_hp'].level = 10;       // +80 ×10
    talentData['huo_def'].level = 10;      // +1.5% ×10 = 15%
    talentData['huo_crit'].level = 10;     // +0.5% ×10 = 5%
    talentData['huo_cdmg'].level = 10;     // +0.05 ×10 = +0.5
    talentData['huo_lv'].level = 5;        // 开局 +5 级
    applyTalentsToBattle();
    if (talentMods.healthBonus !== 800) throw new Error('生命应 800, 实=' + talentMods.healthBonus);
    if (!near(wallDefPct, 0.15, 1e-9)) throw new Error('减伤应 15%, 实=' + wallDefPct);
    if (!near(talentMods.critChance, 0.05, 1e-9)) throw new Error('暴击率应 5%, 实=' + talentMods.critChance);
    if (!near(talentMods.critDamageMult, 2.0, 1e-9)) throw new Error('暴击倍率应 2.0, 实=' + talentMods.critDamageMult);
    if (elementBaseLevels['火'] !== 5) throw new Error('火开局等级应 5, 实=' + elementBaseLevels['火']);
    ok('HP 800 / 减伤 15% / 暴击率 5% / 暴击倍率 2.0 / 开局+5级');
  } catch(e){ fail('HP/减伤/暴击/精通', e); }

  // ---------- 6) 上限封顶 ----------
  try {
    zeroAll();
    for (const p of ['jin','mu','shui','huo','tu']) {
      talentData[p + '_def'].level = 10;
      talentData[p + '_crit'].level = 10;
      talentData[p + '_cdmg'].level = 10;
    }
    applyTalentsToBattle();
    if (wallDefPct !== 0.30) throw new Error('减伤应封顶 30%, 实=' + wallDefPct);
    // 暴击率：5 元素 × 10 级 × 0.5% = 25%（安全上限 60% 不触发）
    if (!near(talentMods.critChance, 0.25, 1e-9)) throw new Error('暴击率应 25%, 实=' + talentMods.critChance);
    // 暴击倍率：1.5 + 5×0.05×10 = 4.0 → 封顶 3.0
    if (talentMods.critDamageMult !== 3.0) throw new Error('暴击倍率应封顶 3.0, 实=' + talentMods.critDamageMult);
    ok('封顶：减伤 30% / 暴击率 25%（上限 60% 未触发）/ 暴击倍率 3.0');
  } catch(e){ fail('封顶', e); }

  // ---------- 7) 开局元素等级接线 + 消耗 2 次幂 ----------
  try {
    if (!__hasElemInit) throw new Error('startGame 缺少 elementLevels 初始化（跨局会残留）');
    zeroAll(); talentData['jin_lv'].level = 3; applyTalentsToBattle();
    const cost1 = (function(){ const t = { level: 0, cost: 300 }; return getTalentCost(t); })();
    const cost2 = (function(){ const t = { level: 1, cost: 300 }; return getTalentCost(t); })();
    if (cost1 !== 75 || cost2 !== 300) throw new Error('消耗应 75/300（2次幂）, 实=' + cost1 + '/' + cost2);
    if (elementBaseLevels['金'] !== 3) throw new Error('金开局等级应 3');
    if (!__hasRunReset) throw new Error('startGame 缺少局内增益/连携的跨局重置');
    ok('开局等级接线 + 消耗 2 次幂（Lv0→1:75, Lv1→2:300）+ 跨局重置');
  } catch(e){ fail('开局等级/消耗', e); }

  // ---------- 8) 旧天赋 id 已消失 ----------
  try {
    for (const old of ['core','damage','health','attackspeed','crit','piercing','explosive','lightning','deathray','immortal','devour','def_rampart']) {
      if (talentData[old]) throw new Error('旧节点仍存在: ' + old);
    }
    ok('旧天赋 id（core/damage/crit/explosive/deathray…）全部消失');
  } catch(e){ fail('旧天赋清理', e); }

  // ---------- 9) 旧存档迁移（C 方案：按旧累计花费返金币 + 封顶）----------
  try {
    // core 5 级：Σ(n=1..5) round(2000·n²/4) = 500+2000+4500+8000+12500 = 27500
    const data = { gold: 1000, talentLevels: { core: 5, huo_atk1: 2, legacy_unknown: 3 } };
    const refund = migrateLegacyTalents(data);
    if (refund !== 27500) throw new Error('core 5 级应返 27500, 实=' + refund);
    if (data.talentLevels['core'] !== undefined) throw new Error('旧 key core 未删除');
    if (data.talentLevels['legacy_unknown'] !== undefined) throw new Error('未知旧 key 未删除');
    if (data.talentLevels['huo_atk1'] !== 2) throw new Error('新树节点被误删: ' + data.talentLevels['huo_atk1']);
    // 封顶：core 满级 20 → 1,435,000 → 截 200000
    const big = { talentLevels: { core: 20 } };
    const capped = migrateLegacyTalents(big);
    if (capped !== LEGACY_REFUND_CAP) throw new Error('封顶应 ' + LEGACY_REFUND_CAP + ', 实=' + capped);
    ok('旧存档迁移：core×5 返 27500（精确累计）/ 封顶 ' + LEGACY_REFUND_CAP + ' / 新节点保留');
  } catch(e){ fail('旧存档迁移', e); }

  console.log('\\n=== P4 SMOKE RESULT ===');
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
