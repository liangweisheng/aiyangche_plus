import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 获取车辆列表（服务端聚合：车辆+会员状态+工单统计）
 * @returns {Promise<{list: Array, total: number, memberMap: Object, orderStats: Object}>}
 */
export async function fetchCarList() {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('listCars', {}, {
    shopPhone, clientPhone: shopPhone
  })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取车辆列表失败')
  }

  const data = result.data || {}
  return {
    list: data.list || [],
    total: data.total || 0,
    memberMap: data.memberMap || {},
    orderStats: data.orderStats || {}
  }
}

/**
 * 更新车辆信息
 * @param {string} docId - 车辆记录 _id
 * @param {object} updateData - 更新字段
 * @returns {Promise<object>}
 */
export async function updateCarInfo(docId, updateData) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  // 过滤空字段
  const cleanData = {}
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined && updateData[key] !== null) {
      cleanData[key] = updateData[key]
    }
  })

  const result = await callCloudFunction('updateCarInfo', {
    docId,
    updateData: cleanData
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '保存失败')
  }

  return result.data || {}
}

/**
 * 获取车辆工单统计
 * @param {string} plate - 车牌号
 * @returns {Promise<object>}
 */
export async function fetchCarOrderStats(plate) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('getCarOrderStats', {
    plate
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取工单统计失败')
  }

  return result.data || {}
}
