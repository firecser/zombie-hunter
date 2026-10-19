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
- ✅ P1 视觉身份层（已落地，本地 fb73ef5）：汉字怪物渲染+底部五行坞(克制高亮/选中金边)+战场整体上移(WALL_Y 0.82→0.70，控制按钮随动)+activeElement选中(坞点击)。旧战斗逻辑未动。验证 scripts/smoke_p1.js 5项PASS。
- 🔄 P2 战斗重写（进行中）：activeElement接入战斗——停旧15技能自动释放，改手动选元素发射，子弹带 activeElement 经 getElementBonus(zombie,activeElement) 结算(克制×2.5/错配×0.2)，并加相生连携同层表现；数值须把 sim_v22 基线(autoDPS40/克制2.5/LvMul1.15)映射到实际武器DPS。
- P3 三选一池重写为4类(元素精通/相生连携/克制增幅/通用属性)，删旧分支树/qualNodes。
- P4 局外养成：5元素树(~8节点/棵)替代18天赋树119节点；删旧 talentData/applyTalentsToBattle。
- P5 渐进解锁：L1双元素、L13首遇相生，按60关梯度接入；删死代码(CREATURE_VISUAL/旧skill defs)。
- P6 模拟器(sim_v22)校准后整体回归 + 真机手感微调。

## 战斗代码铁律
- 改 battle 相关必须基于代码事实，不猜测；重做机制前先纸面建模(三层循环+火力门数值自洽)。
- 现有战斗锚点：胜利=撑满5min(GAME_TIME_LIMIT)、墙血归零败；`stage.element/elements` 已存在；`ELEMENT_COUNTER` 即用克制映射；`drawZombie`(2672)/`damageZombie`(5432, 带element参数)/`shoot`(5030, 读SKILL_DEFS[type].element)/`spawnZombies`(6131)/`wx.onTouchEnd`(14706 战斗分支)。
