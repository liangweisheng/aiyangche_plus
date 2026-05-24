import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 新增会员
 * @param {object} memberData
 * @param {string} memberData.plate - 车牌号（必填）
 * @param {string} [memberData.ownerName] - 车主姓名
 * @param {string} [memberData.phone] - 手机号
 * @param {string} [memberData.level] - 等级
 * @param {Array} [memberData.benefits] - 权益列表 [{name, total, remain, amount}]
 * @param {string} [memberData.remark] - 备注
 * @returns {Promise<object>}
 */
export async function addMember(memberData) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('addMember', {
    ...memberData,
    shopPhone
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '新增会员失败')
  }

  return result.data || {}
}

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

/**
 * 使用权益（核销一次）
 * @param {object} params
 * @param {string} params.memberDocId - 会员记录 _id
 * @param {number} params.benefitIdx - 权益索引
 * @param {number} params.newRemain - 核销后剩余次数
 * @param {string} params.benefitName - 权益名称
 * @param {number} params.benefitTotal - 权益总次数
 * @param {string} params.plate - 车牌号
 * @returns {Promise<{newRemain: number, orderId: string}>}
 */
export async function useBenefit({ memberDocId, benefitIdx, newRemain, benefitName, benefitTotal, plate }) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('useBenefit', {
    memberDocId,
    benefitIdx,
    newRemain,
    plate,
    shopPhone,
    benefitName,
    benefitTotal,
    operatorName: '管理员'
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '权益核销失败')
  }

  return result.data || {}
}

/**
 * 按车牌号查找会员
 * @param {string} plate - 车牌号
 * @returns {Promise<object|null>} 会员记录，找不到返回 null
 */
export async function fetchMemberByPlate(plate) {
  const result = await fetchMemberList({ keyword: plate, pageSize: 1 })
  // 精确匹配车牌号
  const match = (result.list || []).find(m => m.plate === plate)
  return match || null
}
