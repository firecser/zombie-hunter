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
- **当前版本：1.0.20**（qmxzfzm 内嵌移植已完成、待提交）
- 每次推送前必须先读取远程标签确定下一个版本号
- 命令：`git tag -l --sort=-v:refname` 查看远程标签
- 版本号命名格式：主版本.次版本.修订号（如1.0.5）

## 代码加固 / 源码管理（重要）
- 「游戏深度保护」插件会把混淆产物**写回 `game.js`**（含 `//WXAG_OBF_PLUGIN_BY_` 标记），不是只产出 /output/a.js。所以 `game.js` 工作区版本会被加固覆盖，不能直接当可读源码编辑。
- **可读源码 = `game - 副本.js`**（与加固前的可读 game.js 一致）。所有硬编码移植（2048、qmxzfzm 等）都在这里改。
- 正确工作流：编辑 `game - 副本.js` → 复制 `副本.js` → `game.js` → DevTools「全部加固」（game.js 变混淆 + 生成 game.js.map）后上传 → 上传完把 `副本.js` 拷回 `game.js` 恢复可读。
- `game.js.map` 是 source map，勿当源码、勿提交。仓库提交的是可读 game.js。
- 内嵌小游戏（mode:'ingame'）统一接线点：`OTHER_GAMES` 配置、`startMiniGame`、`gameLoop`（activeMiniGame 分支）、`touchEnd`（activeMiniGame 分支）。新增一款照搬 2048/gQmxz* 这一套。
