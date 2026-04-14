# 跨设备开发指南

## 🚀 快速开始（GitHub）

### 第一步：创建GitHub仓库

1. 打开浏览器访问 [GitHub](https://github.com)
2. 点击右上角 `+` → `New repository`
3. 填写信息：
   - Repository name: `zombie-hunter`
   - 选择 `Private`（私有）或 `Public`（公开）
   - **不要**勾选 "Add a README file"
4. 点击 `Create repository`

### 第二步：在电脑上推送代码

打开终端，执行以下命令：

```bash
# 进入项目目录
cd /你的路径/zombie-hunter-repo

# 关联远程仓库（替换成你的用户名）
git remote add origin https://github.com/你的用户名/zombie-hunter.git

# 推送代码
git branch -M main
git push -u origin main
```

### 第三步：其他设备克隆代码

**电脑端：**
```bash
git clone https://github.com/你的用户名/zombie-hunter.git
cd zombie-hunter
```

**手机端（使用Termux）：**
```bash
# 安装git
pkg install git

# 克隆仓库
git clone https://github.com/你的用户名/zombie-hunter.git
cd zombie-hunter
```

---

## 📱 推荐工具

### 电脑端

| 工具 | 用途 |
|------|------|
| [VS Code](https://code.visualstudio.com/) | 代码编辑 |
| [GitHub Desktop](https://desktop.github.com/) | Git图形界面 |
| Git Bash | 命令行工具 |

### 手机端

| 工具 | 用途 |
|------|------|
| [Termux](https://termux.com/) | Android终端 |
| [Git Touch](https://github.com/git-touch/git-touch) | Git客户端 |
| [Code App](https://code.app/) | iOS代码编辑 |

---

## 🔄 日常工作流

### 开始工作
```bash
# 拉取最新代码
git pull
```

### 完成工作后
```bash
# 查看修改
git status

# 添加所有修改
git add -A

# 提交
git commit -m "描述你的修改"

# 推送到GitHub
git push
```

---

## 💡 小技巧

1. **提交前先拉取**
   ```bash
   git pull --rebase
   ```

2. **查看修改历史**
   ```bash
   git log --oneline
   ```

3. **撤销未提交的修改**
   ```bash
   git checkout -- 文件名
   ```

---

## 📦 项目内容

| 目录 | 说明 |
|------|------|
| `zombie-hunter-levels/` | H5闯关版游戏 |
| `zombie-hunter-game/` | 微信小游戏版 |
| `zombie-hunter-game.zip` | 小游戏打包 |

---

## ⚠️ 注意事项

1. **私有仓库**：敏感代码使用私有仓库
2. **定期推送**：养成经常 push 的习惯
3. **写好提交信息**：方便回溯历史
