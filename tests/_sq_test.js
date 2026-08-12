// 无头冒烟测试：加载 _sq_new.txt 的守桥射击实现，stub 出依赖，跑若干帧并模拟关键路径。
const fs = require('fs');
const block = fs.readFileSync('_sq_new.txt', 'utf8');

const stubs = `
const screenWidth = 375;
const screenHeight = 667;
var activeMiniGame = null;
var otherGamesModal = { show: false };
let __t = 1000;
Date.now = () => { __t += 16; return __t; };
const ctx = new Proxy({}, {
  get: (t, p) => { if (p in t) return t[p]; return () => {}; },
  set: (t, p, v) => { t[p] = v; return true; }
});
const wx = {
  getStorageSync: () => 0,
  setStorageSync: () => {},
  onTouchMove: () => {}, onTouchStart: () => {}, onTouchEnd: () => {}
};
function roundRect() {}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function drawScoreBox() {}
function drawMiniGameButton() {}
function flushMiniGameSeconds() {}
function drawBackground() {}
function drawRoyalePanel() {}
`;

const test = `
let __err = null;
try {
  sqInit();
  for (let i = 0; i < 400; i++) drawMiniGameSq();
  handleMiniGameSqInput(120, gSq.playerY);          // 拖动到左侧（对准宝箱）
  for (let i = 0; i < 200; i++) drawMiniGameSq();
  if (gSq.chests[4]) sqBreakChest(gSq.chests[4]);  // 金龙 → 阵营选择
  sqApplyFaction('xian');
  sqPickAffix({ x:gSq.playerX, y:gSq.playerY, r:14, q:'blue', aff:SQ_AFFIX_POOL.blue[0] });
  sqDamageEnemy({ id:999, type:'mob', x:200, y:200, r:16, hp:100, hpMax:100, dead:false }, 50, true);
  sqSpawnWave([{type:'mob',count:3,hp:40},{type:'fast',count:2,hp:144},{type:'armor',count:1,hp:200}]);
  for (let i = 0; i < 300; i++) drawMiniGameSq();
  gSq.lineHP = 0; gSq.lineShield = 0; sqSaveBest();
  drawMiniGameSq();
  console.log('SQ_SMOKE_OK kills=' + gSq.kills + ' enemies=' + gSq.enemies.length +
    ' chestsBroken=' + gSq.chestsBroken + ' faction=' + gSq.faction + ' score=' + gSq.score);
} catch (e) {
  console.log('SQ_SMOKE_FAIL', (e && e.stack) ? e.stack : e);
}
`;

fs.writeFileSync('_sq_run.js', stubs + '\n' + block + '\n' + test);
console.log('built _sq_run.js');
