import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 创建工单
 * @param {object} orderData
 * @param {string} orderData.plate - 车牌号（必填）
 * @param {string} orderData.serviceItems - 服务项目（逗号分隔）
 * @param {string} orderData.serviceAmounts - 金额（逗号分隔）
 * @param {number} orderData.totalAmount - 总金额
 * @param {number} [orderData.paidAmount] - 实收金额
 * @param {string} [orderData.payMethod] - 支付方式
 * @param {string} [orderData.status] - 状态
 * @param {string} [orderData.remark] - 备注
 * @param {string} [orderData.setMaintainDate] - 保养到期
 * @param {number} [orderData.setMileage] - 里程
 * @param {string} [orderData.carDocId] - 车辆 docId
 * @param {string} [orderData.serviceCategories] - 分类（逗号分隔）
 * @param {string} [orderData.orderCategory] - 工单分类
 * @param {number} [orderData.partCost] - 配件成本
 * @param {number} [orderData.profit] - 毛利
 * @returns {Promise<object>}
 */
export async function createOrder(orderData) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('createOrder', {
    ...orderData,
    shopPhone
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '创建工单失败')
  }

  return result.data || {}
}

/**
 * 获取工单列表（服务端分页 + 会员标记）
 * @param {object} params
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页条数
 * @param {string} [params.keyword] - 车牌号搜索
 * @param {string} [params.statusFilter] - 状态筛选
 * @returns {Promise<{list: Array, total: number}>}
 */
export async function fetchOrderList({ page = 1, pageSize = 20, keyword = '', statusFilter = '' } = {}) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('listOrders', {
    page,
    pageSize,
    keyword,
    statusFilter
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取工单列表失败')
  }

  const data = result.data || {}
  return {
    list: data.list || [],
    total: data.total || 0
  }
}

/**
 * 作废工单（仅管理员 + 已完成状态）
 * @param {string} orderId - 工单 _id
 * @returns {Promise<object>}
 */
export async function voidOrder(orderId) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('voidOrder', {
    orderId
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '作废工单失败')
  }

  return result.data || {}
}

/**
 * 编辑工单
 * @param {string} orderId - 工单 _id
 * @param {object} updateData - 更新字段
 * @returns {Promise<object>}
 */
export async function editOrder(orderId, updateData) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('editOrder', {
    orderId,
    updateData
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '编辑工单失败')
  }

  return result.data || {}
}
