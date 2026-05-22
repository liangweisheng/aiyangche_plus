// 云函数：repair_aux（辅助云函数）
// 职责：门店管理 / 员工管理 / 月报 / OCR — 17 个低耦合 action
// v6.5.0 从 repair_main 拆分，与 repair_main 共享 common/ 模块
// ⚠️ common/ 两份副本需保持同步

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const { fetchAllOrders, MAX_LIMIT } = require('./common/db-utils')
const { createAuthModule } = require('./common/auth')
const benchmarks = require('./benchmarks')

// ============================
// AUX_ACTIONS — 辅助云函数权限配置（仅 17 个 action）
// ============================
var AUX_ACTIONS = {
  // 门店域
  activatePro: 'registered',
  updateMyDisplayName: 'registered',
  updateShopInfo: 'admin',
  getShopProfile: 'registered',
  updateShopProfile: 'admin+pro',

  // 员工管理域
  addStaff: 'admin+pro',
  removeStaff: 'admin',
  updateStaffRole: 'admin',
  listStaffs: 'admin',
  updateStaffOpenid: 'public',

  // 月报域
  generateMonthlyReport: 'admin+pro',
  getMonthlyReport: 'registered',
  listRecentReports: 'registered',
  batchGenerateMonthlyReports: 'public',

  // OCR 域
  ocrPlate: 'registered',
  ocrVIN: 'registered',

  // 账号管理域
  deleteAccount: 'superAdmin'
}

// ★ 共享鉴权模块初始化（必须在 AUX_ACTIONS 定义之后）
var auth = createAuthModule(db, _, AUX_ACTIONS)

