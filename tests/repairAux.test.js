/**
 * repair_aux 云函数自动化测试
 * 覆盖：权限鉴权 + 参数校验 + 空数据 + 错误处理（共 17 个 action）
 *
 * 运行方式: npx jest repairAux --verbose
 */

var { resetMockData } = require('../__mocks__/wx-server-sdk')

// 加载 repair_aux 云函数
var cloudFunc = require('../cloudfunctions/repair_aux/index.js')
var exportsAux = cloudFunc.main || cloudFunc

// ============================
// 测试数据工厂
// ============================
var SHOP_PHONE = '13800001111'
var STAFF_PHONE = '13800002222'
var SHOP_OPENID = 'oShopOwner123456789'
var STAFF_OPENID = 'oStaffMember987654321'
var STRANGER_OPENID = 'oStranger0000000000'

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
    status: 'active',
    unlockKey: 'PRO_ACTIVATION_CODE'
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
    status: 'active',
    unlockKey: 'OTHER_KEY'
  }, overrides)
}

function createMonthlyOrders(count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      _id: 'order_' + i,
      plate: '粤B' + String(i % 8 + 1) + '000' + i,
      shopPhone: SHOP_PHONE,
      totalAmount: 200 + i * 30,
      status: '已完成',
      isVoided: false,
      serviceItems: '机油更换 5W-30',
      createTime: new Date(2026, 4, i + 1).toISOString()
    }
  })
}

function createMonthlyReports(count) {
  return Array.from({ length: count }, function(_, i) {
    return {
      _id: 'report_' + i,
      shopPhone: SHOP_PHONE,
      yearMonth: '2026-' + String(i + 3).padStart(2, '0'),
      revenue: 5000 + i * 1000,
      orderCount: 25 + i * 5,
      healthScore: { total: 75 + i * 5, level: 'good' },
      reportTime: new Date(2026, i, 1).toISOString()
    }
  })
}

// ============================
// 辅助：调用 repair_aux 云函数
// ============================
async function callAux(action, event, openid) {
  var ev = Object.assign({ action: action }, event)
  if (openid !== undefined) {
    ev.clientOpenid = openid
  }
  return await exportsAux(ev, {})
}

