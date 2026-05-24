import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

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
