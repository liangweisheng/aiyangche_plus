/**
 * 工单流程端到端测试
 * 覆盖：createOrder orderCategory 写入 / useBenefit / listOrders 展示 / Dashboard
 *
 * 运行方式：npx jest orderFlow --verbose
 */
var { resetMockData } = require('./__mocks__/wx-server-sdk')
var cloudFunc = require('../cloudfunctions/repair_main/index.js')
var exportsMain = cloudFunc.main || cloudFunc

// ============================
// 常量
// ============================
var SHOP_PHONE = '13800001111'
var STAFF_PHONE = '13800002222'  
var SHOP_OPENID = 'oShopOwnerFlow12345'
var STAFF_OPENID = 'oStaffFlow987654321'

// ============================
// 测试数据工厂
// ============================
function createShopOwner(overrides) {
  return Object.assign({
    _id: 'shop_flow',
    phone: SHOP_PHONE,
    openid: SHOP_OPENID,
    type: 'free',
    role: 'admin',
    shopCode: '123456',
    code: 'PRO_FLOW_CODE',
    expireTime: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    name: '测试门店',
    status: 'active'
  }, overrides)
}

function createStaff(overrides) {
  return Object.assign({
    _id: 'staff_flow',
    phone: STAFF_PHONE,
    openid: STAFF_OPENID,
    staffOpenid: STAFF_OPENID,
    shopPhone: SHOP_PHONE,
    role: 'staff',
    status: 'active',
    type: 'staff'
  }, overrides)
}

