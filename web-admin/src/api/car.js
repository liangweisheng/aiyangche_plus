import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 新增车辆
 * @param {object} carData - 车辆数据
 * @param {string} carData.plate - 车牌号（必填）
 * @param {string} [carData.carType] - 车型
 * @param {string} [carData.color] - 颜色
 * @param {number} [carData.mileage] - 里程
 * @param {string} [carData.phone] - 手机号
 * @param {string} [carData.ownerName] - 车主姓名
 * @param {string} [carData.maintainDate] - 保养到期
 * @param {string} [carData.insuranceDate] - 保险到期
 * @param {string} [carData.partReplaceName] - 配件名称
 * @param {string} [carData.partReplaceDate] - 配件更换日期
 * @param {string} [carData.remark] - 备注
 * @param {string} [carData.vin] - VIN码
 * @returns {Promise<object>}
 */
export async function addCar(carData) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const result = await callCloudFunction('addCar', {
    ...carData,
    shopPhone
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '新增车辆失败')
  }

  return result.data || {}
}

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
