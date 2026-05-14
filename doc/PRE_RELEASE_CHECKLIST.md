# 发布前检查清单（通用版）

> **最后更新：2026-05-07**
> 每次发布前必须逐项检查，打 ✅ 表示通过，❌ 表示存在问题需修复。本清单适用于所有版本。

---

## 一、安全审计（最高优先级）

### 1.1 写操作权限校验
- [ ] **云函数路由入口统一鉴权**：`WRITE_ACTIONS` 白名单包含所有写操作 action
  - 当前列表：createOrder / addCar / addMember / editOrder / voidOrder / useBenefit / saveCheckSheet / updateCarInfo / updateMember
  - 新增写操作 action 时必须同步加入此列表
- [ ] **_validateWriteAccess 覆盖两种模式**：
  - 小程序模式：通过 openid + _checkShopAccess 验证
  - 多端模式：通过 clientPhone + status='active' 验证
- [ ] **前端 callRepair 注入身份参数**：
  - `clientOpenid`：小程序模式（用于 _checkShopAccess）
  - `clientPhone`：多端模式（用于 _validateWriteAccess 验证员工状态）

### 1.2 员工账号生命周期
- [ ] **addStaff**：写入 status: 'active' ✅
- [ ] **removeStaff**：设置 status: 'removed' + 清空 staffOpenid ✅
- [ ] **被删除员工无法调用写操作**：_validateWriteAccess 拦截 → 返回 -403 → 前端强制登出
- [ ] **被删除员工无法读取数据**：_checkShopAccess 要求 staffOpenid + status='active'

### 1.3 数据脱敏（隐私合规）
- [ ] 所有列表页展示车牌号必须使用 `maskPlate` 脱敏
- [ ] 详情页/操作页可展示完整车牌号（用户主动进入的上下文）
- [ ] 手机号使用 `maskPhone` 脱敏

**车牌号脱敏覆盖清单：**
| 页面 | 位置 | 检查 |
|------|------|:--:|
| orderList | 工单列表 | |
| report | 报表列表 | |
| carSearch | 搜索结果 | |
| dashboard | 首页提醒 | |
| memberList | 会员列表 | |
| memberAdd | 搜索结果/最近车辆 | |
| checkSheetList | 查车单列表 | |

---

## 二、功能测试

### 2.1 角色权限测试
- [ ] **管理员（admin）**：全部功能可用，4 个 Tab 可见
- [ ] **店员（staff）**：仅 2 个 Tab（首页/会员），无报表和我的页面
- [ ] **免费版用户**：报表仅可查看"今日" Tab，其他 Tab 显示升级提示
- [ ] **游客模式**：只读体验，不能写入数据

### 2.2 员工管理测试
- [ ] 添加员工 → 记录 status='active'
- [ ] 员工登录 → 正常使用受限功能
- [ ] 删除员工 → status 变为 'removed'，staffOpenid 清空
- [ ] **被删除员工尝试操作**：
  - 小程序模式：_checkShopAccess 拦截 → -403 → 强制登出
  - 多端模式：_validateWriteAccess 拦截 → -403 → 强制登出
- [ ] 重新添加已删除员工 → 状态恢复为 'active'（历史记录复用）
- [ ] 仅 Pro 版可使用员工管理功能

### 2.3 核心业务流程
- [ ] 注册门店 → 自动生成 6 位 shopCode
- [ ] 激活 Pro 版 → code + expireTime 写入
- [ ] 开单（createOrder）→ 工单入库 + 车辆自动关联
- [ ] 新增车辆/会员 → 去重检查
- [ ] 权益核销（useBenefit）→ 扣减次数 + 生成工单
- [ ] 查车单（saveCheckSheet）→ 检查项保存

---

## 三、多端兼容性测试

### 3.1 微信小程序模式
- [ ] 开发者工具正常运行
- [ ] 真机预览/真机调试正常
- [ ] openid 自动获取 + 登录态保持
- [ ] 跨账号云环境连接成功

### 3.2 Donut 多端模式（Android/iOS）
- [ ] 平台检测准确（_isMultiEndMode）
- [ ] 手机号+门店码登录正常
- [ ] **clientPhone 注入正确**（callRepair）
- [ ] 员工账号鉴权生效（status='active' 检查）
- [ ] 本地缓存恢复 + 后台验证

### 3.3 边界情况
- [ ] 无网络 → 友好提示
- [ ] 云环境初始化超时 → 兜底处理
- [ ] 并发操作 → 数据一致性
- [ ] 缓存残留 → 跨模式隔离（_platform 标记）

---

## 四、代码质量检查

### 4.1 云函数 repair_main
- [ ] 无新增语法错误
- [ ] 所有新 action 已加入 handler 路由表
- [ ] 写操作 action 已加入 WRITE_ACTIONS 白名单
- [ ] DEBUG 日志已清理（生产环境不应有调试日志）
- [ ] 错误码规范：-1 参数错误 / -2 数据不存在 / -3 无权限 / -99 系统异常 / -403 鉴权失败

### 4.2 前端代码
- [ ] app.js `callFunction` 统一拦截 -403 错误码
- [ ] util.js `callRepair` 注入完整身份参数（shopPhone/clientOpenid/clientPhone）
- [ ] wxml 中无硬编码敏感信息
- [ ] wxss 无冗余样式冲突

---

## 五、发布流程

### 5.1 发布前
- [ ] 本地测试全部通过
- [ ] 真机测试（小程序 + 多端各至少 1 台设备）
- [ ] 云函数已上传部署到正式环境
- [ ] 小程序版本号已更新（app.json / project.config.json）
- [ ] 更新日志已准备

### 5.2 发布后
- [ ] 微信审核提交（关注隐私合规相关）
- [ ] 监控线上错误日志（云函数控制台）
- [ ] 验证存量用户无感升级（v3.3.3 向后兼容）
- [ ] 定时触发器确认运行（月报生成 cron: `0 5 1 * *`）

---

## 六、常见问题速查

| 问题现象 | 可能原因 | 排查方向 |
|---------|---------|---------|
| 被删除员工仍能操作 | clientPhone 未注入 | 检查 util.callRepair 是否传入 clientPhone |
| -403 未触发 | 云函数未部署最新代码 | 重新上传部署 repair_main |
| 多端模式登录异常 | 平台检测误判 | 检查 _isMultiEndMode 各分支 |
| 小程序跨账号失败 | resourceAppid/resourceEnv 配置 | 确认 cloudbase_auth 已部署在资源方 |
| 报表数据为空 | 缓存未清除 | 下拉刷新强制清缓存 |

---

## 七、版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v5.3.3 | 2026-05-07 | 升级为通用发布清单，去除版本绑定 |
| v5.2.0 | 2026-05-03 | 初始版本，基于"被删除员工仍可使用"问题复盘建立 |
