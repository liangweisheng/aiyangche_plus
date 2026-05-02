// custom-tab-bar/index.js
// v4.0.0 自定义 TabBar：根据角色动态显示/隐藏 tab

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
    list: []
  },

  methods: {
    init(selected) {
      var role = app.getRole()
      var list = role === 'staff' ? STAFF_LIST : ADMIN_LIST
      this.setData({ list: list, selected: selected !== undefined ? selected : 0 })
    },

    switchTab(e) {
      var index = e.currentTarget.dataset.index
      var item = this.data.list[index]
      if (!item) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})
