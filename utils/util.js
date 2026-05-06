/**
 * AI养车门店管理系统 - 工具函数集合
 * 版本: 2.0
 * 
 * 包含: 时间格式化、空值安全处理、校验、脱敏、金额格式化、防抖
 * 使用: const util = require('../../utils/util')
 */

var app = getApp()

// ============================
// 时间格式化
// ============================

/**
 * 格式化时间为 YYYY-MM-DD
 * @param {Date|string|number} date 日期对象/时间戳/ISO字符串
 * @returns {string} YYYY-MM-DD
 */
function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = padZero(d.getMonth() + 1)
  const day = padZero(d.getDate())
  return `${y}-${m}-${day}`
}

/**
 * 格式化时间为 YYYY-MM-DD HH:mm:ss
 * @param {Date|string|number} date 日期对象/时间戳/ISO字符串
 * @returns {string} YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = padZero(d.getMonth() + 1)
  const day = padZero(d.getDate())
  const h = padZero(d.getHours())
  const min = padZero(d.getMinutes())
  const s = padZero(d.getSeconds())
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

/**
 * 兼容旧版 formatTime (YYYY/MM/DD HH:mm:ss)
 * @deprecated 建议使用 formatDateTime
 */
function formatTime(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = padZero(d.getMonth() + 1)
  const day = padZero(d.getDate())
  const h = padZero(d.getHours())
  const min = padZero(d.getMinutes())
  const s = padZero(d.getSeconds())
  return [y, m, day].join('/') + ' ' + [h, min, s].join(':')
}

/**
 * 格式化日期为中文星期
 * @param {Date|string|number} date
 * @returns {string} 如 "周一"、"周日"
 */
function formatWeekDay(date) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return weekDays[d.getDay()]
}

/**
 * 获取友好的时间描述
 * @param {Date|string|number} date
 * @returns {string} 如 "刚刚"、"5分钟前"、"昨天 14:30"
 */
function formatTimeAgo(date) {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayDiff = (today - targetDay) / 86400000

  if (dayDiff === 1) return '昨天 ' + padZero(d.getHours()) + ':' + padZero(d.getMinutes())
  if (dayDiff === 2) return '前天 ' + padZero(d.getHours()) + ':' + padZero(d.getMinutes())
  if (dayDiff < 7) return Math.floor(dayDiff) + '天前'
  return formatDate(d)
}

// ============================
// 空值安全处理
// ============================

/**
 * 安全取值 - 空值转默认文案
 * @param {*} val 原始值
 * @param {string} [fallback='无'] 默认值
 * @returns {string}
 */
function safeText(val, fallback) {
  if (val === undefined || val === null || val === '' || val === 'undefined' || val === 'null') {
    return fallback || '无'
  }
  return String(val)
}

/**
 * 安全取值 - 表单字段空值处理
 * @param {*} val
 * @param {string} [fallback='未填写']
 * @returns {string}
 */
function safeField(val, fallback) {
  return safeText(val, fallback || '未填写')
}

/**
 * 安全取值 - 检查项空值处理
 * @param {*} val
 * @param {string} [fallback='该项未检查']
 * @returns {string}
 */
function safeCheckItem(val, fallback) {
  return safeText(val, fallback || '该项未检查')
}

/**
 * 安全取数字
 * @param {*} val
 * @param {number} [fallback=0]
 * @returns {number}
 */
function safeNumber(val, fallback) {
  const n = Number(val)
  return isNaN(n) ? (fallback || 0) : n
}

/**
 * 批量安全填充对象
 * @param {Object} data 原始数据
 * @param {Object} rules 填充规则 { fieldName: '未填写' }
 * @returns {Object} 新对象（不修改原对象）
 */
function safeFill(data, rules) {
  if (!data || typeof data !== 'object') return data || {}
  const result = Object.assign({}, data)
  Object.keys(rules).forEach(key => {
    if (!result[key] && result[key] !== 0) {
      result[key] = rules[key]
    }
  })
  return result
}

// ============================
// 校验
// ============================

/**
 * 手机号校验
 * @param {string} phone
 * @returns {boolean}
 */
function isValidPhone(phone) {
  if (!phone) return false
  return /^1[3-9]\d{9}$/.test(String(phone).trim())
}

/**
 * 车牌号校验 - 支持7位(燃油车)和8位(新能源车)
 * @param {string} plate
 * @returns {boolean}
 */
function isValidPlate(plate) {
  if (!plate) return false
  const p = String(plate).trim().toUpperCase()
  // 7位: 省份简称(1) + 字母(1) + 5位字母数字
  const regular = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-Z0-9]{5}$/
  // 8位: 新能源车
  const newEnergy = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-Z0-9]{6}$/
  return regular.test(p) || newEnergy.test(p)
}

/**
 * 金额校验 - 非负数字
 * @param {*} amount
 * @returns {boolean}
 */
