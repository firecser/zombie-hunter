// 五行极简 v2.2 · P6 真实数值校准模拟器
//
// 与 sim_v22.js 的区别：血量/出怪不再用纸面尺度，而是**完全复刻线上**：
//   · 每波总血 = round(624 × 1.6^(w-1) / 312) × 312，贪心拆成 boss/giant/tank/normal
//   · 单只血 = zombieTypes[type].health × stage.healthMult（dmgCouple 在 v2.2 恒≈1）
//   · 出怪时间轴 = max(900, (300000-1500)/总怪数) 的等间隔 + 波间 1200ms
//   · 玩家 DPS = (40 + atkFlat + E_BASE[el]×1.15^(lv-1)) × K × (克制?AOE:1)
//   · 漏怪 → HP 积压 → 城墙按 每只 avgDmg×0.03/s 掉血
//
// 输出：6 档关卡 × 3 种操作（错配 / 克制未养成 / 克制+养成）的通关或崩盘时间。

const GAME_TIME_LIMIT = 300;          // s
const WALL_BASE = 2000;               // 城墙基础血
const WAVE_COUNT = 20;

const TYPE = {
    normal: { hp: 90,   dmg: 10 },
    fast:   { hp: 85,   dmg: 8  },
    tank:   { hp: 360,  dmg: 20 },
    giant:  { hp: 1800, dmg: 35 },
    boss:   { hp: 9000, dmg: 50 }
};
// P9e-1：移速（px/帧）。注意 updateZombies 是「每帧加一次」，不是每秒
const SPEED = { normal: 1.7, fast: 2.7, tank: 1.1, giant: 0.9, boss: 0.75 };
const FPS = 60;
const FIELD_PX = 600;          // 出生到城墙的竖直距离
const WAVE_GROWTH = 1.25;      // P6(A)：1.6 → 1.25
const UNIT = 90;               // 最小体型粒度
const BOSS_WAVES = [13, 17, 20];
const SPAWN_GAP = 1100;        // P6(A)：900 → 1100ms
const RESTRAIN = { '金': '火', '木': '金', '土': '木', '水': '土', '火': '水' };
const E_BASE = { '金': 300, '火': 240, '木': 180, '土': 170, '水': 170 };
const AOE = { '金': 1.4, '火': 1.6, '木': 1.0, '土': 1.0, '水': 1.0 };
const AUTO_DPS = 40;
const RESTRAINT_MULT = 2.5;
const MISMATCH_MULT = 0.2;

// ---- 关卡基线（复刻 buildStages）----
const TALENT_CHAPTERS = [2, 4, 6, 8, 10];
// P9e-4：章节 HP 倍率（补偿新机制带来的 6.5×/21× DPS 成长）
const CHAPTER_HP = [1, 1.15, 1.35, 1.7, 2.1, 2.6, 3.2, 4.0, 5.4, 7.2];
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function stageOf(lv) {
    const ch = Math.ceil(lv / 6), lvInCh = ((lv - 1) % 6) + 1;
    const base = Math.pow(1.03, ch - 1);
    const within = 1 + 0.025 * (lvInCh - 1);
    const breather = (TALENT_CHAPTERS.includes(ch) && lvInCh === 1) ? 0.85 : 1;
    const climax = (lvInCh === 6) ? 1.05 : 1;
    const D = base * within * breather * climax * (ch === 1 ? 0.75 : 1) * CHAPTER_HP[ch - 1];   // 第1章教学再降 25%
    return { lv, ch, lvInCh, healthMult: r2(D), damageMult: r2(clamp(D * 0.62, 0.6, 2.6)) };
}

// ---- 出怪表（复刻 buildWavePlan）----
function buildWaves() {
    const plan = [];
    for (let i = 1; i <= WAVE_COUNT; i++) {
        const targetHP = 624 * Math.pow(WAVE_GROWTH, i - 1);
        const isBoss = (BOSS_WAVES.indexOf(i) >= 0) && (targetHP >= 9000);
        let hp = Math.round(targetHP / UNIT) * UNIT;
        const comp = [];
        if (isBoss) { comp.push('boss'); hp -= 9000; }
        for (const [t, h] of [['giant', 1800], ['tank', 360], ['normal', 90]]) {
            while (hp >= h) { comp.push(t); hp -= h; }
        }
        while (hp > 0) { comp.push('normal'); hp -= UNIT; }
        plan.push({ i, comp, boss: isBoss });
    }
    const totalCount = plan.reduce((s, w) => s + w.comp.length, 0);
    const interval = Math.max(SPAWN_GAP, (GAME_TIME_LIMIT * 1000 - 1500) / totalCount);
    let t = 1500;
    for (const w of plan) {
        w.spawnAt = t;
        w.interval = interval;
        w.duration = Math.max(1, w.comp.length * interval) / 1000;   // s
        t += w.comp.length * interval + 1200;
        w.endAt = t / 1000;
    }
    return plan;
}
const WAVES = buildWaves();

