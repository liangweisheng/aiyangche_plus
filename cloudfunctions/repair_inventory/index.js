/**
 * 进销存管理云函数 - repair_inventory
 * 独立于 repair_main，避免臃肿
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ===========================
// 权限配置
// ===========================
var ACTION_PERMISSIONS = {
  addStock: 'admin',
  deductStock: 'registered',
  listProducts: 'registered',
  getProductDetail: 'registered',
  addProduct: 'admin',
  updateProduct: 'admin',
  getStockLogs: 'admin',
  getStockLogDetail: 'registered',
  getPhrases: 'registered',
  savePhrases: 'admin',
  // 模板商品管理
  listTemplateProducts: 'public',
  importTemplateProduct: 'admin',
  toggleProductStatus: 'admin',
  batchImportTemplates: 'admin',
  syncTemplatesFromGuest: 'superAdmin',
  adjustStock: 'admin',
  batchAddStock: 'admin',
  /**
   * 根据 orderRef 更新库存流水的 orderId（工单创建后回填）
   */
  updateStockLogOrderId: 'admin',
  // 模板商品创建/编辑/详情
  saveTemplateProduct: 'superAdmin',
  getTemplateProductDetail: 'superAdmin',
  // 入库单管理
  listReceipts: 'admin',
  getReceiptDetail: 'registered',
  getReceiptByLogId: 'registered'
}

// ===========================
// 鉴权中间件
// ===========================
async function checkPermission(event, context, actionName) {
  var permission = ACTION_PERMISSIONS[actionName]
  if (!permission) return { code: -1, msg: '未知的 action: ' + actionName }

  var levels = permission.split('+')
  var requirePro = levels.indexOf('pro') !== -1
  var requireAdmin = levels.indexOf('admin') !== -1
  var requireSuperAdmin = levels.indexOf('superAdmin') !== -1
  var requireRegistered = levels.indexOf('registered') !== -1
  var requirePublic = levels.indexOf('public') !== -1

  var wxContext = cloud.getWXContext()
  var callerOpenId = event.clientOpenid || wxContext.OPENID || ''

  // ★ 匿名登录归一化：Web 后台匿名 openid 等同于多端模式（均依赖 shopPhone 鉴权）
  if (callerOpenId && (callerOpenId.indexOf('anon-') === 0 || callerOpenId.indexOf('anonymous') === 0)) {
    callerOpenId = ''
  }

  if (requirePublic) return null // 不需要鉴权

  // ★ 游客账号检测
  var GUEST_PHONE = '13507720000'
  var shopPhone = event.shopPhone || ''
  var isGuestShop = (shopPhone === GUEST_PHONE)

  // ★ 空 openid + 无 shopPhone 才拒绝（Web/多端有 shopPhone 应走 phone 降级）
  if (!callerOpenId && !requirePublic && !shopPhone && !isGuestShop) {
    return { code: -2, msg: '未获取到用户身份' }
  }

  // 查询调用者记录（openid 优先 → phone 降级）
  var callerRecord = null
  try {
    if (callerOpenId) {
      var callerRes = await db.collection('repair_activationCodes')
        .where({ openid: callerOpenId })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()
      if (callerRes.data && callerRes.data.length > 0) {
        callerRecord = callerRes.data[0]
      }
    }
    // ★ phone 降级：Web 匿名登录 / 多端无微信 openid 场景
    if (!callerRecord && shopPhone) {
      var phoneRes = await db.collection('repair_activationCodes')
        .where({ phone: shopPhone, type: 'free' })
        .limit(1)
        .get()
      if (phoneRes.data && phoneRes.data.length > 0) {
        callerRecord = phoneRes.data[0]
      }
    }
  } catch (e) {}

  // registered：需要有记录（游客放行）
  if (requireRegistered && !callerRecord && !isGuestShop) {
    return { code: -3, msg: '请先注册门店' }
  }

  // pro：检查 Pro 状态（从 caller 记录或其店主记录）
  if (requirePro) {
    var isPro = false
    if (callerRecord) {
      isPro = !!(callerRecord.code && (!callerRecord.expireTime || new Date(callerRecord.expireTime).getTime() > Date.now()))
    }
    // 员工账号：通过 shopPhone 反查店主
    if (!isPro && callerRecord && callerRecord.shopPhone) {
      try {
        var ownerRes = await db.collection('repair_activationCodes')
          .where({ phone: callerRecord.shopPhone, type: 'free' })
          .limit(1)
          .get()
        if (ownerRes.data && ownerRes.data.length > 0) {
          var owner = ownerRes.data[0]
          isPro = !!(owner.code && (!owner.expireTime || new Date(owner.expireTime).getTime() > Date.now()))
        }
      } catch (e) {}
    }
    // ★ 游客放行
    if (!isPro && !isGuestShop) {
      return { code: -4, msg: '请先激活 Pro 版' }
    }
  }

  // admin：需要是管理员以上（游客放行）
  if (requireAdmin) {
    if (isGuestShop) {
      return null // 游客继承管理员权限
    }
    var role = callerRecord ? (callerRecord.role || 'admin') : ''
    if (role !== 'admin' || !callerRecord) {
      return { code: -5, msg: '无权限，仅管理员可操作' }
    }
  }

  return null // 鉴权通过
}

