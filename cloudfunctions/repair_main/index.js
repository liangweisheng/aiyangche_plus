// 云函数：repair_main（聚合路由）
// 职责：统一入口，通过 action 路由到各子业务模块
// action 列表（24个核心 action）：getOpenId / loginByPhoneCode / registerShop / addCar / addMember / createOrder / editOrder / voidOrder / getDashboardStats / getReportOrders / getTotalSpent / getCarOrderStats / saveCheckSheet / updateCarInfo / updateMember / useBenefit / updateOpenid / getCustomerRanking / getCarListAggregation / listCars / listOrders / listMembers / listCheckSheets / exportData

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const { fetchAllOrders, MAX_LIMIT } = require('./common/db-utils')
const { createAuthModule } = require('./common/auth')

// ============================
// 核心鉴权（24 action，已拆分 17 个低耦合 action 到 repair_aux）
// ============================
var CORE_ACTIONS = {
  // 认证域
  getOpenId: 'public',
  loginByPhoneCode: 'public',
  registerShop: 'public',
  updateOpenid: 'public',

  // 核心业务域
  addCar: 'registered',
  createOrder: 'registered',
  editOrder: 'registered',
  voidOrder: 'admin',
  addMember: 'registered',
  updateMember: 'registered',
  updateCarInfo: 'registered',
  useBenefit: 'registered',
  saveCheckSheet: 'registered',

  // 统计聚合域
  getDashboardStats: 'registered',
  getReportOrders: 'admin',
  getCustomerRanking: 'admin',
  getTotalSpent: 'registered',
  getCarOrderStats: 'registered',
  getCarListAggregation: 'registered',

  // 列表查询域
  listCars: 'admin',
  listOrders: 'registered',
  listMembers: 'admin',
  listCheckSheets: 'registered',
  exportData: 'superAdmin+pro',

  // 访客追踪域（零侵入埋点）
  trackVisitor: 'public',
  recordConversion: 'public',
  getVisitorAnalytics: 'public',

  // 运维管理（admin 级别：仅限本店数据，游客可用）
  cleanupCheckSheets: 'admin'
}

// ★ auth 初始化必须在 ACTION_PERMISSIONS 定义之后
var auth = createAuthModule(db, _, CORE_ACTIONS)

// ============================
// parseServiceItems - 解析工单服务项目为统一数组格式
// 兼容两种输入：
//   旧格式（字符串）：serviceItems="名 规，名 规" + serviceAmounts/Quantities/Categories
//   新格式（数组）：serviceItems=[{name,spec,amount,qty,category},...]
// 返回：对象数组 [{name,spec,amount,qty,category}]
// ============================
function parseServiceItems(serviceItems, serviceAmounts, serviceQuantities, serviceCategories) {
  // 已经是新格式（数组）
  if (Array.isArray(serviceItems)) return serviceItems
  // 空或无效的旧格式
  if (!serviceItems || typeof serviceItems !== 'string' || !serviceItems.trim()) return []

  var names = serviceItems.trim().split(/[,，]/).map(function (s) { return s.trim() }).filter(function (s) { return s })
  var amounts = (serviceAmounts || '').split(',').map(function (a) { return Number(a) || 0 })
  var quantities = (serviceQuantities || '').split(',').map(function (q) { return Number(q) || 1 })
  var categories = (serviceCategories || '').split(',').map(function (c) { return c.trim() })

  var result = []
  for (var i = 0; i < names.length; i++) {
    var parts = names[i].split(/\s+/)
    result.push({
      name: parts[0] || names[i],
      spec: parts.slice(1).join(' ') || '',
      amount: amounts[i] || 0,
      qty: quantities[i] || 1,
      category: categories[i] || ''
    })
  }
  return result
}

// ============================
// registerShop - 门店注册
// ============================
async function registerShop(event, openid) {
  var name = event.name || ''
  var phone = event.phone || ''

  if (!name || !name.trim()) {
    return { code: -1, msg: '请输入门店名称' }
  }
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { code: -1, msg: '请输入正确的11位手机号' }
  }

  var shopName = name.trim()
  var shopPhone = phone.trim()

  try {
    var results = await Promise.all([
      db.collection('repair_activationCodes').where({ type: 'free', name: shopName }).count(),
      db.collection('repair_activationCodes').where({ type: 'free', phone: shopPhone }).count()
    ])

    if (results[0].total > 0) {
      return { code: -2, msg: '该门店名称已被注册' }
    }
    if (results[1].total > 0) {
      return { code: -3, msg: '该手机号已被注册' }
    }

    var shopCode = String(Math.floor(100000 + Math.random() * 900000))

    var addResult = await db.collection('repair_activationCodes').add({
      data: {
        name: shopName,
        displayName: '店主',
        phone: shopPhone,
        openid: openid,
        shopCode: shopCode,
        createTime: db.serverDate(),
        type: 'free',
        unlockKey: '',
        usedTime: db.serverDate(),
        role: 'admin'
      }
    })

    return {
      code: 0,
      msg: '注册成功',
      data: { _id: addResult._id, name: shopName, phone: shopPhone, openid: openid, shopCode: shopCode }
    }
  } catch (err) {
    console.error('registerShop 错误:', err)
    return { code: -99, msg: '注册失败，请重试' }
  }
}

// activatePro → 已迁至 repair_aux

