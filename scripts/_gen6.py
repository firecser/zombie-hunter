src = open('game - 副本.js', encoding='utf-8').read()

# 抽取 startGame 中「素材演示模式特殊处理」整块（含门控重赋值行 + if 闭合）
start = src.index('// 素材演示模式特殊处理')
i = src.index('isAdDemoMode = isAdDemoMode &&', start)
j = src.index('{', i)
depth = 0; k = j
while k < len(src):
    if src[k] == '{': depth += 1
    elif src[k] == '}':
        depth -= 1
        if depth == 0:
            block = src[i:k+1]
            break
    k += 1

harness = r'''
var wx = { _s:{}, setStorageSync(k,v){ this._s[k]=v; }, getStorageSync(k){ return this._s[k]; } };

let isAdDemoMode, l1IntroDone, isSkillLab;
let adDemoState, adDemoTimer, adBombExploded, adZombieCount;
let bombCount, bombCooldown;
let spawnCalls = 0;
function spawnInitialAdZombies(){ spawnCalls++; }

function runGate(){
  __BLOCK__
}

// 场景1：首进第一关（入口已设 isAdDemoMode=true，l1IntroDone=false，非实验室）
isAdDemoMode = true; l1IntroDone = false; isSkillLab = false;
spawnCalls = 0;
runGate();
console.log('S1: isAdDemoMode=', isAdDemoMode, ' l1IntroDone=', l1IntroDone, ' spawn=', spawnCalls, ' stored=', wx._s['zombieHunterL1Intro']);
console.log((isAdDemoMode===true && l1IntroDone===true && spawnCalls===1 && wx._s['zombieHunterL1Intro']===true) ? 'S1_OK' : 'S1_FAIL');

// 场景2：再次进入第一关（l1IntroDone 已 true）
isAdDemoMode = true; l1IntroDone = true; isSkillLab = false;
spawnCalls = 0;
runGate();
console.log('S2: isAdDemoMode=', isAdDemoMode, ' spawn=', spawnCalls);
console.log((isAdDemoMode===false && spawnCalls===0) ? 'S2_OK' : 'S2_FAIL');

// 场景3：技能实验室进入第一关（isSkillLab=true，l1IntroDone=false 但应被屏蔽）
isAdDemoMode = true; l1IntroDone = false; isSkillLab = true;
spawnCalls = 0;
runGate();
console.log('S3: isAdDemoMode=', isAdDemoMode, ' l1IntroDone=', l1IntroDone, ' spawn=', spawnCalls);
console.log((isAdDemoMode===false && l1IntroDone===false && spawnCalls===0) ? 'S3_OK' : 'S3_FAIL');

// 场景4：非第一关（入口设 isAdDemoMode=false）
isAdDemoMode = false; l1IntroDone = false; isSkillLab = false;
spawnCalls = 0;
runGate();
console.log('S4: isAdDemoMode=', isAdDemoMode, ' spawn=', spawnCalls);
console.log((isAdDemoMode===false && spawnCalls===0) ? 'S4_OK' : 'S4_FAIL');
'''

harness = harness.replace('__BLOCK__', block)
open('_gate_test.js','w',encoding='utf-8').write(harness)
print("gen ok")
