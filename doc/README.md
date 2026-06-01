# 📋 AI养车门店管理系统 — 项目文档

> **最后更新**：2026-05-24 | **当前版本**：v6.5.1
> **核心教训**：先加日志定位根因，再改代码；用数据说话，不凭猜测

---

## 一、项目定位与演进路线

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI养车门店管理系统                                    │
│              （微信小程序 / Donut 多端应用）                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  v3.0.0 (04-01) ──→ v3.2.1 (04-13) ──→ v4.0.0 (04-20)                 │
│     │                │                │                                 │
│     ▼                ▼                ▼                                 │
│  基础MVP         跨账号架构        员工权限系统                            │
│  车辆/工单/会员   云函数聚合       Pro版统一管理                           │
│                                                                         │
│  v4.6.0 (05-01) ──→ v4.7.0 (05-01) ──→ v5.0.0 (05-01)                 │
│     │                │                │                                 │
│     ▼                ▼                ▼                                 │
│  Bug修复          隐私合规          AI月报功能                            │
│  游客模式空白     车牌号脱敏       规则引擎+诊断报告                       │
│                                                                         │
│  v5.1.0 (05-02) ──→ v5.2.0 (05-04) ──→ v5.3.3 (05-07)                 │
│     │                │                │                                 │
│     ▼                ▼                ▼                                 │
│  多端应用模式      健壮性升级        全项目检修                             │
│  Donut适配        常量配置中心       80+处修复                            │
│                                                                         │
│  v6.0.0 (05-09) ──→ v6.3.0 (05-16) ──→ v6.5.0 (05-22)                 │
│     │                │                │                                 │
│     ▼                ▼                ▼                                 │
│  架构梳理          权限统一          云函数拆分+审查                       │
│  5个Phase全部完成  0安全隐患         Web后台M1~M5验证通过                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 技术栈

- **前端**：微信小程序原生框架 + 自定义 TabBar
- **云开发**：跨账号资源共享模式（资源方 appid: `wxb1c736174ede330c`）
- **多端**：Donut 框架（`app.miniapp.json` + `project.miniapp.json`）
- **Web后台**：Vue3 + Vite + ElementPlus（`web-admin/`，feature/web-pc 分支）
- **数据导出**：SheetJS (xlsx.full.min.js)

### 代码规模

| 模块 | 规模 |
|------|------|
| 页面 | 21 个（5 个 TabBar + 16 个普通页） |
| 组件 | 5 个 |
| 工具库 | 9 个文件 |
| 云函数 | 3 个（repair_main, login, cloudbase_auth） |
| 数据库集合 | 6 个 |

---

## 二、核心功能模块

| 模块 | 状态 | 关键文件 | 说明 |
|------|------|----------|------|
| **车辆管理** | ✅ 成熟 | carAdd/carDetail/carSearch/carList | 新增/编辑/搜索，车牌选择器弹层 |
| **工单管理** | ✅ 成熟 | orderAdd/orderList/orderDetail | 快速开单/作废/编辑 |
| **会员管理** | ✅ 成熟 | memberAdd/memberList | 权益核销/次数扣减 |
| **数据看板** | ✅ 成熟 | dashboard | 今日营收/趋势图 |
| **营收报表** | ✅ 成熟 | report | 多维度分析+缓存策略 |
| **电子查车单** | ✅ 成熟 | checkSheet/checkSheetDetail | 2列3行卡片布局 |
| **员工权限系统** | ✅ 稳定 | proUnlock/welcome | admin/staff角色，自定义TabBar |
| **AI月报诊断** | ✅ Phase 4完成 | monthlyReport/case-modal | 健康评分+雷达图+案例弹窗 |
| **多端兼容** | ✅ 可用 | app.js | 小程序/Donut双模式 |
| **Web PC后台** | 🚧 开发中 | web-admin/ | Dashboard+ECharts，M6~M12待开发 |

---

## 三、技术架构

