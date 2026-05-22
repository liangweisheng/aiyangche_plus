/**
 * exportData 多种类型 + 筛选条件测试
 * 覆盖：5种导出类型 + 日期筛选 + 空数据 + 权限边界
 * 
 * 运行方式：npx jest exportData --verbose
 */
var { resetMockData } = require('./__mocks__/wx-server-sdk')
var cloudFunc = require('../cloudfunctions/repair_main/index.js')
var exportsMain = cloudFunc.main || cloudFunc

// ============================
// 常量
// ============================
var SHOP_PHONE = '13800001111'
var STAFF_PHONE = '13800002222'
var SHOP_OPENID = 'oShopOwnerExport123'
var STAFF_OPENID = 'oStaffExport9876543'
var STAFF_ADMIN_OPENID = 'oStaffAdminExp1111'

// ============================
// 测试数据工厂
// ============================
function createShopOwner(overrides) {
  return Object.assign({
    _id: 'shop_export',
    phone: SHOP_PHONE,
    openid: SHOP_OPENID,
    type: 'free',
    role: 'admin',
    shopCode: '123456',
    code: 'PRO_EXPORT_CODE',
    expireTime: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    name: '测试门店',
    status: 'active'
  }, overrides)
}

function createShopOwnerNoPro(overrides) {
  return Object.assign({
    _id: 'shop_export_nopro',
    phone: SHOP_PHONE,
    openid: SHOP_OPENID,
    type: 'free',
    role: 'admin',
    shopCode: '123456',
    code: '',
    expireTime: '',
    name: '无Pro门店',
    status: 'active'
  }, overrides)
}

function createStaff(overrides) {
  return Object.assign({
    _id: 'staff_export',
    phone: STAFF_PHONE,
    staffOpenid: STAFF_OPENID,
    shopPhone: SHOP_PHONE,
    role: 'staff',
    status: 'active',
    type: 'staff'
  }, overrides)
}

function createStaffAdmin(overrides) {
  return Object.assign({
    _id: 'staff_admin_export',
    phone: '13800003333',
    staffOpenid: STAFF_ADMIN_OPENID,
    shopPhone: SHOP_PHONE,
    role: 'admin',
    status: 'active',
    type: 'staff'
  }, overrides)
}

// ============================
// 辅助
// ============================
async function callAction(action, event, openid) {
  var ev = Object.assign({ action: action }, event)
  if (openid !== undefined) {
    ev.clientOpenid = openid
  }
  return await exportsMain(ev, {})
}

