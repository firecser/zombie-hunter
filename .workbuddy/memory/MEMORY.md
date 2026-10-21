# 工作记忆 · 制霸新手村的骷髅怪（zombie-hunter）

## 项目与文件硬规则（最高优先级）
- 微信小游戏，仓库 `firecser/zombie-hunter`，AppID `wx82946280a9b98e78`。
- **可读源码 = `game.js`**（2026-08-18 起用户硬性要求：禁止混淆/minify 进 git；加固由用户自行在微信开发者工具做）。`game copy.js` 是 `game.js` 的镜像备份。
- **标准工作流**：编辑 `game.js` → `git commit` → `cp game.js "game copy.js"` 同步镜像并一并提交（两文件始终一致）。
- **提交后必须主动问用户「要不要上传（提交审核）？」**，不默认推送。

## Git 推送（已验证可用，2026-10-19）
- PAT 存 `.pat`（git-ignored，明文，无末尾换行）。推送命令：
  `PAT=$(tr -d '\n' < .pat) && git -c http.sslVerify=false -c credential.helper= push "https://${PAT}:@github.com/firecser/zombie-hunter.git" main --follow-tags`
  - 关键：`-c credential.helper=` 清空本机 GCM；PAT 作 URL 用户名 + 显式空密码 `:`。
- 环境走 MITM 代理（`HTTPS_PROXY=127.0.0.1:52724`）；PAT 过期需去 github.com/settings/tokens 换新 Classic PAT（勾 repo）写 `.pat`。

## 当前主线：技能体系大简化 · 五行极简 v2.2（重设计，进行中）
- **诉求**：原 15 技能+分支树+18天赋树119节点+多发子弹3树 过复杂，按 20–30 岁（实际国内 18–49 男为主）休闲玩家大幅简化，只留「五行相生相克」为唯一战略内核。
- **用户拍板**：① 5 图标+克制高亮（中间方案），图标放大好点，坦克/城墙/背景山上移给技能坞腾空间；② 相生做连携、画面表现与相克同层次明显；③ 彻底删除旧技能特效（暴击/链击/溅射/死亡射线等），只留 5 元素技能+五行。
- **美术（国风化+汉字怪物）**：怪物=大号书法汉字「金木水火土」(元素色)，攻击时某笔画变形为武器(金→剑刃/木→藤枪/水→水鞭/火→焰刀/土→岩锤)；颜色+字形双重编码元素(色弱/零学习)；类型(普/快/坦/BOSS)用字号+速度区分。技能图标亦汉字印章风。参考《赵云与阿斗》。
- **关卡（60关=10章×6，每关~5min）**：L1火(开局)+水(中段稍晚)→L2木→L3土→L4金(全5开)→L5-6混合→L7-12五素初混→**L13-18首遇相生连携教学**→L19-60扩展/高难。第2元素≈L1中段(3-5min)、全5≈L4，解决注意力短。渐进解锁见 `getStageUnlockedElements(lv)`。
- **克制关系（怪元素→克制它的玩家元素）**：金→火, 火→水, 土→木, 水→土, 木→金（即 `ELEMENT_COUNTER`）。
- **五元素 DPS 基线（已 `scripts/sim_v22.js` 校准，泄漏生存模型）**：autoDPS(中性保底)=40；克制×2.5 / 错配×0.2；LvMul=1.15^(lv-1)；E_BASE=金300/火240/木180/土120/水90；AoE等效 金1.4/火1.6/木水土1.0；水控→到达率×0.8、木连携→+6HP/s、土连携→泄漏×0.7。
- **状态**：纸面模型+数值校准已完成（sim_v22.js 验证火力门自洽：错配41-96s崩、克制lv1撑278-293s、L55满养成稳过且零养成285s崩）。**代码尚未落地**，v1.1.80(HEAD)仍为旧怪物按type四色。

