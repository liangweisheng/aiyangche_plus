// 云函数：repair_main（聚合路由）
// 职责：统一入口，通过 action 路由到各子业务模块
// action 列表（共38个）：getOpenId / loginByPhoneCode / registerShop / activatePro / addCar / addMember / createOrder / editOrder / voidOrder / getDashboardStats / getReportOrders / getTotalSpent / getCarOrderStats / saveCheckSheet / updateCarInfo / updateMember / useBenefit / updateOpenid / updateShopInfo / updateMyDisplayName / getCustomerRanking / addStaff / removeStaff / updateStaffRole / listStaffs / updateStaffOpenid / generateMonthlyReport / getMonthlyReport / listRecentReports / updateShopProfile / getShopProfile / batchGenerateMonthlyReports / getCarListAggregation / listCars / listOrders / listMembers / listCheckSheets / exportData

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100
const benchmarks = require('./benchmarks')

// ============================
// 统一鉴权中间件 — Phase 2
// 权限等级：public < registered < admin < superAdmin
// 组合标记：'+pro' 表示需要同时是Pro版
// ============================
var ACTION_PERMISSIONS = {
  // 认证域 — 无需鉴权
  getOpenId: 'public',
  loginByPhoneCode: 'public',
  updateOpenid: 'public',          // ★ 自身鉴权在函数内部实现
  updateStaffOpenid: 'public',     // ★ 自身鉴权在函数内部实现

  // 门店域
  registerShop: 'public',
  activatePro: 'registered',
  updateMyDisplayName: 'registered',   // ★ 员工自助修改显示名称无需管理员权限
  updateShopInfo: 'admin',
  getShopProfile: 'registered',
  updateShopProfile: 'admin+pro',

  // 核心业务域
  addCar: 'registered',
  createOrder: 'registered',
  editOrder: 'registered',
  voidOrder: 'admin',              // ★ 仅管理员可作废
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

  // 列表查询域（替代客户端 DB 直查，统一数据获取策略）
  listCars: 'admin',
  listOrders: 'registered',
  listMembers: 'admin',
  listCheckSheets: 'registered',
  exportData: 'superAdmin+pro',

  // 员工管理域
  addStaff: 'admin+pro',
  removeStaff: 'admin',
  updateStaffRole: 'admin',
  listStaffs: 'admin',

  // 月报域
  generateMonthlyReport: 'admin+pro',
  getMonthlyReport: 'registered',
  listRecentReports: 'registered',
  batchGenerateMonthlyReports: 'public'   // ★ 定时触发器，内部校验
}