// ============================
// addCar - 新增车辆
// ============================
async function addCar(event, openid) {
  var plate = event.plate || ''
  var carType = event.carType || ''
  var color = event.color || ''
  var mileage = event.mileage || 0
  var phone = event.phone || ''
  var maintainDate = event.maintainDate || ''
  var insuranceDate = event.insuranceDate || ''
  var partReplaceName = event.partReplaceName || ''
  var partReplaceDate = event.partReplaceDate || ''
  var remark = event.remark || ''
  var ownerName = event.ownerName || ''
  var vin = event.vin || ''
  var shopPhone = event.shopPhone || ''

  if (!plate || !plate.trim()) {
    return { code: -1, msg: '请输入车牌号' }
  }

  var plateTrim = plate.trim()

  try {
    var existResult = await db.collection('repair_cars')
      .where({ shopPhone: shopPhone, plate: plateTrim })
      .count()

    if (existResult.total > 0) {
      return { code: -2, msg: '该车牌号已存在' }
    }

    var carData = {
      plate: plateTrim,
      carNumber: plateTrim,
      ownerName: (ownerName || '').trim(),
      vin: (vin || '').trim(),
      carType: (carType || '').trim(),
      color: (color || '').trim(),
      mileage: Number(mileage) || 0,
      phone: (phone || '').trim(),
      maintainDate: (maintainDate || '').trim(),
      insuranceDate: (insuranceDate || '').trim(),
      partReplaceName: (partReplaceName || '').trim(),
      partReplaceDate: (partReplaceDate || '').trim(),
      remark: (remark || '').trim(),
      createTime: db.serverDate()
    }
    if (shopPhone) carData.shopPhone = shopPhone
    if (openid) carData._openid = openid

    var addResult = await db.collection('repair_cars').add({ data: carData })

    return {
      code: 0,
      msg: '保存成功',
      data: { _id: addResult._id, plate: plateTrim }
    }
  } catch (err) {
    console.error('addCar 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// addMember - 新增会员
// ============================
async function addMember(event, openid) {
  var plate = event.plate || ''
  var ownerName = event.ownerName || ''
  var phone = event.phone || ''
  var benefits = event.benefits || []
  var benefitName = event.benefitName || ''
  var benefitTotal = event.benefitTotal || 0
  var benefitRemain = event.benefitRemain || 0
  var remark = event.remark || ''
  var shopPhone = event.shopPhone || ''

  if (!plate || !plate.trim()) {
    return { code: -1, msg: '车牌号不能为空' }
  }

  try {
    var plateTrim = plate.trim()

    var existResult = await db.collection('repair_members')
      .where({ shopPhone: shopPhone, plate: plateTrim })
      .get()

    if (existResult.data.length > 0) {
      var member = existResult.data[0]
      var existingBenefits = member.benefits || []
      if (existingBenefits.length === 0 && member.benefitName) {
        existingBenefits = [{ name: member.benefitName, total: member.benefitTotal || 0, remain: member.benefitRemain || 0 }]
      }
      var mergedBenefits = existingBenefits.concat(benefits)

      var updateData = {
        benefits: mergedBenefits,
        benefitName: mergedBenefits[0] ? mergedBenefits[0].name : '',
        benefitTotal: mergedBenefits[0] ? mergedBenefits[0].total : 0,
        benefitRemain: mergedBenefits[0] ? mergedBenefits[0].remain : 0,
        updateTime: db.serverDate()
      }
      if (ownerName) { updateData.ownerName = ownerName; updateData.name = ownerName }
      if (phone) updateData.phone = phone

      await db.collection('repair_members').doc(member._id).update({ data: updateData })

      return { code: 0, msg: '权益追加成功', data: { _id: member._id, plate: plateTrim } }
    }

    var safeBenefits = Array.isArray(benefits) ? benefits : []
    safeBenefits = safeBenefits.map(function(b) {
      var item = {
        name: b.name || '', total: Number(b.total) || 0,
        remain: Number(b.remain) || 0,
        amount: Number(b.amount) || 0,
        remark: b.remark || '',
        addedTime: b.addedTime || db.serverDate()
      }
      if (b.products && b.products.length > 0) {
        item.products = b.products
      }
      return item
    })
    var memberData = {
      carNumber: plateTrim,
      plate: plateTrim,
      ownerName: (ownerName || '').trim() || '未填写',
      name: (ownerName || '').trim() || '未填写',
      phone: (phone || '').trim() || '无',
      benefits: safeBenefits,
      benefitName: safeBenefits[0] ? safeBenefits[0].name : (benefitName || '').trim(),
      benefitTotal: safeBenefits[0] ? safeBenefits[0].total : Number(benefitTotal) || 0,
      benefitRemain: safeBenefits[0] ? safeBenefits[0].remain : Number(benefitRemain) || 0,
      remark: (remark || '').trim(),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
    if (shopPhone) memberData.shopPhone = shopPhone
    if (openid) memberData._openid = openid
    if (event.operatorPhone) memberData.operatorPhone = event.operatorPhone
    if (event.operatorName) memberData.operatorName = event.operatorName

    var addResult = await db.collection('repair_members').add({ data: memberData })

    return {
      code: 0,
      msg: '保存成功',
      data: { _id: addResult._id, plate: plateTrim }
    }
  } catch (err) {
    console.error('addMember 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// createOrder - 创建工单
// ============================
async function createOrder(event, openid) {
  var plate = event.plate || ''
  var serviceItems = event.serviceItems || ''
  var serviceAmounts = event.serviceAmounts || ''
  var totalAmount = event.totalAmount || 0
  var paidAmount = event.paidAmount || 0
  var payMethod = event.payMethod || '1'
  var remark = event.remark || ''
  var status = event.status || '施工中'
  var shopPhone = event.shopPhone || ''
  var setMaintainDate = event.setMaintainDate || ''
  var setMileage = event.setMileage ? Number(event.setMileage) : 0
  var setPartName = event.setPartName || ''
  var setPartDate = event.setPartDate || ''
  var carDocId = event.carDocId || ''
  var partCost = event.partCost || 0
  var profit = event.profit !== undefined ? event.profit : 0
  var serviceCategories = event.serviceCategories || ''
  var orderCategory = event.orderCategory || ''

  if (!plate) {
    return { code: -1, msg: '车牌号不能为空' }
  }
  // 暂存工单（施工中）允许项目和金额为空
  var skipAmountCheck = event._skipAmountCheck
  if (!skipAmountCheck && (!serviceItems || !serviceItems.trim())) {
    return { code: -1, msg: '请输入服务项目' }
  }
  if (!skipAmountCheck && (!totalAmount || Number(totalAmount) <= 0)) {
    return { code: -1, msg: '请输入正确的金额' }
  }

  var amount = Number(totalAmount)

  try {
    var orderData = {
      plate: plate,
      serviceItems: serviceItems.trim(),
      totalAmount: amount,
      paidAmount: Number(paidAmount) || 0,
      payMethod: payMethod,
      remark: remark.trim(),
      status: status,
      isVoided: false,
      createTime: db.serverDate(),
      partCost: Number(partCost),
      profit: Number(profit)
    }
    if (shopPhone) orderData.shopPhone = shopPhone
    if (openid) orderData._openid = openid
    if (event.operatorPhone) orderData.operatorPhone = event.operatorPhone
    if (event.operatorName) orderData.operatorName = event.operatorName
    if (orderCategory) orderData.orderCategory = orderCategory

    // ★ 构建数组格式 _serviceItemsArr（新格式，取代旧 serviceAmounts/serviceQuantities/serviceCategories 字段）
    orderData._serviceItemsArr = parseServiceItems(serviceItems, serviceAmounts, event.serviceQuantities, serviceCategories)

    var orderResult = await db.collection('repair_orders').add({ data: orderData })

    if (carDocId) {
      var carUpdate = {}
      if (setMaintainDate) carUpdate.maintainDate = setMaintainDate
      if (setMileage) carUpdate.mileage = setMileage
      if (setPartName) carUpdate.partReplaceName = setPartName
      if (setPartDate) carUpdate.partReplaceDate = setPartDate

      if (Object.keys(carUpdate).length > 0) {
        try {
          await db.collection('repair_cars').doc(carDocId).update({ data: carUpdate })
        } catch (e) {
          console.warn('同步车辆提醒失败:', e)
        }
      }
    } else {
      // 车辆不存在则自动创建车辆档案
      var carRecord = {
        plate: plate,
        shopPhone: shopPhone,
        createTime: db.serverDate()
      }
      if (openid) carRecord._openid = openid
      if (setMaintainDate) carRecord.maintainDate = setMaintainDate
      if (setMileage) carRecord.mileage = setMileage
      if (setPartName) carRecord.partReplaceName = setPartName
      if (setPartDate) carRecord.partReplaceDate = setPartDate
      try {
        await db.collection('repair_cars').add({ data: carRecord })
      } catch (e) {
        console.warn('自动创建车辆档案失败:', e)
      }
    }

    return {
      code: 0,
      msg: '开单成功',
      data: { orderId: orderResult._id, paidAmount: Number(paidAmount) || 0 }
    }
  } catch (err) {
    console.error('createOrder 失败:', err.message || err.errMsg)
    return { code: -99, msg: '保存失败:' + (err.message || '未知') }
  }
}

// ============================
// getDashboardStats - 首页看板统计
// ============================
async function getDashboardStats(event, openid) {
  var shopPhone = event.shopPhone || ''

  if (!shopPhone) {
    return { code: -1, msg: '缺少门店标识' }
  }

  var baseWhere = { shopPhone: shopPhone, isVoided: _.neq(true) }
  var carBaseWhere = { shopPhone: shopPhone }

  try {
    // ★ 优先使用客户端传入的今日零点毫秒时间戳（手机本地时区），兜底服务器本地计算
    var todayStartMs = event.todayStartMs || 0
    var todayStart = todayStartMs > 0
      ? new Date(todayStartMs)
      : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())

    var results = await Promise.all([
      // 今日开单数
      db.collection('repair_orders')
        .where(Object.assign({}, baseWhere, { createTime: _.gte(todayStart) }))
        .count(),
      // 今日营收（分页全量）
      fetchAllOrders(db, _, Object.assign({}, baseWhere, { createTime: _.gte(todayStart) }), { totalAmount: true }),
      // 总营收（分页全量）
      fetchAllOrders(db, _, baseWhere, { totalAmount: true }),
      // 车辆总数
      db.collection('repair_cars').where(carBaseWhere).count(),
      // 会员总数
      db.collection('repair_members').where(carBaseWhere).count()
    ])

    var todayOrdersRes = results[0]
    var todayOrdersData = results[1]
    var totalOrdersData = results[2]
    var totalCarsRes = results[3]
    var totalMembersRes = results[4]

    var todayRevenue = todayOrdersData.reduce(
      function (sum, item) { return sum + (item.totalAmount || 0) }, 0
    )
    var totalRevenue = totalOrdersData.reduce(
      function (sum, item) { return sum + (item.totalAmount || 0) }, 0
    )

    // 分页查询所有车辆（到期提醒）
    var carsAll = []
    var carsCount = await db.collection('repair_cars').where(carBaseWhere).count()
    if (carsCount.total > 0) {
      var carsBatch = 0
      var carsBatchSize = Math.min(MAX_LIMIT, carsCount.total)
      while (carsBatch * MAX_LIMIT < carsCount.total) {
        var carsRes = await db.collection('repair_cars')
          .where(carBaseWhere)
          .field({
            plate: true, maintainDate: true, insuranceDate: true,
            partReplaceName: true, partReplaceDate: true
          })
          .skip(carsBatch * MAX_LIMIT)
          .limit(carsBatchSize)
          .get()
        carsAll = carsAll.concat(carsRes.data || [])
        carsBatch++
        carsBatchSize = Math.min(MAX_LIMIT, carsCount.total - carsBatch * MAX_LIMIT)
      }
    }

    var alertList = []
    carsAll.forEach(function (car) {
      var fields = [
        { name: car.maintainDate, typeName: '保养到期', typeEmoji: '🔧', icon: 'maintain' },
        { name: car.insuranceDate, typeName: '车险到期', typeEmoji: '🛡️', icon: 'insurance' },
        { name: car.partReplaceDate, typeName: '配件更换', typeEmoji: '⚙️', icon: 'part', content: car.partReplaceName || '' }
      ]
      fields.forEach(function (f) {
        if (!f.name) return
        var d = new Date(f.name)
        if (isNaN(d.getTime())) return
        var days = Math.ceil((d.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000))
        if (days >= -30 && days <= 45) {
          alertList.push({
            plate: car.plate,
            typeName: f.typeName,
            typeEmoji: f.typeEmoji,
            typeIcon: f.icon,
            content: f.content || f.typeName,
            days: days,
            urgent: days <= 7,
            date: f.name
          })
        }
      })
    })

    alertList.sort(function (a, b) { return a.days - b.days })

    return {
      code: 0,
      data: {
        stats: {
          todayOrders: todayOrdersRes.total,
          todayRevenue: todayRevenue,
          totalRevenue: totalRevenue,
          totalCars: totalCarsRes.total
        },
        alertList: alertList,
        totalOrderCount: totalOrdersData.length,
        totalMemberCount: totalMembersRes.total || 0
      }
    }
  } catch (err) {
    console.error('getDashboardStats 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// getReportOrders - 报表订单数据（服务端聚合，突破客户端20条限制）
// v5.3.3: 新增可选 endTime 参数，支持选择历史月份/年份报表
// ============================
async function getReportOrders(event, openid) {
  var shopPhone = event.shopPhone || ''
  var startTime = event.startTime || 0
  var endTime = event.endTime || 0   // v5.3.3 新增，可选

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  try {
    var where = { shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.gte(new Date(startTime)) }
    // 可选：限制结束时间（用于历史月份/年份选择）
    if (endTime > 0) {
      where.createTime = _.and([_.gte(new Date(startTime)), _.lte(new Date(endTime))])
    }
    var orders = await fetchAllOrders(db, _, where, {
      plate: true, totalAmount: true, payMethod: true,
      createTime: true, status: true, items: true
    })
    return { code: 0, data: { orders: orders } }
  } catch (err) {
    console.error('getReportOrders 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// getTotalSpent - 车牌历史消费总额（服务端聚合）
// ============================
async function getTotalSpent(event, openid) {
  var shopPhone = event.shopPhone || ''
  var plate = event.plate || ''

  if (!shopPhone || !plate) return { code: -1, msg: '缺少门店或车牌标识' }

  try {
    var where = { shopPhone: shopPhone, plate: plate, isVoided: _.neq(true) }
    var orders = await fetchAllOrders(db, _, where, { totalAmount: true })
    var spent = orders.reduce(function (sum, item) { return sum + (item.totalAmount || 0) }, 0)
    return { code: 0, data: { totalSpent: spent, orderCount: orders.length } }
  } catch (err) {
    console.error('getTotalSpent 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// getCarOrderStats - 车辆历史工单统计（服务端聚合）
// ============================
async function getCarOrderStats(event, openid) {
  var shopPhone = event.shopPhone || ''
  var plate = event.plate || ''

  if (!shopPhone || !plate) return { code: -1, msg: '缺少门店或车牌标识' }

  try {
    var where = { shopPhone: shopPhone, plate: plate, status: '已完成', isVoided: _.neq(true) }
    var orders = await fetchAllOrders(db, _, where, { totalAmount: true })
    var totalAmount = orders.reduce(function (sum, item) { return sum + (item.totalAmount || 0) }, 0)
    return { code: 0, data: { totalAmount: totalAmount, orderCount: orders.length } }
  } catch (err) {
    console.error('getCarOrderStats 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// saveCheckSheet - 保存查车单
// ============================
async function saveCheckSheet(event, openid) {
  var plate = event.plate || ''
  var checkItems = event.checkItems || {}
  var issue = event.issue || ''
  var suggestion = event.suggestion || ''
  var shopPhone = event.shopPhone || ''

  if (!plate || !plate.trim()) {
    return { code: -1, msg: '车牌号不能为空' }
  }

  try {
    // ★ 幂等保护：检查最近 30 秒内是否有完全相同的记录（防重复提交）
    var dedupResult = await db.collection('repair_checkSheets')
      .where({
        shopPhone: shopPhone,
        plate: plate.trim(),
        operatorPhone: event.operatorPhone || '',
        createTime: _.gte(new Date(Date.now() - 30000))
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()
    if (dedupResult.data && dedupResult.data.length > 0) {
      return {
        code: 0,
        msg: '已保存（防止重复提交）',
        data: { _id: dedupResult.data[0]._id, dedup: true }
      }
    }

    var carRes = await db.collection('repair_cars')
      .where({ shopPhone: shopPhone, plate: plate.trim() })
      .limit(1)
      .get()

    var carData = (carRes.data && carRes.data.length > 0) ? carRes.data[0] : {}

    var checkItemsData = {}
    var defaultKeys = ['exterior', 'tire', 'oil', 'battery', 'brake', 'light', 'chassis', 'other']
    defaultKeys.forEach(function (key) {
      if (checkItems[key]) {
        checkItemsData[key] = checkItems[key]
      } else {
        checkItemsData[key] = { value: '该项未检查', normal: false }
      }
    })

    var sheetData = {
      carNumber: plate.trim(),
      plate: plate.trim(),
      ownerName: carData.ownerName || carData.name || '',
      phone: carData.phone || '',
      carType: carData.carType || '',
      carColor: carData.color || '',
      checkItems: checkItemsData,
      issue: (issue || '').trim() || '无',
      suggestion: (suggestion || '').trim() || '无',
      createTime: db.serverDate()
    }
    if (shopPhone) sheetData.shopPhone = shopPhone
    if (openid) sheetData._openid = openid
    if (event.operatorPhone) sheetData.operatorPhone = event.operatorPhone
    if (event.operatorName) sheetData.operatorName = event.operatorName

    var addResult = await db.collection('repair_checkSheets').add({ data: sheetData })

    return {
      code: 0,
      msg: '保存成功',
      data: { _id: addResult._id }
    }
  } catch (err) {
    console.error('saveCheckSheet 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// updateCarInfo - 更新车辆信息
// ============================
async function updateCarInfo(event, openid) {
  var docId = event.docId || ''
  var updateData = event.updateData || {}
  var shopPhone = event.shopPhone || ''

  if (!docId) {
    return { code: -1, msg: '缺少车辆ID' }
  }
  if (!updateData || typeof updateData !== 'object' || Object.keys(updateData).length === 0) {
    return { code: -1, msg: '缺少更新数据' }
  }

  try {
    var car = await db.collection('repair_cars').doc(docId).get()
    if (!car.data) {
      return { code: -2, msg: '车辆不存在' }
    }
    if (car.data.shopPhone && car.data.shopPhone !== shopPhone) {
      return { code: -3, msg: '无权操作此车辆' }
    }

    var allowedFields = [
      'carType', 'color', 'mileage', 'phone', 'remark', 'ownerName',
      'maintainDate', 'insuranceDate', 'partReplaceName', 'partReplaceDate', 'vin',
      'photos'
    ]
    var safeData = {}
    allowedFields.forEach(function (key) {
      if (updateData[key] !== undefined) {
        safeData[key] = updateData[key]
      }
    })

    if (Object.keys(safeData).length === 0) {
      return { code: -1, msg: '无有效更新字段' }
    }

    await db.collection('repair_cars').doc(docId).update({ data: safeData })

    return { code: 0, msg: '保存成功', data: safeData }
  } catch (err) {
    console.error('updateCarInfo 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// updateOpenid - 登录绑定/清除 openid
// 安全增强：验证 openid 归属，防止越权修改
// 允许：1) 首次绑定 openid（记录尚无 openid） 2) 更新为自己的 openid 3) 清除自己的 openid（退出登录）
// ============================
async function updateOpenid(event, openid) {
  var docId = event.docId || ''
  var clearOpenid = event.clearOpenid || false  // 退出登录时传 true 清除 openid
  if (!docId) return { code: -1, msg: '缺少记录ID' }
  if (!openid) return { code: -2, msg: '缺少调用者身份' }
  try {
    var targetRecord = await db.collection('repair_activationCodes').doc(docId).get()
    if (!targetRecord.data) return { code: -3, msg: '记录不存在' }

    if (clearOpenid) {
      // 退出登录：只有 openid 匹配时才允许清除
      if (targetRecord.data.openid !== openid) {
        return { code: -4, msg: '无权操作' }
      }
      await db.collection('repair_activationCodes').doc(docId).update({
        data: { openid: '' }
      })
    } else {
      // 绑定 openid：记录尚无 openid，或已是自己的 openid（幂等）
      if (targetRecord.data.openid && targetRecord.data.openid !== openid) {
        return { code: -4, msg: '该账号已绑定其他微信' }
      }
      await db.collection('repair_activationCodes').doc(docId).update({
        data: { openid: openid }
      })

      // ★ 安全增强：绑定店主 openid 时，清除同店员工的 staffOpenid（防止员工被越权接管）
      var shopPhone = targetRecord.data.phone || ''
      if (shopPhone) {
        await db.collection('repair_activationCodes')
          .where({ type: 'staff', shopPhone: shopPhone, staffOpenid: openid })
          .update({ data: { staffOpenid: '' } })
          .catch(function () { /* 静默 */ })
      }
    }
    return { code: 0, msg: '更新成功' }
  } catch (err) {
    console.error('updateOpenid 错误:', err)
    return { code: -99, msg: '更新失败' }
  }
}

// ============================
// updateMember - 更新会员信息
// ============================
async function updateMember(event, openid) {
  var docId = event.docId || ''
  var updateData = event.updateData || {}
  var shopPhone = event.shopPhone || ''
  if (!docId) return { code: -1, msg: '缺少会员ID' }
  try {
    var member = await db.collection('repair_members').doc(docId).get()
    if (!member.data) return { code: -2, msg: '会员不存在' }
    if (member.data.shopPhone && member.data.shopPhone !== shopPhone) {
      return { code: -3, msg: '无权操作此会员' }
    }
    updateData.updateTime = db.serverDate()
    await db.collection('repair_members').doc(docId).update({ data: updateData })
    return { code: 0, msg: '保存成功', data: updateData }
  } catch (err) {
    console.error('updateMember 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// useBenefit - 使用权益（扣减+生成工单）
// ============================
async function useBenefit(event, openid) {
  var memberDocId = event.memberDocId || ''
  var benefitIdx = event.benefitIdx !== undefined ? Number(event.benefitIdx) : 0
  var newRemain = event.newRemain !== undefined ? Number(event.newRemain) : -1
  var plate = event.plate || ''
  var shopPhone = event.shopPhone || ''
  var benefitName = event.benefitName || ''
  var benefitTotal = Number(event.benefitTotal) || 0

  if (!memberDocId) return { code: -1, msg: '缺少会员ID' }
  if (newRemain < 0) return { code: -1, msg: '权益次数不足' }

  try {
    var member = await db.collection('repair_members').doc(memberDocId).get()
    if (!member.data) return { code: -2, msg: '会员不存在' }
    if (member.data.shopPhone && member.data.shopPhone !== shopPhone) {
      return { code: -3, msg: '无权操作此会员' }
    }

    // 获取当前权益的关联商品（从 DB 读取，确保权威性）
    var benefit = null
    if (member.data.benefits && member.data.benefits.length > benefitIdx) {
      benefit = member.data.benefits[benefitIdx]
    }
    var benefitProducts = (benefit && benefit.products) || []

    // ★ 如果有关联商品：先校验库存是否充足（不扣减），任一不足则整体失败
    if (benefitProducts.length > 0) {
      for (var pi = 0; pi < benefitProducts.length; pi++) {
        var bp = benefitProducts[pi]
        try {
          var prodRes = await db.collection('repair_products')
            .where({ _id: bp.productId, shopPhone: shopPhone })
            .field({ specStock: true, stock: true, specs: true, name: true })
            .get()
          if (!prodRes.data || prodRes.data.length === 0) {
            return { code: -10, msg: '关联商品 "' + (bp.productName || '') + '" 已不存在，请在权益中重新选择商品' }
          }
          var prod = prodRes.data[0]
          if (bp.spec) {
            var specStock = 0
            ;(prod.specStock || []).forEach(function (s) {
              if (s.label === bp.spec) specStock = s.stock || 0
            })
            if (specStock < bp.quantity) {
              return { code: -10, msg: '商品 "' + prod.name + '(' + bp.spec + ')" 库存不足（当前 ' + specStock + '，需要 ' + bp.quantity + '）' }
            }
          } else {
            if ((prod.stock || 0) < bp.quantity) {
              return { code: -10, msg: '商品 "' + prod.name + '" 库存不足（当前 ' + (prod.stock || 0) + '，需要 ' + bp.quantity + '）' }
            }
          }
        } catch (e) {
          return { code: -10, msg: '库存校验异常: ' + bp.productName }
        }
      }
    }

    // 1. 扣减权益次数
    var updateData = { updateTime: db.serverDate() }
    if (member.data.benefits && member.data.benefits.length > 0) {
      var key = 'benefits.' + benefitIdx + '.remain'
      updateData[key] = newRemain
      var benefits = JSON.parse(JSON.stringify(member.data.benefits))
      benefits[benefitIdx].remain = newRemain
      updateData.benefitName = benefits[0] ? benefits[0].name : ''
      updateData.benefitTotal = benefits[0] ? benefits[0].total : 0
      updateData.benefitRemain = benefits[0] ? benefits[0].remain : 0
    } else {
      updateData.benefitRemain = _.inc(-1)
    }

    await db.collection('repair_members').doc(memberDocId).update({ data: updateData })

    // 2. 生成权益核销工单（核销工单金额统一为 0）
    var orderRef = ''
    // ★ 构建服务项目字符串：权益名称 + 关联商品（如有），追加到工单商品列表
    var baseServiceItems = benefitName || '权益核销'
    var baseServiceAmounts = '0'
    var baseServiceQuantities = '1'
    if (benefitProducts.length > 0) {
      var productNames = []
      var productAmts = []
      var productQtys = []
      benefitProducts.forEach(function (bp) {
        var itemName = '[权益]' + bp.productName
        if (bp.spec) itemName += ' ' + bp.spec
        if (bp.quantity > 1) itemName += ' ×' + bp.quantity
        productNames.push(itemName)
        productAmts.push('0')
        productQtys.push(String(bp.quantity || 1))
      })
      baseServiceItems += ',' + productNames.join(',')
      baseServiceAmounts += ',' + productAmts.join(',')
      baseServiceQuantities += ',' + productQtys.join(',')
    }
    var orderData = {
      plate: plate,
      serviceItems: baseServiceItems,
      totalAmount: 0,
      paidAmount: 0,
      payMethod: '1',
      status: '已完成',
      remark: '权益核销 | 剩余' + newRemain + '/' + benefitTotal + '次',
      isVoided: false,
      createTime: db.serverDate()
    }
    if (shopPhone) orderData.shopPhone = shopPhone
    if (openid) orderData._openid = openid
    if (event.operatorPhone) orderData.operatorPhone = event.operatorPhone
    if (event.operatorName) orderData.operatorName = event.operatorName
    orderData.orderCategory = '核销权益卡'
    // ★ 构建数组格式 _serviceItemsArr（新格式，取代旧 serviceAmounts/serviceQuantities）
    orderData._serviceItemsArr = parseServiceItems(orderData.serviceItems, baseServiceAmounts, baseServiceQuantities, '')
    var orderRes = await db.collection('repair_orders').add({ data: orderData })
    orderRef = orderRes._id

    // ★ 有关联商品：执行库存扣减（调用 repair_inventory.deductStock）
    if (benefitProducts.length > 0) {
      try {
        var deductResult = await cloud.callFunction({
          name: 'repair_inventory',
          data: {
            action: 'deductStock',
            clientOpenid: openid,
            shopPhone: shopPhone,
            items: benefitProducts.map(function (bp) {
              return {
                productId: bp.productId,
                spec: bp.spec || '',
                quantity: bp.quantity,
                amount: 0
              }
            }),
            operator: event.operatorName || '',
            orderRef: orderRef
          }
        })
        if (deductResult.result && deductResult.result.code !== 0) {
          // 库存扣减失败：回滚权益次数 + 删除已创建工单
          var rollbackRemain = newRemain + 1
          var rollbackData = { updateTime: db.serverDate() }
          if (member.data.benefits && member.data.benefits.length > 0) {
            rollbackData['benefits.' + benefitIdx + '.remain'] = rollbackRemain
          } else {
            rollbackData.benefitRemain = _.inc(1)
          }
          await db.collection('repair_members').doc(memberDocId).update({ data: rollbackData })
          await db.collection('repair_orders').doc(orderRef).remove()
          return { code: -11, msg: deductResult.result.msg || '库存扣减失败' }
        }
      } catch (e) {
        // 网络异常：回滚权益次数 + 删除已创建工单
        var rollbackRemain = newRemain + 1
        var rollbackData = { updateTime: db.serverDate() }
        if (member.data.benefits && member.data.benefits.length > 0) {
          rollbackData['benefits.' + benefitIdx + '.remain'] = rollbackRemain
        } else {
          rollbackData.benefitRemain = _.inc(1)
        }
        await db.collection('repair_members').doc(memberDocId).update({ data: rollbackData })
        await db.collection('repair_orders').doc(orderRef).remove()
        return { code: -99, msg: '库存扣减网络异常，权益已恢复' }
      }
    }

    return { code: 0, msg: '已使用', data: { newRemain: newRemain, orderId: orderRef } }
  } catch (err) {
    console.error('useBenefit 错误:', err)
    return { code: -99, msg: '操作失败，请重试' }
  }
}

// ============================
// editOrder - 编辑已有工单
// ============================
async function editOrder(event, openid) {
  var docId = event.orderId || event.docId || ''
  var updateData = event.updateData || {}
  var shopPhone = event.shopPhone || ''
  if (!docId) return { code: -1, msg: '缺少工单ID' }
  if (!updateData || typeof updateData !== 'object' || Object.keys(updateData).length === 0) {
    return { code: -1, msg: '缺少更新数据' }
  }
  try {
    var order = await db.collection('repair_orders').doc(docId).get()
    if (!order.data) return { code: -2, msg: '工单不存在' }
    if (order.data.shopPhone && order.data.shopPhone !== shopPhone) {
      return { code: -3, msg: '无权操作此工单' }
    }
    // ★ 编辑工单时如果有 serviceItems，同步构建 _serviceItemsArr，并清理旧字段
    if (updateData.serviceItems !== undefined) {
      updateData._serviceItemsArr = parseServiceItems(
        updateData.serviceItems,
        updateData.serviceAmounts,
        updateData.serviceQuantities,
        updateData.serviceCategories
      )
      // 清理旧格式冗余字段（数据已在 _serviceItemsArr 中）
      delete updateData.serviceAmounts
      delete updateData.serviceQuantities
      delete updateData.serviceCategories
    }
    await db.collection('repair_orders').doc(docId).update({ data: updateData })

    // 同步提醒字段到车辆档案
    var setMaintainDate = updateData.setMaintainDate || ''
    var setMileage = updateData.setMileage ? Number(updateData.setMileage) : 0
    var setPartName = updateData.setPartName || ''
    var setPartDate = updateData.setPartDate || ''
    if (order.data.plate && order.data.shopPhone) {
      var carUpdate = {}
      if (setMaintainDate) carUpdate.maintainDate = setMaintainDate
      if (setMileage) carUpdate.mileage = setMileage
      if (setPartName) carUpdate.partReplaceName = setPartName
      if (setPartDate) carUpdate.partReplaceDate = setPartDate
      if (Object.keys(carUpdate).length > 0) {
        try {
          await db.collection('repair_cars').where({
            plate: order.data.plate,
            shopPhone: order.data.shopPhone
          }).update({ data: carUpdate })
        } catch (e) {
          console.error('editOrder 同步车辆档案失败:', e)
        }
      }
    }

    return { code: 0, msg: '保存成功', data: updateData }
  } catch (err) {
    console.error('editOrder 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// voidOrder - 作废工单
// ============================
async function voidOrder(event, openid) {
  var docId = event.orderId || event.docId || ''
  var shopPhone = event.shopPhone || ''
  if (!docId) return { code: -1, msg: '缺少工单ID' }
  try {
    var order = await db.collection('repair_orders').doc(docId).get()
    if (!order.data) return { code: -2, msg: '工单不存在' }
    if (order.data.shopPhone && order.data.shopPhone !== shopPhone) {
      return { code: -3, msg: '无权操作此工单' }
    }
    // 仅已完成工单可作废（草稿可直接删除、待结算应走收银流程）
    if (order.data.isVoided) return { code: -4, msg: '工单已作废' }
    if (order.data.status !== '已完成') return { code: -5, msg: '仅已完成工单可作废' }

    // === 库存回滚：如果该工单有扣减项，按规格恢复库存 ===
    var deductedItems = order.data._deductedItems || []
    var orderStockRef = order.data._orderStockRef || docId
    if (deductedItems.length > 0) {
      for (var i = 0; i < deductedItems.length; i++) {
        var item = deductedItems[i]
        try {
          // 查询商品
          var productRes = await db.collection('repair_products')
            .where({ _id: item.productId, shopPhone: shopPhone })
            .get()
          if (!productRes.data || productRes.data.length === 0) continue
          var product = productRes.data[0]

          if (item.spec && product.specStock) {
            // 有规格：按规格回补库存
            var newSpecStock = product.specStock.map(function (s) {
              if (s.label === item.spec) {
                return { label: s.label, stock: (s.stock || 0) + item.quantity }
              }
              return s
            })
            var newTotal = 0
            newSpecStock.forEach(function (s) { newTotal += s.stock || 0 })
            await db.collection('repair_products')
              .where({ _id: item.productId, shopPhone: shopPhone })
              .update({ data: { stock: newTotal, specStock: newSpecStock, updateTime: new Date() } })
          } else {
            // 无规格：直接回补总库存
            await db.collection('repair_products')
              .where({ _id: item.productId, shopPhone: shopPhone })
              .update({ data: { stock: _.inc(item.quantity), updateTime: new Date() } })
          }

          // 写入回补流水
          await db.collection('repair_stock_logs').add({
            data: {
              shopPhone: shopPhone,
              productId: item.productId,
              productName: product.name,
              spec: item.spec || '',
              type: 'adjust',
              quantity: Number(item.quantity),
              cost: 0,
              operator: '系统',
              remark: '工单作废回补',
              orderRef: orderStockRef,
              createTime: new Date()
            }
          })
        } catch (e) {
          console.error('voidOrder 回滚库存失败:', item.productId, e.message)
        }
      }
    }

    await db.collection('repair_orders').doc(docId).update({
      data: { isVoided: true, voidTime: db.serverDate() }
    })
    return { code: 0, msg: '已作废' }
  } catch (err) {
    console.error('voidOrder 错误:', err)
    return { code: -99, msg: '操作失败，请重试' }
  }
}

// updateMyDisplayName → 已迁至 repair_aux
// updateShopInfo → 已迁至 repair_aux

// ============================
// loginByPhoneCode - 多端登录验证（手机号+门店码）
// 用于 Android/iOS App 端登录（不依赖 openid）
// 返回管理员或员工记录信息
// ============================
async function loginByPhoneCode(event, openid) {
  var phone = event.phone || ''
  var shopCode = event.shopCode || ''

  if (!phone) return { code: -1, msg: '请输入手机号' }
  if (!shopCode || shopCode.length !== 6) return { code: -1, msg: '门店码格式错误' }

  try {
    // 并行查管理员和员工记录
    var results = await Promise.all([
      db.collection('repair_activationCodes')
        .where({ type: 'free', phone: phone, shopCode: shopCode })
        .limit(1).get(),
      db.collection('repair_activationCodes')
        .where({ type: 'staff', phone: phone, status: 'active' })
        .limit(1).get()
    ])

    // 1. 管理员匹配
    if (results[0].data && results[0].data.length > 0) {
      var adminRecord = results[0].data[0]
      return {
        code: 0,
        data: {
          record: adminRecord,
          isStaff: false,
          ownerName: adminRecord.name || ''
        }
      }
    }

    // 2. 员工匹配（需验证 shopCode 对应的店主）
    if (results[1].data && results[1].data.length > 0) {
      var staffRecord = results[1].data[0]
      var ownerRes = await db.collection('repair_activationCodes')
        .where({ type: 'free', phone: staffRecord.shopPhone })
        .field({ shopCode: true, name: true })
        .limit(1)
        .get()

      var owner = ownerRes.data && ownerRes.data[0]
      var ownerShopCode = (owner && owner.shopCode) || ''
      if (ownerShopCode === shopCode) {
        return {
          code: 0,
          data: {
            record: staffRecord,
            isStaff: true,
            ownerName: (owner && owner.name) || ''
          }
        }
      }
    }

    // 未匹配到任何记录
    return { code: -2, msg: '手机号或门店码不正确' }
  } catch (err) {
    console.error('[loginByPhoneCode] 错误:', err)
    return { code: -99, msg: '登录异常，请重试' }
  }
}

// ============================
// getCarListAggregation - 车辆列表批量聚合（会员状态 + 工单统计）
// 入参：{ plates: ['粤B12345', '陕A88888', ...] }
// 出参：{ memberMap: { '粤B12345': true }, orderStats: { '粤B12345': { orderCount: 12, totalAmount: 8600 } } }
// ============================
async function getCarListAggregation(event, openid) {
  var shopPhone = event.shopPhone || ''
  var plates = event.plates || []

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  if (!plates || plates.length === 0) {
    return { code: 0, data: { memberMap: {}, orderStats: {} } }
  }

  try {
    // 批量查询分批限制（_.in 最多 100 个元素）
    var BATCH_SIZE = 80
    var memberMap = {}
    var statsMap = {}

    // 1. 分批查会员状态
    for (var i = 0; i < plates.length; i += BATCH_SIZE) {
      var batchPlates = plates.slice(i, i + BATCH_SIZE)
      var memberRes = await db.collection('repair_members')
        .where({ shopPhone: shopPhone, plate: _.in(batchPlates) })
        .field({ plate: true })
        .get()
      ;(memberRes.data || []).forEach(function(r) { memberMap[r.plate] = true })
    }

    // 2. 分批查已完成工单统计
    for (var j = 0; j < plates.length; j += BATCH_SIZE) {
      var batchPlates2 = plates.slice(j, j + BATCH_SIZE)
      var orderRes = await db.collection('repair_orders')
        .where({ shopPhone: shopPhone, plate: _.in(batchPlates2), status: '已完成', isVoided: _.neq(true) })
        .field({ plate: true, totalAmount: true })
        .get()
      ;(orderRes.data || []).forEach(function(o) {
        if (!statsMap[o.plate]) statsMap[o.plate] = { orderCount: 0, totalAmount: 0 }
        statsMap[o.plate].orderCount++
        statsMap[o.plate].totalAmount += (o.totalAmount || 0)
      })
    }

    return { code: 0, data: { memberMap: memberMap, orderStats: statsMap } }
  } catch (err) {
    console.error('getCarListAggregation 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// getOpenId - 获取当前用户 openid（通过读取客户端创建的临时记录的 _openid）
// ============================
async function getOpenId(event, openid) {
  var fetchId = event.fetchId || ''
  if (!fetchId) {
    return { code: 0, openid: openid || '' }
  }
  try {
    var record = await db.collection('repair_activationCodes').doc(fetchId).get()
    var fetchedOpenid = (record.data && record.data._openid) || openid || ''
    // 删除临时记录
    try {
      await db.collection('repair_activationCodes').doc(fetchId).remove()
    } catch (e) { }
    return { code: 0, openid: fetchedOpenid }
  } catch (err) {
    console.error('[getOpenId] 读取临时记录失败:', err)
    return { code: 0, openid: openid || '' }
  }
}

// ============================
// getCustomerRanking - 消费排行（服务端聚合，突破客户端20条限制）
// ============================
async function getCustomerRanking(event, openid) {
  var shopPhone = event.shopPhone || ''
  var startTime = event.startTime
  var endTime = event.endTime
  var page = Number(event.page) || 1
  var pageSize = Number(event.pageSize) || 60

  if (!shopPhone) {
    return { code: -1, msg: '缺少门店标识' }
  }

  var startDate = new Date(startTime)
  if (!startTime || isNaN(startDate.getTime())) {
    return { code: -1, msg: '时间参数错误' }
  }

  try {
    var where = {
      shopPhone: shopPhone,
      isVoided: _.neq(true),
      createTime: _.gte(startDate)
    }
    // P1#4: 支持 endTime 精确限定范围
    if (endTime) {
      var endDate = new Date(endTime)
      if (!isNaN(endDate.getTime())) {
        where.createTime = _.and([_.gte(startDate), _.lte(endDate)])
      }
    }

    // 只查 plate 和 totalAmount 两个字段，大幅减少数据传输量
    var orders = await fetchAllOrders(db, _, where, { plate: true, totalAmount: true })

    if (orders.length === 0) {
      return { code: 0, data: { list: [], total: 0, page: page, pageSize: pageSize } }
    }

    // 按 plate 分组聚合
    var custMap = {}
    orders.forEach(function (o) {
      var plate = o.plate || '未知车牌'
      if (!custMap[plate]) custMap[plate] = { plate: plate, total: 0, count: 0 }
      var amt = parseFloat(o.totalAmount)
      custMap[plate].total += (isNaN(amt) ? 0 : amt)
      custMap[plate].count += 1
    })

    var allSorted = Object.values(custMap).sort(function (a, b) { return b.total - a.total })
    var total = allSorted.length
    var startIdx = (page - 1) * pageSize
    var list = allSorted.slice(startIdx, startIdx + pageSize)

    return {
      code: 0,
      data: { list: list, total: total, page: page, pageSize: pageSize }
    }
  } catch (err) {
    console.error('getCustomerRanking 错误:', err)
    return { code: -99, msg: '消费排行加载失败' }
  }
}

// getCallerAdminInfo → 已迁至 repair_aux
// addStaff / removeStaff / updateStaffRole → 已迁至 repair_aux
// listStaffs → 已迁至 repair_aux

// generateMonthlyReport / _scoreDimension → 已迁至 repair_aux
// getMonthlyReport / listRecentReports / updateShopProfile → 已迁至 repair_aux
// getShopProfile / updateStaffOpenid / batchGenerateMonthlyReports → 已迁至 repair_aux

// ============================
// listCars - 车辆列表（全量 + 聚合统计，替代客户端 _fetchAllCars + getCarListAggregation）
// 一次返回：全量车辆 + 会员状态 + 工单统计，客户端做筛选/分页
// ============================
async function listCars(event, openid) {
  var shopPhone = event.shopPhone || ''
  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  try {
    // 1. 全量查询车辆（服务端 limit=100，比客户端 limit=20 高效）
    var countRes = await db.collection('repair_cars')
      .where({ shopPhone: shopPhone })
      .count()
    var total = countRes.total
    if (total === 0) {
      return { code: 0, data: { list: [], total: 0, memberMap: {}, orderStats: {} } }
    }

    var allCars = []
    var batch = 0
    while (batch * MAX_LIMIT < total) {
      var carsRes = await db.collection('repair_cars')
        .where({ shopPhone: shopPhone })
        .field({ plate: true, ownerName: true, carType: true, phone: true, createTime: true })
        .orderBy('createTime', 'desc')
        .skip(batch * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
      allCars = allCars.concat(carsRes.data || [])
      batch++
    }

    // 2. 批量查会员状态 + 工单统计（复用 getCarListAggregation 逻辑）
    var plates = allCars.map(function (c) { return c.plate })
    var memberMap = {}
    var orderStats = {}
    var AGG_BATCH = 80

    for (var i = 0; i < plates.length; i += AGG_BATCH) {
      var batchPlates = plates.slice(i, i + AGG_BATCH)
      var memberRes = await db.collection('repair_members')
        .where({ shopPhone: shopPhone, plate: _.in(batchPlates) })
        .field({ plate: true })
        .get()
      ;(memberRes.data || []).forEach(function (r) { memberMap[r.plate] = true })

      var orderRes = await db.collection('repair_orders')
        .where({ shopPhone: shopPhone, plate: _.in(batchPlates), status: '已完成', isVoided: _.neq(true) })
        .field({ plate: true, totalAmount: true })
        .get()
      ;(orderRes.data || []).forEach(function (o) {
        if (!orderStats[o.plate]) orderStats[o.plate] = { orderCount: 0, totalAmount: 0 }
        orderStats[o.plate].orderCount++
        orderStats[o.plate].totalAmount += (o.totalAmount || 0)
      })
    }

    return {
      code: 0,
      data: { list: allCars, total: total, memberMap: memberMap, orderStats: orderStats }
    }
  } catch (err) {
    console.error('listCars 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// listOrders - 工单列表（服务端分页 + 会员状态聚合）
// ============================
async function listOrders(event, openid) {
  var shopPhone = event.shopPhone || ''
  var page = Number(event.page) || 1
  var pageSize = Math.min(Number(event.pageSize) || 20, 100)
  var keyword = (event.keyword || '').trim()
  var statusFilter = event.statusFilter || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  try {
    var where = { shopPhone: shopPhone, isVoided: _.neq(true) }
    if (keyword) {
      where.plate = db.RegExp({ regexp: keyword, options: 'i' })
    }
    if (statusFilter) {
      where.status = statusFilter
    }

    // 查总数
    var countRes = await db.collection('repair_orders').where(where).count()
    var total = countRes.total

    if (total === 0) {
      return { code: 0, data: { list: [], total: 0 } }
    }

    // 分页查询
    var skip = (page - 1) * pageSize
    var ordersRes = await db.collection('repair_orders')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    var orders = ordersRes.data || []

    // 批量查会员状态
    var plates = []
    orders.forEach(function (o) {
      if (o.plate && plates.indexOf(o.plate) === -1) plates.push(o.plate)
    })

    var memberPlateSet = {}
    if (plates.length > 0) {
      var memberRes = await db.collection('repair_members')
        .where({ shopPhone: shopPhone, plate: _.in(plates) })
        .field({ plate: true })
        .get()
      ;(memberRes.data || []).forEach(function (m) { memberPlateSet[m.plate] = true })
    }

    // 组装结果（附带 isMember 标记）
    var list = orders.map(function (o) {
      o.isMember = !!memberPlateSet[o.plate]
      return o
    })

    return { code: 0, data: { list: list, total: total } }
  } catch (err) {
    console.error('listOrders 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// listMembers - 会员列表（服务端分页查询 + 多字段搜索）
// ============================
async function listMembers(event, openid) {
  var shopPhone = event.shopPhone || ''
  var page = Number(event.page) || 1
  var pageSize = Math.min(Number(event.pageSize) || 20, 100)
  var keyword = (event.keyword || '').trim()

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  try {
    var where = { shopPhone: shopPhone }

    // 关键词搜索：车牌号 / 车主姓名 / 手机号
    if (keyword) {
      where = _.and([
        { shopPhone: shopPhone },
        _.or([
          { plate: db.RegExp({ regexp: keyword, options: 'i' }) },
          { ownerName: db.RegExp({ regexp: keyword, options: 'i' }) },
          { phone: db.RegExp({ regexp: keyword, options: 'i' }) }
        ])
      ])
    }

    // 查总数
    var countRes = await db.collection('repair_members').where(where).count()
    var total = countRes.total

    // 分页查询
    var skip = (page - 1) * pageSize
    var membersRes = await db.collection('repair_members')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    var members = membersRes.data || []

    return { code: 0, data: { list: members, total: total } }
  } catch (err) {
    console.error('listMembers 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// listCheckSheets - 查车单列表（服务端分页查询）
// ============================
async function listCheckSheets(event, openid) {
  var shopPhone = event.shopPhone || ''
  var page = Number(event.page) || 1
  var pageSize = Math.min(Number(event.pageSize) || 20, 100)
  var keyword = (event.keyword || '').trim()

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  try {
    var where = { shopPhone: shopPhone }
    if (keyword) {
      where.plate = db.RegExp({ regexp: keyword, options: 'i' })
    }

    // 查总数
    var countRes = await db.collection('repair_checkSheets').where(where).count()
    var total = countRes.total

    // 分页查询
    var skip = (page - 1) * pageSize
    var sheetsRes = await db.collection('repair_checkSheets')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()

    var sheets = sheetsRes.data || []

    return { code: 0, data: { list: sheets, total: total } }
  } catch (err) {
    console.error('listCheckSheets 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// exportData - 数据导出（全量查询，仅Pro版店主账号）
// 替代客户端 _fetchAll 的 N 次分批请求，服务端一次返回全部数据
// ============================
async function exportData(event, openid) {
  var shopPhone = event.shopPhone || ''
  var type = event.type || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  if (!type || ['cars', 'members', 'orders', 'stock_logs'].indexOf(type) === -1) {
    return { code: -1, msg: '导出类型参数错误' }
  }

  try {
    var collectionName = type === 'cars' ? 'repair_cars' : type === 'members' ? 'repair_members' : type === 'stock_logs' ? 'repair_stock_logs' : 'repair_orders'
    var where = { shopPhone: shopPhone }
    if (type === 'orders') {
      where.isVoided = _.neq(true)
    }
    // inventory 流水可选筛选：流水类型 + 时间范围
    if (type === 'stock_logs') {
      if (event.logType && ['in', 'out', 'adjust'].indexOf(event.logType) !== -1) {
        where.type = event.logType
      }
      if (event.startDate) {
        where.createTime = where.createTime || {}
        where.createTime.$gte = new Date(event.startDate + ' 00:00:00')
      }
      if (event.endDate) {
        where.createTime = where.createTime || {}
        // endDate 取当天 23:59:59，确保包含当天数据
        where.createTime.$lte = new Date(event.endDate + ' 23:59:59')
      }
    }

    var countRes = await db.collection(collectionName).where(where).count()
    var total = countRes.total
    if (total === 0) {
      return { code: 0, data: { list: [], total: 0 } }
    }

    // 限制最大导出记录数
    var maxRecords = 5000
    var fetchTotal = total > maxRecords ? maxRecords : total

    // 服务端分批获取数据（limit=100）
    var allData = []
    var batch = 0
    while (batch * MAX_LIMIT < fetchTotal) {
      var res = await db.collection(collectionName)
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(batch * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
      allData = allData.concat(res.data || [])
      batch++
    }

    return { code: 0, data: { list: allData, total: allData.length } }
  } catch (err) {
    console.error('exportData 错误:', err)
    return { code: -99, msg: '导出失败' }
  }
}
// ocrPlate / ocrVIN → 已迁至 repair_aux

// deleteAccount → 已迁至 repair_aux

// ============================
// trackVisitor - 访客追踪埋点（零侵入：前端显式调用，不影响任何业务逻辑）
// 入参：{ event, isGuest, source, deviceModel, deviceSystem }
// 逻辑：
//   1. 从 wxContext.OPENID 获取真实 openid（游客模式下 wxContext 仍可获取）
//   2. upsert repair_visitor_tracking 集合
//   3. 更新 visitCount / lastVisitTime / pageViews / lastActions / recentDays
//   4. 首次访问时记录 deviceModel/deviceSystem/source
// 返回：{ code: 0, msg: 'ok' }
// ============================
async function trackVisitor(event, openid) {
  if (!openid || openid.length < 5) {
    // 无有效 openid（如多端模式匿名用户）→ 静默跳过
    return { code: 0, msg: 'skipped' }
  }

  var evtName = event.event || 'unknown'
  var isGuest = !!event.isGuest
  var source = event.source || ''        // 'miniprogram' | 'multiend' | 'web'
  var deviceModel = event.deviceModel || ''
  var deviceSystem = event.deviceSystem || ''

  try {
    var todayStr = new Date().toISOString().slice(0, 10)  // '2026-06-01'

    // 1. 查询现有记录
    var existRes = await db.collection('repair_visitor_tracking')
      .where({ openid: openid })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      // 已存在 → 更新
      var doc = existRes.data[0]
      var updateData = {
        lastVisitTime: db.serverDate(),
        visitCount: _.inc(1),
        totalApiCalls: _.inc(1),
        isGuest: isGuest,
        ['recentDays.' + todayStr]: _.inc(1),
        updateTime: db.serverDate()
      }

      // lastActions: 保留最近 10 条
      var lastActions = (doc.lastActions || []).slice(0, 9)
      lastActions.unshift(evtName + '@' + new Date().toISOString())
      updateData.lastActions = lastActions

      // pageViews: 记录事件名
      if (doc.pageViews) {
        updateData['pageViews.' + evtName] = _.inc(1)
      } else {
        updateData.pageViews = {}
        updateData.pageViews[evtName] = 1
      }

      // source 只在首次设置后保留，不覆盖
      if (!doc.source && source) {
        updateData.source = source
      }

      await db.collection('repair_visitor_tracking').doc(doc._id).update({ data: updateData })
    } else {
      // 首次访问 → 创建
      var newData = {
        openid: openid,
        firstVisitTime: db.serverDate(),
        lastVisitTime: db.serverDate(),
        visitCount: 1,
        totalApiCalls: 1,
        isGuest: isGuest,
        source: source,
        deviceModel: deviceModel,
        deviceSystem: deviceSystem,
        pageViews: {},
        lastActions: [evtName + '@' + new Date().toISOString()],
        recentDays: {},
        converted: false,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
      newData.pageViews[evtName] = 1
      newData.recentDays[todayStr] = 1

      await db.collection('repair_visitor_tracking').add({ data: newData })
    }

    return { code: 0, msg: 'ok' }
  } catch (err) {
    // ★ 埋点失败静默，绝不抛出错误影响业务流程
    console.warn('[trackVisitor] 静默失败:', err && err.message || err)
    return { code: 0, msg: 'silent_error' }
  }
}

// ============================
// recordConversion - 记录访客转化（游客 → 注册）
// 入参：{ phone }
// 逻辑：
//   1. 从 wxContext.OPENID 获取真实 openid
//   2. 更新 repair_visitor_tracking 记录：converted=true, conversionTime, conversionPhone, isGuest=false
// 返回：{ code: 0, msg: 'ok' }
// ============================
async function recordConversion(event, openid) {
  var phone = event.phone || ''
  if (!openid || openid.length < 5) {
    return { code: 0, msg: 'skipped' }
  }
  if (!phone) {
    return { code: 0, msg: 'skipped_no_phone' }
  }

  try {
    var existRes = await db.collection('repair_visitor_tracking')
      .where({ openid: openid })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      await db.collection('repair_visitor_tracking').doc(existRes.data[0]._id).update({
        data: {
          converted: true,
          conversionTime: db.serverDate(),
          conversionPhone: phone,
          isGuest: false,
          updateTime: db.serverDate()
        }
      })
    }
    // 如果记录不存在（极端情况：trackVisitor 从未被调用过），静默跳过

    return { code: 0, msg: 'ok' }
  } catch (err) {
    console.warn('[recordConversion] 静默失败:', err && err.message || err)
    return { code: 0, msg: 'silent_error' }
  }
}

// ============================
// getVisitorAnalytics - 获取访客分析统计数据（供 mytool 仪表盘调用）
// 权限：仅 superAdmin 可调用（通过 CORE_ACTIONS 鉴权）
// 返回聚合后的访客统计数据
// ============================
async function getVisitorAnalytics(event, openid) {
  try {
    var now = new Date()
    var todayStr = now.toISOString().slice(0, 10)
    var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // 分页全量查询
    var allRecords = []
    var batch = 0
    var countRes = await db.collection('repair_visitor_tracking').count()
    var total = countRes.total
    while (batch * MAX_LIMIT < total) {
      var res = await db.collection('repair_visitor_tracking')
        .skip(batch * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
      allRecords = allRecords.concat(res.data || [])
      batch++
    }

    if (allRecords.length === 0) {
      return { code: 0, data: { overview: {}, dailyTrend: [], pageRanking: [], sourceDistribution: {} } }
    }

    // === 统计计算 ===
    var totalVisitors = allRecords.length
    var newToday = 0
    var new7d = 0
    var new30d = 0
    var convertedCount = 0
    var totalVisitsForConversion = 0
    var conversionVisitCount = 0
    var active7d = 0

    // 来源分布
    var sourceDist = {}
    // 页面排行（聚合所有记录）
    var pageRankMap = {}
    // 最近行为排行
    var actionRankMap = {}
    // 每日新增趋势（近 30 天）
    var dailyNewMap = {}

    // 初始化近 30 天数组
    for (var d = 0; d < 30; d++) {
      var dayDate = new Date(now.getTime() - (29 - d) * 24 * 60 * 60 * 1000)
      var dayKey = dayDate.toISOString().slice(0, 10)
      dailyNewMap[dayKey] = 0
    }

    allRecords.forEach(function (r) {
      var ft = r.firstVisitTime ? new Date(r.firstVisitTime) : null
      var lt = r.lastVisitTime ? new Date(r.lastVisitTime) : null

      // 今日新增
      if (ft && ft.toISOString().slice(0, 10) === todayStr) newToday++
      // 7 日新增
      if (ft && ft >= sevenDaysAgo) new7d++
      // 30 日新增
      if (ft && ft >= thirtyDaysAgo) new30d++

      // 7 日活跃
      if (lt && lt >= sevenDaysAgo) active7d++

      // 转化
      if (r.converted) {
        convertedCount++
        if (r.visitCount > 0) {
          totalVisitsForConversion += r.visitCount
          conversionVisitCount++
        }
      }

      // 来源分布
      var src = r.source || 'unknown'
      sourceDist[src] = (sourceDist[src] || 0) + 1

      // 页面排行
      var pv = r.pageViews || {}
      Object.keys(pv).forEach(function (k) {
        pageRankMap[k] = (pageRankMap[k] || 0) + pv[k]
      })

      // 最近行为排行
      var actions = r.lastActions || []
      actions.forEach(function (a) {
        var actionName = a.split('@')[0] || a
        actionRankMap[actionName] = (actionRankMap[actionName] || 0) + 1
      })

      // 每日新增趋势（按 firstVisitTime）
      if (ft) {
        var ftKey = ft.toISOString().slice(0, 10)
        if (dailyNewMap[ftKey] !== undefined) {
          dailyNewMap[ftKey]++
        }
      }
    })

    // 排序
    var pageRanking = Object.keys(pageRankMap)
      .map(function (k) { return { key: k, count: pageRankMap[k] } })
      .sort(function (a, b) { return b.count - a.count })
      .slice(0, 10)

    var actionRanking = Object.keys(actionRankMap)
      .map(function (k) { return { key: k, count: actionRankMap[k] } })
      .sort(function (a, b) { return b.count - a.count })

    var dailyTrend = Object.keys(dailyNewMap).sort().map(function (k) {
      return { date: k, count: dailyNewMap[k] }
    })

    var conversionRate = totalVisitors > 0
      ? Math.round(convertedCount / totalVisitors * 10000) / 100
      : 0

    var avgVisitsToConversion = conversionVisitCount > 0
      ? Math.round(totalVisitsForConversion / conversionVisitCount * 10) / 10
      : 0

    return {
      code: 0,
      data: {
        overview: {
          totalVisitors: totalVisitors,
          newToday: newToday,
          new7d: new7d,
          new30d: new30d,
          active7d: active7d,
          convertedCount: convertedCount,
          conversionRate: conversionRate,
          avgVisitsToConversion: avgVisitsToConversion
        },
        dailyTrend: dailyTrend,
        pageRanking: pageRanking,
        actionRanking: actionRanking,
        sourceDistribution: sourceDist
      }
    }
  } catch (err) {
    console.error('[getVisitorAnalytics] 错误:', err)
    return { code: -99, msg: '统计加载失败' }
  }
}

// ============================
// cleanupCheckSheets - 清理重复查车单（运维专用）
// ============================
async function cleanupCheckSheets(event, openid) {
  var shopPhone = event.shopPhone || ''
  var dryRun = event.dryRun !== false  // 默认 true，安全模式

  try {
    var whereCondition = {}
    if (shopPhone) {
      whereCondition.shopPhone = shopPhone
    }

    // ★ 分页全量扫描：先 count，再分批拉取
    var countRes = await db.collection('repair_checkSheets')
      .where(whereCondition)
      .count()
    var totalCount = countRes.total
    if (totalCount === 0) {
      return { code: 0, msg: '没有数据', data: { total: 0, duplicates: 0, deleted: 0, dryRun: dryRun } }
    }

    var allData = []
    var batch = 0
    while (batch * MAX_LIMIT < totalCount) {
      var res = await db.collection('repair_checkSheets')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .skip(batch * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
      allData = allData.concat(res.data || [])
      batch++
    }

    if (allData.length === 0) {
      return { code: 0, msg: '没有数据', data: { total: 0, duplicates: 0, deleted: 0, dryRun: dryRun } }
    }

    // 构建去重 key：shopPhone + plate + operatorPhone + checkItems 序列化
    var groups = {}
    allData.forEach(function (doc) {
      var key = (doc.shopPhone || '') + '|' + (doc.plate || '') + '|' + (doc.operatorPhone || '')
      // 序列化 checkItems 作为内容指纹
      var checkStr = JSON.stringify(doc.checkItems || {})
      key = key + '|' + (doc.issue || '') + '|' + (doc.suggestion || '') + '|' + checkStr
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(doc)
    })

    // 找出所有重复组
    var duplicateIds = []
    var duplicateCount = 0
    for (var key in groups) {
      if (groups[key].length > 1) {
        // 按 createTime 排序（最新的保留，其余删除）
        var docs = groups[key].sort(function (a, b) {
          var ta = a.createTime ? (a.createTime.getTime ? a.createTime.getTime() : 0) : 0
          var tb = b.createTime ? (b.createTime.getTime ? b.createTime.getTime() : 0) : 0
          return tb - ta  // desc
        })
        for (var i = 1; i < docs.length; i++) {
          duplicateIds.push(docs[i]._id)
          duplicateCount++
        }
      }
    }

    if (duplicateCount === 0) {
      return { code: 0, msg: '没有发现重复数据', data: { total: allData.length, duplicates: 0, deleted: 0, dryRun: dryRun } }
    }

    if (!dryRun) {
      // 分批删除（每批最多 100 条）
      var batchSize = 100
      for (var j = 0; j < duplicateIds.length; j += batchSize) {
        var batchIds = duplicateIds.slice(j, j + batchSize)
        await db.collection('repair_checkSheets')
          .where({ _id: _.in(batchIds) })
          .remove()
      }
    }

    return {
      code: 0,
      msg: (dryRun ? '[预览模式] ' : '') + '共 ' + allData.length + ' 条数据，发现 ' + duplicateCount + ' 条重复' + (dryRun ? '（未实际删除）' : '（已删除）'),
      data: { total: allData.length, duplicates: duplicateCount, deleted: dryRun ? 0 : duplicateCount, dryRun: dryRun }
    }
  } catch (err) {
    console.error('cleanupCheckSheets 错误:', err)
    return { code: -99, msg: '清理失败: ' + (err.message || '未知错误') }
  }
}

// ============================
// 路由入口
// ============================
exports.main = async (event, context) => {
  var action = event.action || ''

  if (!action) {
    return { code: -1, msg: '缺少 action 参数' }
  }

  var wxContext = cloud.getWXContext()
  var openid = event.clientOpenid || wxContext.OPENID || ''

  var handler = {
    getOpenId: getOpenId,
    loginByPhoneCode: loginByPhoneCode,
    registerShop: registerShop,
    addCar: addCar,
    addMember: addMember,
    createOrder: createOrder,
    editOrder: editOrder,
    voidOrder: voidOrder,
    getDashboardStats: getDashboardStats,
    getReportOrders: getReportOrders,
    getTotalSpent: getTotalSpent,
    getCarOrderStats: getCarOrderStats,
    saveCheckSheet: saveCheckSheet,
    updateCarInfo: updateCarInfo,
    updateMember: updateMember,
    useBenefit: useBenefit,
    updateOpenid: updateOpenid,
    getCustomerRanking: getCustomerRanking,
    getCarListAggregation: getCarListAggregation,
    listCars: listCars,
    listOrders: listOrders,
    listMembers: listMembers,
    listCheckSheets: listCheckSheets,
    exportData: exportData,
    // 访客追踪（零侵入埋点）
    trackVisitor: trackVisitor,
    recordConversion: recordConversion,
    getVisitorAnalytics: getVisitorAnalytics,
    // 运维管理
    cleanupCheckSheets: cleanupCheckSheets
    // 17 个低耦合 action 已迁至 repair_aux
  }

  if (!handler[action]) {
    return { code: -1, msg: '未知的 action: ' + action }
  }

  // ============================
  // 统一鉴权（Phase 2）：替代原有 WRITE_ACTIONS + _validateWriteAccess
  // 根据 ACTION_PERMISSIONS 配置自动校验权限
  // ============================
  var permResult = await auth.checkPermission(action, event, openid)
  if (!permResult.ok) {
    return { code: permResult.code, msg: permResult.msg }
  }

  return handler[action](event, openid)
}
