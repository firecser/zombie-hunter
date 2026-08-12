src = open('game - 副本.js', encoding='utf-8').read()

stub = r'''
// ---- 全局桩 ----
var screenWidth = 720, screenHeight = 1280;
var MAIN_MENU_NAV_H = 60;
var SAFE_TOP_OFFSET = 0;
var GAME_TIME_LIMIT = 300, MAX_LEVEL = 10, MAX_SKILLS = 5;
var currentStage = 1;
var isAdDemoMode = false;
var isSkillLab = false;
var gameState = 'mainMenu';
var mainMenuTab = 'world';
var selectedProvince = null;
var gamePaused = false;
var activeMiniGame = null;
var otherGamesModal = { show: false };
var settingsModal = { show: false };
var talentModal = { show: false };
var isLevelDragging = false;
var levelTouchStartX = 0, levelTouchStartY = 0;
var levelDragStartY = 0, levelDragStartScrollY = 0;
var levelLongPressTimer = null;
var isLevelLongPressing = false;
var rankTouchStartX = 0, rankTouchStartY = 0, rankDragStartY = 0, rankDragStartScrollY = 0, isRankDragging = false;
var player = { x: 100, y: 1100, level: 1, exp: 0, expToLevel: 100, damage: 8, fireRate: 0.5, bulletSpeed: 10, bulletPiercing: 1, bulletCount: 1, critChance: 0.05, critMult: 1.5, health: 100, maxHealth: 100, gunAngle: -Math.PI/2 };
var zombies = [], bullets = [], mines = [], tornadoes = [], explosions = [], particles = [], floatingTexts = [], upgradePool = [], acquiredSkills = [], upgradeOptions = [];
var skills = {};
var ogTouchStartX=0, ogTouchStartY=0, ogDragStartY=0, ogDragStartScrollY=0, isOgDragging=false, otherGamesScrollY=0;
var mainMenuExpandedChapter = 1, levelScrollY = 0, rankTab = 'global', rankScrollY = 0;

function wx_export(){ return {
  getStorageSync: function(){ return {}; },
  setStorageSync: function(){},
  createCanvas: function(){ return null; },
  onTouchStart: function(){}, onTouchEnd: function(){}, onTouchMove: function(){},
  getSystemInfoSync: function(){ return { screenWidth:720, screenHeight:1280, pixelRatio:2 }; }
}; }
var wx = wx_export();
var console2 = console;
function requestAnimationFrame(){ return 0; }
function setTimeout(){ return 0; }
function clearTimeout(){}
function AudioContext(){ return { createOscillator:function(){return{connect:function(){},start:function(){},stop:function(){},frequency:{}};}, createGain:function(){return{connect:function(){},gain:{}};} }; }

// canvas 全局桩
var canvasStub = { width:720, height:1280, getContext: function(){ return null; } };
'''

# 把顶层 const/let 改成 var 容易暴露；这里直接整体包进 new Function，并返回需要的函数
wrap = stub + "\n" + src + "\nreturn { onTouchStart, onTouchEnd, get isSkillLab(){return isSkillLab;}, get currentStage(){return currentStage;}, handleWorldClick };\n"

open('_load_test.js','w',encoding='utf-8').write(
"const fn = new Function(" + repr(wrap) + ");\n"
"const M = fn();\n"
"// 切到世界tab\n"
"M.onTouchStart(360, 200); // 任意点，进入 world 分支刷新坐标\n"
"// 找到山东中心并点击：PROVINCES 里山东 x=250,y=150,w=30,h=30，地图区 mapX=15 mapY=60 mapW=690 mapH=690，rel 缩放 340\n"
"const mapX=15, mapY=60, mapW=690, mapH=690;\n"
"const relX=250+15, relY=150+15; // 山东中心\n"
"const sx = mapX + relX/340*mapW, sy = mapY + relY/340*mapH;\n"
"M.onTouchStart(sx, sy);\n"
"M.onTouchEnd(sx, sy);\n"
"console.log('isSkillLab =', M.isSkillLab, ' currentStage =', M.currentStage);\n"
"if (M.isSkillLab === true && M.currentStage === 1) console.log('WORLD_ENTRY_OK'); else console.log('WORLD_ENTRY_FAIL');\n"
)
print("gen ok")