// ============================
// 分页获取全部记录（突破单次limit限制）
// ============================
async function fetchAllOrders(where, field) {
  var countRes = await db.collection('repair_orders').where(where).count()
  var total = countRes.total
  if (total === 0) return []
  var allData = []
  var batch = 0
  var batchSize = Math.min(MAX_LIMIT, total)
  while (batch * MAX_LIMIT < total) {
    var query = db.collection('repair_orders').where(where).field(field).skip(batch * MAX_LIMIT).limit(batchSize)
    var res = await query.get()
    allData = allData.concat(res.data || [])
    batch++
    batchSize = Math.min(MAX_LIMIT, total - batch * MAX_LIMIT)
  }
  return allData
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

// ============================
// activatePro - Pro版激活
// ============================
async function activatePro(event, openid) {
  var code = event.code || ''

  if (!code || !code.trim()) {
    return { code: -1, msg: '请输入激活码' }
  }

  var inputCode = code.trim()

  try {
    var query = { type: 'free' }
    var shopPhone = event.shopPhone || ''
    if (shopPhone) {
      query.phone = shopPhone                          // 多端：按 phone 查
    } else if (openid) {
      query.openid = openid                            // 小程序：按 openid 兜底
    } else {
      return { code: -2, msg: '未找到门店信息' }
    }
    var records = await db.collection('repair_activationCodes')
      .where(query)
      .orderBy('createTime', 'desc')                   // 保留：防御重复 phone
      .limit(1)
      .get()

    if (!records.data || records.data.length === 0) {
      return { code: -2, msg: '未找到门店信息' }
    }

    var shopRecord = records.data[0]
    var dbUnlockKey = (shopRecord.unlockKey || '').trim()

    if (inputCode.toLowerCase() !== dbUnlockKey.toLowerCase()) {
      return { code: -3, msg: '激活码不正确' }
    }

    if (shopRecord.code && shopRecord.code.toLowerCase() === dbUnlockKey.toLowerCase()) {
      if (shopRecord.expireTime) {
        var expireDate = new Date(shopRecord.expireTime)
        if (expireDate.getTime() > Date.now()) {
          return { code: -4, msg: 'Pro版已激活，有效期至' + expireDate.toLocaleDateString() }
        }
      }
    }

    await db.collection('repair_activationCodes')
      .doc(shopRecord._id)
      .update({
        data: {
          code: inputCode,
          expireTime: db.serverDate({ offset: 365 * 24 * 60 * 60 * 1000 }),
          unlockKey: '',
          updateTime: db.serverDate()
        }
      })

    var expDate = new Date()
    expDate.setFullYear(expDate.getFullYear() + 1)

    return {
      code: 0,
      msg: 'Pro版激活成功！',
      data: { proType: 'year', expireTime: expDate.toISOString() }
    }
  } catch (err) {
    console.error('activatePro 错误:', err)
    return { code: -99, msg: '激活失败，请重试' }
  }
}

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
      return {
        name: b.name || '', total: Number(b.total) || 0,
        remain: Number(b.remain) || 0,
        amount: Number(b.amount) || 0,
        remark: b.remark || '',
        addedTime: b.addedTime || db.serverDate()
      }
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
  var setPartName = event.setPartName || ''
  var setPartDate = event.setPartDate || ''
  var carDocId = event.carDocId || ''
  var partCost = event.partCost || 0
  var profit = event.profit !== undefined ? event.profit : 0

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
      serviceAmounts: (serviceAmounts || '').trim(),
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

    var orderResult = await db.collection('repair_orders').add({ data: orderData })

    if (carDocId) {
      var carUpdate = {}
      if (setMaintainDate) carUpdate.maintainDate = setMaintainDate
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
      fetchAllOrders(Object.assign({}, baseWhere, { createTime: _.gte(todayStart) }), { totalAmount: true }),
      // 总营收（分页全量）
      fetchAllOrders(baseWhere, { totalAmount: true }),
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
      where.createTime = _.and(_.gte(new Date(startTime)), _.lte(new Date(endTime)))
    }
    var orders = await fetchAllOrders(where, {
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
    var orders = await fetchAllOrders(where, { totalAmount: true })
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
    var orders = await fetchAllOrders(where, { totalAmount: true })
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
      'maintainDate', 'insuranceDate', 'partReplaceName', 'partReplaceDate', 'vin'
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
    var orderData = {
      plate: plate,
      serviceItems: benefitName || '权益核销',
      serviceAmounts: '0',
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
    var orderRes = await db.collection('repair_orders').add({ data: orderData })

    return { code: 0, msg: '已使用', data: { newRemain: newRemain, orderId: orderRes._id } }
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
    await db.collection('repair_orders').doc(docId).update({ data: updateData })
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
    await db.collection('repair_orders').doc(docId).update({
      data: { isVoided: true, voidTime: db.serverDate() }
    })
    return { code: 0, msg: '已作废' }
  } catch (err) {
    console.error('voidOrder 错误:', err)
    return { code: -99, msg: '操作失败，请重试' }
  }
}

// ============================
// updateMyDisplayName - 员工自助修改显示名称（registered 权限，非 admin）
// ============================
async function updateMyDisplayName(event, openid) {
  var value = event.value
  if (value === undefined || value === null) return { code: -1, msg: '缺少显示名称' }

  try {
    var shopPhone = event.shopPhone || ''
    var selfQuery = null
    if (openid && openid.length > 5) {
      selfQuery = _.or([
        { openid: openid, type: 'free' },
        { staffOpenid: openid, type: 'staff' }
      ])
    } else if (shopPhone) {
      selfQuery = _.or([
        { phone: shopPhone, type: 'free' },
        { phone: event.clientPhone || shopPhone, type: 'staff' }
      ])
    } else {
      return { code: -2, msg: '缺少身份标识' }
    }
    var selfRecords = await db.collection('repair_activationCodes')
      .where(selfQuery).orderBy('createTime', 'desc').limit(1).get()
    if (!selfRecords.data || selfRecords.data.length === 0) {
      return { code: -2, msg: '未找到账号记录' }
    }
    await db.collection('repair_activationCodes').doc(selfRecords.data[0]._id).update({
      data: { displayName: String(value), updateTime: db.serverDate() }
    })
    return { code: 0, msg: '已保存' }
  } catch (err) {
    console.error('updateMyDisplayName 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

// ============================
// updateShopInfo - 更新门店信息
// ============================
async function updateShopInfo(event, openid) {
  var field = event.field || ''
  var value = event.value
  if (!field) return { code: -1, msg: '缺少字段名' }

  // 字段白名单（防止任意字段注入）
  var allowedFields = ['name', 'shopTel', 'shopAddr', 'displayName']
  if (allowedFields.indexOf(field) === -1) {
    return { code: -1, msg: '不允许修改该字段' }
  }

  try {
    var shopPhone = event.shopPhone || ''

    // displayName 是用户级别字段：需要更新调用者自己的记录（free 或 staff）
    if (field === 'displayName') {
      var selfQuery = null
      if (openid && openid.length > 5) {
        selfQuery = _.or([
          { openid: openid, type: 'free' },
          { staffOpenid: openid, type: 'staff' }
        ])
      } else if (shopPhone) {
        // 多端：按 phone 查自己的记录
        selfQuery = _.or([
          { phone: shopPhone, type: 'free' },
          { phone: event.clientPhone || shopPhone, type: 'staff' }
        ])
      } else {
        return { code: -2, msg: '缺少身份标识' }
      }
      var selfRecords = await db.collection('repair_activationCodes')
        .where(selfQuery).orderBy('createTime', 'desc').limit(1).get()
      if (!selfRecords.data || selfRecords.data.length === 0) {
        return { code: -2, msg: '未找到账号记录' }
      }
      var selfUpdateData = {}
      selfUpdateData[field] = value
      selfUpdateData.updateTime = db.serverDate()
      await db.collection('repair_activationCodes').doc(selfRecords.data[0]._id).update({
        data: selfUpdateData
      })
      return { code: 0, msg: '已保存' }
    }

    // 门店级别字段：更新店主记录
    var query = { type: 'free' }
    if (shopPhone) {
      query.phone = shopPhone                          // 多端：按 phone 查
    } else if (openid) {
      query.openid = openid                            // 小程序：按 openid 兜底
    } else {
      return { code: -2, msg: '缺少门店标识' }          // 兜底报错
    }
    var records = await db.collection('repair_activationCodes')
      .where(query).orderBy('createTime', 'desc').limit(1).get()
    if (!records.data || records.data.length === 0) {
      return { code: -2, msg: '未找到门店记录' }
    }
    var updateData = {}
    updateData[field] = value
    updateData.updateTime = db.serverDate()
    await db.collection('repair_activationCodes').doc(records.data[0]._id).update({
      data: updateData
    })
    return { code: 0, msg: '已保存' }
  } catch (err) {
    console.error('updateShopInfo 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
  }
}

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
        where.createTime = _.gte(startDate).and(_.lte(endDate))
      }
    }

    // 只查 plate 和 totalAmount 两个字段，大幅减少数据传输量
    var orders = await fetchAllOrders(where, { plate: true, totalAmount: true })

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

// ============================
// getCallerAdminInfo - 获取调用者的管理员信息（统一权限校验）
// 兼容店主(type='free')和被授权的管理员员工(type='staff', role='admin')
// 返回店主的记录（包含正确的 phone/code/expireTime），或 null
// ============================
async function getCallerAdminInfo(openid, shopPhone) {
  // ★ 多端模式：shopPhone 优先（openid 为空）
  if (shopPhone && !openid) {
    var byPhone = await db.collection('repair_activationCodes')
      .where({ phone: shopPhone, type: 'free', role: 'admin' })
      .limit(1)
      .get()
    if (byPhone.data && byPhone.data.length > 0) {
      var ownerRecord = byPhone.data[0]
      ownerRecord._callerType = 'free'
      return ownerRecord                            // 返回店主记录（带调用者类型标记）
    }
    return null                                     // 未找到管理员
  }

  // 小程序模式：按 openid 查（兼容店主和员工管理员）
  var caller = await db.collection('repair_activationCodes')
    .where(_.or([
      { openid: openid, role: 'admin' },
      { staffOpenid: openid, role: 'admin' }
    ]))
    .limit(1).get()

  if (!caller.data || caller.data.length === 0) return null

  var record = caller.data[0]

  // 如果当前用户是员工管理员(type='staff')，反查店主记录获取真实信息
  if (record.type === 'staff') {
    var shopPhone = record.shopPhone || ''
    if (!shopPhone) return null
    var owner = await db.collection('repair_activationCodes')
      .where({ type: 'free', phone: shopPhone })
      .field({ phone: true, code: true, expireTime: true, role: true })
      .limit(1)
      .get()
    if (!owner.data || owner.data.length === 0) return null
    var ownerRecord = owner.data[0]
    ownerRecord._callerType = 'staff'
    return ownerRecord
  }

  // 当前用户就是店主，直接返回
  record._callerType = record.type || 'free'
  return record
}

// ============================
// _checkShopAccess - 轻量级门店访问权限校验
// 验证调用者（openid）是否属于该门店（店主或员工）
// 返回 true/false
// ============================
async function _checkShopAccess(openid, shopPhone) {
  if (!shopPhone) return false             // 必须有 shopPhone
  if (!openid) return true                 // 空 openid 信任 shopPhone（多端模式）
  // 游客共享账号放行：shopPhone 为游客账号时，任何 openid 均可访问（与 checkPermission 保持一致）
  var GUEST_PHONE = '13507720000'
  if (shopPhone === GUEST_PHONE) return true
  try {
    var res = await db.collection('repair_activationCodes')
      .where(_.or([
        { openid: openid, phone: shopPhone },
        { staffOpenid: openid, shopPhone: shopPhone, status: 'active' }  // ★ 员工必须 status=active
      ]))
      .limit(1)
      .get()
    return !!(res.data && res.data.length > 0)
  } catch (e) {
    console.error('[ACCESS] _checkShopAccess异常 shopPhone=' + shopPhone, e)
    return false
  }
}

// ============================
// addStaff - 添加员工（仅管理员，Pro版）
// ============================
async function addStaff(event, openid) {
  var staffPhone = event.staffPhone || ''
  var staffRole = event.staffRole || 'staff'
  var staffDisplayName = (event.staffDisplayName || '').trim()
  var shopPhone = event.shopPhone || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  if (!staffPhone || !/^1[3-9]\d{9}$/.test(staffPhone)) {
    return { code: -1, msg: '请输入正确的11位员工手机号' }
  }
  if (staffRole !== 'staff' && staffRole !== 'admin') {
    return { code: -1, msg: '角色参数错误' }
  }

  try {
    // 1. 验证调用者是管理员（兼容店主和员工管理员）
    var callerAdmin = await getCallerAdminInfo(openid, event.shopPhone)
    var realShopPhone = callerAdmin.phone || shopPhone

    // ★ v6.0 收紧权限：仅超级管理员(type='free')可添加员工
    if (callerAdmin._callerType !== 'free') {
      return { code: -7, msg: '仅超级管理员可添加员工' }
    }

    // 2. 验证门店是 Pro 版
    var isPro = callerAdmin.code && callerAdmin.expireTime &&
      new Date(callerAdmin.expireTime).getTime() > Date.now()
    if (!isPro) {
      return { code: -3, msg: '仅Pro版可使用员工管理功能' }
    }

    // 3. 检查员工手机号是否已有 type='staff' 的员工记录（含被移除的，用 type 而非 role 区分）
    var existStaffCheck = await db.collection('repair_activationCodes')
      .where({ phone: staffPhone, type: 'staff' })
      .limit(1).get()
    if (existStaffCheck.data && existStaffCheck.data.length > 0) {
      var existStaff = existStaffCheck.data[0]
      if (existStaff.status === 'active' && existStaff.shopPhone !== realShopPhone) {
        return { code: -4, msg: '该手机号已是其他门店的员工' }
      }
      if (existStaff.status === 'active' && existStaff.shopPhone === realShopPhone) {
        return { code: -6, msg: '该员工已在本店中' }
      }
      // 历史离职员工（status='removed'），重新激活
      await db.collection('repair_activationCodes').doc(existStaff._id).update({
        data: {
          role: staffRole,
          shopPhone: realShopPhone,
          staffOpenid: '',
          newAccount: true,       // ★ 标记待首次登录绑定
          addedBy: openid,
          addedTime: db.serverDate(),
          status: 'active',
          displayName: staffDisplayName,
          updateTime: db.serverDate()
        }
      })
      return { code: 0, msg: '员工已重新激活', data: { _id: existStaff._id } }
    }

    // 4. 检查是否是其他店主（type='free' 且有完整注册信息的记录）
    var ownerCheck = await db.collection('repair_activationCodes')
      .where({ type: 'free', phone: staffPhone })
      .limit(1).get()
    if (ownerCheck.data && ownerCheck.data.length > 0) {
      return { code: -5, msg: '该手机号已是门店管理员' }
    }

    // 5. 检查是否已是本店员工
    var shopStaffCheck = await db.collection('repair_activationCodes')
      .where({ shopPhone: realShopPhone, phone: staffPhone, status: 'active' })
      .limit(1).get()
    if (shopStaffCheck.data && shopStaffCheck.data.length > 0) {
      return { code: -6, msg: '该员工已在本店中' }
    }

    // 6. 新增员工记录（type='staff' 区分管理员记录）
    var addResult = await db.collection('repair_activationCodes').add({
      data: {
        phone: staffPhone,
        shopPhone: realShopPhone,
        role: staffRole,
        staffOpenid: '',
        newAccount: true,         // ★ 标记待首次登录绑定
        addedBy: openid,
        addedTime: db.serverDate(),
        status: 'active',
        type: 'staff',
        displayName: staffDisplayName,
        createTime: db.serverDate()
      }
    })

    return { code: 0, msg: '添加成功', data: { _id: addResult._id } }
  } catch (err) {
    console.error('addStaff 错误:', err)
    return { code: -99, msg: '添加失败，请重试' }
  }
}

// ============================
// removeStaff - 移除员工（仅管理员）
// ============================
async function removeStaff(event, openid) {
  var staffDocId = event.staffDocId || ''
  var shopPhone = event.shopPhone || ''

  if (!staffDocId) return { code: -1, msg: '缺少员工ID' }

  try {
    // 验证调用者是管理员（兼容店主和员工管理员）
    var callerAdmin = await getCallerAdminInfo(openid, event.shopPhone)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可移除员工' }
    }
    // ★ v6.0 收紧权限：仅超级管理员可移除员工
    if (callerAdmin._callerType !== 'free') {
      return { code: -7, msg: '仅超级管理员可移除员工' }
    }
    var realShopPhone = callerAdmin.phone || shopPhone

    // 标记为离职 + 清空 staffOpenid（双保险防止已登录状态继续访问）
    await db.collection('repair_activationCodes').doc(staffDocId).update({
      data: { status: 'removed', staffOpenid: '', updateTime: db.serverDate() }
    })

    return { code: 0, msg: '已移除' }
  } catch (err) {
    console.error('removeStaff 错误:', err)
    return { code: -99, msg: '操作失败，请重试' }
  }
}

// ============================
// updateStaffRole - 修改员工角色（仅管理员）
// ============================
async function updateStaffRole(event, openid) {
  var staffDocId = event.staffDocId || ''
  var newRole = event.newRole || ''
  var shopPhone = event.shopPhone || ''

  if (!staffDocId) return { code: -1, msg: '缺少员工ID' }
  if (newRole !== 'staff' && newRole !== 'admin') {
    return { code: -1, msg: '角色参数错误' }
  }

  try {
    // 验证调用者是管理员（兼容店主和员工管理员）
    var callerAdmin = await getCallerAdminInfo(openid, event.shopPhone)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可修改角色' }
    }
    // ★ v6.0 收紧权限：仅超级管理员可修改员工角色
    if (callerAdmin._callerType !== 'free') {
      return { code: -7, msg: '仅超级管理员可修改员工角色' }
    }

    await db.collection('repair_activationCodes').doc(staffDocId).update({
      data: { role: newRole, updateTime: db.serverDate() }
    })

    return { code: 0, msg: '已更新' }
  } catch (err) {
    console.error('updateStaffRole 错误:', err)
    return { code: -99, msg: '操作失败，请重试' }
  }
}

// ============================
// listStaffs - 获取员工列表（仅管理员）
// ============================
async function listStaffs(event, openid) {
  var shopPhone = event.shopPhone || ''

  try {
    // 验证调用者是管理员（兼容店主和员工管理员）
    var callerAdmin = await getCallerAdminInfo(openid, event.shopPhone)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可查看员工列表' }
    }
    var realShopPhone = callerAdmin.phone || shopPhone

    var staffs = await db.collection('repair_activationCodes')
      .where({ shopPhone: realShopPhone, type: 'staff', status: 'active' })
      .field({ phone: true, role: true, staffOpenid: true, addedTime: true, addedBy: true, displayName: true })
      .orderBy('addedTime', 'desc')
      .limit(50)
      .get()

    return {
      code: 0,
      data: { list: staffs.data || [] }
    }
  } catch (err) {
    console.error('listStaffs 错误:', err)
    return { code: -99, msg: '加载失败' }
  }
}

// ============================
// generateMonthlyReport - 生成月度经营报告（核心计算引擎）
// ============================
async function generateMonthlyReport(event, openid) {
  var shopPhone = event.shopPhone || ''
  var yearMonth = event.yearMonth || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  if (!yearMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    return { code: -1, msg: '月份格式错误，应为 YYYY-MM' }
  }

  // 鉴权：验证调用者属于该门店（店主或员工）
  // 空 openid 表示系统内部调用（如定时触发器批量生成），跳过鉴权
  if (openid) {
    var hasAccess = await _checkShopAccess(openid, shopPhone)
    if (!hasAccess) return { code: -3, msg: '无权访问该门店数据' }
  }

  try {
    // 解析月份起止时间
    var year = parseInt(yearMonth.split('-')[0])
    var month = parseInt(yearMonth.split('-')[1]) - 1
    var monthStart = new Date(year, month, 1)
    var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

    var baseWhere = { shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.gte(monthStart).and(_.lte(monthEnd)) }

    // 并行获取：当月订单、历史所有订单(用于新客/老客判断)、车辆列表、门店配置
    var ordersRes = await fetchAllOrders(baseWhere, { plate: true, totalAmount: true, serviceItems: true, createTime: true })
    var allOrdersRes = await fetchAllOrders({ shopPhone: shopPhone, isVoided: _.neq(true) }, { plate: true, createTime: true })

    // ====== 三重前置校验 ======

    // 【守卫1】完全无数据（原逻辑）
    if (ordersRes.length === 0 && allOrdersRes.length === 0) {
      return { code: -2, msg: '该月份暂无经营数据' }
    }

    // 【守卫2】新店/新注册门店 — 请求月份早于首单时间
    // 场景：5月6日注册的新店，4月份根本不存在，不应生成4月月报
    var firstOrderTime = null
    for (var fi = 0; fi < allOrdersRes.length; fi++) {
      var ot = new Date(allOrdersRes[fi].createTime)
      if (!firstOrderTime || ot < firstOrderTime) firstOrderTime = ot
    }
    if (firstOrderTime && firstOrderTime > monthEnd) {
      return { code: -2, msg: '该月份门店尚未开业' }
    }

    // 【守卫3】数据量不足 — 当月工单少于阈值（样本太少统计意义低）
    var MIN_REPORT_ORDERS = 20
    if (ordersRes.length < MIN_REPORT_ORDERS) {
      return { code: -2, msg: '本月工单数(' + ordersRes.length + ')未达报告生成门槛(' + MIN_REPORT_ORDERS + '单)' }
    }

    // ====== 基础指标计算 ======
    var revenue = ordersRes.reduce(function (s, o) { return s + (parseFloat(o.totalAmount) || 0) }, 0)
    var orderCount = ordersRes.length
    var avgTicket = orderCount > 0 ? Math.round(revenue / orderCount * 100) / 100 : 0

    // 不重复车牌
    var platesSet = {}
    ordersRes.forEach(function (o) { if (o.plate) platesSet[o.plate] = true })
    var uniquePlates = Object.keys(platesSet).length

    // ====== 新客占比 ======
    // 历史所有车牌（不含当月）
    var historicalPlates = {}
    allOrdersRes.forEach(function (o) {
      if (o.plate && o.createTime) {
        var t = new Date(o.createTime)
        if (t < monthStart) historicalPlates[o.plate] = true
      }
    })
    var newCustomerPlates = 0
    Object.keys(platesSet).forEach(function (p) {
      if (!historicalPlates[p]) newCustomerPlates++
    })
    var newCustomerRatio = uniquePlates > 0 ? Math.round(newCustomerPlates / uniquePlates * 10000) / 10000 : 0

    // ====== 维保占比 & 增值占比 ======
    // 维保关键词（基础保养、维修类）
    var MAINTENANCE_KEYWORDS = ['保养', '机油', '机滤', '空滤', '空调滤', '刹车油', '防冻液', '冷却液', '变速箱', '波箱', '火花塞', '皮带', '轮胎', '电瓶', '蓄电池', '维修', '检查', '检测', '诊断']
    var VALUE_ADDED_KEYWORDS = ['波箱油', '变速箱油', 'ATF', 'CVT', '刹车片', '刹车盘', '制动片', '制动盘', '防冻液', '冷却液', '水箱水', '空调清洗', '氟利昂', '冷媒', '蒸发箱清洗', '燃油清洗', '喷油嘴', '节气门', '积碳', '发动机清洗', '内饰消毒', '漆面养护', '镀晶', '打蜡', '四轮定位', '动平衡']

    var maintenanceOrderCount = 0
    var valueAddedOrderCount = 0

    ordersRes.forEach(function (o) {
      var items = (o.serviceItems || '').toLowerCase()
      if (!items) return

      var isMaintenance = MAINTENANCE_KEYWORDS.some(function (kw) { return items.indexOf(kw) !== -1 })
      var isValueAdded = VALUE_ADDED_KEYWORDS.some(function (kw) { return items.indexOf(kw) !== -1 })

      if (isMaintenance) maintenanceOrderCount++
      if (isValueAdded) valueAddedOrderCount++
    })

    var maintenanceRatio = orderCount > 0 ? Math.round(maintenanceOrderCount / orderCount * 10000) / 10000 : 0
    var valueAddedRatio = orderCount > 0 ? Math.round(valueAddedOrderCount / orderCount * 10000) / 10000 : 0

    // ====== 老客复购率 ======
    var repeatPlateCount = 0
    Object.keys(platesSet).forEach(function (p) {
      if (historicalPlates[p]) repeatPlateCount++
    })
    var repeatRate = uniquePlates > 0 ? Math.round(repeatPlateCount / uniquePlates * 10000) / 10000 : 0

    // ====== 客单价趋势（对比上月）=====
    var prevMonthStart = new Date(year, month - 1, 1)
    var prevMonthEnd = new Date(year, month, 0, 23, 59, 59, 999)
    var prevOrders = await fetchAllOrders(
      { shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.gte(prevMonthStart).and(_.lte(prevMonthEnd)) },
      { totalAmount: true }
    )
    var prevRevenue = prevOrders.reduce(function (s, o) { return s + (parseFloat(o.totalAmount) || 0) }, 0)
    var prevAvgTicket = prevOrders.length > 0 ? Math.round(prevRevenue / prevOrders.length * 100) / 100 : 0

    var avgTicketTrend = 'stable'
    var ticketChangePercent = 0
    if (prevAvgTicket > 0 && avgTicket > 0) {
      ticketChangePercent = Math.round((avgTicket - prevAvgTicket) / prevAvgTicket * 10000) / 100
      avgTicketTrend = ticketChangePercent > 2 ? 'up' : ticketChangePercent < -2 ? 'down' : 'stable'
    }

    // 环比营收变化
    var prevMonthRevenueChange = prevRevenue > 0 ? Math.round((revenue - prevRevenue) / prevRevenue * 10000) / 100 : 0

    // ====== 健康评分计算 ======
    var dimNewCust = _scoreDimension(newCustomerRatio, [0.30, 0.20, 0.10], [20, 15, 10, 5])
    var dimMaint = _scoreDimension(maintenanceRatio, [0.70, 0.50, 0.30], [20, 15, 10, 5])
    var dimValueAdd = _scoreDimension(valueAddedRatio, [0.20, 0.10, 0.05], [20, 15, 10, 5])
    var dimRepeat = _scoreDimension(repeatRate, [0.70, 0.50, 0.30], [20, 15, 10, 5])
    // 客单价基准（引用 benchmarks.js 配置）
    var benchmark = benchmarks.SMALL_SHOP.avgTicketDefaultBenchmark
    var ticketRatio = benchmark > 0 ? avgTicket / benchmark : 0
    var dimTicket = _scoreDimension(ticketRatio, [1.2, 0.8, 0.5], [20, 15, 10, 5])

    var totalScore = dimNewCust + dimMaint + dimValueAdd + dimRepeat + dimTicket
    var level = totalScore >= 85 ? 'excellent' : totalScore >= 70 ? 'good' : totalScore >= 50 ? 'warning' : 'critical'

    // ====== 诊断规则匹配 ======
    var diagnoses = []
    if (newCustomerRatio < 0.15) {
      diagnoses.push({
        type: 'new_customer_low',
        severity: 'warning',
        title: '新客获取不足',
        detail: '本月新客占比' + (newCustomerRatio * 100).toFixed(0) + '%，低于同规模门店平均水平（约25%）。',
        suggestion: '建议开展"老带新"优惠活动；在周边社区投放地推物料；利用朋友圈发布养护知识吸引车主。',
        relatedCaseImageId: 'case_new_customer'
      })
    }
    if (valueAddedRatio < 0.10) {
      diagnoses.push({
        type: 'value_added_low',
        severity: 'warning',
        title: '增值服务渗透不足',
        detail: '增值项目仅占' + (valueAddedRatio * 100).toFixed(0) + '%，有较大提升空间。每增加1个刹车油/波箱油项目≈+200元营收。',
        suggestion: '建立检查清单流程，每次接待主动检查刹车油/冷却液/空调滤芯；将增值项目套餐化。',
        relatedCaseImageId: 'case_value_added'
      })
    }
    if (repeatRate < 0.40) {
      diagnoses.push({
        type: 'repeat_customer_low',
        severity: 'warning',
        title: '客户流失风险',
        detail: '老客复购率' + (repeatRate * 100).toFixed(0) + '%偏低，需关注客户留存。',
        suggestion: '在保养到期前7天主动微信提醒；为常客户提供专属折扣或优先服务权益。',
        relatedCaseImageId: 'case_retention'
      })
    }
    if (maintenanceRatio < 0.40) {
      diagnoses.push({
        type: 'maintenance_ratio_low',
        severity: 'info',
        title: '维保业务占比较低',
        detail: '维保类工单占' + (maintenanceRatio * 100).toFixed(0) + '%，以快修/美容为主。维保是稳定收入来源。',
        suggestion: '培训技师掌握标准保养流程话术；制作保养套餐价格透明化展示板。',
        relatedCaseImageId: 'case_maintenance'
      })
    }
    if (ticketRatio < 0.7 && avgTicket > 0) {
      diagnoses.push({
        type: 'avg_ticket_low',
        severity: 'warning',
        title: '客单价偏低',
        detail: '平均客单价¥' + avgTicket + '低于行业基准¥' + benchmark + '，有提升空间。',
        suggestion: '优化服务项目组合，推荐性价比高的升级方案；对高价值车型提供差异化服务包。',
        relatedCaseImageId: 'case_ticket'
      })
    }
    // 正面反馈（无严重问题时）
    if (diagnoses.filter(function (d) { return d.severity === 'warning' }).length === 0) {
      diagnoses.push({
        type: 'all_good',
        severity: 'success',
        title: '经营状况良好',
        detail: '综合评分' + totalScore + '分，各项指标表现优异！继续保持。',
        suggestion: '',
        relatedCaseImageId: 'case_excellent'
      })
    }

    // 最多保留4条诊断
    diagnoses = diagnoses.slice(0, 4)

    // ====== 获取门店配置快照 ======
    var shopProfileRecord = await db.collection('repair_activationCodes')
      .where({ phone: shopPhone, type: 'free' })
      .field({ bayCount: true, openYear: true, city: true })
      .limit(1)
      .get()

    var shopProfile = null
    if (shopProfileRecord.data && shopProfileRecord.data.length > 0) {
      shopProfile = {
        bayCount: shopProfileRecord.data[0].bayCount || 2,
        openYear: shopProfileRecord.data[0].openYear || '',
        city: shopProfileRecord.data[0].city || '',
        avgTicketBenchmark: benchmark
      }
    }

    // 构建完整报告数据
    var reportData = {
      shopPhone: shopPhone,
      yearMonth: yearMonth,
      reportTime: db.serverDate(),
      revenue: Math.round(revenue * 100) / 100,
      orderCount: orderCount,
      avgTicket: avgTicket,
      uniquePlates: uniquePlates,
      metrics: {
        newCustomerRatio: newCustomerRatio,
        maintenanceRatio: maintenanceRatio,
        valueAddedRatio: valueAddedRatio,
        repeatRate: repeatRate,
        avgTicketTrend: avgTicketTrend,
        avgTicketChangePercent: ticketChangePercent
      },
      comparison: {
        prevMonthRevenueChange: prevMonthRevenueChange,
        prevYearRevenueChange: null   // 需要去年数据时再算
      },
      healthScore: {
        total: totalScore,
        level: level,
        dimensions: {
          newCustomer: dimNewCust,
          maintenance: dimMaint,
          valueAdded: dimValueAdd,
          repeatCustomer: dimRepeat,
          avgTicket: dimTicket
        }
      },
      diagnoses: diagnoses,
      shopProfile: shopProfile
    }

    // 幂等写入/更新数据库
    var existingReport = await db.collection('repair_monthlyReports')
      .where({ shopPhone: shopPhone, yearMonth: yearMonth })
      .limit(1)
      .get()

    if (existingReport.data && existingReport.data.length > 0) {
      await db.collection('repair_monthlyReports').doc(existingReport.data[0]._id).update({
        data: Object.assign({ updateTime: db.serverDate() }, reportData)
      })
    } else {
      await db.collection('repair_monthlyReports').add({ data: reportData })
    }

    return { code: 0, msg: '报告生成成功', data: reportData }
  } catch (err) {
    console.error('[generateMonthlyReport] 错误:', err)
    return { code: -99, msg: '生成失败: ' + (err.message || '未知错误') }
  }
}

// 维度评分辅助函数
function _scoreDimension(value, thresholds, scores) {
  // thresholds 从高到低: [优秀线, 良好线, 一般线]
  // scores 对应: [优秀分, 良好分, 一般分, 低分]
  if (!thresholds || thresholds.length !== 3) return scores[3]
  if (value >= thresholds[0]) return scores[0]
  if (value >= thresholds[1]) return scores[1]
  if (value >= thresholds[2]) return scores[2]
  return scores[3]
}

// ============================
// getMonthlyReport - 获取某月月报
// ============================
async function getMonthlyReport(event, openid) {
  var shopPhone = event.shopPhone || ''
  var yearMonth = event.yearMonth || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  if (!yearMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    return { code: -1, msg: '月份格式错误，应为 YYYY-MM' }
  }

  // 鉴权：验证调用者属于该门店
  var hasAccess = await _checkShopAccess(openid, shopPhone)
  if (!hasAccess) return { code: -3, msg: '无权访问该门店数据' }

  try {
    var res = await db.collection('repair_monthlyReports')
      .where({ shopPhone: shopPhone, yearMonth: yearMonth })
      .limit(1)
      .get()

    if (res.data && res.data.length > 0) {
      return { code: 0, data: res.data[0] }
    }

    // ★ 兜底前轻量前置检查：避免对明显不符合条件的门店浪费生成资源
    var _rmParts = yearMonth.split('-')
    var _rmStart = new Date(Number(_rmParts[0]), Number(_rmParts[1]) - 1, 1)
    var _rmEnd = new Date(Number(_rmParts[0]), Number(_rmParts[1]), 0, 23, 59, 59)
    var _quickCheck = await db.collection('repair_orders')
      .where({ shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.gte(_rmStart).and(_.lte(_rmEnd)) })
      .count()
    if (_quickCheck.total < MIN_REPORT_ORDERS) {
      return { code: -2, msg: '该月份工单数(' + _quickCheck.total + ')未达报告生成门槛(' + MIN_REPORT_ORDERS + '单)' }
    }

    // ★ 兜底：未找到报告时，尝试按需自动生成一次
    var genResult = await generateMonthlyReport({ shopPhone: shopPhone, yearMonth: yearMonth }, openid)

    if (genResult.code === 0) {
      return genResult
    }

    // 生成失败（数据不足等原因），返回具体原因
    return genResult
  } catch (err) {
    console.error('[getMonthlyReport] 错误:', err)
    return { code: -99, msg: '查询失败' }
  }
}

// ============================
// listRecentReports - 获取最近N个月月报摘要
// ============================
async function listRecentReports(event, openid) {
  var shopPhone = event.shopPhone || ''
  var limit = Math.min(Math.max(Number(event.limit) || 3, 1), 12)

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  // 鉴权：验证调用者属于该门店
  var hasAccess = await _checkShopAccess(openid, shopPhone)
  if (!hasAccess) return { code: -3, msg: '无权访问该门店数据' }

  try {
    var res = await db.collection('repair_monthlyReports')
      .where({ shopPhone: shopPhone })
      .field({ yearMonth: true, revenue: true, orderCount: true, healthScore: true, reportTime: true })
      .orderBy('yearMonth', 'desc')
      .limit(limit)
      .get()

    return {
      code: 0,
      data: { list: res.data || [], total: res.data ? res.data.length : 0 }
    }
  } catch (err) {
    console.error('[listRecentReports] 错误:', err)
    return { code: -99, msg: '查询失败' }
  }
}

// ============================
// updateShopProfile - 更新门店配置（工位数、开业年份等）
// ============================
async function updateShopProfile(event, openid) {
  var shopPhone = event.shopPhone || ''
  var bayCount = event.bayCount
  var openYear = event.openYear
  var city = event.city || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }

  try {
    // 验证调用者是管理员
    var callerAdmin = await getCallerAdminInfo(openid, event.shopPhone)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可修改门店配置' }
    }

    var updateData = { updateTime: db.serverDate() }
    if (bayCount !== undefined && bayCount !== null) {
      var bc = Number(bayCount)
      if (isNaN(bc) || bc < 1 || bc > 50) {
        return { code: -1, msg: '工位数应为1-50的数字' }
      }
      updateData.bayCount = bc
    }
    if (openYear !== undefined && openYear !== null && openYear !== '') {
      var oy = Number(openYear)
      if (isNaN(oy) || oy < 1990 || oy > 2030) {
        return { code: -1, msg: '开业年份不合法' }
      }
      updateData.openYear = oy
    }
    if (city !== '') {
      updateData.city = String(city).trim()
    }

    var record = await db.collection('repair_activationCodes')
      .where({ phone: shopPhone, type: 'free' })
      .limit(1)
      .get()

    if (!record.data || record.data.length === 0) {
      return { code: -2, msg: '未找到门店记录' }
    }

    await db.collection('repair_activationCodes').doc(record.data[0]._id).update({
      data: updateData
    })

    return { code: 0, msg: '已保存' }
  } catch (err) {
    console.error('[updateShopProfile] 错误:', err)
    return { code: -99, msg: '保存失败' }
  }
}

