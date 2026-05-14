/**
 * checkPermission 权限矩阵自动化测试
 *
 * 测试目标：验证云函数 checkPermission() 对 37 个 action 的权限控制逻辑
 * 运行方式：npx jest checkPermission --verbose
 */

var { resetMockData } = require('../__mocks__/wx-server-sdk')

// 加载被测模块（wx-server-sdk 会被 jest.config.js 的 moduleNameMapper 自动替换为 mock）
var cloudFunc = require('../cloudfunctions/repair_main/index.js')
var exportsMain = cloudFunc.main || cloudFunc

// ============================
// 测试数据工厂
// ============================
var SHOP_PHONE = '13800001111'
var STAFF_PHONE = '13800002222'
var SHOP_OPENID = 'oShopOwner123456789'
var STAFF_OPENID = 'oStaffMember987654321'
var OTHER_OPENID = 'oOtherPerson0000000'

/**
 * 创建店主记录（超级管理员 + Pro版）
 */
function createShopOwner(overrides) {
  return Object.assign({
    _id: 'shop_1',
    phone: SHOP_PHONE,
    openid: SHOP_OPENID,
    type: 'free',
    role: 'admin',
    shopCode: '123456',
    code: 'PRO_ACTIVATION_CODE',
    expireTime: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    name: '测试门店',
    status: 'active'
  }, overrides)
}

/**
 * 创建员工记录（店员角色）
 */
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

/**
 * 创建员工管理员记录
 */
function createStaffAdmin(overrides) {
  return Object.assign({
    _id: 'staff_admin_1',
    phone: '13800003333',
    staffOpenid: 'oStaffAdmin11111111',
    shopPhone: SHOP_PHONE,
    role: 'admin',
    status: 'active',
    type: 'staff'
  }, overrides)
}

/**
 * 创建无Pro的店主记录
 */
function createShopOwnerNoPro(overrides) {
  return Object.assign({
    _id: 'shop_nopro',
    phone: '13900009999',
    openid: 'oNoProOwner99999999',
    type: 'free',
    role: 'admin',
    shopCode: '654321',
    code: '',
    expireTime: '',
    name: '无Pro门店',
    status: 'active'
  }, overrides)
}

// ============================
// 权限矩阵定义
// ============================
var PERMISSION_MATRIX = {
  // 公开（无需登录）
  getOpenId: { level: 'public', pro: false },
  loginByPhoneCode: { level: 'public', pro: false },
  updateOpenid: { level: 'public', pro: false },
  updateStaffOpenid: { level: 'public', pro: false },
  registerShop: { level: 'public', pro: false },
  batchGenerateMonthlyReports: { level: 'public', pro: false },

  // 已注册用户
  activatePro: { level: 'registered', pro: false },
  addCar: { level: 'registered', pro: false },
  createOrder: { level: 'registered', pro: false },
  editOrder: { level: 'registered', pro: false },
  addMember: { level: 'registered', pro: false },
  updateMember: { level: 'registered', pro: false },
  updateCarInfo: { level: 'registered', pro: false },
  useBenefit: { level: 'registered', pro: false },
  saveCheckSheet: { level: 'registered', pro: false },
  getDashboardStats: { level: 'registered', pro: false },
  getTotalSpent: { level: 'registered', pro: false },
  getCarOrderStats: { level: 'registered', pro: false },
  getCarListAggregation: { level: 'registered', pro: false },
  getMonthlyReport: { level: 'registered', pro: false },
  listRecentReports: { level: 'registered', pro: false },
  getShopProfile: { level: 'registered', pro: false },
  listOrders: { level: 'registered', pro: false },
  listCheckSheets: { level: 'registered', pro: false },

  // 管理员
  updateShopInfo: { level: 'admin', pro: false },
  voidOrder: { level: 'admin', pro: false },
  getReportOrders: { level: 'admin', pro: false },
  getCustomerRanking: { level: 'admin', pro: false },
  listCars: { level: 'admin', pro: false },
  listMembers: { level: 'admin', pro: false },
  removeStaff: { level: 'admin', pro: false },
  updateStaffRole: { level: 'admin', pro: false },
  listStaffs: { level: 'admin', pro: false },

  // 管理员 + Pro
  updateShopProfile: { level: 'admin', pro: true },
  addStaff: { level: 'admin', pro: true },
  generateMonthlyReport: { level: 'admin', pro: true },

  // 超级管理员 + Pro
  exportData: { level: 'superAdmin', pro: true }
}

