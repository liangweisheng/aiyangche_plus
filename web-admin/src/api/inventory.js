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
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  const data = result.data || {}
  return { list: data.list || [], total: data.total || 0 }
}

/**
 * 商品详情
 */
export async function fetchProductDetail(productId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getProductDetail', { productId, shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}

/**
 * 新增商品
 */
export async function addProduct(formData) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('addProduct', { ...formData, shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '添加失败')
  return result.data || {}
}

/**
 * 更新商品
 */
export async function updateProduct(productId, formData) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('updateProduct', { productId, shopPhone, ...formData }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '更新失败')
  return result.data || {}
}

/**
 * 上下架切换
 */
export async function toggleProductStatus(productId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('toggleProductStatus', { productId, shopPhone }, { shopPhone, clientPhone: shopPhone })
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
  }, { shopPhone, clientPhone: shopPhone })
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
  }, { shopPhone, clientPhone: shopPhone })
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
  }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '调整失败')
  return result.data || {}
}

// ============ 入库单域 ============

/**
 * 入库单列表
 */
export async function fetchReceiptList({ page = 1, pageSize = 20 }) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('listReceipts', { shopPhone, page, pageSize }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  const data = result.data || {}
  return { list: data.list || [], total: data.total || 0 }
}

/**
 * 入库单详情（按 batchId）
 */
export async function fetchReceiptDetail(batchId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getReceiptDetail', { batchId, shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}

/**
 * 入库单详情（按 logId 反查）
 */
export async function fetchReceiptByLogId(logId) {
  const shopPhone = getShopPhone()
  const result = await callCloudFunction('getReceiptByLogId', { logId, shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}