// ============================
// getShopProfile - 获取门店配置
// ============================
async function getShopProfile(event, openid) {
  var shopPhone = event.shopPhone || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  // 轻量鉴权：验证调用者为已登录用户
  if (!openid) return { code: -3, msg: '未登录' }

  try {
    var res = await db.collection('repair_activationCodes')
      .where({ phone: shopPhone, type: 'free' })
      .field({ bayCount: true, openYear: true, city: true, name: true, phone: true })
      .limit(1)
      .get()

    if (res.data && res.data.length > 0) {
      var r = res.data[0]
      return {
        code: 0,
        data: {
          bayCount: r.bayCount || null,
          openYear: r.openYear || null,
          city: r.city || '',
          name: r.name || '',
          phone: r.phone || ''
        }
      }
    }

    return { code: -2, msg: '未找到门店记录' }
  } catch (err) {
    console.error('[getShopProfile] 错误:', err)
    return { code: -99, msg: '查询失败' }
  }
}

// ============================
// updateStaffOpenid - 绑定/清除员工 openid
// 绑定：员工登录时写入 staffOpenid（安全增强：强制使用调用者 openid）
// 清除：员工退出登录时传 clearStaffOpenid=true 清除绑定
// ============================
async function updateStaffOpenid(event, openid) {
  var staffDocId = event.staffDocId || ''
  var clearStaffOpenid = event.clearStaffOpenid || false
  if (!staffDocId || !openid) return { code: -1, msg: '参数不完整' }
  try {
    var staffRecord = await db.collection('repair_activationCodes').doc(staffDocId).get()
    if (!staffRecord.data) return { code: -2, msg: '员工记录不存在' }

    if (clearStaffOpenid) {
      // 退出登录：只有 staffOpenid 匹配或从未绑定时允许清除
      if (staffRecord.data.staffOpenid && staffRecord.data.staffOpenid !== openid) {
        console.warn('[updateStaffOpenid] openid不匹配，拒绝清除', {
          stored: staffRecord.data.staffOpenid,
          current: openid
        })
        return { code: -3, msg: '无权操作' }
      }
      await db.collection('repair_activationCodes').doc(staffDocId).update({
        data: { staffOpenid: '' }
      })
      return { code: 0, msg: '已清除绑定' }
    }

    // 绑定：验证该员工记录尚未绑定其他 openid（只允许首次绑定或重复绑定自己的）
    if (staffRecord.data.staffOpenid && staffRecord.data.staffOpenid !== openid) {
      return { code: -3, msg: '该员工账号已绑定其他微信' }
    }
    await db.collection('repair_activationCodes').doc(staffDocId).update({
      data: { 
        staffOpenid: openid,
        newAccount: false     // ★ 清除标记：已登录绑定完成
      }
    })

    // ★ 安全增强：自动清除同店店主的 openid 绑定（防止 _loadShopByOpenid 优先匹配店主记录导致越权）
    var shopPhone = staffRecord.data.shopPhone || ''
    if (shopPhone) {
      await db.collection('repair_activationCodes')
        .where({ type: 'free', phone: shopPhone, openid: openid })
        .update({ data: { openid: '' } })
        .catch(function () { /* 静默 */ })

      // ★ 补充：清除同店内其他员工记录的相同 staffOpenid（防止同一微信登录多个员工账号）
      await db.collection('repair_activationCodes')
        .where({
          shopPhone: shopPhone,
          staffOpenid: openid,
          _id: db.command.neq(staffDocId)
        })
        .update({ data: { staffOpenid: '' } })
        .catch(function () { /* 静默 */ })
    }

    return { code: 0, msg: '更新成功' }
  } catch (err) {
    console.error('updateStaffOpenid 错误:', err)
    return { code: -99, msg: '更新失败' }
  }
}