// ---- 关卡怪物元素（复刻 P5 教学章 + 章节元素）----
const CH_ELEMENT = { 1: 'normal', 2: '水', 3: '木', 4: '火', 5: '金', 6: '土' };
const CH_DUAL = { 7: ['金', '水'], 8: ['火', '土'], 9: ['木', '火'], 10: ['水', '木'] };
function teachingWaveElements(lv) {
    if (lv > 6) return null;
    if (lv === 1) { const a = []; for (let i = 0; i < 20; i++) a.push(i < 10 ? '金' : '火'); return a; }
    const pool = lv === 2 ? ['金', '火', '土'] : lv === 3 ? ['金', '火', '土', '水'] : ['金', '火', '土', '水', '木'];
    const a = []; for (let i = 0; i < 20; i++) a.push(pool[i % pool.length]); return a;
}
function waveMonsterElements(lv, waveIdx) {
    const te = teachingWaveElements(lv);
    if (te) return [te[waveIdx - 1]];
    const ch = Math.ceil(lv / 6);
    if (CH_DUAL[ch]) return CH_DUAL[ch];
    return [CH_ELEMENT[ch]];
}

// ---- 玩家 DPS ----
// mode: 'mismatch'（全程错配某元素）| 'counter'（按目标元素切克制）
// activeEl：玩家当前选中的元素；st：目标怪物元素
function dpsFor(st, activeEl, elLv, atkFlat) {
    const base = AUTO_DPS + atkFlat + E_BASE[activeEl] * Math.pow(1.15, elLv - 1);
    if (activeEl === RESTRAIN[st]) return base * RESTRAINT_MULT * (AOE[activeEl] || 1);  // 克制
    if (activeEl === st) return base * MISMATCH_MULT;                                     // 错配
    return base;                                                                          // 中性
}

// ---- P9e-3：玩家画像（把弹道 / 词条 / 连杀 / 引爆折算成 DPS 系数）----
const PROFILES = {
    novice:  { label: '新手', elLv: 1, bullets: 1, perkMul: 1.00, combo: 0,  detonate: 0.00 },
    skilled: { label: '熟练', elLv: 5, bullets: 3, perkMul: 1.35, combo: 8,  detonate: 0.10 },
    maxed:   { label: '满配', elLv: 9, bullets: 6, perkMul: 1.60, combo: 17, detonate: 0.12 }
};
// 0.98 = 眩晕停火（0.7s / 约 7s 一次）的期望损失
function profileMul(p) {
    if (!p) return 1;
    const comboMul = 1 + Math.min(1, p.combo * 0.06);
    return p.bullets * p.perkMul * comboMul * (1 + p.detonate) * 0.98;
}

// ---- 主模拟 ----
function run(lv, opts) {
    const st = stageOf(lv);
    const mode = opts.mode || 'counter';
    const elLvAll = opts.profile ? opts.profile.elLv : (opts.elLv || 1);
    const atkFlat = opts.atkFlat || 0;
    const wallMax = WALL_BASE + (opts.wallHp || 0);
    let wall = wallMax;

    const dt = 0.25;
    let t = 0, backlogHP = 0, lastWave = -1;
    let curR = 0, curDPS = 0, curAvgHP = 1, curAvgDmg = 0.1;
    const log = [];

    while (t < GAME_TIME_LIMIT) {
        // 切波：重算该波的出怪 HP 速率与平均属性
        let wi = -1;
        for (let i = 0; i < WAVES.length; i++) {
            if (t >= WAVES[i].spawnAt / 1000 && t < WAVES[i].endAt) { wi = i; break; }
        }
        if (wi !== lastWave && wi >= 0) {
            lastWave = wi;
            const w = WAVES[wi];
            const els = waveMonsterElements(lv, w.i);
            let totalHP = 0, totalDmg = 0, n = 0;
            const hpByEl = {};
            for (const type of w.comp) {
                const hp = TYPE[type].hp * st.healthMult;
                const el = els[n % els.length];
                totalHP += hp;
                totalDmg += TYPE[type].dmg * st.damageMult;
                hpByEl[el] = (hpByEl[el] || 0) + hp;
                n++;
            }
            curR = totalHP / w.duration;
            curAvgHP = totalHP / Math.max(1, w.comp.length);
            curAvgDmg = totalDmg / Math.max(1, w.comp.length);
            // 元素按血量占比加权 DPS
            //   counter  ：每个怪都切到它的克制元素（smart play）
            //   mismatch ：全程固定一个元素（模拟不会玩 / 乱点）
            let wdps = 0;
            for (const el in hpByEl) {
                // 错配模式：玩家始终用「怪物自身元素」→ 稳定 ×0.2（真正的最差操作）
                const activeEl = (mode === 'counter') ? RESTRAIN[el] : el;
                wdps += (hpByEl[el] / totalHP) * dpsFor(el, activeEl, elLvAll, atkFlat);
            }
            curDPS = wdps * profileMul(opts.profile);
        }

        const net = curR - curDPS;
        if (net > 0) backlogHP += net * dt;
        else backlogHP = Math.max(0, backlogHP + net * dt);   // net<0 → 消化积压

        if (backlogHP > 0) {
            const stuck = backlogHP / Math.max(1, curAvgHP);   // 积压折算成「贴墙怪数量」
            wall -= stuck * curAvgDmg * 0.03 * dt;             // 每只每 0.5s 啄 0.015×dmg → 0.03/s
            if (wall <= 0) return { lv, mode, collapse: Math.round(t), wall: 0, R: Math.round(curR), DPS: Math.round(curDPS), avgHP: Math.round(curAvgHP), win: false };
        }
        t += dt;
    }
    return { lv, mode, collapse: null, wall: Math.round(wall), R: Math.round(curR), DPS: Math.round(curDPS), avgHP: Math.round(curAvgHP), win: true };
}

