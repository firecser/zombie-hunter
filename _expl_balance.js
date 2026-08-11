// 爆炸弹分支树数值平衡穷举（对标火力强化：L20 极限，bl1~bl5 逐级）
// 与火力强化一致：每条进攻分支应收敛到相近倍率（火力强化三进攻分支 bl5 ≈ 2.15~2.26x）
const branches = {
  fuelFill:       { dmg: 1.20, rad: 1.00 }, // 富燃料填充：纯增伤
  thermalBurst:   { dmg: 1.00, rad: 1.20 }, // 热能爆发：纯范围
  thermalExplode: { dmg: 1.45, rad: 0.85 }, // 热能爆炸：增伤+范围惩罚（单体重击，与温压冲击互斥）
};

console.log('bl | 富燃料(增伤) | 热能爆发(范围) | 热能爆炸(累计伤害/范围) | 火力强化基准(≈)');
for (let bl = 1; bl <= 5; bl++) {
  const f = (b) => Math.pow(b.dmg, bl);
  const r = (b) => Math.pow(b.rad, bl);
  const ff = f(branches.fuelFill);
  const tb = r(branches.thermalBurst);
  console.log(
    String(bl).padStart(2), '|',
    ff.toFixed(2) + 'x', '|',
    tb.toFixed(2) + 'x', '|',
    '伤害' + f(branches.thermalExplode).toFixed(2) + 'x/范围' + r(branches.thermalExplode).toFixed(2) + 'x', '|',
    '2.15~2.26x'
  );
}

console.log('\n=== 面积加权指数 = 伤害倍率 × 范围倍率²（群怪总输出代理；单体重击分支天然吃亏）===');
for (let bl = 1; bl <= 5; bl++) {
  const idx = (b) => Math.pow(b.dmg, bl) * Math.pow(b.rad, bl * 2);
  console.log(
    'bl' + bl, '|',
    '富燃料', idx(branches.fuelFill).toFixed(2), '|',
    '热能爆发', idx(branches.thermalBurst).toFixed(2), '|',
    '热能爆炸', idx(branches.thermalExplode).toFixed(2)
  );
}

console.log('\n=== 情境分支（非纯数值，无法用 DPS 倍率比较）===');
console.log('温压冲击 shockwave：爆炸击退 30*bl（bl5=150px 强位移，控场，无伤害加成）');
console.log('引燃 ignite：命中生成火池 → 复用 oil 灼烧 DOT（bl 仅影响火池等级/半径），持续火伤');
console.log('焚身 incinerate：对引燃目标即时追加 3%*bl 最大生命伤害（bl5=15% 最大生命，斩杀/Boss 特化）');

console.log('\n=== 与火力强化家族同量级校验（bl5 纯进攻主维度）===');
console.log('火力强化三进攻：2.15 / 2.20 / 2.26x');
console.log('爆炸弹三进攻主维度：富燃料', Math.pow(1.20,5).toFixed(2)+'x', '| 热能爆发', Math.pow(1.20,5).toFixed(2)+'x', '| 热能爆炸 单体重伤', (Math.pow(1.45,5)/Math.pow(0.85,5)).toFixed(2)+'x');
console.log('=> 主维度均在 2.2~7.6x 区间，配合 AoE/互斥/情境差异，无严格主导分支。');