```
┌──────────────────────────────────────────────────────┐
│                     前端层                            │
│  app.js (核心)                                       │
│  ├── _isMultiEndMode()    平台检测                   │
│  ├── db()                 数据库实例（跨账号缓存）    │
│  ├── callFunction()       云函数调用（多端兼容）      │
│  ├── shopWhere()          数据隔离（shopPhone）      │
│  ├── _checkProStatus()    Pro状态判断                 │
│  ├── checkPageAccess()    页面权限守卫               │
│  ├── isGuest/isStaff/isSuperAdmin() 角色判断         │
│  └── callRepair(action)   聚合云函数入口             │
├──────────────────────────────────────────────────────┤
│                     云函数层                           │
│  repair_main (路由模式)                               │
│  └── 32 个 action，统一 checkPermission() 鉴权        │
├──────────────────────────────────────────────────────┤
│                     数据层                            │
│  repair_orders / repair_cars / repair_members        │
│  repair_activationCodes（含 staff/激活码/门店配置）   │
│  repair_monthlyReports / repair_checkSheets          │
│  └── 所有集合通过 shopPhone 字段隔离                  │
└──────────────────────────────────────────────────────┘
```

### 数据获取策略

| 方式 | 页面 | 原则 |
|------|------|------|
| **云函数** | dashboard, report, monthlyReport, carList, orderList, memberList, checkSheetList, dataExport（8个） | 含分页/聚合的查询统一走云函数 |
| **客户端DB** | carSearch, carAdd, carDetail, orderDetail, memberAdd, checkSheetDetail, proUnlock（7个） | 单条/少量查询，无分页需求 |

---

## 四、角色 × 权限矩阵（v6.0 统一）

### 4.1 功能权限

| 功能 | 游客 | 免费管理员 | Pro管理员 | 超级管理员 | 员工(staff) |
|------|------|-----------|---------|----------|------------|
| 查看看板 | ✅ 示例数据 | ✅ | ✅ | ✅ | ✅ |
| 搜索车辆 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 新增车辆 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 编辑车辆 | ❌ | ✅ | ✅ | ✅ | ❌ |
| 开单 | ❌ | ✅(限100单) | ✅ | ✅ | ✅ |
| 作废工单 | ❌ | ✅ | ✅ | ✅ | ❌ |
| 新增会员 | ❌ | ✅(限10个) | ✅ | ✅ | ✅ |
| 查看报表 | ❌ | 仅今日 | ✅ | ✅ | ❌(隐藏Tab) |
| AI月报 | ❌ | ❌ | ✅ | ✅ | ❌(隐藏Tab) |
| 数据导出 | ❌ | ❌ | ❌ | ✅ | ❌ |
| 员工管理 | ❌ | ❌ | ✅ | ✅ | ❌ |
| 修改门店信息 | ❌ | ✅ | ✅ | ✅ | ❌ |
| 查车单 | ❌ | ✅ | ✅ | ✅ | ✅ |

### 4.2 TabBar 可见性

| Tab | 游客 | 管理员 | 员工 |
|-----|------|--------|------|
| 首页 | ✅ | ✅ | ✅ |
| 会员 | ✅ | 可配置 | ✅ |
| 车辆 | ✅ | 可配置 | ❌ |
| 报表 | ✅ | ✅ | ❌ |
| 我的 | ✅ | ✅ | ❌ |

### 4.3 数据隔离

| 隔离维度 | 实现方式 | 位置 |
|---------|---------|------|
| 门店数据隔离 | `shopPhone` 字段查询过滤 | `app.shopWhere()` |
| 多端缓存隔离 | `_platform` 标记 | `app.js _restoreShopInfo` |
| 员工权限限制 | 前端 Tab 隐藏 + 后端角色检查 | custom-tab-bar + 云函数 |

---

## 五、v6.0 架构梳理成果

### Phase 1：紧急修复 ✅

- 客户端 `.limit(100)` 被截断为 20 → `CLIENT_LIMIT = 20` 常量
- `updateOpenid` / `updateStaffOpenid` 加鉴权
- 硬编码 PAGE_SIZE 统一化
- carSearch 搜索加 limit 保护

### Phase 2：权限统一 ✅