function fmt(r) {
    const tag = r.win ? 'WIN ' : ('崩 ' + r.collapse + 's');
    return `${tag.padEnd(8)} 墙血剩 ${String(r.wall).padStart(5)} | 末段 R=${r.R}HP/s  vs  DPS=${r.DPS}  平均血=${r.avgHP}`;
}

console.log('=========== v2.2 P6 真实数值校准（真实出怪表 + 真实血量） ===========');
console.log('波1 总血=624  BOSS 波次=13/17/20  波20≈624×1.25^19≈4.3万\n');
console.log('移速（px/帧 → px/s → 横穿 ' + FIELD_PX + 'px 耗时）：');
for (const k in SPEED) {
    const pxs = SPEED[k] * FPS;
    console.log('  ' + k + ': ' + SPEED[k] + ' → ' + pxs + 'px/s → ' + (FIELD_PX / pxs).toFixed(1) + 's');
}
console.log('  （玩家 480px/s，普通怪速度差 ' + (480 / (SPEED.normal * FPS)).toFixed(1) + ' 倍）\n');

const TIERS = [
    { lv: 1,  name: 'L1  教学·金→火' },
    { lv: 4,  name: 'L4  全5开' },
    { lv: 13, name: 'L13 相生教学' },
    { lv: 30, name: 'L30 中期' },
    { lv: 55, name: 'L55 后期' },
    { lv: 60, name: 'L60 终章' }
];

for (const T of TIERS) {
    console.log(`\n—— ${T.name}（healthMult=${stageOf(T.lv).healthMult}, dmgMult=${stageOf(T.lv).damageMult}）——`);
    // 1) 全程错配：固定用金（对多数怪非克制）
    console.log('  错配(固定金)        ' + fmt(run(T.lv, { mode: 'mismatch', el: '金', elLv: 1 })));
    // 2) 克制但零养成
    console.log('  克制·零养成 lv1     ' + fmt(run(T.lv, { mode: 'counter', elLv: 1, atkFlat: 0 })));
    // 3) 克制 + 养成（按关卡进度给元素等级与树攻击）
    const grow = { 1: [1, 0], 4: [2, 8], 13: [4, 24], 30: [6, 40], 55: [8, 60], 60: [10, 84] }[T.lv] || [1, 0];
    console.log('  克制·养成 lv' + String(grow[0]).padEnd(2) + '/atk' + String(grow[1]).padEnd(3) + '  ' + fmt(run(T.lv, { mode: 'counter', elLv: grow[0], atkFlat: grow[1] })));
}

console.log('\n说明：墙血 2000，未计木连携回血 / 土减伤 / 炸弹；真实局内会略宽松。');

// =========== P9e-3：三档玩家画像（克制操作 × 新机制系数） ===========
console.log('\n\n=========== P9e-3 玩家画像（克制操作）===========');
for (const T of TIERS) {
    console.log(`\n—— ${T.name}（healthMult=${stageOf(T.lv).healthMult}）——`);
    for (const k in PROFILES) {
        const p = PROFILES[k];
        const r = run(T.lv, { mode: 'counter', profile: p });
        const mul = profileMul(p).toFixed(2);
        console.log(`  ${p.label}（弹道${p.bullets}×词条${p.perkMul}×连杀${p.combo}）系数 ${mul} → ${fmt(r)}`);
    }
}
