// app.js
// AI养车门店管理系统 - 全局入口
// v5.1.0: 多端应用模式支持（小程序 + Android/iOS）

const util = require('./utils/util')
const constants = require('./utils/constants')

// 跨账号资源共享配置（资源方小程序的信息）
// 小程序端通过跨账号访问；多端直接用资源方身份连接云环境
var RESOURCE_APPID = 'wxb1c736174ede330c'
var RESOURCE_ENV = 'cloud1-2gwoxtay6a4d8181'

// 缓存跨账号数据库实例和初始化 Promise
var _resourceDb = null
var _cloudReady = false
var _cloudInitPromise = null

// ===========================
// 多端平台检测
// ===========================

/**
 * 检测当前运行环境是否为 Donut 多端模式（Android/iOS App）
 * @returns {boolean}
 */
function _isMultiEndMode() {
  try {
    // 方式1（最可靠）：Donut 框架注入的 miniapp 全局对象
    if (typeof miniapp !== 'undefined' && miniapp) {
      console.log('[_isMultiEndMode] 检测到 miniapp 全局对象 → 多端模式')
      return true
    }

    var systemInfo = wx.getSystemInfoSync()

    // 方式2：检查系统信息中的多端标记
    if (systemInfo && systemInfo.miniappVersion) {
      console.log('[_isMultiEndMode] 检测到 miniappVersion → 多端模式')
      return true
    }

    // 方式3（修正版）：排除法 - 真正的微信小程序一定有完整的环境信息
    if (typeof __wxConfig !== 'undefined') {
      // ★ 开发者工具（含真机调试）platform 一定是 "devtools"

      // ★ 核心判断（修正版）：使用 getAccountInfoSync 区分微信环境 vs 多端应用
      // 官方文档：多端应用独有 host / miniapp 对象，微信小程序无此字段
      var accountInfo = null
      try {
        accountInfo = wx.getAccountInfoSync()
      } catch(e) {}

      var isRealDevice = systemInfo.platform === 'ios' || systemInfo.platform === 'android'

      if (isRealDevice) {
        if (accountInfo) {
          // ★ 方式1：检测 host 对象（多端应用独有字段，100%可靠）
          if (accountInfo.host && (accountInfo.host.miniappId || accountInfo.host.moduleId)) {
            return true
          }
          // ★ 方式2：检测 miniapp 对象（新版SDK补充）
          if (accountInfo.miniapp && accountInfo.miniapp.miniappId) {
            return true
          }
          // ★ 方式3：有有效的小程序账号信息 → 微信环境（含真机调试+正式发布）
          if (accountInfo.miniProgram && accountInfo.miniProgram.appId 
              && accountInfo.miniProgram.appId !== '<Undefined>') {
            return false
          }
        }
      // 兜底：真机但无法获取账号信息 → 保守判定为小程序（安全侧）
      return false
      }
    }

    // 兜底：默认返回 false（保持小程序原有行为）
    return false
  } catch (e) {
    console.warn('[_isMultiEndMode] 检测异常:', e)
    return false
  }
}

// 缓存平台检测结果（启动时一次性确定）
var _platformDetected = null

