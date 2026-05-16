/**
 * 全局常量（Web 端版，同步小程序端 utils/constants.js）
 */
export const APP_VERSION = 'v6.3.0'

// 游客/演示
export const GUEST_PHONE = '13507720000'
export const GUEST_SHOP_CODE = '123456'

// 客服
export const SERVICE_PHONE = '17807725166'
export const SERVICE_WECHAT = 'liang-weisheng'

// 分页
export const DEFAULT_PAGE_LIMIT = 20
export const FETCH_ALL_LIMIT = 100

// 云函数超时
export const CLOUD_TIMEOUT_MS = 10000

// 检查项（同步小程序）
export const CHECK_ITEMS = [
  { key: 'exterior', label: '外观检查' },
  { key: 'tire',     label: '轮胎检查' },
  { key: 'oil',      label: '机油检查' },
  { key: 'battery',  label: '电瓶检查' },
  { key: 'brake',    label: '刹车检查' },
  { key: 'light',    label: '灯光检查' },
  { key: 'chassis',  label: '底盘检查' },
  { key: 'other',    label: '其他检查' }
]

export const CHECK_STATUS = {
  NORMAL: 'normal',
  ABNORMAL: 'abnormal',
  PENDING: 'pending'
}
