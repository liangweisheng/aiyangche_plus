# AI养车门店管理系统 — 版本更新日志

---

## v6.1.0（2026-05-15）

### 功能新增

1. **车牌OCR识别系统（全新核心能力）**
   - 新增 `utils/ocrHelper.js` 统一入口，封装拍照→压缩→base64→云函数识别→回调回填的完整流程（`scanPlate` / `scanVIN` 两个 API）
   - **10 个页面集成车牌拍照识别**：新增车辆、编辑车辆、快速开单（主页面+车牌选择器弹层）、工单列表、车辆列表、会员列表、新增会员、查车单、查车单列表、Dashboard 首页快速搜索
   - 各页面拍照识别后弹确认框，确认后自动回填车牌号到输入框
   - 云函数新增 `ocrPlate` action（权限等级：registered），调用腾讯云 OCR 通用识别接口

2. **VIN车架号OCR识别（新增）**
   - `ocrHelper.js` 新增 `scanVIN()` 函数，调用云函数 `ocrVIN` action
   - 云函数 `ocrVIN` 使用 TC3-HMAC-SHA256 签名直调腾讯云 `VinOCR` API，零外部依赖（仅内置 https + crypto 模块）
   - 新增车辆页、编辑车辆弹窗的车架号输入框旁增加拍照按钮，OCR 识别结果确认后回填

3. **车辆详情页新增照片管理功能**
   - 新增照片网格展示区，支持拍照/相册选择上传，最多 9 张
   - 照片以三列网格布局展示，单张支持全屏预览和单独删除
   - 上传至跨账号云存储，通过临时 URL 展示
   - 无照片时显示引导占位区，点击即可添加照片

4. **Dashboard 快速搜索增强**
   - 搜索字段扩展：支持模糊搜索车型（`carType` 字段），与手机号、车主姓名的第二步搜索合并执行
   - 搜索结果列表新增车型展示，格式为 ` · 卡罗拉`

### 云函数变更

5. **repair_main 新增 2 个 action**
   - `ocrPlate` — 车牌OCR识别（触发腾讯云通用OCR API）
   - `ocrVIN` — 车架号VIN码OCR识别（触发腾讯云 VinOCR API）
   - 全部注册 `ACTION_PERMISSIONS` 权限配置（`registered` 级别）
   - 全部加入 handler 路由表
   - action 列表总计更新为 40 个

### 代码质量

6. **零 lint 错误通过** — 新增代码全部遵守 eslint 规范

**变更统计：** ~23 文件
- 🆕 `utils/ocrHelper.js`（~125行，scanPlate + scanVIN）
- 📝 `cloudfunctions/repair_main/index.js`（ocrPlate + ocrVIN 双 action，含 TC3-HMAC-SHA256 签名）
- 📝 `pages/dashboard/`（搜索增强 + 车牌识别按钮）
- 📝 `pages/carAdd/`（VIN 拍照识别）
- 📝 `pages/carDetail/`（车辆照片管理 + 编辑弹窗 VIN 拍照识别）
- 📝 `pages/orderAdd/`、`pages/orderList/`、`pages/carList/`、`pages/memberAdd/`、`pages/memberList/`、`pages/checkSheet/`、`pages/checkSheetList/`（车牌 OCR 识别集成）
- 📝 `utils/constants.js`（版本号更新至 v6.1.0）

**向后兼容性：** ✅ 数据库字段未变更，action 入参/出参新增不破坏旧调用，历史页面无感知

**部署注意：** ⚠️ 云函数有变更，**需要上传并部署** `repair_main` 云函数到正式环境

---

## v6.0.9（2026-05-14）

### 功能新增

1. **工单管理增强：毛利与成本核算**
   - 新增实收金额编辑弹窗，工单保存前可修改实收金额
   - 新增配件成本字段（partCost），支持录入配件成本
   - 自动计算本单毛利（实收金额 - 配件成本）并展示毛利率
   - 新增数字键盘组件，优化金额输入体验
   - 工单保存成功后自动跳转工单详情页（原仅 navigateBack）
   - 提取 `_finalizeOrderSave` 独立方法，金额超限校验后继续执行

2. **"我的"页面全面重构**
   - 系统设置合并为单一折叠卡片（含工位数/开业年份设置 + 导航栏设置）
   - 激活 Pro 版、使用帮助改为独立折叠卡片（默认收起）
   - 新增显示名称字段，支持在个人信息区编辑
   - 新增底部「退出登录」卡片（仅管理员员工可见）
   - 硬编码常量（免费版限制/客服电话）替换为 `constants` 引用

3. **查车单内置车牌搜索（checkSheet）**
   - 无 `plate` 参数时显示搜索界面：最近车辆列表 + 车牌模糊搜索
   - 搜索结果或最近车辆点击自动加载车辆信息进入检查表单
   - 车牌号可点击跳转车辆详情页
   - 新增"历史查车单"按钮，按车牌筛选跳转查车单列表

### 健壮性增强

4. **`callFunction` clientPhone 全量注入**
   - 客户端调用云函数时所有模式注入 `clientPhone`（不限多端/游客）
   - 消除一处 `[callRepair]` DEBUG 日志

5. **公共方法抽取**
   - `utils/util.js` 新增 `formatOperatorName(name, phone)` 操作人展示格式化方法
   - 查车单/工单保存自动携带 `operatorName` 操作人姓名

