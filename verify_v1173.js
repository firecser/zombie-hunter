// 独立验证脚本：复刻 v1.1.73 关键公式，输出数值供核对（不依赖 DOM）
const WAVE_COUNT = 20;
const FIVE_ELEM_BASE = 130;
const ELEM_BASE_MUL = { '物理':1.6, '金':1.8, '火':1.8, '水':1.6, '土':1.6, '木':1.3 };

// —— 每波总血量 = 624 × 1.6^(w-1)，贪心凑体型档 ——
function buildWavePlan() {
  const plan = [];
  for (let i = 1; i <= WAVE_COUNT; i++) {
    const targetHP = 624 * Math.pow(1.6, i - 1);
    const isBoss = (i === 10 || i === 15 || i === 20);
    let hp = Math.round(targetHP / 312) * 312;
    const comp = {};
    if (isBoss) { comp.boss = 1; hp -= 39000; }
    const tiers = [['giant', 7800], ['tank', 1560], ['normal', 312]];
    for (const [t, h] of tiers) {
      comp[t] = 0;
      while (hp >= h) { comp[t]++; hp -= h; }
    }
    while (hp > 0) { comp.normal = (comp.normal||0) + 1; hp -= 312; }
    const count = Object.values(comp).reduce((a,b)=>a+b,0);
    plan.push({ i, isBoss, comp, count, totalHP: targetHP });
  }
  return plan;
}

// —— 偏离追踪（不封顶）——
function getDmgCouple(idx, progress) {
  if (progress <= 4) return 1;
  const expectedIdx = Math.pow(1.6, progress);
  return Math.max(1, Math.pow(idx / expectedIdx, 0.95));
}

// —— 玩家 DPS 估算（idx 法）——
const baseDps = 26 / 0.5; // 52
// 纯火力：每级 ×1.25，无分支
function pureFireDps(L) { return 2 * 26 * Math.pow(1.25, L); }
// 用摘要给的 L20 idx 近似值反推最优 DPS
const optimalIdxL20 = 1813;
const optimalDps = optimalIdxL20 * baseDps;

console.log('=== 五行基础伤害（与火力解耦）===');
for (const e of ['金','火','水','土','木']) console.log(`  ${e}: ${FIVE_ELEM_BASE} × ${ELEM_BASE_MUL[e]} = ${FIVE_ELEM_BASE*ELEM_BASE_MUL[e]}（物理子弹=26）`);

console.log('\n=== 每波总血量 / 组成 / 怪量 ===');
const plan = buildWavePlan();
for (const w of plan) {
  const c = w.comp;
  console.log(`  w${String(w.i).padStart(2)} 总血≈${Math.round(w.totalHP).toLocaleString().padStart(9)} | boss:${c.boss||0} giant:${String(c.giant||0).padStart(3)} tank:${String(c.tank||0).padStart(3)} normal:${String(c.normal||0).padStart(3)} | 怪数:${String(w.count).padStart(4)}`);
}

console.log('\n=== 火力耦合 couple（progress = 等级-1）===');
for (const L of [1,5,10,15,20]) {
  const p = L - 1;
  const idxPure = pureFireDps(L)/baseDps;
  const idxOpt = (L===20)? optimalIdxL20 : pureFireDps(L)/baseDps; // 简化：非20用纯火力近似
  console.log(`  L${String(L).padStart(2)} p=${String(p).padStart(2)}: 纯火力 idx=${idxPure.toFixed(1)} → couple=${getDmgCouple(idxPure,p).toFixed(2)} | 最优 idx=${idxOpt.toFixed(1)} → couple=${getDmgCouple(idxOpt,p).toFixed(2)}`);
}

console.log('\n=== 清波耗时估算（couple≈1，因 idx<1.6^progress 恒成立）===');
console.log('  纯火力 L20 DPS =', Math.round(pureFireDps(20)), '| 最优 L20 DPS =', Math.round(optimalDps));
for (const w of [1,5,10,15,20]) {
  const total = plan[w-1].totalHP;
  const tPure = total / pureFireDps(20);
  const tOpt = total / optimalDps;
  console.log(`  w${String(w).padStart(2)} 总血≈${Math.round(total).toLocaleString().padStart(9)}: 纯火力≈${(tPure/60).toFixed(1)}分 | 最优≈${(tOpt).toFixed(1)}秒`);
}
