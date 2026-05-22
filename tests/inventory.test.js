/**
 * 进销存云函数自动化测试
 * 覆盖：repair_inventory 的 9 个核心 action（权限 + 数据格式）
 *
 * 运行方式：npx jest inventory --verbose
 */
var { resetMockData } = require('./__mocks__/wx-server-sdk')
var invFunc = require('../cloudfunctions/repair_inventory/index.js')
var exportsInv = invFunc.main || invFunc

// ============================
// 常量
// ============================
var SHOP_PHONE = '13800001111'
var STAFF_PHONE = '13800002222'
var SHOP_OPENID = 'oShopOwnerInv123456'
var STAFF_OPENID = 'oStaffMemberInv654321'
var STRANGER_OPENID = 'oStrangerInv0000000'

// ============================
// 测试数据工厂
// ============================
function createShopOwner(overrides) {
  return Object.assign({
    _id: 'shop_inv',
    phone: SHOP_PHONE,
    openid: SHOP_OPENID,
    type: 'free',
    role: 'admin',
    shopCode: '123456',
    code: 'PRO_INV_CODE',
    expireTime: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    name: '测试门店',
    status: 'active'
  }, overrides)
}

function createStaff(overrides) {
  return Object.assign({
    _id: 'staff_inv',
    phone: STAFF_PHONE,
    openid: STAFF_OPENID,
    staffOpenid: STAFF_OPENID,
    shopPhone: SHOP_PHONE,
    role: 'staff',
    status: 'active',
    type: 'staff'
  }, overrides)
}

function createProduct(id, overrides) {
  return Object.assign({
    _id: id || 'prod_1',
    shopPhone: SHOP_PHONE,
    name: '测试机油',
    category: '油品',
    specs: ['4L', '1L'],
    specStock: [{ label: '4L', stock: 10 }, { label: '1L', stock: 5 }],
    specPrice: [{ label: '4L', price: 380 }, { label: '1L', price: 100 }],
    specCost: [{ label: '4L', cost: 280 }, { label: '1L', cost: 75 }],
    price: 380,
    cost: 280,
    stock: 15,
    unit: '桶',
    productStatus: 'on_shelf',
    createTime: new Date('2026-01-01'),
    updateTime: new Date('2026-01-01')
  }, overrides)
}

function createNoSpecProduct(id, overrides) {
  return Object.assign({
    _id: id || 'prod_ns',
    shopPhone: SHOP_PHONE,
    name: '测试螺丝',
    category: '配件',
    specs: [],
    specStock: [],
    price: 5,
    cost: 2,
    stock: 100,
    unit: '个',
    productStatus: 'on_shelf',
    createTime: new Date('2026-01-01'),
    updateTime: new Date('2026-01-01')
  }, overrides)
}

// ============================
// 辅助
// ============================
async function callInv(action, event, openid) {
  var ev = Object.assign({ action: action }, event)
  if (openid !== undefined) {
    ev.clientOpenid = openid
  }
  return await exportsInv(ev, {})
}

