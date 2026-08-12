src = open('game - 副本.js', encoding='utf-8').read()

def extract(name):
    i = src.index('function ' + name + '(')
    j = src.index('{', i)
    depth = 0; k = j
    while k < len(src):
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: return src[i:k+1]
        k += 1
    raise RuntimeError('unbalanced ' + name)

hwc = extract('handleWorldClick')

# 抽取 PROVINCES 数组字面量
ps = src.index('const PROVINCES = [')
pe = src.index('];', ps) + 2
provinces = src[ps+len('const PROVINCES = '):pe]

harness = r'''
var screenWidth = 720, screenHeight = 1280;
var MAIN_MENU_NAV_H = 60;
let selectedProvince = null, currentStage = 1, isSkillLab = false;
let started = false;
function startGame(){ started = true; }
const PROVINCES = __PROV__;
__HWC__

// 地图布局（与 drawMainMenuWorld 一致）：mapX=15 mapY=60 mapW=690 mapH=690
function screenToRel(sx, sy){
  return { relX: (sx-15)/690*340, relY: (sy-60)/690*340 };
}
// 山东中心：x100+35=135, y48+24=72
const shX = 15 + 135/340*690, shY = 60 + 72/340*690;
handleWorldClick(shX, shY);
console.log('T1 点山东: isSkillLab=', isSkillLab, ' currentStage=', currentStage, ' started=', started);
console.log((isSkillLab===true && currentStage===1 && started===true) ? 'T1_OK' : 'T1_FAIL');

// 复位
selectedProvince=null; isSkillLab=false; currentStage=1; started=false;
// 点黑龙江左上角：(sx,sy) 让 relX≈17 relY≈0 -> x=15+17/340*690=49.5, y=60+0=60
handleWorldClick(49.5, 60);
console.log('T2 点黑龙江: selectedProvince=', selectedProvince, ' isSkillLab=', isSkillLab);
console.log((selectedProvince==='黑龙江' && isSkillLab===false) ? 'T2_OK' : 'T2_FAIL');

// T3 点在地图外（底部导航区）应置空且无反应
selectedProvince='山东'; isSkillLab=false; started=false;
handleWorldClick(360, 1250);
console.log('T3 地图外: selectedProvince=', selectedProvince, ' isSkillLab=', isSkillLab);
console.log((selectedProvince===null && isSkillLab===false) ? 'T3_OK' : 'T3_FAIL');
'''

harness = harness.replace('__PROV__', provinces).replace('__HWC__', hwc)
open('_hwc_test.js','w',encoding='utf-8').write(harness)
print("gen ok")
