# cloudfunctions/shared/ — Common 模块规范源

**⚠️ 此目录是 `common/auth.js` 和 `common/db-utils.js` 的唯一真实来源（canonical source）。**

`repair_main/common/` 和 `repair_aux/common/` 下的文件应从此处同步，不应手动编辑。

## 修改流程

1. 修改 `cloudfunctions/shared/` 下的源文件
2. 运行 `npm run sync:common` 同步到所有云函数
3. 部署云函数前运行 `npm run check:sync` 确保一致性

## 脚本

- `npm run sync:common` — 从 `shared/` 同步到 `repair_main/common/` 和 `repair_aux/common/`
- `npm run check:sync` — 检查所有 common/ 目录是否与 shared/ 一致（自动化测试用）