6. **onUnload 资源清理**
   - checkSheet 页面新增 `onUnload` 清理搜索防抖计时器
   - orderAdd 页面新增 `onUnload` 清理车牌选择器计时器+临时缓存

---

## v6.0.8（2026-05-13）

### 功能新增

1. **Dashboard 页新增快速搜索框**
   - 首页新增车牌号/手机号快速搜索输入框
   - 输入后显示搜索结果列表，支持点击跳转车辆详情/开单/查车单

2. **proUnlock 页面布局调整**
   - 优化页面整体布局和卡片排列

### Bug 修复

3. **修复 memberAdd 重复新增车辆信息**
   - 修复会员新增页面中因防抖延迟或快速操作导致同一车辆信息被重复添加的问题

### 组件优化

4. **清空按钮尺寸统一加大**
   - carList / orderList / memberList / checkSheetList / carSearch / dashboard 6 页搜索框清空按钮容器从 48rpx 加大至 56rpx，图标字号从 22rpx 加大至 28rpx
   - 提升点按易用性

---

## v6.0.7（2026-05-12）

### 安全增强

1. **员工账号登录互斥绑定**
   - `updateStaffOpenid`：员工绑定 openid 时自动清除同店店主的 openid 绑定（防止 `_loadShopByOpenid` 优先匹配店主记录导致越权）
   - 同时清除同店内其他员工记录中相同的 `staffOpenid`（防止同一微信登录多个员工账号）
   - `updateOpenid`：店主绑定 openid 时自动清除同店员工的 `staffOpenid`（双向互斥）
   - 绑定前验证 `staffOpenid` 归属，已绑定其他微信时拒绝

2. **clientPhone 注入条件增强**
   - app.js `callFunction` 新增游客模式 `isGuest` 注入条件
   - 新增 `_isMultiEndMode` 全局兜底检测，扩大 clientPhone 注入覆盖范围

### 功能新增

3. **会员权益卡支持金额并自动生成工单**
   - 新增权益卡金额字段（`amount`），在添加权益时录入
   - 保存会员成功后，自动以权益名称为服务项目、权益卡金额创建已完成工单
   - 工单创建使用 `_skipAmountCheck: true` 绕过金额校验
   - `useBenefit` 云函数返回 `orderId`，核销后自动跳转工单详情页

4. **检车单空单保存检测**
   - 遍历全部 8 项检查项，全空时拦截并提示"空检测单无法保存"
   - 只要有任意一项有内容（含标记正常），可正常保存

### 权限调整

5. **普通员工开放车辆信息编辑权限**
   - `carDetail.js` 移除所有 `isStaff()` 前端拦截
   - 员工在 carAdd、orderAdd、carDetail 均可编辑车辆信息/车主信息/提醒事项
   - 云函数 `updateCarInfo` 权限等级为 `'registered'`（含员工），两端保持一致

6. **工单编辑模式允许金额为 0**
   - `orderAdd.js` 编辑模式跳过 `totalAmount <= 0` 校验
   - 新增模式仍拦截金额为 0（必须输入金额）
   - 云函数 `createOrder` 接受 `_skipAmountCheck` 参数绕过校验

### 代码清理

7. **全部 DEBUG 日志清理**
   - app.js 清除 4 处 `[DEBUG-*]` 日志
   - 云函数 `repair_main/index.js` 清除 20 处 `[DEBUG-*]` 日志（含 checkPermission 三层鉴权、_getCallerRecord 两层查询、checkShopAccess、listCars/listMembers/listCheckSheets）
   - 页面 carList/memberList/checkSheetList 清除 `[DEBUG-*]` 日志
   - utils/util.js 清除 `[DEBUG-callRepair]` 日志

**变更统计：** 8 文件（app.js / index.js / carList.js / memberList.js / checkSheetList.js / checkSheet.js / memberAdd.js / update-log.md）

---

## v6.0.6（2026-05-12）

### 功能重构

1. **员工"我的资料"卡片 → 独立页面**
   - 新建 `pages/staffProfile/staffProfile` 独立页面（4文件：js/wxml/wxss/json）
   - dashboard 内嵌的员工资料卡片替换为入口按钮「👤 我的资料 >」
   - 点击入口按钮 → `navigateTo` 跳转独立资料页，体验更好，不与 dashboard 数据混叠
   - `_onLoginReady` 修复：增加员工身份处理（`isStaff`/`isAdminRole`/`showReportCard`），员工不加载月报

2. **联系客服模块对齐 proUnlock 风格**
   - staffProfile 联系客服改为 proUnlock 折叠卡片风格
   - 在线客服按钮：多端模式下隐藏（`wx:if="{{!_isMultiEnd}}"`）
   - 新增"下载APP入口"（"汽修店小管家"）
   - 使用帮助：多端模式提示"仅小程序端可用"

### 代码清理

3. **dashboard.js 删除全部员工交互方法（~95行）**
   - 删除：`_loadStaffProfile` / `onEditStaffDisplayName` / `toggleStaffContact` / `onCopyStaffWechat` / `onCallStaffPhone` / `onGoStaffVideoHelp` / `onStaffLogout` 共7个方法
   - 删除 data 中 `staffPhone`/`staffDisplayName`/`versionLabel`/`staffContactExpanded` 4个字段
   - 删除 `dashboard.wxss` 全部 `.staff-*` 样式（~180行）
   - 新增 `goToStaffProfile()` 入口方法

### 多端模式增强

