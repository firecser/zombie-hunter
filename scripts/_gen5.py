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
ps = src.index('const PROVINCES = [')
pe = src.index('];', ps) + 2
provinces = src[ps+len('const PROVINCES = '):pe]

harness = r'''
var screenWidth = 720, screenHeight = 1280;
var MAIN_MENU_NAV_H = 60;
var SAFE_TOP_OFFSET = 0;   // 模拟 statusBarHeight=0（也可用 44 验证）
let selectedProvince = null, currentStage = 1, isSkillLab = false;
let started = false;
function startGame(){ started = true; }
const PROVINCES = __PROV__;
__HWC__

// 用【绘制布局】反算玩家“看到的山东”中心屏幕坐标，模拟真实点击
const padding = 15;
const mapX = padding;
const mapY = SAFE_TOP_OFFSET + 40;     // 与 drawMainMenuWorld 一致
const mapW = screenWidth - padding*2, mapH = mapW;
const shP = PROVINCES.find(p=>p.name==='山东');
const relXc = shP.x + shP.w/2, relYc = shP.y + shP.h/2;
const shX = mapX + relXc/340*mapW;
const shY = mapY + relYc/340*mapH;

handleWorldClick(shX, shY);
console.log('T1 点看到的山东中心: isSkillLab=', isSkillLab, ' started=', started, ' selected=', selectedProvince);
console.log((isSkillLab===true && started===true) ? 'T1_OK' : 'T1_FAIL');

// T2 点山东“顶部边缘”（绘制上沿），确认不会误中上一行省份
selectedProvince=null; isSkillLab=false; started=false;
const relYtop = shP.y + 1;
const syTop = mapY + relYtop/340*mapH;
handleWorldClick(shX, syTop);
console.log('T2 点山东上沿: isSkillLab=', isSkillLab, ' selected=', selectedProvince);
console.log((isSkillLab===true) ? 'T2_OK' : 'T2_FAIL');

// T3 点黑龙江中心（绘制），确认普通省份仍只高亮不进实验室
selectedProvince=null; isSkillLab=false; started=false;
const hlj = PROVINCES.find(p=>p.name==='黑龙江');
const hX = mapX + (hlj.x+hlj.w/2)/340*mapW;
const hY = mapY + (hlj.y+hlj.h/2)/340*mapH;
handleWorldClick(hX, hY);
console.log('T3 点黑龙江: selected=', selectedProvince, ' isSkillLab=', isSkillLab);
console.log((selectedProvince==='黑龙江' && isSkillLab===false) ? 'T3_OK' : 'T3_FAIL');
'''

harness = harness.replace('__PROV__', provinces).replace('__HWC__', hwc)
open('_hwc2_test.js','w',encoding='utf-8').write(harness)
print("gen ok")
