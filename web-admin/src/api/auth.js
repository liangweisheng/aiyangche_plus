import { callCloudFunction } from './cloud'

/**
 * 手机号 + 门店码登录
 * @param {string} phone
 * @param {string} shopCode
 * @returns {Promise<{code: number, data: {record, isStaff, ownerName}, msg?: string}>}
 */
export async function loginByPhoneCode(phone, shopCode) {
  return callCloudFunction('loginByPhoneCode', { phone, shopCode }, {})
}
