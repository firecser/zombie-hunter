// 火力强化(base) vs 爆炸弹(base) 数值平衡对比模型（v1.0.85+：火力强化基础 +14%/级）
// 玩家基础子弹伤害 player.damage = 10，射速固定，仅比较“每发有效伤害”倍数
const PD = 10;
const FP_RATE = 1.14;   // 火力强化 base：每级 player.damage *= 1.14

// 爆炸弹 base：每发命中产生 AOE，secondary 目标伤害 = D*(0.3+0.1*L)*explDmgMul；primary = D（不含爆炸等级加成）
function firepowerPerHit(L){ return PD * Math.pow(FP_RATE, L); }
function explosivePerHit(L, k, explDmgMul){ const D = PD; return D * (1 + k * (0.3 + 0.1*L) * explDmgMul); }
function explosiveRadius(L, cut){ return Math.max(35, 40 + L*20 - cut); }

console.log('=== 同等级 L 投入对比：单体(k=0) vs 密集群(k=4 secondary) ===');
console.log(' L | 火力强化(单体) | 爆炸弹 k=0 | 爆炸弹 k=4 | 爆炸弹半径 | 火力强化/爆炸弹(k=4)比');
for (const L of [1,3,5,8,12,20]) {
  const fp = firepowerPerHit(L), ex4 = explosivePerHit(L,4,1), r = explosiveRadius(L,0);
  console.log(String(L).padStart(2),'|',fp.toFixed(1),'|','10.0','|',ex4.toFixed(1),'|',r.toFixed(0),'|',(fp/ex4).toFixed(2));
}

console.log('\n=== crossover：爆炸弹(含 k 个 secondary)何时追平火力强化单体 ===');
console.log('需要 k*(0.3+0.1L) >= 1.14^L - 1');
for (const L of [1,3,5,8,12,20]) {
  const need = (Math.pow(FP_RATE,L) - 1) / (0.3 + 0.1*L);
  console.log(' L='+String(L).padStart(2)+' 需要 secondary 数 k >=', need.toFixed(2), need<1.5?'(几乎必被爆炸弹压制)':need<3?'(小群爆炸弹占优)':'(仅密集群爆炸弹占优 → 火力强化守住房单/Boss)');
}
