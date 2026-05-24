import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

function getShopPhone() {
  return useUserStore().shopPhone
}

// ============ 商品域 ============

/**
 * 商品列表（支持分类/关键词/状态筛选）
 */
export async function fetchProductList({ category = '', keyword = '', page = 1, pageSize = 50, status = '' } = {}) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('listProducts', {
    shopPhone, category, keyword, page, pageSize, status
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })

  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  const data = result.data || {}
  return { list: data.list || [], total: data.total || 0 }
}

/**
 * 商品详情
 */
export async function fetchProductDetail(productId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getProductDetail', { productId, shopPhone }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}

/**
 * 新增商品
 */
export async function addProduct(formData) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('addProduct', { ...formData, shopPhone }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '添加失败')
  return result.data || {}
}

/**
 * 更新商品
 */
export async function updateProduct(productId, formData) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('updateProduct', { productId, shopPhone, ...formData }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '更新失败')
  return result.data || {}
}

/**
 * 上下架切换
 */
export async function toggleProductStatus(productId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('toggleProductStatus', { productId, shopPhone }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '操作失败')
  return result.data || {}
}

// ============ 库存域 ============

/**
 * 库存流水
 */
export async function fetchStockLogs({ productId, page = 1, pageSize = 20, logType = '', startDate = '', endDate = '' }) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getStockLogs', {
    productId, shopPhone, page, pageSize, logType, startDate, endDate
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  const data = result.data || {}
  return { list: data.list || [], total: data.total || 0 }
}

/**
 * 批量入库
 */
export async function batchAddStock({ items, operator, supplier, remark }) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('batchAddStock', {
    shopPhone, items, operator: operator || '管理员', supplier: supplier || '', remark: remark || ''
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '入库失败')
  return result.data || {}
}

/**
 * 库存调整
 */
export async function adjustStock({ productId, spec, quantity, reason, remark, operator }) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('adjustStock', {
    productId, shopPhone, spec: spec || '', quantity, reason, remark, operator
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '调整失败')
  return result.data || {}
}

// ============ 库存扣减域 ============

/**
 * 扣减库存（工单保存前调用）
 * @param {object} params
 * @param {Array<{productId:string, spec:string, quantity:number, amount:number}>} params.items - 扣减项
 * @param {string} params.orderRef - 工单引用（关联库存流水）
 * @param {string} [params.operator] - 操作人
 */
export async function deductStock({ items, orderRef, operator } = {}) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('deductStock', {
    shopPhone, items, orderRef, operator: operator || '管理员'
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })

  if (result.code !== 0) {
    throw new Error(result.msg || '库存扣减失败')
  }
  return result.data || {}
}

// ============ 入库单域 ============

/**
 * 入库单列表
 */
export async function fetchReceiptList({ page = 1, pageSize = 20 }) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('listReceipts', { shopPhone, page, pageSize }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  const data = result.data || {}
  return { list: data.list || [], total: data.total || 0 }
}

/**
 * 入库单详情（按 batchId）
 */
export async function fetchReceiptDetail(batchId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getReceiptDetail', { batchId, shopPhone }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}

/**
 * 入库单详情（按 logId 反查）
 */
export async function fetchReceiptByLogId(logId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getReceiptByLogId', { logId, shopPhone }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}

// ============ 模板商品域 ============

/**
 * 获取模板商品列表（公开数据，无需店铺鉴权）
 * @param {object} params
 * @param {string} [params.category] - 分类筛选
 * @param {string} [params.keyword] - 关键词
 * @param {number} [params.page] - 页码
 * @param {number} [params.pageSize] - 每页条数
 */
export async function fetchTemplateProductList({ category = '', keyword = '', page = 1, pageSize = 100 } = {}) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('listTemplateProducts', {
    category, keyword, page, pageSize
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })

  if (result.code !== 0) throw new Error(result.msg || '查询模板失败')
  const data = result.data || {}
  return { list: data.list || [], total: data.total || 0 }
}

/**
 * 导入单个模板商品到本店
 * @param {string} templateId
 */
export async function importTemplateProduct(templateId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('importTemplateProduct', {
    shopPhone, templateId
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })

  if (result.code !== 0) throw new Error(result.msg || '导入失败')
  return result.data || {}
}

/**
 * 批量导入模板商品
 * @param {string[]} templateIds
 */
export async function batchImportTemplateProducts(templateIds) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('batchImportTemplates', {
    shopPhone, templateIds
  }, { shopPhone, clientPhone: shopPhone, functionName: 'repair_inventory' })

  if (result.code !== 0) throw new Error(result.msg || '批量导入失败')
  return result.data || {}
}
