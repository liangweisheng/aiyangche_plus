// pages/welcome/welcome.js
// 欢迎/初始化页面 - 登录（手机号+门店码） + 注册新门店 + 隐私弹窗确认

const util = require('../../utils/util')
const app = getApp()

Page({
  data: {
    mode: 'login', // 'login' 登录 | 'register' 注册
    showPrivacyModal: false, // 隐私弹窗控制
    privacyChecked: false, // 隐私条款勾选状态
    shopName: '',
    phone: '',
    shopCode: '',
    submitting: false
  },

  onLoad(options) {
    var page = this
    var agreed = wx.getStorageSync('privacyAgreed') || ''
    var initMode = (options && options.mode) || ''

    // 已有正式 shopInfo（非游客）→ 直接进 dashboard
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    // 修复：记住游客缓存，取消登录时恢复
    var wasGuest = !!(shopInfo.isGuest || shopInfo.phone === '13507720000' || wx.getStorageSync('isGuestMode'))
    if (wasGuest) {
      page._guestShopInfo = JSON.parse(JSON.stringify(shopInfo))
      page._guestMode = wx.getStorageSync('isGuestMode')
    } else {
      page._guestShopInfo = null
      page._guestMode = null
    }
    // 已有正式账号（非游客）且有 phone → 直接进 dashboard
    // ★ 多端模式例外：必须强制走登录页验证（不能信任本地缓存自动跳过）
    var _isMultiEnd = getApp().globalData._isMultiEndMode
    if (shopInfo && shopInfo.phone && !wasGuest && initMode !== 'force' && !_isMultiEnd) {
      wx.reLaunch({ url: '/pages/dashboard/dashboard' })
      return
    }

    // 设置 mode
    page.setData({
      mode: initMode === 'register' ? 'register' : 'login',
      _isMultiEnd: _isMultiEnd
    })

    // login 模式且未同意过隐私 → 自动弹出隐私确认弹窗
    if (!agreed && initMode !== 'register') {
      this.setData({ showPrivacyModal: true })
    }
  },

  // ===========================
  // 隐私弹窗
  // ===========================

  // 查看隐私政策
  onGoPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  },

  // 查看用户协议
  onGoAgreement() {
    wx.navigateTo({ url: '/pages/userAgreement/userAgreement' })
  },

  // 弹窗内同意隐私 → 关闭弹窗，留在当前页面继续操作
  onAgreeFromModal() {
    if (!this.data.privacyChecked) {
      wx.showToast({ title: '请先勾选同意隐私条款', icon: 'none' })
      return
    }
    wx.setStorageSync('privacyAgreed', 'yes')
    this.setData({ showPrivacyModal: false, privacyChecked: false })
  },

  // 切换隐私条款勾选状态
  onTogglePrivacyCheck() {
    this.setData({ privacyChecked: !this.data.privacyChecked })
  },

  // 弹窗内取消 / 点击蒙层 → 小程序回退游客 / 多端模式关闭弹窗留页
  onCancelPrivacyModal() {
    var page = this
    var _isMultiEnd = getApp().globalData._isMultiEndMode
    // ★ 多端模式：仅关闭弹窗，留在登录页
    if (_isMultiEnd) {
      page.setData({ showPrivacyModal: false })
      return
    }

    // 小程序模式：恢复游客缓存并回退到 dashboard
    page.setData({ showPrivacyModal: false })
    // 恢复游客缓存（如果之前是游客）
    if (page._guestShopInfo) {
      wx.setStorageSync('shopInfo', page._guestShopInfo)
      if (page._guestMode) wx.setStorageSync('isGuestMode', page._guestMode)
    }
    setTimeout(function () {
      wx.reLaunch({ url: '/pages/dashboard/dashboard' })
    }, 200)
  },

  // 点击蒙层也视为取消
  onClosePrivacyModal() {
    this.onCancelPrivacyModal()
  },

  // 取消登录 → 小程序回退游客 / 多端模式留在登录页
  onCancelLogin() {
    var _isMultiEnd = getApp().globalData._isMultiEndMode
    // ★ 多端模式：不允许取消/跳过，必须登录
    if (_isMultiEnd) {
      app.toastFail('App端需要登录后才能使用')
      return
    }

    // 小程序模式：恢复游客缓存并回退
    if (this._guestShopInfo) {
      wx.setStorageSync('shopInfo', this._guestShopInfo)
      if (this._guestMode) wx.setStorageSync('isGuestMode', this._guestMode)
    }
    wx.reLaunch({ url: '/pages/dashboard/dashboard' })
  },

  // 切换到注册
  // ★ 多端模式（Android/iOS）不允许注册，仅允许通过手机号+门店码登录
  switchToRegister() {
    // 检测是否为多端模式
    var isMultiEnd = getApp().globalData._isMultiEndMode
    if (isMultiEnd) {
      wx.showToast({ title: 'App端暂不支持注册，请在微信小程序中完成注册', icon: 'none', duration: 3000 })
      return
    }
    this.setData({ mode: 'register' })
  },

  // 切换到登录
  switchToLogin() {
    this.setData({ mode: 'login' })
  },

  // 联系客服（忘记门店码）
  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服号码：17807725166',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 门店名称输入
  onNameInput(e) {
    this.setData({ shopName: e.detail.value.trim() })
  },

  // 手机号输入（仅保留数字）
  onPhoneInput(e) {
    this.setData({ phone: (e.detail.value || '').replace(/\D/g, '') })
  },

  // 门店码输入（仅保留数字）
  onCodeInput(e) {
    this.setData({ shopCode: (e.detail.value || '').replace(/\D/g, '') })
  },

  // ===========================
  // 登录（手机号 + 门店码）
  // ===========================
  onLogin() {
    var page = this
    var db = app.db()
    var phone = page.data.phone
    var shopCode = page.data.shopCode

    if (!util.isValidPhone(phone)) { app.toastFail('请输入正确的11位手机号'); return }
    if (shopCode.length !== 6) { app.toastFail('请输入6位数字门店码'); return }

    if (page.data.submitting) return
    page.setData({ submitting: true })
    app.showLoading('登录中...')

    // v4.0.0：同时查管理员和员工记录
    Promise.all([
      db.collection('repair_activationCodes')
        .where({ type: 'free', phone: phone, shopCode: shopCode })
        .limit(1).get(),
      db.collection('repair_activationCodes')
        .where({ type: 'staff', phone: phone, status: 'active' })
        .limit(1).get()
    ]).then(function (results) {
      var record = null
      // 优先匹配管理员（phone+shopCode 都对）
      if (results[0].data && results[0].data.length > 0) {
        var adminRecord = results[0].data[0]
        if (adminRecord.shopCode === shopCode) {
          // ★ 多端模式：跳过 openid 安全校验（多端无法获取微信openid）
          //    直接信任 phone+shopCode 匹配结果
          var _isMultiEndLogin = getApp().globalData._isMultiEndMode
          if (!_isMultiEndLogin) {
            // 小程序模式：安全校验 - 管理员账号登录必须 openid 匹配
            var cachedOpenid = wx.getStorageSync('openid') || ''

            // 已绑定 openid → 必须严格匹配，不匹配直接拒绝
            if (adminRecord.openid && cachedOpenid && adminRecord.openid !== cachedOpenid) {
              page.setData({ submitting: false })
              app.hideLoading()
              setTimeout(function () {
                app.toastFail('该账号已注册，请使用注册时的微信号登录')
              }, 100)
              return Promise.resolve({ record: null, isStaff: false, _toastShown: true })
            }

            // 未绑定 openid 但已注册过(有 createTime) → 仅允许首次绑定（此微信号）
            if (!adminRecord.openid && adminRecord.createTime && cachedOpenid) {
              util.callRepair('updateOpenid', { docId: adminRecord._id }).catch(function () {})
            }
          }
          // ★ 多端模式到此结束，不执行上述 openid 校验

          record = adminRecord
        }
      } else {
        // 未命中管理员记录
      }
      // 其次匹配员工（phone 对即可，通过 shopPhone 找到店主）
      if (!record && results[1].data && results[1].data.length > 0) {
        var staffRecord = results[1].data[0]
        // 查询员工所属店主的 shopCode
        return db.collection('repair_activationCodes')
          .where({ type: 'free', phone: staffRecord.shopPhone })
          .field({ shopCode: true, name: true, shopTel: true, shopAddr: true })
          .limit(1)
          .get()
          .then(function (ownerRes) {
            var owner = ownerRes.data && ownerRes.data[0]
            var ownerShopCode = (owner && owner.shopCode) || ''
            if (ownerShopCode === shopCode) {
              return { record: staffRecord, isStaff: true, ownerName: (owner && owner.name) || '', ownerTel: (owner && owner.shopTel) || '', ownerAddr: (owner && owner.shopAddr) || '' }
            }
            return { record: null, isStaff: false }
          })
      }
      return { record: record, isStaff: false }
    }).then(function (result) {
      if (!result.record) {
        if (!result._toastShown) {
          page.setData({ submitting: false })
          app.hideLoading()
          // 延迟显示toast，避免与hideLoading时序冲突
          setTimeout(function () {
            app.toastFail('手机号或门店码不正确')
          }, 100)
        } else {
          page.setData({ submitting: false })
          app.hideLoading()
        }
        return
      }

      var record = result.record
      var isStaff = result.isStaff

      // 获取 openid 并更新到数据库
      app.getOpenId().then(function (openid) {
        if (openid) {
          if (isStaff) {
            util.callRepair('updateStaffOpenid', { staffDocId: record._id, openid: openid }).catch(function () {})
          }
          // ★ 管理员不再更新 openid（防止覆盖，已在上方守卫处理首次绑定）
        }

        // 写入本地缓存
        var roleText = isStaff ? '店员' : ''
        var shopInfo = {
          name: isStaff ? (result.ownerName || '') : (record.name || ''),
          phone: record.phone || '',
          openid: openid || record.openid || '',
          staffOpenid: record.staffOpenid || '',
          shopCode: record.shopCode || shopCode,
          createTime: record.createTime || '',
          cloudRecord: record,
          role: isStaff ? (record.role || 'staff') : 'admin',
          shopPhone: isStaff ? (record.shopPhone || '') : (record.phone || ''),
          addedBy: record.addedBy || '',
          shopTel: isStaff ? (result.ownerTel || '') : (record.shopTel || ''),
          shopAddr: isStaff ? (result.ownerAddr || '') : (record.shopAddr || ''),
          // 标记平台来源（多端模式需注入 clientPhone 供服务端鉴权）
          _platform: getApp().globalData._isMultiEndMode ? 'multiend' : 'miniprogram'
        }
        wx.setStorageSync('shopInfo', shopInfo)
        wx.setStorageSync('shopName', shopInfo.name || '')
        wx.setStorageSync('roleLabel', roleText)
        // 同步门店联系方式到独立缓存（proUnlock 等页面直接读取）
        if (shopInfo.shopTel) { wx.setStorageSync('shopTel', shopInfo.shopTel) }
        if (shopInfo.shopAddr) { wx.setStorageSync('shopAddr', shopInfo.shopAddr) }
        wx.removeStorageSync('isGuestMode')
        if (openid) {
          wx.setStorageSync('openid', openid)
        }

        // 恢复全局数据
        var realShopPhone = shopInfo.shopPhone || shopInfo.phone
        app.globalData.shopName = shopInfo.name || ''
        app.globalData.shopPhone = realShopPhone
        app.globalData.shopInfo = shopInfo

        // 员工继承店主 Pro 状态
        if (isStaff && realShopPhone) {
          app._getProStatusAsync().then(function () {})
        } else {
          app.syncProStatus({ docId: record._id }).catch(function () {})
        }

        app.hideLoading()
        app.toastSuccess(isStaff ? '员工登录成功' : '登录成功')

        setTimeout(function () {
          wx.reLaunch({ url: '/pages/dashboard/dashboard' })
        }, 1000)
      }).catch(function (err) {
        console.error('获取openid失败', err)
        page.setData({ submitting: false })
        app.hideLoading()
        app.toastFail('登录异常，请重试')
      })
    })
      .catch(function (err) {
        console.error('登录查询失败', err)
        page.setData({ submitting: false })
        app.hideLoading()
        app.toastFail('网络异常，请重试')
      })
  },

  // ===========================
  // 注册新门店
  // ===========================
  onSubmit() {
    var page = this
    var db = app.db()
    var shopName = page.data.shopName
    var phone = page.data.phone

    if (!shopName) { app.toastFail('请输入门店名称'); return }
    if (!phone) { app.toastFail('请输入联系电话'); return }
    if (!util.isValidPhone(phone)) { app.toastFail('请输入正确的11位手机号'); return }

    if (page.data.submitting) return
    page.setData({ submitting: true })
    app.showLoading('注册中...')

    db.collection('repair_activationCodes')
      .where({ type: 'free', phone: phone })
      .count()
      .then(function (res) {
        if (res.total > 0) {
          page.setData({ submitting: false })
          app.hideLoading()
          app.toastFail('该手机号已注册，请直接登录')
          page.setData({ mode: 'login', shopName: '' })
          return
        }

        return app.getOpenId().then(function (openid) {
          return util.callRepair('registerShop', { name: shopName, phone: phone, openid: openid || '' })
        })
      })
      .then(function (res) {
        if (!res || res.code !== 0) return

        var serverShopCode = (res.data && res.data.shopCode) || ''
        var openid = wx.getStorageSync('openid') || ''
        var shopInfo = {
          name: shopName,
          phone: phone,
          openid: openid,
          shopCode: serverShopCode,
          createTime: new Date().toISOString(),
          role: 'admin',
          shopPhone: phone
        }
        wx.setStorageSync('shopInfo', shopInfo)
        wx.setStorageSync('shopName', shopName)
        wx.removeStorageSync('isGuestMode')
        if (openid) {
          wx.setStorageSync('openid', openid)
        }

        app.globalData.shopName = shopName
        app.globalData.shopPhone = phone
        app.globalData.shopInfo = shopInfo

        app.hideLoading()

        wx.showModal({
          title: '注册成功',
          content: '您的门店码为：' + serverShopCode + '\n请牢记此门店码，下次登录时需要使用',
          showCancel: false,
          confirmText: '知道了'
        })

        setTimeout(function () {
          wx.reLaunch({ url: '/pages/dashboard/dashboard' })
        }, 1500)
      })
      .catch(function (err) {
        console.error('注册异常', err)
        page.setData({ submitting: false })
        app.hideLoading()
        app.toastFail('网络异常，请重试')
      })
  }
})