App({
  globalData: {},

  onLaunch() {
    var app = this

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    // ★ 多端平台检测（启动时一次性确定，后续不再重复判断）
    _platformDetected = _isMultiEndMode()
    app.globalData._isMultiEndMode = _platformDetected

    if (_platformDetected) {
      // ====== 多端模式：必须显式指定 AppID 和环境ID ======
      // 官方要求：非小程序端使用云开发时需在 cloud.init 时指定 appid 和 envid
      // 使用资源方的 AppID + 环境（数据都在这个环境里）
      wx.cloud.init({
        appid: RESOURCE_APPID,
        envid: RESOURCE_ENV,
        traceUser: true
      })
      // 多端模式下直接使用 wx.cloud.database()，不需要跨账号
      _resourceDb = wx.cloud.database()
      app._resourceCloud = wx.cloud
      _cloudReady = true
    } else {
      // ====== 小程序模式（IDE/多端项目也需传 appid）======
      wx.cloud.init({
        appid: RESOURCE_APPID,
        envid: RESOURCE_ENV,
        traceUser: true
      })
      // 初始化跨账号资源共享
      this._initResourceCloud()
    }

    this.globalData = this.globalData || {}

    // 隐私合规：首次启动检查隐私授权
    this._checkPrivacyAgreement()

    // 版本更新检测
    this._checkAppUpdate()

    // 全局网络状态监听
    this._initNetworkWatcher()
  },

  /**
   * 初始化跨账号资源共享（通过 cloudbase_auth 鉴权）
   * 资源方需部署 cloudbase_auth 云函数并配置跨环境共享
   * ★ 多端模式下不执行此方法（直接使用资源方身份连接云环境）
   */
  _initResourceCloud() {
    // 多端模式已在 onLaunch 中直接初始化，无需跨账号
    if (_platformDetected) {
      return
    }

    var app = this
    _cloudInitPromise = new Promise(function (resolve, reject) {
      app._resourceCloud = new wx.cloud.Cloud({
        resourceAppid: RESOURCE_APPID,
        resourceEnv: RESOURCE_ENV
      })
      app._resourceCloud.init().then(function () {
        _resourceDb = app._resourceCloud.database()
        _cloudReady = true
        resolve()
      }).catch(function (err) {
        console.error('资源方云环境初始化失败', err)
        _cloudReady = false
        _resourceDb = null
        reject(err)
        // ★ 延迟提示用户（等 app.onLaunch 完成后再弹）
        setTimeout(function () {
          wx.showToast({
            title: '网络异常，请检查网络后重试',
            icon: 'none',
            duration: 3000
          })
        }, 1500)
      })
    })
  },

  /**
   * 获取跨账号数据库实例
   * ★ 多端模式：直接返回 wx.cloud.database()（已在 onLaunch 中用资源方身份初始化）
   * 小程序模式：返回跨账号资源方的数据库实例
   * @returns {Object|null} wx.cloud.Database 实例，未就绪时返回 null
   */
  db: function () {
    // ★ 强制使用资源方云环境，无 fallback
    if (!_cloudReady || !_resourceDb) {
      console.error('[db] 资源方云环境未就绪，无法连接服务器')
      return null
    }
    return _resourceDb
  },

  /**
   * 云端是否已就绪（跨账号初始化完成）
   * @returns {boolean}
   */
  isCloudReady: function () {
    return _cloudReady
  },

  /**
   * 等待云端就绪的 Promise
   * @returns {Promise}
   */
  whenCloudReady: function () {
    var app = this
    if (_cloudReady) return Promise.resolve()
    return new Promise(function (resolve) {
      var timer = setInterval(function () {
        if (_cloudReady) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
      // 超时保护 10 秒
      setTimeout(function () {
        clearInterval(timer)
        resolve()
      }, 10000)
    })
  },

  // ===========================
  // 云函数调用便捷方法
  // ===========================

  /**
   * 调用云函数（封装 util.callRepair，供页面/组件直接使用）
   * ★ 多端模式：直接使用 wx.cloud.callFunction（已在 onLaunch 中初始化为资源方身份）
   * 小程序模式：优先使用跨账号实例 _resourceCloud
   * @param {string} name 云函数名
   * @param {Object} data 数据
   * @returns {Promise<Object>}
   */
  callFunction: function (name, data) {
    var app = this
    // ★ 强制使用资源方云环境，无法连接则返回 rejected Promise
    if (!_cloudReady || !this._resourceCloud) {
      console.error('[callFunction] 资源方云环境未就绪，无法调用云函数:', name)
      return Promise.reject(new Error('网络异常，无法连接服务器'))
    }

    var cloud = this._resourceCloud
    return new Promise(function (resolve, reject) {
      cloud.callFunction({
        name: name,
        data: data || {},
        success: function (res) {
          // ★ 统一鉴权拦截：-403 = 账号已失效/被删除，强制登出跳转登录页
          var result = res.result || {}
          if (result.code === -403) {
            console.log('[AUTH] 收到 -403，强制登出:', result.msg)
            wx.showToast({ title: result.msg || '账号已失效', icon: 'none', duration: 2000 })
            setTimeout(function () { app._forceLogout() }, 1500)
            return reject(new Error('AUTH:-403 ' + (result.msg || '账号已失效')))
          }
          resolve(result)
        },
        fail: function (err) { reject(err) }
      })
    })
  },

  // ===========================
  // 版本更新检测
  // ===========================

  /**
   * 小程序版本更新检测
   * 当新版本下载完成时，弹窗提示用户重启应用
   */
  _checkAppUpdate() {
    if (!wx.getUpdateManager) return
    var updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(function () {
      wx.showModal({
        title: '发现新版本',
        content: '新版本已就绪，是否重启应用以使用最新功能？',
        confirmText: '立即重启',
        success: function (res) {
          if (res.confirm) updateManager.applyUpdate()
        }
      })
    })
    updateManager.onUpdateFailed(function () {
      console.warn('[update] 新版本下载失败')
    })
  },

  // ===========================
  // 网络状态监听
  // ===========================

  /**
   * 全局网络状态监听：断网时提醒用户，恢复时自动消失
   */
  _initNetworkWatcher() {
    var app = this
    wx.onNetworkStatusChange(function (res) {
      if (!res.isConnected) {
        wx.showToast({ title: '网络已断开，请检查网络', icon: 'none', duration: 3000 })
      }
    })
  },

  // ===========================
  // 隐私合规
  // ===========================

  /**
   * 启动流程：不再因隐私未同意而拦截
   * - 老用户（openid 有绑定）：无感进入 dashboard
   * - 新用户（openid 无记录）：默认进入游客模式
   * - 隐私同意延迟到用户主动登录/注册时才要求（welcome 页弹窗）
   */
  _checkPrivacyAgreement() {
    var app = this
    // 等待跨账号云端初始化完成后再自动登录
    // 将 Promise 暴露出去，供 splash 页面监听完成状态
    if (_cloudInitPromise) {
      app.autoLoginPromise = _cloudInitPromise.then(function () {
        return app._autoLogin()
      }).catch(function () {
        return app._autoLogin()
      })
    } else {
      app.autoLoginPromise = app._autoLogin()
    }
  },

  // ===========================
  // 自动登录（openid 无感进入）
  // ===========================

  /**
   * 自动登录流程：
   *
   * ★ 多端模式（Android/iOS）：
   *   1. 跳过 openid 获取（多端无法获取微信openid）
   *   2. 优先恢复本地缓存 shopInfo（类似"记住密码"）
   *   3. 有缓存 → 直接进入系统
   *   4. 无缓存 → 跳转登录页（手机号+门店码）
   *
   * 小程序模式：
   *   1. 静默获取 openid
   *   2. 用 openid 查 DB 获取门店信息
   *   3. 有记录 → 恢复本地缓存 → 无感进入首页
   *   4. 无记录 → 进入 welcome 登录页
   */
  _autoLogin() {
    var app = this

    // ★ 多端模式优先判断（必须在"快速信任缓存"之前）
    // 原因：防止残留的错误缓存被直接信任恢复
    if (_platformDetected) {
      return app._autoLoginMultiEnd()
    }

    // 如果本地已有非游客的有效 shopInfo（小程序模式才走此快速路径）
    var cachedShopInfo = wx.getStorageSync('shopInfo') || {}
    // ★ 新增：验证缓存来源标记（防止多端残留缓存被误恢复）
    var isCacheFromMultiEnd = cachedShopInfo._platform === 'multiend'
    if (
      !isCacheFromMultiEnd &&
      cachedShopInfo.phone &&
      !cachedShopInfo.isGuest &&
      !wx.getStorageSync('isGuestMode')
    ) {
      app.globalData.shopName = cachedShopInfo.name || ''
      app.globalData.shopPhone = cachedShopInfo.shopPhone || cachedShopInfo.phone || ''
      app.globalData.shopInfo = cachedShopInfo
      // 后台静默同步云端记录 + 验证员工状态（不阻塞进入）
      app.getOpenId().then(function (openid) {
        if (openid) {
          // ★ 新增：验证员工账号是否仍有效（被删除员工将被拦截）
          app._validateMiniProgramCache(cachedShopInfo).catch(function() {
            console.warn('[_autoLogin] 员工账号验证失败，清除缓存并切换游客模式')
            wx.showModal({
              title: '账号已失效',
              content: '您的登录状态已失效，将切换为游客模式浏览',
              showCancel: false,
              confirmText: '我知道了',
              success: function() {
                app._forceLogoutAndEnterGuest()
              }
            })
          })
          // 原有：后台同步云端记录
          app._loadShopByOpenid(openid)
        }
      })
      return Promise.resolve()
    }

    // ====== 小程序原有逻辑 ↓=====
    return app.getOpenId().then(function (openid) {
      if (!openid) {
        // openid 获取失败 → 进入游客模式
        return app._enterGuestMode()
      }

      // 确保跨账号云环境已就绪后再查询 DB
      return app.whenCloudReady().then(function () {
        if (!app.db()) {
          console.error('[_autoLogin] 云环境就绪但 db() 仍为 null，进入游客模式')
          return app._enterGuestMode()
        }
        return app._loadShopByOpenid(openid)
      })
    })
  },

  /**
   * 多端模式自动登录（Android/iOS）
   * 不依赖 openid，通过本地缓存恢复或引导手动登录
   * @returns {Promise}
   */
  _autoLoginMultiEnd() {
    var app = this
    console.log('[_autoLoginMultiEnd] 进入多端登录流程')

    // 尝试从本地缓存恢复（用户之前已登录过）
    var cachedShopInfo = wx.getStorageSync('shopInfo') || {}

    // ★ 新增：验证缓存来源标记（只恢复多端模式自己写入的缓存）
    var cachePlatform = cachedShopInfo._platform || 'unknown'
    console.log('[_autoLoginMultiEnd] 缓存检查:', {
      hasPhone: !!cachedShopInfo.phone,
      isGuest: cachedShopInfo.isGuest,
      isGuestMode: !!wx.getStorageSync('isGuestMode'),
      cachePlatform: cachePlatform
    })

    if (
      cachedShopInfo.phone &&
      !cachedShopInfo.isGuest &&
      !wx.getStorageSync('isGuestMode') &&
      (cachePlatform === 'multiend' || cachePlatform === 'unknown')
    ) {
      // 有有效缓存 → 先验证缓存是否仍有效（同步阻塞式）
      console.log('[_autoLoginMultiEnd] 检测到本地缓存, 开始验证身份... name:', cachedShopInfo.name, ', phone:', cachedShopInfo.phone)
      return app._validateMultiEndCache(cachedShopInfo).then(function() {
        // 验证通过 → 恢复全局状态
        app._loadGlobalShopInfo()
        console.log('[_autoLoginMultiEnd] 缓存验证通过，已恢复登录状态')
        return Promise.resolve()
      }).catch(function(err) {
        // 验证失败 → 清除缓存 + 跳转登录页
        console.warn('[_autoLoginMultiEnd] 缓存验证失败:', err && err.message || err)
        wx.removeStorageSync('shopInfo')
        app._goWelcome('login')
        return Promise.reject(new Error('CACHE_INVALID'))
      })
    }

    // ★ 新增：检测到小程序模式残留缓存，输出警告并忽略
    if (cachedShopInfo.phone && cachePlatform === 'miniprogram') {
      console.warn('[_autoLoginMultiEnd] ⚠️ 检测到小程序模式残留缓存(name=' +
        cachedShopInfo.name + ', phone=' + cachedShopInfo.phone + ')，已忽略')
    }

    // 无有效缓存 → 跳转到登录页（手机号+门店码）
    console.log('[_autoLoginMultiEnd] 无有效缓存，跳转登录页')
    app._goWelcome('login')
    return Promise.resolve()
  },

  /**
   * 多端模式：验证本地缓存的 phone+shopCode 是否仍有效（同步阻塞式）
   * 同时检查管理员和员工账号状态，被删除员工(status='removed')将被拦截
   * @param {Object} cachedShopInfo 本地缓存的门店信息
   * @returns {Promise} 验证通过 resolve，失败 reject
   */
  _validateMultiEndCache(cachedShopInfo) {
    var app = this
    var phone = cachedShopInfo.phone || ''
    var shopCode = cachedShopInfo.shopCode || ''
    if (!phone || !shopCode) return Promise.reject(new Error('缺少必要参数'))

    var db = app.db()
    if (!db) return Promise.reject(new Error('数据库不可用'))

    // 同时查询管理员记录和员工记录
    return Promise.all([
      db.collection('repair_activationCodes')
        .where({ type: 'free', phone: phone, shopCode: shopCode })
        .limit(1).get(),
      db.collection('repair_activationCodes')
        .where({ type: 'staff', phone: phone, shopCode: shopCode, status: 'active' })
        .limit(1).get()
    ]).then(function(results) {
      var adminRecord = results[0].data && results[0].data.length > 0 ? results[0].data[0] : null
      var staffRecord = results[1].data && results[1].data.length > 0 ? results[1].data[0] : null

      if (adminRecord) {
        console.log('[_validateMultiEndCache] ✓ 管理员账号有效:', phone)
        return Promise.resolve()
      }
      if (staffRecord) {
        console.log('[_validateMultiEndCache] ✓ 员工账号有效:', phone)
        return Promise.resolve()
      }

      // 都查不到 → 账号已失效或被删除
      console.warn('[_validateMultiEndCache] ✗ 账号已失效，phone:', phone)
      return Promise.reject(new Error('账号已失效，请重新登录'))
    }).catch(function(err) {
      if (err.message && err.message.indexOf('账号') >= 0) {
        return Promise.reject(err)  // 业务错误，向上抛出
      }
      console.error('[_validateMultiEndCache] 验证请求异常:', err)
      return Promise.reject(new Error('网络错误，请重试'))
    })
  },

  /**
   * 小程序模式：验证缓存的账号在云端是否仍有效
   * 管理员验证 openid 匹配，员工验证 staffOpenid + status
   * 特殊场景：新增员工(newAccount=true)尚未完成首次绑定时放行
   * @param {Object} cachedShopInfo 本地缓存的门店信息
   * @returns {Promise} 验证通过 resolve，失败 reject
   */
  _validateMiniProgramCache: function(cachedShopInfo) {
    var app = this

    // 1. 必须有 openid
    var openid = cachedShopInfo.openid || ''
    if (!openid) {
      console.warn('[_validateMiniProgramCache] ✗ 无 openid，缓存异常')
      return Promise.reject(new Error('NO_OPENID'))
    }

    // 2. 判断账号类型
    var isAdmin = !!(cachedShopInfo.openid && !cachedShopInfo.addedBy && !cachedShopInfo._ownerPhone)

    // 3. db() 不可用时放行（网络异常不阻塞用户）
    var db = app.db()
    if (!db) {
      console.warn('[_validateMiniProgramCache] db() 不可用，跳过验证')
      return Promise.resolve()
    }

    if (isAdmin) {
      // ====== 管理员验证：查询 type='free' + openid 匹配 ======
      console.log('[_validateMiniProgramCache] 验证管理员:', openid)
      return db.collection('repair_activationCodes')
        .where({ type: 'free', openid: openid })
        .limit(1)
        .get()
        .then(function(res) {
          if (res.data && res.data.length > 0) {
            console.log('[_validateMiniProgramCache] ✓ 管理员有效')
            return Promise.resolve()
          }
          console.warn('[_validateMiniProgramCache] ✗ 管理员云端无匹配记录')
          return Promise.reject(new Error('ACCOUNT_INVALID'))
        })
        .catch(function(err) {
          if (err.message === 'ACCOUNT_INVALID') return Promise.reject(err)
          console.error('[_validateMiniProgramCache] 验证异常:', err)
          return Promise.resolve()
        })
    } else {
      // ====== 员工验证：单层查询 + newAccount 标记 ======
      console.log('[_validateMiniProgramCache] 验证员工, openid:', openid)
      return db.collection('repair_activationCodes')
        .where({ staffOpenid: openid, status: 'active' })
        .limit(1)
        .get()
        .then(function(res) {
          if (res.data && res.data.length > 0) {
            var record = res.data[0]
            // 检查是否为新增员工(尚未完成首次登录绑定)
            if (record.newAccount === true) {
              console.log('[_validateMiniProgramCache] ✓ 员工(newAccount=true), 待绑定, phone:', record.phone)
              return Promise.resolve()
            }
            console.log('[_validateMiniProgramCache] ✓ 员工有效(staffOpenid):', openid)
            return Promise.resolve()
          }
          console.warn('[_validateMiniProgramCache] ✗ 员工账号失效, openid:', openid)
          return Promise.reject(new Error('ACCOUNT_INVALID'))
        })
        .catch(function(err) {
          if (err.message === 'ACCOUNT_INVALID' || err.message === 'NO_OPENID') {
            return Promise.reject(err)
          }
          console.error('[_validateMiniProgramCache] 员工验证异常:', err)
          return Promise.resolve()
        })
    }
  },

  /**
   * 通过 openid 查询云数据库获取门店信息
   * @param {string} openid
   */
  _loadShopByOpenid(openid) {
    var app = this
    var db = this.db()
    if (!db) {
      console.error('[_loadShopByOpenid] db() 为 null，无法查询门店信息')
      return Promise.resolve()
    }

    // v4.0.0：员工记录 type='staff'，管理员记录 type='free'，需两种都查
    return Promise.all([
      db.collection('repair_activationCodes')
        .where({ type: 'free', openid: openid })
        .orderBy('createTime', 'desc').limit(1).get(),
      db.collection('repair_activationCodes')
        .where({ type: 'staff', staffOpenid: openid, status: 'active' })
        .orderBy('addedTime', 'desc').limit(1).get()
    ]).then(function (results) {
      var record = null
      // 优先取管理员记录，其次取员工记录
      if (results[0].data && results[0].data.length > 0) {
        record = results[0].data[0]
      } else if (results[1].data && results[1].data.length > 0) {
        record = results[1].data[0]
      }

      if (record) {
        // 员工记录没有门店名称和Pro字段，需要通过 shopPhone 反查店主记录补全
        if (record.type === 'staff') {
          return app._enrichStaffRecord(record).then(function (enriched) {
            app._restoreShopInfo(enriched)
          })
        }
        app._restoreShopInfo(record)
      } else {
        // 查不到记录时，检查本地是否已有非游客状态
        var localShopInfo = wx.getStorageSync('shopInfo') || {}
        if (localShopInfo.phone && !localShopInfo.isGuest && !wx.getStorageSync('isGuestMode')) {
          // 本地有缓存但云端无记录 → 可能是员工被删除/移除，清除缓存+切换游客模式
          console.warn('[_loadShopByOpenid] 云端无匹配记录，判定为失效账号')
          wx.showModal({
            title: '账号已失效',
            content: '您的账号已被移除，将切换为游客模式',
            showCancel: false,
            confirmText: '我知道了',
            success: function() {
              app._forceLogoutAndEnterGuest()
            }
          })
        } else {
          return app._enterGuestMode()
        }
      }
    }).catch(function (err) {
      console.error('查询门店信息失败', err)
      var shopInfo = wx.getStorageSync('shopInfo') || {}
      if (shopInfo && shopInfo.phone && !shopInfo.isGuest) {
        app._loadGlobalShopInfo()
      } else {
        return app._enterGuestMode()
      }
    })
  },

  /**
   * 员工记录反查店主信息，补全门店名称和Pro状态字段
   * @param {Object} staffRecord 员工记录（type='staff'）
   * @returns {Promise<Object>} 合并后的记录（员工身份字段 + 店主的name/code/expireTime等）
   */
  _enrichStaffRecord(staffRecord) {
    var app = this
    var ownerPhone = staffRecord.shopPhone || ''
    if (!ownerPhone) {
      return Promise.resolve(staffRecord)
    }
    var db = this.db()
    return db.collection('repair_activationCodes')
      .where({ type: 'free', phone: ownerPhone })
      .field({ name: true, shopCode: true, code: true, expireTime: true, createTime: true })
      .limit(1).get()
      .then(function (res) {
        var owner = res.data && res.data[0]
        if (!owner) return staffRecord
        // 将店主的门店名称和Pro字段合并到员工记录上，保留员工的身份字段
        var enriched = Object.assign({}, staffRecord)
        enriched._ownerName = owner.name || ''
        enriched._ownerShopCode = owner.shopCode || ''
        enriched._ownerCode = owner.code || ''
        enriched._ownerExpireTime = owner.expireTime || ''
        return enriched
      }).catch(function (err) {
        console.error('[_enrichStaffRecord] 反查店主信息失败，降级使用原始记录', err)
        return staffRecord
      })
  },

  /**
   * 从云数据库记录恢复本地缓存并更新 Pro 状态
   * @param {Object} record 云数据库记录（员工记录经过 _enrichStaffRecord 合并后会有 _ownerXxx 字段）
   */
  _restoreShopInfo(record) {
    var isStaff = !!(record.addedBy || record._ownerPhone)
    var shopName = record._ownerName || record.name || ''
    var shopPhone = record.shopPhone || record.phone || ''

    var shopInfo = {
      name: shopName,
      phone: isStaff ? (record.phone || '') : (shopPhone),       // 修复：员工显示本人phone
      openid: record.openid || '',
      staffOpenid: record.staffOpenid || '',    // 修复：员工自动登录时丢失 staffOpenid
      addedBy: record.addedBy || '',              // 修复：员工记录的添加人信息
      shopCode: record._ownerShopCode || record.shopCode || '',
      createTime: record.createTime || '',
      cloudRecord: record,
      role: record.role || 'admin',
      shopPhone: shopPhone,
      // ★ 新增：标记缓存来源（用于跨模式隔离）
      _platform: _platformDetected ? 'multiend' : 'miniprogram'
    }
    wx.setStorageSync('shopInfo', shopInfo)
    wx.setStorageSync('shopName', shopName)
    // 设置角色标签
    var roleLabel = shopInfo.role === 'staff' ? '店员' : ''
    wx.setStorageSync('roleLabel', roleLabel)

    // 恢复全局数据
    this.globalData.shopName = shopName
    this.globalData.shopPhone = shopPhone
    this.globalData.shopInfo = shopInfo

    // ★ 判断 Pro 激活状态
    // 管理员记录：直接检查 record.code
    // 员工记录：_enrichStaffRecord 将店主 code 放到 _ownerCode
    var proRecord = {
      code: record._ownerCode || record.code || '',
      expireTime: record._ownerExpireTime || record.expireTime || ''
    }
    var isPro = this._checkProStatus(proRecord)
    wx.setStorageSync('isPro', isPro)
    if (isPro) {
      wx.setStorageSync('proType', 'year')
    }

    // 无感进入首页：splash 页面会统一处理跳转，这里只负责恢复数据
    // 保留对 dashboard 页面的通知能力（从其他入口进入时仍需触发刷新）
    var pages = getCurrentPages()
    // 场景A：当前在 welcome（但非 splash）→ switchTab 到 dashboard
    // splash 页面会自行处理跳转（_navigateNext），这里不重复跳转以避免 webviewId 冲突
    var currentRoute = pages.length > 0 ? (pages[0].route || '') : ''
    if (currentRoute.indexOf('welcome') !== -1 && currentRoute.indexOf('splash') === -1) {
      wx.switchTab({ url: '/pages/dashboard/dashboard' })
    }
    // 场景B：当前已在 dashboard 但 onLoad 时还是未注册状态 → 主动通知其刷新
    else if (pages.length > 0 && (pages[0].route || '').indexOf('dashboard') !== -1) {
      var dashPage = pages[pages.length - 1]
      if (dashPage && typeof dashPage._onLoginReady === 'function') {
        dashPage._onLoginReady()
      } else {
        // 兜底：用 setData 触发页面感知到登录状态
        if (dashPage && dashPage.setData) {
          dashPage.setData({ registered: true, shopPhone: shopPhone, loading: false })
        }
      }
    }
    // 场景C：当前在 splash 页面 → 不做跳转，由 splash 统一处理
  },

  /**
   * Pro 激活状态判断（与 proUnlock.js checkProFromRecord 逻辑一致）
   * 规则：code 有值即已激活 + 当前时间 < expireTime
   * @param {Object} record
   * @returns {boolean}
   */
  _checkProStatus(record) {
    if (!record) return false
    var code = record.code || ''

    // 条件1：code 有值即表示已激活（与 proUnlock.js checkProFromRecord 逻辑一致）
    if (!code) {
      return false
    }

    // 条件2：当前时间未超过有效期
    var expireTime = record.expireTime || ''
    if (expireTime) {
      var expireDate = new Date(expireTime)
      if (isNaN(expireDate.getTime())) return false
      if (new Date().getTime() >= expireDate.getTime()) {
        wx.setStorageSync('isPro', false)
        wx.setStorageSync('proType', '')
        return false
      }
    }
    return true
  },

  /**
   * 默认进入游客模式（新用户首次打开、openid 无绑定记录时）
   * 查询预设的游客账号记录，本地缓存后进入 dashboard
   * 如果游客账号不存在则降级到登录页
   *
   * ★ 多端模式：不使用游客模式，直接跳转登录页
   */
  _enterGuestMode() {
    var app = this

    // ★ 多端模式：跳过游客模式，直接进入登录页
    if (_platformDetected) {
      console.log('[_enterGuestMode] 多端模式，跳转登录页')
      app._goWelcome('login')
      return Promise.resolve()
    }

    // ====== 小程序原有逻辑 ↓ ======
    var guestPhone = constants.GUEST_PHONE
    var guestCode = constants.GUEST_SHOP_CODE

    // 守卫检查：如果自动登录已成功写入有效shopInfo（非游客），跳过游客模式
    var existingShopInfo = wx.getStorageSync('shopInfo') || {}
    if (existingShopInfo.phone && existingShopInfo.cloudRecord && !existingShopInfo.isGuest) {
      return Promise.resolve()
    }

    return app.whenCloudReady().then(function () {
      var db = app.db()

      var queryPromise = db.collection('repair_activationCodes')
        .where({ type: 'free', phone: guestPhone, shopCode: guestCode })
        .limit(1)
        .get()

      // 超时保护：8秒内数据库查询无响应则强制失败
      var timeoutPromise = new Promise(function(resolve, reject) {
        setTimeout(function() {
          reject(new Error('[_enterGuestMode] 数据库查询超时(8s)'))
        }, 8000)
      })

      return Promise.race([queryPromise, timeoutPromise])
    }).then(function (res) {
        if (!res.data || res.data.length === 0) {
          // 游客账号不存在 → 直接用本地默认数据进入游客模式
          var fallbackShopInfo = {
            name: constants.GUEST_DISPLAY_NAME,
            phone: guestPhone,
            openid: '',
            shopCode: guestCode,
            createTime: '',
            cloudRecord: null,
            isGuest: true,
            _platform: 'miniprogram'
          }
          wx.setStorageSync('shopInfo', fallbackShopInfo)
          wx.setStorageSync('shopName', constants.GUEST_DISPLAY_NAME)
          wx.setStorageSync('isGuestMode', 'yes')
          wx.setStorageSync('isPro', false)
          app.globalData.shopName = constants.GUEST_DISPLAY_NAME
          app.globalData.shopPhone = guestPhone
          app.globalData.shopInfo = fallbackShopInfo
          return
        }

        var record = res.data[0]
        var shopInfo = {
          name: record.name || constants.GUEST_DISPLAY_NAME,
          phone: guestPhone,
          openid: '',
          shopCode: guestCode,
          createTime: record.createTime || '',
          cloudRecord: record,
          isGuest: true,
          _platform: 'miniprogram'
        }
        wx.setStorageSync('shopInfo', shopInfo)
        wx.setStorageSync('shopName', record.name || constants.GUEST_DISPLAY_NAME)
        wx.setStorageSync('isGuestMode', 'yes')
        var guestIsPro = app._checkProStatus(record)
        wx.setStorageSync('isPro', guestIsPro)

        app.globalData.shopName = record.name || constants.GUEST_DISPLAY_NAME
        app.globalData.shopPhone = guestPhone
        app.globalData.shopInfo = shopInfo
      })
      .catch(function (err) {
        // 网络异常 → 用本地默认数据进入游客模式
        var fallbackShopInfo = {
          name: constants.GUEST_DISPLAY_NAME,
          phone: guestPhone,
          openid: '',
          shopCode: guestCode,
          createTime: '',
          cloudRecord: null,
          isGuest: true,
          _platform: 'miniprogram'
        }
        wx.setStorageSync('shopInfo', fallbackShopInfo)
        wx.setStorageSync('shopName', constants.GUEST_DISPLAY_NAME)
        wx.setStorageSync('isGuestMode', 'yes')
        wx.setStorageSync('isPro', false)
        app.globalData.shopName = constants.GUEST_DISPLAY_NAME
        app.globalData.shopPhone = guestPhone
        app.globalData.shopInfo = fallbackShopInfo
      })
  },

  /**
   * 跳转到 welcome 页面
   * @param {string} mode 'login' | 'register'
   */
  _goWelcome(mode) {
    wx.reLaunch({ url: '/pages/welcome/welcome?mode=' + (mode || 'login') })
  },

  /**
   * 清除失效账号的所有登录缓存 + 切换到游客模式（仅小程序端使用）
   * 与 _forceLogout 的区别：不跳转页面，仅重置状态
   */
  _forceLogoutAndEnterGuest: function() {
    console.log('[AUTH] 失效账号清除：切换到游客模式')

    // 1. 清除所有登录相关缓存（复用 _forceLogout 的清除列表）
    wx.removeStorageSync('shopInfo')
    wx.removeStorageSync('shopName')
    wx.removeStorageSync('isPro')
    wx.removeStorageSync('proType')
    wx.removeStorageSync('proActivationTime')
    wx.removeStorageSync('isGuestMode')
    wx.removeStorageSync('shopTel')
    wx.removeStorageSync('shopAddr')
    wx.removeStorageSync('roleLabel')
    wx.removeStorageSync('openid')

    // 2. 清除全局数据
    this.globalData.shopName = ''
    this.globalData.shopPhone = ''
    this.globalData.shopInfo = {}

    // 3. 切换到游客模式（不跳转页面，仅重置状态）
    this._enterGuestMode()
  },

  /**
   * 强制登出：清除所有登录状态 + 跳转登录页
   * 用于 -403（账号已失效/被删除）等安全场景
   */
  _forceLogout: function () {
    console.log('[AUTH] 强制登出：清除所有登录状态')
    // 1. 清除本地缓存
    wx.removeStorageSync('shopInfo')
    wx.removeStorageSync('shopName')
    wx.removeStorageSync('isPro')
    wx.removeStorageSync('proType')
    wx.removeStorageSync('proActivationTime')
    wx.removeStorageSync('isGuestMode')
    wx.removeStorageSync('shopTel')
    wx.removeStorageSync('shopAddr')
    wx.removeStorageSync('roleLabel')
    wx.removeStorageSync('openid')

    // 2. 清除全局数据
    this.globalData.shopName = ''
    this.globalData.shopPhone = ''
    this.globalData.shopInfo = {}

    // 3. 跳转登录页（reLaunch 关闭所有页面）
    wx.reLaunch({ url: '/pages/welcome/welcome?mode=login' })
  },

  // ===========================
  // 登录状态检查
  // ===========================

  /**
   * 判断是否已完成门店注册（有 phone 即为已注册）
   * @returns {boolean}
   */
  isRegistered() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    // 游客模式不算已注册
    if (shopInfo.isGuest || wx.getStorageSync('isGuestMode')) return false
    return !!(shopInfo && shopInfo.phone)
  },

  /**
   * 要求注册：未注册时跳转注册页，已注册时执行回调
   * @param {Function} [callback] 已注册时执行的回调
   * @returns {boolean} 是否已注册
   */
  requireRegister(callback) {
    if (this.isRegistered()) {
      if (typeof callback === 'function') callback()
      return true
    }
    wx.showModal({
      title: '请先注册',
      content: '完善门店信息后即可使用该功能',
      confirmText: '去注册',
      success: function (res) {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/welcome/welcome' })
        }
      }
    })
    return false
  },

  /**
   * 退出登录：清本地缓存 + 清 DB 中的 openid 绑定 + 跳转欢迎页
   * @param {Object} [options] { docId: string } 可选，指定要清除 openid 的记录 ID
   */
  logout(options) {
    var app = this
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？退出后需重新登录',
      confirmText: '退出',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (!res.confirm) return

        var shopInfo = wx.getStorageSync('shopInfo') || {}
        var docId = (options && options.docId) || (shopInfo.cloudRecord && shopInfo.cloudRecord._id) || ''

        // 清除本地缓存
        wx.removeStorageSync('shopInfo')
        wx.removeStorageSync('shopName')
        wx.removeStorageSync('isPro')
        wx.removeStorageSync('proType')
        wx.removeStorageSync('proActivationTime')
        wx.removeStorageSync('isGuestMode')
        wx.removeStorageSync('shopTel')
        wx.removeStorageSync('shopAddr')
        wx.removeStorageSync('roleLabel')
        wx.removeStorageSync('openid')

        // 清除全局数据
        app.globalData.shopName = ''
        app.globalData.shopPhone = ''
        app.globalData.shopInfo = {}

        // 清除 DB 中的 openid 绑定（让下次 _loadShopByOpenid 查不到）
        if (docId) {
          util.callRepair('updateOpenid', { docId: docId }).catch(function () { /* 静默 */ })
        }

        // 进入游客模式（内部会设置缓存）
        app._enterGuestMode().then(function () {
          wx.reLaunch({ url: '/pages/dashboard/dashboard' })
        })

        app.toastSuccess('已退出')
      }
    })
  },

  /**
   * 全局跳转 - 自动判断 tabBar / 普通页面
   * @param {string} url 页面路径（如 '/pages/carSearch/carSearch'）
   * @param {Object} [params] URL 参数（可选）
   */
  navigate(url, params) {
    if (!url) return
    var fullUrl = url
    if (params && typeof params === 'object') {
      var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]) }).join('&')
      if (qs) fullUrl += '?' + qs
    }

    // tabBar 页面列表
    var tabBarUrls = [
      '/pages/dashboard/dashboard',
      '/pages/memberList/memberList',
      '/pages/proUnlock/proUnlock'
    ]
    var isTabBar = tabBarUrls.some(function (t) { return fullUrl.indexOf(t) === 0 })

    if (isTabBar) {
      wx.switchTab({ url: url })
    } else {
      wx.navigateTo({
        url: fullUrl,
        fail: function (err) {
          console.warn('navigateTo 失败:', fullUrl, err)
        }
      })
    }
  },

  /**
   * 全局返回
   * @param {number} [delta=1] 返回层数
   */
  navigateBack(delta) {
    wx.navigateBack({ delta: delta || 1 })
  },

  /**
   * 全局成功提示
   * @param {string} title 提示文字
   * @param {number} [duration=1500]
   */
  toastSuccess(title, duration) {
    wx.showToast({ title: title || '操作成功', icon: 'success', duration: duration || 1500 })
  },

  /**
   * 全局失败提示
   * @param {string} title
   * @param {number} [duration=2000]
   */
  toastFail(title, duration) {
    wx.showToast({ title: title || '操作失败', icon: 'none', duration: duration || 2000 })
  },

  /**
   * 全局提示（无图标）
   * @param {string} title
   * @param {number} [duration=2000]
   */
  toast(title, duration) {
    wx.showToast({ title: title || '', icon: 'none', duration: duration || 2000 })
  },

  /**
   * 全局加载框
   * @param {string} [title='加载中...']
   */
  showLoading(title) {
    wx.showLoading({ title: title || '加载中...', mask: true })
  },

  /**
   * 隐藏加载框
   */
  hideLoading() {
    wx.hideLoading()
  },

  /**
   * 全局确认弹窗
   * @param {Object} options
   * @param {string} options.title 标题
   * @param {string} options.content 内容
   * @param {string} [options.confirmText='确定']
   * @param {string} [options.cancelText='取消']
   * @param {Function} [options.onConfirm] 确认回调
   * @param {Function} [options.onCancel] 取消回调
   */
  showModal(options) {
    if (!options) return
    wx.showModal({
      title: options.title || '提示',
      content: options.content || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      editable: options.editable || false,
      placeholderText: options.placeholderText || '',
      success: function (res) {
        if (res.confirm && typeof options.onConfirm === 'function') {
          options.onConfirm(res)
        }
        if (res.cancel && typeof options.onCancel === 'function') {
          options.onCancel(res)
        }
      }
    })
  },

  // ===========================
  // 全局业务数据方法
  // ===========================

  /**
   * 获取门店名称
   * @returns {string}
   */
  getShopName() {
    return wx.getStorageSync('shopName') || '未设置门店名称'
  },

  /**
   * 获取完整门店信息
   * @returns {Object} { name, phone, openid, createTime }
   */
  getShopInfo() {
    return wx.getStorageSync('shopInfo') || {}
  },

  /**
   * 获取当前门店绑定手机号（数据隔离关键字段）
   * @returns {string} 手机号，无则返回空字符串
   */
  getShopPhone() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    // 员工场景：shopInfo.shopPhone 是店主手机号，优先使用
    var phone = shopInfo.shopPhone || shopInfo.phone || ''
    if (!phone) {
      phone = this.globalData.shopPhone || ''
    }
    return phone
  },

  /**
   * 获取当前操作人手机号（多用户追溯）
   * 返回当前登录用户的手机号（管理员本人 or 员工手机号）
   * @returns {string} 操作人手机号，无则返回空字符串
   */
  getOperatorPhone() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    return shopInfo.phone || ''
  },

  /**
   * 构建门店隔离查询条件（所有业务数据查询必须带上）
   * @param {Object} [where] 原始查询条件
   * @returns {Object} 带 shopPhone 条件的查询条件
   */
  shopWhere(where) {
    var phone = this.getShopPhone()
    var condition = {}
    if (phone) {
      condition.shopPhone = phone
    }
    if (where && typeof where === 'object') {
      // 合并条件
      var keys = Object.keys(where)
      for (var i = 0; i < keys.length; i++) {
        condition[keys[i]] = where[keys[i]]
      }
    }
    return condition
  },

  /**
   * 设置门店名称（缓存+数据库同步）
   * @param {string} name
   */
  setShopName(name) {
    if (!name || !name.trim()) return
    var shopName = name.trim()
    wx.setStorageSync('shopName', shopName)
    // 同步更新 shopInfo
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    shopInfo.name = shopName
    wx.setStorageSync('shopInfo', shopInfo)
    try {
      var phone = this.getShopPhone()
      if (!phone) return
      var db = this.db()
      db.collection('repair_activationCodes')
        .where({ type: 'free', phone: phone })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()
        .then(function (res) {
          if (res.data && res.data.length > 0) {
            db.collection('repair_activationCodes')
              .doc(res.data[0]._id)
              .update({ data: { name: shopName } })
          }
        })
    } catch (e) {
      console.error('同步门店名称到云端失败', e)
    }
  },

  /**
   * 判断是否Pro版
   * @returns {boolean}
   */
  isPro() {
    return !!wx.getStorageSync('isPro')
  },

  /**
   * 从云端同步 Pro 状态到本地缓存（全局统一方法）
   * @param {Object} [options] 可选参数
   * @param {string} [options.docId] 指定记录ID查询（更精确）
   * @returns {Promise<boolean>} 同步后的 isPro 值
   */
  syncProStatus: function (options) {
    var app = this
    var db = this.db()

    return new Promise(function (resolve) {
      try {
        var query = { type: 'free' }

        // 优先用 docId 查询（最精确）
        if (options && options.docId) {
          db.collection('repair_activationCodes').doc(options.docId).get()
            .then(function (res) {
              if (!res.data) { resolve(false); return }
              var record = res.data
              var isPro = app._checkProStatus(record)
              app._applyProCache(isPro, record)
              resolve(isPro)
            })
            .catch(function () { resolve(app.isPro()) })
          return
        }

        // 第一阶段：用 openid 查 type:'free' 记录（管理员自身登录场景）
        var openid = wx.getStorageSync('openid') || ''
        if (openid) {
          query.openid = openid
        } else {
          var shopInfo = wx.getStorageSync('shopInfo') || {}
          if (shopInfo.phone) query.phone = shopInfo.phone
        }

        db.collection('repair_activationCodes')
          .where(query)
          .orderBy('createTime', 'desc')
          .limit(1)
          .get()
          .then(function (res) {
            // 查到记录 → 直接判断
            if (res.data && res.data.length > 0) {
              var record = res.data[0]
              var isPro = app._checkProStatus(record)
              var cacheIsPro = app.isPro()
              if (isPro !== cacheIsPro) {
                // Pro状态变化
              }
              app._applyProCache(isPro, record)
              resolve(isPro)
              return
            }

            // 第二阶段：用 shopPhone 反查店主记录（员工登录场景）
            var shopInfo2 = wx.getStorageSync('shopInfo') || {}
            var shopPhone = shopInfo2.shopPhone || shopInfo2.phone || ''
            if (!shopPhone) {
              resolve(false)
              return
            }

            return db.collection('repair_activationCodes')
              .where({ type: 'free', phone: shopPhone })
              .field({ code: true, expireTime: true })
              .orderBy('createTime', 'desc')
              .limit(1)
              .get()
              .then(function (res2) {
                if (!res2.data || res2.data.length === 0) {
                  resolve(false)
                  return
                }
                var record2 = res2.data[0]
                var isPro2 = app._checkProStatus(record2)
                app._applyProCache(isPro2, record2)
                resolve(isPro2)
              })
          })
          .catch(function () { resolve(app.isPro()) })
      } catch (e) {
        console.warn('[syncProStatus] 异常:', e)
        resolve(app.isPro())
      }
    })
  },

  /**
   * 统一写入 Pro 缓存 + 更新 shopInfo.cloudRecord（内部方法）
   * @param {boolean} isPro
   * @param {Object} [record]
   */
  _applyProCache: function (isPro, record) {
    wx.setStorageSync('isPro', isPro)
    if (isPro) {
      wx.setStorageSync('proType', 'year')
    }
    if (record && record._id) {
      var shopInfo = wx.getStorageSync('shopInfo') || {}
      shopInfo.cloudRecord = record
      wx.setStorageSync('shopInfo', shopInfo)
      this.globalData.shopInfo = shopInfo
    }
  },

  /**
   * 获取Pro版本信息
   * @returns {Object} { isPro, proType, activationTime }
   */
  getProInfo() {
    return {
      isPro: !!wx.getStorageSync('isPro'),
      proType: wx.getStorageSync('proType') || '',
      activationTime: wx.getStorageSync('proActivationTime') || ''
    }
  },

  /**
   * 获取用户 OpenID（双重获取策略，稳定不报错）
   *
   * ★ 多端模式（Android/iOS）：直接返回空字符串
   *   原因：非微信环境无法获取微信openid，多端通过 phone+shopCode 登录
   *   返回空值后，各业务逻辑会走"无 openid"的兼容分支
   *
   * 小程序模式：
   * 策略1：调用云函数 login 获取（最稳定）
   * 策略2：降级到数据库 add 获取自动注入的 _openid
   * @returns {Promise<string>}
   */
  getOpenId: function () {
    var app = this

    // ★ 多端模式：跳过获取，返回空字符串
    if (_platformDetected) {
      console.log('[getOpenId] 多端模式，跳过openid获取')
      return Promise.resolve('')
    }

    // 优先从缓存取
    var cachedOpenid = wx.getStorageSync('openid') || ''
    if (cachedOpenid) {
      app.globalData._openid = cachedOpenid
      return Promise.resolve(cachedOpenid)
    }
    // 再从 globalData 取
    if (app.globalData._openid) {
      return Promise.resolve(app.globalData._openid)
    }

    // 通过客户端 DB add 获取 _openid（跨账号场景下 add 返回值不含 _openid，需云函数读取）
    return app.whenCloudReady().then(function () {
      return new Promise(function (resolve) {
        var db = app.db()
        db.collection('repair_activationCodes').add({
          data: { _type: 'openid_fetch', createTime: db.serverDate() }
        }).then(function (addRes) {
          if (!addRes || !addRes._id) {
            resolve('')
            return
          }
          // 通过云函数读取记录的 _openid 并删除临时记录
          var cloud = app._resourceCloud || wx.cloud
          cloud.callFunction({
            name: 'repair_main',
            data: { action: 'getOpenId', fetchId: addRes._id },
            success: function (res) {
              var openid = (res.result && res.result.openid) || ''
              if (openid) {
                app.globalData._openid = openid
                wx.setStorageSync('openid', openid)
              }
              resolve(openid)
            },
            fail: function (err) {
              console.error('getOpenId 云函数调用失败', err)
              resolve('')
            }
          })
        }).catch(function (err) {
          console.error('获取openid失败', err)
          resolve('')
        })
      })
    })
  },

  // ===========================
  // v4.0.0 权限系统
  // ===========================

  /**
   * 获取当前用户角色
   * @returns {string} 'admin' | 'staff'
   */
  getRole() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    return shopInfo.role || 'admin'
  },

  /**
   * 是否管理员
   * @returns {boolean}
   */
  isAdmin() {
    return this.getRole() === 'admin'
  },

  /**
   * 是否员工（店员角色）
   * @returns {boolean}
   */
  isStaff() {
    return this.getRole() === 'staff'
  },

  /**
   * 是否超级管理员（注册者本人，非通过员工管理添加的）
   * 判断依据：shopInfo 中有 openid 且无 addedBy 字段
   * @returns {boolean}
   */
  isSuperAdmin() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    return !!(shopInfo.openid && !shopInfo.addedBy && shopInfo.role === 'admin')
  },

  /**
   * 异步获取 Pro 状态（员工继承店主 Pro 状态）
   * 通过 shopPhone 反查店主记录的 code + expireTime 判断
   * @returns {Promise<boolean>}
   */
  _getProStatusAsync() {
    var app = this
    var db = this.db()
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var shopPhone = shopInfo.shopPhone || shopInfo.phone || ''

    if (!shopPhone) return Promise.resolve(false)

    return db.collection('repair_activationCodes')
      .where({ type: 'free', phone: shopPhone })
      .field({ code: true, expireTime: true })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()
      .then(function (res) {
        if (!res.data || res.data.length === 0) return false
        var record = res.data[0]
        var isPro = app._checkProStatus(record)
        if (isPro !== app.isPro()) {
          app._applyProCache(isPro, record)
        }
        return isPro
      })
      .catch(function () { return app.isPro() })
  },

  // ===========================
  // 内部方法
  // ===========================

  /**
   * 预加载门店信息到全局变量（纯本地缓存读取）
   */
  _loadGlobalShopInfo() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    this.globalData.shopName = shopInfo.name || wx.getStorageSync('shopName') || ''
    this.globalData.shopPhone = shopInfo.phone || ''
    this.globalData.shopInfo = shopInfo
  }
})