// ===========================
// 工具函数 - 按规格更新库存
// ===========================
/**
 * 按规格更新库存（读-改-写模式）
 * @param {string} productId
 * @param {string} shopPhone
 * @param {string} spec - 规格标签（空串=无规格）
 * @param {number} delta - 变化量（正=入，负=出）
 * @returns {Promise<{newStock: number, newSpecStock: Array, productName: string, productSpecPrice: number}>}
 */
async function _updateSpecStock(productId, shopPhone, spec, delta) {
  var res = await db.collection('repair_products')
    .where({ _id: productId, shopPhone: shopPhone })
    .get()
  if (!res.data || res.data.length === 0) throw new Error('商品不存在')

  var product = res.data[0]
  var specStock = (product.specStock || []).map(function (s) {
    return { label: s.label, stock: s.stock }
  })

  if (spec) {
    // 有规格：更新对应规格的库存
    var found = false
    specStock = specStock.map(function (s) {
      if (s.label === spec) {
        found = true
        var newStock = (s.stock || 0) + delta
        if (newStock < 0) throw new Error('规格 "' + spec + '" 库存不足（当前 ' + (s.stock || 0) + '，需要 ' + (-delta) + '）')
        return { label: s.label, stock: newStock }
      }
      return s
    })
    if (!found) {
      if (delta < 0) throw new Error('规格 "' + spec + '" 不存在')
      specStock.push({ label: spec, stock: delta })
    }
  } else {
    // 无规格商品：校验总库存
    var noSpecTotal = (product.stock || 0) + delta
    if (noSpecTotal < 0) throw new Error('库存不足（当前 ' + (product.stock || 0) + '，需要 ' + (-delta) + '）')
  }

  // 重算总库存
  var newTotal = 0
  if (spec) {
    specStock.forEach(function (s) { newTotal += s.stock || 0 })
  } else {
    newTotal = (product.stock || 0) + delta
  }

  var updateData = {
    specStock: specStock,
    stock: newTotal,
    updateTime: new Date()
  }
  await db.collection('repair_products')
    .where({ _id: productId, shopPhone: shopPhone })
    .update({ data: updateData })

  // 获取该规格对应的售价（用于流水）
  var specPrice = product.price
  if (spec && product.specPrice) {
    product.specPrice.forEach(function (sp) {
      if (sp.label === spec) specPrice = sp.price
    })
  }

  return { newStock: newTotal, newSpecStock: specStock, productName: product.name, specPrice: specPrice, cost: product.cost || 0, unit: product.unit || '个' }
}

// ===========================
// Action 处理函数
// ===========================

/**
 * 新增商品
 */
async function addProduct(event) {
  var { shopPhone, name, category, specs, specPrice, specCost, price, cost, unit, remark } = event
  if (!shopPhone || !name) return { code: -1, msg: '门店和商品名必填' }

  var now = new Date()
  var cleanSpecs = specs || []
  var data = {
    shopPhone: shopPhone,
    name: name.trim(),
    category: category || '其他',
    specs: cleanSpecs,
    specStock: cleanSpecs.map(function (s) { return { label: s, stock: 0 } }),
    specPrice: specPrice || [],
    specCost: specCost || [],
    price: Number(price) || 0,
    cost: Number(cost) || 0,
    stock: 0,
    unit: unit || '个',
    remark: remark || '',
    productStatus: 'on_shelf',
    createTime: now,
    updateTime: now
  }
  try {
    var res = await db.collection('repair_products').add({ data: data })
    return { code: 0, msg: '添加成功', data: { _id: res._id } }
  } catch (e) {
    return { code: -1, msg: '添加失败: ' + e.message }
  }
}

/**
 * 更新商品
 */