4. **云函数新增多端登录支持（loginByPhoneCode）**
   - 新增 `loginByPhoneCode` action：支持手机号+门店码登录验证
   - 并行查询管理员和员工记录，返回完整角色/门店信息
   - `_checkShopAccess` 支持多端：空 openid 信任 shopPhone
   - `getCallerAdminInfo` 支持多端：shopPhone 优先查询

5. **多端24小时信任窗口缓存**
   - `app.js` 新增 `_autoLoginMultiEnd()`：24h 内免密恢复登录态
   - 新增 `_validateMultiEndCache()`：超24h 云端验证，网络异常信任本地缓存
   - 缓存增加 `_platform` 标记（`multiend`/`miniprogram`），防止缓存污染
   - `constants.js` 新增 `MULTIEND_CACHE_TTL_HOURS = 24`

**变更统计：** 10文件（+406 / -295 行，净增 ~111 行）
- 🆕 staffProfile.js / wxml / wxss / json
- 📝 app.json / dashboard.js / wxml / wxss
- 📝 app.js（`_autoLoginMultiEnd` / `_validateMultiEndCache` / `_platform` 标记）
- 📝 cloudfunctions/repair_main/index.js（`loginByPhoneCode` / 多端鉴权适配）
- 📝 utils/constants.js（`MULTIEND_CACHE_TTL_HOURS`）
- ⚠️ 云函数有变更，**需要重新部署**

---

## v6.0.5（2026-05-12）

### 新功能

1. **员工管理员退出登录**
   - proUnlock 页面底部新增"退出登录"卡片，仅管理员员工（`isAdminRole = true`）可见
   - 超级管理员（`isOwner`）和游客（`isGuest`）不显示退出按钮
   - 点击 → 确认弹窗 → 清本地缓存 → 清云端 staffOpenid 绑定 → 跳转登录页

### 代码清理

2. **缓存清除方法抽取**
   - `app.js` 新增 `_clearAuthCache()` 公共方法，`_forceLogout` / `_forceLogoutAndEnterGuest` 共用
   - 新增 `staffLogout()` 方法：与 `logout()` 区别在于不进入游客模式（多端模式下游客模式不可用）

**变更统计：** 4 文件（app.js / proUnlock.js / proUnlock.wxml / proUnlock.wxss）

---

## v6.0.2（2026-05-11）⚠️ 暂不提交审核发布

### 功能优化

1. **4 个列表页表头固定（sticky-header）**
   - orderList / memberList / checkSheetList / carList 搜索栏 + 统计/筛选区域包裹 `.sticky-header` 实现 `position: sticky; top: 0`，滚动时表头吸顶
   - 4 页统一新增 `🏠首页` 按钮放入 sticky 区域（替代原 checkSheetList 的浮动首页按钮）
   - 搜索框宽高统一 `flex:1` 补齐
   - 底部留白统一 280rpx
   - 4 页右下角浮动按钮统一胶囊形（圆角 40rpx），文字图标化：`＋会员` / `＋工单` / `＋查车单` / `＋车辆`

2. **导航栏设置权限开放**
   - 新增 `isAdminRole` 标识（`!isOwner && role==='admin' && isStaff`）
   - 导航栏设置面板从「仅超级管理员」放宽至超级管理员 / 管理员员工 / 游客均可可见可操作
   - Staff 店员仍然不可见

3. **报表页增强（report）**
   - 删除免费版限制提示横幅（`pro-tip-banner`），减少视觉干扰
   - 新增月份/年份前后翻页选择器，支持查看历史月份/年份报表
   - 新增空数据提示（`📭 当前时段暂无工单数据`）
   - 月份选择器包含边界保护（禁止翻越到未来月份）
   - 日期范围计算基于选择器值，缓存 key 含年月份支持多时期各自缓存
   - 新增 `_reqVersion` 竞态保护，防止异步覆盖
   - 下拉刷新失败增加 toast 提示
   - 空态增加 `isEmpty` 判断，无数据时隐藏所有卡片

4. **`app.isGuest()` 全局标记方法**
   - 新增 `app.isGuest()` 全局统一方法（三方兜底判断）
   - splash / report / welcome 等处分散的 isGuest 判断统一改为 `app.isGuest()` 调用
   - 游客进入时 `shopInfo` 注入 `role: 'admin'`，享有 admin 角色体验
   - 同步门店联系方式到独立存储键（`shopTel` / `shopAddr`）

5. **游客模式登录取消兜底**
   - `welcome.js` 的 `onCancelPrivacyModal` / `onCancelLogin` 增加兜底：无游客缓存时调用 `app._enterGuestMode()` 进入游客模式
   - 之前只恢复已有游客缓存，无缓存的取消操作会进入空白页
   - 新增 loading 提示（"进入体验模式..."）

6. **云函数 `callFunction` 自动注入鉴权参数**
   - app.js `callFunction` 自动注入 `shopPhone` / `clientOpenid` / `clientPhone`
   - -403 错误智能区分「账号失效」和「权限不足」：真正的失效才强制登出，权限不足仅提示不登出

### 新增功能

7. **服务端消费总额聚合**
   - 云函数新增 `getTotalSpent` action：按车牌聚合历史消费总额（替代客户端DB直查，突破 20 条限制）
   - orderAdd 页面消费总额查询改用 `getTotalSpent` 云函数

8. **服务端车辆历史统计**
   - 云函数新增 `getCarOrderStats` action：按车牌聚合已完成工单的历史金额 + 工单数

### Bug 修复

