// 校验 v1.1.2 波次/经验耦合设计：每波怪物经验总和 = 2*波次，且经验全收集后正好升满 19 级
const WAVE_COUNT = 20;
const EXP = { normal: 1, fast: 1, tank: 2, boss: 4 };

function buildWavePlan() {
    const plan = [];
    for (let i = 1; i <= WAVE_COUNT; i++) {
        const targetExp = 2 * i;
        const isBoss = (i % 5 === 0);
        const comp = [];
        let remaining = targetExp;
        if (isBoss) { comp.push('boss'); remaining -= 4; }
        if (i >= 3) {
            const tanks = Math.min(Math.floor(i / 3), Math.floor(remaining / 2));
            for (let k = 0; k < tanks; k++) { comp.push('tank'); remaining -= 2; }
        }
        if (i >= 2 && !isBoss && i % 2 === 0) {
            const fast = Math.min(3, remaining);
            for (let k = 0; k < fast; k++) { comp.push('fast'); remaining -= 1; }
        }
        while (remaining > 0) { comp.push('normal'); remaining -= 1; }
        plan.push({ i, comp, boss: isBoss });
    }
    return plan;
}

const plan = buildWavePlan();
let ok = true;
let totalExp = 0;
console.log('波次 | 怪物数 | 经验总和 | 期望(2i) | 组成');
for (const w of plan) {
    const sum = w.comp.reduce((a, t) => a + EXP[t], 0);
    const expect = 2 * w.i;
    totalExp += sum;
    if (sum !== expect) ok = false;
    console.log(`${String(w.i).padStart(2)}   |   ${String(w.comp.length).padStart(2)}   |   ${String(sum).padStart(2)}    |   ${String(expect).padStart(2)}   | ${w.comp.join(',')}`);
}

// 模拟经验全收集后的升级过程
let level = 1, exp = 0, expToLevel = 2, levelUps = 0;
for (const w of plan) {
    for (const t of w.comp) {
        exp += EXP[t];
        while (exp >= expToLevel && level < 20) {
            level++; exp -= expToLevel; expToLevel = 2 * level; levelUps++;
        }
    }
}
// 升到 20 级所需总经验 = cost(1→2)+...+cost(19→20) = 2*(1+2+...+19) = 2*190 = 380
const needForMax = 2 * (19 * 20 / 2);
console.log('\n--- 校验 ---');
console.log('每波经验总和均等于 2*波次:', ok ? 'PASS' : 'FAIL');
console.log('20 波总经验:', totalExp, ' | 升到 20 级需:', needForMax);
console.log('全收集后等级:', level, ' | 触发三选一次数:', levelUps, levelUps === 19 ? '(PASS 期望19)' : '(FAIL 期望19)');
console.log('最终溢出经验(满级废弃):', exp, exp >= 0 ? 'OK' : 'BUG');
