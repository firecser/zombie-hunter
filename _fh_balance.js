// 火力强化分支树数值平衡穷举（临时验证脚本）
// 模型：全局 damage 因子 = 1.12^L（每次选火力强化基础/分支都 ×1.12）
// 分支 DPS 倍率 = dmgMul / fireMul（global 是所有路径共有，故只需比分支倍率）
// 选取策略：优先把目标分支升满(5级)，其余 L-分支级 全选基础

// 候选分支系数（待调）：
// 每个 offensive 分支用 每级乘法因子 表示：dmgMul *= dm^bl，fireMul *= fm^bl
const branches = {
  heavyBarrel: { dm: 1.15,  fm: 1/1.03, rm: 1.20 }, // 体型+AoE，微射速代价
  rapidFire:   { dm: 0.96,  fm: 0.82 },             // 快射低伤
  charge:      { dm: 1.35,  fm: 1.147 },            // 重击慢射
  armorPierce: { armor: 0.30 },                     // 对坦克/Boss 额外增伤（每级）
  knockback:   { knock: 15 },                        // 击退力度（每级）
  calibration: { hb: 1.18 }                          // 命中框倍率（每级）
};

const MAXBL = 5;
function branchMult(bid, bl) {
  const b = branches[bid];
  if (bid === 'heavyBarrel') return { dps: Math.pow(b.dm,bl)/Math.pow(b.fm,bl), radius: Math.pow(b.rm,bl) };
  if (bid === 'rapidFire')   return { dps: Math.pow(b.dm,bl)/Math.pow(b.fm,bl) };
  if (bid === 'charge')      return { dps: Math.pow(b.dm,bl)/Math.pow(b.fm,bl) };
  if (bid === 'armorPierce') return { armor: b.armor*bl };
  if (bid === 'knockback')   return { knock: b.knock*bl };
  if (bid === 'calibration') return { hb: Math.pow(b.hb,bl) };
  return {};
}
function globalMul(L){ return Math.pow(1.12, L); }

console.log('=== 单分支每级强度（分支倍率，不含全局 1.12^L）===');
const hdr = ['bl'];
for (const bid in branches) hdr.push(bid.padStart(10));
console.log(hdr.join(' | '));
for (let bl=1; bl<=MAXBL; bl++){
  const row = [String(bl).padStart(2)];
  for (const bid in branches){
    const m = branchMult(bid, bl);
    let v = m.dps!=null ? m.dps.toFixed(2)+'x'
         : m.armor!=null ? '+'+(m.armor*100).toFixed(0)+'%'
         : m.knock!=null ? m.knock.toFixed(0)
         : m.hb!=null ? m.hb.toFixed(2)+'x' : '?';
    row.push(v.padStart(10));
  }
  console.log(row.join(' | '));
}

console.log('\n=== 纯路径总 DPS 倍率（L 级：先把该分支升满，其余选基础）===');
console.log('L  | 纯基础(1.12^L) | heavy | rapid | charge | (armor仅Boss)');
for (let L=1; L<=20; L++){
  const baseOnly = globalMul(L);
  const takeBl = (bid)=> Math.min(MAXBL, L); // 先把该分支升满
  const path = (bid)=>{
    const bl = takeBl(bid);
    const m = branchMult(bid, bl);
    return baseOnly * (m.dps || 1);
  };
  console.log(
    String(L).padStart(2),
    '|', baseOnly.toFixed(2).padStart(13),
    '|', path('heavyBarrel').toFixed(2).padStart(5),
    '|', path('rapidFire').toFixed(2).padStart(5),
    '|', path('charge').toFixed(2).padStart(5),
    '| boss x', (baseOnly*(1+0.30*Math.min(5,L))).toFixed(2)
  );
}

console.log('\n=== 全分支均衡目标：offensive 三分支每级 DPS 倍率应≈ 1+0.25*bl ===');
for (let bl=1; bl<=MAXBL; bl++){
  const target = 1+0.25*bl;
  console.log('bl='+bl, 'target', target.toFixed(2),
    '| heavy', branchMult('heavyBarrel',bl).dps.toFixed(2),
    '| rapid', branchMult('rapidFire',bl).dps.toFixed(2),
    '| charge', branchMult('charge',bl).dps.toFixed(2));
}