9. **月度报告（monthlyReport）健壮性加固**
   - `onLoad` 增加 `app.checkPageAccess('admin+pro')` 权限守卫
   - 增加 `onUnload` 生命周期处理：离开时自动关闭案例弹窗，防止页面栈混乱
   - 切换月份加载失败时恢复旧报告，避免白屏
   - 评分 `0` 显示修复：WXML 中 `0 || '--'` 的 falsy 陷阱 → JS 预计算 `_displayTotal` 字段
   - 开业月份计算修正：`(now.getMonth() + 1)` → `now.getMonth()`（减去当月偏移）

10. **登录页面缺陷修复**
    - 新注册账号时清除 `isGuestMode` 和 `proType` 残留缓存
    - 登录按钮增加 `disabled="{{submitting}}"` 防重复提交
    - 客服号码硬编码替换为 `constants.SERVICE_PHONE`

11. **报表面板加载兜底**
    - report 页 `onShow` 中 registered 为 false 时调用 `loadData()` 补救（防 onLoad 未正确设置）
    - 游客模式统一使用 `app.isGuest()`，消除 `shopInfo.phone === '13507720000'` 散落的硬编码判断

### 代码清理

12. **DEBUG 日志清理**
    - app.js `_isMultiEndMode` 中 2 处 `console.log` 移除
    - utils/util.js `callRepair` 中 1 处 `console.log` 移除

13. **死代码清理**
    - report-card 组件中重复的 `ymlabel` 赋值清理
    - memberAdd 中 `textarea` 改为 `input`（降低页面复杂度）
    - 硬编码 `10` → `constants.FREE_MAX_MEMBERS`

14. **缓存清除方法抽取**
    - `app.js` 新增 `_clearAuthCache()` 公共方法，`_forceLogout` / `_forceLogoutAndEnterGuest` 共用
    - tabBar 页面列表硬编码改为引用 `constants.TAB_BAR_PAGES`

15. **onUnload 资源清理增强**
    - orderAdd 新增 `onUnload`：清 `carPickerTimer` 计时器 + 清理车牌回调缓存
    - memberAdd 新增 `onUnload`：清 `searchTimer` 搜索防抖计时器
    - splash 定时器绑定 `page._textTimer` + `onUnload` 清理

---

## v6.0.0（2026-05-11）

### 架构重构 — 3 个 Phase 深度清理

#### Phase 1：紧急修复与常量统一

1. **客户端 limit 安全修复**
   - 新增 `constants.CLIENT_LIMIT=20`，carList.js/dataExport.js 改用 CLIENT_LIMIT
   - carSearch 搜索查询加显式 `.limit(constants.CLIENT_LIMIT)`，消除数据截断风险

2. **分页常量统一化**
   - orderList/memberList/checkSheetList 三页硬编码 `PAGE_SIZE=20` 统一改为 `constants.DEFAULT_PAGE_LIMIT`

3. **云函数鉴权加固**
   - `updateOpenid` 加鉴权：验证 openid 归属，支持 `clearOpenid` 退出登录，防止越权修改
   - `updateStaffOpenid` 加鉴权：强制用调用者 openid，验证员工记录已绑定状态，防止越权绑定
   - app.js 退出登录调用 updateOpenid 传 `clearOpenid:true`

#### Phase 2：统一权限系统

4. **云函数端统一鉴权**
   - 新增 `ACTION_PERMISSIONS` 配置：32 个 action 全部配置权限等级（public / registered / admin / superAdmin / +pro）
   - 新增统一鉴权函数 `checkPermission()` + `_getCallerRecord()` + `_validatePhoneAccess()`
   - 删除旧 `_validateWriteAccess`，统一由 `checkPermission` 承担

5. **前端权限守卫**
   - app.js 新增 `checkPageAccess()` 守卫 + `isGuest()` / `isStaff()` / `isSuperAdmin()` / `isRegistered()` 全局方法
   - 7 个页面接入守卫：carAdd('registered')、carList('admin')、checkSheet('registered')、checkSheetList('registered')、memberList('admin')、monthlyReport('admin+pro')、dataExport('superAdmin+pro')
   - dataExport.js 删除手写 3 层 if 判断，统一走 `checkPageAccess('superAdmin+pro')`

#### Phase 3：云函数拆分 ⏸️ 暂不实施（评估结论：运行正常不动，拆分风险大于收益）

#### Phase 4：数据获取策略统一

6. **云函数新增 5 个查询 action**
   - `listCars` — 服务端全量车辆列表 + 会员状态聚合
   - `listOrders` — 服务端分页工单列表 + 会员状态聚合
   - `listMembers` — 服务端分页会员列表 + 多字段搜索
   - `listCheckSheets` — 服务端分页查车单列表
   - `exportData` — 服务端全量数据导出
   - 全部配置 ACTION_PERMISSIONS 鉴权

7. **5 个列表页迁移至云函数查询**
   - **carList.js**：原 `_fetchAllCars`(客户端DB分批) + `getCarListAggregation`(云函数) 两次调用 → 合并为 1 次 `listCars`
   - **orderList.js**：原客户端DB分页 + 客户端DB会员状态查 → 1 次 `listOrders`（服务端分页+会员聚合）
   - **memberList.js**：原客户端DB分页(含 `$or` 搜索) → 1 次 `listMembers`（服务端多字段搜索）
   - **checkSheetList.js**：原客户端DB分页 → 1 次 `listCheckSheets` + 新增 `_reqVersion` 竞态保护
   - **dataExport.js**：原 `_fetchAll`(客户端DB递归分批) → 1 次 `exportData`

