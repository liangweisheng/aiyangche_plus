// custom-tab-bar/index.js
// v4.0.0 自定义 TabBar：根据角色动态显示/隐藏 tab
// v5.2.0 增强：切换 Tab 时校验账号有效性
// v5.4.0 增强：admin 动态导航栏配置（会员/车辆 可切换）

var app = getApp()

// staff: 仅首页（会员/车辆/报表/我的均为管理员专属页面）
var STAFF_LIST = [
  { pagePath: '/pages/dashboard/dashboard', text: '首页', iconPath: '/images/home.png', selectedIconPath: '/images/home-active.png' }
]

// Admin 动态构建辅助方法
function buildAdminList(config) {
  config = config || {}
  var showMember = config.member !== false  // 默认 true
  var showCar = config.car === true         // 默认 false

  var list = [
    { pagePath: '/pages/dashboard/dashboard', text: '首页', iconPath: '/images/home.png', selectedIconPath: '/images/home-active.png' }
  ]
  if (showMember) list.push({ pagePath: '/pages/memberList/memberList', text: '会员', iconPath: '/images/user.png', selectedIconPath: '/images/user-active.png' })
  if (showCar)    list.push({ pagePath: '/pages/carList/carList', text: '车辆', iconPath: '/images/car.png', selectedIconPath: '/images/car-active.png' })
  list.push({ pagePath: '/pages/report/report', text: '报表', iconPath: '/images/report.png', selectedIconPath: '/images/report-active.png' })
  list.push({ pagePath: '/pages/proUnlock/proUnlock', text: '我的', iconPath: '/images/me.png', selectedIconPath: '/images/me-active.png' })
  return list
}

// 根据当前页面路由匹配 selected 索引
function matchSelected(list) {
  var pages = getCurrentPages()
  var route = pages.length > 0 ? (pages[pages.length - 1].route || '') : ''
  if (!route) return 0
  for (var i = 0; i < list.length; i++) {
    if (list[i].pagePath.indexOf(route) !== -1) return i
  }
  return 0
}

Component({
  data: {
    selected: 0,
    list: [],
    _validating: false, // ★ 防重复验证标记
    _hidden: false      // ★ 页面级显隐控制（替代 wx.hideTabBar/showTabBar）
  },

  methods: {
    // ★ 显隐控制：供页面通过 this.getTabBar().hide()/show() 调用
    hide() {
      this.setData({ _hidden: true })
    },
    show() {
      this.setData({ _hidden: false })
    },

    init() {
      var role = app.getRole()
      var list

      if (role === 'staff') {
        list = STAFF_LIST
        this.setData({ list: list, selected: 0, _hidden: true })   // ★ staff 仅1个tab，隐藏TabBar
      } else {
        var config = wx.getStorageSync('navTabConfig') || {}
        list = buildAdminList(config)
        var selected = matchSelected(list)
        this.setData({ list: list, selected: selected, _hidden: false })  // ★ 管理员确保显示
      }
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
