# CI 状态

**已启用**（2026-10-25）：`.github/workflows/ci.yml` 随 `main` 推送自动运行，首次运行 **success**。

跑的内容与本地 `npm test` 完全一致：

1. `node --check game.js`
2. `node scripts/run_all_tests.js`（9 套 smoke）
3. `node scripts/sim_v22_real.js`（模拟器可运行）

## 如果 CI 报"workflow scope"错误

说明当前 PAT 只有 `repo` 权限。到 https://github.com/settings/tokens 新建 Classic PAT，勾 **repo + workflow**，写入 `.pat`（无换行）。

## 模板

`workflow-ci.yml.example` 保留作为备份，改动 CI 时同时同步两处。