function isValidAmount(amount) {
  if (amount === '' || amount === undefined || amount === null) return false
  return !isNaN(Number(amount)) && Number(amount) >= 0
}

/**
 * 激活码格式校验
 * @param {string} code
 * @returns {boolean}
 */
function isValidActivationCode(code) {
  if (!code) return false
  return /^[A-Za-z0-9]{4,20}$/.test(String(code).trim())
}

// ============================
// 数据脱敏
// ============================

/**
 * 手机号脱敏
 * @param {string} phone 如 "13800138000"
 * @returns {string} 如 "138****8000"
 */
function maskPhone(phone) {
  if (!phone) return ''
  const p = String(phone).trim()
  if (p.length === 11) {
    return p.substring(0, 3) + '****' + p.substring(7)
  }
  if (p.length >= 7) {
    return p.substring(0, 3) + '****' + p.substring(p.length - 4)
  }
  return p
}

/**
 * 车牌号脱敏（保留前N后3，中间隐藏2位）
 * @param {string} plate 如 "桂D5D667"
 * @returns {string} 如 "桂D**667"
 */
function maskPlate(plate) {
  if (!plate) return ''
  const p = String(plate).trim()
  if (p.length <= 4) return p
  const keepFront = Math.max(p.length - 5, 1)
  return p.substring(0, keepFront) + '**' + p.substring(p.length - 3)
}

/**
 * 姓名脱敏（保留姓氏）
 * @param {string} name 如 "张先生"
 * @returns {string} 如 "张*"
 */
function maskName(name) {
  if (!name) return ''
  const n = String(name).trim()
  if (n.length <= 1) return n
  return n.charAt(0) + '*'.repeat(n.length - 1)
}

// ============================
// 金额格式化
// ============================

/**
 * 格式化金额 - 加千分位
 * @param {number|string} amount 如 12345.6
 * @returns {string} 如 "12,345.60"
 */
