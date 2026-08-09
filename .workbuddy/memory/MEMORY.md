# 工作记忆

## 项目背景
- 微信小游戏开发者，仓库：firecser/zombie-hunter
- AppID: wx82946280a9b98e78
- 游戏"制霸新手村的骷髅怪"：冰雪世界塔防，三头身欧美卡通画风

## 技术偏好
- 务实迭代：先看效果再逐步简化
- 偏好渐进式设计，反感硬编码
- 精确对齐，积极修复Bug
- 使用Git版本控制，频繁重启和微调

## 当前关注
1. UE主界面原型开发（5模块：主角、关卡、天赋、排行榜、世界）
2. 游戏买量素材竞品分析
3. 主界面UE集成到游戏

## 完成的里程碑

### v0.1.0-ue-prototype
- 添加主界面UE原型：主角、关卡、天赋、排行榜、世界五大模块
- 文件：main-menu-ue.html

### v0.2.0-ue-integrated
- 集成主界面UE到游戏
- 游戏逻辑调整：
  - 首次进入游戏 → 直接开始第一关战斗
  - 从游戏返回（暂停/结束/胜利） → 显示新主界面
- 新增gameState: 'mainMenu'，5个Tab导航
- 主角Tab：显示角色信息（等级、金币、击杀）
- 关卡Tab：显示10个关卡选择卡片

## Git标签
- v0.1.0-ue-prototype：UE原型版本
- v0.2.0-ue-integrated：UE集成版本
- 1.0.3 → 1.0.4 → 1.0.5：迭代版本

## 版本号规则（重要）
- **已推送至 v1.0.60**（2026-08-06 推送，含 v1.0.55→v1.0.60 全部）。
- v1.0.55 天赋系统重做；v1.0.56 战斗体验修复+子弹天赋进三选一+全套美术；v1.0.57 暴击数字放大加粗/去十字星+跳级三选一覆盖修复；v1.0.58 微信编译告警修复（getSystemInfo 弃用换 getWindowInfo）+ 关 sourceMap 上传 ENOENT 报错；v1.0.59 关闭 useCompilerModule 规避 SummerCompiler.getFile(undefined) 编译报错；v1.0.60 清理 Apr16 废弃快照目录（含嵌套第二个 project.config.json）结构性根治 undefined 报错。
- 本地最新标签 v1.0.77（2026-08-09 本地提交，含 v1.0.61→v1.0.77：核心战斗改造/布局优化/倍增门加减法/墙血条绿色立体/混淆崩溃修复/门防重叠槽位制/减法门归零即消失）；下一个版本：**v1.0.78**。
- 每次推送前必须先读取远程标签确定下一个版本号
- 命令：`git tag -l --sort=-v:refname` 查看远程标签
- 版本号命名格式：主版本.次版本.修订号（如1.0.5）

## 代码加固 / 源码管理（重要）
- 「游戏深度保护」插件会把混淆产物**写回 `game.js`**（含 `//WXAG_OBF_PLUGIN_BY_` 标记），不是只产出 /output/a.js。所以 `game.js` 工作区版本会被加固覆盖，不能直接当可读源码编辑。
- **可读源码 = `game - 副本.js`**（与加固前的可读 game.js 一致）。所有硬编码移植（2048、qmxzfzm 等）都在这里改。
- 正确工作流：编辑 `game - 副本.js` → 复制 `副本.js` → `game.js` → DevTools「全部加固」（game.js 变混淆 + 生成 game.js.map）后上传 → 上传完把 `副本.js` 拷回 `game.js` 恢复可读。
- `game.js.map` 是 source map，勿当源码、勿提交。仓库提交的是可读 game.js。
- **⚠️ 微信加固 `for-of`+`splice` 越界崩溃坑（v1.0.75 确诊）**：加固「高混淆」会把 `for (const x of arr)` 改写成**长度缓存一次**的索引 `for`。若循环体内调用会 splice `arr` 的函数（如 `damageZombie` 死亡时 splice 僵尸），缓存长度失效 → 下标越界读到 `undefined` → `Cannot read property 'x' of undefined`。**规则：任何会在循环体内被 splice 的数组，遍历一律用 `arr.slice()` 快照**（如 `for (const z of zombies.slice())`）。原生 `for...of` 下不崩，所以无头测试/DevTools 跑可读源码都正常，只有混淆上传版会崩——排查时别被"本地不崩"误导。
- 内嵌小游戏（mode:'ingame'）统一接线点：`OTHER_GAMES` 配置、`startMiniGame`、`gameLoop`（activeMiniGame 分支）、`touchEnd`（activeMiniGame 分支）。已移植三款：2048（滑动合成）、qmxzfzm（点图找目标）、bdsjm（4列下落式打猫）；新增一款照搬 2048/gQmxz*/gBdsjm* 这套 ingame 模板。

