// 第一关模拟器 v2：参数化出怪机制，用于多角度难度扫描。
// 对比维度（均为"机制级"，非单纯怪物倍率）：
//   stage.hpGrow      : 血量膨胀分母（旧硬编码 50）→ 越大膨胀越平缓
//   stage.spawnFloor  : 刷怪间隔下限 ms（旧硬编码 400）→ 越大密度上限越低
//   stage.spawnDecay  : 每次刷怪间隔收窄量 ms（旧硬编码 8）→ 越小越晚变密
//   expBase/expGrow   : 升级所需经验基数/增长（旧 50 / 1.3）→ 加速玩家成长以跟上膨胀

function runSim(opts) {
  const screenWidth = 390, screenHeight = opts.screenHeight || 2532;
  let seed = opts.seed || 1;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  const GAME_TIME_LIMIT = 300000;
  const stage = Object.assign({ spawnMult: 0.9, healthMult: 1.0, damageMult: 1.0, bossTime: 240,
    tankChance: 0.10, fastChance: 0.15, speedMult: 1.0, hpGrow: 50, spawnFloor: 400, spawnDecay: 8 }, opts.stage || {});
  const zombieTypes = {
    normal: { health: 30, speed: 1.5, damage: 10, radius: 22, exp: 10 },
    fast:   { health: 20, speed: 3,   damage: 8,  radius: 18, exp: 15 },
    tank:   { health: 80, speed: 1,   damage: 20, radius: 30, exp: 25 },
    boss:   { health: 200, speed: 0.8, damage: 30, radius: 42, exp: 100 }
  };
  const expBase = opts.expBase || 50, expGrow = opts.expGrow || 1.3;
  const player = { x: screenWidth/2, y: screenHeight-80, radius: 22, maxHealth: 100, health: 100,
    damage: 10, fireRate: 500, level: 1, exp: 0, expToLevel: expBase, kills: 0 };
  let explosiveLevel = 0;
  const mode = opts.mode || 'pure_damage';
  let zombies = [], gameTime = 0, spawnTimer = 0, spawnInterval = 1500, lastShot = 0;
  const dt = 16.67; let collapseTime = null;
  const snaps = []; let nextSnap = 0;

  function lvlUp() {
    while (player.exp >= player.expToLevel) {
      player.level++; player.exp -= player.expToLevel; player.expToLevel = Math.floor(player.expToLevel * expGrow);
      if (mode === 'pure_damage') player.damage *= 1.14;
      else { if (explosiveLevel === 0 && player.level === 2) explosiveLevel = 1;
        else if (rnd() < 0.65) player.damage *= 1.14; else explosiveLevel++; }
    }
  }
  while (gameTime < GAME_TIME_LIMIT) {
    gameTime += dt; const gts = gameTime/1000;
    spawnTimer += dt; let sm = stage.spawnMult, spawnCount = 1;
    const rem = GAME_TIME_LIMIT - gameTime;
    if (rem <= 30000 && rem > 0) { const p = 1 - rem/30000; sm *= (1+p*1.5); if (p>0.6) spawnCount=2; if (p>0.85) spawnCount = 2+Math.floor(rnd()*2); }
    if (spawnTimer >= spawnInterval/sm) {
      spawnTimer = 0; spawnInterval = Math.max(stage.spawnFloor, spawnInterval - stage.spawnDecay);
      for (let s=0;s<spawnCount;s++){
        const x=rnd()*screenWidth, y=-50; let type='normal'; const roll=rnd();
        const bossChance=0, tankChance=gts>60?stage.tankChance:stage.tankChance*0.5, fastChance=stage.fastChance;
        if (gts>60 && roll<bossChance+tankChance) type='tank';
        else if (roll<bossChance+tankChance+fastChance) type='fast';
        const t=zombieTypes[type]; const hm=(1+gts/stage.hpGrow)*stage.healthMult;
        zombies.push({x,y,type,speed:t.speed*stage.speedMult,health:t.health*hm,maxHealth:t.health*hm,damage:t.damage*stage.damageMult,radius:t.radius});
      }
    }
    for (const z of zombies) { const a=Math.atan2(player.y-z.y,player.x-z.x); z.x+=Math.cos(a)*z.speed; z.y+=Math.sin(a)*z.speed;
      const d=Math.hypot(player.x-z.x,player.y-z.y);
      if (d<player.radius+z.radius){ const pa=Math.atan2(z.y-player.y,z.x-player.x); z.x+=Math.cos(pa)*8; z.y+=Math.sin(pa)*8; if(player.health>0) player.health-=z.damage*0.03; } }
    if (gameTime-lastShot>=player.fireRate){ lastShot=gameTime; let tg=null,td=1e9;
      for (const z of zombies){ const d=Math.hypot(player.x-z.x,player.y-z.y); if(d<td){td=d;tg=z;} }
      if (tg){ tg.health-=player.damage; if (explosiveLevel>0){ const er=40+explosiveLevel*20; for (const z of zombies) if(z!==tg&&Math.hypot(tg.x-z.x,tg.y-z.y)<er) z.health-=player.damage; } } }
    for (let i=zombies.length-1;i>=0;i--){ if (zombies[i].health<=0){ player.exp+=zombieTypes[zombies[i].type].exp; player.kills++; zombies.splice(i,1); lvlUp(); } }
    if (player.health<=0){ collapseTime=Math.floor(gameTime/1000); break; }
    if (gameTime>=nextSnap && snaps.length<40){ nextSnap+=10000;
      snaps.push({t:Math.floor(gameTime/1000),z:zombies.length,lv:player.level,dmg:Math.round(player.damage*10)/10,avgHp:Math.round(zombies.reduce((a,z)=>a+z.maxHealth,0)/(zombies.length||1)),hp:Math.round(player.health)}); }
  }
  return { collapseTime, won: collapseTime===null, snaps, finalZ:zombies.length, finalLv:player.level, finalDmg:Math.round(player.damage*10)/10, finalHp:Math.round(player.health) };
}
function median(a){ a=a.slice().sort((x,y)=>x-y); return a[Math.floor(a.length/2)]; }
function scan(label, opts){
  const cs=[]; for(let s=1;s<=8;s++){ const r=runSim(Object.assign({seed:s},opts)); cs.push(r.collapseTime===null?300:r.collapseTime); }
  console.log(`\n[${label}] 崩盘中位数=${median(cs)}s (300=通关) | seeds: ${cs.join(',')}`);
  return cs;
}

