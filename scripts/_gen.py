src = open('game - 副本.js', encoding='utf-8').read()

def extract(name):
    i = src.index('function ' + name + '(')
    j = src.index('{', i)
    depth = 0; k = j
    while k < len(src):
        if src[k] == '{':
            depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0:
                return src[i:k+1]
        k += 1
    raise RuntimeError('unbalanced ' + name)

ub = extract('updateBullets')
ss = extract('spawnSplitBullets')

harness = r'''
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

__UPDATEBULLETS__
__SPAWNSPLIT__

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
'''
harness = harness.replace('__UPDATEBULLETS__', ub).replace('__SPAWNSPLIT__', ss)
open('_split_test.js','w',encoding='utf-8').write(harness)
print('gen ok')