8. **保留客户端DB查询的页面**（延迟敏感/单条查询场景）：
   - carSearch（实时搜索）、carDetail（单条）、orderDetail（单条）、carAdd（唯一性校验count）

#### Phase 5：数据库拆分 ⏸️ 暂不实施（评估结论：数据迁移不可逆，风险极高，运行正常不动）

#### Bug 修复

9. **checkSheetList 竞态保护** — 新增 `_reqVersion` 自增标记，防止下拉刷新与分页加载结果相互覆盖

**变更统计：** 37 文件 | 架构层深度重构

**向后兼容性：** ✅ action 入参/出参未变更，数据库字段未变更，v5.4.2 用户无感升级

**核心收益：**
- 🛡️ 6 个 P1 安全隐患全部清零
- 📋 32 个 action 统一自动鉴权，新增 action 零遗漏风险
- 🚀 5 个列表页服务端查询，消除客户端 limit 限制、降低网络往返次数
- 🔒 所有列表页数据安全统一由云函数保障

---

## v5.4.2（2026-05-09）

### 新功能

1. **底部导航栏自定义能力**
   - Admin 可在「我的」页面动态设置底部导航栏显示的 Tab：会员、车辆
   - 导航设置缓存至 `navTabConfig`，TabBar 实时响应无需重启小程序
   - 自定义 TabBar `custom-tab-bar/index.js` 增强：`buildAdminList()` 动态构建 Tab 列表 + `matchSelected()` 自动路由匹配
   - Staff 账号导航栏固定（首页+会员），不受导航设置影响

2. **首页快捷入口** 🏠
   - 4 个列表页（orderList / memberList / carList / checkSheetList）搜索框前统一新增首页按钮
   - 点击快速跳转至 Dashboard 首页

### Bug 修复

3. **checkSheetList 搜索框长度修复**
   - 问题：`.search-wrapper` 缺少 `flex:1`，导致搜索框比其他列表页短
   - 修复：补充 `flex:1` 样式属性

4. **车辆 Tab 图标修复**
   - 问题：`app.json` 和 `custom-tab-bar/index.js` 引用不存在的 `images/outline.png`
   - 修复：替换为实际存在的 `images/car.png` / `images/car-active.png`

**变更统计：** 17 文件 | 纯前端变更

**向后兼容性：** ✅ 无云函数/数据库变更，v5.4.1 用户无感升级

---

## v5.4.1（2026-05-08）

### 新功能

1. **工单详情 → 查车单入口**
   - 备注模块下方新增「新建查车单」「查看查车记录」两个入口按钮，携带当前车牌号跳转

2. **查车单详情 → 再开一单**
   - 底部由单一分享按钮改为双按钮行：蓝色「再开一单」（主按钮）+ 白底「分享」（次按钮）
   - 点击「再开一单」携带车牌号跳转新建查车单页

3. **新建查车单 → 车牌搜索 + 历史查车单**
   - 车牌号可点击跳转车辆详情页（carDetail）
   - 车牌旁新增「📋 历史查车单」按钮，按车牌筛选跳转查车单列表
   - **checkSheet 页面自带车牌搜索**：从列表页点「＋查车单」进入时，先搜索车牌再选车进入表单（与 memberAdd 一致）

4. **分享图片补开单人信息**
   - 工单分享图：备注与门店信息之间新增「开单人：xxx」居中行
   - 查车单分享图：底部由单行改为双行（检查时间+开单人 / 品牌标识）
   - 历史数据兜底：无开单人信息时显示「开单人：」

### 交互优化

5. **4 个列表页统一悬浮新增按钮**
   - memberList / orderList / carList / checkSheetList 右下角统一胶囊形按钮
   - memberList：圆形「＋」→ 胶囊「＋会员」
   - orderList：新增「＋工单」→ 跳转新建工单
   - carList：新增「＋车辆」→ 跳转新增车辆
   - checkSheetList：「首页」→「＋查车单」
   - 4 页底部留白统一放大至 280rpx，确保内容可滚动至按钮上方

**变更统计：** 14 文件 | +95 / -60 行

**向后兼容性：** ✅ 纯前端 UI 改动，未涉及云函数/数据库

---


## v5.4.0（2026-05-07）

### 新功能

1. **操作人标识系统**
   - 新增"显示名称"字段（个人级别），支持在"我的"页面编辑设置
   - 开单/新增会员/查车单时自动携带 `operatorName`，优先显示姓名、无姓名回落脱敏电话
   - `app.js` 新增 `getOperatorName()`、缓存 `displayName`
   - `utils/util.js` 新增 `formatOperatorName(name, phone)` 格式化方法
   - 云函数 `createOrder` / `addMember` / `saveCheckSheet` 新增 `operatorName` 字段

2. **新增车辆列表页（carList）**
   - 独立车辆列表页面，支持搜索、分页加载、会员标记、累计消费统计
   - Dashboard 车辆总数卡片点击可跳转至车辆列表
   - 云函数新增 `getCarListAggregation` action（分批查询会员状态+订单统计）

3. **报表页月份选择器**
   - 新增月份/年份前后翻页选择器，支持按历史月份查看报表
   - 当前月份边界禁用前/后翻按钮
   - 空数据月份显示空态提示

### 功能优化