- 云函数 `ACTION_PERMISSIONS` — 32 个 action 全部配置权限等级
- 统一鉴权 `checkPermission()` + `_getCallerRecord()` + `_validatePhoneAccess()`
- 前端 `checkPageAccess()` 守卫 + `isGuest/isStaff/isSuperAdmin()` 全局方法
- 删除旧 `_validateWriteAccess`，6 个 P1 安全隐患全部清零

### Phase 3：云函数拆分 ⏸️ 暂不实施

repair_main 虽有 32 个 action，但路由模式各 action 独立运行正常。拆分需改所有调用点，风险大于收益。

### Phase 4：数据获取统一 ✅

新增 5 个云函数查询 action（listCars/listOrders/listMembers/listCheckSheets/exportData），carList/orderList/memberList/checkSheetList/dataExport 全部迁移到云函数，消除客户端数据丢失风险。

### Phase 5：数据库拆分 ⏸️ 暂不实施

`repair_activationCodes` 查询走 `shopPhone` 索引无瓶颈，数据迁移不可逆，风险极高。

### 架构健康度总结

| 等级 | 状态 |
|------|------|
| 🔴 P0 Bug | ✅ 全部清零 |
| 🟡 P1 安全隐患 | ✅ 6 项全部修复 |
| ⚪ P2 架构欠债 | ⏸️ 4 项暂不实施（运行正常，不动） |

---

## 六、页面架构一览

| 页面 | 数据来源 | 分页 | 权限 | 缓存 | 代码行数 |
|------|---------|------|------|------|---------|
| dashboard | 云函数 | 无 | registered | 内存 | ~450 |
| welcome | 客户端+云函数 | 无 | public | shopInfo | ~700 |
| carSearch | 客户端DB | limit(20) | shopWhere | 无 | ~350 |
| carAdd | 客户端+云函数 | 无 | registered | 无 | ~400 |
| carDetail | 客户端+云函数 | 无 | isStaff | 无 | ~600 |
| carList | 云函数(listCars) | 客户端分页 | admin | 双层TTL | ~430 |
| orderAdd | 客户端+云函数 | 无 | registered | servicePhrases | ~750 |
| orderList | 云函数(listOrders) | 服务端分页 | registered | 竞态保护 | ~180 |
| orderDetail | 客户端DB | 无 | isStaff | 无 | ~350 |
| memberAdd | 客户端+云函数 | 无 | registered | 无 | ~450 |
| memberList | 云函数(listMembers) | 服务端分页 | admin | 竞态保护 | ~240 |
| checkSheet | 客户端+云函数 | 无 | registered | 无 | ~450 |
| checkSheetList | 云函数(listCheckSheets) | 服务端分页 | registered | 无 | ~120 |
| checkSheetDetail | 客户端DB | 无 | shopPhone | 无 | ~350 |
| proUnlock | 客户端+云函数 | 无 | 多角色 | 多Storage | ~900 |
| dataExport | 云函数(exportData) | 服务端全量 | superAdmin+pro | 无 | ~290 |
| report | 云函数 | 无 | admin+pro | 按日Storage | ~600 |
| monthlyReport | 云函数 | 无 | admin+pro | 无 | ~550 |
| privacy | 无 | 无 | public | 无 | ~30 |
| userAgreement | 无 | 无 | public | 无 | ~30 |

---

## 七、版本迭代逻辑

### P0 — 核心业务流程
v3.0.0 → 车辆管理 + 工单管理 + 会员管理 + 电子查车单
v3.1.0 → 数据看板 + 报表 + Pro激活

### P1 — 架构稳定性和安全性
v3.2.x → 跨账号资源共享架构
v4.0.0 → 员工权限系统 + 自定义TabBar
v6.0.0 → 架构梳理（权限统一/数据策略统一/安全隐患清零）

### P2 — 体验优化和合规
v3.3.x → 登录页重构 + UI优化 + 游客模式
v4.1.0 → 查车单完善 + 使用帮助
v4.7.0 → 车牌号脱敏（隐私合规）

