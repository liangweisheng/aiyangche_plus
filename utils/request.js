/**
 * utils/request.js
 * 统一请求基础设施层
 *
 * 解决的系统性问题：
 * 1. loading 状态不对等（showLoading 后异常路径未 hideLoading）
 * 2. 重复提交（用户连点导致同一请求发送多次）
 * 3. 竞态条件（快速切换 tab/页面导致旧请求覆盖新数据）
 * 4. 错误处理不统一（有的吞没、有的只日志、有的卡 loading）
 * 5. 每个页面重复写 showLoading/hideLoading/checkCode/toast
 *
 * 设计原则：
 * - 纯增量，不修改 util.callRepair 和任何已有代码
 * - 新页面用 request()，旧页面逐步迁移
 * - 不违反 v4.0.0 红线（已有 action 入参/出参/行为不变）
 *
 * 用法示例：
 *   var request = require('../../utils/request')
 *
 *   // 最简用法（自动 loading + 错误提示 + 防重）
 *   request.call(this, 'createOrder', { plate: '桂A12345' })
 *     .then(function(res) { ... })
 *     .catch(function(err) { ... })
 *
 *   // 自定义配置
 *   request.call(this, 'createOrder', data, {
 *     loading: false,          // 不显示 loading
 *     loadingText: '提交中',   // 自定义 loading 文案
 *     dedup: false,            // 不防重复（允许并发请求）
 *     impact: false,           // 不做竞态保护（后台静默请求）
 *     silent: true             // 静默模式（错误不弹 toast，由调用方自行处理）
 *   })
 */

var util = require('./util')
var constants = require('./constants')

// ===========================
// 内部状态
// ===========================

/** 全局请求版本号（用于竞态保护） */
var _globalReqId = 0

// ===========================
// 错误类型常量
// ===========================

/** 请求被防重拦截 */
var ERR_DUPLICATE = 'DUPLICATE'

/** 请求因竞态被丢弃 */
var ERR_STALE = 'STALE'

/** 业务错误（云函数返回 code !== 0） */
var ERR_BIZ = 'BIZ'

/** 网络错误 */
var ERR_NETWORK = 'NETWORK'

/** 超时错误 */
var ERR_TIMEOUT = 'TIMEOUT'

// ===========================
// RequestError
// ===========================

/**
 * 统一请求错误对象
 * @param {string} type 错误类型（ERR_DUPLICATE / ERR_STALE / ERR_BIZ / ERR_NETWORK / ERR_TIMEOUT）
 * @param {string} message 错误信息
 * @param {Object} [detail] 附加信息（如云函数返回的完整结果）
 */
function RequestError(type, message, detail) {
  this.type = type
  this.message = message || ''
  this.detail = detail || null
  this.isRequestError = true
}
RequestError.prototype = Object.create(Error.prototype)
RequestError.prototype.constructor = RequestError

/**
 * 判断是否为 RequestError 实例
 * @param {*} err
 * @returns {boolean}
 */
function isRequestError(err) {
  return !!(err && err.isRequestError)
}

// ===========================
// 核心方法
// ===========================

/**
 * 统一云函数请求（替代裸调 util.callRepair）
 *
 * 自动处理：
 * - Loading 状态管理（show/hide 配对，异常路径兜底）
 * - 防重复提交（同页面同一时间只允许一个请求）
 * - 竞态保护（页面切换/重新加载时丢弃旧请求结果）
 * - 统一业务错误处理（code !== 0 自动 toast）
 * - 统一网络错误处理（超时/断网自动 toast）
 * - 超时保护（默认 constants.CLOUD_TIMEOUT_MS）
 *
 * @param {Object} page - Page 实例（this）
 * @param {string} action - 云函数 action
 * @param {Object} [data] - 业务参数
 * @param {Object} [options] - 可选配置
 * @param {boolean} [options.loading=true] - 是否显示 loading
 * @param {string} [options.loadingText='加载中...'] - loading 文案
 * @param {boolean} [options.dedup=true] - 是否防重复提交
 * @param {boolean} [options.impact=true] - 是否需要竞态保护
 * @param {boolean} [options.silent=false] - 静默模式（错误不弹 toast）
 * @param {number} [options.timeout] - 超时时间(ms)，默认 constants.CLOUD_TIMEOUT_MS
 * @returns {Promise<Object>} 成功时 resolve 云函数返回的 data 字段
 */