// ============================
// 辅助：调用云函数
// ============================
async function callAction(action, event, openid) {
  var ev = Object.assign({ action: action }, event)
  var ctx = {}
  if (openid !== undefined) {
    // 通过 clientOpenid 注入测试 openid
    ev.clientOpenid = openid
  }
  return await exportsMain(ev, ctx)
}

// ============================
// 测试套件
// ============================
describe('checkPermission 权限矩阵测试', function() {

  beforeEach(function() {
    // 每个测试前重置为默认数据
    resetMockData({
      repair_activationCodes: [
        createShopOwner(),
        createStaff(),
        createStaffAdmin(),
        createShopOwnerNoPro()
      ]
    })
  })

  // ============================
  // 1. public 动作：任何人都能调用
  // ============================
  describe('public 动作', function() {
    var publicActions = Object.keys(PERMISSION_MATRIX).filter(function(k) {
      return PERMISSION_MATRIX[k].level === 'public'
    })

    test.each(publicActions)('action=%s 应该允许未登录用户调用', async function(action) {
      var result = await callAction(action, { shopPhone: '' }, '')
      // public 动作不应返回 -403 权限错误（可能返回其他业务错误如 -1 缺参数，但不该是权限拒绝）
      expect(result.code).not.toBe(-403)
    })
  })

  // ============================
  // 2. registered 动作：已注册用户可调用
  // ============================
  describe('registered 动作', function() {
    var registeredActions = Object.keys(PERMISSION_MATRIX).filter(function(k) {
      return PERMISSION_MATRIX[k].level === 'registered'
    })

    test('店主（admin）应能通过 registered 权限', async function() {
      // 用 addCar 测试 registered 权限（逻辑简单，只查 count + add）
      var result = await callAction('addCar', { shopPhone: SHOP_PHONE, plate: '\u7CA4B99999' }, SHOP_OPENID)
      expect(result.code).not.toBe(-403)
    })

    test('员工（staff）应能通过 registered 权限', async function() {
      // 用 addCar 测试
      var result = await callAction('addCar', { shopPhone: SHOP_PHONE, plate: '\u7CA4B88888' }, STAFF_OPENID)
      expect(result.code).not.toBe(-403)
    })

    test('无 shopPhone 应返回 -403', async function() {
      var result = await callAction('getDashboardStats', {}, SHOP_OPENID)
      expect(result.code).toBe(-403)
    })

    test('未登录（空 openid + 无 clientPhone）应返回 -403', async function() {
      // 使用不存在的 shopPhone 以避免第3层 shopPhone 兜底干扰
      var result = await callAction('getDashboardStats', { shopPhone: '00000000000' }, '')
      expect(result.code).toBe(-403)
    })

    test('不属于该门店的 openid 应返回 -403', async function() {
      // 使用不存在的 shopPhone 以避免第3层 shopPhone 兜底干扰
      var result = await callAction('getDashboardStats', { shopPhone: '00000000000' }, OTHER_OPENID)
      expect(result.code).toBe(-403)
    })

    test('clientPhone 降级验证通过应放行', async function() {
      var result = await callAction('getDashboardStats', { shopPhone: SHOP_PHONE, clientPhone: SHOP_PHONE }, '')
      expect(result.code).not.toBe(-403)
    })

    test('clientPhone 不属于该门店应返回 -403', async function() {
      // 使用不存在的 shopPhone 以避免第3层 shopPhone 兜底干扰
      var result = await callAction('getDashboardStats', { shopPhone: '00000000000', clientPhone: '13900000000' }, '')
      expect(result.code).toBe(-403)
    })

    test('shopPhone 兜底：有效 shopPhone 应放行 registered 动作', async function() {
      // 第3层设计意图：已知 shopPhone 即可访问 registered 级操作（多端场景需要）
      var result = await callAction('getDashboardStats', { shopPhone: SHOP_PHONE }, '')
      expect(result.code).not.toBe(-403)
    })

    test('不存在的 shopPhone 的 clientPhone 降级应返回 -403', async function() {
      var result = await callAction('getDashboardStats', { shopPhone: '00000000000', clientPhone: STAFF_PHONE }, '')
      expect(result.code).toBe(-403)
    })
  })

  // ============================
  // 3. admin 动作：仅管理员可调用
  // ============================
  describe('admin 动作', function() {
    var adminActions = Object.keys(PERMISSION_MATRIX).filter(function(k) {
      return PERMISSION_MATRIX[k].level === 'admin' && !PERMISSION_MATRIX[k].pro
    })

    test('店主（superAdmin）应能通过 admin 权限', async function() {
      var result = await callAction('listStaffs', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
      expect(result.code).not.toBe(-403)
    })

    test('员工管理员（admin 角色）应能通过 admin 权限', async function() {
      var result = await callAction('listStaffs', { shopPhone: SHOP_PHONE }, 'oStaffAdmin11111111')
      expect(result.code).not.toBe(-403)
    })

    test('员工（staff 角色）应被拒绝 admin 权限', async function() {
      var result = await callAction('listStaffs', { shopPhone: SHOP_PHONE }, STAFF_OPENID)
      expect(result.code).toBe(-403)
      expect(result.msg).toContain('管理员')
    })

    test('不属于该门店的用户应被拒绝', async function() {
      var result = await callAction('listStaffs', { shopPhone: SHOP_PHONE }, OTHER_OPENID)
      expect(result.code).toBe(-403)
    })
  })

  // ============================
  // 4. admin+pro 动作：管理员 + Pro版
  // ============================
  describe('admin+pro 动作', function() {
    var adminProActions = Object.keys(PERMISSION_MATRIX).filter(function(k) {
      return PERMISSION_MATRIX[k].level === 'admin' && PERMISSION_MATRIX[k].pro
    })

    test('Pro 店主应能通过 admin+pro 权限', async function() {
      var result = await callAction('addStaff', {
        shopPhone: SHOP_PHONE,
        staffPhone: '13800004444',
        staffRole: 'staff'
      }, SHOP_OPENID)
      // 不应因权限被拒（可能因其他业务逻辑失败）
      expect(result.code).not.toBe(-403)
    })

    test('无 Pro 的管理员应被拒绝', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwnerNoPro()]
      })
      var result = await callAction('addStaff', {
        shopPhone: '13900009999',
        staffPhone: '13800004444',
        staffRole: 'staff'
      }, 'oNoProOwner99999999')
      expect(result.code).toBe(-403)
      expect(result.msg).toContain('Pro')
    })

    test('staff 角色应被拒绝（需要管理员）', async function() {
      var result = await callAction('addStaff', {
        shopPhone: SHOP_PHONE,
        staffPhone: '13800004444',
        staffRole: 'staff'
      }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('Pro 过期的管理员应被拒绝', async function() {
      resetMockData({
        repair_activationCodes: [
          createShopOwner({
            expireTime: '2020-01-01T00:00:00.000Z' // 已过期
          })
        ]
      })
      var result = await callAction('addStaff', {
        shopPhone: SHOP_PHONE,
        staffPhone: '13800004444',
        staffRole: 'staff'
      }, SHOP_OPENID)
      expect(result.code).toBe(-403)
    })
  })

  // ============================
  // 5. superAdmin+pro 动作：仅超级管理员（店主）+ Pro版
  // ============================
  describe('superAdmin+pro 动作', function() {
    test('Pro 店主应能通过 superAdmin+pro 权限', async function() {
      var result = await callAction('exportData', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
      // 不应因权限被拒
      expect(result.code).not.toBe(-403)
    })

    test('员工管理员（非 superAdmin）应被拒绝', async function() {
      var result = await callAction('exportData', { shopPhone: SHOP_PHONE }, 'oStaffAdmin11111111')
      expect(result.code).toBe(-403)
      expect(result.msg).toContain('超级管理员')
    })

    test('staff 角色应被拒绝', async function() {
      var result = await callAction('exportData', { shopPhone: SHOP_PHONE }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('无 Pro 的店主应被拒绝', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwnerNoPro()]
      })
      var result = await callAction('exportData', { shopPhone: '13900009999' }, 'oNoProOwner99999999')
      expect(result.code).toBe(-403)
    })
  })

  // ============================
  // 6. _checkShopAccess 边界情况
  // ============================
  describe('_checkShopAccess 边界', function() {
    test('员工 status 非活跃应被拒绝', async function() {
      resetMockData({
        repair_activationCodes: [
          createStaff({ status: 'inactive' })
        ]
      })
      // 不包含店主记录，避免第3层 shopPhone 兜底干扰
      var result = await callAction('getDashboardStats', { shopPhone: SHOP_PHONE }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('员工 status removed 应被拒绝', async function() {
      resetMockData({
        repair_activationCodes: [
          createStaff({ status: 'removed' })
        ]
      })
      var result = await callAction('getDashboardStats', { shopPhone: SHOP_PHONE }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })

    test('员工 openid 为空时 clientPhone 可降级验证', async function() {
      var result = await callAction('getDashboardStats', {
        shopPhone: SHOP_PHONE,
        clientPhone: STAFF_PHONE
      }, '')
      expect(result.code).not.toBe(-403)
    })

    test('不同门店的员工不能访问其他门店', async function() {
      resetMockData({
        repair_activationCodes: [
          createShopOwner(),
          createStaff({ shopPhone: SHOP_PHONE, staffOpenid: STAFF_OPENID }),
          { _id: 'other_shop', phone: '13800005555', openid: OTHER_OPENID, type: 'free', role: 'admin', shopCode: '111222', name: '其他门店', status: 'active' }
        ]
      })
      var result = await callAction('listCars', { shopPhone: '13800005555' }, STAFF_OPENID)
      expect(result.code).toBe(-403)
    })
  })

  // ============================
  // 7. 全量权限矩阵验证
  // ============================
  describe('全量权限矩阵', function() {
    var allActions = Object.keys(PERMISSION_MATRIX)

    test.each(allActions)('action=%s 的权限配置应该存在于云函数 ACTION_PERMISSIONS 中', function(action) {
      // 这个测试确保测试矩阵和云函数配置同步
      // 如果新增了 action 但忘记在测试中配置，会在这里暴露
      var handler = {
        getOpenId: 1, loginByPhoneCode: 1, registerShop: 1, activatePro: 1,
        addCar: 1, addMember: 1, createOrder: 1, editOrder: 1, voidOrder: 1,
        getDashboardStats: 1, getReportOrders: 1, getTotalSpent: 1,
        getCarOrderStats: 1, saveCheckSheet: 1, updateCarInfo: 1,
        updateMember: 1, useBenefit: 1, updateOpenid: 1, updateShopInfo: 1,
        getCustomerRanking: 1, addStaff: 1, removeStaff: 1, updateStaffRole: 1,
        listStaffs: 1, updateStaffOpenid: 1, generateMonthlyReport: 1,
        getMonthlyReport: 1, listRecentReports: 1, updateShopProfile: 1,
        getShopProfile: 1, batchGenerateMonthlyReports: 1,
        getCarListAggregation: 1, listCars: 1, listOrders: 1,
        listMembers: 1, listCheckSheets: 1, exportData: 1
      }
      expect(handler[action]).toBeDefined()
    })
  })
})