async function updateProduct(event) {
  var { productId, shopPhone, name, category, specs, specPrice, specCost, price, cost, unit, remark } = event
  if (!productId || !shopPhone) return { code: -1, msg: '参数不足' }

  var updateData = { updateTime: new Date() }
  if (name !== undefined) updateData.name = name.trim()
  if (category !== undefined) updateData.category = category
  if (price !== undefined) updateData.price = Number(price)
  if (cost !== undefined) updateData.cost = Number(cost)
  if (unit !== undefined) updateData.unit = unit
  if (remark !== undefined) updateData.remark = remark

  // specs 变更时同步 specStock / specPrice
  if (specs !== undefined) {
    updateData.specs = specs
    try {
      var existRes = await db.collection('repair_products')
        .where({ _id: productId, shopPhone: shopPhone })
        .field({ specStock: true, specPrice: true, specCost: true })
        .get()
      if (existRes.data && existRes.data.length > 0) {
        var existing = existRes.data[0]
        var oldStockMap = {}
        ;(existing.specStock || []).forEach(function (s) { oldStockMap[s.label] = s.stock })
        var oldPriceMap = {}
        ;(existing.specPrice || []).forEach(function (s) { oldPriceMap[s.label] = s.price })
        var oldCostMap = {}
        ;(existing.specCost || []).forEach(function (s) { oldCostMap[s.label] = s.cost })

        var newSpecStock = specs.map(function (s) {
          return { label: s, stock: oldStockMap[s] !== undefined ? oldStockMap[s] : 0 }
        })
        var newSpecPrice = specs.map(function (s) {
          return { label: s, price: oldPriceMap[s] !== undefined ? oldPriceMap[s] : (Number(price) || 0) }
        })
        var newSpecCost = specs.map(function (s) {
          return { label: s, cost: oldCostMap[s] !== undefined ? oldCostMap[s] : (Number(cost) || 0) }
        })

        updateData.specStock = newSpecStock
        updateData.specPrice = newSpecPrice
        updateData.specCost = newSpecCost
      }
    } catch (e) {
      return { code: -1, msg: '规格变更失败: ' + e.message }
    }
  }

  if (specPrice !== undefined) {
    updateData.specPrice = specPrice
  }
  if (specCost !== undefined) {
    updateData.specCost = specCost
  }

  try {
    await db.collection('repair_products')
      .where({ _id: productId, shopPhone: shopPhone })
      .update({ data: updateData })
    return { code: 0, msg: '更新成功' }
  } catch (e) {
    return { code: -1, msg: '更新失败: ' + e.message }
  }
}

/**
 * 商品入库
 */
async function addStock(event) {
  var { shopPhone, productId, spec, quantity, cost, operator, remark, supplier } = event
  if (!shopPhone || !productId || !quantity || quantity <= 0) {
    return { code: -1, msg: '参数不足或数量不合法' }
  }

  var qty = Number(quantity)
  var costPrice = Number(cost) || 0

  try {
    // 通过 _updateSpecStock 更新库存
    var result
    try {
      result = await _updateSpecStock(productId, shopPhone, spec || '', qty)
    } catch (e) {
      return { code: -1, msg: e.message }
    }

    // 生成入库单号（单条也生成，方便统一追溯）
    var batchId = _generateBatchId(shopPhone)

    // 写入库存流水
    await db.collection('repair_stock_logs').add({
      data: {
        shopPhone: shopPhone,
        productId: productId,
        productName: result.productName,
        spec: spec || '',
        type: 'in',
        quantity: qty,
        cost: costPrice,
        operator: operator || '',
        supplier: supplier || '',
        remark: remark || '',
        batchId: batchId,
        createTime: new Date()
      }
    })

    // 保存入库单快照
    await _saveReceipt({
      batchId: batchId,
      shopPhone: shopPhone,
      items: [{
        productId: productId,
        productName: result.productName,
        spec: spec || '',
        quantity: qty,
        cost: costPrice,
        unit: result.unit || '个'
      }],
      supplier: supplier || '',
      remark: remark || '',
      operator: operator || ''
    })

    return { code: 0, msg: '入库成功', data: { newStock: result.newStock, batchId: batchId } }
  } catch (e) {
    return { code: -1, msg: '入库失败: ' + e.message }
  }
}

/**
 * 批量扣减库存（出库，用于工单保存时）
 */
async function deductStock(event) {
  var { shopPhone, items } = event
  // items: [{ productId, spec, quantity, amount }]
  if (!shopPhone || !items || !Array.isArray(items) || items.length === 0) {
    return { code: -1, msg: '参数不足' }
  }

  // ===== 第一阶段：先全部校验是否有足够库存 =====
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (!item.productId || !item.quantity || item.quantity <= 0) {
      return { code: -1, msg: '商品参数不合法，索引 ' + i }
    }
    try {
      var res = await db.collection('repair_products')
        .where({ _id: item.productId, shopPhone: shopPhone })
        .field({ specStock: true, stock: true, specs: true, name: true })
        .get()
      if (!res.data || res.data.length === 0) {
        return { code: -1, msg: '商品不存在，索引 ' + i }
      }
      var product = res.data[0]
      if (item.spec) {
        // 有规格：检查该规格的库存
        var specStock = 0
        ;(product.specStock || []).forEach(function (s) {
          if (s.label === item.spec) specStock = s.stock || 0
        })
        if (specStock < item.quantity) {
          return { code: -1, msg: '商品 "' + product.name + '(' + item.spec + ')" 库存不足（当前 ' + specStock + '，需要 ' + item.quantity + '）' }
        }
      } else {
        // 无规格：检查总库存
        if ((product.stock || 0) < item.quantity) {
          return { code: -1, msg: '商品 "' + product.name + '" 库存不足（当前 ' + (product.stock || 0) + '，需要 ' + item.quantity + '）' }
        }
      }
    } catch (e) {
      return { code: -1, msg: '库存校验失败: ' + e.message }
    }
  }

  // ===== 第二阶段：全部校验通过，再执行实际扣减 =====
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    try {
      var result = await _updateSpecStock(item.productId, shopPhone, item.spec || '', -Number(item.quantity))

      // 计算单价（amount 是总价，÷ quantity 得单价）
      var totalAmount = Number(item.amount) || 0
      var unitPrice = totalAmount > 0 ? Number((totalAmount / Number(item.quantity)).toFixed(2)) : (result.specPrice || 0)

      // 写流水
      await db.collection('repair_stock_logs').add({
        data: {
          shopPhone: shopPhone,
          productId: item.productId,
          productName: result.productName,
          spec: item.spec || '',
          type: 'out',
          quantity: Number(item.quantity),
          cost: result.cost || 0,
          salePrice: unitPrice,
          operator: event.operator || '',
          remark: '工单出库',
          orderRef: event.orderRef || '',
          createTime: new Date()
        }
      })
    } catch (e) {
      // 理论上不会到这里，因为第一阶段已校验通过
      return { code: -1, msg: '扣减异常: ' + e.message }
    }
  }

  return { code: 0, msg: '扣减成功' }
}