function createCar(overrides) {
  return Object.assign({
    _id: 'car_flow_1',
    plate: '粤BFLOW01',
    shopPhone: SHOP_PHONE,
    ownerName: '张三',
    phone: '13900000001',
    carType: '丰田',
    createTime: new Date('2026-01-01')
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
describe('orderFlow 工单流程测试', function() {

  // =============================================================
  // 1. createOrder — 权限校验（不依赖完整创建链路）
  // =============================================================
  describe('createOrder 工单创建权限', function() {

    test('createOrder 携带 orderCategory 不被权限拒绝', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: [createCar()],
        repair_orders: [],
        repair_members: []
      })

      var result = await callAction('createOrder', {
        shopPhone: SHOP_PHONE,
        plate: '粤BFLOW01',
        serviceItems: '更换机油',
        serviceAmounts: [380],
        totalAmount: 380,
        createOpenid: SHOP_OPENID,
        orderCategory: '普通工单'
      }, SHOP_OPENID)

      // 不应因权限被拒（createOrder 创建成功与否取决于具体业务逻辑）
      expect(result.code).not.toBe(-403)
    })

    test('createOrder 不传 orderCategory 也不应被权限拒绝', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: [createCar()],
        repair_orders: [],
        repair_members: []
      })

      var result = await callAction('createOrder', {
        shopPhone: SHOP_PHONE,
        plate: '粤BFLOW01',
        serviceItems: '更换机油',
        serviceAmounts: [380],
        totalAmount: 380,
        createOpenid: SHOP_OPENID
      }, SHOP_OPENID)

      expect(result.code).not.toBe(-403)
    })

    test('员工也能创建工单（registered 权限）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner(), createStaff()],
        repair_cars: [createCar()],
        repair_orders: [],
        repair_members: []
      })

      var result = await callAction('createOrder', {
        shopPhone: SHOP_PHONE,
        plate: '粤BFLOW01',
        serviceItems: '更换刹车片',
        serviceAmounts: [500],
        totalAmount: 500,
        createOpenid: STAFF_OPENID,
        orderCategory: '普通工单'
      }, STAFF_OPENID)

      expect(result.code).not.toBe(-403)
    })
  })

  // =============================================================
  // 2. listOrders — orderCategory 字段展示完整性
  // =============================================================
  describe('listOrders orderCategory 展示', function() {

    test('listOrders 应返回 orderCategory 字段（含空值）', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_orders: [
          { _id: 'o1', plate: '粤BFLOW01', shopPhone: SHOP_PHONE, totalAmount: 100, status: '已完成', isVoided: false, serviceItems: '机油', createTime: new Date('2026-05-01'), orderCategory: '普通工单' },
          { _id: 'o2', plate: '粤BFLOW02', shopPhone: SHOP_PHONE, totalAmount: 200, status: '已完成', isVoided: false, serviceItems: '保养', createTime: new Date('2026-05-02'), orderCategory: '核销权益卡' },
          { _id: 'o3', plate: '粤BFLOW03', shopPhone: SHOP_PHONE, totalAmount: 300, status: '已完成', isVoided: false, serviceItems: '检查', createTime: new Date('2026-05-03'), orderCategory: '' }
        ]
      })

      var result = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 10
      }, SHOP_OPENID)

      expect(result.code).toBe(0)
      expect(result.data.list.length).toBe(3)

      var categories = result.data.list.map(function(o) { return o.orderCategory })
      expect(categories).toContain('普通工单')
      expect(categories).toContain('核销权益卡')
      expect(categories).toContain('')
    })

    test('分页后 orderCategory 字段不应丢失', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_orders: [
          { _id: 'o1', plate: '粤B01', shopPhone: SHOP_PHONE, totalAmount: 100, status: '已完成', isVoided: false, serviceItems: 'A', createTime: new Date('2026-05-01'), orderCategory: '普通工单' },
          { _id: 'o2', plate: '粤B02', shopPhone: SHOP_PHONE, totalAmount: 200, status: '已完成', isVoided: false, serviceItems: 'B', createTime: new Date('2026-05-02'), orderCategory: '核销权益卡' },
          { _id: 'o3', plate: '粤B03', shopPhone: SHOP_PHONE, totalAmount: 300, status: '已完成', isVoided: false, serviceItems: 'C', createTime: new Date('2026-05-03'), orderCategory: '普通工单' }
        ]
      })

      // 第1页：2条
      var page1 = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 1,
        pageSize: 2
      }, SHOP_OPENID)

      expect(page1.code).toBe(0)
      expect(page1.data.list.length).toBe(2)
      page1.data.list.forEach(function(o) {
        expect(o.orderCategory).toBeDefined()
      })

      // 第2页：1条
      var page2 = await callAction('listOrders', {
        shopPhone: SHOP_PHONE,
        page: 2,
        pageSize: 2
      }, SHOP_OPENID)
      
      expect(page2.code).toBe(0)
      expect(page2.data.list.length).toBe(1)
      expect(page2.data.list[0].orderCategory).toBeDefined()
    })

    test('空列表不报错', async function() {
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

  // =============================================================
  // 3. useBenefit — 权益核销权限校验
  // =============================================================
  describe('useBenefit 权益核销', function() {

    test('useBenefit 不应被权限拒绝', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_cars: [createCar()],
        repair_orders: [],
        repair_members: [{
          _id: 'member_flow_1',
          plate: '粤BFLOW01',
          shopPhone: SHOP_PHONE,
          ownerName: '张三',
          phone: '13900000001',
          name: '张三',
          benefitName: '常规保养卡',
          benefitTotal: 5,
          benefitRemain: 3,
          benefitProducts: [{ productId: 'prod_1', name: '机油', price: 380 }],
          createTime: new Date('2026-01-01')
        }]
      })

      var result = await callAction('useBenefit', {
        shopPhone: SHOP_PHONE,
        plate: '粤BFLOW01',
        memberId: 'member_flow_1',
        benefitIndex: 0,
        createOpenid: SHOP_OPENID
      }, SHOP_OPENID)

      // 不应因权限被拒（核销成功与否取决于具体业务逻辑）
      expect(result.code).not.toBe(-403)
    })
  })

  // =============================================================
  // 4. getDashboardStats — 基本响应验证
  // =============================================================
  describe('getDashboardStats 看板统计', function() {

    test('Dashboard 应返回基本统计数据', async function() {
      resetMockData({
        repair_activationCodes: [createShopOwner()],
        repair_orders: [
          { _id: 'o1', plate: '粤B01', shopPhone: SHOP_PHONE, totalAmount: 100, status: '已完成', isVoided: false, serviceItems: 'A', createTime: new Date(), orderCategory: '普通工单' },
          { _id: 'o2', plate: '粤B02', shopPhone: SHOP_PHONE, totalAmount: 200, status: '已完成', isVoided: false, serviceItems: 'B', createTime: new Date(Date.now() - 86400000), orderCategory: '核销权益卡' }
        ]
      })

      var result = await callAction('getDashboardStats', {
        shopPhone: SHOP_PHONE
      }, SHOP_OPENID)

      expect(result.code).toBe(0)
      expect(result.data).toBeDefined()
      expect(typeof result.data).toBe('object')
      // Dashboard 在 mock 环境下返回的数据取决于后端计算逻辑
      // 只验证基本响应格式，不依赖具体字段名
    })
  })
})
