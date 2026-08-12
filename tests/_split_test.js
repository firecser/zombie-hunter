
// ---- 桩全局 ----
let screenWidth = 720, screenHeight = 1280;
const _sk = {};
['explosive','lightning','piercing','crit','freeze','slow','oil','mine','tornado','shield','damage','bulletCount','bulletSpeed','fireRate','bomb','multishot'].forEach(function(k){ _sk[k]={level:0}; });
const skills = _sk;
let bullets = [], zombies = [];
const player = { x:100, y:100, bulletSpeed:10, bulletPiercing:1, damage:10, gunAngle:0, _splitOnHit:true };

// 桩函数
function damageZombie(z,d,c,e){ z.health -= d; }
function checkCombos(){}
function createCritEffect(){} function createExplosion(){} function createLightning(){}
function createFreezeEffect(){} function createSlowEffect(){}
function getCritChance(){return 0;} function getCritMult(){return 2;} function getFreezeChance(){return 0;}
function getFreezeDuration(){return 1000;} function getSlowChance(){return 0;} function getSlowFactor(){return 0.5;}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        
        if (bullet.x < 0 || bullet.x > screenWidth || bullet.y < 0 || bullet.y > screenHeight) {
            bullets.splice(i, 1);
            continue;
        }
        
        for (let j = zombies.length - 1; j >= 0; j--) {
            const zombie = zombies[j];
            const dist = Math.hypot(bullet.x - zombie.x, bullet.y - zombie.y);
            
            if (bullet.hitZombies.includes(zombie)) continue;
            
            if (dist < bullet.radius + zombie.radius) {
                const isFirstHit = bullet.hitZombies.length === 0;
                bullet.hitZombies.push(zombie);

                let damage = bullet.damage;
                let isCrit = false;
                // 暴击（天赋基础值 + 局内「致命暴击」）
                const critChance = getCritChance();
                if (critChance > 0 && Math.random() < critChance) {
                    damage *= getCritMult();
                    isCrit = true;
                    createCritEffect(zombie.x, zombie.y);
                }

                // 爆炸伤害
                if (skills.explosive.level > 0) {
                    let explosionRadius = 40 + skills.explosive.level * 20;
                    if (skills.explosive._big) explosionRadius *= 1.5;   // Lv5 范围 +50%
                    createExplosion(bullet.x, bullet.y, explosionRadius);
                    if (skills.explosive._firePool) {                    // Lv3 留下火池（灼烧）
                        oilPatches.push({ x: bullet.x, y: bullet.y, radius: explosionRadius * 0.6, life: 1500, level: skills.explosive.level });
                    }
                    
                    for (const z of zombies) {
                        if (z !== zombie) {
                            const d = Math.hypot(bullet.x - z.x, bullet.y - z.y);
                            if (d < explosionRadius) {
                                let aoeDamage = damage * (0.3 + skills.explosive.level * 0.1);
                                if (skills.explosive._big) aoeDamage *= 1.5;
                                damageZombie(z, aoeDamage, false, '火');
                                checkCombos(z, '火');
                            }
                        }
                    }
                }
                
                // 闪电链
                if (skills.lightning.level > 0) {
                    const chainCount = skills.lightning.level + 1 + (skills.lightning._chainBonus || 0);  // Lv3 链目标 +2
                    const chainDamage = damage * 0.4 * (1 + (skills.lightning._conduct || 0));              // Lv5 链伤 +30%
                    let lastTarget = zombie;
                    let chainedTargets = [zombie];
                    
                    for (let c = 0; c < chainCount; c++) {
                        let closestChain = null;
                        let closestDist = 150;
                        
                        for (const z of zombies) {
                            if (!chainedTargets.includes(z)) {
                                const d = Math.hypot(lastTarget.x - z.x, lastTarget.y - z.y);
                                if (d < closestDist) {
                                    closestDist = d;
                                    closestChain = z;
                                }
                            }
                        }
                        
                        if (closestChain) {
                            createLightning(lastTarget.x, lastTarget.y, closestChain.x, closestChain.y);
                            damageZombie(closestChain, chainDamage, false, '雷');
                            checkCombos(closestChain, '雷');
                            chainedTargets.push(closestChain);
                            lastTarget = closestChain;
                        }
                    }
                }
                
                damageZombie(zombie, damage, isCrit, '物理');
                checkCombos(zombie, '物理');

                // 多重射击 Lv5 质变：首次命中后，在命中点向多方向迸射小弹（仅主弹触发，分裂弹不再级联）
                if (isFirstHit && !bullet.isSplit && player._splitOnHit) {
                    spawnSplitBullets(bullet.x, bullet.y, damage, zombie);
                }

                // 穿透溅射（piercing Lv5 质变）
                if (skills.piercing._splash) {
                    for (const z of zombies) {
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 30) damageZombie(z, player.damage * 0.2, false, '物理');
                    }
                }
                // 暴击小爆炸（crit Lv5 质变）
                if (isCrit && skills.crit._explode) {
                    createExplosion(zombie.x, zombie.y, 50);
                    for (const z of zombies) {
                        if (z !== zombie && Math.hypot(zombie.x - z.x, zombie.y - z.y) < 50) { damageZombie(z, player.damage * 0.3, false, '火'); checkCombos(z, '火'); }
                    }
                }

                // 命中附带：冰冻 / 减速（天赋基础值 + 局内「冰霜弹 / 缓速弹」，仅主目标结算）
                const nowHit = Date.now();
                const freezeChance = getFreezeChance();
                if (freezeChance > 0 && Math.random() < freezeChance) {
                    zombie.frozenUntil = nowHit + getFreezeDuration();
                    createFreezeEffect(zombie.x, zombie.y);
                    if (skills.freeze._residual) zombie._residualSlowUntil = zombie.frozenUntil + 1500;  // Lv3 解冻后残留减速
                    if (skills.freeze._stun && Math.random() < 0.2) zombie.stunUntil = Math.max(zombie.stunUntil || 0, nowHit + 800);  // Lv5 20% 几率眩晕
                    checkCombos(zombie, '冰');   // 支撑泥沼（灼烧 + 冰）
                }
                const slowChance = getSlowChance();
                if (slowChance > 0 && Math.random() < slowChance) {
                    zombie.slowUntil = nowHit + 2200;
                    zombie.slowFactor = getSlowFactor();
                    createSlowEffect(zombie.x, zombie.y);
                }

                if (bullet.hitZombies.length >= bullet.piercing) {
                    bullets.splice(i, 1);
                    break;
                }
            }
        }
    }
}
function spawnSplitBullets(x, y, baseDamage, exclude) {
    const count = 6;
    const spd = player.bulletSpeed * 0.95;
    const dmg = baseDamage * 0.5;   // 分裂小弹伤害减半
    for (let k = 0; k < count; k++) {
        const a = (Math.PI * 2 / count) * k;
        bullets.push({
            x: x,
            y: y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            radius: 4,
            damage: dmg,
            piercing: 1,
            element: '物理',
            hitZombies: [exclude],   // 排除被命中的主目标，避免同点重复结算
            isSplit: true            // 标记：分裂弹不再触发分裂，防止级联
        });
    }
}

