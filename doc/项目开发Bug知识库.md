# AI养车门店管理系统 — 项目开发 Bug 知识库

> **覆盖版本**：v3.0.0 ~ v5.3.3  
> **编译日期**：2026-05-07  
> **用途**：供后续项目开发时学习参考，避免重复踩坑  
> **收录数量**：80+ 个 Bug 及修复方法

---

## 目录

1. [P0 级 — 严重缺陷（导致崩溃/数据错误/功能不可用）](#一p0-级--严重缺陷)
2. [P1 级 — 数据安全（隔离遗漏/权限缺失/越权风险）](#二p1-级--数据安全)
3. [P2 级 — 异步与时序（竞态/双重请求/Promise 断裂）](#三p2-级--异步与时序)
4. [P3 级 — 健壮性（空值/类型/边界/falsy 陷阱）](#四p3-级--健壮性)
5. [P4 级 — 合规与安全（隐私/脱敏/日志泄露）](#五p4-级--合规与安全)
6. [P5 级 — 代码质量（硬编码/死代码/重复逻辑/规范问题）](#六p5-级--代码质量)
7. [通用注意事项与开发红线](#七通用注意事项与开发红线)
8. [调试方法论](#八调试方法论)

---

## 一、P0 级 — 严重缺陷

> 导致页面崩溃、业务数据错误、核心功能不可用的 Bug。

### Bug #1：作废工单点击必崩溃

| 项目 | 内容 |
|------|------|
| **发现版本** | v3.2.1 |
| **影响范围** | orderDetail.js |
| **严重程度** | 🔴 严重 — 点击作废按钮必定报错，功能完全不可用 |

**问题描述**：`onVoidOrder` 函数中使用了 `page` 变量，但该变量在函数作用域中从未定义。

```javascript
// ❌ 错误代码
onVoidOrder: function () {
  // page 变量从未定义！
  wx.showModal({
    success: function (res) {
      if (res.confirm) {
        page._doVoid()  // ← ReferenceError: page is not defined
      }
    }
  })
}
```

**修复方法**：在函数顶部声明 `var page = this`。

```javascript
// ✅ 修复后
onVoidOrder: function () {
  var page = this  // ← 在函数顶部定义
  wx.showModal({
    success: function (res) {
      if (res.confirm) {
        page._doVoid()
      }
    }
  })
}
```

**教训**：所有在嵌套回调中需要引用 Page 实例的函数，必须在顶层用 `var page = this` 缓存。

---

### Bug #2：Pro 状态本地预判永远失败

| 项目 | 内容 |
|------|------|
| **发现版本** | v3.2.1 |
| **影响范围** | proUnlock.js |
| **严重程度** | 🔴 严重 — Pro 用户每次进入页面都被判定为"未激活" |

**问题描述**：本地缓存预判要求 `code` 和 `unlockKey` 同时有值才认为已激活。但激活后 `unlockKey` 被后端清空，导致预判永远返回 false。

```javascript
// ❌ 错误代码
function checkProFromCache() {
  var code = cache.code
  var unlockKey = cache.unlockKey
  if (code && unlockKey) {  // ← 激活后 unlockKey 为空，永远 false
    return true
  }
  return false
}
```

**修复方法**：与 `checkProFromRecord` 统一，仅检查 `code` 有值即判定已激活。

```javascript
// ✅ 修复后
function checkProFromCache() {
  var code = cache.code
  if (code) {  // ← 仅判断 code
    // 再检查 expireTime 是否过期
    return true
  }
  return false
}
```

**教训**：前后端状态一致性是判断逻辑的基础。后端会修改的字段不能作为前端持久判断条件。

---

### Bug #3：Pro 页面游客模式空白

| 项目 | 内容 |
|------|------|
| **发现版本** | v4.6.0 |
| **影响范围** | proUnlock.js |
| **严重程度** | 🔴 严重 — 游客模式下"我的"页面完全空白 |

**问题描述**：`proUnlock.js` 第 191 行缺少闭合花括号 `}`。之前删除反查代码时误删了 `if (record.shopCode) { ... }` 的右花括号。当 `shopCode` 为空（游客模式），后续所有逻辑（联系信息读取、Pro 状态判断、缓存更新）全部被跳过。

```javascript
// ❌ 错误代码（if 块缺少 }）
if (record.shopCode) {
  // ... 处理有 shopCode 的逻辑
// ← 这里缺少 }，导致后续代码被意外包裹在 if 内
// 后续逻辑全部不执行
```

**修复方法**：补回缺失的 `}`，确保无论 `shopCode` 是否有值，后续逻辑均正常执行。

**教训**：删除代码块时要特别注意括号配对。一个缺少的花括号可能导致整个页面的逻辑失效。

---

### Bug #4：跨账号 openid 获取失败

| 项目 | 内容 |
|------|------|
| **发现版本** | v3.2.1 |
| **影响范围** | 全项目（app.js + 云函数） |
| **严重程度** | 🔴 严重 — openid 始终为空，所有基于 openid 的鉴权/查询全部失效 |

**问题描述**：跨账号场景下，客户端 `db.add()` 返回值**不包含 `_openid`**（微信安全限制），导致 openid 始终为空。

```javascript
// ❌ 错误代码
db.collection('shops').add({ data: record }).then(function (res) {
  var openid = res._openid  // ← 跨账号时为 undefined
  wx.setStorageSync('openid', openid)  // 存入空值
})
```

**修复方法**：add 后通过云函数的 `getOpenId` action 在服务端读取 `_openid`。

```javascript
// ✅ 修复后：三步策略
// 1. add 临时记录
db.collection('shops').add({ data: tempRecord })
// 2. 通过云函数在服务端读取 _openid
app.callFunction({ action: 'getOpenId', phone: phone })
// 3. 获取到 openid 后更新记录
```

**教训**：
- 跨账号场景下客户端 add 的返回值不可靠
- openid 的获取要区分调用方视角 vs 服务端视角
- 云函数能读取到 `_openid`，客户端跨账号不能

---

### Bug #5：数据看板营收统计不准

| 项目 | 内容 |
|------|------|
| **发现版本** | v3.2.1 |
| **影响范围** | dashboard.js |
| **严重程度** | 🔴 严重 — 营收金额统计错误，工单 > 20 条就出错 |

**问题描述**：`dashboard.js` 查询营收时直接 `.get()` 不带 `.limit()`，微信云数据库默认只返回 **20 条**。工单超过 20 条时，只有前 20 条的金额被计入统计。

```javascript
// ❌ 错误代码
db.collection('repair_orders').where(where).get().then(function (res) {
  // res.data 只有 20 条！
  var totalRevenue = res.data.reduce(function (sum, o) {
    return sum + o.totalAmount
  }, 0)
})
```

**修复方法**：新增 `_fetchAllOrders` 客户端分页方法，循环拉取直到全量。

```javascript
// ✅ 修复后：分页全量获取
function _fetchAllOrders(where) {
  var allOrders = []
  function fetchBatch(skip) {
    return db.collection('repair_orders')
      .where(where)
      .skip(skip)
      .limit(100)
      .get()
      .then(function (res) {
        allOrders = allOrders.concat(res.data)
        if (res.data.length === 100) {
          return fetchBatch(skip + 100)  // 继续拉
        }
        return allOrders
      })
  }
  return fetchBatch(0)
}
```

**教训**：
- 微信云数据库 `.get()` 默认 limit 是 20 条
- 任何涉及全量统计的场景必须分页拉取
- 永远不要假设工单/会员/车辆数量"不超过 20 条"

---

### Bug #6：报表数据查询截断

| 项目 | 内容 |
|------|------|
| **发现版本** | v3.2.1 |
| **影响范围** | report.js |
| **严重程度** | 🔴 严重 — 工单超过 1000 条时数据丢失、统计不准 |

**问题描述**：`report.js` 硬编码 `limit(1000)`，超过 1000 条工单时数据丢失。

```javascript
// ❌ 错误代码
db.collection('repair_orders')
  .where(where)
  .limit(1000)  // ← 硬编码上限
  .get()
```

**修复方法**：改为分页全量获取（同 Bug #5 的 `_fetchAllOrders` 方案）。

**教训**：数据库查询的上限永远是隐患。缓存策略确定后，数据量会持续增长。

---

### Bug #7：免费版限额判断时序错误

| 项目 | 内容 |
|------|------|
| **发现版本** | v3.3.6 / v4.0.0 |
| **影响范围** | dashboard.js |
| **严重程度** | 🔴 严重 — Pro 用户首次进入被误弹"已用完"限制提示（闪烁） |

**问题描述**：限额检查使用 `wx.getStorageSync('isPro')` 同步读取缓存值。页面首次加载时 `syncProStatus()` 异步登录尚未完成，`isPro` 缓存可能仍为 `false`，导致 Pro 用户看到错误提示（闪烁后恢复）。

```javascript
// ❌ 错误代码（同步判断 + 异步验证，时序错乱）
onLoad: function () {
  var isPro = wx.getStorageSync('isPro')  // ← 同步读缓存
  if (!isPro && orderCount >= 100) {
    this.setData({ showLimitTip: true })  // ← 先显示限制提示
  }
}
syncProStatus().then(function (pro) {
  if (pro) {
    this.setData({ showLimitTip: false })  // ← 再隐藏 → 闪烁
  }
})
```

**修复方法**：将限额检查移入 `syncProStatus()` 的 `.then()/.catch()` 异步回调内，并在每次 fetch 前先重置状态。

```javascript
// ✅ 修复后
fetchData: function () {
  this.setData({ showLimitTip: false })  // ← 先重置
  var page = this
  app.syncProStatus().then(function () {
    if (app.isPro()) {
      page._loadAllData()  // ← Pro 用户加载全部
    } else {
      page._checkFreeLimits()  // ← 确认后再检查限额
    }
  }).catch(function () {
    page._checkFreeLimits()  // ← 异常时兜底检查
  })
}
```

**教训**：
- 同步缓存 vs 异步验证的时序差异是经典坑
- 任何基于"是否是 Pro"的判断必须在异步验证后执行
- 先重置状态，再异步判定，避免闪烁

---

### Bug #8：员工 syncProStatus 覆盖 Pro 状态

| 项目 | 内容 |
|------|------|
| **发现版本** | v4.0.0 |
| **影响范围** | app.js |
| **严重程度** | 🔴 严重 — 员工登录后 Pro 状态被重置为 false |

**问题描述**：员工通过 openid 查询 `repair_activationCodes` 时，可能找到自己的 staff 记录（不含 code），直接返回 `isPro: false`，覆盖了继承自店主的 Pro 状态。

**修复方法**：两阶段查询 — 先按 openid 查管理员记录，未命中再按 shopPhone 回退查店主记录。

```javascript
// ✅ 修复后：两阶段查询
function syncProStatus() {
  return db.collection('repair_activationCodes')
    .where({ _openid: openid })  // 阶段1: 按 openid 查
    .get()
    .then(function (res) {
      if (res.data.length && res.data[0].code) {
        return res.data[0]  // 管理员自己的 Pro 记录
      }
      // 阶段2: 按 shopPhone 回退查店主
      return db.collection('repair_activationCodes')
        .where({ shopPhone: shopPhone, addedBy: null })
        .get()
    })
}
```

**教训**：员工的 Pro 状态继承自店主。按 staffOpenid 查到的记录没有 code，必须回退到店主记录。

---

## 二、P1 级 — 数据安全

> 门店数据隔离遗漏、权限检查缺失、越权读写风险。

### Bug #9：memberAdd 新增会员缺门店隔离

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | memberAdd.js `_doSubmitMember` |
| **严重程度** | 🟠 高危 — 去重检查未绑定 shopPhone，可能跨门店去重误判 |

**问题描述**：提交会员时的去重查询只有 `{ plate, phone }` 条件，没有 `shopPhone`。

```javascript
// ❌ 错误代码
db.collection('repair_members')
  .where({ plate: form.plate, phone: form.phone })  // ← 缺 shopPhone
  .count()
```

**修复方法**：补 `app.shopWhere()`。

```javascript
// ✅ 修复后
var existWhere = app.shopWhere({})  // 先拿基础 shopPhone 隔离条件
existWhere.plate = form.plate
existWhere.phone = form.phone
db.collection('repair_members').where(existWhere).count()
```

**教训**：所有数据库查询第一个条件必须是 `app.shopWhere()`，否则会跨门店读到别人的数据。

---

### Bug #10：orderList/orderDetail 会员查询缺门店隔离

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | orderList.js / orderDetail.js |
| **严重程度** | 🟠 高危 — 批量会员查询可能混入其他门店的会员数据 |

**问题描述**：工单列表/详情页通过车牌号批量查询关联会员时，缺少 `shopPhone` 约束。

```javascript
// ❌ 错误代码
db.collection('repair_members')
  .where({ plate: db.command.in(plates) })  // ← 全平台查，跨门店
  .get()
```

**修复方法**：在 where 条件中叠加 `app.shopWhere({})`。

```javascript
// ✅ 修复后
var where = app.shopWhere({})
where.plate = db.command.in(plates)
db.collection('repair_members').where(where).get()
```

**教训**：带 `.in()` 的批量查询最容易遗漏 shopWhere，因为注意力集中在动态条件上。

---

### Bug #11：按 _id 直读无归属校验

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | orderDetail.js / checkSheetDetail.js |
| **严重程度** | 🟠 高危 — 任何人知道 _id 就能直接读取任何门店的数据 |

**问题描述**：工单详情和查车单详情直接 `doc(id).get()`，不校验记录的 `shopPhone` 是否属于当前门店。

```javascript
// ❌ 错误代码
db.collection('repair_orders').doc(id).get({
  success: function (res) {
    // 直接渲染，不检查归属
    this.setData({ order: res.data })
  }
})
```

**修复方法**：读取后立即校验 `shopPhone`。

```javascript
// ✅ 修复后
db.collection('repair_orders').doc(id).get({
  success: function (res) {
    var shopPhone = app.getShopPhone()
    if (res.data.shopPhone && res.data.shopPhone !== shopPhone) {
      wx.showToast({ title: '无权查看', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
      return
    }
    page.setData({ order: res.data })
  }
})
```

**教训**：`.doc(id).get()` 是"无隔离"的直接读取。列表查询有 where 约束，单条查询什么约束都没有。**所有 `doc().get()` 必须加归属校验。**

---

### Bug #12：编辑入口缺权限检查

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | proUnlock.js / carDetail.js |
| **严重程度** | 🟠 高危 — 店员可编辑门店名称和车主信息 |

**问题描述**：以下入口缺少角色权限判断：
- `proUnlock.onEditShopName` — 任何登录用户可修改店名
- `carDetail.onEditDetail` — 店员可编辑车主信息
- `carDetail.onEditAlert` — 店员可编辑提醒事项

```javascript
// ❌ 错误代码（无权限检查）
onEditShopName: function () {
  // 直接打开编辑器，不管当前角色
  this.setData({ editingName: true })
}
```

**修复方法**：

```javascript
// ✅ 修复后：proUnlock 需 isOwner（只有店主能改店名）
onEditShopName: function () {
  if (!getApp().isSuperAdmin()) {
    wx.showToast({ title: '仅店主可编辑', icon: 'none' })
    return
  }
  this.setData({ editingName: true })
}

// ✅ 修复后：carDetail 需 !isStaff（店员不能编辑）
onEditDetail: function () {
  if (getApp().isStaff()) {
    wx.showToast({ title: '店员无权编辑', icon: 'none' })
    return
  }
  // ... 编辑器
}
```

**教训**：所有编辑入口都要问一句："这个操作，店员能做吗？游客能做吗？"

---

## 三、P2 级 — 异步与时序

> 竞态条件、双重请求、Promise 链断裂、回调时序问题。

### Bug #13：onShow 首次双重请求

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | carDetail / orderDetail / proUnlock / monthlyReport / dashboard |
| **严重程度** | 🟡 中危 — 每次进入页面多发起 1~4 次无效网络请求 |

**问题描述**：微信小程序生命周期中 `onShow` 总是在 `onLoad` 后触发。如果两个钩子都调用 `fetchData()`，首次进入页面会发起双重网络请求。carDetail 尤为严重（`fetchCarDetail + fetchMemberInfo + _fetchCarStats + loadRecentCars` 共 4 路重复请求）。

```javascript
// ❌ 错误代码
onLoad: function () {
  this.fetchData()  // ← 第一次请求
},
onShow: function () {
  this.fetchData()  // ← 第二次请求（立即执行）
}
```

**修复方法**：使用 `_firstLoad` 守卫标记。

```javascript
// ✅ 修复后：_firstLoad 守卫模式
onLoad: function (options) {
  this._firstLoad = true
  this.fetchData()
},
onShow: function () {
  if (this._firstLoad) {
    this._firstLoad = false
    return  // ← 跳过首次，onLoad 已拉取
  }
  this.fetchData()  // ← 仅从子页面返回时刷新
}
```

**教训**：
- 这是微信小程序框架级陷阱，所有页面都会遇到
- 新建页面的 checkList 第一项：是否有 `_firstLoad` 守卫
- carDetail 最严重（每次多 4 路请求）

---

### Bug #14：setData 后读过期引用

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | orderAdd.js `onSave` |
| **严重程度** | 🟡 中危 — 提交的工单总金额为旧值（空），导致金额丢失 |

**问题描述**：`setData({ 'form.total': '100' })` 会创建新的 `form` 对象。如果在 setData 前用变量捕获了 `this.data.form`，该变量指向旧对象，读不到新值。

```javascript
// ❌ 错误代码
onSave: function () {
  var data = this.data           // 捕获整个 data 的引用
  this.setData({ 'form.total': String(total) })  // setData 创建新 form 对象
  this.calcTotalAmount()         // 内部修改 this.data.form
  var total = data.form.total    // ← 读的是旧 form，值为空！
  this._submitOrder(data)        // 提交了空金额
}
```

**修复方法**：setData 后重新从 `this.data` 读取。

```javascript
// ✅ 修复后
onSave: function () {
  var page = this
  page.setData({ 'form.total': String(total) })
  page.calcTotalAmount()
  var total = page.data.form.total  // ← 读最新值
  page._submitOrder(page.data)      // 提交正确金额
}
```

**教训**：
- `setData` 对嵌套属性的修改会创建新的父对象引用
- 在任何 `setData` 后需要读值时，必须重新从 `this.data` 获取
- 不能用 `var data = this.data` 做快照后再 setData

---

### Bug #15：Promise 链断裂 — dataExport

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | dataExport.js |
| **严重程度** | 🟡 中危 — 导出流程中调用方不等结果就结束，导出文件可能为空 |

**问题描述**：`_generateAndShare` 内部发起文件写入，但 `return` 的是文件写入结果，未包装成 Promise。调用方不等待写入完成就继续执行。

```javascript
// ❌ 错误代码
_generateAndShare: function (rows, fileName) {
  fs.writeFile({  // wx API，不是 Promise
    data: content,
    success: function () {
      page._doShare(filePath)  // ← 写完了才分享
    }
  })
  // ← 函数没有 return Promise，调用方不等待
}
```

**修复方法**：

```javascript
// ✅ 修复后：包装成 Promise
_generateAndShare: function (rows, fileName) {
  return new Promise(function (resolve, reject) {
    fs.writeFile({
      data: content,
      filePath: filePath,
      success: function () {
        page._doShare(filePath).then(resolve).catch(reject)
      },
      fail: reject
    })
  })
}
```

**教训**：wx API 的回调模式不能直接作为 Promise 链的一环，必须手动 `new Promise()` 包装。

---

### Bug #16：dataExport 错误字段 loading vs exporting

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | dataExport.js `_doShare` |
| **严重程度** | 🟡 中危 — 分享完成后 loading 遮罩不消失 |

**问题描述**：`_doShare` 的 `done()` 闭包设置的是 `loading: false`，但 WXML 绑定的是 `exporting` 字段。

```javascript
// ❌ 错误代码
_doShare: function (filePath) {
  return new Promise(function (resolve) {
    wx.shareFileMessage({
      filePath: filePath,
      complete: function () {
        page.setData({ loading: false })  // ← 设置了错误的字段
        resolve()
      }
    })
  })
}
```

```html
<!-- WXML 绑定的是 exporting -->
<view wx:if="{{exporting}}" class="loading-mask">导出中...</view>
```

**修复方法**：统一为 `exporting`。

```javascript
// ✅ 修复后
// JS: page.setData({ exporting: false })
// WXML: 保持不变
```

**教训**：JS 和 WXML 的 data 字段名必须一致。重构变量名时要全局搜索替换。

---

### Bug #17：onPullDownRefresh 不等异步就停止

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | checkSheetList.js 等多页面 |
| **严重程度** | 🟢 低危 — 下拉刷新动画立即消失，用户看不出是否在刷新 |

```javascript
// ❌ 错误代码
onPullDownRefresh: function () {
  this.fetchList(true)
  wx.stopPullDownRefresh()  // ← 不等异步完成就停止
}
```

**修复方法**：在数据加载完成后或超时后调用 `wx.stopPullDownRefresh()`。

**教训**：`onPullDownRefresh` 中的停止动画必须在异步完成的回调中执行。

---

### Bug #18：splash 定时器未清理

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | splash.js |
| **严重程度** | 🟢 低危 — 页面跳转后 setInterval 仍在运行，潜在内存泄漏 |

**修复方法**：用实例属性保存 timer ID，在 `onUnload` 中 `clearInterval()`。

```javascript
// ✅ 修复后
onLoad: function () {
  this._splashTimer = setInterval(function () { ... }, 1000)
},
onUnload: function () {
  if (this._splashTimer) clearInterval(this._splashTimer)
}
```

---

### Bug #19：monthlyReport 指定年月未命中时永久 loading

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | monthlyReport.js |
| **严重程度** | 🟡 中危 — 传入无效 yearMonth 参数时页面卡死在 loading 态 |

**修复方法**：未命中时 fallback 到默认月份（最近一个有报告的月份或当前月）。

---

## 四、P3 级 — 健壮性

> 空值防护、类型陷阱、边界处理、falsy 值等导致 UI 异常或不准确的 Bug。

### Bug #20：JavaScript Falsy 值陷阱 — 0 显示为 --

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | monthlyReport WXML |
| **严重程度** | 🟡 中危 — 评分为 0 时显示 "--"，用户以为数据缺失 |

**问题描述**：WXML 中使用 `|| '--'` 做兜底，但 `0` 在 JS 中是 falsy 值。

```html
<!-- ❌ 错误代码 -->
<text>{{report.healthScore.total || '--'}}</text>
<!-- 当 total = 0 时，显示 "--" -->
```

**修复方法**：在 JS 中预处理，用 `!= null` 判断。

```javascript
// ✅ 修复后：JS 预处理
_enrichReportData: function (report) {
  report.healthScore._displayTotal = 
    report.healthScore.total != null ? String(report.healthScore.total) : '--'
}
```

```html
<!-- WXML -->
<text>{{report.healthScore._displayTotal}}</text>
```

**教训**：
- WXML 的 `||` 和 JS 语义一致
- `0`、`''`、`false` 都是 falsy
- 数值型字段用 `|| '--'` 兜底是经典 anti-pattern
- 方案：JS 预处理 `_display` 字段，用 `!= null` 判断

---

### Bug #21：WXML 深层属性访问崩溃

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | checkSheetDetail.wxml |
| **严重程度** | 🟡 中危 — checkItems 缺 key 时 `undefined.normal` 崩页面 |

```html
<!-- ❌ 错误代码 -->
<view class="{{detail.checkItems[item.key].normal ? 'normal' : 'warn'}}">
<!-- 如果 checkItems 中没有 item.key → undefined.normal → 崩溃 -->
```

**修复方法**：

```html
<!-- ✅ 修复后 -->
<view class="{{detail.checkItems[item.key] && detail.checkItems[item.key].normal ? 'normal' : 'warn'}}">
```

**教训**：WXML 中访问对象深层属性时，必须逐层判断父对象存在。

---

### Bug #22：数组 map 无 null 防护

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | checkSheetDetail.js / 多处 |
| **严重程度** | 🟢 低危 — 云函数返回异常时 `.map` 报错 |

```javascript
// ❌ 错误代码
var items = res.data.map(function (item) { ... })
// 如果 res.data 是 null/undefined → TypeError
```

**修复方法**：

```javascript
// ✅ 修复后
var items = (res.data || []).map(function (item) { ... })
```

**教训**：云函数返回数据不可信。所有 `.map`、`.filter`、`.forEach` 前都加 `|| []` 兜底。

---

### Bug #23：dashboard stats 无空值兜底

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | dashboard.js |
| **严重程度** | 🟡 中危 — 云函数异常返回时页面崩溃 |

```javascript
// ❌ 错误代码
var stats = res.result.data.stats  // stats 可能是 undefined
this.setData({
  todayOrders: stats.todayOrders  // ← TypeError
})
```

**修复方法**：

```javascript
// ✅ 修复后
var d = res.result ? (res.result.data || {}) : {}
var stats = d.stats || { todayOrders: 0, todayRevenue: 0, totalRevenue: 0, carCount: 0 }
```

**教训**：云函数返回值每一层都要做好空值兜底。`res.result.data.stats` 四层解构，必须层层判断。

---

### Bug #24：monthlyReport 切换月份失败时旧报告被清空

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | monthlyReport.js |
| **严重程度** | 🟡 中危 — 网络波动时已加载的报告消失 |

**修复方法**：在 catch 中恢复旧报告数据。

```javascript
// ✅ 修复后
var oldReport = this.data.report  // 备份
loadReport(yearMonth).catch(function () {
  page.setData({ report: oldReport })  // 恢复
})
```

---

### Bug #25：carDetail 数组合并时 mutate 原数据

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | carDetail.js `onRemoveBenefit` |
| **严重程度** | 🟡 中危 — splice 在 API 调用前修改了 data，API 失败后无法回滚 |

```javascript
// ❌ 错误代码
onRemoveBenefit: function (e) {
  var benefits = this.data.benefits
  var idx = e.currentTarget.dataset.index
  benefits.splice(idx, 1)  // ← 先改数据（直接 mutate）
  this.setData({ benefits: benefits })
  app.callFunction({ action: 'useBenefit', ... })  // API 调用可能失败
}
```

**修复方法**：

```javascript
// ✅ 修复后
onRemoveBenefit: function (e) {
  var benefits = this.data.benefits.slice()  // ← 先拷贝
  var idx = e.currentTarget.dataset.index
  benefits.splice(idx, 1)
  this.setData({ benefits: benefits })
  app.callFunction({ action: 'useBenefit', ... })  // 失败后前端回滚
}
```

**教训**：对 `this.data` 中数组做修改前，先 `slice()` 创建副本。

---

### Bug #26：form.issue.trim() 无 null 兜底

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | checkSheet.js |
| **严重程度** | 🟢 低危 — issue 为 null 时 `.trim()` 报错 |

**修复方法**：`(form.issue || '').trim()`

---

### Bug #27：搜索清空时不重置列表

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | orderList.js / carSearch.js |
| **严重程度** | 🟢 低危 — 用户清空搜索框后仍显示上次搜索结果 |

**修复方法**：搜索内容为空时自动调用 `_resetAndFetch()`。

---

### Bug #28：checkSheet totalCount 显示加载数而非真实总数

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | checkSheetList.js |
| **严重程度** | 🟢 低危 — 列表底部显示"共 20 条"但实际有 50 条 |

**修复方法**：额外执行一次 `count()` 查询获取真实总数。

---

### Bug #29：员工手机号显示为店主手机号

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.2.0（开发中） |
| **影响范围** | proUnlock.js |
| **严重程度** | 🟡 中危 — 员工登录后看到的是店主的手机号 |

**问题描述**：proUnlock 页面读取 `shopInfo.phone` 显示当前用户手机号。但该字段从云端店主记录反查后覆盖了 welcome 页面正确写入的员工手机号。

**根因定位过程**（典型调试案例）：
1. 先加 `console.log` 看 welcome.js 写入的 phone → 确认是正确的员工手机号
2. 再看 proUnlock 加载后 phone 的值 → 变成了店主手机号
3. 定位到 `loadShopInfo` 中通过 `shopPhone` 反查店主记录覆盖了员工缓存

**修复方法**：用 `addedBy` 字段判断是否员工身份 → 如果是员工，直接用本地缓存的 phone，不反查店主。

```javascript
// ✅ 修复后
var userInfo = wx.getStorageSync('userInfo') || {}
var shopInfo = wx.getStorageSync('shopInfo') || {}

// 员工身份：直接使用缓存中的手机号（welcome.js 已正确写入）
if (shopInfo.addedBy) {
  page.setData({
    myPhone: shopInfo.phone  // ← 员工自己的手机号
  })
  return
}
// 店主：从云端获取最新信息
```

**教训**（此 Bug 反复修改十余次才修复）：
- ⚠️ **不要在未验证数据流的情况下凭直觉猜测字段**
- 正确做法：加日志 → 追踪数据流向 → 定位被覆盖的节点 → 从源头修复
- 一个日志顶十次猜测

---

## 五、P4 级 — 合规与安全

> 隐私合规、数据脱敏、敏感信息泄露。

### Bug #30：审核被拒 — 车牌号未脱敏

| 项目 | 内容 |
|------|------|
| **发现版本** | v4.7.0 |
| **影响范围** | 全局列表展示页 |
| **严重程度** | 🔴 合规红线 — 审核被拒，无法发布 |

**问题描述**：列表/选择器/搜索结果等场景展示了完整的车牌号。微信平台认为车牌号属于"用户身份信息/敏感数据"，违反《微信小程序平台运营规范》3.4 条款。

**修复方案**：
- 新增 `utils/maskPlate.wxs` 脱敏模块
- 8 处列表展示层使用脱敏（前2位 + `***` + 后2位）
- 详情页/操作页保留完整车牌号
- 后端存储、JS 业务逻辑完全不变

**脱敏覆盖清单**：

| 页面 | 位置 |
|------|------|
| orderAdd | 车牌选择器搜索结果 + 最近新增 |
| orderList | 工单列表卡片 |
| carSearch | 最近车辆 + 搜索结果 |
| memberList | 会员卡片 |
| dashboard | 到期提醒 |
| checkSheetList | 查车单列表 |

**教训**：
- 任何能识别"具体某人"的数据都可能被判定为敏感信息
- 前端展示和数据存储要解耦：存储完整，展示脱敏
- 审核前自查清单必须包含"是否有列表展示了完整个人信息"

---

### Bug #31：DEBUG 日志泄露敏感数据

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.2.0 |
| **影响范围** | proUnlock.js / 云函数 repair_main |
| **严重程度** | 🟠 高危 — 生产环境 console.log 包含 openid、手机号、完整用户对象 |

**问题描述**：多处 `console.log` 打印了完整用户对象、openid、手机号等敏感信息。日志可被任何人通过 vConsole 或调试工具查看。

**修复方案**：清理 proUnlock.js 10 处、repair_main 云函数 7 处 DEBUG 日志。

**受影响的日志内容**：
- `console.log(openid, phone, JSON.stringify(shopInfo))`
- `console.log('activatePro:', unlockKey, expireTime)`
- 云函数执行日志含完整 event 参数

**教训**：
- 生产环境代码不能有调试日志
- 发布前 review：grep `console.log` 检查是否包含敏感字段名
- 如果确实需要日志，使用 `console.warn`/`console.error` 并脱敏参数

---

### Bug #32：welcome 页登录按钮无 disabled

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | welcome.wxml |
| **严重程度** | 🟢 低危 — 可重复点击发起多次登录请求 |

**修复方法**：添加 `disabled="{{submitting}}"`。

---

## 六、P5 级 — 代码质量

> 硬编码、死代码、重复逻辑、规范问题。

### Bug #33~#46：硬编码值散落各处

| # | 硬编码值 | 位置 | 替换常量 |
|---|---------|------|---------|
| 33 | `'13507720000'` | dashboard.js | `constants.GUEST_PHONE` |
| 34 | `100` | dashboard / orderAdd / proUnlock.wxml | `constants.FREE_MAX_ORDERS` |
| 35 | `10` | memberList / memberAdd / proUnlock.wxml | `constants.FREE_MAX_MEMBERS` |
| 36 | `'17807725166'` | proUnlock.wxml | `constants.SERVICE_PHONE` |
| 37 | `365` | proUnlock.js | `constants.PRO_EXPIRE_DAYS` |
| 38 | `30` | proUnlock.js | `constants.PRO_REMIND_DAYS` |
| 39 | `20` | monthlyReport.js | `constants.MIN_REPORT_ORDERS` |
| 40 | `8000` | 多处 | `constants.CLOUD_TIMEOUT_MS` |
| 41 | `'reportCache_'` | report.js | `constants.REPORT_CACHE_PREFIX` |
| 42 | `100` (分页) | dataExport.js | `constants.FETCH_ALL_LIMIT` |
| 43 | `100` | orderAdd.js 限额 | `constants.FREE_MAX_ORDERS` |
| 44 | `10` | memberAdd.js 限额 | `constants.FREE_MAX_MEMBERS` |
| 45 | `'13507720000'` | welcome.js 游客 | `constants.GUEST_PHONE` |
| 46 | `'17807725166'` | welcome.js 客服 | `constants.SERVICE_PHONE` |

**统一方案**：v5.2.0 新建 `utils/constants.js` 全局常量配置中心，所有页面统一引用。

**教训**：数值/字符串硬编码是隐形炸弹——改一个值要搜 8 个文件。**第 3 次写同一个数值时就该抽常量。**

---

### Bug #47：dashboard 死代码 — `_checkShopGuide` 从未调用

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | dashboard.js |
| **严重程度** | 🟢 低危 — 约 20 行代码从未被调用 |

**修复方法**：删除死代码。

**教训**：定期用 grep 检查函数是否被调用。`grep -r "_checkShopGuide"` 找不到调用方就是死代码。

---

### Bug #48：carSearch 声明未使用的 searchHistory

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | carSearch.js data |
| **严重程度** | 🟢 低危 — 声明了从未使用的 data 字段 |

**修复方法**：删除。

---

### Bug #49：loadRecentCars 失败静默

| 项目 | 内容 |
|------|------|
| **发现版本** | v5.3.3 |
| **影响范围** | memberAdd.js / carSearch.js |
| **严重程度** | 🟢 低危 — 最近车辆加载失败无任何日志 |

**修复方法**：添加 `console.warn('loadRecentCars failed:', err)` 降级日志。

---

### Bug #50：日期格式化代码重复 5 处

| 文件 | 位置 |
|------|------|
| carDetail.js | fetchCarDetail + fetchCarById（2处） |
| checkSheet.js | fetchCarInfo |
| checkSheetList.js | fetchList |
| checkSheetDetail.js | fetchDetail |

```javascript
// 完全相同的内联 pad 逻辑，出现在 5 个文件中
var d = new Date(createTime)
var pad = function (n) { return n < 10 ? '0' + n : '' + n }
var formatted = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
```

**建议**：统一使用 `utils/util.js` 的 `formatDate`/`formatDateTime`。

---

### Bug #51：proUnlock 身份判断逻辑重复

`proUnlock.js` 中 `loadShopInfo` 和 `_updateOwnerFlag` 有几乎相同的员工/店主身份判断逻辑。

**建议**：抽取 `_resolveUserIdentity()` 公共方法。

---

### Bug #52：splash/welcome if/else 死代码

**修复**：合并单行逻辑。

---

### Bug #53：checkSheet 分割线画错位置

Canvas 绘图坐标 `y` vs `y + 46`，分割线画在统计条顶部而非底部。

---

### Bug #54：memberList onShow 重复 var page 声明

ES5 严格模式不允许重复 `var`，潜在 JSHint 错误。

---

### Bug #55：memberLimitReached 刷新不重置

`_resetAndFetch` 没有重置 `memberLimitReached` 状态，导致 quota 误报残留。

---

### Bug #56：proUnlock loadShopInfo 重复读 Storage

同一个函数内多次 `getStorageSync('shopInfo')`，应复用首次读取的变量。

---

## 七、通用注意事项与开发红线

### 7.1 微信小程序特有陷阱

| # | 注意事项 | 说明 |
|---|---------|------|
| 1 | `db.collection().get()` 默认返回 20 条 | 不做 `.limit()` 就只拿 20 条 |
| 2 | `onShow` 必定在 `onLoad` 后触发 | 必须加 `_firstLoad` 守卫 |
| 3 | `setData` 嵌套属性创建新对象 | `var snap = this.data` 后 setData 过期 |
| 4 | `app.db()` 不能在模块顶层调用 | App 尚未初始化，返回 null |
| 5 | Promise 中 `this` 不是 Page 实例 | 用 `var page = this` 缓存 |
| 6 | 跨账号 `db.add()` 返回值无 `_openid` | 需要通过云函数服务端读取 |
| 7 | Donut 多端 `wx.cloud.init` 必须传 appid+envid | 否则 errCode: -601002 |

### 7.2 数据安全红线

| # | 红线 | 检查方式 |
|---|------|---------|
| 1 | 所有 DB 查询必须 `app.shopWhere()` | grep 所有 `.where(` 是否含 shopWhere |
| 2 | 所有 `.doc(id).get()` 必须校验归属 | 读取后立即比较 shopPhone |
| 3 | 所有编辑入口必须检查角色权限 | `isStaff()` 拦截店员，`isSuperAdmin()` 拦截非店主 |
| 4 | WXML 无 `|| '--'` 型 falsy 陷阱 | JS 预处理 `_display*` 字段 |

### 7.3 向后兼容红线（v4.0.0 约束）

1. 云函数现有 action 入参/出参/行为不可变更
2. 新增 action 必须是纯增量
3. 数据库不得删除/重命名已有字段
4. `app.js` 核心方法签名不变
5. 旧缓存无 `role` 字段时默认为 admin
6. 所有改动在 v3.3.3 基础上增量叠加

### 7.4 云函数错误码规范

| 错误码 | 含义 |
|--------|------|
| `0` | 成功 |
| `-1` | 参数错误（缺必填字段） |
| `-2` | 数据不存在 |
| `-3` | 无权限 |
| `-99` | 系统异常（try-catch 兜底） |
| `-403` | 鉴权失败 → 前端强制登出 |

### 7.5 Donut 多端模式注意事项

1. 平台检测用 `typeof miniapp`、`systemInfo.miniappVersion`、`getAccountInfoSync`
2. `wx.cloud.init` 必须显式传入 `{ appid, envid }`
3. 多端模式不走跨账号初始化
4. 无 openid → 通过 `loginByPhoneCode` 云函数验证手机号
5. `clientPhone` 代替 `clientOpenid` 做身份注入

---

## 八、调试方法论

### 正确流程（来自多次踩坑经验）

```
遇到 Bug 时：
  ① 在关键节点加 console.log（入参/中间变量/返回值）
  ② 真机复现，运行一次，收集日志
  ③ 根据日志精确定位失败节点（"原来这里的值已经是错的了"）
  ④ 基于真实数据设计最简方案（1行能解决就不用3行）
  ⑤ 清理调试日志（或降级为 warn）

❌ 禁止行为：
  ✗ 凭记忆/直觉猜测字段含义
  ✗ 未验证实际值就提出"换个字段试试"
  ✗ 用更复杂的条件掩盖根因
  ✗ 在没有日志的情况下反复猜测式修改
```

### 提问有效性自检

```
❶ "方案导向"还是"数据导向"？
   ❌ "用 shopPhone 行吗？"              → 方案导向（易错）
   ✅ "shopPhone 的实际值是什么？"        → 数据导向（正确）

❷ 是否已看到当前节点的真实数据？
   ❌ 凭记忆/推测回答
   ✅ 有 console.log / debugger 输出作证

❸ 能否用一句话说清楚"期望 vs 实际"？
   ❌ "感觉不对"、"好像有问题"
   ✅ "期望看到员工手机号，实际看到店主手机号"

❹ 方案失败后会先问"为什么"还是直接换方案？
   ❌ 失败 → 换字段试试
   ✅ 失败 → 加日志看这个值到底是多少
```

### 典型案例：员工手机号 Bug

| 阶段 | 做法 | 耗时 | 结果 |
|------|------|------|------|
| 错误做法 | 猜测式（"用 shopPhone?"→"用 cloudRecord?"→"加多重兜底?"） | 4h, 5次尝试 | 全部失败 |
| 正确做法 | 验证式（加日志→看实际值→追踪数据流→一行修） | 1.5h, 1次 | 成功 |

---

## 附录：按页面分类的 Bug 分布

| 页面/模块 | Bug 数量 | 典型问题 |
|-----------|:--:|----------|
| app.js | 4 | openid获取、Pro状态时序、多端初始化、常量缺失 |
| dashboard | 5 | 营收统计不准、限额闪烁、stats空值、loading竞态、死代码 |
| proUnlock | 6 | 花括号缺失、权限缺失、双重请求、硬编码、身份判断重复、手机号覆盖 |
| orderAdd | 4 | setData过期引用、硬编码、搜索重置、车牌脱敏 |
| orderList | 3 | 会员查询缺隔离、搜索重置、车牌脱敏 |
| orderDetail | 4 | _id直读无校验、会员查询缺隔离、双重请求、page未定义 |
| carDetail | 4 | 双重请求、权限缺失、数组mutate、日期格式化重复 |
| memberAdd | 3 | 门店隔离遗漏、count无catch、限额阈值硬编码 |
| memberList | 3 | 限额阈值硬编码、刷新不重置、重复var声明 |
| monthlyReport | 4 | falsy陷阱、yearMonth未命中、切换月份清空、monthsSinceOpen偏差 |
| checkSheetDetail | 4 | _id无校验、WXML崩溃、map无null防护、归属标记 |
| checkSheet | 2 | trim无null兜底、分割线坐标 |
| checkSheetList | 2 | totalCount不准、下拉刷新不等异步 |
| dataExport | 4 | Promise链断裂、字段名错误、开单人缺失、硬编码 |
| splash/welcome | 3 | 定时器泄露、按钮无disabled、死代码 |
| carSearch | 2 | 死数据、loadRecentCars静默失败 |
| 云函数 | 2 | 敏感日志泄露、多端鉴权 |

---

> **文档版本**: v1.0 | **最后更新**: 2026-05-07  
> **维护建议**: 每发现新 Bug 后追加到本文档，保持知识库持续更新