### P3 — 智能化增值功能
v5.0.0 → AI月报（规则引擎版）
v5.1.0 → 多端应用模式（Donut适配）
v5.2.0 → 健壮性升级（常量配置中心）
v5.3.3 → 全项目健壮性检修（80+处修复）
v6.3.0 → Web端PC管理后台（M1~M5可行性验证通过）

---

## 八、项目约束与红线

| 约束类型 | 内容 |
|---------|------|
| **向后兼容** | 已发布版本不能影响老用户正常使用 |
| **云函数接口** | 现有 action 入参/出参不可变更 |
| **数据库安全** | 可新增字段，不得删除/重命名字段 |
| **跨账号依赖** | resourceAppid/resourceEnv 必须正确配置 |
| **Pro 状态判断** | code 有值 + expireTime 未过期（不用 code === unlockKey） |
| **报表缓存** | 本周/本月/本年每日仅拉取一次，今日实时 |

---

## 九、开发方法论

### ❌ 错误做法（4 小时，5 次失败）
```javascript
// 猜测式提问 → 方案导向修改
Q: "用 shopPhone 行不行？"    → ❌ 还是店主手机号
Q: "用 cloudRecord.phone？"  → ❌ 也是店主记录
Q: "加多重条件判断兜底？"     → ❌ 条件复杂且未验证
```

### ✅ 正确做法（1.5 小时，1 次成功）
```javascript
// 验证式提问 → 数据驱动修改
Q: "先加日志看实际值是什么？"
→ 日志揭示：welcome.js 已正确写入员工手机号
→ 根因：proUnlock 被云端店主记录覆盖
→ 方案：用 addedBy 判断是否员工 → 直接取缓存的 phone（1行解决）
```

### 方法公式
```
遇到 Bug 时：
  ① 在关键节点加 console.log（入参/中间变量/返回值）
  ② 真机复现，运行一次，收集日志
  ③ 根据日志精确定位失败节点
  ④ 基于真实数据设计最简方案
  ⑤ 清理调试日志

禁止：
  ✗ 凭记忆/直觉猜测字段含义
  ✗ 未验证实际值就"换个字段试试"
  ✗ 用更复杂的条件掩盖根因
```

---

## 十、文档索引

| 文档 | 用途 |
|------|------|
| `doc/README.md` | 本文档 — 项目全景文档 |
| `doc/update-log.md` | 完整版本更新日志 |
| `doc/开发维护规范.md` | 长期开发维护规范（编码标准/流程） |
| `doc/PRE_RELEASE_CHECKLIST.md` | 发布前通用检查清单 |
| `doc/微信小程序跨账号云环境共享开发指南.md` | 跨账号资源共享技术参考 |
| `doc/项目开发Bug知识库.md` | 80+ Bug 经验沉淀 |
| `doc/隐私合规申诉材料.md` | 审核相关材料 |
| `doc/git-branch-cheatsheet.md` | Git 日常操作参考 |
| `doc/v6.3.0-Web端PC管理后台开发文档.md` | Web后台技术文档 |
| `doc/v6.5.0-审查测试计划.md` | v6.5.0 审查审计记录 |

---

## 十一、关键经验速查

| # | 经验 | Memory ID |
|---|------|-----------|
| 1 | **调试方法论**：先定位再动手，加日志定位根因 | 43015945 / 94558585 |
| 2 | **多端适配**：Donut 模式 wx.cloud.init 必须传 appid+envid | 26858283 |
| 3 | **跨账号架构**：`new wx.cloud.Cloud({ resourceAppid, resourceEnv })` | 77330490 |
| 4 | **Pro 状态**：code 有值 + expireTime 未过期 | 77330490 |
| 5 | **车牌选择器**：max-height=60vh, limit=3, 系数0.40 | 79793069 |
| 6 | **报表缓存**：本周/本月/本年每日一次，今日实时 | 16826771 |
| 7 | **v4.0 红线**：不能影响已发布版本 | 33244367 |
| 8 | **员工权限**：员工Pro状态继承店主 | 36919310 |
| 9 | **游客模式**：共享真实账号，有意为之的设计 | 18000204 |

---

*本文档基于项目开发全过程的历史记录和代码变更分析*
