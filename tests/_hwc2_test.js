
var screenWidth = 720, screenHeight = 1280;
var MAIN_MENU_NAV_H = 60;
var SAFE_TOP_OFFSET = 0;   // 模拟 statusBarHeight=0（也可用 44 验证）
let selectedProvince = null, currentStage = 1, isSkillLab = false;
let started = false;
function startGame(){ started = true; }
const PROVINCES = [
    // 第1行: 5块 y:0-48
    { name: '黑龙江', x: 0, y: 0, w: 68, h: 48 },
    { name: '吉林', x: 68, y: 0, w: 62, h: 48 },
    { name: '辽宁', x: 130, y: 0, w: 70, h: 48 },
    { name: '内蒙古', x: 200, y: 0, w: 80, h: 48 },
    { name: '河北', x: 280, y: 0, w: 60, h: 48 },
    // 第2行: 6块 y:48-96
    { name: '北京', x: 0, y: 48, w: 55, h: 48 },
    { name: '天津', x: 55, y: 48, w: 45, h: 48 },
    { name: '山东', x: 100, y: 48, w: 70, h: 48 },
    { name: '山西', x: 170, y: 48, w: 60, h: 48 },
    { name: '陕西', x: 230, y: 48, w: 60, h: 48 },
    { name: '宁夏', x: 290, y: 48, w: 50, h: 48 },
    // 第3行: 5块 y:96-144
    { name: '江苏', x: 0, y: 96, w: 70, h: 48 },
    { name: '安徽', x: 70, y: 96, w: 65, h: 48 },
    { name: '河南', x: 135, y: 96, w: 75, h: 48 },
    { name: '甘肃', x: 210, y: 96, w: 70, h: 48 },
    { name: '青海', x: 280, y: 96, w: 60, h: 48 },
    // 第4行: 5块 y:144-192
    { name: '上海', x: 0, y: 144, w: 55, h: 48 },
    { name: '浙江', x: 55, y: 144, w: 60, h: 48 },
    { name: '江西', x: 115, y: 144, w: 65, h: 48 },
    { name: '湖北', x: 180, y: 144, w: 70, h: 48 },
    { name: '四川', x: 250, y: 144, w: 90, h: 48 },
    // 第5行: 5块 y:192-240
    { name: '福建', x: 0, y: 192, w: 75, h: 48 },
    { name: '湖南', x: 75, y: 192, w: 75, h: 48 },
    { name: '重庆', x: 150, y: 192, w: 65, h: 48 },
    { name: '贵州', x: 215, y: 192, w: 70, h: 48 },
    { name: '云南', x: 285, y: 192, w: 55, h: 48 },
    // 第6行: 5块 y:240-288
    { name: '广东', x: 0, y: 240, w: 110, h: 48 },
    { name: '广西', x: 110, y: 240, w: 90, h: 48 },
    { name: '海南', x: 200, y: 240, w: 60, h: 48 },
    { name: '新疆', x: 260, y: 240, w: 50, h: 48 },
    { name: '西藏', x: 310, y: 240, w: 30, h: 48 },
    // 第7行: 4块 y:288-340
    { name: '香港', x: 0, y: 288, w: 60, h: 52 },
    { name: '澳门', x: 60, y: 288, w: 40, h: 52 },
    { name: '台湾', x: 100, y: 288, w: 75, h: 52 },
    { name: '其他', x: 175, y: 288, w: 165, h: 52 },
];;
function handleWorldClick(x, y) {
    const navH = MAIN_MENU_NAV_H;
    const padding = 15;
    // 必须与 drawMainMenuWorld 的地图布局完全一致，否则点到的省份和命中的省份错位
    const mapY = SAFE_TOP_OFFSET + 40;
    const mapW = screenWidth - padding * 2;
    const mapX = padding;
    const mapH = mapW;

    // 检查是否点击了地图区域
    if (x < mapX || x > mapX + mapW || y < mapY || y > mapY + mapH) {
        selectedProvince = null;
        return;
    }

    // 计算在地图内的相对坐标
    const relX = (x - mapX) / mapW * 340;
    const relY = (y - mapY) / mapH * 340;

    // 查找点击的省份
    for (const p of PROVINCES) {
        if (relX >= p.x && relX < p.x + p.w && relY >= p.y && relY < p.y + p.h) {
            if (p.name === '山东') {
                // 技能实验室入口：复用第一关（霜冻平原）配置，进入全技能自由选择模式
                currentStage = 1;
                isSkillLab = true;
                startGame();
                return;
            }
            selectedProvince = p.name;
            return;
        }
    }

    selectedProvince = null;
}

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