## 倍增门设计决策（v1.0.77 定稿，用户拍板）
- 门固定 3 个：左1、右1、第3个随机左右；窗口半屏宽（GATE_WINDOW_W_FRAC=0.5），x 固定 1/4 或 3/4 屏宽。
- **防重叠 = 槽位制（v1.0.77 定稿）**：82px 带(GATE_Y_MIN~GATE_Y_MAX)放不下两个需 46px 间距的同侧门（固定门落带中部时两端皆禁区，纯随机 y 无解）。改用 `gateBaseY` 每批随机一次，门 y = `gateBaseY + slot*GATE_V_GAP`，强制门占槽0、第3门占槽1；同侧两槽恒距 GATE_V_GAP=46 且都在带内，彻底不重叠。移除早期 gateOverlaps 重试/扫描兜底。
- 语义**只许加减法**，禁用乘除：用户实测除法门会让子弹"可能过可能不过"（体验割裂）。`add` 门确定性克隆 +N 颗（无随机）；`sub` 门用 `drainLeft` 额度确定性削减（额度内必死、额度外必过）。**减法门实时计数+归零消失（v1.0.77）**：drawGates 显示剩余 `drainLeft`（每颗穿门子弹递减、即时可见），剩1颗数字放大作"即将消失"提示；`drainLeft<=0` 时 `updateGates` 立即移除该门（不再变暗、无"−0"闪烁）。
- 门顶 Y 上限 = 背景最高山峰顶（`MOUNTAIN_TALLEST_PEAK=142`，与 drawBackground 山峦同步），门不得高过山体。
- 数值 [PLACEHOLDER]：GATE_REFRESH_INTERVAL=8000 / GATE_SPLIT_SPREAD=0.22 / BULLET_CAP=240 / GATE_V_GAP=46 / 增益65%·减益35% / add +2+3+4 / sub -2-3，待真机调。

## 天赋系统（v1.0.55 重做，已接入战斗）
- 设计原则：前期基础属性天赋（怪物之心/攻击力/生命/攻速）由「百分比」改为「直接加数值」，升级即时可见；金币/经验保留百分比。
- 单一数据源 = `game - 副本.js` 的 `talentData`（显示文案 effect）+ `applyTalentsToBattle()`（实际计算 `talentMods`）。改数值只需调这两处，战斗主逻辑无需动。
- 战斗接入：`startGame()` 调 `applyTalentsToBattle()` 后折入 `player`/`skills`/`bombMaxCount`；机制类（暴击/冰冻/减速/护盾/金币经验倍率/死亡射线/不朽/吞噬）在 `updateBullets`/`updateZombies`/`updateOrbs`/`update`/`damageZombie` 中读取 `talentMods`。
- 原未实现、本次新接入的天赋：暴击、冰冻、减速、炸弹上限、爆炸、闪电链、连射、护盾、死亡射线、不朽之身、吞噬万物。

## 提交与上传约定（重要）
- **每次本地 git 提交（及打 tag）完成后，必须主动询问用户：「要不要上传（提交审核）？」** 不要默认推送或默认不上传，等用户决定。
- 若用户决定上传：上传前**必须先加固**——当前 `game.js` 是可读明文，不能直接传。在 DevTools 右键 `game.js` → 已在加固列表则直接「全部加固」（选「高」混淆 + 水印）；未加过则先「添加到加固文件列表」再加固。加固后 `game.js` 变混淆产物即可上传/提审。
- 插件若勾选「上传时自动加固」，直接上传也会自动加固，效果等同。
- 上传完成后：把 `game - 副本.js` 拷回 `game.js` 恢复可读源码（仅影响本地工作区，不影响已上传的加固包）。
- `game.js.map`（source map）随包提审但勿提交到 git；仓库永远存可读 game.js。

## Git 推送鉴权（PAT，用户要求记住）
- 用途：本机 Git Credential Manager 缓存的旧凭据已失效，推送 `firecser/zombie-hunter` 时用此 Classic PAT 内联鉴权。
- 推送命令（内联 URL，避免写入 git config）：
  `git push https://<PAT>@github.com/firecser/zombie-hunter.git main --tags`
- **PAT**：存于本地 git-ignored 文件 `.pat`（仓库根目录，明文；本机推送时用 `git push https://$(cat .pat)@github.com/...` 内联鉴权，不入库、不泄露）。如需轮换/撤销，更新 `.pat` 即可。
- 安全：明文 PAT 已移出 git 跟踪（v1.0.64 推送时 GitHub Push Protection 因历史含明文 PAT 拦截，已用 filter-branch 脱敏历史并将明文转入 `.pat`）。
- 备注（2026-08-08 实测修正）：本机 `hosts` 实测已无 `127.0.0.1 github.com` 映射，`github.com` 解析真实 IP `20.205.243.166`，**直连通常可通**（用户要求"别管代理直接推"后成功）。不再强制开代理；若直连报 `Recv failure: Connection was reset` 再开代理/VPN 走本地端口（Watt Toolkit 默认 57777 / Clash 7890 / v2rayN 10809），且需确认其本地代理已真正监听（仅打开软件不监听端口）。

## 微信开发者工具报错排查（重要，已确诊）
- **`[] ENOENT ... open '.../zombie-hunter-game/undefined'`，栈含 `PreCompileProject.getFile → SummerCompiler.getFile`**：这是**微信开发者工具 Stable `2.01.25xxx`（如 2.01.2510290）自身的已知 bug**，**与项目代码/配置/目录结构无关**（社区官方同款帖子栈帧逐字相同，纯 Canvas/H5 项目同样中招）。
- **唯一确认有效的解决：升级微信开发者工具到最新 nightly 版**（用户实测有效）。`useCompilerModule:false`、`uploadWithSourceMap:false`、删嵌套目录等都**不是根因**，是巧合性"没报"，勿再为此改配置。
- 报错由 DevTools 文件监听触发增量重编译、走 `SummerCompiler.getFile(undefined)` 偶发 race，故时有时无；不要用 `git push` 当"是否报错"的判定测试（必触发重编译且只是偶发）。
- 缓解（不保证根除）：DevTools 内关闭"编辑时自动编译"。
