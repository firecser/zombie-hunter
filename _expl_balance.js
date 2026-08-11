// 爆炸弹分支树数值平衡穷举（对标火力强化：L20 极限，bl1~bl5 逐级）
// 与火力强化一致：每条进攻分支应收敛到相近倍率（火力强化三进攻分支 bl5 ≈ 2.15~2.26x）
// 注：爆炸范围扩大为爆炸弹基础等级自带效果（explosionRadius = (40+level*20)），不再设纯范围分支
// 热能爆炸：范围用平减像素(每级-40)而非乘性%，否则会被基础等级每级+20 增长完全抵消（玩家感知“没生效”）
const CUT = 40; // 热能爆炸每级平减半径 px
function radiusAt(level, thermalBl) {
  return Math.max(35, (40 + level * 20) - CUT * thermalBl);
}

console.log('bl | 富燃料(增伤) | 热能爆炸伤害 | 同等级半径(无/有热能爆炸) | 半径比 | 火力强化基准(≈)');
for (let bl = 1; bl <= 5; bl++) {
  const dmg = Math.pow(1.38, bl);
  // 选 bl 级热能爆炸时，爆炸弹总等级 = 起始2(解锁用) + bl；用 level=2+bl 近似同进度
  const level = 2 + bl;
  const rNo = radiusAt(level, 0);
  const rYes = radiusAt(level, bl);
  console.log(
    String(bl).padStart(2), '|',
    Math.pow(1.20, bl).toFixed(2) + 'x', '|',
    dmg.toFixed(2) + 'x', '|',
    rNo.toFixed(0) + '/' + rYes.toFixed(0), '|',
    (rYes / rNo).toFixed(2), '|',
    '2.15~2.26x'
  );
}

console.log('\n=== 单体重击直观对比：同等级(level=8) 有/无 热能爆炸(bl5) ===');
console.log('无热能爆炸半径 =', radiusAt(8, 0), '| 热能爆炸 bl5 半径 =', radiusAt(8, 5), '（缩小到', (radiusAt(8,5)/radiusAt(8,0)*100).toFixed(0) + '%）');
console.log('=> 每次选 热能爆炸 卡，半径净减 (40-20)=20px/级，取舍在每一次选卡时都肉眼可见');

console.log('\n=== 情境分支（非纯数值）===');
console.log('破甲 armorBreak：爆炸使范围内敌人受伤 +8%*bl（bl5=+40%，持续 1.5s）');
console.log('引燃 ignite：灼烧伤害 +20%*bl（bl5=2.49x），只增伤、不延长持续时长（固定 1.5s）');
console.log('焚身 incinerate：对引燃目标即时追加 3%*bl 最大生命伤害（bl5=15% 最大生命）');

console.log('\n=== 与火力强化家族同量级校验（bl5 纯进攻主维度）===');
console.log('火力强化三进攻：2.15 / 2.20 / 2.26x');
console.log('爆炸弹进攻主维度：富燃料', Math.pow(1.20,5).toFixed(2)+'x', '| 热能爆炸 单体重伤', Math.pow(1.38,5).toFixed(2)+'x');
console.log('范围扩大由基础等级(40+level*20)决定并叠加热能爆炸平减；破甲(bl5)+40%受伤、引燃(bl5)2.49x灼烧，配合 AoE/灼烧链，无严格主导分支。');
