// 关卡解锁逻辑验证脚本：在 Node 中以桩环境加载 game.js，模拟通关 1~6 关后检查章节/关卡解锁。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FILE = path.join(__dirname, '..', 'game.js');
let src = fs.readFileSync(FILE, 'utf8');

// ---- 桩：canvas 2D 上下文（Proxy，所有方法 no-op，measureText/createRadialGradient 返回合理桩） ----
function makeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createRadialGradient' || p === 'createLinearGradient')
        return () => ({ addColorStop() {} });
      if (p === 'canvas') return { width: 750, height: 1334 };
      if (p in t) return t[p];
      // 任意方法 -> no-op 函数；任意数值属性 -> 0
      return typeof p === 'string' ? (function () { return undefined; }) : undefined;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
const ctxStub = makeCtx();
const canvasStub = { width: 750, height: 1334, getContext: () => ctxStub };

// ---- 桩：wx ----
const storage = {};
const wxStub = new Proxy({
  createCanvas: () => canvasStub,
  createOffscreenCanvas: () => canvasStub,
  createImage: () => ({ onload: null, onerror: null, src: '' }),
  getWindowInfo: () => ({ statusBarHeight: 20 }),
  getSystemInfoSync: () => ({ statusBarHeight: 20, screenWidth: 750, screenHeight: 1334 }),
  getStorageSync: (k) => (k in storage ? storage[k] : null),
  setStorageSync: (k, v) => { storage[k] = (typeof v === 'string') ? v : JSON.stringify(v); },
  showToast() {},
}, {
  get(t, p) { return (p in t) ? t[p] : () => {}; },
});

// ---- 桩：全局 ----
const sandbox = {
  wx: wxStub,
  console,
  Math, JSON, Date,
  requestAnimationFrame: () => {},   // 阻止 gameLoop 死循环
  setTimeout: () => 0,
  clearTimeout: () => {},
  parseInt, parseFloat, isNaN,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---- 测试尾声：直接访问同作用域的 const/let ----
const epilogue = `
;(function(){
  function chk(label, cond){ console.log((cond?'  PASS':'  FAIL') + ' | ' + label); if(!cond) globalThis.__fail = true; }
  console.log('== 初始 stageProgress 长度:', stageProgress.length, '==');
  // 顺序通关第 1~6 关（模拟 victory() 内的 saveProgress）
  for (let s=1; s<=6; s++){ currentStage = s; saveProgress(); }
  console.log('通关第1章后 stageProgress:', JSON.stringify(stageProgress));
  console.log('第2章首关 firstLevel =', CHAPTERS[1].levels[0]);
  console.log('isChapterUnlocked(第2章) =', isChapterUnlocked(CHAPTERS[1]));
  console.log('isChapterUnlocked(第3章) =', isChapterUnlocked(CHAPTERS[2]));
  // 关卡解锁公式（与代码一致）
  const lv7 = 6; // stageIdx
  console.log('第7关解锁(isUnlocked)=', (lv7===0 || stageProgress[lv7-1]));
  chk('第2章应解锁', isChapterUnlocked(CHAPTERS[1]) === true);
  chk('第7关应解锁(第6关已通关)', (lv7===0 || stageProgress[lv7-1]) === true);
  // 继续通关第2章 7~12
  for (let s=7; s<=12; s++){ currentStage = s; saveProgress(); }
  console.log('通关第2章后 isChapterUnlocked(第3章) =', isChapterUnlocked(CHAPTERS[2]));
  chk('第3章应解锁(第12关已通关)', isChapterUnlocked(CHAPTERS[2]) === true);
  const lv13 = 12;
  chk('第13关应解锁(第12关已通关)', (lv13===0 || stageProgress[lv13-1]) === true);

  // ---- 点击命中验证（修复后：touch 与 draw 共用 SAFE_TOP_OFFSET + levelScrollY 基准） ----
  mainMenuTab = 'level';
  mainMenuExpandedChapter = 1;   // 默认展开第1章
  levelScrollY = 0;
  signModal.show = false; dailyTaskModal.show = false;
  // 第2章绘制头部中心 Y = SAFE_TOP_OFFSET + (第1章展开210 + 间距10) + 30
  const ch2Y = SAFE_TOP_OFFSET + (210 + 10);
  try { handleMainMenuTouch(120, ch2Y + 30); } catch (e) { console.log('tap-ch2 异常:', e && e.message); }
  console.log('点击第2章头部后 mainMenuExpandedChapter =', mainMenuExpandedChapter);
  chk('点击第2章头部应展开第2章', mainMenuExpandedChapter === 2);
  // 第2章展开后，点第7关卡片(li=0,col0,row0)：cx=25, cy=ch2Y+75
  // 注意：此时 mainMenuExpandedChapter=2，第1章已折叠(70px)，故第2章实际起点 = SAFE_TOP_OFFSET + 70 + 10
  const ch2CurrentY = SAFE_TOP_OFFSET + 70 + 10;
  const ch2CardY = ch2CurrentY + 75;
  try { handleMainMenuTouch(45, ch2CardY + 20); } catch (e) { console.log('tap-lv7 异常:', e && e.message); }
  console.log('点击第7关卡片后 currentStage =', currentStage, ' gameState =', gameState);
  chk('点击第7关卡片应进入游戏(currentStage=7)', currentStage === 7);
})();
`;

try {
  vm.runInContext(src + epilogue, sandbox, { filename: 'game.js' });
} catch (e) {
  console.log('运行异常:', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exit(2);
}
process.exit(sandbox.__fail ? 1 : 0);