4. **Dashboard 统计卡片增强**
   - 统计卡片新增 `>` 箭头，点击可直接跳转（工单/营收→报表今日 tab，车辆→车辆列表）
   - `fetchDashboardData` 单次云函数调用同时获取看板数据和到期提醒，减少一次往返
   - 清理死代码：`revenueTrend`、`_checkShopGuide`

5. **看板数据云函数增强**
   - `getDashboardStats` 合并 `alertList` 查询
   - 新增 `getReportOrders` / `getTotalSpent` / `getCarOrderStats` action 供报表页使用

### 隐私合规

6. **数据脱敏覆盖**
   - 会员列表手机号脱敏展示
   - 工单详情：门店电话脱敏、开单人优先显示姓名
   - 查车单详情：车主电话脱敏、检查人优先显示姓名

### Bug 修复

7. **数据导出修复**
   - 订单导出补开单人列
   - Promise 链断裂修复（多处缺 `return` 导致 `_generateAndShare` 不执行）
   - `loading` → `exporting` 状态变量纠正，避免与页面 loading 冲突

8. **健壮性修复**
   - `_firstLoad` 守卫：carDetail / orderDetail / proUnlock 页面防 `onLoad`+`onShow` 双重请求
   - 归属校验：orderDetail / carDetail / checkSheetDetail 补 `shopPhone` 校验，越权查看弹 toast 并返回
   - orderList / memberList 查询会员信息补 `shopWhere()` 门店隔离
   - orderList / memberList count 查询补 `.catch` 异常处理
   - 下拉刷新 Promise await 后停止动画，防止闪烁
   - 搜索框清空自动重置列表（orderList / memberList / carSearch）
   - monthlyReport 评分 0 显示修复（`0 || '--'` falsy 陷阱）、切换月份失败恢复旧数据
   - checkSheetDetail canvas 去多余 `ctx.restore()`，修复分割线位置
   - proUnlock `onShow` 补 `shopInfo` 变量定义，修复 ReferenceError

9. **常量统一**
   - 大量硬编码 `'13507720000'` → `constants.GUEST_PHONE`
   - 硬编码限制数字 → `constants.FREE_MAX_ORDERS` / `FREE_MAX_MEMBERS`
   - WXML 限制数字模板 → `{{freeMaxOrders}}` / `{{freeMaxMembers}}` 动态渲染

**变更统计：** 43 文件 | +1060 / -3268 行

**向后兼容性：** ✅ action 入参/出参未变更、数据库仅增量添加字段

---

## v5.3.3（2026-05-07）

### 健壮性检修（全项目深度审查）

本次为全项目健壮性检修，累计修复 80+ 处逻辑错误、数据隔离遗漏、权限控制缺陷、异步流断裂和硬编码问题。全部为增量式修补，不新增业务功能。

**变更统计：** 24 个文件 | +476 / -510 行

**关键修复：**
- 🚨 数据隔离：memberAdd/orderList/orderDetail 共 4 处查询补 `shopWhere()` 门店隔离
- 🚨 归属校验：orderDetail/checkSheetDetail 按 `_id` 直读补 `shopPhone` 校验，防止越权查看
- 🚨 权限检查：proUnlock `onEditShopName` 补 isOwner、carDetail `onEditDetail/onEditAlert` 补 isStaff
- 🚨 异步陷阱：orderAdd `calcTotalAmount()` 后读过期 `data.form` → 改读 `page.data.form`
- 🚨 Falsy 陷阱：monthlyReport 评分 0 显示为 `--`（`0 || '--'`）→ JS 预计算 `_displayTotal`
- 🚨 双重请求：6 个页面（carDetail/orderDetail/proUnlock/monthlyReport/dashboard）添加 `_firstLoad` 守卫
- 🚨 权限劫持：dashboard 限额检查闪烁 → 移入 `syncProStatus().then()/catch()` 内部
- 常量统一：新增 `FREE_MAX_MEMBERS=10`，8 处硬编码改为 `constants` 引用
- WXML 安全：checkSheetDetail `checkItems[item.key]` 补父级存在判断 + null 防护
- dataExport：补开单人字段、修 Promise 链断裂、`loading`→`exporting` 字段纠正
- splash/welcome：清理死代码、定时器卸载清理、登录按钮 disabled
- 云函数：清理敏感数据 DEBUG 日志

**向后兼容性：** ✅ 全部通过（action 入参/出参未变更、数据库字段未变更、v3.3.3 用户无感）

---

## v5.2.0（2026-05-03）

### 健壮性升级
- 清理 proUnlock.js 10 处 DEBUG 日志（含敏感数据）
- 清理云函数 repair_main 7 处 DEBUG 日志
- case-modal.js 超时保护增强（`_destroyed` 标记 + `lifetimes.detached`）
- 新增 `utils/constants.js` 全局常量配置中心（20+ 常量）
- app.js/proUnlock.js 硬编码值替换为常量引用（15 处）

**变更统计：** 6 文件 | +79 / -32 行

---

## v4.7.0（2026-05-01）

### 合规修复（审核整改）

1. **车牌号前端去标识化处理**
   - 问题：v4.6.0 提交审核被拒，平台认为车牌号属于"用户身份信息/敏感数据"，违反《微信小程序平台运营规范》3.4 条款
   - 方案：前端列表/选择器/搜索等场景对车牌号进行脱敏展示（前2位 + *** + 后2位），详情页保留完整显示
   - 新增 `utils/maskPlate.wxs` 脱敏模块，8 处展示层调用脱敏：
     - orderAdd：车牌选择器搜索结果 + 最近新增
     - orderList：工单列表卡片
     - carSearch：最近车辆 + 搜索结果
     - memberList：会员卡片
     - dashboard：到期提醒
     - checkSheetList：查车单列表
   - **后端存储、JS 业务逻辑完全不变**，仅 WXML 模板层改动

