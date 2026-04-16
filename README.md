# 制霸新手村的骷髅怪 - 微信小游戏版

## 📦 项目结构

```
zombie-hunter-game/
├── game.js             # 游戏主逻辑
├── game.json           # 游戏配置
└── project.config.json # 项目配置（需填写AppID）
```

## 🚀 使用步骤

### 第一步：注册微信小游戏

1. 访问 [微信公众平台](https://mp.weixin.qq.com/)
2. 注册账号，选择「小程序」→「游戏」类目
3. 完成个人主体认证（免费）

### 第二步：获取AppID

1. 登录微信公众平台
2. 进入「开发」→「开发管理」
3. 复制 AppID

### 第三步：配置项目

1. 打开 `project.config.json`
2. 将 `appid` 改为你的 AppID：

```json
"appid": "你的AppID"
```

### 第三步：导入项目

1. 下载 [微信开发者工具](https://developers.weixin.qq.com/minigame/dev/devtools/download.html)
2. 选择「小游戏」项目类型
3. 导入本项目目录：`/workspace/zombie-hunter-game/`

### 第四步：测试和发布

1. 在开发者工具中预览测试
2. 点击「上传」提交审核
3. 审核通过后即可发布

## 🎮 游戏特性

| 功能 | 状态 |
|------|------|
| 6个关卡 | ✅ |
| 自动射击 | ✅ |
| 升级系统 | ✅ |
| 多种僵尸 | ✅ |
| 炸弹技能 | ✅ |
| 进度保存 | ✅ |

## 📱 操作说明

- **自动射击**：角色自动攻击最近的敌人
- **使用炸弹**：点击屏幕底部区域释放炸弹
- **选择关卡**：点击关卡卡片进入

## ⚠️ 注意事项

1. 个人主体小游戏**无需备案域名**
2. 代码包大小限制 **4MB**
3. 目前版本为精简版，完整版需要进一步优化

## 🔄 与H5版本差异

| 功能 | H5版本 | 小游戏版本 |
|------|--------|-----------|
| UI界面 | DOM元素 | Canvas绘制 |
| 音频 | Web Audio | 需适配 |
| 存储 | localStorage | wx.setStorageSync |
| 触摸 | touch事件 | wx.onTouchStart |

---

如有问题，请查看[微信小游戏官方文档](https://developers.weixin.qq.com/minigame/dev/guide/)
