// 云函数：repair_main（聚合路由）
// 职责：统一入口，通过 action 路由到各子业务模块
// action 列表：registerShop / activatePro / addCar / addMember / createOrder / getDashboardStats / saveCheckSheet / updateCarInfo / getCustomerRanking / addStaff / removeStaff / updateStaffRole / listStaffs

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

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
    var records = await db.collection('repair_activationCodes')
      .where({ type: 'free', openid: openid })
      .orderBy('createTime', 'desc')
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
      createTime: db.serverDate()
    }
    if (shopPhone) orderData.shopPhone = shopPhone
    if (openid) orderData._openid = openid

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
    console.error('createOrder 错误:', err)
    return { code: -99, msg: '保存失败，请重试' }
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

  try {
    var now = new Date()
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    var results = await Promise.all([
      db.collection('repair_orders')
        .where(Object.assign({}, baseWhere, { createTime: _.gte(todayStart) }))
        .count(),
      fetchAllOrders(Object.assign({}, baseWhere, { createTime: _.gte(todayStart) }), { totalAmount: true }),
      fetchAllOrders(baseWhere, { totalAmount: true }),
      db.collection('repair_cars').where(baseWhere).count()
    ])

    var todayOrdersRes = results[0]
    var todayOrdersData = results[1]
    var totalOrdersData = results[2]
    var totalCarsRes = results[3]

    var todayRevenue = todayOrdersData.reduce(
      function (sum, item) { return sum + (item.totalAmount || 0) }, 0
    )
    var totalRevenue = totalOrdersData.reduce(
      function (sum, item) { return sum + (item.totalAmount || 0) }, 0
    )

    // 分页查询所有车辆（到期提醒）
    var carsAll = []
    var carsCount = await db.collection('repair_cars').where(baseWhere).count()
    if (carsCount.total > 0) {
      var carsBatch = 0
      var carsBatchSize = Math.min(MAX_LIMIT, carsCount.total)
      while (carsBatch * MAX_LIMIT < carsCount.total) {
        var carsRes = await db.collection('repair_cars')
          .where(baseWhere)
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
        alertList: alertList
      }
    }
  } catch (err) {
    console.error('getDashboardStats 错误:', err)
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
    var defaultKeys = ['exterior', 'tire', 'oil', 'battery', 'brake', 'light']
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
// updateOpenid - 登录绑定 openid
// ============================
async function updateOpenid(event, openid) {
  var docId = event.docId || ''
  if (!docId) return { code: -1, msg: '缺少记录ID' }
  try {
    await db.collection('repair_activationCodes').doc(docId).update({
      data: { openid: openid }
    })
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

    // 2. 生成权益核销工单
    var orderData = {
      plate: plate,
      serviceItems: benefitName || '权益核销',
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
    await db.collection('repair_orders').add({ data: orderData })

    return { code: 0, msg: '已使用', data: { newRemain: newRemain } }
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
// updateShopInfo - 更新门店信息
// ============================
async function updateShopInfo(event, openid) {
  var field = event.field || ''
  var value = event.value
  if (!field) return { code: -1, msg: '缺少字段名' }

  // 字段白名单（防止任意字段注入）
  var allowedFields = ['name', 'shopTel', 'shopAddr']
  if (allowedFields.indexOf(field) === -1) {
    return { code: -1, msg: '不允许修改该字段' }
  }

  try {
    var query = { type: 'free' }
    if (openid) query.openid = openid
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
async function getCallerAdminInfo(openid) {
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
    return owner.data[0]
  }

  // 当前用户就是店主，直接返回
  return record
}

// ============================
// _checkShopAccess - 轻量级门店访问权限校验
// 验证调用者（openid）是否属于该门店（店主或员工）
// 返回 true/false
// ============================
async function _checkShopAccess(openid, shopPhone) {
  if (!openid || !shopPhone) return false
  try {
    var res = await db.collection('repair_activationCodes')
      .where(_.or([
        { openid: openid, phone: shopPhone },
        { staffOpenid: openid, shopPhone: shopPhone }
      ]))
      .limit(1)
      .get()
    return !!(res.data && res.data.length > 0)
  } catch (e) {
    return false
  }
}

// ============================
// addStaff - 添加员工（仅管理员，Pro版）
// ============================
async function addStaff(event, openid) {
  var staffPhone = event.staffPhone || ''
  var staffRole = event.staffRole || 'staff'
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
    var callerAdmin = await getCallerAdminInfo(openid)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可添加员工' }
    }
    var realShopPhone = callerAdmin.phone || shopPhone

    // 2. 验证门店是 Pro 版
    var isPro = callerAdmin.code && callerAdmin.expireTime &&
      new Date(callerAdmin.expireTime).getTime() > Date.now()
    if (!isPro) {
      return { code: -3, msg: '仅Pro版可使用员工管理功能' }
    }

    // 3. 检查员工手机号是否已被本店或其他店添加
    var existCheck = await db.collection('repair_activationCodes')
      .where({ phone: staffPhone, role: _.neq('admin') })
      .limit(1).get()
    if (existCheck.data && existCheck.data.length > 0) {
      var existStaff = existCheck.data[0]
      if (existStaff.status === 'active') {
        return { code: -4, msg: '该手机号已是其他门店的员工' }
      }
      // 历史离职员工，重新激活
      await db.collection('repair_activationCodes').doc(existStaff._id).update({
        data: {
          role: staffRole,
          shopPhone: realShopPhone,
          staffOpenid: '',
          addedBy: openid,
          addedTime: db.serverDate(),
          status: 'active',
          updateTime: db.serverDate()
        }
      })
      return { code: 0, msg: '员工已重新激活', data: { _id: existStaff._id } }
    }

    // 4. 检查是否是其他店主（phone 已有 admin 记录）
    var ownerCheck = await db.collection('repair_activationCodes')
      .where({ phone: staffPhone, role: 'admin' })
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
        addedBy: openid,
        addedTime: db.serverDate(),
        status: 'active',
        type: 'staff',
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
    var callerAdmin = await getCallerAdminInfo(openid)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可移除员工' }
    }
    var realShopPhone = callerAdmin.phone || shopPhone

    // 标记为离职
    await db.collection('repair_activationCodes').doc(staffDocId).update({
      data: { status: 'removed', updateTime: db.serverDate() }
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
    var callerAdmin = await getCallerAdminInfo(openid)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可修改角色' }
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
    var callerAdmin = await getCallerAdminInfo(openid)
    if (!callerAdmin) {
      return { code: -2, msg: '仅管理员可查看员工列表' }
    }
    var realShopPhone = callerAdmin.phone || shopPhone

    var staffs = await db.collection('repair_activationCodes')
      .where({ shopPhone: realShopPhone, type: 'staff', status: 'active' })
      .field({ phone: true, role: true, staffOpenid: true, addedTime: true, addedBy: true })
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
  var hasAccess = await _checkShopAccess(openid, shopPhone)
  if (!hasAccess) return { code: -3, msg: '无权访问该门店数据' }

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

    if (ordersRes.length === 0 && allOrdersRes.length === 0) {
      return { code: -2, msg: '该月份暂无经营数据' }
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
    // 客单价基准（小微型门店 ¥300）
    var benchmark = 300
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

    return { code: -2, msg: '该月暂无报告' }
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
    var callerAdmin = await getCallerAdminInfo(openid)
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
// updateStaffOpenid - 绑定员工 openid（员工登录时调用）
// ============================
async function updateStaffOpenid(event, openid) {
  var staffDocId = event.staffDocId || ''
  var newOpenid = event.openid || openid || ''
  if (!staffDocId || !newOpenid) return { code: -1, msg: '参数不完整' }
  try {
    await db.collection('repair_activationCodes').doc(staffDocId).update({
      data: { staffOpenid: newOpenid }
    })
    return { code: 0, msg: '更新成功' }
  } catch (err) {
    console.error('updateStaffOpenid 错误:', err)
    return { code: -99, msg: '更新失败' }
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
    activatePro: activatePro,
    addCar: addCar,
    addMember: addMember,
    createOrder: createOrder,
    editOrder: editOrder,
    voidOrder: voidOrder,
    getDashboardStats: getDashboardStats,
    saveCheckSheet: saveCheckSheet,
    updateCarInfo: updateCarInfo,
    updateMember: updateMember,
    useBenefit: useBenefit,
    updateOpenid: updateOpenid,
    updateShopInfo: updateShopInfo,
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
    getShopProfile: getShopProfile
  }

  if (!handler[action]) {
    return { code: -1, msg: '未知的 action: ' + action }
  }

  console.log('[repair_main] action:', action, 'openid:', openid)
  return handler[action](event, openid)
}
