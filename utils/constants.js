/**
 * utils/constants.js
 * 全局常量配置中心
 *
 * 健壮性升级 v5.2.0：
 * - 将散落在各处的硬编码值集中管理
 * - 便于维护和修改，避免遗漏
 * - 敏感配置可单独控制（如客服联系方式）
 */

// ===========================
// 应用版本
// ===========================

/** 应用版本号（唯一来源，全局统一引用） */
var APP_VERSION = 'v6.1.0'


// ===========================
// 游客模式配置
// ===========================

/** 游客演示账号手机号 */
var GUEST_PHONE = '13507720000'

/** 游客演示账号门店码 */
var GUEST_SHOP_CODE = '123456'

/** 游客模式显示名称 */
var GUEST_DISPLAY_NAME = 'AI养车(体验)'

/** 游客模式脱敏显示 */
var GUEST_MASKED_PHONE = '135****0000 (演示账号)'


// ===========================
// 客服与联系信息
// ===========================

/** 官方客服电话 */
var SERVICE_PHONE = '17807725166'

/** 官方微信号 */
var SERVICE_WECHAT = 'liang-weisheng'


// ===========================
// 业务规则限制
// ===========================

/** 免费版最大工单数 */
var FREE_MAX_ORDERS = 100

/** 激活码有效天数（默认1年） */
var PRO_EXPIRE_DAYS = 365

/** Pro 续费提醒阈值（剩余N天时提示） */
var PRO_REMIND_DAYS = 30

/** 报表缓存 key 前缀 */
var REPORT_CACHE_PREFIX = 'reportCache_'

/** 月报缓存 key */
var MONTHLY_REPORT_CACHE_KEY = 'monthlyReportCache'

/** 云函数超时保护时间（毫秒） */
var CLOUD_TIMEOUT_MS = 8000

/** getTempFileURL 超时时间（毫秒） */
var GET_TEMP_URL_TIMEOUT_MS = 10000

/** 数据导出单次最大记录数 */
var EXPORT_MAX_RECORDS = 5000

/** 分页查询默认 limit */
var DEFAULT_PAGE_LIMIT = 20

/** 全量获取分页 limit（云函数端，上限 1000） */
var FETCH_ALL_LIMIT = 100

/** 客户端全量获取分页 limit（微信小程序客户端 .limit() 上限为 20） */
var CLIENT_LIMIT = 20

/** 免费版最大客户数 */
var FREE_MAX_MEMBERS = 10

/** 月报生成最低工单数门槛 */
var MIN_REPORT_ORDERS = 20

/** 多端App缓存信任窗口（小时）：该时间内跳过云端验证，直接恢复本地缓存 */
var MULTIEND_CACHE_TTL_HOURS = 24


// ===========================
// 查车单检查项配置
// ===========================

/**
 * 查车单 8 项检查项定义（唯一来源）
 * checkSheet / checkSheetDetail / checkSheetList 共用
 */
var CHECK_ITEMS = [
  { key: 'exterior', label: '外观检查', icon: '🚗' },
  { key: 'tire',     label: '轮胎检查', icon: '🛞' },
  { key: 'oil',      label: '机油检查', icon: '💧' },
  { key: 'battery',  label: '电瓶检查', icon: '🔋' },
  { key: 'brake',    label: '刹车检查', icon: '🛑' },
  { key: 'light',    label: '灯光检查', icon: '💡' },
  { key: 'chassis',  label: '底盘检查', icon: '🔩' },
  { key: 'other',    label: '其他检查', icon: '📋' }
]

/** 检查结果状态值 */
var CHECK_STATUS = {
  NORMAL: 'normal',
  ABNORMAL: 'abnormal',
  PENDING: 'pending'
}

/** 检查结果中文标签 */
var CHECK_STATUS_LABELS = {
  normal: '正常',
  abnormal: '异常',
  pending: '未检查'
}


// ===========================
// 页面路由
// ===========================

/** TabBar 页面路径 */
var TAB_BAR_PAGES = [
  '/pages/dashboard/dashboard',
  '/pages/memberList/memberList',
  '/pages/carList/carList',
  '/pages/report/report',
  '/pages/proUnlock/proUnlock'
]

/** 搜索防抖延迟（毫秒） */
var SEARCH_DEBOUNCE_MS = 500

/** OCR 车牌识别超时时间（毫秒） */
var OCR_TIMEOUT_MS = 15000


// ===========================
// Pro 状态判定（唯一来源）
// ===========================

/**
 * 从云端记录判断 Pro 激活状态（纯函数，无副作用）
 * 规则：code 有值 && (无 expireTime 或 expireTime 未过期)
 *
 * @param {Object} record 云数据库记录（需含 code / expireTime 字段）
 * @returns {boolean} true=Pro已激活, false=未激活或已过期
 */
function checkProFromRecord(record) {
  if (!record || !record.code) return false
  var expireTime = record.expireTime || ''
  if (expireTime) {
    var ts = new Date(expireTime).getTime()
    if (isNaN(ts)) return false
    return ts > Date.now()
  }
  // code 有值但无 expireTime → 视为永久有效
  return true
}


// ===========================
// 导出
// ===========================

module.exports = {
  // 应用版本
  APP_VERSION: APP_VERSION,

  // 游客模式
  GUEST_PHONE: GUEST_PHONE,
  GUEST_SHOP_CODE: GUEST_SHOP_CODE,
  GUEST_DISPLAY_NAME: GUEST_DISPLAY_NAME,
  GUEST_MASKED_PHONE: GUEST_MASKED_PHONE,

  // 客服联系
  SERVICE_PHONE: SERVICE_PHONE,
  SERVICE_WECHAT: SERVICE_WECHAT,

  // 业务规则
  FREE_MAX_ORDERS: FREE_MAX_ORDERS,
  PRO_EXPIRE_DAYS: PRO_EXPIRE_DAYS,
  PRO_REMIND_DAYS: PRO_REMIND_DAYS,
  FREE_MAX_MEMBERS: FREE_MAX_MEMBERS,
  MIN_REPORT_ORDERS: MIN_REPORT_ORDERS,
  MULTIEND_CACHE_TTL_HOURS: MULTIEND_CACHE_TTL_HOURS,

  // 缓存 Key
  REPORT_CACHE_PREFIX: REPORT_CACHE_PREFIX,
  MONTHLY_REPORT_CACHE_KEY: MONTHLY_REPORT_CACHE_KEY,

  // 性能与安全
  CLOUD_TIMEOUT_MS: CLOUD_TIMEOUT_MS,
  GET_TEMP_URL_TIMEOUT_MS: GET_TEMP_URL_TIMEOUT_MS,
  EXPORT_MAX_RECORDS: EXPORT_MAX_RECORDS,
  DEFAULT_PAGE_LIMIT: DEFAULT_PAGE_LIMIT,
  FETCH_ALL_LIMIT: FETCH_ALL_LIMIT,
  CLIENT_LIMIT: CLIENT_LIMIT,

  // 查车单检查项
  CHECK_ITEMS: CHECK_ITEMS,
  CHECK_STATUS: CHECK_STATUS,
  CHECK_STATUS_LABELS: CHECK_STATUS_LABELS,

  // 页面路由
  TAB_BAR_PAGES: TAB_BAR_PAGES,
  SEARCH_DEBOUNCE_MS: SEARCH_DEBOUNCE_MS,
  OCR_TIMEOUT_MS: OCR_TIMEOUT_MS,

  // Pro 状态判定
  checkProFromRecord: checkProFromRecord
}