2. **隐私政策补充车牌号收集说明**
   - 新增"关于车牌号收集的特别说明"段落，声明业务必要性、去标识化展示方式、用途限制

---

## v4.6.0（2026-05-01）

### Bug 修复

1. **修复 Pro 页面游客模式空白问题（严重）**
   - 问题：`proUnlock.js` 第 191 行缺少闭合花括号 `}`，导致游客模式下 `shopCode` 为空时，联系信息读取、Pro 状态判断、缓存更新等后续逻辑全部被跳过，页面显示空白
   - 根因：之前删除反查代码时误删了 `if (record.shopCode) { ... }` 的右花括号
   - 方案：补回缺失的 `}`，确保无论 `shopCode` 是否有值，后续逻辑均正常执行

---

## v4.2.0（2026-04-23）

### 交互优化

1. **Pro 页面在线客服样式修复**
   - 修复"在线客服"按钮宽度与下方"技术支持"不一致、文案换行问题
   - 覆盖微信小程序 button 默认样式，统一三行联系人卡片宽高对齐

---

## v4.1.0（2026-04-21）

### 新功能

1. **完善电子查车单**
   - 检查结果区改为 2 列 3 行圆角卡片网格布局
   - 正常项浅绿背景、异常项浅橙背景，视觉区分更直观

2. **新增"使用帮助"**
   - 新增使用帮助页面，方便用户快速了解系统功能

### 交互优化

3. **优化整体交互体验**
   - 多处页面交互细节优化，提升用户体验

---

## v4.0.0（2026-04-20）

### 新功能

1. **员工账号系统**
   - 支持店主添加员工账号，员工通过手机号+门店码登录
   - 两种角色：管理员（admin，全部权限）、店员（staff，仅核销/开单/新增车辆）
   - 自定义 TabBar 按角色动态显示/隐藏 tab 页
   - 云函数新增 5 个 action：addStaff / removeStaff / updateStaffRole / listStaffs / updateStaffOpenid
   - 只有 Pro 版才能使用员工管理功能

2. **Pro 版激活状态统一管理**
   - Pro 状态判断统一收归 `app.js`：`_checkProStatus`、`syncProStatus`、`_getProStatusAsync`
   - 员工的 Pro 状态继承自店主（通过 shopPhone 反查店主记录）
   - 修复员工登录后 `syncProStatus` 覆盖 Pro 状态为 false 的 Bug（两阶段查询：openid → shopPhone 回退）

### Bug 修复

3. **修复数据看板免费版限额判断时序错误**（继承 v3.3.6）
   - 问题：免费版限额检查使用同步缓存值，页面首次加载时自动登录尚未完成，导致 Pro 用户被误弹限额提示
   - 方案：将限额检查移入 `syncProStatus()` 的异步回调内

4. **免费版报表功能限制**（继承 v3.3.6）
   - 免费版用户仅可查看报表页"今日"tab，本周/本月/本年 tab 显示锁定提示

### 功能优化

5. **云函数工单金额转为数字**
   - 云函数处理工单数据时，将金额字段统一转为数字类型，确保营收统计准确

---

## v3.3.6（2026-04-19）

### Bug 修复

1. **修复数据看板免费版限额判断时序错误**
   - 问题：免费版限额检查（100工单/10会员）使用 `wx.getStorageSync('isPro')` 同步读取缓存值，在页面首次加载时自动登录尚未完成，`isPro` 可能仍为 `false`，导致 Pro 用户被误弹限额提示
   - 方案：将限额检查移入 `syncProStatus()` 的 `.then()` 异步回调内，使用从云端验证后的最新 `isPro` 值判断；每次 `fetchData` 先重置 `showLimitTip`/`showMemberLimitTip` 为 `false`，避免残留状态

### 功能优化

2. **免费版报表功能限制**
   - 免费版用户仅可查看报表页"今日"tab，本周/本月/本年三个 tab 不加载数据
   - 非今日 tab 显示锁定提示卡片（"开通Pro版可查看高级报表"）+ 升级按钮
   - Pro 用户所有 tab 正常加载，不受影响

---

## v3.3.5（2026-04-19）

### 页面优化

1. **欢迎/登录页面重构**
   - 将登录和注册整合为同一页面，支持模式切换
   - 新增隐私确认弹窗，登录前需阅读并同意隐私政策和用户服务协议
   - 新增手机号用途说明提示，解释手机号仅用于身份识别
   - 新增"忘记门店码"引导，支持点击联系客服获取
   - 新增功能标签展示（车辆管理、工单管理、经营报表）
   - 登录页增加"仅限汽修店店主和店员使用"范围提示
   - 优化注册入口展示，蓝色虚线边框强化引导

2. **开单页面 — 内嵌式车牌选择器**
   - 将车牌搜索从页面跳转改为内嵌底部弹层选择器
   - 支持 400ms 防抖搜索，输入车牌号或手机号即可查询
   - 无搜索关键词时展示最近新增的 8 辆车
   - 底部滑出动画，选中后自动填入车牌号

