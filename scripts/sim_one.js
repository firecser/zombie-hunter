// 单局详细轨迹调试
const SPEED = { normal: 0.5, fast: 1.2, tank: 0.35, boss: 0.3 };
const ZTYPE = {
  normal: { health: 30, radius: 22, damage: 10 },
  fast:   { health: 20, radius: 18, damage: 8  },
  tank:   { health: 80, radius: 30, damage: 20 },
  boss:   { health: 200, radius: 42, damage: 30 },
};
const WAVE_COUNT = 20, DT = 1000 / 60, SW = 720, SH = 1280, PX = SW / 2, PY = SH - 80, PR = 22;
const waves = [];
for (let i = 1; i <= WAVE_COUNT; i++) {
  const gap = 8000 + (i - 1) * 900;
  const count = Math.round(8 + (i - 1) * 1.7);
  waves.push({ i, gap, count, tankChance: Math.min(0.05 + i * 0.012, 0.35), fastChance: Math.min(0.12 + i * 0.01, 0.35), boss: i % 5 === 0 });
}
let zombies = [], gameTime = 0, currentWave = 0, nextWaveAt = 1500, waveActive = false, cleared = 0;
let p = { health: 100, maxHealth: 100, level: 1, exp: 0, expToLevel: 50, damage: 10, fireRate: 500, lastShot: -9999, kills: 0 };
function spawn(w) {
  for (let s = 0; s < w.count; s++) {
    let type = 'normal';
    if (w.boss && s === 0) type = 'boss';
    else {
      const r = Math.random();
      if (r < w.tankChance) type = 'tank';
      else if (r < w.tankChance + w.fastChance) type = 'fast';
    }
    const tpl = ZTYPE[type];
    const hm = (1 + gameTime / 1000 / 150);
    zombies.push({ x: Math.random() * SW, y: -50, speed: SPEED[type], health: tpl.health * hm, maxHealth: tpl.health * hm, damage: tpl.damage, radius: tpl.radius, type });
  }
}
let frames = 0;
while (frames < 60 * 60 * 12) {
  frames++;
  gameTime += DT;
  if (currentWave < WAVE_COUNT && !waveActive && gameTime >= nextWaveAt) {
    currentWave++;
    spawn(waves[currentWave - 1]);
    waveActive = true;
  }
  if (zombies.length > 0) {
    let n = null, md = 1e9;
    for (const z of zombies) {
      const d = Math.hypot(z.x - PX, z.y - PY);
      if (d < md) { md = d; n = z; }
    }
    if (gameTime - p.lastShot >= p.fireRate) {
      p.lastShot = gameTime;
      if (n) {
        n.health -= p.damage;
        if (n.health <= 0) {
          zombies = zombies.filter(z => z !== n);
          p.kills++;
        }
      }
    }
  }
  for (const z of zombies) {
    const ang = Math.atan2(PY - z.y, PX - z.x);
    z.x += Math.cos(ang) * z.speed;
    z.y += Math.sin(ang) * z.speed;
    const dist = Math.hypot(PX - z.x, PY - z.y);
    if (dist < PR + z.radius) {
      z.x += Math.cos(ang) * 8;
      z.y += Math.sin(ang) * 8;
      p.health -= z.damage * 0.03;
      if (p.health <= 0) {
        console.log('DIED wave', currentWave, 'hp', p.health.toFixed(1), 'alive', zombies.length, 'lvl', p.level, 'dmg', p.damage.toFixed(1), 't', (gameTime / 1000).toFixed(0));
        process.exit(0);
      }
    }
  }
  if (waveActive && zombies.length === 0) {
    waveActive = false;
    cleared++;
    if (p.level < 20) {
      p.exp += p.expToLevel;
      p.level++;
      p.expToLevel = Math.floor(p.expToLevel * 1.3);
      p.damage *= 1.14;
    }
    if (cleared >= WAVE_COUNT) {
      console.log('WIN t', (gameTime / 1000).toFixed(0), 'hp', p.health.toFixed(0));
      process.exit(0);
    }
    nextWaveAt = gameTime + waves[currentWave - 1].gap;
    console.log('wave', currentWave, 'cleared hp', p.health.toFixed(0), 'lvl', p.level, 'dmg', p.damage.toFixed(1), 'count', waves[currentWave - 1].count, 't', (gameTime / 1000).toFixed(0));
  }
}
console.log('TIMEOUT');
