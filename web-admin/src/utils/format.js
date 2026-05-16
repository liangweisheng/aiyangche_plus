/**
 * 格式化工具函数（Web 端版，脱 wx.* 依赖）
 */

/**
 * 格式化金额（分转元显示）
 * @param {number} amount - 金额（单位：分）
 * @returns {string}
 */
export function formatMoney(amount) {
  if (amount === null || amount === undefined) return '0.00'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return (num / 100).toFixed(2)
}

/**
 * 格式化金额为元（直接显示）
 * @param {number} amount - 金额（单位：元）
 * @returns {string}
 */
export function formatYuan(amount) {
  if (amount === null || amount === undefined) return '0.00'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toFixed(2)
}

/**
 * 格式化日期
 * @param {string|Date|number} date
 * @param {string} fmt - 格式，默认 'YYYY-MM-DD'
 * @returns {string}
 */
export function formatDate(date, fmt) {
  fmt = fmt || 'YYYY-MM-DD'
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return String(date)

  const o = {
    'M+': d.getMonth() + 1,
    'D+': d.getDate(),
    'h+': d.getHours(),
    'm+': d.getMinutes(),
    's+': d.getSeconds()
  }

  if (/(Y+)/.test(fmt)) {
    fmt = fmt.replace(RegExp.$1, String(d.getFullYear()).substr(4 - RegExp.$1.length))
  }

  for (const k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      fmt = fmt.replace(RegExp.$1, RegExp.$1.length === 1
        ? String(o[k])
        : ('00' + String(o[k])).substr(String(o[k]).length))
    }
  }

  return fmt
}

/**
 * 格式化手机号（脱敏显示）
 * @param {string} phone
 * @returns {string}
 */
export function formatPhone(phone) {
  if (!phone) return ''
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

/**
 * 格式化天数文本
 * @param {number} days - 正数=到期还有N天，负数=已过期N天，0=今天到期
 * @returns {string}
 */
export function formatDays(days) {
  if (days === undefined || days === null) return ''
  if (days < 0) return `已过期${Math.abs(days)}天`
  if (days === 0) return '今天到期'
  return `还有${days}天`
}

/**
 * 天数显示颜色
 * @param {number} days
 * @returns {string} CSS 颜色值
 */
export function getDaysColor(days) {
  if (days <= 0) return '#f56c6c'
  if (days <= 7) return '#e6a23c'
  return '#67c23a'
}
