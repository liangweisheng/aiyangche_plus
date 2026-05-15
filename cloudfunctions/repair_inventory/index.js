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
  addStock: 'admin+pro',
  deductStock: 'admin+pro',
  listProducts: 'registered',
  getProductDetail: 'registered',
  addProduct: 'admin+pro',
  updateProduct: 'admin+pro',
  getStockLogs: 'admin+pro'
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
  var callerOpenId = wxContext.OPENID || ''

  if (requirePublic) return null // 不需要鉴权

  if (!callerOpenId && !requirePublic) {
    return { code: -2, msg: '未获取到用户身份' }
  }

  // 查询调用者记录
  var callerRecord = null
  try {
    var callerRes = await db.collection('repair_activationCodes')
      .where({ openid: callerOpenId })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()
    if (callerRes.data && callerRes.data.length > 0) {
      callerRecord = callerRes.data[0]
    }
  } catch (e) {}

  // registered：需要有记录
  if (requireRegistered && !callerRecord) {
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
    if (!isPro) {
      return { code: -4, msg: '请先激活 Pro 版' }
    }
  }

  // admin：需要是管理员以上
  if (requireAdmin) {
    var role = callerRecord ? (callerRecord.role || 'admin') : ''
    if (role !== 'admin' && !callerRecord) {
      return { code: -5, msg: '无权限，仅管理员可操作' }
    }
  }

  return null // 鉴权通过
}

// ===========================
// Action 处理函数
// ===========================

/**
 * 新增商品
 */
async function addProduct(event) {
  var { shopPhone, name, category, specs, price, cost, unit, remark } = event
  if (!shopPhone || !name) return { code: -1, msg: '门店和商品名必填' }

  var now = new Date()
  var data = {
    shopPhone: shopPhone,
    name: name.trim(),
    category: category || '其他',
    specs: specs || [],
    price: Number(price) || 0,
    cost: Number(cost) || 0,
    stock: 0,
    unit: unit || '个',
    remark: remark || '',
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
  var { productId, shopPhone, name, category, specs, price, cost, unit, remark } = event
  if (!productId || !shopPhone) return { code: -1, msg: '参数不足' }

  var updateData = { updateTime: new Date() }
  if (name !== undefined) updateData.name = name.trim()
  if (category !== undefined) updateData.category = category
  if (specs !== undefined) updateData.specs = specs
  if (price !== undefined) updateData.price = Number(price)
  if (cost !== undefined) updateData.cost = Number(cost)
  if (unit !== undefined) updateData.unit = unit
  if (remark !== undefined) updateData.remark = remark

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
  var { shopPhone, productId, spec, quantity, cost, operator, remark } = event
  if (!shopPhone || !productId || !quantity || quantity <= 0) {
    return { code: -1, msg: '参数不足或数量不合法' }
  }

  var qty = Number(quantity)
  var costPrice = Number(cost) || 0

  try {
    // 更新商品库存
    var productRes = await db.collection('repair_products')
      .where({ _id: productId, shopPhone: shopPhone })
      .get()
    if (!productRes.data || productRes.data.length === 0) {
      return { code: -1, msg: '商品不存在' }
    }
    var product = productRes.data[0]

    // 写入库存流水
    await db.collection('repair_stock_logs').add({
      data: {
        shopPhone: shopPhone,
        productId: productId,
        productName: product.name,
        spec: spec || '',
        type: 'in',
        quantity: qty,
        cost: costPrice,
        operator: operator || '',
        remark: remark || '',
        createTime: new Date()
      }
    })

    return { code: 0, msg: '入库成功', data: { newStock: (product.stock || 0) + qty } }
  } catch (e) {
    return { code: -1, msg: '入库失败: ' + e.message }
  }
}

/**
 * 批量扣减库存（出库，用于工单保存时）
 */
async function deductStock(event) {
  var { shopPhone, items } = event
  // items: [{ productId, spec, quantity }]
  if (!shopPhone || !items || !Array.isArray(items) || items.length === 0) {
    return { code: -1, msg: '参数不足' }
  }

  var errors = []
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    if (!item.productId || !item.quantity || item.quantity <= 0) {
      errors.push({ index: i, msg: '商品ID或数量不合法' })
      continue
    }
    try {
      var productRes = await db.collection('repair_products')
        .where({ _id: item.productId, shopPhone: shopPhone })
        .get()
      if (!productRes.data || productRes.data.length === 0) {
        errors.push({ index: i, productId: item.productId, msg: '商品不存在' })
        continue
      }
      var product = productRes.data[0]
      var currentStock = product.stock || 0
      if (currentStock < item.quantity) {
        errors.push({ index: i, productId: item.productId, productName: product.name, msg: product.name + ' 库存不足（当前 ' + currentStock + '，需要 ' + item.quantity + '）' })
        continue
      }

      // 写流水
      await db.collection('repair_stock_logs').add({
        data: {
          shopPhone: shopPhone,
          productId: item.productId,
          productName: product.name,
          spec: item.spec || '',
          type: 'out',
          quantity: Number(item.quantity),
          cost: 0,
          operator: event.operator || '',
          remark: '工单出库',
          createTime: new Date()
        }
      })
    } catch (e) {
      errors.push({ index: i, productId: item.productId, msg: e.message })
    }
  }

  if (errors.length > 0) {
    return { code: -1, msg: '部分扣减失败', data: { errors: errors } }
  }
  return { code: 0, msg: '扣减成功' }
}

/**
 * 商品列表
 */
async function listProducts(event) {
  var { shopPhone, category, keyword, page, pageSize } = event
  if (!shopPhone) return { code: -1, msg: 'shopPhone 必填' }

  var query = { shopPhone: shopPhone }
  if (category && category !== '全部') {
    query.category = category
  }
  if (keyword && keyword.trim()) {
    var kw = keyword.trim()
    query.name = db.RegExp({ regexp: kw, options: 'i' })
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
 * 出入库流水
 */
async function getStockLogs(event) {
  var { productId, shopPhone, page, pageSize } = event
  if (!productId || !shopPhone) return { code: -1, msg: '参数不足' }

  var limit = pageSize || 20
  var skip = ((page || 1) - 1) * limit

  try {
    var countRes = await db.collection('repair_stock_logs')
      .where({ productId: productId, shopPhone: shopPhone })
      .count()
    var total = countRes.total || 0
    var listRes = await db.collection('repair_stock_logs')
      .where({ productId: productId, shopPhone: shopPhone })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
    return { code: 0, data: { list: listRes.data || [], total: total } }
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
    default:
      return { code: -1, msg: '未知 action: ' + action }
  }
}