function formatMoney(amount) {
  const n = Number(amount)
  if (isNaN(n)) return '0.00'
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化金额 - 简洁版（无小数尾零）
 * @param {number|string} amount 如 12345.00
 * @returns {string} 如 "12,345"
 */
function formatMoneySimple(amount) {
  const n = Number(amount)
  if (isNaN(n)) return '0'
  const fixed = n.toFixed(2)
  return parseFloat(fixed).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

/**
 * 金额转中文大写（简易版，支持万以内）
 * @param {number} amount
 * @returns {string}
 */
function formatMoneyChinese(amount) {
  const n = Math.floor(Number(amount) * 100)
  if (isNaN(n)) return '零元'
  if (n === 0) return '零元'

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿']

  const intPart = Math.floor(n / 100)
  const decPart = n % 100

  let result = ''
  if (intPart > 0) {
    const intStr = String(intPart)
    const len = intStr.length
    for (let i = 0; i < len; i++) {
      const d = parseInt(intStr[i])
      const unitIdx = len - 1 - i
      if (d > 0) {
        result += digits[d] + units[unitIdx % 4]
      } else if (result.charAt(result.length - 1) !== '零') {
        result += '零'
      }
    }
    result = result.replace(/零+$/, '')
    result += '元'
  }

  if (decPart > 0) {
    const jiao = Math.floor(decPart / 10)
    const fen = decPart % 10
    if (jiao > 0) result += digits[jiao] + '角'
    if (fen > 0) result += digits[fen] + '分'
  } else {
    result += '整'
  }

  return result
}

// ============================
// 防抖 / 节流
// ============================

/**
 * 防抖函数
 * @param {Function} fn 目标函数
 * @param {number} [delay=300] 延迟毫秒数
 * @returns {Function} 防抖后的函数
 * 
 * 使用方式（Page中）:
 *   data: { searchTimer: null }
 *   onInput: util.debounce(function() { ... }, 300)
 *   
 * 或者手动管理:
 *   const timer = util.debounce(this.fetchData.bind(this), 500)
 *   this.setData({ searchTimer: timer })
 */
function debounce(fn, delay) {
  return function () {
    const context = this
    const args = arguments
    const d = delay || 300
    if (context && context.searchTimer) {
      clearTimeout(context.searchTimer)
      context.searchTimer = null
    }
    const timer = setTimeout(function () {
      fn.apply(context, args)
      if (context && context.setData) {
        context.setData({ searchTimer: null })
      }
    }, d)
    if (context && context.setData) {
      context.setData({ searchTimer: timer })
    }
  }
}

/**
 * 简易防抖 - 不依赖页面实例，返回可取消句柄
 * @param {Function} fn
 * @param {number} [delay=300]
 * @returns {Object} { run, cancel }
 */
function createDebounce(fn, delay) {
  let timer = null
  const d = delay || 300
  return {
    run: function () {
      const context = this
      const args = arguments
      if (timer) clearTimeout(timer)
      timer = setTimeout(function () {
        fn.apply(context, args)
        timer = null
      }, d)
    },
    cancel: function () {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}

/**
 * 节流函数
 * @param {Function} fn
 * @param {number} [interval=300]
 * @returns {Function}
 */
function throttle(fn, interval) {
  let lastTime = 0
  const gap = interval || 300
  return function () {
    const now = Date.now()
    if (now - lastTime >= gap) {
      lastTime = now
      fn.apply(this, arguments)
    }
  }
}

// ============================
// 数据库辅助
// ============================

/**
 * 构建模糊查询条件（RegExp）
 * @param {string} keyword 搜索关键词
 * @param {string} [field='plate'] 查询字段
 * @returns {Object} where 条件
 */
function buildFuzzyQuery(keyword, field) {
  if (!keyword || !keyword.trim()) return {}
  const f = field || 'plate'
  const db = app.db()
  return { [f]: db.RegExp({ regexp: keyword.trim(), options: 'i' }) }
}

/**
 * 构建多字段模糊查询（$or）
 * @param {string} keyword
 * @param {Array<string>} fields 字段列表
 * @returns {Object} where 条件
 */
function buildMultiFuzzyQuery(keyword, fields) {
  if (!keyword || !keyword.trim() || !fields || fields.length === 0) return {}
  const db = app.db()
  const kw = keyword.trim()
  const orConditions = fields.map(function (f) {
    var obj = {}
    obj[f] = db.RegExp({ regexp: kw, options: 'i' })
    return obj
  })
  return { $or: orConditions }
}

// ============================
// 内部工具
// ============================

/**
 * 数字补零
 * @param {number} n
 * @returns {string}
 */
function padZero(n) {
  n = Number(n)
  return n < 10 ? '0' + n : '' + n
}

// ============================
// 云函数调用助手
// ============================

/**
 * 调用 repair_main 聚合云函数（统一走云函数，不直接操作数据库）
 * @param {string} action action 名称
 * @param {Object} data 业务参数（自动注入 shopPhone）
 * @returns {Promise<Object>} 云函数返回结果 { code, msg, data }
 */
function callRepair(action, data) {
  var app = getApp()
  var cloud = app._resourceCloud || wx.cloud
  var shopInfo = wx.getStorageSync('shopInfo') || {}
  return new Promise(function (resolve, reject) {
    // ★ 自动注入通用参数：shopPhone + 身份标识
    // 小程序模式：clientOpenid（用于服务端 _checkShopAccess）
    // 多端模式：clientPhone（用于服务端 _validateWriteAccess 验证员工 status='active'）
    var baseParams = {
      action: action,
      shopPhone: app.getShopPhone(),
      clientOpenid: wx.getStorageSync('openid') || ''
    }
    // 多端模式 + 游客模式：注入 clientPhone 供服务端鉴权
    if (shopInfo.phone && (shopInfo._platform === 'multiend' || shopInfo.isGuest)) {
      baseParams.clientPhone = shopInfo.phone
    }
    // 兜底：全局检测为多端模式但缓存未标记时，也注入 clientPhone（防御性编程）
    if (!baseParams.clientPhone && getApp().globalData._isMultiEndMode && shopInfo.phone) {
      baseParams.clientPhone = shopInfo.phone
    }
    var params = Object.assign(baseParams, data || {})
    cloud.callFunction({
      name: 'repair_main',
      data: params,
      success: function (res) {
        console.log('[callRepair] 返回 res.result=', JSON.stringify(res.result))
        resolve(res.result)
      },
      fail: function (err) {
        console.error('[callRepair] 网络失败', err)
        reject(err)
      }
    })
  })
}

// ============================
// 导出
// ============================

module.exports = {
  // 时间格式化
  formatDate: formatDate,
  formatDateTime: formatDateTime,
  formatTime: formatTime,
  formatWeekDay: formatWeekDay,
  formatTimeAgo: formatTimeAgo,

  // 空值安全处理
  safeText: safeText,
  safeField: safeField,
  safeCheckItem: safeCheckItem,
  safeNumber: safeNumber,
  safeFill: safeFill,

  // 校验
  isValidPhone: isValidPhone,
  isValidPlate: isValidPlate,
  isValidAmount: isValidAmount,
  isValidActivationCode: isValidActivationCode,

  // 数据脱敏
  maskPhone: maskPhone,
  maskPlate: maskPlate,
  maskName: maskName,

  // 金额格式化
  formatMoney: formatMoney,
  formatMoneySimple: formatMoneySimple,
  formatMoneyChinese: formatMoneyChinese,

  // 防抖/节流
  debounce: debounce,
  createDebounce: createDebounce,
  throttle: throttle,

  // 数据库辅助
  buildFuzzyQuery: buildFuzzyQuery,
  buildMultiFuzzyQuery: buildMultiFuzzyQuery,

  // 云函数调用
  callRepair: callRepair
}
