// pages/dashboard/dashboard.js
// 老板控制台 - 数据看板（按门店手机号隔离）

const app = getApp()
var shareCardUtil = require('../../utils/shareCard')

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
    revenueTrend: [],
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
    showShopGuide: false  // 门店信息引导弹窗
  },

  onLoad() {
    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var sp = app.getShopPhone ? app.getShopPhone() : (shopInfo.shopPhone || shopInfo.phone || '')
    var guest = (sp === '13507720000')
    var superAdmin = app.isSuperAdmin ? app.isSuperAdmin() : false
    this.setData({
      shopName: wx.getStorageSync('shopName') || '',
      roleLabel: wx.getStorageSync('roleLabel') || '',
      shopPhone: sp,
      isGuest: guest,
      isSuperAdmin: superAdmin,
      showReportCard: (guest || superAdmin),
      loading: true
    })
    this.updateDate()

    app.whenCloudReady().then(function () {
      page.setData({ loading: false })
      page.fetchDashboardData()
      page.fetchAlertList()
      // v5.0.0 加载最新月报
      page._fetchLatestReport()
    })
  },

  onReady() {
    // 页面渲染完成后，预生成分享卡片（确保Canvas DOM已就绪）
    var page = this
    shareCardUtil.generateDashboardCard(page, function (err, tempFilePath) {
      if (!err && tempFilePath) {
        page.setData({ shareImagePath: tempFilePath })
        console.log('[dashboard] 分享卡片已保存:', tempFilePath)
      } else {
        console.warn('[dashboard] 分享卡片生成失败:', err)
      }
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init(0)
    }
    var sp = app.getShopPhone ? app.getShopPhone() : ''
    var guest = (sp === '13507720000')
    var superAdmin = app.isSuperAdmin ? app.isSuperAdmin() : false
    this.setData({
      shopName: wx.getStorageSync('shopName') || '',
      roleLabel: wx.getStorageSync('roleLabel') || '',
      shopPhone: sp,
      isGuest: guest,
      isSuperAdmin: superAdmin,
      showReportCard: (guest || superAdmin)
    })

    // 检测开单页返回时的刷新标志
    if (getApp().globalData.shouldRefreshOrderList) {
      getApp().globalData.shouldRefreshOrderList = false
      this.fetchDashboardData()
      this.fetchAlertList()
    }
  },

  onPullDownRefresh() {
    var page = this
    page.setData({ shopName: wx.getStorageSync('shopName') || '', roleLabel: wx.getStorageSync('roleLabel') || '' })
    page.updateDate()
    Promise.all([
      page.fetchDashboardData(),
      page.fetchAlertList(),
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
    page.setData({
      shopName: wx.getStorageSync('shopName') || '',
      roleLabel: wx.getStorageSync('roleLabel') || '',
      shopPhone: shopInfo.phone || '',
      isGuest: (shopInfo.phone === '13507720000'),
      loading: false
    })
    app.whenCloudReady().then(function () {
      page.fetchDashboardData()
      page.fetchAlertList()
      page._fetchLatestReport()
    })
  },

  updateDate() {
    var now = new Date()
    var year = now.getFullYear()
    var month = ('0' + (now.getMonth() + 1)).slice(-2)
    var day = ('0' + now.getDate()).slice(-2)
    var weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    var weekDay = weekDays[now.getDay()]
    this.setData({ date: year + '年' + month + '月' + day + '日 ' + weekDay })
  },

  // 分页获取全部工单记录（客户端，突破单次limit限制）
  _fetchAllOrders(where, field) {
    var db = app.db()
    var MAX = 100
    return db.collection('repair_orders').where(where).count().then(function (countRes) {
      var total = countRes.total
      if (total === 0) return Promise.resolve([])
      var allData = []
      var batch = 0
      function fetchBatch() {
        var skip = batch * MAX
        var limit = Math.min(MAX, total - skip)
        return db.collection('repair_orders').where(where).field(field).skip(skip).limit(limit).get()
          .then(function (res) {
            allData = allData.concat(res.data || [])
            batch++
            if (batch * MAX < total) {
              return fetchBatch()
            }
            return allData
          })
      }
      return fetchBatch()
    })
  },

  // 获取看板数据（按门店手机号隔离）
  fetchDashboardData() {
    var page = this
    var db = app.db()
    var shopBase = app.shopWhere()
    var _ = db.command
    var today = new Date()
    today.setHours(0, 0, 0, 0)

    // 近7日起始日期
    var sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)

    var notVoided = { isVoided: _.neq(true) }
    var todayWhere = Object.assign({}, shopBase, notVoided, { createTime: _.gte(today) })
    var totalWhere = Object.assign({}, shopBase, notVoided)
    var trendWhere = Object.assign({}, shopBase, notVoided, { createTime: _.gte(sevenDaysAgo) })

    Promise.all([
      // 今日开单数
      db.collection('repair_orders').where(todayWhere).count(),
      // 今日营收（分页全量）
      page._fetchAllOrders(todayWhere, { totalAmount: true }),
      // 总营收（分页全量）
      page._fetchAllOrders(totalWhere, { totalAmount: true }),
      // 车辆总数
      db.collection('repair_cars').where(shopBase).count(),
      // 近7日趋势（分页全量）
      page._fetchAllOrders(trendWhere, { totalAmount: true, createTime: true }),
      // 会员总数
      db.collection('repair_members').where(shopBase).count()
    ]).then(function (results) {
      var todayOrdersRes = results[0]
      var todayOrdersData = results[1]
      var totalOrdersData = results[2]
      var totalCarsRes = results[3]
      var trendOrdersData = results[4]
      var totalMembersRes = results[5]

      var todayRevenue = todayOrdersData.reduce(function (sum, item) { var v = parseFloat(item.totalAmount); return sum + (isNaN(v) ? 0 : v) }, 0)
      var totalRevenue = totalOrdersData.reduce(function (sum, item) { var v = parseFloat(item.totalAmount); return sum + (isNaN(v) ? 0 : v) }, 0)

      // 构建近7日趋势数据
      var trendMap = {}
      var trendLabels = []
      var trendValues = []
      function toLocalKey(dateObj) {
        // 统一转为本地日期字符串 M/D，补偿 ServerDate(UTC) 的时区偏移
        var d = new Date(dateObj)
        var offset = d.getTimezoneOffset() * 60 * 1000
        var local = new Date(d.getTime() - offset)
        return (local.getMonth() + 1) + '/' + local.getDate()
      }
      for (var i = 6; i >= 0; i--) {
        var d = new Date(today)
        d.setDate(d.getDate() - i)
        var key = toLocalKey(d)
        var weekDay = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]
        trendLabels.push(weekDay)
        trendMap[key] = 0
      }
      trendOrdersData.forEach(function (o) {
        var key = toLocalKey(o.createTime)
        if (trendMap.hasOwnProperty(key)) {
          trendMap[key] += (o.totalAmount || 0)
        }
      })
      trendValues = Object.keys(trendMap).map(function (k) { return trendMap[k] })
      var maxTrendValue = Math.max.apply(null, trendValues) || 1

      page.setData({
        stats: {
          todayOrders: todayOrdersRes.total,
          todayRevenue: todayRevenue,
          totalRevenue: totalRevenue,
          totalCars: totalCarsRes.total
        },
        revenueTrend: trendValues,
        trendLabels: trendLabels,
        maxTrendValue: maxTrendValue,
        totalOrderCount: totalOrdersData.length,
        totalMemberCount: totalMembersRes.total || 0,
        loading: false
      })

      // 重置限额提示状态（避免残留）
      page.setData({
        showLimitTip: false,
        showMemberLimitTip: false
      })

      // Pro状态实时同步 + 免费版限额检查（必须在回调内用异步返回值判断）
      app.syncProStatus().then(function (isPro) {
        page.setData({ isPro: isPro })
        if (!isPro && totalOrdersData.length >= 100) {
          page.setData({ showLimitTip: true })
        }
        if (!isPro && (totalMembersRes.total || 0) >= 10) {
          page.setData({ showMemberLimitTip: true })
        }
      })
    }).catch(function (err) {
      console.error('看板数据加载失败', err)
      page.setData({ loading: false })
    })
  },

  goToCarSearch() {
    wx.navigateTo({ url: '/pages/carSearch/carSearch' })
  },

  goToAddCar() {
    wx.navigateTo({ url: '/pages/carAdd/carAdd' })
  },

  goToCreateOrder() {
    wx.navigateTo({ url: '/pages/orderAdd/orderAdd' })
  },

  // 获取到期提醒（45天内到期的保养/保险/配件更换）
  fetchAlertList() {
    var page = this
    var db = app.db()
    var shopBase = app.shopWhere()
    var _ = db.command

    // 计算45天后的截止日期
    var now = new Date()
    var deadline = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000)

    db.collection('repair_cars').where(shopBase).field({
      plate: true,
      maintainDate: true,
      insuranceDate: true,
      partReplaceName: true,
      partReplaceDate: true
    }).get().then(function (res) {
      var cars = res.data || []
      var alertList = []

      cars.forEach(function (car) {
        // 保养提醒
        if (car.maintainDate) {
          var mDate = new Date(car.maintainDate)
          var mDays = Math.ceil((mDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          if (mDays >= -30 && mDays <= 45) {
            alertList.push({
              plate: car.plate,
              typeEmoji: '🔧',
              typeIcon: 'maintain',
              typeName: '保养到期',
              content: car.maintainDate,
              days: mDays,
              urgent: mDays <= 7
            })
          }
        }

        // 保险提醒
        if (car.insuranceDate) {
          var iDate = new Date(car.insuranceDate)
          var iDays = Math.ceil((iDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          if (iDays >= -30 && iDays <= 45) {
            alertList.push({
              plate: car.plate,
              typeEmoji: '🛡️',
              typeIcon: 'insurance',
              typeName: '保险到期',
              content: car.insuranceDate,
              days: iDays,
              urgent: iDays <= 7
            })
          }
        }

        // 配件更换提醒
        if (car.partReplaceName && car.partReplaceDate) {
          var pDate = new Date(car.partReplaceDate)
          var pDays = Math.ceil((pDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          if (pDays >= -30 && pDays <= 45) {
            alertList.push({
              plate: car.plate,
              typeEmoji: '🔩',
              typeIcon: 'part',
              typeName: '配件更换',
              content: car.partReplaceName + ' ' + car.partReplaceDate,
              days: pDays,
              urgent: pDays <= 7
            })
          }
        }
      })

      // 按剩余天数升序排序（最紧急的排前面）
      alertList.sort(function (a, b) { return a.days - b.days })

      page.setData({ alertList: alertList })
    }).catch(function (err) {
      console.error('到期提醒加载失败', err)
    })
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
    if (!page.data.showReportCard) return

    // 游客使用示例账号，超管使用自己的 shopPhone
    var shopPhone = page.data.isGuest ? '13507720000' : page.data.shopPhone
    if (!shopPhone) {
      return
    }

    page.setData({ reportLoading: true })

    app.callFunction('repair_main', {
      action: 'listRecentReports',
      shopPhone: shopPhone,
      limit: 1
    }).then(function (res) {
      if (res.code === 0 && res.data && res.data.list && res.data.list.length > 0) {
        // 有报告数据，直接展示（不再自动弹引导）
        page.setData({
          latestReport: res.data.list[0],
          reportLoading: false
        })
      } else {
        // 无报告数据，尝试触发生成上月报告
        page._tryGenerateReport()
      }
    }).catch(function (err) {
      page.setData({ reportLoading: false })
    })
  },

  // 尝试触发生成上月月报
  _tryGenerateReport() {
    var page = this
    if (!page.data.showReportCard) return
    // 游客使用示例账号，超管使用自己的 shopPhone
    var shopPhone = page.data.isGuest ? '13507720000' : page.data.shopPhone
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
        // 不再自动弹引导，由用户点击"经营诊断"卡片时触发
      } else {
        page.setData({ latestReport: null, reportLoading: false })
      }
    }).catch(function () {
      page.setData({ reportLoading: false })
    })
  },

  // 点击"经营诊断"卡片：优先检查门店配置引导，再决定跳转
  _onReportCardTap(e) {
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

    if (needGuide && (!report.shopProfile || !report.shopProfile.bayCount)) {
      // 未配置门店信息且从未引导过 → 弹窗拦截（不跳转）
      setTimeout(function () {
        this.setData({ showShopGuide: true })
      }.bind(this), 300)
      return
    }

    // 已有配置或已引导过 → 直接跳转月报页
    wx.navigateTo({
      url: '/pages/monthlyReport/monthlyReport' + (detail.yearMonth ? '?yearMonth=' + detail.yearMonth : '')
    })
  },

  // 检查是否需要弹出门店引导
  _checkShopGuide(report) {
    var page = this

    // 已经引导过就不再弹
    try {
      if (wx.getStorageSync('monthlyReportGuideShown')) return
    } catch (e) {}

    // 检查门店是否有配置
    if (report && report.shopProfile && report.shopProfile.bayCount) {
      // 已有配置，不需要引导
      return
    }

    // 延迟一点弹出，让用户先看到页面
    setTimeout(function () {
      page.setData({ showShopGuide: true })
    }, 1500)
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

  // 分享配置
  onShareAppMessage() {
    return {
      title: '汽修店管理神器，开单查记录超方便！',
      path: '/pages/dashboard/dashboard',
      imageUrl: this.data.shareImagePath || ''
    }
  }
})
