// pages/splash/splash.js
// Splash 启动页：品牌 Logo + 等待自动登录完成 → 跳转对应页面

var app = getApp()

Page({
  data: {
    statusText: '正在加载...'
  },

  onLoad() {
    var page = this

    // 状态文字轮播，让用户感知到在加载
    var texts = ['正在加载...', '正在识别身份...', '正在初始化...']
    var textIdx = 0
    var textTimer = setInterval(function () {
      textIdx = (textIdx + 1) % texts.length
      page.setData({ statusText: texts[textIdx] })
    }, 1500)

    // 等待 app.js 的 _autoLogin 完成
    // app.autoLoginPromise 在 _checkPrivacyAgreement 中赋值
    var loginPromise = app.autoLoginPromise || Promise.resolve()

    loginPromise.then(function () {
      clearInterval(textTimer)
      page._navigateNext()
    }).catch(function () {
      clearInterval(textTimer)
      page._navigateNext()
    })
  },

  /**
   * 根据当前登录状态决定跳转目标
   */
  _navigateNext() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var isGuest = !!(shopInfo.isGuest || shopInfo.phone === '13507720000' || wx.getStorageSync('isGuestMode'))
    var isRegistered = !!(shopInfo.phone && !isGuest)

    // ★ v5.1.0 多端模式：未注册用户必须走登录页（不能直接进 dashboard）
    var _isMultiEnd = (app.globalData && app.globalData._isMultiEndMode)
    if (_isMultiEnd && !isRegistered) {
      console.log('[splash] 多端模式+未注册 → 跳转登录页')
      wx.reLaunch({ url: '/pages/welcome/welcome?mode=login' })
      return
    }

    if (isRegistered) {
      // 已注册用户 → dashboard
      wx.switchTab({ url: '/pages/dashboard/dashboard' })
    } else {
      // 新用户/游客 → dashboard（游客模式）
      wx.switchTab({ url: '/pages/dashboard/dashboard' })
    }
  }
})
