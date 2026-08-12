// 波次系统模拟器 v2：重叠波次 + 固定5分钟出怪时间轴 + 每波清完刚好升1级
// 验证「20波/间隔递增/数量递增/每波升1级(19次三选一)/慢速僵尸」是否可通关
const WAVE_COUNT = 20;
const DT = 1000 / 60, SW = 720, SH = 1280, PX = SW / 2, PY = SH - 80, PR = 22;
const SPEED = { normal: 0.5, fast: 1.2, tank: 0.35, boss: 0.3 };
const ZTYPE = {
  normal: { health: 30, radius: 22, damage: 10 },
  fast:   { health: 20, radius: 18, damage: 8  },
  tank:   { health: 80, radius: 30, damage: 20 },
  boss:   { health: 200, radius: 42, damage: 30 },
};

// 波次配置：间隔递增、数量递增、每5波1Boss
function buildSchedule() {
  const waves = [];
  let t = 1500;
  for (let i = 1; i <= WAVE_COUNT; i++) {
    const gap = 6500 + (i - 1) * 850;        // 间隔越来越长
    const count = Math.round(8 + (i - 1) * 1.7); // 数量越来越多
    const tankChance = Math.min(0.05 + i * 0.012, 0.35);
    const fastChance = Math.min(0.12 + i * 0.010, 0.35);
    waves.push({ i, t, gap, count, tankChance, fastChance, boss: i % 5 === 0 });
    t += gap;
  }
  return waves;
}

function runSim({ hpGrow = 150, healthMult = 1, speedMult = 1, aoe = 1, label = '' }) {
  const waves = buildSchedule();
  let zombies = [], gameTime = 0;
  let wavesSpawned = 0, clearedWaves = 0, levelUps = 0;
  let waveAlive = {};           // 每波存活数
  let waveAwarded = {};         // 该波是否已发经验
  let nextWaveIdx = 0;          // 下一个待生成波次下标
  let p = { health: 100, level: 1, exp: 0, expToLevel: 50, damage: 10, fireRate: 500, lastShot: -9999, kills: 0 };
  const spawnWave = (w) => {
    waveAlive[w.i] = 0;
    for (let s = 0; s < w.count; s++) {
      let type = 'normal';
      if (w.boss && s === 0) type = 'boss';
      else {
        const r = Math.random();
        if (r < w.tankChance) type = 'tank';
        else if (r < w.tankChance + w.fastChance) type = 'fast';
      }
      const tpl = ZTYPE[type];
      const hm = (1 + gameTime / 1000 / hpGrow) * healthMult;
      zombies.push({ x: Math.random() * SW, y: -50, speed: SPEED[type] * speedMult, health: tpl.health * hm, maxHealth: tpl.health * hm, damage: tpl.damage, radius: tpl.radius, type, wave: w.i });
      waveAlive[w.i]++;
    }
  };
  const killZombie = (idx) => {
    const z = zombies[idx];
    zombies.splice(idx, 1);
    p.kills++;
    waveAlive[z.wave]--;
    if (waveAlive[z.wave] <= 0 && !waveAwarded[z.wave]) {
      waveAwarded[z.wave] = true;
      clearedWaves++;
      if (p.level < 20) {
        p.exp += p.expToLevel;       // 刚好够升一级
        p.level++;
        p.expToLevel = Math.floor(p.expToLevel * 1.3);
        p.damage *= 1.14;            // 火力强化每级
        levelUps++;
      }
    }
  };
  let frames = 0;
  while (frames < 60 * 60 * 15) {
    frames++;
    gameTime += DT;
    // 按时间轴生成下一波
    if (nextWaveIdx < WAVE_COUNT && gameTime >= waves[nextWaveIdx].t) {
      spawnWave(waves[nextWaveIdx]);
      wavesSpawned++;
      nextWaveIdx++;
    }
    // 自动射击（单体，aoe 模拟溅射倍率：命中时额外对附近造成 aoe 比例伤害）
    if (zombies.length > 0) {
      let n = -1, md = 1e9;
      for (let k = 0; k < zombies.length; k++) {
        const d = Math.hypot(zombies[k].x - PX, zombies[k].y - PY);
        if (d < md) { md = d; n = k; }
      }
      if (gameTime - p.lastShot >= p.fireRate) {
        p.lastShot = gameTime;
        if (n >= 0) {
          const dmg = p.damage;
          zombies[n].health -= dmg;
          if (aoe > 1) {
            for (const z of zombies) {
              if (z === zombies[n]) continue;
              const dd = Math.hypot(z.x - zombies[n].x, z.y - zombies[n].y);
              if (dd < 60) z.health -= dmg * aoe * 0.5;
            }
          }
          for (let k = zombies.length - 1; k >= 0; k--) {
            if (zombies[k].health <= 0) killZombie(k);
          }
        }
      }
    }
    // 移动 + 贴身掉血
    for (const z of zombies) {
      const ang = Math.atan2(PY - z.y, PX - z.x);
      z.x += Math.cos(ang) * z.speed;
      z.y += Math.sin(ang) * z.speed;
      const dist = Math.hypot(PX - z.x, PY - z.y);
      if (dist < PR + z.radius) {
        z.x += Math.cos(ang) * 8; z.y += Math.sin(ang) * 8;
        p.health -= z.damage * 0.03;
        if (p.health <= 0) return { win: false, wave: wavesSpawned, t: gameTime / 1000, levelUps };
      }
    }
    if (wavesSpawned >= WAVE_COUNT && zombies.length === 0) {
      return { win: true, wave: WAVE_COUNT, t: gameTime / 1000, levelUps, health: p.health };
    }
  }
  return { win: false, wave: wavesSpawned, t: gameTime / 1000, levelUps, reason: 'timeout' };
}

function trial(opts, n = 40) {
  let wins = 0; const clears = [];
  for (let k = 0; k < n; k++) {
    const r = runSim(opts);
    if (r.win) { wins++; clears.push(r.t); }
  }
  clears.sort((a, b) => a - b);
  return { wins, n, med: clears.length ? clears[Math.floor(clears.length / 2)] : null, min: clears[0], max: clears[clears.length - 1] };
}

console.log('=== 波次系统模拟 v2（重叠波次/5分钟时间轴）===');
console.log('保守下界 纯单体(aoe=1):', JSON.stringify(trial({ aoe: 1 })));
console.log('含爆炸弹溅射(aoe=2):  ', JSON.stringify(trial({ aoe: 2 })));
console.log('含爆炸弹溅射(aoe=3):  ', JSON.stringify(trial({ aoe: 3 })));
console.log('\n=== 敏感度（speedMult / hpGrow，aoe=2）===');
for (const sm of [1.0, 1.25, 1.5]) {
  for (const hg of [150, 100, 50]) {
    const r = trial({ aoe: 2, speedMult: sm, hpGrow: hg }, 20);
    console.log(`speedMult=${sm} hpGrow=${hg} -> ${r.wins}/${r.n} 中位${(r.med||0).toFixed(0)}s`);
  }
}
