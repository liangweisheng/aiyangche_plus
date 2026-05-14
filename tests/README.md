# 自动化测试使用指南

## 一、快速开始

### 前置条件
- 已安装 Node.js（v14+）
- 已在项目根目录执行过 `npm install`

### 运行测试

```bash
# 运行全部测试（85 个用例）
npx jest --verbose

# 只跑权限矩阵测试（65 个用例）
npx jest checkPermission --verbose

# 只跑列表查询测试（20 个用例）
npx jest listQuery --verbose

# 运行单个测试用例（按名称匹配）
npx jest -t "店主.*registered"

# 监听模式（文件改动自动重跑）
npx jest --watch
```

### 预期输出

```
Test Suites: 2 passed, 2 total
Tests:       85 passed, 85 total
Time:        0.916 s
```

---

## 二、文件结构

```
tests/
├── __mocks__/
│   └── wx-server-sdk.js    ← 云开发 SDK 模拟层（模拟数据库查询）
├── checkPermission.test.js  ← 权限矩阵测试（37 个 action × 4 种角色）
└── listQuery.test.js        ← 列表查询测试（5 个 list action）
```

---

## 三、测试覆盖了什么

### checkPermission.test.js（65 个用例）

| 测试套件 | 用例数 | 说明 |
|---------|--------|------|
| public 动作 | 6 | getOpenId/loginByPhoneCode 等无需登录即可调用 |
| registered 动作 | 7 | 店主/员工可调用，无 shopPhone 或陌生人被拒 |
| admin 动作 | 4 | 仅管理员角色可调用，staff 被拒 |
| admin+pro 动作 | 4 | 管理员 + Pro版才能调用 |
| superAdmin+pro 动作 | 4 | 仅店主（superAdmin）+ Pro版才能调用 |
| _checkShopAccess 边界 | 3 | 员工 status/跨门店/clientPhone 降级 |
| 全量权限矩阵 | 37 | 确保测试中的权限配置和云函数代码同步 |

### listQuery.test.js（20 个用例）

| 测试套件 | 用例数 | 说明 |
|---------|--------|------|
| listCars | 4 | 权限(admin only) + 数据格式 + 空数据 |
| listOrders | 4 | 权限(registered) + 分页 + 空数据 |
| listMembers | 3 | 权限(admin only) + 空数据 |
| listCheckSheets | 3 | 权限(registered) + 空数据 |
| exportData | 6 | 权限(superAdmin+pro) + 参数校验 + 空数据 |

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