// ============================
// batchGenerateMonthlyReports - 批量生成所有门店的月度报告（定时触发器入口）
// 每月1日自动调用，遍历上月有订单的活跃门店逐个生成报告
// 幂等安全：已存在该月报告的门店会更新而非重复创建
// ============================
async function batchGenerateMonthlyReports(event, openid) {

  try {
    // 1. 计算上个月份
    var now = new Date()
    var currentMonth = now.getMonth() + 1 // 1-12
    var currentYear = now.getFullYear()

    // 上月（1月执行时，上月为去年12月）
    var prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
    var prevYear = currentMonth === 1 ? currentYear - 1 : currentYear
    var yearMonth = prevYear + '-' + String(prevMonth).padStart(2, '0')

    // 2. 计算上月时间范围
    var monthStart = new Date(prevYear, prevMonth - 1, 1)
    var monthEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999)

    // 3. 查询上月有订单的活跃门店（分页获取全部）
    var allActiveShopPhones = []
    var countRes = await db.collection('repair_orders')
      .where({
        isVoided: _.neq(true),
        createTime: _.gte(monthStart).and(_.lte(monthEnd))
      })
      .field({ shopPhone: true })
      .count()

    var totalOrders = countRes.total
    if (totalOrders === 0) {
      return { code: 0, msg: '上月无经营数据', data: { success: 0, failed: 0, yearMonth: yearMonth } }
    }

    // 分页获取所有订单的 shopPhone
    var batchIdx = 0
    while (batchIdx * MAX_LIMIT < totalOrders) {
      var ordersBatch = await db.collection('repair_orders')
        .where({
          isVoided: _.neq(true),
          createTime: _.gte(monthStart).and(_.lte(monthEnd))
        })
        .field({ shopPhone: true })
        .skip(batchIdx * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()

      if (ordersBatch.data) {
        ordersBatch.data.forEach(function (o) {
          if (o.shopPhone) allActiveShopPhones.push(o.shopPhone)
        })
      }
      batchIdx++
    }

    // 4. 去重
    var uniqueShops = []
    var seen = {}
    allActiveShopPhones.forEach(function (p) {
      if (!seen[p]) {
        seen[p] = true
        uniqueShops.push(p)
      }
    })


    // 5. 串行逐个生成（避免数据库并发压力）
    var results = { success: 0, failed: 0, errors: [], skipped: 0 }

    for (var i = 0; i < uniqueShops.length; i++) {
      var sp = uniqueShops[i]
      try {
        // 调用已有的 generateMonthlyReport（传入空 openid 表示系统触发）
        var result = await generateMonthlyReport(
          { shopPhone: sp, yearMonth: yearMonth },
          ''  // 定时触发器无真实 openid，generateMonthlyReport 内部会跳过鉴权
        )
        if (result.code === 0) {
          results.success++
        } else if (result.code === -2) {
          // 该月暂无经营数据（有订单但可能被作废等情况），不算失败
          results.skipped++
        } else {
          results.failed++
          results.errors.push({ shopPhone: sp, msg: result.msg })
        }
      } catch (err) {
        results.failed++
        results.errors.push({ shopPhone: sp, error: err.message || String(err) })
      }
    }


    return {
      code: 0,
      msg: '批量生成完成',
      data: Object.assign(results, { yearMonth: yearMonth, totalShops: uniqueShops.length })
    }
  } catch (err) {
    console.error('[batchGenerateMonthlyReport] 致命错误:', err)
    return { code: -99, msg: '批量生成失败: ' + (err.message || '未知错误') }
  }
}

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
// exportData - 数据导出（全量查询，仅Pro版超级管理员）
// 替代客户端 _fetchAll 的 N 次分批请求，服务端一次返回全部数据
// ============================
async function exportData(event, openid) {
  var shopPhone = event.shopPhone || ''
  var type = event.type || ''

  if (!shopPhone) return { code: -1, msg: '缺少门店标识' }
  if (!type || ['cars', 'members', 'orders'].indexOf(type) === -1) {
    return { code: -1, msg: '导出类型参数错误' }
  }

  try {
    var collectionName = type === 'cars' ? 'repair_cars' : type === 'members' ? 'repair_members' : 'repair_orders'
    var where = { shopPhone: shopPhone }
    if (type === 'orders') {
      where.isVoided = _.neq(true)
    }

    var countRes = await db.collection(collectionName).where(where).count()
    var total = countRes.total
    if (total === 0) {
      return { code: 0, data: { list: [], total: 0 } }
    }

    // 服务端分批获取全部数据（limit=100）
    var allData = []
    var batch = 0
    while (batch * MAX_LIMIT < total) {
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

// ============================
// 统一鉴权函数 — Phase 2
// 根据 ACTION_PERMISSIONS 配置校验调用者权限
// 返回 { ok: true } 或 { ok: false, code, msg }
// ============================
async function checkPermission(action, event, openid) {
  var required = ACTION_PERMISSIONS[action]
  if (!required) return { ok: true }   // 未配置权限的 action，默认放行

  // public：任何人可调用
  if (required === 'public') return { ok: true }

  // 以下权限等级需要 shopPhone
  var shopPhone = event.shopPhone || ''
  if (!shopPhone) {
    console.warn('[PERM] action=' + action + ' REJECTED: 缺少shopPhone')
    return { ok: false, code: -403, msg: '缺少门店标识' }
  }

  // 游客账号识别：共享演示账号，无真实 openid，继承管理员权限（不含 superAdmin）
  var GUEST_PHONE = '13507720000'
  var isGuestShop = (shopPhone === GUEST_PHONE)

  // registered：已注册用户（店主或员工）
  if (required === 'registered') {
    // 游客账号放行（共享真实注册账号，视为已注册）
    if (isGuestShop) return { ok: true }

    // ★ 优化：保持短路降级逻辑，每层内部并行化
    // 原逻辑最差5次串行DB查询 → 现在3轮并行（1+2+2），大幅减少等待时间

    // 第1层：openid 验证（1次 $or 查询）
    if (openid && openid.length > 5) {
      var hasAccess = await _checkShopAccess(openid, shopPhone)
      if (hasAccess) return { ok: true }
    }

    // 第2层：clientPhone 验证（员工+店主并行）
    if (event.clientPhone) {
      var phoneResults = await Promise.all([
        db.collection('repair_activationCodes')
          .where({ phone: event.clientPhone, shopPhone: shopPhone, status: 'active' })
          .limit(1).get(),
        db.collection('repair_activationCodes')
          .where({ type: 'free', phone: event.clientPhone })
          .limit(1).get()
      ])
      // 员工匹配
      if (phoneResults[0].data && phoneResults[0].data.length > 0) return { ok: true }
      // 店主匹配（phone 必须等于 shopPhone）
      if (phoneResults[1].data && phoneResults[1].data.length > 0 &&
          phoneResults[1].data[0].phone === shopPhone) return { ok: true }
    }

    // 第3层：shopPhone 兜底（员工+店主并行）
    var shopResults = await Promise.all([
      db.collection('repair_activationCodes')
        .where({ phone: shopPhone, shopPhone: shopPhone, status: 'active' })
        .limit(1).get(),
      db.collection('repair_activationCodes')
        .where({ type: 'free', phone: shopPhone })
        .limit(1).get()
    ])
    if (shopResults[0].data && shopResults[0].data.length > 0) return { ok: true }
    if (shopResults[1].data && shopResults[1].data.length > 0 &&
        shopResults[1].data[0].phone === shopPhone) return { ok: true }

    console.warn('[PERM] action=' + action + ' REJECTED: openid/clientPhone/shopPhone 均验证失败')
    return { ok: false, code: -403, msg: '未登录' }
  }

  // 解析组合标记（如 'admin+pro'）
  var parts = required.split('+')
  var roleRequired = parts[0]   // 'admin' | 'superAdmin'
  var needPro = parts.indexOf('pro') !== -1

  // 游客账号继承管理员权限（superAdmin 需 openid 匹配，游客无法满足）
  if (isGuestShop) {
    if (roleRequired === 'superAdmin') {
      console.warn('[PERM] action=' + action + ' REJECTED: 游客无superAdmin权限')
      return { ok: false, code: -403, msg: '需要超级管理员权限' }
    }
    // admin 级别放行，Pro 状态按需检查
    if (needPro) {
      var guestRecord = await db.collection('repair_activationCodes')
        .where({ phone: GUEST_PHONE, type: 'free' })
        .field({ code: true, expireTime: true })
        .limit(1).get()
      if (guestRecord.data && guestRecord.data.length > 0) {
        var gRec = guestRecord.data[0]
        var isPro = !!(gRec.code && new Date(gRec.expireTime).getTime() > Date.now())
        if (!isPro) {
          console.warn('[PERM] action=' + action + ' REJECTED: 游客Pro已过期')
          return { ok: false, code: -403, msg: '仅Pro版可使用此功能' }
        }
      } else {
        console.warn('[PERM] action=' + action + ' REJECTED: 游客账号记录不存在')
        return { ok: false, code: -403, msg: '仅Pro版可使用此功能' }
      }
    }
    return { ok: true }
  }

  // admin / superAdmin：需要验证角色
  var callerRecord = await _getCallerRecord(openid, event.clientPhone, shopPhone)
  if (!callerRecord) {
    console.warn('[PERM] action=' + action + ' REJECTED: _getCallerRecord返回null')
    return { ok: false, code: -403, msg: '账号已失效，请重新登录' }
  }

  if (roleRequired === 'admin') {
    if (callerRecord.role !== 'admin') {
      console.warn('[PERM] action=' + action + ' REJECTED: role=' + callerRecord.role + ' 需要admin')
      return { ok: false, code: -403, msg: '需要管理员权限' }
    }
  } else if (roleRequired === 'superAdmin') {
    if (!callerRecord.isSuperAdmin) {
      console.warn('[PERM] action=' + action + ' REJECTED: isSuperAdmin=false')
      return { ok: false, code: -403, msg: '需要超级管理员权限' }
    }
  }

  // +pro：需要 Pro 版
  if (needPro) {
    var proRecord = {
      code: callerRecord._ownerCode || callerRecord.code || '',
      expireTime: callerRecord._ownerExpireTime || callerRecord.expireTime || ''
    }
    var isPro = !!(proRecord.code && new Date(proRecord.expireTime).getTime() > Date.now())
    if (!isPro) {
      console.warn('[PERM] action=' + action + ' REJECTED: 非Pro用户')
      return { ok: false, code: -403, msg: '仅Pro版可使用此功能' }
    }
  }

  return { ok: true }
}

// ============================
// _getCallerRecord - 获取调用者记录（含角色判断）
// 返回 { role, isSuperAdmin, code, expireTime, _ownerCode, _ownerExpireTime } 或 null
// ============================
async function _getCallerRecord(openid, clientPhone, shopPhone) {
  try {
    // ★ 优化：分层短路 + 每层内并行
    // 原逻辑4次串行 → 现在2轮并行，同时保持短路减少不必要的查询

    // 第1层：openid 查询（店主+员工并行）
    if (openid && openid.length > 5) {
      var openidResults = await Promise.all([
        db.collection('repair_activationCodes')
          .where({ openid: openid, type: 'free' })
          .field({ phone: true, role: true, code: true, expireTime: true, openid: true, addedBy: true })
          .limit(1).get(),
        db.collection('repair_activationCodes')
          .where({ staffOpenid: openid, shopPhone: shopPhone, status: 'active' })
          .field({ phone: true, role: true, shopPhone: true, status: true })
          .limit(1).get()
      ])
      // 优先级1: openid → 店主（phone 必须匹配 shopPhone）
      if (openidResults[0].data && openidResults[0].data.length > 0) {
        var owner = openidResults[0].data[0]
        if (owner.phone === shopPhone) {
          return { role: 'admin', isSuperAdmin: true, code: owner.code, expireTime: owner.expireTime }
        }
      }
      // 优先级2: openid → 员工
      if (openidResults[1].data && openidResults[1].data.length > 0) {
        var staff = openidResults[1].data[0]
        return { role: staff.role || 'staff', isSuperAdmin: false }
      }
    }

    // 第2层：clientPhone 查询（店主+员工并行）
    if (clientPhone) {
      var phoneResults = await Promise.all([
        db.collection('repair_activationCodes')
          .where({ type: 'free', phone: clientPhone })
          .field({ phone: true, role: true, code: true, expireTime: true })
          .limit(1).get(),
        db.collection('repair_activationCodes')
          .where({ phone: clientPhone, shopPhone: shopPhone, status: 'active' })
          .field({ phone: true, role: true, shopPhone: true, status: true })
          .limit(1).get()
      ])
      // 优先级3: clientPhone → 店主（phone 必须匹配 shopPhone）
      if (phoneResults[0].data && phoneResults[0].data.length > 0) {
        var phoneOwner = phoneResults[0].data[0]
        if (phoneOwner.phone === shopPhone) {
          return { role: 'admin', isSuperAdmin: true, code: phoneOwner.code, expireTime: phoneOwner.expireTime }
        }
      }
      // 优先级4: clientPhone → 员工
      if (phoneResults[1].data && phoneResults[1].data.length > 0) {
        var phoneStaff = phoneResults[1].data[0]
        return { role: phoneStaff.role || 'staff', isSuperAdmin: false }
      }
    }

    return null
  } catch (e) {
    console.error('[_getCallerRecord] 查询失败:', e)
    return null
  }
}

// ============================
// _validatePhoneAccess - 通过手机号验证用户是否属于该门店
// 返回 true/false
// ============================
async function _validatePhoneAccess(clientPhone, shopPhone) {
  try {
    // 查是否是员工
    var staffRes = await db.collection('repair_activationCodes')
      .where({ phone: clientPhone, shopPhone: shopPhone, status: 'active' })
      .limit(1).get()
    if (staffRes.data && staffRes.data.length > 0) return true

    // 查是否是店主
    var ownerRes = await db.collection('repair_activationCodes')
      .where({ type: 'free', phone: clientPhone })
      .limit(1).get()
    if (ownerRes.data && ownerRes.data.length > 0 && ownerRes.data[0].phone === shopPhone) return true

    return false
  } catch (e) {
    return false
  }
}

// ============================
// 路由入口
// ============================
exports.main = async (event, context) => {
  var action = event.action || ''

  // 定时触发器自动路由到批量生成月报
  if (!action && context.TriggerSource === 'timer') {
    var now = new Date()
    var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    var ym = lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0')
    event.action = 'batchGenerateMonthlyReports'
    event.yearMonth = ym
    action = event.action
  }

  if (!action) {
    return { code: -1, msg: '缺少 action 参数' }
  }

  var wxContext = cloud.getWXContext()
  var openid = event.clientOpenid || wxContext.OPENID || ''

  var handler = {
    getOpenId: getOpenId,
    loginByPhoneCode: loginByPhoneCode,
    registerShop: registerShop,
    activatePro: activatePro,
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
    updateShopInfo: updateShopInfo,
    updateMyDisplayName: updateMyDisplayName,
    getCustomerRanking: getCustomerRanking,
    addStaff: addStaff,
    removeStaff: removeStaff,
    updateStaffRole: updateStaffRole,
    listStaffs: listStaffs,
    updateStaffOpenid: updateStaffOpenid,
    generateMonthlyReport: generateMonthlyReport,
    getMonthlyReport: getMonthlyReport,
    listRecentReports: listRecentReports,
    updateShopProfile: updateShopProfile,
    getShopProfile: getShopProfile,
    batchGenerateMonthlyReports: batchGenerateMonthlyReports,
    getCarListAggregation: getCarListAggregation,
    listCars: listCars,
    listOrders: listOrders,
    listMembers: listMembers,
    listCheckSheets: listCheckSheets,
    exportData: exportData
  }

  if (!handler[action]) {
    return { code: -1, msg: '未知的 action: ' + action }
  }

  // ============================
  // 统一鉴权（Phase 2）：替代原有 WRITE_ACTIONS + _validateWriteAccess
  // 根据 ACTION_PERMISSIONS 配置自动校验权限
  // ============================
  var permResult = await checkPermission(action, event, openid)
  if (!permResult.ok) {
    return { code: permResult.code, msg: permResult.msg }
  }

  return handler[action](event, openid)
}