3. **"我的"页面布局优化**
   - 合并门店名称卡片、账户信息卡片、门店联系信息为一个统一的门店头部卡片
   - 门店详情（手机号、注册时间、版本、有效期、联系电话、地址）默认收起，点击"查看详情"展开
   - 联系客服/获取激活码卡片改为可折叠（默认收起），标题根据免费版/Pro版自动切换
   - 门店码卡片改为可折叠（默认收起），减少页面干扰
   - 数据导出拆分为独立卡片，免费版显示灰色禁用态并提示"升级Pro版解锁"
   - 隐私政策与用户服务协议从卡片形式改为底部文字链接（与首页风格统一）
   - 移除冗余的 Pro 已激活状态卡片（版本和有效期已在门店详情中展示）

---

## v3.3.4（2026-04-19）

### 功能优化

1. **优化新增车辆页面 UI**
   - 简化页面布局，减少干扰元素，提升录入效率

2. **新增"游客模式"**
   - 支持未注册用户以游客身份浏览部分功能

3. **车牌号搜索框优化**
   - 改善搜索交互体验

---

## v3.3.2（2026-04-17）

### 体验优化

1. **报表缓存提示优化**
   - 将缓存提示中的 `ℹ` 图标替换为 `"提示："` 文字前缀
   - 提示文案更清晰直观：**提示：使用今日缓存数据，下拉可刷新**
   - 提升用户对缓存状态的理解

---

## v3.2.1（2026-04-13）

### 核心修复

1. **修复跨账号场景 openid 获取失败**
   - 问题：客户端 `db.add()` 返回值不含 `_openid`（跨账号限制），导致 openid 始终为空
   - 方案：add 临时记录后，通过云函数 `repair_main` 的 `getOpenId` action 在服务端读取 `_openid` 并删除临时记录

2. **修复 Pro 状态本地预判逻辑错误（严重）**
   - 问题：`proUnlock.js` 本地缓存预判要求 `code` 和 `unlockKey` 同时有值，但激活后 `unlockKey` 被清空，导致预判永远失败
   - 方案：与 `checkProFromRecord` 统一，仅检查 `code` 有值即判定已激活

3. **修复作废工单功能崩溃（严重）**
   - 问题：`orderDetail.js` 的 `onVoidOrder` 函数中 `page` 变量未定义，点击作废必定运行时报错
   - 方案：在函数顶部添加 `var page = this`

4. **修复数据看板营收统计不准**
   - 问题：`dashboard.js` 查询营收使用默认 `get()` 只返回 20 条，工单超过 20 条时统计金额不准确
   - 方案：新增 `_fetchAllOrders` 客户端分页方法，全量获取所有工单后再计算

5. **修复报表数据查询截断**
   - 问题：`report.js` 硬编码 `limit(1000)`，超过 1000 条工单时数据丢失导致统计不准
   - 方案：同样改为分页全量获取

### 功能优化

6. **聚合云函数 repair_main 新增 getOpenId action**
   - 支持服务端读取记录的 `_openid` 字段，解决跨账号 openid 获取问题

7. **callRepair 自动注入 clientOpenid**
   - `util.callRepair()` 在调用云函数前自动获取并注入 `clientOpenid`，云函数优先使用 `event.clientOpenid`

8. **registerShop 云函数自动生成门店码**
   - 新注册门店时由云函数自动生成 6 位数字门店码 `shopCode`，去掉客户端本地生成逻辑

9. **编辑门店信息增加空值防护**
   - 编辑门店电话/地址时，用户清空内容点确认不再保存空值到云端和本地缓存

10. **编辑工单增加门店归属校验**
    - 编辑工单加载时校验 `shopPhone` 是否匹配当前门店，防止跨门店越权查看

11. **登录手机号格式校验增强**
    - 登录页手机号校验从纯长度检查改为 `util.isValidPhone()` 正则格式校验

---

## v3.2.0（2026-04-11）

### 新功能

- 跨账号资源共享架构：支持通过 `new wx.cloud.Cloud({ resourceAppid, resourceEnv })` 访问资源方云环境
- 资源方 appid：wxb1c736174ede330c
- `cloudbase_auth` 云函数用于跨账号鉴权（需在资源方部署）
- `login` 云函数改为通过跨账号实例调用

### 聚合云函数 repair_main（路由模式）

- action 列表：registerShop / activatePro / addCar / addMember / createOrder / getDashboardStats / saveCheckSheet / updateCarInfo / editOrder / voidOrder / updateShopInfo / updateMember / useBenefit / updateOpenid / getOpenId
- `updateShopInfo` 增加 allowedFields 白名单（name / shopTel / shopAddr）

---

## v3.1.0（2026-04-05）

### 新功能

- 数据看板：今日开单数、今日营收、总营收、车辆总数、近7日营收趋势图
- 报表页面：支持按时间段查看营收统计、服务项目排行、支付方式分布
- Pro 版本：激活码激活机制，免费版每日限 100 单

### 功能改进

- 工单支持作废操作（作废后不参与统计）
- 工单支持编辑修改
- 会员管理增强

---

## v3.0.0（2026-04-01）

### 新功能

- 全新的门店管理系统架构
- 车辆管理：车牌搜索、新增车辆、车辆详情（维修历史）
- 工单管理：快速开单、历史工单、工单详情
- 会员管理：新增会员、会员列表、会员详情
- 电子查车单：生成可打印的查车单
- 门店信息管理：门店名称、电话、地址、门店码

### 技术架构

- 微信云开发（数据库 + 云函数）
- 跨账号资源共享
- 按 shopPhone 隔离门店数据