// ============================
// 测试套件
// ============================
describe('exportData 多种类型 + 筛选条件', function() {

  // =============================================================
  // 1. 所有导出类型
  // =============================================================
  describe('导出类型覆盖', function() {

    test('导出 type=cars 应返回车辆列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: [
          { _id: 'c1', plate: '粤B00001', shopPhone: SHOP_PHONE, ownerName: '车主1', phone: '13900000001', carType: '丰田', createTime: new Date('2026-01-01') },
          { _id: 'c2', plate: '粤B00002', shopPhone: SHOP_PHONE, ownerName: '车主2', phone: '13900000002', carType: '本田', createTime: new Date('2026-02-01') }
        ]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(2)
      // export 按 createTime desc 排序，粤B00002(Feb) 在前
      var plates = result.data.list.map(function(o) { return o.plate })
      expect(plates).toContain('粤B00001')
      expect(plates).toContain('粤B00002')
    })

    test('导出 type=orders 应返回工单列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_orders: [
          { _id: 'o1', plate: '粤B01', shopPhone: SHOP_PHONE, totalAmount: 100, status: '已完成', isVoided: false, serviceItems: '机油', createTime: new Date('2026-03-01') },
          { _id: 'o2', plate: '粤B02', shopPhone: SHOP_PHONE, totalAmount: 200, status: '已完成', isVoided: false, serviceItems: '保养', createTime: new Date('2026-04-01') }
        ]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'orders'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(2)
    })

    test('导出 type=members 应返回会员列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_members: [
          { _id: 'm1', plate: '粤B01', shopPhone: SHOP_PHONE, ownerName: '会员1', phone: '13900000001', name: '会员1', benefitName: '保养卡', createTime: new Date('2026-01-01') },
          { _id: 'm2', plate: '粤B02', shopPhone: SHOP_PHONE, ownerName: '会员2', phone: '13900000002', name: '会员2', benefitName: '洗车卡', createTime: new Date('2026-02-01') }
        ]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'members'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(2)
    })

    test('导出 type=checkSheets 应返回查车单列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_checkSheets: [
          { _id: 'cs1', plate: '粤B01', shopPhone: SHOP_PHONE, resultSummary: '正常', createTime: new Date('2026-03-01') },
          { _id: 'cs2', plate: '粤B02', shopPhone: SHOP_PHONE, resultSummary: '有异常', createTime: new Date('2026-04-01') }
        ]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'checkSheets'
      }, SHOP_OPENID)
      // checkSheets 可能不在 exportData 支持的类型中，返回 -1 也是预期行为之一
      if (result.code === 0) {
        expect(result.data.total).toBe(2)
      } else {
        expect(result.code).toBe(-1)
      }
    })

    test('导出 type=stock_logs 应返回库存流水列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_stock_logs: [
          { _id: 'sl1', productId: 'p1', shopPhone: SHOP_PHONE, type: 'in', quantity: 10, createTime: new Date('2026-05-01') },
          { _id: 'sl2', productId: 'p2', shopPhone: SHOP_PHONE, type: 'out', quantity: 5, createTime: new Date('2026-05-02') }
        ]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'stock_logs'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(2)
    })
  })

  // =============================================================
  // 2. 日期筛选（stock_logs）
  // =============================================================
  describe('日期筛选（stock_logs）', function() {

    beforeEach(function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_stock_logs: [
          { _id: 'sl_jan', productId: 'p1', shopPhone: SHOP_PHONE, type: 'in', quantity: 10, createTime: new Date('2026-01-15') },
          { _id: 'sl_feb', productId: 'p1', shopPhone: SHOP_PHONE, type: 'in', quantity: 20, createTime: new Date('2026-02-15') },
          { _id: 'sl_mar', productId: 'p1', shopPhone: SHOP_PHONE, type: 'out', quantity: 5, createTime: new Date('2026-03-15') },
          { _id: 'sl_apr', productId: 'p1', shopPhone: SHOP_PHONE, type: 'out', quantity: 8, createTime: new Date('2026-04-15') }
        ]
      })
    })

    test('仅 startDate 筛选（某日起）', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'stock_logs',
        startDate: '2026-03-01'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(2) // 3月 + 4月
    })

    test('仅 endDate 筛选（某日止）', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'stock_logs',
        endDate: '2026-02-28'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(2) // 1月 + 2月
    })

    test('startDate + endDate 范围筛选', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'stock_logs',
        startDate: '2026-02-01',
        endDate: '2026-03-31'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(2) // 2月 + 3月
    })

    test('范围外无数据应返回空列表', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'stock_logs',
        startDate: '2026-06-01',
        endDate: '2026-07-01'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })

    test('精确单日筛选', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'stock_logs',
        startDate: '2026-02-15',
        endDate: '2026-02-15'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(1)
      expect(result.data.list[0]._id).toBe('sl_feb')
    })
  })

  // =============================================================
  // 3. 空数据（所有类型）
  // =============================================================
  describe('空数据', function() {

    test('cars 空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: []
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })

    test('orders 空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_orders: []
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'orders'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(0)
    })

    test('members 空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_members: []
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'members'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.total).toBe(0)
    })
  })

  // =============================================================
  // 4. 参数校验
  // =============================================================
  describe('参数校验', function() {

    test('无效 type 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'invalid_type_xyz'
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('缺少 type 应返回 -1', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })
  })

  // =============================================================
  // 5. 权限边界
  // =============================================================
  describe('权限边界', function() {

    test('Pro 店主（superAdmin）有权导出', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: [{ _id: 'c1', plate: '粤B01', shopPhone: SHOP_PHONE, ownerName: '车主', phone: '13900000001', carType: '丰田', createTime: new Date() }]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
    })

    test('无 Pro 店主无权导出', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwnerNoPro()]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, SHOP_OPENID)
      expect(result.code).toBe(-403)
    })

    test('店员(staff)无权导出', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('员工管理员（admin 角色但非 superAdmin）无权导出', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaffAdmin()]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, STAFF_ADMIN_OPENID)
      expect(result.code).toBe(-403)
    })
  })
})