function call(page, action, data, options) {
  var opts = Object.assign({
    loading: true,
    loadingText: '加载中...',
    dedup: true,
    impact: true,
    silent: false,
    timeout: constants.CLOUD_TIMEOUT_MS
  }, options)

  // 1. 防重复提交
  if (opts.dedup && page._requesting) {
    if (!opts.silent) {
      wx.showToast({ title: '请稍候再试', icon: 'none', duration: 1500 })
    }
    return Promise.reject(new RequestError(ERR_DUPLICATE, '请求进行中，请稍候'))
  }

  // 2. 竞态版本号
  var reqId = ++_globalReqId
  if (opts.impact) {
    page._lastReqId = reqId
  }

  // 3. Loading 管理
  if (opts.loading) {
    wx.showLoading({ title: opts.loadingText, mask: true })
  }
  if (opts.dedup) {
    page._requesting = true
  }

  // 4. 超时保护
  var timeoutMs = opts.timeout
  var timeoutTimer = null
  var timeoutReject = null
  var timeoutPromise = new Promise(function (_, reject) {
    timeoutReject = reject
    timeoutTimer = setTimeout(function () {
      reject(new RequestError(ERR_TIMEOUT, '请求超时，请重试'))
    }, timeoutMs)
  })

  // 5. 执行云函数调用
  var callPromise = util.callRepair(action, data)

  // 6. 合并超时和业务请求（Promise.race）
  return Promise.race([callPromise, timeoutPromise])
    .then(function (result) {
      // 清除超时定时器
      clearTimeout(timeoutTimer)
      timeoutTimer = null

      // 6a. 竞态检查
      if (opts.impact && page._lastReqId !== reqId) {
        // 被更新的请求取代，静默丢弃
        return Promise.reject(new RequestError(ERR_STALE, '请求已过期'))
      }

      // 6b. 业务错误检查
      if (!result || result.code !== 0) {
        var errMsg = (result && result.msg) || '操作失败'
        if (!opts.silent) {
          wx.showToast({ title: errMsg, icon: 'none', duration: 2000 })
        }
        return Promise.reject(new RequestError(ERR_BIZ, errMsg, result))
      }

      // 6c. 成功 - 返回完整结果（兼容已有代码取 res.data / res.msg 等字段）
      return result
    })
    .catch(function (err) {
      // 清除超时定时器（可能已被清除，但 clearTimeout 是幂等的）
      clearTimeout(timeoutTimer)
      timeoutTimer = null

      // 如果已经是 RequestError，直接传递
      if (isRequestError(err)) {
        // 竞态丢弃不需要 toast
        if (err.type === ERR_STALE) {
          // 静默丢弃
        } else if (err.type === ERR_TIMEOUT && !opts.silent) {
          wx.showToast({ title: '请求超时，请重试', icon: 'none', duration: 2000 })
        } else if (err.type === ERR_DUPLICATE) {
          // 已在前面 toast 过
        }
        // ERR_BIZ 已在 then 中 toast 过
        return Promise.reject(err)
      }

      // 原始网络错误（wx.cloud.callFunction fail）
      var errMessage = (err && err.errMsg) || ''
      if (!opts.silent) {
        if (errMessage.indexOf('timeout') > -1 || errMessage.indexOf('time out') > -1) {
          wx.showToast({ title: '网络超时，请重试', icon: 'none', duration: 2000 })
        } else if (errMessage.indexOf('network') > -1 || errMessage.indexOf('-1') > -1) {
          wx.showToast({ title: '网络异常，请检查网络', icon: 'none', duration: 2000 })
        } else {
          wx.showToast({ title: '操作失败，请重试', icon: 'none', duration: 2000 })
        }
      }
      return Promise.reject(new RequestError(ERR_NETWORK, errMessage || '网络异常', err))
    })
    .finally(function () {
      // 7. 无论成功/失败，都清理 loading 和防重标记
      if (opts.loading) {
        wx.hideLoading()
      }
      if (opts.dedup) {
        page._requesting = false
      }
    })
}

// ===========================
// 便捷方法
// ===========================

/**
 * 静默请求（不显示 loading、不弹错误 toast、不做竞态保护）
 * 适用于：后台静默同步、非关键数据预加载、fire-and-forget 操作
 *
 * @param {string} action
 * @param {Object} [data]
 * @param {Object} [options] 可选覆盖
 * @returns {Promise<Object>}
 *
 * 用法：request.silent('updateOpenid', { docId: 'xxx' }).catch(function() {})
 */
function silent(action, data, options) {
  // silent 需要一个 page 实例来做 dedup/impact，这里用空对象
  // 因为 silent 模式本身就不需要这些保护
  var fakePage = { _requesting: false, _lastReqId: 0 }
  var opts = Object.assign({
    loading: false,
    dedup: false,
    impact: false,
    silent: true
  }, options)
  return call(fakePage, action, data, opts)
}

/**
 * 快速检查请求是否进行中
 * @param {Object} page - Page 实例
 * @returns {boolean}
 */
function isRequesting(page) {
  return !!(page && page._requesting)
}

/**
 * 重置页面请求状态（页面 onUnload/onHide 时调用，防止内存泄漏）
 * @param {Object} page - Page 实例
 */
function resetPageState(page) {
  if (!page) return
  page._requesting = false
  page._lastReqId = 0
}

// ===========================
// 导出
// ===========================

module.exports = {
  // 核心方法
  call: call,

  // 便捷方法
  silent: silent,
  isRequesting: isRequesting,
  resetPageState: resetPageState,

  // 错误类型常量（供调用方判断）
  ERR_DUPLICATE: ERR_DUPLICATE,
  ERR_STALE: ERR_STALE,
  ERR_BIZ: ERR_BIZ,
  ERR_NETWORK: ERR_NETWORK,
  ERR_TIMEOUT: ERR_TIMEOUT,

  // 工具方法
  isRequestError: isRequestError,
  RequestError: RequestError
}
