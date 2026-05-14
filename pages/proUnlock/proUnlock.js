// pages/proUnlock/proUnlock.js
// 我的页面 - 门店信息展示 + Pro激活状态判断
// Pro判定规则：code 有值 && expireTime 未过期

const app = getApp()
const util = require('../../utils/util')
const constants = require('../../utils/constants')

Page({
  data: {
    activationCode: '',
    isPro: false,
    proActivatedCount: '...',
    proProgressPercent: 0,
    isAdmin: false,
    usedCount: 0,
    unlocking: false,
    shopName: '',
    shopPhone: '',
    myPhone: '',       // 员工自身登录手机号（非店主手机号）
    shopCode: '',
    versionLabel: '免费版',
    expireLabel: '无',
    registerDate: '',
    displayName: '',    // 操作人显示名称
    renewTip: '',     // 续费提醒文案
    showRenew: false,   // 是否显示续费提醒
    shopTel: '',      // 门店联系电话
    shopAddr: '',     // 门店地址
    isGuest: false,   // 游客模式
    roleLabel: '',    // 账号类型标签
    roleTagClass: '', // 账号类型样式类
    contactExpanded: false,    // 联系客服折叠状态
    shopCodeExpanded: false,   // 门店码折叠状态
    isOwner: false,            // 是否超级管理员（注册者本人）
    isStaff: false,            // 是否员工身份
    // 员工管理
    staffExpanded: false,
    staffList: [],
    staffPhoneInput: '',
    staffDisplayNameInput: '',
    staffRoleIndex: 0,
    staffRoleOptions: [{ label: '店员', value: 'staff' }, { label: '管理员', value: 'admin' }],
    staffAdding: false,
    shopBayCount: 2,
    shopBayCountIndex: 1,  // 默认索引（对应值2）
    bayCountOptions: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'],
    shopOpenYear: String(new Date().getFullYear()),
    shopProfileSaving: false,
    currentYear: String(new Date().getFullYear()),
    navTabs: { member: true, car: false },
    // 激活 Pro 版折叠状态（默认收起）
    activationExpanded: false,
    // 系统设置（合并 AI诊断设置 + 导航栏设置）
    systemSettingsExpanded: false,
    // 使用帮助折叠状态
    useHelpExpanded: false
  },

  // 切换激活 Pro 版卡片展开/收起
  toggleActivation: function () {
    this.setData({ activationExpanded: !this.data.activationExpanded })
  },

  onLoad: function () {
    var page = this
    page._firstLoad = true
    // 统一用 shopPhone 判断游客模式（与 dashboard 保持一致）
    var isGuest = app.isGuest ? app.isGuest() : false
    if (isGuest) {
      page.setData({ isGuest: true, isAdmin: false, shopPhone: constants.GUEST_MASKED_PHONE })
    }
    // 注入多端模式标记（用于 WXML 条件渲染）
    var _isMultiEnd = !!(app.globalData && app.globalData._isMultiEndMode)
    page.setData({ _isMultiEnd: _isMultiEnd })
    app.whenCloudReady().then(function () {
      page.loadShopInfo()
      if (!page.data.isGuest) {
        page.loadUsedCount()
      }
    })
    // 设置账号类型标签
    page._updateRoleLabel()
    // 设置 isOwner（是否超级管理员/注册者本人）
    page._updateOwnerFlag()
    // v5.4.0 读取导航栏设置
    page._loadNavConfig()
    // 预传递常量到 data 供 WXML 使用
    page.setData({
      freeMaxOrders: constants.FREE_MAX_ORDERS,
      freeMaxMembers: constants.FREE_MAX_MEMBERS,
      servicePhone: constants.SERVICE_PHONE
    })
  },

  onShow: function () {
    var page = this
    // ★ v5.4.0 自定义TabBar：自动匹配路由索引 + 恢复显隐
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
      // ★ 恢复自定义 TabBar 可见（onHide/onUnload 中可能因诊断设置展开而隐藏了 TabBar）
      this.getTabBar().show()
    }
    // 首次加载跳过（onLoad已拉取），仅从其他页面返回时刷新
    if (page._firstLoad) {
      page._firstLoad = false
      return
    }
    // 同步刷新游客状态（与 dashboard 判断逻辑一致）
    var isGuest = app.isGuest ? app.isGuest() : false
    if (isGuest && !this.data.isGuest) {
      page.setData({ isGuest: true, isAdmin: false, shopPhone: constants.GUEST_MASKED_PHONE })
    }
    app.whenCloudReady().then(function () {
      page.loadShopInfo()
      page._updateOwnerFlag()
    })
    // 从本地缓存批量加载门店联系信息（不需要云端）
    var tel = wx.getStorageSync('shopTel') || ''
    var addr = wx.getStorageSync('shopAddr') || ''
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var localDisplayName = shopInfo.displayName || ''
    var patch = {}
    if (tel) patch.shopTel = tel
    if (addr) patch.shopAddr = addr
    if (localDisplayName) patch.displayName = localDisplayName
    if (Object.keys(patch).length > 0) this.setData(patch)
  },

  onUnload: function () {
    // 重置重入守卫，确保下次进入页面时刷新
    this._firstLoad = true
    // ★ 恢复自定义 TabBar（展开系统设置后直接返回页面时）
    if (this.data.systemSettingsExpanded) {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().show()
      }
    }
  },

  onHide: function () {
    // ★ 恢复自定义 TabBar（切换 tab 时系统设置可能处于展开状态）
    if (this.data.systemSettingsExpanded) {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().show()
      }
    }
  },

  /**
   * 检查Pro版到期续费提醒（剩余 < 30天时提示）
   * @param {Object} record 云数据库记录
   */
  checkRenewTip: function (record) {
    if (!record || !record.expireTime) return
    var expireDate = new Date(record.expireTime)
    if (isNaN(expireDate.getTime())) return
    var now = new Date()
    var remainMs = expireDate.getTime() - now.getTime()
    var remainDays = Math.ceil(remainMs / (24 * 60 * 60 * 1000))

    if (remainDays <= 30 && remainDays > 0) {
      this.setData({
        showRenew: true,
        renewTip: 'Pro版将于 ' + remainDays + ' 天后到期，请及时续费以免影响使用'
      })
    } else if (remainDays <= 0) {
      this.setData({
        showRenew: true,
        renewTip: 'Pro版已到期，请续费以继续使用全部功能'
      })
    } else {
      this.setData({ showRenew: false, renewTip: '' })
    }
  },

  /**
   * 从云端记录判断Pro状态
   * 委托 constants.checkProFromRecord（唯一来源）
   */
  checkProFromRecord: function (record) {
    return constants.checkProFromRecord(record)
  },

  /**
   * 加载门店信息 + Pro状态（一次数据库请求完成）
   * 从 repair_activationCodes 读取当前门店记录
   * Pro判定：code == unlockKey && 当前时间 < expireTime
   */
  loadShopInfo: function () {
    var page = this
    var db = app.db()

    // 1. 先从本地缓存读取，立刻显示
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var localName = shopInfo.name || wx.getStorageSync('shopName') || ''
    var localPhone = shopInfo.phone || ''
    var localRecord = shopInfo.cloudRecord || null
    if (shopInfo.isGuest) {
      page.setData({ isGuest: true, shopPhone: (localPhone || '游客') + ' (演示账号)' })
    }
    if (localName) {
      page.setData({ shopName: localName })
    }
    // ★ 从缓存读取显示名称（员工登录时已由 _restoreShopInfo 写入）
    if (shopInfo.displayName) {
      page.setData({ displayName: shopInfo.displayName })
    }
    // ★ 游客模式保留专属显示格式（如 '135****0000 (演示账号)'），避免被通用脱敏覆盖
    if (localPhone && !page.data.isGuest) {
      page.setData({ shopPhone: util.maskPhone(localPhone) })
    }
    // 非超级管理员账号：设置登录手机号（员工用自身手机号，店主无openid时也需显示）
    if (shopInfo.addedBy && (shopInfo.phone || shopInfo.shopPhone)) {
      // 员工账号：显示员工自己的手机号
      page.setData({ myPhone: util.maskPhone(shopInfo.phone || shopInfo.shopPhone) })
    } else if ((shopInfo.staffOpenid || shopInfo.phone !== shopInfo.shopPhone) && shopInfo.phone) {
      // 兜底：有 staffOpenid 或 登录号≠店主号 → 视为非店主，显示自身手机号
      page.setData({ myPhone: util.maskPhone(shopInfo.phone), addedBy: shopInfo.addedBy || true })
    } else if (shopInfo.phone && !shopInfo.openid) {
      // 店主但 openid 为空（多端/Craft模式）：也需要显示登录账号
      page.setData({ myPhone: util.maskPhone(shopInfo.phone) })
    }
    // 预读门店联系方式
    var _cachedTel = shopInfo.shopTel || wx.getStorageSync('shopTel') || ''
    if (_cachedTel) {
      page.setData({ shopTel: _cachedTel })
    }
    if (shopInfo.shopAddr || wx.getStorageSync('shopAddr')) {
      page.setData({ shopAddr: shopInfo.shopAddr || wx.getStorageSync('shopAddr') || '' })
    }
    // 从本地缓存的云端记录预判Pro状态（code有值即已激活，与checkProFromRecord一致）
    if (localRecord && localRecord.code) {
      var localPro = page.checkProFromRecord(localRecord)
      if (localPro) {
        page.setData({ isPro: true })
        page.updateVersionLabels(localRecord)
      }
    }

    // 2. 从云数据库读取最新值（一次请求获取门店信息 + Pro状态）
    // ★ v6.0 数据隔离加固：避免员工/无openid时退化为全库扫描泄漏数据
    try {
      var openid = wx.getStorageSync('openid') || ''
      var shopInfoCache = wx.getStorageSync('shopInfo') || {}

      // 多端模式：无有效 openid 时跳过云端查询
      var _isMultiEnd = (app.globalData && app.globalData._isMultiEndMode)
      if (_isMultiEnd && !openid) {
        return
      }

      // 非多端模式、非游客、无有效 openid → 跳过云端查询（依赖本地缓存）
      if (!page.data.isGuest && !openid) {
        return
      }

      var query = { type: 'free' }
      // 游客模式：用手机号查询
      if (page.data.isGuest) {
        query.phone = constants.GUEST_PHONE
      }
      // ★ 员工/管理员员工模式：用 shopPhone 反查店主记录（员工自身记录 type='staff'，查不到 type='free'）
      else if (shopInfoCache.addedBy && shopInfoCache.shopPhone) {
        query.phone = shopInfoCache.shopPhone
      }
      // 管理员模式：用 openid 查询
      else if (openid) {
        query.openid = openid
      }
      // ★ 兜底守卫：仍有未覆盖的情况 → 跳过云端查询，防止泄漏
      else {
        return
      }
      db.collection('repair_activationCodes')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(1)
        .get({
          success: function (res) {
            if (res.data && res.data.length > 0) {
              var record = res.data[0]

              // 员工身份：主动拉取自身手机号
              if (page.data.isStaff) {
                app.db().collection('repair_activationCodes')
                  .where({ openid: wx.getStorageSync('openid') || '' })
                  .get({
                    success: function (staffRes) {
                      if (staffRes.data && staffRes.data.length > 0 && staffRes.data[0].phone) {
                        page.setData({ myPhone: util.maskPhone(staffRes.data[0].phone) })
                      }
                    }
                  })
              }

              // 读取门店联系信息（storageSync 优先同步，保证 cachedShopInfo 读到最新值）
              if (record.shopTel) wx.setStorageSync('shopTel', record.shopTel)
              if (record.shopAddr) wx.setStorageSync('shopAddr', record.shopAddr)
              if (record.name) wx.setStorageSync('shopName', record.name)

              // 缓存云端记录到本地（避免重复请求）
              var cachedShopInfo = wx.getStorageSync('shopInfo') || {}
              // ★ 方案B：用 addedBy 替代 type/role 判断员工身份
              var isStaffUser = !!cachedShopInfo.addedBy
              cachedShopInfo.name = record.name || cachedShopInfo.name
              // 员工不覆盖 phone（record 是店主记录，phone 是店主手机号）
              if (!isStaffUser) {
                cachedShopInfo.phone = record.phone || cachedShopInfo.phone
              }
              cachedShopInfo.cloudRecord = record
              // 同步显示名称到缓存（员工不覆盖，避免将店主的 displayName 写到员工缓存）
              if (!isStaffUser) {
                cachedShopInfo.displayName = record.displayName || cachedShopInfo.displayName || ''
              }
              // 同步门店联系方式到 shopInfo 缓存
              cachedShopInfo.shopTel = record.shopTel || cachedShopInfo.shopTel || ''
              cachedShopInfo.shopAddr = record.shopAddr || cachedShopInfo.shopAddr || ''
              wx.setStorageSync('shopInfo', cachedShopInfo)

              // ★ 合并 7 次独立 setData 为 1 次批量更新
              var patch = {}
              if (record.name) patch.shopName = record.name
              // ★ 游客模式保留专属显示格式，不被通用脱敏覆盖
              if (record.phone && !page.data.isGuest) patch.shopPhone = util.maskPhone(record.phone)
              if (record.createTime) patch.registerDate = util.formatDate(record.createTime)
              if (record.displayName && !page.data.isStaff) patch.displayName = record.displayName
              if (record.shopCode) patch.shopCode = record.shopCode
              if (record.shopTel) patch.shopTel = record.shopTel
              if (record.shopAddr) patch.shopAddr = record.shopAddr
              page.setData(patch)

              // ★ Pro激活判断：code 有值 && expireTime 未过期
              var isPro = page.checkProFromRecord(record)

              // 更新页面状态
              page.setData({ isPro: isPro, isAdmin: app.isAdmin() })

              // ★ 预加载门店经营诊断配置（工位数/开业年份）
              // 在用户展开"AI诊断设置"前静默拉取云端已保存的值，
              // 避免展开时短暂显示默认值（工位数2/开业年份2026）后再跳变
              if (page.data.isOwner) {
                page._loadShopProfile()
              }

              // 同步本地Pro缓存
              wx.setStorageSync('isPro', isPro)
              if (isPro && record.type) {
                wx.setStorageSync('proType', record.type)
              }

              // 更新版本标签
              page.updateVersionLabels(record)

              // ★ Pro已激活时，顶部标题改为"AI养车 Pro版"
              if (isPro) {
                wx.setNavigationBarTitle({ title: 'AI养车 Pro版' })
                page.checkRenewTip(record)
              } else {
                wx.setNavigationBarTitle({ title: 'Pro版升级' })
                page.setData({ showRenew: false })
              }
            } else if ((wx.getStorageSync('shopInfo') || {}).addedBy) {
              // ★ 员工账号：{type:'free'} 查不到自身记录（员工是 type:'staff'）
              // 通过 shopPhone 反查店主记录，获取 shopTel / shopAddr
              var _staffShopInfo = wx.getStorageSync('shopInfo') || {}
              var _sp = _staffShopInfo.shopPhone || _staffShopInfo.phone || ''
              if (_sp) {
                db.collection('repair_activationCodes')
                  .where({ type: 'free', phone: _sp })
                  .field({ shopTel: true, shopAddr: true, name: true, code: true, expireTime: true, createTime: true, shopCode: true })
                  .limit(1)
                  .get({
                    success: function (ownerRes) {
                      if (ownerRes.data && ownerRes.data.length > 0) {
                        var or = ownerRes.data[0]
                        // 批量 setData（合并 6 次独立调用）
                        var patch = {}
                        if (or.shopTel) {
                          patch.shopTel = or.shopTel
                          wx.setStorageSync('shopTel', or.shopTel)
                        }
                        if (or.shopAddr) {
                          patch.shopAddr = or.shopAddr
                          wx.setStorageSync('shopAddr', or.shopAddr)
                        }
                        if (or.name) {
                          patch.shopName = or.name
                          wx.setStorageSync('shopName', or.name)
                        }
                        if (or.createTime) patch.registerDate = util.formatDate(or.createTime)
                        if (or.shopCode) patch.shopCode = or.shopCode
                        page.setData(patch)
                        // 同步到 shopInfo 缓存
                        _staffShopInfo.shopTel = or.shopTel || _staffShopInfo.shopTel || ''
                        _staffShopInfo.shopAddr = or.shopAddr || _staffShopInfo.shopAddr || ''
                        _staffShopInfo.name = or.name || _staffShopInfo.name || ''
                        _staffShopInfo.cloudRecord = or
                        wx.setStorageSync('shopInfo', _staffShopInfo)
                        // Pro 状态从店主记录判断
                        var _sPro = page.checkProFromRecord(or)
                        page.setData({ isPro: _sPro, isAdmin: false })
                        wx.setStorageSync('isPro', _sPro)
                        page.updateVersionLabels(or)
                      }
                    },
                    fail: function () { /* 静默 */ }
                  })
              }
            }
            // 加载 Pro 激活数量
            page._loadProActivatedCount()
          },
          fail: function (err) {
            console.error('加载门店信息失败', err)
            page.setData({ isPro: !!wx.getStorageSync('isPro'), isAdmin: app.isAdmin() })
            page.updateVersionLabels()
          }
        })
    } catch (err) {
      console.error('加载门店信息异常', err)
      page.setData({ isPro: !!wx.getStorageSync('isPro'), isAdmin: app.isAdmin() })
      page.updateVersionLabels()
    }
  },

  // 加载已用工单数量
  loadUsedCount: function () {
    var page = this
    var db = app.db()
    try {
      var where = app.shopWhere()
      // 无 shopPhone 时跳过查询，防止泄漏全店数据
      if (!where.shopPhone) {
        console.warn('loadUsedCount 跳过：shopPhone 为空')
        return
      }
      where.isVoided = db.command.neq(true)
      db.collection('repair_orders').where(where).count({
        success: function (res) {
          page.setData({ usedCount: res.total })
        },
        fail: function (err) {
          console.error('加载工单数量失败', err)
        }
      })
    } catch (err) {
      console.error('加载工单数量异常', err)
    }
  },

  /**
   * 更新版本和有效期标签
   * @param {Object} [record] 云数据库记录（用于读取 expireTime 字段）
   */
  updateVersionLabels: function (record) {
    var isPro = this.data.isPro
    var ver = constants.APP_VERSION
    var versionLabel = ver + ' 免费版'
    var expireLabel = '无'

    if (isPro) {
      versionLabel = ver + ' Pro版'
      if (record && record.expireTime) {
        expireLabel = util.formatDateTime(record.expireTime)
      } else {
        expireLabel = '永久有效'
      }
    }

    this.setData({ versionLabel: versionLabel, expireLabel: expireLabel })
  },

  // 激活码输入
  onCodeInput: function (e) {
    this.setData({
      activationCode: e.detail.value.trim()
    })
  },

  // 解锁Pro（输入激活码写入 unlockKey 字段）
  onUnlock: function () {
    var page = this
    var db = app.db()
    var activationCode = page.data.activationCode

    if (!activationCode) {
      app.toastFail('请输入激活码')
      return
    }

    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var currentPhone = shopInfo.phone || ''
    if (!currentPhone) {
      app.toastFail('请先绑定联系电话')
      return
    }

    if (!util.isValidActivationCode(activationCode)) {
      app.toastFail('激活码格式不正确')
      return
    }

    if (page.data.unlocking) return
    page.setData({ unlocking: true })
    app.showLoading('激活中...')

    // 获取当前openid
    app.getOpenId().then(function (currentOpenId) {
      if (!currentOpenId) {
        page.setData({ unlocking: false })
        app.hideLoading()
        app.toastFail('网络异常，请重试')
        return
      }

      // 查找当前门店记录
      var query = { type: 'free' }
      var openid = wx.getStorageSync('openid') || ''
      if (openid) {
        query.openid = openid
      }

      db.collection('repair_activationCodes')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()
        .then(function (res) {
          if (!res.data || res.data.length === 0) {
            throw new Error('NOT_FOUND')
          }

          var shopRecord = res.data[0]

          // 校验激活码：兼容大小写字段名（unlockKey / unlockkey）
          var dbUnlockKey = (shopRecord.unlockKey || shopRecord.unlockkey || '').trim()

          if (activationCode.toLowerCase() !== dbUnlockKey.toLowerCase()) {
            throw new Error('CODE_WRONG')
          }

          // 验证成功：通过云函数写入 code + expireTime，并清除 unlockKey
          return util.callRepair('activatePro', { code: activationCode })
        })
        .then(function (result) {
          if (!result || result.code !== 0) {
            throw new Error((result && result.msg) || '激活失败')
          }

          // 激活成功 → 更新本地缓存
          wx.setStorageSync('isPro', true)
          wx.setStorageSync('proType', 'year')
          wx.setStorageSync('proActivationTime', new Date().toISOString())

          // 更新 shopInfo 中的云端记录缓存
          var cachedShopInfo = wx.getStorageSync('shopInfo') || {}
          if (cachedShopInfo.cloudRecord) {
            cachedShopInfo.cloudRecord.code = activationCode
            var exp = new Date()
            exp.setFullYear(exp.getFullYear() + 1)
            cachedShopInfo.cloudRecord.expireTime = exp.toISOString()
          } else {
            cachedShopInfo.cloudRecord = {
              code: activationCode,
              expireTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            }
          }
          wx.setStorageSync('shopInfo', cachedShopInfo)

          page.setData({
            isPro: true,
            unlocking: false
          })
          page.updateVersionLabels(cachedShopInfo.cloudRecord)

          // ★ 已激活，顶部标题改为"AI养车 Pro版"
          wx.setNavigationBarTitle({ title: 'AI养车 Pro版' })

          app.hideLoading()
          app.toastSuccess('Pro版激活成功！')
        })
    }).catch(function (err) {
      console.error('激活失败', err)
      page.setData({ unlocking: false })
      app.hideLoading()
      if (err.message === 'NOT_FOUND') {
        app.toastFail('未找到门店信息')
      } else if (err.message === 'CODE_WRONG') {
        app.toastFail('激活码不正确')
      } else {
        app.toastFail(err.message || '激活失败，请重试')
      }
    })
  },

  // 修改门店名称
  onEditShopName: function () {
    if (!this.data.isOwner) {
      wx.showToast({ title: '仅超级管理员可修改', icon: 'none' })
      return
    }
    var page = this
    wx.showModal({
      title: '修改门店名称',
      editable: true,
      placeholderText: '请输入新的门店名称',
      content: page.data.shopName,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var newName = res.content.trim()
          util.callRepair('updateShopInfo', { field: 'name', value: newName })
          page.setData({ shopName: newName })
          wx.setStorageSync('shopName', newName)
          var shopInfo = wx.getStorageSync('shopInfo') || {}
          shopInfo.name = newName
          wx.setStorageSync('shopInfo', shopInfo)
          wx.showToast({ title: '已更新', icon: 'success' })
        }
      }
    })
  },

  // 编辑显示名称
  onEditDisplayName: function () {
    var page = this
    wx.showModal({
      title: '编辑显示名称',
      editable: true,
      placeholderText: '如：张师傅、小王',
      content: page.data.displayName || '',
      success: function (res) {
        if (res.confirm) {
          var name = (res.content || '').trim()
          page.setData({ displayName: name })
          // 写入云端（使用专用 action，员工管理员也能自助修改）
          util.callRepair('updateMyDisplayName', { value: name }).then(function (res) {
            if (res && res.code === 0) {
              wx.showToast({ title: '已保存', icon: 'success' })
            } else {
              wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
            }
          }).catch(function () {
            wx.showToast({ title: '网络异常', icon: 'none' })
          })
          // 更新本地缓存
          var shopInfo = wx.getStorageSync('shopInfo') || {}
          shopInfo.displayName = name
          wx.setStorageSync('shopInfo', shopInfo)
        }
      }
    })
  },


  // 查看隐私政策
  onGoPrivacy: function () {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  },

  // 查看用户服务协议
  onGoAgreement: function () {
    wx.navigateTo({ url: '/pages/userAgreement/userAgreement' })
  },

  // 编辑门店联系电话
  onEditShopTel: function () {
    if (!this.data.isOwner) {
      wx.showToast({ title: '仅超级管理员可修改', icon: 'none' })
      return
    }
    var page = this
    wx.showModal({
      title: '门店联系电话',
      editable: true,
      placeholderText: '请输入门店联系电话',
      content: page.data.shopTel,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var tel = res.content.trim()
          page.setData({ shopTel: tel })
          page._updateShopField('shopTel', tel)
          wx.setStorageSync('shopTel', tel)
        }
      }
    })
  },

  // 编辑门店地址
  onEditShopAddr: function () {
    if (!this.data.isOwner) {
      wx.showToast({ title: '仅超级管理员可修改', icon: 'none' })
      return
    }
    var page = this
    wx.showModal({
      title: '门店地址',
      editable: true,
      placeholderText: '请输入门店地址',
      content: page.data.shopAddr,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var addr = res.content.trim()
          page.setData({ shopAddr: addr })
          page._updateShopField('shopAddr', addr)
          wx.setStorageSync('shopAddr', addr)
        }
      }
    })
  },

  // 更新云端门店字段
  _updateShopField: function (field, value) {
    util.callRepair('updateShopInfo', { field: field, value: value }).then(res => {
      if (res && res.code === 0) {
        wx.showToast({ title: '已保存', icon: 'success' })
      } else {
        wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  },

  // 跳转数据导出页（仅 Pro+超级管理员可用）
  onGoDataExport: function () {
    if (!this.data.isPro || !this.data.isOwner) {
      wx.showToast({ title: '仅超级管理员可使用此功能', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/dataExport/dataExport' })
  },

  // 复制门店码
  onCopyShopCode: function () {
    var code = this.data.shopCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '门店码已复制', icon: 'success' })
      }
    })
  },

  // 切换联系客服展开/收起
  toggleContact: function () {
    this.setData({ contactExpanded: !this.data.contactExpanded })
  },

  // 复制微信号到剪贴板
  onCopyWechat: function () {
    wx.setClipboardData({
      data: constants.SERVICE_WECHAT,
      success: function () {
        wx.showToast({ title: '微信号已复制', icon: 'success' })
      }
    })
  },

  // 拨打客服电话（失败时复制号码）
  onCallPhone: function () {
    wx.makePhoneCall({
      phoneNumber: constants.SERVICE_PHONE,
      fail: function () {
        wx.setClipboardData({
          data: constants.SERVICE_PHONE,
          success: function () {
            wx.showToast({ title: '电话号码已复制', icon: 'success' })
          }
        })
      }
    })
  },

  // 切换门店码展开/收起
  toggleShopCode: function () {
    this.setData({ shopCodeExpanded: !this.data.shopCodeExpanded })
  },

  // 游客模式 - 跳转登录/注册
  onGuestLogin: function () {
    wx.reLaunch({ url: '/pages/welcome/welcome' })
  },

  // 跳转视频号使用帮助（小程序端）
  onGoVideoHelp: function () {
    wx.openChannelsUserProfile({
      finderUserName: 'sphcnacQ1SzOvLi',
      fail: function (err) {
        console.error('打开视频号失败', err)
        wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
      }
    })
  },

  // 多端端使用帮助提示（视频号仅小程序可用）
  onGoVideoHelpMultiEnd: function () {
    wx.showToast({ title: '仅小程序端可用', icon: 'none' })
  },

  // 切换使用帮助展开/收起
  toggleUseHelp: function () {
    this.setData({ useHelpExpanded: !this.data.useHelpExpanded })
  },

  // 跳转公众号教程
  onGoOfficialAccount: function () {
    if (this.data._isMultiEnd) {
      wx.showToast({ title: '仅小程序端可用', icon: 'none' })
      return
    }
    wx.openOfficialAccountProfile({
      username: 'gh_6bab9224241b',
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          console.log('用户取消打开公众号')
          return
        }
        console.error('打开公众号失败', err)
        wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
      }
    })
  },

  // ===========================
  // v6.0.5 员工管理员退出登录
  // ===========================

  /** 员工管理员退出登录 - 调用 app.staffLogout() 统一处理确认弹窗和跳转 */
  onStaffLogout: function () {
    getApp().staffLogout()
  },

  // ===========================
  // 账号类型标签
  // ===========================

  _updateRoleLabel: function () {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var role = app.getRole()
    var _addedBy = !!shopInfo.addedBy
    // ★ 方案B：用 addedBy 替代 type 判断员工身份（type 未写入缓存，addedBy 已正确缓存）
    var _isStaffType = _addedBy
    // 判断依据：openid(店主标识) / staffOpenid(员工标识) / addedBy(被添加标记) / role(角色)
    var hasIdentity = !!(shopInfo.openid || shopInfo.staffOpenid)
    var isOwner = !!(hasIdentity && !_addedBy && !_isStaffType)
    var isStaff = _addedBy || _isStaffType
    var roleLabel = ''
    var roleTagClass = ''
    if (isOwner) {
      roleLabel = '超级管理员'
      roleTagClass = 'tag-super-admin'
    } else if (role === 'admin') {
      roleLabel = '管理员'
      roleTagClass = 'tag-admin-role'
    } else if (role === 'staff') {
      roleLabel = '店员'
      roleTagClass = 'tag-staff-role'
    }
    // ★ 管理员员工标识（非超级管理员、有 addedBy、role=admin）
    var isAdminRole = !isOwner && role === 'admin' && isStaff
    this.setData({ isOwner: isOwner, isStaff: isStaff, addedBy: isStaff, roleLabel: roleLabel, roleTagClass: roleTagClass, isAdminRole: isAdminRole })
  },

  /**
   * 更新 isOwner 标志（是否超级管理员/注册者本人）
   */
  _updateOwnerFlag: function () {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var _addedBy2 = !!shopInfo.addedBy
    // ★ 方案B：用 addedBy 替代 type 判断员工身份（type 未写入缓存，addedBy 已正确缓存）
    var _isStaffType2 = _addedBy2
    // 判断依据：openid(店主标识) / staffOpenid(员工标识) / addedBy(被添加标记) / role(角色)
    var isGuest = !!(shopInfo.isGuest || wx.getStorageSync('isGuestMode') === 'yes')
    var hasIdentity2 = !!(shopInfo.openid || shopInfo.staffOpenid)
    var isOwner = isGuest || !!(hasIdentity2 && !_addedBy2 && !_isStaffType2 && shopInfo.role === 'admin')
    this.setData({ isOwner: isOwner, addedBy: _addedBy2 || _isStaffType2 })
  },

  // ===========================
  // v4.0.0 员工管理
  // ===========================

  toggleStaff: function () {
    var page = this
    var expanded = !this.data.staffExpanded
    this.setData({ staffExpanded: expanded })
    if (expanded && app.isSuperAdmin() && app.isPro()) {
      this.loadStaffList()
    }
  },

  loadStaffList: function () {
    var page = this
    util.callRepair('listStaffs', { shopPhone: app.getShopPhone() })
      .then(function (res) {
        if (res.code === 0) {
          page.setData({ staffList: res.data.list || [] })
        }
      })
      .catch(function () {})
  },

  onStaffPhoneInput: function (e) {
    this.setData({ staffPhoneInput: (e.detail.value || '').replace(/\D/g, '') })
  },

  onStaffDisplayNameInput: function (e) {
    this.setData({ staffDisplayNameInput: (e.detail.value || '').trim() })
  },

  onStaffRoleChange: function (e) {
    this.setData({ staffRoleIndex: Number(e.detail.value) })
  },

  onAddStaff: function () {
    var page = this
    var phone = page.data.staffPhoneInput
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      app.toastFail('请输入正确的11位手机号')
      return
    }
    var role = page.data.staffRoleOptions[page.data.staffRoleIndex].value
    var displayName = page.data.staffDisplayNameInput
    page.setData({ staffAdding: true })
    util.callRepair('addStaff', { staffPhone: phone, staffRole: role, staffDisplayName: displayName, shopPhone: app.getShopPhone() })
      .then(function (res) {
        page.setData({ staffAdding: false })
        if (res.code === 0) {
          app.toastSuccess(res.msg || '添加成功')
          page.setData({ staffPhoneInput: '', staffDisplayNameInput: '' })
          page.loadStaffList()
        } else {
          app.toastFail(res.msg || '添加失败')
        }
      })
      .catch(function () {
        page.setData({ staffAdding: false })
        app.toastFail('网络异常')
      })
  },

  onRemoveStaff: function (e) {
    var page = this
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认移除',
      content: '移除后该员工将无法登录',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (!res.confirm) return
        util.callRepair('removeStaff', { staffDocId: id, shopPhone: app.getShopPhone() })
          .then(function (res) {
            if (res.code === 0) {
              app.toastSuccess('已移除')
              page.loadStaffList()
            } else {
              app.toastFail(res.msg || '操作失败')
            }
          })
      }
    })
  },

  onToggleStaffRole: function (e) {
    var page = this
    var id = e.currentTarget.dataset.id
    var currentRole = e.currentTarget.dataset.role
    var newRole = currentRole === 'staff' ? 'admin' : 'staff'
    var roleLabel = newRole === 'admin' ? '管理员' : '店员'
    wx.showModal({
      title: '修改角色',
      content: '确认将该员工设为' + roleLabel + '？',
      success: function (res) {
        if (!res.confirm) return
        util.callRepair('updateStaffRole', { staffDocId: id, newRole: newRole, shopPhone: app.getShopPhone() })
          .then(function (res) {
            if (res.code === 0) {
              app.toastSuccess('已更新')
              page.loadStaffList()
            } else {
              app.toastFail(res.msg || '操作失败')
            }
          })
      }
    })
  },

  // ====== v5.0.0 门店设置（经营诊断配置） ======

  // 切换系统设置展开/收起
  toggleSystemSettings: function () {
    var expanded = !this.data.systemSettingsExpanded
    this.setData({ systemSettingsExpanded: expanded })
    if (expanded) {
      // 展开时预加载数据
      if (this.data.isOwner) {
        this._loadShopProfile()
      }
      this._loadNavConfig()
      // 隐藏自定义 TabBar，防止 picker 确定/取消按钮被遮挡
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().hide()
      }
    } else {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().show()
      }
    }
  },

  // 加载已有门店配置
  _loadShopProfile: function () {
    var page = this
    util.callRepair('getShopProfile', { shopPhone: app.getShopPhone() })
      .then(function (res) {
        if (res.code === 0 && res.data) {
          var bayCount = res.data.bayCount || 2
          var idx = Math.max(0, Math.min(bayCount - 1, page.data.bayCountOptions.length - 1))
          page.setData({
            shopBayCount: bayCount,
            shopBayCountIndex: idx,
            shopOpenYear: String(res.data.openYear || new Date().getFullYear())
          })
        }
      })
      .catch(function () { /* 静默 */ })
  },

  onBayCountChange: function (e) {
    var idx = parseInt(e.detail.value)
    var val = parseInt(this.data.bayCountOptions[idx])
    this.setData({ shopBayCount: val, shopBayCountIndex: idx })
  },

  onOpenYearChange: function (e) {
    var val = e.detail.value
    if (val) {
      this.setData({ shopOpenYear: val.substring(0, 4) })
    }
  },

  onSaveShopProfile: function () {
    var page = this
    page.setData({ shopProfileSaving: true })

    util.callRepair('updateShopProfile', {
      bayCount: page.data.shopBayCount,
      openYear: parseInt(page.data.shopOpenYear)
    }).then(function (res) {
      page.setData({ shopProfileSaving: false })
      if (res.code === 0) {
        app.toastSuccess('已保存')
        // 清除月报页面缓存，引导用户刷新获取新基准值
        try {
          wx.removeStorageSync('monthlyReportCache')
          // 兼容多 tab 缓存格式
          var keys = ['reportCache_week', 'reportCache_month', 'reportCache_year']
          keys.forEach(function (k) { try { wx.removeStorageSync(k) } catch (e) {} })
        } catch (e) {}
        // 延迟弹出引导提示
        setTimeout(function () {
          wx.showModal({
            title: '设置已更新',
            content: '经营诊断基准已按新工位数调整，请前往「AI月报」页面下拉刷新查看最新报告',
            confirmText: '前往月报',
            success: function (modalRes) {
              if (modalRes.confirm) {
                wx.navigateTo({ url: '/pages/monthlyReport/monthlyReport' })
              }
            }
          })
        }, 600)
        // 清除引导标记，下次可重新触发引导
        try { wx.removeStorageSync('monthlyReportGuideShown') } catch (e) {}
      } else {
        app.toastFail(res.msg || '保存失败')
      }
    }).catch(function () {
      page.setData({ shopProfileSaving: false })
      app.toastFail('网络异常')
    })
  },

  // ===========================
  // Pro 激活数量查询（体验价进度条）
  // ===========================

  _loadProActivatedCount: function () {
    var page = this
    try {
      var db = app.db()
      db.collection('repair_activationCodes')
        .where({ code: db.command.exists(true) })
        .count({
          success: function (res) {
            var count = res.total || 0
            // 显示数量 = 100 + 实际激活数
            var displayCount = (100 + count).toString()
            // 进度百分比，最大100%
            var percent = Math.min(100, Math.round(((100 + count) / 300) * 100))
            page.setData({
              proActivatedCount: displayCount,
              proProgressPercent: percent
            })
          },
          fail: function () {
            // 兜底显示
            page.setData({
              proActivatedCount: '100+',
              proProgressPercent: 33
            })
          }
        })
    } catch (e) {
      page.setData({
        proActivatedCount: '100+',
        proProgressPercent: 33
      })
    }
  },

  // ===========================
  // #11 下载APP入口
  // ===========================

  onDownloadApp: function () {
    wx.showModal({
      title: '下载手机APP',
      content: '请联系客服下载和安装。',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  // ====== v5.4.0 导航栏设置（即时生效） ======

  _loadNavConfig: function () {
    var config = wx.getStorageSync('navTabConfig') || { member: true, car: false }
    this.setData({ navTabs: { member: config.member !== false, car: config.car === true } })
  },

  onToggleNavTab: function (e) {
    var key = e.currentTarget.dataset.key
    var navTabs = this.data.navTabs
    navTabs[key] = !navTabs[key]
    this.setData({ navTabs: navTabs })
    // 即时保存 + 刷新 TabBar
    wx.setStorageSync('navTabConfig', { member: navTabs.member, car: navTabs.car })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }
  }
})
