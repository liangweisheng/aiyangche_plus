import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 获取报表订单数据（服务端聚合）
 * @param {number} startTime - 开始时间戳(ms)
 * @param {number} [endTime=0] - 结束时间戳(ms)，可选
 * @returns {Promise<Array>} 订单数组
 */
export async function fetchReportOrders(startTime, endTime = 0) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('getReportOrders', {
    startTime,
    endTime
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取报表数据失败')
  }

  // 云函数返回 { code: 0, data: { orders: [...] } }
  const orders = (result.data && result.data.orders) ? result.data.orders : (result.data || [])
  return Array.isArray(orders) ? orders : []
}

/**
 * 获取客户消费排行（服务端聚合）
 * @param {number} startTime - 开始时间戳(ms)
 * @param {number} [endTime=0] - 结束时间戳(ms)，可选
 * @param {number} [page=1] - 页码
 * @param {number} [pageSize=60] - 每页条数
 * @returns {Promise<{list: Array, total: number, page: number, pageSize: number}>}
 */
export async function fetchCustomerRanking(startTime, endTime = 0, page = 1, pageSize = 60) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const params = { startTime, page, pageSize }
  if (endTime) {
    params.endTime = endTime
  }

  const result = await callCloudFunction('getCustomerRanking', params, {
    shopPhone, clientPhone: shopPhone
  })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取排行数据失败')
  }

  const data = result.data || {}
  return {
    list: data.list || [],
    total: data.total || 0,
    page: data.page || page,
    pageSize: data.pageSize || pageSize
  }
}
