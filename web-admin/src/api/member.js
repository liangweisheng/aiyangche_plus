import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 获取会员列表（服务端分页 + 多字段搜索）
 * @param {object} params
 * @param {number} params.page
 * @param {number} params.pageSize
 * @param {string} [params.keyword] - 车牌号/姓名/手机号
 * @returns {Promise<{list: Array, total: number}>}
 */
export async function fetchMemberList({ page = 1, pageSize = 20, keyword = '' } = {}) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('listMembers', {
    page,
    pageSize,
    keyword
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取会员列表失败')
  }

  const data = result.data || {}
  return {
    list: data.list || [],
    total: data.total || 0
  }
}

/**
 * 更新会员信息（等级、备注等）
 * @param {string} docId - 会员记录 _id
 * @param {object} updateData
 * @returns {Promise<object>}
 */
export async function updateMember(docId, updateData) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('updateMember', {
    docId,
    updateData
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '更新会员失败')
  }

  return result.data || {}
}

/**
 * 获取会员消费排行（复用 getCustomerRanking，限时全部）
 * @param {number} startTime
 * @param {number} [endTime]
 * @returns {Promise<{list: Array, total: number}>}
 */
export async function fetchMemberRanking(startTime, endTime = 0) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const params = { startTime, page: 1, pageSize: 100 }
  if (endTime) params.endTime = endTime

  const result = await callCloudFunction('getCustomerRanking', params, {
    shopPhone, clientPhone: shopPhone
  })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取排行失败')
  }

  return result.data || { list: [], total: 0 }
}