console.log('================ 第一关 多角度难度扫描 ================');
scan('BASELINE(旧机制: hpGrow50/floor400/decay8/exp50-1.3)', { mode:'pure_damage', stage:{} });
scan('A 温和: hpGrow150/floor650/decay4/exp42-1.26', { mode:'pure_damage', stage:{hpGrow:150,spawnFloor:650,spawnDecay:4}, expBase:42, expGrow:1.26 });
scan('B 更温和: hpGrow200/floor700/decay3/exp38-1.22', { mode:'pure_damage', stage:{hpGrow:200,spawnFloor:700,spawnDecay:3}, expBase:38, expGrow:1.22 });
scan('C 中: hpGrow120/floor600/decay5/exp45-1.28', { mode:'pure_damage', stage:{hpGrow:120,spawnFloor:600,spawnDecay:5}, expBase:45, expGrow:1.28 });

// 选定方案后打印详细时间线（用 A：温和）
const r = runSim({ seed:1, mode:'pure_damage', stage:{hpGrow:150,spawnFloor:650,spawnDecay:4}, expBase:42, expGrow:1.26 });
console.log('\n--- 选定方案A 详细时间线 (seed=1) | t秒 z存活 lv等级 dmg单发 avgHp平均血 hp血 ---');
for (const s of r.snaps) console.log(`t=${s.t}\tz=${String(s.z).padStart(3)}\tlv=${s.lv}\tdmg=${s.dmg}\tavgHp=${s.avgHp}\thp=${String(s.hp).padStart(3)}`);
console.log(`结局: ${r.won?'撑满300s胜利':'崩盘@'+r.collapseTime+'s'} | z=${r.finalZ} lv=${r.finalLv} dmg=${r.finalDmg} hp=${r.finalHp}`);

// —— 补充：机制字段（A）但保留旧升级曲线，看 exp 加速是否必要 ——
console.log('\n================ 补充验证 ================');
scan('A机制+旧exp(50/1.3): hpGrow150/floor650/decay4', { mode:'pure_damage', stage:{hpGrow:150,spawnFloor:650,spawnDecay:4} });
scan('仅改膨胀 hpGrow150(其余旧): 看单一维度贡献', { mode:'pure_damage', stage:{hpGrow:150} });
scan('仅改刷怪 floor650/decay4(膨胀旧): 看单一维度贡献', { mode:'pure_damage', stage:{spawnFloor:650,spawnDecay:4} });