/**
 * 商品列表
 */
async function listProducts(event) {
  var { shopPhone, category, keyword, page, pageSize, status } = event
  if (!shopPhone) return { code: -1, msg: 'shopPhone 必填' }

  var query = { shopPhone: shopPhone }
  if (category && category !== '全部') {
    query.category = category
  }
  if (keyword && keyword.trim()) {
    var kw = keyword.trim()
    query.name = db.RegExp({ regexp: kw, options: 'i' })
  }
  // 支持按上下架状态筛选（orderAdd 开单时只显示已上架商品）
  if (status) {
    if (status === 'on_shelf') {
      // 兼容旧数据（无 productStatus 字段视为已上架）
      query.productStatus = _.or([_.eq('on_shelf'), _.exists(false)])
    } else {
      query.productStatus = status
    }
  }

  var limit = pageSize || 50
  var skip = ((page || 1) - 1) * limit

  try {
    var countRes = await db.collection('repair_products').where(query).count()
    var total = countRes.total || 0
    var listRes = await db.collection('repair_products')
      .where(query)
      .orderBy('updateTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
    return { code: 0, data: { list: listRes.data || [], total: total } }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 商品详情
 */
async function getProductDetail(event) {
  var { productId, shopPhone } = event
  if (!productId) return { code: -1, msg: 'productId 必填' }

  try {
    var res = await db.collection('repair_products')
      .where({ _id: productId, shopPhone: shopPhone || '' })
      .get()
    if (!res.data || res.data.length === 0) {
      return { code: -1, msg: '商品不存在' }
    }
    return { code: 0, data: res.data[0] }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 出入库流水（支持筛选）
 * @param {string} event.logType - 流水类型筛选：in / out / adjust（可选）
 * @param {string} event.startDate - 开始日期 YYYY-MM-DD（可选）
 * @param {string} event.endDate - 结束日期 YYYY-MM-DD（可选）
 */
async function getStockLogs(event) {
  var { productId, shopPhone, page, pageSize, logType, startDate, endDate } = event
  if (!productId || !shopPhone) return { code: -1, msg: '参数不足' }

  var limit = pageSize || 20
  var skip = ((page || 1) - 1) * limit
  var query = { productId: productId, shopPhone: shopPhone }

  // 流水类型筛选
  if (logType && ['in', 'out', 'adjust'].indexOf(logType) !== -1) {
    query.type = logType
  }

  // 时间范围筛选
  if (startDate || endDate) {
    var timeFilter = {}
    if (startDate) timeFilter.$gte = new Date(startDate + ' 00:00:00')
    if (endDate) timeFilter.$lte = new Date(endDate + ' 23:59:59')
    query.createTime = timeFilter
  }

  try {
    var countRes = await db.collection('repair_stock_logs')
      .where(query).count()
    var total = countRes.total || 0
    var listRes = await db.collection('repair_stock_logs')
      .where(query)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
    return { code: 0, data: { list: listRes.data || [], total: total } }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 获取单条库存流水详情
 */
async function getStockLogDetail(event) {
  var { logId, shopPhone } = event
  if (!logId || !shopPhone) return { code: -1, msg: '参数不足' }

  try {
    var res = await db.collection('repair_stock_logs')
      .where({ _id: logId, shopPhone: shopPhone })
      .get()
    if (!res.data || res.data.length === 0) {
      return { code: -1, msg: '流水不存在' }
    }
    return { code: 0, data: res.data[0] }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 获取门店快捷短语
 */
async function getPhrases(event) {
  var { shopPhone } = event
  if (!shopPhone) return { code: -1, msg: 'shopPhone 必填' }
  try {
    var res = await db.collection('repair_phrases')
      .where({ shopPhone: shopPhone })
      .limit(1)
      .get()
    if (res.data && res.data.length > 0) {
      return { code: 0, data: { phrases: res.data[0].phrases || [] } }
    }
    return { code: 0, data: { phrases: [] } }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 保存门店快捷短语
 */
async function savePhrases(event) {
  var { shopPhone, phrases } = event
  if (!shopPhone) return { code: -1, msg: 'shopPhone 必填' }
  if (!Array.isArray(phrases)) return { code: -1, msg: 'phrases 必须为数组' }

  try {
    var existRes = await db.collection('repair_phrases')
      .where({ shopPhone: shopPhone })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      // 已存在 → 更新
      await db.collection('repair_phrases')
        .doc(existRes.data[0]._id)
        .update({ data: { phrases: phrases, updatedAt: new Date() } })
    } else {
      // 不存在 → 创建
      await db.collection('repair_phrases').add({
        data: {
          shopPhone: shopPhone,
          phrases: phrases,
          updatedAt: new Date()
        }
      })
    }
    return { code: 0, msg: '保存成功' }
  } catch (e) {
    return { code: -1, msg: '保存失败: ' + e.message }
  }
}

/**
 * 库存调整（手动盘盈/盘亏/退货入库/报损）
 * quantity: 正数=增加(盘盈/退货), 负数=减少(盘亏/报损)
 */
async function adjustStock(event) {
  var { shopPhone, productId, spec, quantity, operator, reason, remark } = event
  if (!shopPhone || !productId || quantity === undefined || quantity === null || Number(quantity) === 0) {
    return { code: -1, msg: '参数不足或调整数量为0' }
  }

  var qty = Number(quantity)
  var validReasons = ['盘盈', '盘亏', '退货入库', '损耗报损', '手动调整']
  var adjustReason = reason || '手动调整'
  if (validReasons.indexOf(adjustReason) === -1) {
    adjustReason = '手动调整'
  }

  try {
    var result
    try {
      result = await _updateSpecStock(productId, shopPhone, spec || '', qty)
    } catch (e) {
      return { code: -1, msg: e.message }
    }
    var newStock = result.newStock
    var oldStock = newStock - qty

    // 拼接备注：原因 + 用户备注
    var fullRemark = adjustReason
    if (remark && remark.trim()) {
      fullRemark += ' - ' + remark.trim()
    }

    // 写流水
    await db.collection('repair_stock_logs').add({
      data: {
        shopPhone: shopPhone,
        productId: productId,
        productName: result.productName,
        spec: spec || '',
        type: 'adjust',
        quantity: qty,
        cost: 0,
        operator: operator || '',
        remark: fullRemark,
        createTime: new Date()
      }
    })

    var actionLabel = qty > 0 ? '盘盈' : '盘亏'
    return { code: 0, msg: actionLabel + '成功', data: { newStock: newStock, oldStock: oldStock } }
  } catch (e) {
    return { code: -1, msg: '调整失败: ' + e.message }
  }
}

/**
 * 批量入库
 * items: [{ productId, spec, quantity, cost }]
 */
async function batchAddStock(event) {
  var { shopPhone, items, operator, supplier, remark } = event
  if (!shopPhone || !items || !Array.isArray(items) || items.length === 0) {
    return { code: -1, msg: '参数不足' }
  }

  // 生成入库单号
  var batchId = _generateBatchId(shopPhone)
  var receiptItems = []
  var errors = []

  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (!item.productId || !item.quantity || item.quantity <= 0) {
      errors.push({ index: i, msg: '商品ID或数量不合法' })
      continue
    }
    var qty = Number(item.quantity)
    var costPrice = Number(item.cost)
    if (costPrice < 0) {
      errors.push({ index: i, productId: item.productId, msg: '进价不能为负数' })
      continue
    }
    try {
      var result = await _updateSpecStock(item.productId, shopPhone, item.spec || '', qty)
      await db.collection('repair_stock_logs').add({
        data: {
          shopPhone: shopPhone,
          productId: item.productId,
          productName: result.productName,
          spec: item.spec || '',
          type: 'in',
          quantity: qty,
          cost: costPrice,
          operator: operator || '',
          supplier: supplier || '',
          remark: remark || '',
          batchId: batchId,
          createTime: new Date()
        }
      })
      // 记录入库单商品快照
      receiptItems.push({
        productId: item.productId,
        productName: result.productName,
        spec: item.spec || '',
        quantity: qty,
        cost: costPrice,
        unit: item.unit || ''
      })
    } catch (e) {
      errors.push({ index: i, productId: item.productId, msg: e.message })
    }
  }

  // 保存入库单快照（即使部分失败也保存成功的部分）
  if (receiptItems.length > 0) {
    await _saveReceipt({
      batchId: batchId,
      shopPhone: shopPhone,
      items: receiptItems,
      supplier: supplier || '',
      remark: remark || '',
      operator: operator || ''
    })
  }

  if (errors.length > 0) {
    return { code: -1, msg: '部分入库失败', data: { errors: errors, succeeded: items.length - errors.length, batchId: batchId } }
  }
  return { code: 0, msg: '批量入库成功，共 ' + items.length + ' 项', data: { batchId: batchId } }
}

// ===========================
// 入库单工具函数
// ===========================

/**
 * 生成入库单号
 * 格式：IN + YYYYMMDD + 3位流水号
 * 例：IN20260523001
 */
function _generateBatchId(shopPhone) {
  var now = new Date()
  var y = now.getFullYear()
  var m = ('0' + (now.getMonth() + 1)).slice(-2)
  var d = ('0' + now.getDate()).slice(-2)
  var dateStr = '' + y + m + d
  var rand = ('00' + Math.floor(Math.random() * 999 + 1)).slice(-3)
  return 'IN' + dateStr + rand
}

/**
 * 保存入库单快照到 repair_stock_receipts 集合
 */
async function _saveReceipt(receipt) {
  var totalQuantity = 0
  var totalCost = 0
  ;(receipt.items || []).forEach(function (item) {
    totalQuantity += item.quantity || 0
    totalCost += (item.quantity || 0) * (item.cost || 0)
  })

  await db.collection('repair_stock_receipts').add({
    data: {
      batchId: receipt.batchId,
      shopPhone: receipt.shopPhone,
      items: receipt.items,
      totalQuantity: totalQuantity,
      totalCost: parseFloat(totalCost.toFixed(2)),
      supplier: receipt.supplier || '',
      remark: receipt.remark || '',
      operator: receipt.operator || '',
      createTime: new Date()
    }
  })
}

// ===========================
// 入库单相关 action
// ===========================

/**
 * 入库单列表（分页查询）
 */
async function listReceipts(event) {
  var { shopPhone, page, pageSize } = event
  if (!shopPhone) return { code: -1, msg: 'shopPhone 必填' }

  var limit = pageSize || 20
  var skip = ((page || 1) - 1) * limit

  try {
    var countRes = await db.collection('repair_stock_receipts')
      .where({ shopPhone: shopPhone }).count()
    var total = countRes.total || 0
    var listRes = await db.collection('repair_stock_receipts')
      .where({ shopPhone: shopPhone })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
    return { code: 0, data: { list: listRes.data || [], total: total } }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 按入库单号获取详情
 */
async function getReceiptDetail(event) {
  var { batchId, shopPhone } = event
  if (!batchId || !shopPhone) return { code: -1, msg: '参数不足' }

  try {
    var res = await db.collection('repair_stock_receipts')
      .where({ batchId: batchId, shopPhone: shopPhone })
      .limit(1)
      .get()
    if (!res.data || res.data.length === 0) {
      return { code: -1, msg: '入库单不存在' }
    }
    return { code: 0, data: res.data[0] }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 根据流水 ID 反查所属入库单
 */
async function getReceiptByLogId(event) {
  var { logId, shopPhone } = event
  if (!logId || !shopPhone) return { code: -1, msg: '参数不足' }

  try {
    // 先查流水记录获取 batchId
    var logRes = await db.collection('repair_stock_logs')
      .where({ _id: logId, shopPhone: shopPhone })
      .limit(1)
      .get()
    if (!logRes.data || logRes.data.length === 0) {
      return { code: -1, msg: '流水不存在' }
    }
    var batchId = logRes.data[0].batchId
    if (!batchId) {
      return { code: -1, msg: '该流水无关联入库单（可能是旧数据）' }
    }
    // 再查入库单
    var receiptRes = await db.collection('repair_stock_receipts')
      .where({ batchId: batchId, shopPhone: shopPhone })
      .limit(1)
      .get()
    if (!receiptRes.data || receiptRes.data.length === 0) {
      return { code: -1, msg: '入库单不存在' }
    }
    return { code: 0, data: receiptRes.data[0] }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

// ===========================
// ===========================

/**
 * 工单保存后将 orderRef 更新为订单 _id（新工单回填 orderId）
 */
async function updateStockLogOrderId(event) {
  var { shopPhone, orderRef, orderId } = event
  if (!shopPhone || !orderRef || !orderId) {
    return { code: -1, msg: '参数不足' }
  }
  try {
    await db.collection('repair_stock_logs')
      .where({ shopPhone: shopPhone, orderRef: orderRef, type: 'out' })
      .update({ data: { orderRef: orderId } })
    return { code: 0, msg: '更新成功' }
  } catch (e) {
    console.error('updateStockLogOrderId 失败:', e)
    return { code: -1, msg: '更新失败: ' + e.message }
  }
}

// ===========================
// ===========================

/**
 * 获取模板商品列表（无需登录）
 */
async function listTemplateProducts(event) {
  var { category, keyword, page, pageSize } = event
  var query = {}
  if (category && category !== '全部') {
    query.category = category
  }
  if (keyword && keyword.trim()) {
    var kw = keyword.trim()
    query.name = db.RegExp({ regexp: kw, options: 'i' })
  }

  var p = page || 1
  var ps = pageSize || 100

  try {
    var countRes = await db.collection('repair_product_templates')
      .where(query).count()
    var total = countRes.total || 0
    var listRes = await db.collection('repair_product_templates')
      .where(query)
      .orderBy('sortOrder', 'asc')
      .skip((p - 1) * ps)
      .limit(ps)
      .get()
    return { code: 0, data: { list: listRes.data || [], total: total } }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

/**
 * 导入单个模板商品到本店 repair_products
 * 重复导入自动恢复为已上架
 */
async function importTemplateProduct(event) {
  var { shopPhone, templateId } = event
  if (!shopPhone || !templateId) return { code: -1, msg: '参数不足' }

  try {
    // 查找模板
    var tmplRes = await db.collection('repair_product_templates')
      .where({ _id: templateId })
      .limit(1)
      .get()
    if (!tmplRes.data || tmplRes.data.length === 0) {
      return { code: -1, msg: '模板商品不存在' }
    }
    var template = tmplRes.data[0]

    // 检查本店是否已导入该模板
    var existRes = await db.collection('repair_products')
      .where({ shopPhone: shopPhone, _templateId: templateId })
      .limit(1)
      .get()

    if (existRes.data && existRes.data.length > 0) {
      // 已存在 → 恢复为已上架
      var existing = existRes.data[0]
      await db.collection('repair_products')
        .doc(existing._id)
        .update({ data: { productStatus: 'on_shelf', updateTime: new Date() } })
      return { code: 0, msg: '已恢复上架', data: { _id: existing._id, existed: true } }
    }

    // 不存在 → 复制模板到本店
    var now = new Date()
    var templateSpecs = template.specs || []
    var productData = {
      shopPhone: shopPhone,
      name: template.name,
      category: template.category || '其他',
      specs: templateSpecs,
      specStock: templateSpecs.map(function (s) { return { label: s, stock: 0 } }),
      specPrice: template.specPrice || [],
      specCost: template.specCost || [],
      price: template.price || 0,
      cost: template.cost || 0,
      stock: 0,
      unit: template.unit || '个',
      remark: template.remark || '',
      productStatus: 'on_shelf',
      _templateId: templateId,
      createTime: now,
      updateTime: now
    }
    var addRes = await db.collection('repair_products').add({ data: productData })
    return { code: 0, msg: '上架成功', data: { _id: addRes._id, existed: false } }
  } catch (e) {
    return { code: -1, msg: '操作失败: ' + e.message }
  }
}

/**
 * 切换商品上下架状态（仅对 repair_products 操作）
 */
async function toggleProductStatus(event) {
  var { shopPhone, productId, status } = event
  if (!shopPhone || !productId) return { code: -1, msg: '参数不足' }
  var newStatus = status === 'on_shelf' ? 'on_shelf' : 'off_shelf'

  try {
    var res = await db.collection('repair_products')
      .where({ _id: productId, shopPhone: shopPhone })
      .limit(1)
      .get()
    if (!res.data || res.data.length === 0) {
      return { code: -1, msg: '商品不存在' }
    }
    await db.collection('repair_products')
      .doc(productId)
      .update({ data: { productStatus: newStatus, updateTime: new Date() } })
    var label = newStatus === 'on_shelf' ? '已上架' : '已下架'
    return { code: 0, msg: label }
  } catch (e) {
    return { code: -1, msg: '操作失败: ' + e.message }
  }
}

/**
 * 批量导入所有未导入的模板商品到本店
 */
async function batchImportTemplates(event) {
  var { shopPhone, templateIds } = event
  if (!shopPhone) return { code: -1, msg: 'shopPhone 必填' }

  try {
    // 获取模板：如果传了 templateIds 则只导入选中的，否则导入全部
    var tmplQuery = {}
    if (templateIds && Array.isArray(templateIds) && templateIds.length > 0) {
      tmplQuery._id = _.in(templateIds)
    }
    var tmplRes = await db.collection('repair_product_templates')
      .where(tmplQuery)
      .get()
    var templates = tmplRes.data || []
    if (templates.length === 0) {
      return { code: 0, msg: '暂无模板商品', data: { count: 0 } }
    }

    // 查询本店已有的模板导入记录
    var existRes = await db.collection('repair_products')
      .where({ shopPhone: shopPhone, _templateId: _.exists(true) })
      .field({ _templateId: true })
      .get()
    var existingIds = {}
    ;(existRes.data || []).forEach(function (p) {
      if (p._templateId) existingIds[p._templateId] = true
    })

    // 只导入未导入的模板
    var now = new Date()
    var importedCount = 0
    var tasks = []
    templates.forEach(function (tmpl) {
      if (existingIds[tmpl._id]) return // 跳过已导入
      tasks.push({
        shopPhone: shopPhone,
        name: tmpl.name,
        category: tmpl.category || '其他',
        specs: tmpl.specs || [],
        specStock: (tmpl.specs || []).map(function (s) { return { label: s, stock: 0 } }),
        specPrice: tmpl.specPrice || [],
        specCost: tmpl.specCost || [],
        price: tmpl.price || 0,
        cost: tmpl.cost || 0,
        stock: 0,
        unit: tmpl.unit || '个',
        remark: tmpl.remark || '',
        productStatus: 'on_shelf',
        _templateId: tmpl._id,
        createTime: now,
        updateTime: now
      })
      importedCount++
    })

    // 批量写入（分批，每次最多 50 条）
    var BATCH_SIZE = 50
    for (var i = 0; i < tasks.length; i += BATCH_SIZE) {
      var batch = tasks.slice(i, i + BATCH_SIZE)
      var promises = batch.map(function (item) {
        return db.collection('repair_products').add({ data: item })
      })
      await Promise.all(promises)
    }

    return { code: 0, msg: '批量导入完成，新增 ' + importedCount + ' 个商品', data: { count: importedCount } }
  } catch (e) {
    return { code: -1, msg: '批量导入失败: ' + e.message }
  }
}

/**
 * 将游客账号的商品同步到模板集合（仅 superAdmin 可调用）
 */
async function syncTemplatesFromGuest(event) {
  var guestPhone = event.guestPhone || '13507720000'
  try {
    // 读取游客账号的所有商品
    var productsRes = await db.collection('repair_products')
      .where({ shopPhone: guestPhone })
      .get()
    var products = productsRes.data || []
    if (products.length === 0) {
      return { code: 0, msg: '游客账号暂无商品，无变化', data: { count: 0 } }
    }

    // 清空现有模板
    await db.collection('repair_product_templates').where({}).remove()

    // 转换为模板格式并写入
    var now = new Date()
    var templates = products.map(function (p, idx) {
      return {
        name: p.name,
        category: p.category || '其他',
        specs: p.specs || [],
        price: p.price || 0,
        cost: p.cost || 0,
        unit: p.unit || '个',
        remark: p.remark || '',
        sortOrder: idx + 1,
        createTime: now
      }
    })

    // 分批写入
    var BATCH_SIZE = 50
    for (var i = 0; i < templates.length; i += BATCH_SIZE) {
      var batch = templates.slice(i, i + BATCH_SIZE)
      var promises = batch.map(function (item) {
        return db.collection('repair_product_templates').add({ data: item })
      })
      await Promise.all(promises)
    }

    return { code: 0, msg: '同步成功，共 ' + templates.length + ' 个模板商品', data: { count: templates.length } }
  } catch (e) {
    return { code: -1, msg: '同步失败: ' + e.message }
  }
}

/**
 * 创建/编辑模板商品
 */
async function saveTemplateProduct(event) {
  var { templateId, name, category, specs, specPrice, specCost, price, cost, unit, sortOrder, remark } = event
  if (!name) return { code: -1, msg: '商品名必填' }

  var now = new Date()
  var data = {
    name: name.trim(),
    category: category || '其他',
    specs: specs || [],
    specPrice: specPrice || [],
    specCost: specCost || [],
    price: Number(price) || 0,
    cost: Number(cost) || 0,
    unit: unit || '个',
    sortOrder: Number(sortOrder) || 0,
    remark: remark || '',
    updateTime: now
  }
  try {
    if (templateId) {
      // 编辑
      await db.collection('repair_product_templates').doc(templateId).update({ data: data })
      return { code: 0, msg: '更新成功' }
    } else {
      // 新建
      data.createTime = now
      var res = await db.collection('repair_product_templates').add({ data: data })
      return { code: 0, msg: '创建成功', data: { _id: res._id } }
    }
  } catch (e) {
    return { code: -1, msg: '操作失败: ' + e.message }
  }
}

/**
 * 获取模板商品详情
 */
async function getTemplateProductDetail(event) {
  var { templateId } = event
  if (!templateId) return { code: -1, msg: 'templateId 必填' }
  try {
    var res = await db.collection('repair_product_templates').doc(templateId).get()
    if (!res.data) return { code: -1, msg: '模板不存在' }
    return { code: 0, data: res.data }
  } catch (e) {
    return { code: -1, msg: '查询失败: ' + e.message }
  }
}

// ===========================
// 入口
// ===========================
exports.main = async (event, context) => {
  var action = event.action || ''
  var permCheck = null

  try {
    permCheck = await checkPermission(event, context, action)
  } catch (e) {
    return { code: -99, msg: '鉴权异常: ' + e.message }
  }

  if (permCheck) return permCheck

  switch (action) {
    case 'addProduct':
      return await addProduct(event)
    case 'updateProduct':
      return await updateProduct(event)
    case 'addStock':
      return await addStock(event)
    case 'deductStock':
      return await deductStock(event)
    case 'listProducts':
      return await listProducts(event)
    case 'getProductDetail':
      return await getProductDetail(event)
    case 'getStockLogs':
      return await getStockLogs(event)
    case 'getStockLogDetail':
      return await getStockLogDetail(event)
    case 'getPhrases':
      return await getPhrases(event)
    case 'savePhrases':
      return await savePhrases(event)
    case 'listTemplateProducts':
      return await listTemplateProducts(event)
    case 'importTemplateProduct':
      return await importTemplateProduct(event)
    case 'toggleProductStatus':
      return await toggleProductStatus(event)
    case 'batchImportTemplates':
      return await batchImportTemplates(event)
    case 'syncTemplatesFromGuest':
      return await syncTemplatesFromGuest(event)
    case 'adjustStock':
      return await adjustStock(event)
    case 'batchAddStock':
      return await batchAddStock(event)
    case 'updateStockLogOrderId':
      return await updateStockLogOrderId(event)
    case 'saveTemplateProduct':
      return await saveTemplateProduct(event)
    case 'getTemplateProductDetail':
      return await getTemplateProductDetail(event)
    case 'listReceipts':
      return await listReceipts(event)
    case 'getReceiptDetail':
      return await getReceiptDetail(event)
    case 'getReceiptByLogId':
      return await getReceiptByLogId(event)
    default:
      return { code: -1, msg: '未知 action: ' + action }
  }
}
