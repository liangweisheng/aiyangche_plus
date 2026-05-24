import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

// ============ 门店信息 ============

/**
 * 获取门店配置
 */
export async function fetchShopProfile() {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('getShopProfile', { shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  return result.data || {}
}

/**
 * 更新门店基本信息（白名单字段：name, shopTel, shopAddr, displayName）
 */
export async function updateShopInfo(field, value) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('updateShopInfo', { field, value }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '保存失败')
  return result.data || {}
}

/**
 * 更新门店经营配置（工位数、开业年份等）
 */
export async function updateShopProfile(data) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('updateShopProfile', { shopPhone, ...data }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '保存失败')
  return result.data || {}
}

// ============ 员工管理 ============

/**
 * 获取员工列表
 */
export async function fetchStaffList() {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('listStaffs', { shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '查询失败')
  const data = result.data || {}
  return data.list || []
}

/**
 * 添加员工
 */
export async function addStaff(phone, displayName, role = 'staff') {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('addStaff', { shopPhone, phone, displayName, role }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '添加失败')
  return result.data || {}
}

/**
 * 移除员工
 */
export async function removeStaff(staffDocId) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('removeStaff', { staffDocId, shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '移除失败')
}

/**
 * 修改员工角色
 */
export async function updateStaffRole(staffDocId, role) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone
  const result = await callCloudFunction('updateStaffRole', { staffDocId, role, shopPhone }, { shopPhone, clientPhone: shopPhone })
  if (result.code !== 0) throw new Error(result.msg || '修改失败')
}