// 场景1：_splitOnHit=true，主弹首次命中
zombies = [{ x:120, y:120, radius:15, health:100, color:'#fff' }];
bullets = [{ x:120, y:120, vx:5, vy:5, radius:6, damage:10, piercing:1, element:'phys', hitZombies:[] }];
updateBullets();
console.log('S1 bullets after hit =', bullets.length, '(期望 6)');
console.log('S1 all isSplit =', bullets.every(function(b){return b.isSplit===true;}), ' exclude primary =', bullets.every(function(b){return b.hitZombies.length===1;}));

// 场景2：分裂弹再命中不应级联
bullets = [{ x:120, y:120, vx:5, vy:5, radius:4, damage:5, piercing:1, element:'phys', hitZombies:[zombies[0]], isSplit:true }];
updateBullets();
console.log('S2 split-bullet hit -> bullets =', bullets.length, '(期望 0)');

// 场景3：_splitOnHit=false 不分裂
player._splitOnHit = false;
bullets = [{ x:120, y:120, vx:5, vy:5, radius:6, damage:10, piercing:1, element:'phys', hitZombies:[] }];
updateBullets();
console.log('S3 _splitOnHit=false -> bullets =', bullets.length, '(期望 0)');

// 场景4：穿透弹首次命中只分裂一次
player._splitOnHit = true;
zombies = [{ x:120, y:120, radius:15, health:100, color:'#fff' }, { x:300, y:120, radius:15, health:100, color:'#fff' }];
bullets = [{ x:120, y:120, vx:200, vy:0, radius:6, damage:10, piercing:5, element:'phys', hitZombies:[] }];
updateBullets();
console.log('S4 piercing first hit -> bullets =', bullets.length, '(期望 7: 6 split + 1 parent)');
console.log('SPLIT_TEST_OK');
