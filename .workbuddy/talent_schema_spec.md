# 天赋系统 Schema 反混淆规格（Phase 2 解码里程碑）

> 目的：把混淆的 `talentData` 生成函数换成 v4.1 的纯数据对象，并扩展消费者。
> 本文件是「先全量解码 schema」的产物，供后续生成 356 节点 + 重接 applyTalentsToBattle / UI 使用。

## 1. 混淆解码机制
- 配置数组 `lM = new Array(34)`，每个 `lM[i]` 由 `lL = lK.C(编码串, N)` 再 `lM[i] = lL.s(N)` 得到。
- `lK.C(a)` = **反转字符串**（`Array.from(a)` 头尾交换后 join）。
- `String.prototype.s = function(a){ 按长度 a 切片成数组 }` —— 即把反转后的串切成定宽块。
- 因此 `lM[i]` = 反转(编码串) 的定宽块数组；天赋字段就是这些块（多为英文单词）。
- 字段键在**源码**里以 `lM[x][y]` 形式出现，所以 grep 搜不到 `level`/`cost` 等字面；解码后才显形。

## 2. 已解码的节点字段键（核心成果）
| 键 | lM 来源 | 语义 |
|---|---|---|
| `"level"` | `lM[3][1]` | 当前等级（消费者 `t[o][p]`，p=lM[3][1] 读取） |
| `"max"` | `lM[1][0]` | 最大等级（maxLevel） |
| `"cost"` | `lM[2][12]` | 升级消耗（金币） |
| `"name"` | `lM[2][0]` | 显示名 |
| `"desc"` | `lM[2][1]` | 描述 |
| `"icon"` | `lM[2][2]` | 图标键（**UI 绘制耦合**） |
| `"type"` | `lM[2][4]` | 类型（UI 耦合） |
| `"fill"` | `lM[2][5]` | 填充色（UI 耦合） |
| `"effect"` | `lM[4][0]` | 效果类别 |
| `"chapter"` | `lM[5][2]` | 章节/分组（部分节点带子对象） |
| `"prerequisite"` | `lM[10][2]` | 解锁门：`{prereqNodeId: reqLevel}` |
| `"perLevelPower"` | `lM[11][0]` | 每级战斗力权重（→ 总战斗力） |

> 其余 `lM[2]` 块（life/push/gold/show/rank/rowB/size/gain/crit/cell/...）为显示/布局相关字段，UI 按需读取；新节点可复用或置默认。

## 3. 节点对象结构（以生成函数 case 0 为模板）
节点对象 `talentData[id]` 形如：
```
{
  level: 0,                 // 起始等级
  name: <显示名>,           // 可用自定义中文字串
  cost: <金币数>,           // 每级费用（按等级缩放）
  icon: <图标键>,           // 需 UI 认识的键，或扩 UI
  max: <最大等级>,
  effect: <类别>,
  perLevelPower: <数>,      // 战斗力权重
  prerequisite: { <前置节点id>: <所需等级> } | {}   // 解锁门
  chapter: <分组> | {}      // 部分节点带子对象
}
```
- `prerequisite` 是 **嵌套对象**，键为前置节点 id、值为所需等级 → 与现有 `isTalentUnlocked(a)` 机制兼容（无 prereq 则直接解锁）。
- `level` 默认 0；`applyTalentsToBattle` 用 `talentData[id]["level"]` 聚合 MOD。

## 4. 消费者接线模型
- `applyTalentsToBattle`（@229688）：`for(let n of oV){ switch(n){ ... t[o][p] 累加 talentMods ... } }`。
  - `oV` = 有 MOD 效果的节点 id 列表；`p = lM[3][1] = "level"`。
  - 每个节点 id 的**效果由 switch 的 case 硬编码**（不是读字段），所以新节点(22..377)必须在 switch 增补对应 case。
- 天赋 UI（`drawTalentModal`/`drawTalentNode`/`handleTalentModalClick`）：按节点列表渲染 + 命中测试，读取 `name`/`cost`/`level`/`max`/`prerequisite`/`perLevelPower`/`icon` 等；`icon`/`type`/`fill` 驱动绘制。
- `calculatePower` = Σ `talentData[c].level * talentData[c].perLevelPower` → 新节点带 `perLevelPower` 即自动计入战斗力（Phase 1 已保留）。
- `loadPlayerData` case 0：`talentData[a][l] = playerData[i][a]`（按 id 合并存档）→ 新 id 无存档则跳过，兼容。

## 5. v4.1 落地步骤（待执行）
1. **节点工厂** `makeTalent(opts)`：按 §3 结构产出节点对象（含 prerequisite 嵌套），避免手写 356 个字面量。
2. **生成 356 节点**：根脉(6×5=30) + 五行每系(强击10+锐目·克制10+致命·克制10+相生10+解锁Lv3/4/5=43)×5=215 + 防御(9×10=90) + 统御(21) = 356。每系分配连续 id（0..355，旧 22 个 id 对应 v4.1 前段以兼容存档）。
3. **替换生成函数**：把 `talentData=function(){…}[cU]();` 整句替换为 `talentData = {…356 节点…}`（纯数据）。
4. **扩展 `applyTalentsToBattle`**：在 switch 增补新节点 id 的 case，把 `level` 累加到对应 `talentMods` 字段（强击→coeff、锐目·克制→critChanceVsCounter、致命·克制→critMultVsCounter、相生→coeff[搭档]、精通阈值→coeff+奖励）。
5. **扩展 `oV`**：把有 MOD 效果的新节点 id 加入 `oV`。
6. **天赋 UI**：渲染 356 节点（需可滚动/分页树布局；原 UI 为固定布局，是最大未知量，需先读 `drawTalentModal` 布局代码）。
7. **消耗补丁**（per-element 暴击、克制额外flat/暴击迸发、相生 coeff、暴击基数 2.0→1.5）：在 `@84764`/`@152870` 暴击判定与 `@44089` 五行伤害 case 注入。

## 6. 开放项 / 风险
- `icon`/`type`/`fill` 的合法取值集需从 UI 绘制代码确认（否则新节点图标画不出）。→ 下一步读 `drawTalentNode`。
- 暴击当前为**全局** `talentMods` 单元格（`getCritChance→talentMods[lM[8][9]]`、`getCritMult→talentMods[lM[12][18]]`），无每系维度；锐目·克制/致命·克制需新增 `talentMods` 槽 + 多站点条件读取。
- 精通Ⅱ(克制击杀回墙血+12) 已定为五系统一。
- 技能解锁门控(解锁Lv3/4/5) 与 指挥中枢扩队列槽 按用户要求延后到后续轮次。
