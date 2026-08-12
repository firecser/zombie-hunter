
var screenWidth = 720, screenHeight = 1280;
var MAIN_MENU_NAV_H = 60;
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
    const headerH = 50;
    const mapY = headerH + 10;
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
