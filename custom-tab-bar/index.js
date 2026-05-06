// custom-tab-bar/index.js
// v4.0.0 自定义 TabBar：根据角色动态显示/隐藏 tab
// v5.2.0 增强：切换 Tab 时校验账号有效性

var app = getApp()

// admin: 首页/会员/报表/我的
var ADMIN_LIST = [
  { pagePath: '/pages/dashboard/dashboard', text: '首页', iconPath: '/images/home.png', selectedIconPath: '/images/home-active.png' },
  { pagePath: '/pages/memberList/memberList', text: '会员', iconPath: '/images/user.png', selectedIconPath: '/images/user-active.png' },
  { pagePath: '/pages/report/report', text: '报表', iconPath: '/images/report.png', selectedIconPath: '/images/report-active.png' },
  { pagePath: '/pages/proUnlock/proUnlock', text: '我的', iconPath: '/images/me.png', selectedIconPath: '/images/me-active.png' }
]
// staff: 首页/会员
var STAFF_LIST = [
  { pagePath: '/pages/dashboard/dashboard', text: '首页', iconPath: '/images/home.png', selectedIconPath: '/images/home-active.png' },
  { pagePath: '/pages/memberList/memberList', text: '会员', iconPath: '/images/user.png', selectedIconPath: '/images/user-active.png' }
]

Component({
  data: {
    selected: 0,
    list: [],
    _validating: false // ★ 防重复验证标记
  },

  methods: {
    init(selected) {
      var role = app.getRole()
      var list = role === 'staff' ? STAFF_LIST : ADMIN_LIST
      this.setData({ list: list, selected: selected !== undefined ? selected : 0 })
    },

    switchTab(e) {
      var page = this
      var index = e.currentTarget.dataset.index
      var item = this.data.list[index]
      if (!item) return

      // ★ TabBar 切换时校验账号有效性（仅小程序端，非游客模式）
      if (!page.data._validating && app.globalData._isMultiEndMode !== true) {
        var cachedShopInfo = wx.getStorageSync('shopInfo') || {}
        if (cachedShopInfo.phone && !cachedShopInfo.isGuest && !wx.getStorageSync('isGuestMode')) {
          page.setData({ _validating: true })

          app._validateMiniProgramCache(cachedShopInfo).catch(function(err) {
            if (err && (err.message === 'ACCOUNT_INVALID' || err.message === 'NO_OPENID')) {
              console.warn('[TabBar] 账号验证失败，清除缓存并切换游客模式')
              wx.showModal({
                title: '账号已失效',
                content: '您的登录状态已失效，将切换为游客模式浏览',
                showCancel: false,
                confirmText: '我知道了',
                success: function() {
                  app._forceLogoutAndEnterGuest()
                  wx.switchTab({ url: '/pages/dashboard/dashboard' })
                }
              })
            }
          }).finally(function() {
            page.setData({ _validating: false })
          })
        }
      }

      wx.switchTab({ url: item.pagePath })
    }
  }
})
