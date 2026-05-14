/**
 * 列表查询云函数自动化测试
 * 覆盖：listCars / listOrders / listMembers / listCheckSheets / exportData
 * 验证：权限拦截 + 数据返回格式 + 空数据
 *
 * 运行方式：npx jest listQuery --verbose
 */

var { resetMockData } = require('../__mocks__/wx-server-sdk')
var cloudFunc = require('../cloudfunctions/repair_main/index.js')
var exportsMain = cloudFunc.main || cloudFunc

// ============================
// 常量
// ============================
var SHOP_PHONE = '13800001111'
var STAFF_PHONE = '13800002222'
var SHOP_OPENID = 'oShopOwner123456789'
var STAFF_OPENID = 'oStaffMember987654321'
var STRANGER_OPENID = 'oStranger0000000000'

// ============================
// 测试数据工厂
// ============================
function createShopOwner(overrides) {
  return Object.assign({
    _id: 'shop_1',
    phone: SHOP_PHONE,
    openid: SHOP_OPENID,
    type: 'free',
    role: 'admin',
    shopCode: '123456',
    code: 'PRO_CODE',
    expireTime: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    name: '测试门店',
    status: 'active'
  }, overrides)
}

function createStaff(overrides) {
  return Object.assign({
    _id: 'staff_1',
    phone: STAFF_PHONE,
    staffOpenid: STAFF_OPENID,
    shopPhone: SHOP_PHONE,
    role: 'staff',
    status: 'active',
    type: 'staff'
  }, overrides)
}

function createCars(count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      _id: 'car_' + i,
      plate: '\u7CA4B' + String(i).padStart(5, '0'),
      shopPhone: SHOP_PHONE,
      ownerName: '\u8F66\u4E3B' + i,
      phone: '139' + String(i).padStart(8, '0'),
      carType: i % 2 === 0 ? '\u4E30\u7530' : '\u672C\u7530',
      createTime: new Date(2026, 0, i + 1)
    }
  })
}

function createOrders(count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      _id: 'order_' + i,
      plate: '\u7CA4B' + String(i % 5).padStart(5, '0'),
      shopPhone: SHOP_PHONE,
      totalAmount: 100 + i * 50,
      status: i < count - 2 ? '\u5DF2\u5B8C\u6210' : '\u65BD\u5DE5\u4E2D',
      isVoided: false,
      serviceItems: '\u673A\u6CB9\u66F4\u6362',
      createTime: new Date(2026, 3, i + 1)
    }
  })
}

function createMembers(count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      _id: 'member_' + i,
      plate: '\u7CA4B' + String(i).padStart(5, '0'),
      shopPhone: SHOP_PHONE,
      ownerName: '\u4F1A\u5458' + i,
      phone: '137' + String(i).padStart(8, '0'),
      name: '\u4F1A\u5458' + i,
      benefitName: '\u5E38\u89C4\u4FDD\u517B',
      benefitTotal: 5,
      benefitRemain: 3,
      createTime: new Date(2026, 0, i + 1)
    }
  })
}

function createCheckSheets(count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      _id: 'cs_' + i,
      plate: '\u7CA4B' + String(i % 3).padStart(5, '0'),
      shopPhone: SHOP_PHONE,
      resultSummary: i % 2 === 0 ? '\u6B63\u5E38' : '\u6709\u5F02\u5E38',
      createTime: new Date(2026, 2, i + 1)
    }
  })
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
describe('listQuery 列表查询测试', function() {

  beforeEach(function() {
    resetMockData({
      repair_activationCodes: [
        createShopOwner(),
        createStaff()
      ],
      repair_cars: createCars(5),
      repair_orders: createOrders(8),
      repair_members: createMembers(3),
      repair_checkSheets: createCheckSheets(4)
    })
  })

  // ============================
  // listCars
  // ============================
  describe('listCars', function() {

    test('管理员应能获取车辆列表', async function() {
      var result = await callAction('listCars', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(5)
      expect(result.data.memberMap).toBeDefined()
      expect(result.data.orderStats).toBeDefined()
    })

    test('空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: []
      })
      var result = await callAction('listCars', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })

    test('店员(staff)无权调用 listCars（admin only）', async function() {
      var result = await callAction('listCars', { shopPhone: SHOP_PHONE }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('缺少 shopPhone 应返回错误', async function() {
      var result = await callAction('listCars', {}, SHOP_OPENID)
      expect(result.code).toBe(-403)
    })
  })

  // ============================
  // listOrders
  // ============================
  describe('listOrders', function() {

    test('注册用户应能获取工单列表', async function() {
      var result = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(8)
    })

    test('员工也能获取工单列表（registered）', async function() {
      var result = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, STAFF_OPENID)
      expect(result.code).toBe(0)
    })

    test('分页参数应生效', async function() {
      var result = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 2,
        pageSize: 3
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      // 第2页从skip=3开始
      expect(result.data.list.length).toBeLessThanOrEqual(3)
    })

    test('空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_orders: []
      })
      var result = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })
  })

  // ============================
  // listMembers
  // ============================
  describe('listMembers', function() {

    test('管理员应能获取会员列表', async function() {
      var result = await callAction('listMembers', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(3)
    })

    test('店员(staff)无权调用 listMembers（admin only）', async function() {
      var result = await callAction('listMembers', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_members: []
      })
      var result = await callAction('listMembers', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })
  })

  // ============================
  // listCheckSheets
  // ============================
  describe('listCheckSheets', function() {

    test('注册用户应能获取查车单列表', async function() {
      var result = await callAction('listCheckSheets', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(4)
    })

    test('员工也能获取查车单列表（registered）', async function() {
      var result = await callAction('listCheckSheets', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, STAFF_OPENID)
      expect(result.code).toBe(0)
    })

    test('空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_checkSheets: []
      })
      var result = await callAction('listCheckSheets', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })
  })

  // ============================
  // exportData
  // ============================
  describe('exportData', function() {

    test('Pro 店主应能导出车辆数据', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: createCars(3)
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toBeDefined()
      expect(result.data.total).toBe(3)
    })

    test('导出类型参数错误应返回 -1', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'invalid'
      }, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    test('员工管理员(staff admin)无权导出（非 superAdmin）', async function() {
      resetMockData({
        repair_activationCodes: [
          createShopOwner(),
          { _id: 'sa1', phone: '13800003333', staffOpenid: 'oStaffAdmin11', shopPhone: SHOP_PHONE, role: 'admin', status: 'active', type: 'staff' }
        ]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, 'oStaffAdmin11')
      expect(result.code).toBe(-403)
    })

    test('店员(staff)无权导出', async function() {
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('非Pro店主无权导出', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner({ code: '', expireTime: '' })]
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'cars'
      }, SHOP_OPENID)
      expect(result.code).toBe(-403)
    })

    test('导出空数据应返回空列表', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_members: []
      })
      var result = await callAction('exportData', {
        shopPhone: SHOP_PHONE,
        type: 'members'
      }, SHOP_OPENID)
      expect(result.code).toBe(0)
      expect(result.data.list).toEqual([])
      expect(result.data.total).toBe(0)
    })
  })
})