## 开发清单（v2.2 落地，分阶段，勿跨阶段猜战斗代码）
- ✅ P1 视觉身份层（已落地 fb73ef5，**验收后修复于 653d009**）：汉字怪物渲染+底部五行坞(克制高亮/选中金边)+战场整体上移(WALL_Y 0.82→0.70，控制按钮随动)+activeElement选中(坞点击)。旧战斗逻辑未动。
  - **验收发现并修复 3 bug**：①双系关(第37-60关)`element='normal'`+`elements[]` 导致怪物退化灰色「僵」→ 主字形取 elements[0] + 右上角第二元素角标；②无底部安全区 → 新增 `SAFE_BOTTOM_OFFSET`(读 `safeArea.bottom`) + `DOCK_HEIGHT`/`DOCK_TOP` 统一基准，坞/控制按钮/炸弹全按 DOCK_TOP 排版；③素材演示模式炸弹坐标写死 `screenHeight-48` → 改用 `BOMB_BTN_X/Y`。
  - **测试覆盖教训**：`smoke_p1.js` 把双系样本写成 `element:'木'`，绕过了真实形态 `element:'normal'`，导致 BUG-①漏检。新增 `scripts/smoke_p1_fix.js`（记录型 ctx 断言 fillText 实参 + 模拟 safeArea）6 项 PASS。
  - **硬规则（新增）**：改任何底部 UI（坞/按钮/炸弹/提示）必须用 `DOCK_TOP`/`SAFE_BOTTOM_OFFSET` 统一基准，禁止写死 `screenHeight - N`。
- ✅ P2 战斗重写（已完成）：`shootElement(el)` 固定炮台发射当前元素子弹(w='element')；`update()` 停 `shootBase`+属性CD循环+死亡射线；`getElementBonus` 重写为**克制×2.5 / 同元素×0.2 / 中性×1.0**（双系取最差）；`damageZombie` 克制时再乘 `ELEMENT_AOE`(金1.4/火1.6)；相生连携=切到 `ELEMENT_SHENG[上个元素]` → 4s ×1.2 + 坞上青色脉冲环「连携」。常量：autoDPS40 / E_BASE 金300火240木180土120水90 / 射速220ms / `elementLevels`(全1等P4) / `elementLvMul`。
  - 验证 `scripts/smoke_p2.js` 6项PASS（三态/双系/单发数值/damageZombie端到端/连携×1.2/旧链路无调用点）。
  - **遗留数值问题（归 P6）**：sim_v22 血量尺度(普30/坦80/BOSS200)远小于实际 `zombieTypes`(312/1560/39000) → 实测 BOSS 约35s(克制/lv1)偏肉；小怪健康(0.3–1.1s)。
- ✅ P3 三选一池重写（已完成）：4类卡 `kind=elem/synergy/restraint/general`；元素卡只出本关已解锁元素；`applyUpgrade` 按 kind 分派，**旧 skills/branches/qualNodes 彻底退出三选一**；删 `upgradePool`。上限：元素Lv10 / 克制3.5 / 连携+4s+40% / 炮台+200。验证 `smoke_p3.js` 7项PASS。
  - **数值注意（P6）**：元素精通被 autoDPS 地板稀释，Lv1→2 实际 +12.9%（非15%）；Lv10 火单发194.7、中性885DPS、克制3540DPS。
- ✅ P4 局外养成（已完成）：5元素页签 × 8节点 = 40节点替代旧119节点；`applyTalentsToBattle` 只产出 `atkFlat/hpFlat/defPct/critChance/critDamage/elemLevel`（合规白名单），其余旧字段固定中性；`elemAtkFlat` 进单发分子、`wallDefPct` 进城墙减伤、`elementBaseLevels` 决定开局元素等级。上限：减伤30% / 暴击率25%(安全帽60%) / 暴击倍率3.0 / 元素攻击+84/元素。**顺手修复 P3 跨局残留 bug**：`startGame` 现按 `1+elementBaseLevels[el]` 重置 `elementLevels`。
  - 消耗沿用 2次幂 `cost×next²/4`、金币沿用直线 `200+30×(关-1)`（原已满足，未改）。
  - **待用户决策**：旧存档 `talentLevels` 旧 id 静默归零（老玩家投资清零）→ 方案 A 不处理 / B 折算 / C 返金币。
  - 验证 `smoke_p4.js` 8项PASS。
