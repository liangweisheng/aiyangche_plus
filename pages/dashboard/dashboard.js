// pages/dashboard/dashboard.js
// 老板控制台 - 数据看板（按门店手机号隔离）

const app = getApp()
var util = require('../../utils/util')
var shareCardUtil = require('../../utils/shareCard')
var constants = require('../../utils/constants')

Page({
  data: {
    date: '',
    shopName: '',
    stats: {
      todayOrders: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      totalCars: 0
    },
    alertList: [],
    shopPhone: '',
    loading: true,
    showLimitTip: false,
    showMemberLimitTip: false,
    totalOrderCount: 0,
    totalMemberCount: 0,
    isGuest: false,
    roleLabel: '',
    shareImagePath: '', // 分享卡片图片路径
    // v5.0.0 月报
    latestReport: null,
    reportLoading: false,
    showShopGuide: false,  // 门店信息引导弹窗
    _shopProfileCache: null,  // 云端已保存的门店配置缓存（用于判断是否跳过引导弹窗）
    _dashboardReqVersion: 0,   // 竞态保护版本号
    _reportFetching: false,    // 月报请求去重标记
    _shopGuideTimer: null,     // 门店引导弹窗延时器引用
    isAdminRole: false,
    // ⚡️快速搜索
    searchKeyword: '',
    searchResults: [],
    searchLoading: false,
    searchEmpty: false,
    searchWaiting: false,
    searchTimer: null,
    showSearchResults: false
  },

  onLoad() {
    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var sp = app.getShopPhone ? app.getShopPhone() : (shopInfo.shopPhone || shopInfo.phone || '')
    var guest = app.isGuest ? app.isGuest() : false
    var superAdmin = app.isSuperAdmin ? app.isSuperAdmin() : false
    var isStaff = app.isStaff ? app.isStaff() : false
    var isAdminRole = app.isAdmin ? app.isAdmin() : false
    this.setData({
      shopName: wx.getStorageSync('shopName') || '',
      roleLabel: wx.getStorageSync('roleLabel') || '',
      shopPhone: sp,
      isGuest: guest,
      isSuperAdmin: superAdmin,
      isStaff: isStaff,
      isAdminRole: isAdminRole,
      showReportCard: !isStaff || isAdminRole,
      loading: true
    })
    this.updateDate()

    app.whenCloudReady().then(function () {
      // ★ 优化：单次云函数调用同时获取看板数据+到期提醒
      page.fetchDashboardData()
      page._fetchLatestReport()
    })
  },

  onReady() {
    // 页面渲染完成后，预生成分享卡片（确保Canvas DOM已就绪）
    var page = this
    shareCardUtil.generateDashboardCard(page, function (err, tempFilePath) {
      if (!err && tempFilePath) {
        page.setData({ shareImagePath: tempFilePath })
      }
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }
    var sp = app.getShopPhone ? app.getShopPhone() : ''
    var guest = app.isGuest ? app.isGuest() : false
    var superAdmin = app.isSuperAdmin ? app.isSuperAdmin() : false
    var isStaff = app.isStaff ? app.isStaff() : false
    var isAdminRole = app.isAdmin ? app.isAdmin() : false
    this.setData({
      shopName: wx.getStorageSync('shopName') || '',
      roleLabel: wx.getStorageSync('roleLabel') || '',
      shopPhone: sp,
      isGuest: guest,
      isSuperAdmin: superAdmin,
      isStaff: isStaff,
      isAdminRole: isAdminRole,
      showReportCard: !isStaff || isAdminRole
    })
    // 检测开单页返回时的刷新标志
    if (getApp().globalData.shouldRefreshOrderList) {
      getApp().globalData.shouldRefreshOrderList = false
      // ★ 优化：单次云函数调用即可刷新看板+提醒
      this.fetchDashboardData()
    }
  },

  onPullDownRefresh() {
    var page = this
    page.setData({ shopName: wx.getStorageSync('shopName') || '', roleLabel: wx.getStorageSync('roleLabel') || '' })
    page.updateDate()
    Promise.all([
      page.fetchDashboardData(),
      page._fetchLatestReport()
    ]).then(function () {
      wx.stopPullDownRefresh()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 被 app._restoreShopInfo 主动调用，登录完成后刷新UI和数据
   */
  _onLoginReady() {
    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var isStaff = app.isStaff ? app.isStaff() : false
    var isAdminRole = app.isAdmin ? app.isAdmin() : false
    page.setData({
      shopName: wx.getStorageSync('shopName') || '',
      roleLabel: wx.getStorageSync('roleLabel') || '',
      shopPhone: shopInfo.phone || '',
      isGuest: app.isGuest ? app.isGuest() : false,
      isStaff: isStaff,
      isAdminRole: isAdminRole,
      showReportCard: !isStaff || isAdminRole,
      loading: false
    })
    app.whenCloudReady().then(function () {
      page.fetchDashboardData()
      // 员工不加载月报
      if (!page.data.showReportCard) return
      page._fetchLatestReport()
    })
  },

  updateDate() {
    var now = new Date()
    var y = now.getFullYear()
    var m = ('0' + (now.getMonth() + 1)).slice(-2)
    var d = ('0' + now.getDate()).slice(-2)
    this.setData({ date: y + '年' + m + '月' + d + '日 ' + util.formatWeekDay(now) })
  },

  // 获取看板数据（云函数端聚合，单次请求替代客户端多次分页）
  fetchDashboardData() {
    var page = this
    var shopPhone = page.data.shopPhone

    if (!shopPhone) {
      page.setData({ loading: false })
      return Promise.resolve()
    }

    // ★ 竞态保护：每次请求递增版本号，响应时版本号不匹配则丢弃
    var version = page.data._dashboardReqVersion + 1
    page.setData({ _dashboardReqVersion: version })

    // ★ 客户端计算今日零点毫秒时间戳（手机本地时区），与 report 页保持一致
    var todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return app.callFunction('repair_main', {
      action: 'getDashboardStats',
      shopPhone: shopPhone,
      todayStartMs: todayStart.getTime()
    }).then(function (res) {
      // 竞态检查：版本号不匹配说明有更新的请求已发出，丢弃本次响应
      if (page.data._dashboardReqVersion !== version) return

      if (res && res.code === 0 && res.data) {
        var d = res.data
        page.setData({
          stats: d.stats || { todayOrders: 0, todayRevenue: 0, totalRevenue: 0, totalCars: 0 },
          totalOrderCount: d.totalOrderCount || 0,
          totalMemberCount: d.totalMemberCount || 0,
          alertList: d.alertList || [],
          loading: false
        })

        // Pro状态实时同步 + 免费版限额检查
        app.syncProStatus().then(function (isPro) {
          if (page.data._dashboardReqVersion !== version) return
          page.setData({ isPro: isPro })
          if (!isPro && (d.totalOrderCount || 0) >= constants.FREE_MAX_ORDERS) {
            page.setData({ showLimitTip: true })
          } else {
            page.setData({ showLimitTip: false })
          }
          if (!isPro && (d.totalMemberCount || 0) >= constants.FREE_MAX_MEMBERS) {
            page.setData({ showMemberLimitTip: true })
          } else {
            page.setData({ showMemberLimitTip: false })
          }
        }).catch(function () {
          if (page.data._dashboardReqVersion !== version) return
          page.setData({ showLimitTip: false, showMemberLimitTip: false })
        })
      } else {
        console.error('看板数据返回异常', res)
        page.setData({ loading: false })
      }
    }).catch(function (err) {
      if (page.data._dashboardReqVersion !== version) return
      console.error('看板数据加载失败', err)
      page.setData({ loading: false })
    })
  },




  goToAddCar() {
    wx.navigateTo({ url: '/pages/carAdd/carAdd' })
  },

  goToCreateOrder() {
    wx.navigateTo({ url: '/pages/orderAdd/orderAdd' })
  },

  // 点击提醒项 → 跳转车辆详情
  onAlertTap(e) {
    var plate = e.currentTarget.dataset.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
    }
  },

  // 点击门店电话 → 拨打
  onPhoneTap(e) {
    var phone = e.currentTarget.dataset.phone
    if (!phone) return
    wx.showActionSheet({
      itemList: ['拨打 ' + phone, '复制号码'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.makePhoneCall({ phoneNumber: phone })
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({ data: phone })
        }
      }
    })
  },

  goToOrders() {
    wx.navigateTo({ url: '/pages/orderList/orderList' })
  },

  // 跳转Pro版页面
  goToPro() {
    wx.switchTab({ url: '/pages/proUnlock/proUnlock' })
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pages/welcome/welcome?mode=force' })
  },

  // 查看隐私政策
  onGoPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  },

  // 查看用户服务协议
  onGoAgreement() {
    wx.navigateTo({ url: '/pages/userAgreement/userAgreement' })
  },

  // ====== v5.0.0 月报相关方法 ======

  // 加载最新月报摘要
  _fetchLatestReport() {
    var page = this

    // 权限拦截：仅游客和超管可加载月报
    if (!page.data.showReportCard) return Promise.resolve()

    // 请求去重：避免并发重复触发
    if (page.data._reportFetching) return Promise.resolve()

    // 游客使用示例账号，超管使用自己的 shopPhone
    var shopPhone = page.data.isGuest ? constants.GUEST_PHONE : page.data.shopPhone
    if (!shopPhone) {
      return Promise.resolve()
    }

    page.setData({ reportLoading: true, _reportFetching: true })

    return app.callFunction('repair_main', {
      action: 'listRecentReports',
      shopPhone: shopPhone,
      limit: 1
    }).then(function (res) {
      if (res.code === 0 && res.data && res.data.list && res.data.list.length > 0) {
        // 有报告数据，直接展示（不再自动弹引导）
        page.setData({
          latestReport: res.data.list[0],
          reportLoading: false,
          _reportFetching: false
        })
        // ★ 预取门店配置（用于引导弹窗判断是否需要弹出）
        page._prefetchShopProfile()
      } else {
        // 无报告数据，尝试触发生成上月报告
        page.setData({ _reportFetching: false })
        page._tryGenerateReport()
      }
    }).catch(function (err) {
      console.error('[dashboard] listRecentReports 异常:', err)
      page.setData({ reportLoading: false, _reportFetching: false })
    })
  },

  // 尝试触发生成上月月报
  _tryGenerateReport() {
    var page = this
    if (!page.data.showReportCard) return
    // 非 Pro 用户跳过，避免触发 -403 被 callFunction 拦截器误踢
    if (!app.isPro()) {
      page.setData({ reportLoading: false }); return
    }
    // 游客使用示例账号，超管使用自己的 shopPhone
    var shopPhone = page.data.isGuest ? constants.GUEST_PHONE : page.data.shopPhone
    if (!shopPhone) { page.setData({ reportLoading: false }); return }

    // 计算上月的 yearMonth
    var now = new Date()
    var lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    var ym = lastMonth.getFullYear() + '-' + ('0' + (lastMonth.getMonth() + 1)).slice(-2)

    app.callFunction('repair_main', {
      action: 'generateMonthlyReport',
      shopPhone: shopPhone,
      yearMonth: ym
    }).then(function (res) {
      if (res.code === 0 && res.data) {
        page.setData({ latestReport: res.data, reportLoading: false })
        page._prefetchShopProfile()
      } else if (res.code === -2) {
        // 数据不足/新店/未达门槛 — 静默处理，不展示空报告卡片
        page.setData({ latestReport: null, reportLoading: false })
      } else {
        page.setData({ latestReport: null, reportLoading: false })
      }
    }).catch(function () {
      page.setData({ reportLoading: false })
    })
  },

  // 点击"经营诊断"卡片：优先检查门店配置引导，再决定跳转
  _onReportCardTap(e) {
    // Pro 权限守卫：非 Pro 用户仅提示，不跳转
    if (!app.isPro()) {
      wx.showModal({
        title: 'Pro版专属功能',
        content: 'AI经营诊断报告仅Pro版可查看，升级后即可享受智能诊断与月度报告',
        confirmText: '了解详情',
        cancelText: '暂不升级',
        success: function (res) {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/proUnlock/proUnlock' })
          }
        },
        fail: function (err) {
          wx.showToast({ title: 'AI月报为Pro版专属功能', icon: 'none', duration: 2500 })
        }
      })
      return
    }

    var detail = e.detail || {}
    var report = detail.report

    if (!report) {
      if (detail.yearMonth) {
        wx.navigateTo({ url: '/pages/monthlyReport/monthlyReport?yearMonth=' + detail.yearMonth })
      } else {
        wx.showToast({ title: '当前无月报内容', icon: 'none' })
      }
      return
    }

    // 先检查是否需要弹出门店引导
    var needGuide = false
    try {
      needGuide = !wx.getStorageSync('monthlyReportGuideShown')
    } catch (e) {}

    if (needGuide) {
      // ★ 三重判断：报告内配置 > 预缓存的云端配置 > 弹窗引导
      var hasConfigInReport = !!(report.shopProfile && report.shopProfile.bayCount)
      var cachedProfile = this.data._shopProfileCache || {}
      var hasConfigInCloud = !!cachedProfile.bayCount

      if (!hasConfigInReport && !hasConfigInCloud) {
        // 云端也未配置且从未引导过 → 弹窗拦截
        var page = this
        page.data._shopGuideTimer = setTimeout(function () {
          page.data._shopGuideTimer = null
          page.setData({ showShopGuide: true })
        }, 300)
        return
      }
    }

    // 已有配置或已引导过 → 直接跳转月报页
    wx.navigateTo({
      url: '/pages/monthlyReport/monthlyReport' + (detail.yearMonth ? '?yearMonth=' + detail.yearMonth : '')
    })
  },

  /**
   * 预取云端门店经营诊断配置（静默缓存）
   * 用于 _onReportCardTap 判断：用户已在 proUnlock 页面保存过工位数 → 跳过引导弹窗
   * 即使报告数据中无 shopProfile 字段，只要云端有配置就不弹窗
   */
  _prefetchShopProfile() {
    var page = this
    var sp = page.data.isGuest ? constants.GUEST_PHONE : page.data.shopPhone
    if (!sp) return

    app.callFunction('repair_main', {
      action: 'getShopProfile',
      shopPhone: sp
    }).then(function (res) {
      if (res.code === 0 && res.data && res.data.bayCount) {
        page.setData({ _shopProfileCache: res.data })
      }
    }).catch(function () { /* 静默 */ })
  },

  // 引导弹窗确认回调
  _onGuideConfirm(e) {
    this.setData({ showShopGuide: false })
    // 可以重新加载一次报告以使用新的门店配置
    this._fetchLatestReport()
  },

  // 引导弹窗关闭回调
  _onGuideClose() {
    this.setData({ showShopGuide: false })
  },

  /** 跳转员工"我的资料"独立页面 */
  goToStaffProfile() {
    wx.navigateTo({ url: '/pages/staffProfile/staffProfile' })
  },

  onUnload() {
    // 清理延时器，防止页面销毁后 setData
    if (this.data._shopGuideTimer) {
      clearTimeout(this.data._shopGuideTimer)
      this.data._shopGuideTimer = null
    }
    // 清理搜索防抖定时器
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
      this.data.searchTimer = null
    }
  },

  // 分享配置
  onShareAppMessage() {
    return {
      title: '汽修店管理神器，开单查记录超方便！',
      path: '/pages/dashboard/dashboard',
      imageUrl: this.data.shareImagePath || ''
    }
  },

  // 统计卡片点击跳转
  onStatCardTap(e) {
    var type = e.currentTarget.dataset.type
    // 店员不允许通过统计卡片跳转报表/车辆页
    if (getApp().isStaff()) {
      wx.showToast({ title: '店员无法使用此功能', icon: 'none' })
      return
    }
    if (type === 'orders' || type === 'revenue') {
      // 跳转报表页 → 今日 tab（report 是 TabBar 页，通过 globalData 传参）
      getApp().globalData.reportActiveTab = 'today'
      wx.switchTab({ url: '/pages/report/report' })
    } else if (type === 'cars') {
      // 跳转车辆列表页（TabBar 页面）
      wx.switchTab({ url: '/pages/carList/carList' })
    }
  },

  // ⚡️快速搜索输入（≥2字符自动触发 + 防抖）
  onQuickSearchInput(e) {
    var page = this
    var rawVal = e.detail.value
    var filteredVal = rawVal.replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '').toUpperCase()
    page.setData({ searchKeyword: filteredVal })

    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
      page.setData({ searchTimer: null })
    }

    if (!filteredVal || filteredVal.length < 2) {
      page.setData({
        searchResults: [],
        searchLoading: false,
        searchEmpty: false,
        searchWaiting: !!filteredVal,
        showSearchResults: !!filteredVal
      })
      return
    }

    page.setData({
      searchTimer: setTimeout(function () {
        page.doQuickSearch(filteredVal.trim())
      }, 400),
      searchWaiting: false
    })
  },

  // 确认搜索（键盘搜索按钮）
  onQuickSearchConfirm() {
    var keyword = this.data.searchKeyword.trim()
    if (keyword.length >= 2) {
      if (this.data.searchTimer) {
        clearTimeout(this.data.searchTimer)
        this.setData({ searchTimer: null })
      }
      this.doQuickSearch(keyword)
    }
  },

  // 执行快速搜索：优先车牌 → 不足8条再补搜索手机号/车主姓名
  doQuickSearch(keyword) {
    var page = this
    if (!keyword || keyword.length < 2) return
    var db = app.db()
    var _ = db.command
    page.setData({ searchLoading: true, searchEmpty: false, showSearchResults: true })

    var regExp = db.RegExp({ regexp: keyword.replace(/\./g, '\\.'), options: 'i' })

    // 第一步：优先搜索车牌号（最多8条）
    db.collection('repair_cars')
      .where(app.shopWhere({ plate: regExp }))
      .limit(8)
      .get()
      .then(function (plateRes) {
        var plateResults = plateRes.data || []
        if (plateResults.length >= 8) {
          page.setData({ searchLoading: false, searchResults: plateResults, searchEmpty: false })
          return
        }
        // 未满8条，剩余额度搜索手机号/车主姓名
        var remaining = 8 - plateResults.length
        var excludeIds = plateResults.map(function (c) { return c._id })
        return db.collection('repair_cars')
          .where(_.and([
            { shopPhone: app.getShopPhone() },
            _.or([
              { phone: regExp },
              { ownerName: regExp }
            ]),
            { _id: _.nin(excludeIds) }
          ]))
          .limit(remaining)
          .get()
          .then(function (otherRes) {
            var allResults = plateResults.concat(otherRes.data || [])
            page.setData({
              searchLoading: false,
              searchResults: allResults,
              searchEmpty: allResults.length === 0
            })
          })
      })
      .catch(function () {
        page.setData({ searchLoading: false, searchResults: [], searchEmpty: true })
        wx.showToast({ title: '查询失败', icon: 'none' })
      })
  },

  // 清除搜索
  onClearQuickSearch() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
    this.setData({
      searchKeyword: '',
      searchResults: [],
      searchLoading: false,
      searchEmpty: false,
      searchWaiting: false,
      searchTimer: null,
      showSearchResults: false
    })
  },

  // 点击搜索结果 → 跳转车辆详情
  onSearchResultTap(e) {
    var plate = e.currentTarget.dataset.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
    }
  }
})
