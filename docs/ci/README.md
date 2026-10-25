# CI 启用说明

`.github/workflows/ci.yml` 需要有 **workflow** 权限的 PAT 才能推送（普通 repo scope 会被 GitHub 拒绝）。

当前做法：文件以模板形式放在 `docs/ci/workflow-ci.yml.example`，不影响推送。

启用步骤：

1. 到 https://github.com/settings/tokens 新建 Classic PAT，勾选 **repo + workflow**
2. 写入 `.pat`（无换行）
3. 执行：

```bash
mkdir -p .github/workflows
cp docs/ci/workflow-ci.yml.example .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "ci: 启用 GitHub Actions"
```

> 在此之前，本地用 `npm test` 保证质量即可（与 CI 跑的是同一套）。