// ★ 模块级常量：月报生成最小工单数门檻
var MIN_REPORT_ORDERS = 20

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

    // ★ v6.0 收紧权限：仅店主账号(type='free')可添加员工
    if (callerAdmin._callerType !== 'free') {
      return { code: -7, msg: '仅店主账号可添加员工' }
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
    // ★ v6.0 收紧权限：仅店主账号可移除员工
    if (callerAdmin._callerType !== 'free') {
      return { code: -7, msg: '仅店主账号可移除员工' }
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
    // ★ v6.0 收紧权限：仅店主账号可修改员工角色
    if (callerAdmin._callerType !== 'free') {
      return { code: -7, msg: '仅店主账号可修改员工角色' }
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
    var hasAccess = await auth._checkShopAccess(openid, shopPhone)
    if (!hasAccess) return { code: -3, msg: '无权访问该门店数据' }
  }

  try {
    // 解析月份起止时间
    var year = parseInt(yearMonth.split('-')[0])
    var month = parseInt(yearMonth.split('-')[1]) - 1
    var monthStart = new Date(year, month, 1)
    var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

    var baseWhere = { shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.and([_.gte(monthStart), _.lte(monthEnd)]) }

    // 并行获取：当月订单、历史所有订单(用于新客/老客判断)、车辆列表、门店配置
    var ordersRes = await fetchAllOrders(db, _, baseWhere, { plate: true, totalAmount: true, serviceItems: true, createTime: true })
    var allOrdersRes = await fetchAllOrders(db, _, { shopPhone: shopPhone, isVoided: _.neq(true) }, { plate: true, createTime: true })

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
    var prevOrders = await fetchAllOrders(db, _,
      { shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.and([_.gte(prevMonthStart), _.lte(prevMonthEnd)]) },
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
  var hasAccess = await auth._checkShopAccess(openid, shopPhone)
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
      .where({ shopPhone: shopPhone, isVoided: _.neq(true), createTime: _.and([_.gte(_rmStart), _.lte(_rmEnd)]) })
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
  var hasAccess = await auth._checkShopAccess(openid, shopPhone)
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
        createTime: _.and([_.gte(monthStart), _.lte(monthEnd)])
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
          createTime: _.and([_.gte(monthStart), _.lte(monthEnd)])
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
// ocrPlate - 车牌OCR识别（TC3-HMAC-SHA256 直调腾讯云 REST API）
// 零外部依赖，使用内置 https + crypto 模块
// ============================
async function ocrPlate(event, openid) {
  var imgBase64 = event.imgBase64 || ''
  if (!imgBase64) {
    return { code: -1, msg: '缺少图片数据' }
  }

  var secretId = process.env.TENCENT_SECRET_ID || ''
  var secretKey = process.env.TENCENT_SECRET_KEY || ''
  if (!secretId || !secretKey) {
    return { code: -2, msg: '服务器OCR配置异常' }
  }

  try {
    var crypto = require('crypto')
    var https = require('https')

    var service = 'ocr'
    var host = 'ocr.tencentcloudapi.com'
    var region = 'ap-guangzhou'
    var action = 'LicensePlateOCR'
    var version = '2018-11-19'
    var timestamp = Math.floor(Date.now() / 1000)
    var d = new Date(timestamp * 1000)
    var dateStr = d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0')

    // 1. 构建请求体
    var payload = JSON.stringify({ ImageBase64: imgBase64 })

    // 2. CanonicalRequest
    var algorithm = 'TC3-HMAC-SHA256'
    var httpRequestMethod = 'POST'
    var canonicalUri = '/'
    var canonicalQueryString = ''
    var canonicalHeaders = 'content-type:application/json\nhost:' + host + '\n'
    var signedHeaders = 'content-type;host'
    var hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')
    var canonicalRequest = [
      httpRequestMethod,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      hashedRequestPayload
    ].join('\n')

    // 3. StringToSign
    var credentialScope = dateStr + '/' + service + '/tc3_request'
    var hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    var stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n')

    // 4. 派生签名密钥
    var kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(dateStr).digest()
    var kService = crypto.createHmac('sha256', kDate).update(service).digest()
    var kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
    var signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    // 5. Authorization
    var authorization = algorithm + ' Credential=' + secretId + '/' + credentialScope +
      ', SignedHeaders=' + signedHeaders + ', Signature=' + signature

    // 6. 发送 HTTPS 请求
    return new Promise(function (resolve) {
      var req = https.request({
        hostname: host,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': host,
          'X-TC-Action': action,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': version,
          'X-TC-Region': region,
          'Authorization': authorization
        }
      }, function (res) {
        var body = ''
        res.on('data', function (chunk) { body += chunk })
        res.on('end', function () {
          try {
            var json = JSON.parse(body)
            if (json.Response && json.Response.Number) {
              resolve({ code: 0, data: { plate: json.Response.Number } })
            } else if (json.Response && json.Response.Error) {
              console.error('[ocrPlate] API错误:', json.Response.Error)
              resolve({ code: -99, msg: 'OCR识别失败: ' + (json.Response.Error.Message || '未知错误') })
            } else {
              resolve({ code: -2, msg: '未识别到车牌' })
            }
          } catch (e) {
            console.error('[ocrPlate] 解析响应失败:', e)
            resolve({ code: -99, msg: 'OCR识别服务异常' })
          }
        })
      })
      req.on('error', function (e) {
        console.error('[ocrPlate] 请求异常:', e)
        resolve({ code: -99, msg: 'OCR识别服务异常' })
      })
      req.write(payload)
      req.end()
    })
  } catch (err) {
    console.error('[ocrPlate] 识别失败:', err)
    return { code: -99, msg: 'OCR识别服务异常' }
  }
}

// ============================
// ocrVIN - 车架号(VIN)OCR识别（TC3-HMAC-SHA256 直调腾讯云 REST API）
// ============================
async function ocrVIN(event, openid) {
  var imgBase64 = event.imgBase64 || ''
  if (!imgBase64) {
    return { code: -1, msg: '缺少图片数据' }
  }

  var secretId = process.env.TENCENT_SECRET_ID || ''
  var secretKey = process.env.TENCENT_SECRET_KEY || ''
  if (!secretId || !secretKey) {
    return { code: -2, msg: '服务器OCR配置异常' }
  }

  try {
    var crypto = require('crypto')
    var https = require('https')

    var service = 'ocr'
    var host = 'ocr.tencentcloudapi.com'
    var region = 'ap-guangzhou'
    var action = 'VinOCR'
    var version = '2018-11-19'
    var timestamp = Math.floor(Date.now() / 1000)
    var d = new Date(timestamp * 1000)
    var dateStr = d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0')

    var payload = JSON.stringify({ ImageBase64: imgBase64 })

    var algorithm = 'TC3-HMAC-SHA256'
    var httpRequestMethod = 'POST'
    var canonicalUri = '/'
    var canonicalQueryString = ''
    var canonicalHeaders = 'content-type:application/json\nhost:' + host + '\n'
    var signedHeaders = 'content-type;host'
    var hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')
    var canonicalRequest = [
      httpRequestMethod,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      hashedRequestPayload
    ].join('\n')

    var credentialScope = dateStr + '/' + service + '/tc3_request'
    var hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    var stringToSign = [
      algorithm,
      timestamp,
      credentialScope,
      hashedCanonicalRequest
    ].join('\n')

    var kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(dateStr).digest()
    var kService = crypto.createHmac('sha256', kDate).update(service).digest()
    var kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
    var signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    var authorization = algorithm + ' Credential=' + secretId + '/' + credentialScope +
      ', SignedHeaders=' + signedHeaders + ', Signature=' + signature

    return new Promise(function (resolve) {
      var req = https.request({
        hostname: host,
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': host,
          'X-TC-Action': action,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': version,
          'X-TC-Region': region,
          'Authorization': authorization
        }
      }, function (res) {
        var body = ''
        res.on('data', function (chunk) { body += chunk })
        res.on('end', function () {
          try {
            var json = JSON.parse(body)
            if (json.Response && json.Response.Vin) {
              resolve({ code: 0, data: { vin: json.Response.Vin } })
            } else if (json.Response && json.Response.Error) {
              console.error('[ocrVIN] API错误:', json.Response.Error)
              resolve({ code: -99, msg: 'OCR识别失败: ' + (json.Response.Error.Message || '未知错误') })
            } else {
              resolve({ code: -2, msg: '未识别到车架号' })
            }
          } catch (e) {
            console.error('[ocrVIN] 解析响应失败:', e)
            resolve({ code: -99, msg: 'OCR识别服务异常' })
          }
        })
      })
      req.on('error', function (e) {
        console.error('[ocrVIN] 请求异常:', e)
        resolve({ code: -99, msg: 'OCR识别服务异常' })
      })
      req.write(payload)
      req.end()
    })
  } catch (err) {
    console.error('[ocrVIN] 识别失败:', err)
    return { code: -99, msg: 'OCR识别服务异常' }
  }
}

// ============================
// deleteAccount - 注销账号
// ★ 最严格安全设计：
// 1. 权限等级 superAdmin（仅店主 + openid 匹配）
// 2. 函数内部额外验证 openid 必须匹配 shopPhone
// 3. 二次验证开放给非 openid 路径的兜底
// 4. 只通过 shopPhone 删除数据，确保不会误删其他门店
// 5. 多端模式无 openid → 自然被 superAdmin 拦截
// ============================
async function deleteAccount(event, openid) {
  var shopPhone = event.shopPhone || ''
  if (!shopPhone) {
    return { code: -1, msg: '缺少门店标识' }
  }

  // ★ 安全守卫1：拒绝游客账号注销（防止误删演示数据）
  var GUEST_PHONE = '13507720000'
  if (shopPhone === GUEST_PHONE) {
    console.warn('[deleteAccount] REJECTED: 游客账号不可注销')
    return { code: -403, msg: '演示账号不可注销' }
  }

  // ★ 安全守卫2：拒绝无 openid 的请求（多端模式/无openid场景）
  if (!openid || openid.length < 6) {
    console.error('[deleteAccount] REJECTED: 缺少有效openid')
    return { code: -403, msg: '安全验证失败，请使用微信小程序操作' }
  }

  // ★ 安全守卫3：双重验证 openid 是否属于该 shopPhone 的店主
  var ownerCheck = await db.collection('repair_activationCodes')
    .where({ type: 'free', phone: shopPhone, openid: openid })
    .field({ _id: true, code: true })
    .limit(1)
    .get()

  if (!ownerCheck.data || ownerCheck.data.length === 0) {
    console.error('[deleteAccount] REJECTED: openid=' + openid + ' 不属于 shopPhone=' + shopPhone + ' 的店主')
    return { code: -403, msg: '安全验证失败，请重新登录后重试' }
  }

  console.log('[deleteAccount] 开始删除 shopPhone=' + shopPhone + ', openid=' + openid)

  // ====== 开始清理数据 ======
  var deleteResults = []
  var errors = []

  // 1. 删除员工记录（type='staff', shopPhone=shopPhone）
  try {
    var staffRes = await db.collection('repair_activationCodes')
      .where({ shopPhone: shopPhone, type: 'staff' })
      .remove()
    deleteResults.push('员工记录: ' + (staffRes.stats ? staffRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('员工记录: ' + e.message)
  }

  // 2. 删除工单
  try {
    var ordersRes = await db.collection('repair_orders')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('工单: ' + (ordersRes.stats ? ordersRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('工单: ' + e.message)
  }

  // 3. 删除车辆
  try {
    var carsRes = await db.collection('repair_cars')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('车辆: ' + (carsRes.stats ? carsRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('车辆: ' + e.message)
  }

  // 4. 删除会员
  try {
    var membersRes = await db.collection('repair_members')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('会员: ' + (membersRes.stats ? membersRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('会员: ' + e.message)
  }

  // 5. 删除查车单
  try {
    var sheetsRes = await db.collection('repair_checkSheets')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('查车单: ' + (sheetsRes.stats ? sheetsRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('查车单: ' + e.message)
  }

  // 6. 删除月报
  try {
    var reportsRes = await db.collection('repair_monthly_reports')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('月报: ' + (reportsRes.stats ? reportsRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('月报: ' + e.message)
  }

  // 7. 删除商品
  try {
    var productsRes = await db.collection('repair_products')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('商品: ' + (productsRes.stats ? productsRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('商品: ' + e.message)
  }

  // 8. 删除入库记录
  try {
    var stockInRes = await db.collection('repair_stock_in')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('入库记录: ' + (stockInRes.stats ? stockInRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('入库记录: ' + e.message)
  }

  // 9. 删除出库记录
  try {
    var stockOutRes = await db.collection('repair_stock_out')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('出库记录: ' + (stockOutRes.stats ? stockOutRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('出库记录: ' + e.message)
  }

  // 10. 最后删除店主账号记录（必须最后删除！前面的删除都依赖 shopPhone 条件）
  try {
    var adminRes = await db.collection('repair_activationCodes')
      .where({ type: 'free', phone: shopPhone })
      .remove()
    deleteResults.push('账号记录: ' + (adminRes.stats ? adminRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('账号记录: ' + e.message)
  }

  // 11. 删除 shopProfile
  try {
    var profileRes = await db.collection('repair_shop_profiles')
      .where({ shopPhone: shopPhone })
      .remove()
    deleteResults.push('经营配置: ' + (profileRes.stats ? profileRes.stats.removed : 0) + '条')
  } catch (e) {
    errors.push('经营配置: ' + e.message)
  }

  console.log('[deleteAccount] 完成 shopPhone=' + shopPhone + ' 结果:', deleteResults.join(' | '))
  if (errors.length > 0) {
    console.warn('[deleteAccount] 部分删除错误:', errors.join(' | '))
  }

  return {
    code: 0,
    msg: '注销成功',
    data: {
      deleted: deleteResults,
      errors: errors.length > 0 ? errors : undefined
    }
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
    activatePro: activatePro,
    updateShopInfo: updateShopInfo,
    updateMyDisplayName: updateMyDisplayName,
    updateShopProfile: updateShopProfile,
    getShopProfile: getShopProfile,
    deleteAccount: deleteAccount,
    addStaff: addStaff,
    removeStaff: removeStaff,
    updateStaffRole: updateStaffRole,
    listStaffs: listStaffs,
    updateStaffOpenid: updateStaffOpenid,
    generateMonthlyReport: generateMonthlyReport,
    getMonthlyReport: getMonthlyReport,
    listRecentReports: listRecentReports,
    batchGenerateMonthlyReports: batchGenerateMonthlyReports,
    ocrPlate: ocrPlate,
    ocrVIN: ocrVIN
  }

  if (!handler[action]) {
    return { code: -1, msg: '未知的 action: ' + action }
  }

  // 统一鉴权：根据 AUX_ACTIONS 配置自动校验权限
  var permResult = await auth.checkPermission(action, event, openid)
  if (!permResult.ok) {
    return { code: permResult.code, msg: permResult.msg }
  }

  return handler[action](event, openid)
}