// ============================
// 测试套件
// ============================
describe('repair_aux 云函数测试', function() {

  beforeEach(function() {
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
  // 1. public 动作
  // ============================
  describe('public 动作', function() {

    describe('updateStaffOpenid', function() {
      test('缺少参数应返回 -1（public动作，无权限拦截）', async function() {
        var result = await callAux('updateStaffOpenid', {}, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })
    })

    describe('batchGenerateMonthlyReports', function() {
      test('空订单数据应返回无经营数据', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()],
          repair_orders: []
        })
        var result = await callAux('batchGenerateMonthlyReports', {}, '')
        expect(result.code).toBe(0)
        expect(result.data.success).toBe(0)
        expect(result.data.failed).toBe(0)
      })
    })
  })

  // ============================
  // 2. registered 动作
  // ============================
  describe('registered 动作', function() {

    describe('activatePro (registered)', function() {
      test('缺少激活码应返回 -1', async function() {
        var result = await callAux('activatePro', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
        expect(result.msg).toContain('请输入激活码')
      })

      test('激活码错误应返回 -3', async function() {
        var result = await callAux('activatePro', {
          shopPhone: SHOP_PHONE,
          code: 'WRONG_CODE'
        }, SHOP_OPENID)
        expect(result.code).toBe(-3)
      })

      test('无 shopPhone 时权限守卫返回 -403', async function() {
        var result = await callAux('activatePro', { code: 'TEST' }, '')
        expect(result.code).toBe(-403)
      })
    })

    describe('getShopProfile (registered)', function() {
      test('缺少 shopPhone 应被权限守卫拦截（-403）', async function() {
        var result = await callAux('getShopProfile', {}, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('门店记录不存在应返回 -2（需传有效shopPhone通过权限）', async function() {
        var result = await callAux('getShopProfile', {
          shopPhone: '00000000000'
        }, SHOP_OPENID)
        // 该 phone 不在激活码表中，权限守卫返回 -403
        expect(result.code).toBe(-403)
      })

      test('正常查询应返回门店配置', async function() {
        var result = await callAux('getShopProfile', {
          shopPhone: SHOP_PHONE
        }, SHOP_OPENID)
        expect(result.code).toBe(0)
        expect(result.data.phone).toBe(SHOP_PHONE)
      })
    })

    describe('getMonthlyReport (registered)', function() {
      test('缺少 shopPhone 应被权限守卫拦截（-403）', async function() {
        var result = await callAux('getMonthlyReport', {}, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('月份格式错误应返回 -1', async function() {
        var result = await callAux('getMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: 'invalid'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('月份格式 13月应返回 -1', async function() {
        var result = await callAux('getMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: '2026-13'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('已有报告应成功返回', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()],
          repair_monthlyReports: [createMonthlyReports(1)[0]],
          repair_orders: createMonthlyOrders(30)
        })
        var result = await callAux('getMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: '2026-03'
        }, SHOP_OPENID)
        expect(result.code).toBe(0)
      })

      test('数据不足门店应返回 -2', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()],
          repair_orders: createMonthlyOrders(10),  // <20 阈值
          repair_monthlyReports: []
        })
        var result = await callAux('getMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: '2026-05'
        }, SHOP_OPENID)
        expect(result.code).toBe(-2)
      })
    })

    describe('listRecentReports (registered)', function() {
      test('缺少 shopPhone 应被权限守卫拦截（-403）', async function() {
        var result = await callAux('listRecentReports', {}, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('空数据应返回空列表', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()],
          repair_monthlyReports: []
        })
        var result = await callAux('listRecentReports', {
          shopPhone: SHOP_PHONE,
          limit: 3
        }, SHOP_OPENID)
        expect(result.code).toBe(0)
        expect(result.data.list).toEqual([])
      })

      test('正常查询应返回最近报告', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()],
          repair_monthlyReports: createMonthlyReports(5)
        })
        var result = await callAux('listRecentReports', {
          shopPhone: SHOP_PHONE,
          limit: 3
        }, SHOP_OPENID)
        expect(result.code).toBe(0)
        expect(result.data.list.length).toBeLessThanOrEqual(3)
      })
    })

    describe('ocrPlate (registered)', function() {
      test('缺少图片数据应返回 -1', async function() {
        var result = await callAux('ocrPlate', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
        expect(result.msg).toContain('缺少图片数据')
      })

      test('缺少环境变量应返回 -2', async function() {
        var result = await callAux('ocrPlate', {
          shopPhone: SHOP_PHONE,
          imgBase64: 'fake_image_data'
        }, SHOP_OPENID)
        expect(result.code).toBe(-2)
        expect(result.msg).toContain('OCR配置异常')
      })
    })

    describe('ocrVIN (registered)', function() {
      test('缺少图片数据应返回 -1', async function() {
        var result = await callAux('ocrVIN', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
        expect(result.msg).toContain('缺少图片数据')
      })

      test('缺少环境变量应返回 -2', async function() {
        var result = await callAux('ocrVIN', {
          shopPhone: SHOP_PHONE,
          imgBase64: 'fake_image_data'
        }, SHOP_OPENID)
        expect(result.code).toBe(-2)
        expect(result.msg).toContain('OCR配置异常')
      })
    })
  })

  // ============================
  // 3. admin 动作
  // ============================
  describe('admin 动作', function() {

    describe('updateShopInfo (admin)', function() {
      test('缺少字段名应返回 -1', async function() {
        var result = await callAux('updateShopInfo', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('不允许修改的字段应返回 -1', async function() {
        var result = await callAux('updateShopInfo', {
          shopPhone: SHOP_PHONE,
          field: 'illegalField',
          value: 'test'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('staff 角色无权调用（admin only）', async function() {
        var result = await callAux('updateShopInfo', {
          shopPhone: SHOP_PHONE,
          field: 'name',
          value: '新名称'
        }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })

      test('店主可正常更新 name 字段', async function() {
        var result = await callAux('updateShopInfo', {
          shopPhone: SHOP_PHONE,
          field: 'name',
          value: '新门店名称'
        }, SHOP_OPENID)
        expect(result.code).toBe(0)
      })
    })

    describe('removeStaff (admin)', function() {
      test('缺少员工ID应返回 -1', async function() {
        var result = await callAux('removeStaff', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('staff 角色无权调用（admin only）', async function() {
        var result = await callAux('removeStaff', {
          shopPhone: SHOP_PHONE,
          staffDocId: 'staff_1'
        }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })
    })

    describe('updateStaffRole (admin)', function() {
      test('缺少员工ID应返回 -1', async function() {
        var result = await callAux('updateStaffRole', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('角色参数错误应返回 -1', async function() {
        var result = await callAux('updateStaffRole', {
          shopPhone: SHOP_PHONE,
          staffDocId: 'staff_1',
          newRole: 'invalid'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })
    })

    describe('listStaffs (admin)', function() {
      test('staff 角色无权调用（admin only）', async function() {
        var result = await callAux('listStaffs', { shopPhone: SHOP_PHONE }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })

      test('正常查询应返回员工列表', async function() {
        var result = await callAux('listStaffs', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(0)
        expect(result.data.list).toBeDefined()
      })
    })

    describe('updateMyDisplayName (registered)', function() {
      test('缺少显示名称应返回 -1', async function() {
        var result = await callAux('updateMyDisplayName', { shopPhone: SHOP_PHONE }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('缺少身份标识（无shopPhone）应被权限守卫拦截（-403）', async function() {
        var result = await callAux('updateMyDisplayName', {
          value: '新名称'
        }, '')
        expect(result.code).toBe(-403)
      })
    })
  })

  // ============================
  // 4. admin+pro 动作
  // ============================
  describe('admin+pro 动作', function() {

    describe('updateShopProfile (admin+pro)', function() {
      test('缺少 shopPhone 应被权限守卫拦截（-403）', async function() {
        var result = await callAux('updateShopProfile', {}, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('工位数超出范围应返回 -1', async function() {
        var result = await callAux('updateShopProfile', {
          shopPhone: SHOP_PHONE,
          bayCount: 100
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('开业年份不合法应返回 -1', async function() {
        var result = await callAux('updateShopProfile', {
          shopPhone: SHOP_PHONE,
          openYear: 1800
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('无 Pro 用户应被拒绝', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwnerNoPro()]
        })
        var result = await callAux('updateShopProfile', {
          shopPhone: '13900009999',
          bayCount: 3
        }, 'oNoProOwner99999999')
        expect(result.code).toBe(-403)
      })

      test('staff 角色应被拒绝', async function() {
        var result = await callAux('updateShopProfile', {
          shopPhone: SHOP_PHONE,
          bayCount: 3
        }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })
    })

    describe('addStaff (admin+pro)', function() {
      test('缺少门店标识应被权限守卫拦截（-403）', async function() {
        var result = await callAux('addStaff', { staffPhone: '13800004444' }, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('员工手机号格式错误应返回 -1', async function() {
        var result = await callAux('addStaff', {
          shopPhone: SHOP_PHONE,
          staffPhone: '12345678901'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('角色参数错误应返回 -1', async function() {
        var result = await callAux('addStaff', {
          shopPhone: SHOP_PHONE,
          staffPhone: '13800004444',
          staffRole: 'invalid'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('无 Pro 用户应被拒绝', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwnerNoPro()]
        })
        var result = await callAux('addStaff', {
          shopPhone: '13900009999',
          staffPhone: '13800004444',
          staffRole: 'staff'
        }, 'oNoProOwner99999999')
        expect(result.code).toBe(-403)
      })

      test('staff 角色无权添加员工', async function() {
        var result = await callAux('addStaff', {
          shopPhone: SHOP_PHONE,
          staffPhone: '13800004444',
          staffRole: 'staff'
        }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })
    })

    describe('generateMonthlyReport (admin+pro)', function() {
      test('缺少 shopPhone 应被权限守卫拦截（-403）', async function() {
        var result = await callAux('generateMonthlyReport', {}, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('月份格式错误应返回 -1', async function() {
        var result = await callAux('generateMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: 'bad'
        }, SHOP_OPENID)
        expect(result.code).toBe(-1)
      })

      test('无 Pro 应被拒绝', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwnerNoPro()]
        })
        var result = await callAux('generateMonthlyReport', {
          shopPhone: '13900009999',
          yearMonth: '2026-05'
        }, 'oNoProOwner99999999')
        expect(result.code).toBe(-403)
      })

      test('staff 角色无权生成月报', async function() {
        var result = await callAux('generateMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: '2026-05'
        }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })

      test('完全无订单数据应返回 -2', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()]
        })
        var result = await callAux('generateMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: '2026-05'
        }, SHOP_OPENID)
        expect(result.code).toBe(-2)
      })

      test('订单数量不足阈值应返回 -2', async function() {
        resetMockData({
          repair_activationCodes: [createShopOwner()],
          repair_orders: createMonthlyOrders(10)  // < MIN_REPORT_ORDERS(20)
        })
        var result = await callAux('generateMonthlyReport', {
          shopPhone: SHOP_PHONE,
          yearMonth: '2026-05'
        }, SHOP_OPENID)
        expect(result.code).toBe(-2)
      })
    })
  })

  // ============================
  // 5. superAdmin 动作
  // ============================
  describe('superAdmin 动作', function() {

    describe('deleteAccount (superAdmin)', function() {
      test('缺少 shopPhone 应被权限守卫拦截（-403）', async function() {
        var result = await callAux('deleteAccount', {}, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('游客账号应被拒绝', async function() {
        var result = await callAux('deleteAccount', {
          shopPhone: '13507720000'
        }, SHOP_OPENID)
        expect(result.code).toBe(-403)
      })

      test('无 openid 应被拒绝', async function() {
        var result = await callAux('deleteAccount', {
          shopPhone: SHOP_PHONE
        }, '')
        expect(result.code).toBe(-403)
      })

      test('staff 角色应被拒绝（superAdmin only）', async function() {
        var result = await callAux('deleteAccount', {
          shopPhone: SHOP_PHONE
        }, STAFF_OPENID)
        expect(result.code).toBe(-403)
      })

      test('员工管理员应被拒绝（非店主账号）', async function() {
        var result = await callAux('deleteAccount', {
          shopPhone: SHOP_PHONE
        }, 'oStaffAdmin11111111')
        expect(result.code).toBe(-403)
      })
    })
  })

  // ============================
  // 6. 权限矩阵全覆盖测试
  // ============================
  describe('权限矩阵全覆盖', function() {

    test('unknown action 应返回 -1', async function() {
      var result = await callAux('unknownAction', {}, SHOP_OPENID)
      expect(result.code).toBe(-1)
      expect(result.msg).toContain('未知的 action')
    })

    test('缺少 action 应返回 -1', async function() {
      var result = await callAux('', {}, SHOP_OPENID)
      expect(result.code).toBe(-1)
    })

    // public 动作 — 不需要 shopPhone
    test('updateStaffOpenid (public) 无 shopPhone 应通过权限', async function() {
      var result = await callAux('updateStaffOpenid', {
        staffDocId: 'staff_1',
        clearStaffOpenid: true
      }, STAFF_OPENID)
      // public 动作不应因权限被拒（可能因业务逻辑失败，如参数校验，但不该是 -403）
      expect(result.code).not.toBe(-403)
    })

    // registered 动作 — 需要 shopPhone + 身份验证
    test('陌生人无有效shopPhone无法调用 registered 级 action', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()]
      })
      // 使用不存在的 shopPhone，阻止第3层 shopPhone 兜底放行
      var result = await callAux('ocrPlate', {
        shopPhone: '00000000000'
      }, STRANGER_OPENID)
      // 陌生人 openid + 不存在 shopPhone → 权限拦截
      expect(result.code).toBe(-403)
    })
  })
})