- ✅ P5 关卡元素对齐（已完成）：第1章改为**五行教学章**——新增 `buildTeachingWaveElements(lv)`（仅 lv≤6）→ `stage.waveElements`（20波）→ `spawnWave` 按波投放。L1 前10波金(火克)/后10波火(水克)、L2 土(木克)、L3 水(土克)、L4-6 木(金克)；第7关起 null 走章节元素。**不变量**：每关每波怪的克制元素必须已解锁（`smoke_p5.js` 全60关逐波校验）。
- ✅ P5b 死代码清理（-10540字符）：逐块删 `CREATURE_VISUAL`/`drawSkillUI`/`shootBase`/`shootAttribute`/`shootWood`，**每块删后跑全量冒烟**。保留 `getBulletElement`(spawnSplitBullets 用)/`pendingWoodLogs`+`updateLogs`(update 调用)/`*Mods`(getPlayerDpsIndex 读)/`SKILL_DEFS`(存档兼容)。
- ✅ **v2.9.2 收口（tag `v2.9.2`）**：v2.3~v2.9.2 一大段机制改动（五行轮转 / 弹道1-6 / 6词条+5进化 / 拖动物理走位 / 投掷怪 / 掉落A案）已全部落地并打 tag，**未推送**。
  - **P9e 待调**：怪物移速是**每帧**（15–72px/s，玩家 480px/s 快 16 倍）→ 先提移速到 normal 1.6–1.9 / fast 2.6–3.0，再重算波次血量与 DPS，最后调掉落/经济。
- ✅ P7 / v2.3 操作层（2026-10-21，已完成）：点击元素=释放该元素战术技能，独立 CD（火/金/木/水 2.5s、土 6s）；火爆炸+点燃/金穿透3/木连锁2/水范围减速/土城墙50%减伤3s；相生顺序点击先触发**五元素合击**（藤蔓定身/燎原燃烧/熔岩减速/金锐破甲/寒潮冰缓）；炮台降频 220→**600ms**；坞加 CD 遮罩+相生目标 ▲。`smoke_p7.js` 4项PASS。
  - **DPS 结构变了**：挂机 1.67 发/s（原 4.55 的 37%）、单元素 2.87（63%）、五元素轮点 7.67（169%）→ **P6c 需按新结构重扫**。
- ✅ P6b 审计修复（`a43e069`，已完成）：① **击杀金币×20**（40/60/100/200/600）→ 60关收入 158.8万 / 满树 180.9万 = **87.8%**；② **删失效耦合** `getPlayerDpsIndex`/`getPickProgress`/`getDmgCouple`，`healthMult = stage.healthMult`；③ 补相生首次引导（第13关起每局一次，坞上方4s横幅）；④ **修局内增益跨局残留**（`restraintMult`/`synergyDurBonus`/`synergyDmgBonus`/`autoDpsBonus` 在 `startGame` 归零，与 elementLevels 同类 bug）。
- ✅ P6 真实数值校准（方案A，已完成）：新建 `scripts/sim_v22_real.js` 复刻线上出怪表。**原曲线 1.6^w 与 v2.2 亚线性力量差 2 个数量级**（波20=471万血/604只、单关25分钟）→ 改为 **g=1.25 / 体型血 90·85·360·1800·9000 / BOSS 波次13·17·20 / 出怪间隔1100ms / 第1章×0.75 / 水·土 E_BASE 170**。结果：单关 **5.4分钟**；错配 143–181s 崩、克制零养成过前中期、**L60 终章零养成崩246s、养成后满血清**。**待真机验收**（时长/切换手感/终章门槛/同屏密度）。

## 战斗代码铁律
- 改 battle 相关必须基于代码事实，不猜测；重做机制前先纸面建模(三层循环+火力门数值自洽)。
- 现有战斗锚点：胜利=撑满5min(GAME_TIME_LIMIT)、墙血归零败；`stage.element/elements` 已存在；`ELEMENT_COUNTER` 即用克制映射；`drawZombie`(2672)/`damageZombie`(5432, 带element参数)/`shoot`(5030, 读SKILL_DEFS[type].element)/`spawnZombies`(6131)/`wx.onTouchEnd`(14706 战斗分支)。