// ============================
// 测试套件
// ============================
describe('repair_inventory 进销存测试', function() {

  // =============================================================
  // 1. addProduct — 新增商品（admin only）
  // =============================================================
  describe('addProduct 新增商品', function() {

    test('管理员应能新增商品', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: []
      })
      var result = await callInv('addProduct', {
        shopPhone: SHOP_PHONE,
        name: '新商品',
        category: '油品',
        price: 100,
        cost: 80,
        unit: '个'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.msg).toContain('成功')
    })

    test('缺少 name 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: []
      })
      var result = await callInv('addProduct', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('缺少 shopPhone 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('addProduct', {
        name: '没有门店'
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('店员(staff)无权新增商品', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()],
        repair_products: []
      })
      var result = await callInv('addProduct', {
        shopPhone: SHOP_PHONE,
        name: '员工尝试新增'
      }, STAFF_OPENID)
      expect(result.code).toBe(-5)
      expect(result.msg).toContain('管理员')
    })

    test('无 Pro 不影响 addProduct（仅需 admin）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner({ code: '', expireTime: '' })],
        repair_products: []
      })
      var result = await callInv('addProduct', {
        shopPhone: SHOP_PHONE,
        name: '无Pro也能加'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
    })
  })

  // =============================================================
  // 2. listProducts — 商品列表（registered）
  // =============================================================
  describe('listProducts 商品列表', function() {

    test('注册用户应能获取商品列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [
          createProduct('p1', { name: '机油A', category: '油品' }),
          createProduct('p2', { name: '机油B', category: '油品', productStatus: 'off_shelf' }),
          createNoSpecProduct('p3', { name: '螺丝', category: '配件' })
        ]
      })
      var result = await callInv('listProducts', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(3)
    })

    test('分类筛选应生效', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [
          createProduct('p1', { name: '机油A', category: '油品' }),
          createNoSpecProduct('p3', { name: '螺丝', category: '配件' })
        ]
      })
      var result = await callInv('listProducts', {
        shopPhone: SHOP_PHONE,
        category: '油品'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(1)
      expect(result.data.list[0].name).toBe('机油A')
    })

    test('空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: []
      })
      var result = await callInv('listProducts', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })

    test('缺少 shopPhone 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('listProducts', {}, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('未登录应被拒绝', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('listProducts', {
        shopPhone: SHOP_PHONE
      }, '_unauthenticated_test_')
      expect(result.code).toBe(-3)
      expect(result.msg).toContain('注册')
    })
  })

  // =============================================================
  // 3. getProductDetail — 商品详情（registered）
  // =============================================================
  describe('getProductDetail 商品详情', function() {

    test('应能获取商品详情', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_detail', { name: '详情商品', price: 200 })]
      })
      var result = await callInv('getProductDetail', {
        productId: 'prod_detail',
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.name).toBe('详情商品')
      expect(result.data.price).toBe(200)
    })

    test('不存在的商品应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: []
      })
      var result = await callInv('getProductDetail', {
        productId: 'nonexistent',
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
      expect(result.msg).toContain('不存在')
    })

    test('缺少 productId 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('getProductDetail', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })
  })

  // =============================================================
  // 4. addStock — 入库（admin only）
  // =============================================================
  describe('addStock 商品入库', function() {

    test('管理员应能入库（无规格商品）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createNoSpecProduct('prod_ns')],
        repair_stock_logs: []
      })
      var result = await callInv('addStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_ns',
        quantity: 50,
        cost: 3,
        operator: '张三'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.newStock).toBe(150)
    })

    test('管理员应能入库（有规格商品）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_spec')],
        repair_stock_logs: []
      })
      var result = await callInv('addStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_spec',
        spec: '4L',
        quantity: 5,
        cost: 280,
        operator: '李四'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.newStock).toBe(20) // 原总库存15 + 5
    })

    test('缺少 productId 或 quantity 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')]
      })
      var result = await callInv('addStock', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('数量为负数应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')]
      })
      var result = await callInv('addStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_1',
        quantity: -10
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('店员(staff)无权入库', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()],
        repair_products: [createProduct('prod_1')]
      })
      var result = await callInv('addStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_1',
        quantity: 10
      }, STAFF_OPENID)
      expect(result.code).toBe(-5)
    })
  })

  // =============================================================
  // 5. deductStock — 出库扣减（registered）
  // =============================================================
  describe('deductStock 商品出库', function() {

    test('注册用户应能出库扣减（无规格商品）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createNoSpecProduct('prod_ns')],
        repair_stock_logs: []
      })
      var result = await callInv('deductStock', {
        shopPhone: SHOP_PHONE,
        items: [{ productId: 'prod_ns', quantity: 5, amount: 25 }]
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
    })

    test('库存不足应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createNoSpecProduct('prod_ns', { stock: 3 })]
      })
      var result = await callInv('deductStock', {
        shopPhone: SHOP_PHONE,
        items: [{ productId: 'prod_ns', quantity: 10, amount: 50 }]
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
      expect(result.msg).toContain('库存不足')
    })

    test('有规格商品库存不足时应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_spec', {
          specStock: [{ label: '4L', stock: 1 }],
          stock: 1
        })]
      })
      var result = await callInv('deductStock', {
        shopPhone: SHOP_PHONE,
        items: [{ productId: 'prod_spec', spec: '4L', quantity: 5, amount: 500 }]
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
      expect(result.msg).toContain('库存不足')
    })

    test('items 为空时应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('deductStock', {
        shopPhone: SHOP_PHONE,
        items: []
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('商品不存在应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: []
      })
      var result = await callInv('deductStock', {
        shopPhone: SHOP_PHONE,
        items: [{ productId: 'nonexistent', quantity: 5 }]
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
      expect(result.msg).toContain('不存在')
    })

    test('员工也能出库（registered 权限）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()],
        repair_products: [createNoSpecProduct('prod_ns')],
        repair_stock_logs: []
      })
      var result = await callInv('deductStock', {
        shopPhone: SHOP_PHONE,
        items: [{ productId: 'prod_ns', quantity: 2, amount: 10 }]
      }, STAFF_OPENID)
      expect(result.code).toBe(0)
    })
  })

  // =============================================================
  // 6. adjustStock — 库存调整（admin only）
  // =============================================================
  describe('adjustStock 库存调整', function() {

    test('管理员应能盘盈调整', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createNoSpecProduct('prod_ns')],
        repair_stock_logs: []
      })
      var result = await callInv('adjustStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_ns',
        quantity: 20,
        reason: '盘盈'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
    })

    test('调整数量为 0 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')]
      })
      var result = await callInv('adjustStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_1',
        quantity: 0
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('店员(staff)无权调整库存', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()],
        repair_products: [createProduct('prod_1')]
      })
      var result = await callInv('adjustStock', {
        shopPhone: SHOP_PHONE,
        productId: 'prod_1',
        quantity: 10,
        reason: '盘盈'
      }, STAFF_OPENID)
      expect(result.code).toBe(-5)
    })
  })

  // =============================================================
  // 7. getStockLogs — 库存流水（admin only）
  // =============================================================
  describe('getStockLogs 库存流水', function() {

    test('管理员应能获取库存流水', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')],
        repair_stock_logs: [
          { _id: 'log_1', productId: 'prod_1', shopPhone: SHOP_PHONE, type: 'in', quantity: 10, createTime: new Date('2026-01-01') },
          { _id: 'log_2', productId: 'prod_1', shopPhone: SHOP_PHONE, type: 'out', quantity: 3, createTime: new Date('2026-02-01') }
        ]
      })
      var result = await callInv('getStockLogs', {
        productId: 'prod_1',
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(2)
    })

    test('类型筛选（logType=in）应生效', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')],
        repair_stock_logs: [
          { _id: 'log_1', productId: 'prod_1', shopPhone: SHOP_PHONE, type: 'in', quantity: 10, createTime: new Date('2026-01-01') },
          { _id: 'log_2', productId: 'prod_1', shopPhone: SHOP_PHONE, type: 'out', quantity: 3, createTime: new Date('2026-02-01') }
        ]
      })
      var result = await callInv('getStockLogs', {
        productId: 'prod_1',
        shopPhone: SHOP_PHONE,
        logType: 'in'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(1)
      expect(result.data.list[0].type).toBe('in')
    })

    test('日期筛选应生效', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')],
        repair_stock_logs: [
          { _id: 'log_1', productId: 'prod_1', shopPhone: SHOP_PHONE, type: 'in', quantity: 10, createTime: new Date('2026-01-01') },
          { _id: 'log_2', productId: 'prod_1', shopPhone: SHOP_PHONE, type: 'out', quantity: 3, createTime: new Date('2026-06-01') }
        ]
      })
      var result = await callInv('getStockLogs', {
        productId: 'prod_1',
        shopPhone: SHOP_PHONE,
        startDate: '2026-05-01',
        endDate: '2026-07-01'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(1)
    })

    test('空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_1')],
        repair_stock_logs: []
      })
      var result = await callInv('getStockLogs', {
        productId: 'prod_1',
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(0)
    })

    test('店员(staff)无权查看流水', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()],
        repair_products: [createProduct('prod_1')]
      })
      var result = await callInv('getStockLogs', {
        productId: 'prod_1',
        shopPhone: SHOP_PHONE
      }, STAFF_OPENID)
      expect(result.code).toBe(-5)
    })
  })

  // =============================================================
  // 8. getPhrases / savePhrases — 快捷短语
  // =============================================================
  describe('快捷短语', function() {

    test('getPhrases 空数据应返回空数组', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_phrases: []
      })
      var result = await callInv('getPhrases', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.phrases).toEqual([])
    })

    test('savePhrases 管理员应能保存（新创建）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_phrases: []
      })
      var result = await callInv('savePhrases', {
        shopPhone: SHOP_PHONE,
        phrases: ['换机油', '换刹车片', '更换轮胎']
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
    })

    test('savePhrases 非数组参数应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('savePhrases', {
        shopPhone: SHOP_PHONE,
        phrases: '不是数组'
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('savePhrases 员工无权保存', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()]
      })
      var result = await callInv('savePhrases', {
        shopPhone: SHOP_PHONE,
        phrases: ['测试']
      }, STAFF_OPENID)
      expect(result.code).toBe(-5)
    })
  })

  // =============================================================
  // 9. 交叉权限覆盖：updateProduct / batchAddStock / toggleProductStatus
  // =============================================================
  describe('交叉权限覆盖', function() {

    test('updateProduct 管理员可更新', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_products: [createProduct('prod_upd')]
      })
      var result = await callInv('updateProduct', {
        productId: 'prod_upd',
        shopPhone: SHOP_PHONE,
        name: '改名后',
        price: 999
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
    })

    test('updateProduct 员工无权更新', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()]
      })
      var result = await callInv('updateProduct', {
        productId: 'prod_upd',
        shopPhone: SHOP_PHONE,
        name: '员工改' 
      }, STAFF_OPENID)
      expect(result.code).toBe(-5)
    })

    test('updateProduct 缺少参数应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callInv('updateProduct', {}, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })
  })
})
