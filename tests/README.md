# 自动化测试使用指南

## 一、快速开始

### 前置条件
- 已安装 Node.js（v14+）
- 已在项目根目录执行过 `npm install`

### 运行测试

```bash
# 运行全部测试（154 个用例）
npx jest --verbose

# 只跑权限矩阵测试（74 个用例）
npx jest checkPermission --verbose

# 只跑列表查询测试（20 个用例）
npx jest listQuery --verbose

# 只跑进销存测试（34 个用例）
npx jest inventory --verbose

# 只跑工单流程测试（8 个用例）
npx jest orderFlow --verbose

# 只跑导出数据测试（19 个用例）
npx jest exportData --verbose

# 运行单个测试用例（按名称匹配）
npx jest -t "店主.*registered"

# 监听模式（文件改动自动重跑）
npx jest --watch
```

### 预期输出

```
Test Suites: 5 passed, 5 total
Tests:       154 passed, 154 total
Time:        1.343 s
```

---

## 二、文件结构

```
tests/
├── __mocks__/
│   └── wx-server-sdk.js         ← 云开发 SDK 模拟层（支持 where().update() 等）
├── checkPermission.test.js       ← 权限矩阵测试（37 个 action × 4 种角色）
├── listQuery.test.js             ← 列表查询测试（5 个 list action）
├── inventory.test.js             ← 进销存云函数测试（9 个 action）
├── orderFlow.test.js             ← 工单流程端到端测试（orderCategory）
└── exportData.test.js            ← 导出数据多类型 + 筛选测试
```

---

## 三、测试覆盖了什么

### checkPermission.test.js（74 个用例）

| 测试套件 | 用例数 | 说明 |
|---------|--------|------|
| public 动作 | 6 | getOpenId/loginByPhoneCode 等无需登录即可调用 |
| registered 动作 | 9 | 店主/员工可调用，无 shopPhone 或陌生人被拒 |
| admin 动作 | 4 | 仅管理员角色可调用，staff 被拒 |
| admin+pro 动作 | 4 | 管理员 + Pro版才能调用 |
| superAdmin+pro 动作 | 4 | 仅店主（superAdmin）+ Pro版才能调用 |
| _checkShopAccess 边界 | 4 | 员工 status/跨门店/clientPhone 降级 |
| 全量权限矩阵 | 37 | 确保测试中的权限配置和云函数代码同步 |

### listQuery.test.js（20 个用例）

| 测试套件 | 用例数 | 说明 |
|---------|--------|------|
| listCars | 4 | 权限(admin only) + 数据格式 + 空数据 |
| listOrders | 4 | 权限(registered) + 分页 + 空数据 |
| listMembers | 3 | 权限(admin only) + 空数据 |
| listCheckSheets | 3 | 权限(registered) + 空数据 |
| exportData | 6 | 权限(superAdmin+pro) + 参数校验 + 空数据 |

### inventory.test.js（34 个用例）🆕

| 测试套件 | 用例数 | 说明 |
|---------|:--:|------|
| addProduct | 5 | 权限(admin) + 参数校验 |
| listProducts | 5 | 权限(registered) + 分类筛选 + 空数据 |
| getProductDetail | 3 | 数据格式 + 不存在商品 + 参数校验 |
| addStock | 5 | 权限(admin) + 有/无规格入库 + 参数校验 |
| deductStock | 6 | 权限(registered) + 库存不足 + 空items + 商品不存在 |
| adjustStock | 3 | 权限(admin) + isZero校验 |
| getStockLogs | 5 | 权限(admin) + 类型筛选 + 日期筛选 + 空数据 |
| 快捷短语 | 4 | getPhrases/savePhrases 权限 + 参数校验 |
| updateProduct | 3 | 权限(admin) + 参数校验 |

### orderFlow.test.js（8 个用例）🆕

| 测试套件 | 用例数 | 说明 |
|---------|:--:|------|
| createOrder 权限 | 3 | orderCategory传递 + 无orderCategory + 员工创建 |
| listOrders 展示 | 3 | orderCategory完整性 + 分页不丢失 + 空列表 |
| useBenefit | 1 | 核销不因权限被拒 |
| Dashboard | 1 | 基本响应格式验证 |

### exportData.test.js（19 个用例）🆕

| 测试套件 | 用例数 | 说明 |
|---------|:--:|------|
| 导出类型覆盖 | 5 | cars/orders/members/checkSheets/stock_logs |
| 日期筛选 | 5 | 仅start/仅end/范围/范围外/精确单日 |
| 空数据 | 3 | 3种类型空列表不崩溃 |
| 参数校验 | 2 | 无效type + 缺少type |
| 权限边界 | 4 | superAdmin/无Pro/staff/员工管理员 |

### Mock 增强 🆕

`__mocks__/wx-server-sdk.js` 新增：
- `where().update()` 链式调用
- `_.eq()` / `_.exists()` 命令
- 原生 `$gte` / `$lte` / `$eq` 语法
- Date 对象自动转换比较

---

## 四、如何添加新测试

### 添加新的 action 权限测试

1. 在 `checkPermission.test.js` 的 `PERMISSION_MATRIX` 中添加新 action：

```js
myNewAction: { level: 'admin', pro: true },
```

2. 在全量矩阵的 `handler` 对象中也添加同名键（确保同步校验）

3. 如果该 action 有特殊逻辑需要单独测试，添加新的 `test()`

### 添加新业务逻辑测试

1. 在 `tests/` 目录下创建新文件，如 `tests/myFeature.test.js`

2. 按模板编写：

```js
var { resetMockData } = require('./__mocks__/wx-server-sdk')
var cloudFunc = require('../cloudfunctions/repair_main/index.js')
var exportsMain = cloudFunc.main || cloudFunc

describe('myFeature 测试', function() {
  beforeEach(function() {
    resetMockData({
      repair_activationCodes: [...],
      repair_cars: [...]
    })
  })

  test('xxx', async function() {
    var result = await exportsMain(
      { action: 'myAction', shopPhone: '13800001111' },
      {}
    )
    expect(result.code).toBe(0)
  })
})
```

---

## 五、注意事项

1. **mock 数据隔离**：每个 `test()` 前必须调用 `resetMockData()`，否则数据会互相污染
2. **testId 注入**：通过 `event.clientOpenid` 注入模拟 openid，云函数会优先使用它
3. **操作符支持**：mock 已支持 `_.or`/`_.and`/`_.neq`/`_.in`/`_.gte`/`_.lte`/`db.RegExp`/`db.serverDate`
4. **不测试 UI**：这些是纯逻辑单测，页面交互和渲染仍需真机手动验证
5. **不测网络**：mock 替代了真实云数据库，如需验证真实数据需在云函数上手动测试
