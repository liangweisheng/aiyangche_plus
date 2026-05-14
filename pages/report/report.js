// pages/report/report.js
// 营收报表 - 按门店手机号隔离

const app = getApp()
const util = require('../../utils/util')
const constants = require('../../utils/constants')
var shareCardUtil = require('../../utils/shareCard')

Page({
  data: {
    registered: false,
    loading: true,
    isPro: false,
    activeTab: 'today', // today/week/month/year
    dateLabel: '今日',
    // 月份/年份选择器
    pickerYear: 0,    // 选中的年份（默认当前年）
    pickerMonth: 0,   // 选中的月份 1-12（默认当前月）
    nowYear: new Date().getFullYear(),
    nowMonth: new Date().getMonth() + 1,
    isEmpty: false,   // 当前维度无数据
    // 汇总
    totalRevenue: 0,
    totalOrders: 0,
    avgAmount: 0,
    // 趋势数据
    trendLabels: [],
    trendValues: [],
    maxTrendValue: 1,
    // 支付方式分布
    paymentStats: [],
    // 服务项目排行
    serviceStats: [],
    // 今日订单清单
    todayOrders: [],
    // 消费TOP20车主
    topCustomers: [],
    hasMoreCustomers: false,
    showAllCustomers: false,
    shopPhone: '',
    cacheTip: '',
    isGuest: false,
    proLimitTip: '',
    shareImagePath: '', // 分享卡片图片路径
    _reqVersion: 0  // 竞态保护版本号
  },

  onLoad() {
    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    // 初始化选择器为当前年月
    var now = new Date()
    this.setData({
      pickerYear: now.getFullYear(),
      pickerMonth: now.getMonth() + 1,
      nowYear: now.getFullYear(),
      nowMonth: now.getMonth() + 1
    })
    // 游客共享真实账号数据，有 phone 即可查看报表（不依赖 app.isRegistered()，游客 isRegistered 返回 false）
    if (shopInfo.phone) {
      this.setData({ registered: true, isPro: !!wx.getStorageSync('isPro'), isGuest: app.isGuest ? app.isGuest() : false })
      this.loadData()
    } else {
      this.setData({ registered: false, loading: false })
    }
  },

  onReady() {
    // 页面渲染完成后，预生成分享卡片（确保Canvas DOM已就绪）
    if (!this.data.registered) return
    var page = this
    shareCardUtil.generateReportCard(page, function (err, tempFilePath) {
      if (!err && tempFilePath) {
        page.setData({ shareImagePath: tempFilePath })
        console.log('[report] 分享卡片已保存:', tempFilePath)
      } else {
        console.warn('[report] 分享卡片生成失败:', err)
      }
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }
    // Dashboard 统计卡片跳转 → 强制显示今日 tab
    if (app.globalData.reportActiveTab) {
      this.setData({ activeTab: app.globalData.reportActiveTab })
      delete app.globalData.reportActiveTab
      this.loadData()
      return
    }
    // 同步游客状态
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var isGuestNow = app.isGuest ? app.isGuest() : false
    if (isGuestNow !== this.data.isGuest) {
      this.setData({ isGuest: isGuestNow })
    }
    // 兜底：onLoad 未正确设置 registered 时补救
    if (!this.data.registered) {
      this.setData({ registered: true })
      this.loadData()
      return
    }
    // 每次显示都刷新 isPro（用户可能在"我的"页面激活了 Pro）
    var newIsPro = !!wx.getStorageSync('isPro')
    if (newIsPro !== this.data.isPro) {
      this.setData({ isPro: newIsPro })
      this.loadData()
    }
  },

  onPullDownRefresh() {
    var page = this
    var tab = page.data.activeTab
    if (tab !== 'today') {
      page._clearCache(tab)
    }
    page.loadData(true).then(function () {
      wx.stopPullDownRefresh()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    }).catch(function () {
      wx.stopPullDownRefresh()
      wx.showToast({ title: '刷新失败，请重试', icon: 'none' })
    })
  },

  // 切换日期范围
  onTabChange(e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.loadData()
  },

  // ============================
  // 月份/年份选择器事件
  // ============================
  onPrevMonth() {
    var year = this.data.pickerYear
    var month = this.data.pickerMonth
    if (month > 1) {
      month -= 1
    } else {
      year -= 1
      month = 12
    }
    this.setData({ pickerYear: year, pickerMonth: month })
    this.loadData()
  },

  onNextMonth() {
    var year = this.data.pickerYear
    var month = this.data.pickerMonth
    var nowYear = this.data.nowYear
    var nowMonth = this.data.nowMonth
    // 不能选择未来月份
    if (year >= nowYear && month >= nowMonth) return
    if (month < 12) {
      month += 1
    } else {
      year += 1
      month = 1
    }
    this.setData({ pickerYear: year, pickerMonth: month })
    this.loadData()
  },

  onPrevYear() {
    this.setData({ pickerYear: this.data.pickerYear - 1 })
    this.loadData()
  },

  onNextYear() {
    // 不能选择未来年份
    if (this.data.pickerYear >= this.data.nowYear) return
    this.setData({ pickerYear: this.data.pickerYear + 1 })
    this.loadData()
  },

  // 计算日期范围（v5.3.3: 本月/本年使用选择器值）
  getDateRange() {
    var now = new Date()
    var start = new Date()
    var end = new Date()
    var label = ''
    var tab = this.data.activeTab

    if (tab === 'today') {
      start.setHours(0, 0, 0, 0)
      end = new Date(now)
      label = util.formatDate(now)
    } else if (tab === 'week') {
      var day = now.getDay() || 7
      start.setDate(now.getDate() - day + 1)
      start.setHours(0, 0, 0, 0)
      end = new Date(now)
      label = '本周'
    } else if (tab === 'month') {
      var y = this.data.pickerYear
      var m = this.data.pickerMonth
      start = new Date(y, m - 1, 1)
      end = new Date(y, m, 0, 23, 59, 59, 999)  // 选中月份最后一天 23:59:59
      label = y + '年' + m + '月'
    } else {
      var y = this.data.pickerYear
      start = new Date(y, 0, 1)
      end = new Date(y, 11, 31, 23, 59, 59, 999)  // 选中年份最后一天
      label = y + '年'
    }

    return { start: start, end: end, label: label }
  },

  // ============================
  // 缓存管理（本周/本月/本年每天只拉取一次）
  // v5.3.3: 本月/本年缓存key包含年月份，支持多时期各自缓存
  // ============================

  // 获取当天日期字符串 YYYY-MM-DD
  _todayStr() {
    var d = new Date()
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
  },

  // 生成缓存 key（本月/本年包含选择器值）
  _getCacheKey(tab) {
    if (tab === 'month') {
      return 'reportCache_month_' + this.data.pickerYear + '-' + this.data.pickerMonth
    } else if (tab === 'year') {
      return 'reportCache_year_' + this.data.pickerYear
    }
    return 'reportCache_' + tab
  },

  // 读取缓存，返回 data 对象或 null
  _readCache(tab) {
    try {
      var key = this._getCacheKey(tab)
      var raw = wx.getStorageSync(key)
      if (!raw || !raw.date || !raw.data) return null
      if (raw.date !== this._todayStr()) return null
      return raw.data
    } catch (e) {
      return null
    }
  },

  // 写入缓存
  _writeCache(tab, data) {
    try {
      var key = this._getCacheKey(tab)
      wx.setStorageSync(key, {
        date: this._todayStr(),
        data: data,
        ts: Date.now()
      })
    } catch (e) {
      console.warn('写入缓存失败', e)
    }
  },

  // 清除指定 tab 缓存
  _clearCache(tab) {
    try {
      var key = this._getCacheKey(tab)
      wx.removeStorageSync(key)
    } catch (e) {}
  },


  // 加载所有数据（带缓存策略 + 免费版限制）
  // v5.3.3: 本月/本年缓存key包含年月份
  loadData(forceRefresh) {
    var page = this
    var tab = page.data.activeTab

    // P2#8: 防重入保护
    if (page._loading) return Promise.resolve()
    page._loading = true

    // P0#2: 竞态保护，每次 loadData 递增版本号
    page.setData({ _reqVersion: (page.data._reqVersion || 0) + 1 })
    var currentVersion = page.data._reqVersion

    page.setData({ loading: true, cacheTip: '', proLimitTip: '', isEmpty: false })

    // === 免费版限制：非Pro用户只能查看"今日"tab ===
    if (!page.data.isPro && tab !== 'today') {
      page._loading = false
      page.setData({
        loading: false,
        proLimitTip: '开通Pro版可查看高级报表',
        totalRevenue: 0,
        totalOrders: 0,
        avgAmount: 0,
        trendLabels: [],
        trendValues: [],
        paymentStats: [],
        serviceStats: [],
        todayOrders: [],
        topCustomers: [],
        isEmpty: false
      })
      return Promise.resolve()
    }

    var range = page.getDateRange()
    page.setData({ dateLabel: range.label })

    // === 今日 tab：始终实时拉取，不做缓存 ===
    if (tab === 'today') {
      return page._doLoadData(range, tab, currentVersion).finally(function () {
        page._loading = false
      })
    }

    // === 本周/本月/本年：检查缓存 ===
    if (!forceRefresh) {
      var cached = page._readCache(tab)
      if (cached) {
        // 命中缓存，直接恢复数据
        page._loading = false
        page.setData(Object.assign({}, cached, {
          cacheTip: '使用今日缓存数据，下拉可刷新',
          activeTab: tab,
          loading: false
        }))
        return Promise.resolve()
      }
    } else {
      // 强制刷新时清除旧缓存
      page._clearCache(tab)
    }

    // 缓存未命中或强制刷新：从云端拉取
    return page._doLoadData(range, tab, currentVersion).then(function () {
      // P0#2: 版本号不匹配时丢弃结果，不写缓存
      if (page.data._reqVersion !== currentVersion) return
      // 拉取成功后写入缓存
      var snapshot = {}
      var keys = [
        'totalRevenue', 'totalOrders', 'avgAmount',
        'trendLabels', 'trendValues', 'maxTrendValue',
        'paymentStats', 'serviceStats', 'todayOrders',
        'topCustomers', 'hasMoreCustomers', 'showAllCustomers',
        '_rankingTotal', 'isEmpty'
      ]
      keys.forEach(function (k) { snapshot[k] = page.data[k] })
      snapshot.dateLabel = range.label
      page._writeCache(tab, snapshot)
    }).catch(function (err) {
      // P0#1: 错误向上传播，由调用方处理
      console.error('报表数据加载失败', err)
    }).finally(function () {
      page._loading = false
    })
  },

  // 实际执行数据加载（从云函数拉取）
  // v5.3.3: 本月/本年传 endTime 限制范围
  _doLoadData(range, tab, reqVersion) {
    var page = this

    page._rankingStartTime = range.start.getTime()
    page._rankingEndTime = range.end.getTime()

    var reqData = { startTime: page._rankingStartTime }
    // 本月/本年传 endTime 精确限定范围
    if (tab === 'month' || tab === 'year') {
      reqData.endTime = page._rankingEndTime
    }

    return util.callRepair('getReportOrders', reqData).then(function (res) {
      // P0#2: 版本号不匹配时丢弃结果
      if (reqVersion !== undefined && page.data._reqVersion !== reqVersion) return
      if (!res || res.code !== 0 || !res.data) {
        console.error('报表数据加载失败', res)
        page.setData({ loading: false })
        // P0#1: reject 而非 return，阻止后续缓存写入
        return Promise.reject(new Error('报表数据加载失败'))
      }
      var orders = res.data.orders || []
      page.processData(orders, range)
      if (tab !== 'today') {
        return page._fetchCustomerRanking(1, 60)
      }
    }).catch(function (err) {
      console.error('报表数据加载失败', err)
      page.setData({ loading: false })
      // P0#1: 重新抛出错误，使调用方能 catch 到
      return Promise.reject(err)
    })
  },

  // 处理数据
  processData(orders, range) {
    // 汇总
    var totalRevenue = 0
    var totalOrders = orders.length
    orders.forEach(function (o) { totalRevenue += (o.totalAmount || 0) })
    var avgAmount = totalOrders > 0 ? Math.round(totalRevenue / totalOrders * 100) / 100 : 0

    // 按日趋势
    var trendMap = {}
    var tab = this.data.activeTab

    if (tab === 'today') {
      // 今日按小时
      for (var h = 8; h <= 20; h++) {
        var key = h + ':00'
        trendMap[key] = { revenue: 0, count: 0 }
      }
    } else if (tab === 'week') {
      var weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      weekNames.forEach(function (n) { trendMap[n] = { revenue: 0, count: 0 } })
    } else if (tab === 'month') {
      // 本月按3天一组
      var daysInMonth = new Date(range.end.getFullYear(), range.end.getMonth() + 1, 0).getDate()
      var groupStart = 1
      while (groupStart <= daysInMonth) {
        var groupEnd = Math.min(groupStart + 2, daysInMonth)
        var label = groupStart + '-' + groupEnd
        trendMap[label] = { revenue: 0, count: 0, startDay: groupStart, endDay: groupEnd }
        groupStart = groupEnd + 1
      }
    } else {
      var months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
      months.forEach(function (n) { trendMap[n] = { revenue: 0, count: 0 } })
    }

    orders.forEach(function (o) {
      var date = new Date(o.createTime)
      var key = ''

      if (tab === 'today') {
        var hour = date.getHours()
        if (hour >= 8 && hour <= 20) {
          key = hour + ':00'
        }
      } else if (tab === 'week') {
        var dayOfWeek = date.getDay() || 7
        var weekNames2 = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
        key = weekNames2[dayOfWeek]
      } else if (tab === 'month') {
        var day = date.getDate()
        var keys = Object.keys(trendMap)
        for (var ki = 0; ki < keys.length; ki++) {
          var group = trendMap[keys[ki]]
          if (day >= group.startDay && day <= group.endDay) {
            key = keys[ki]
            break
          }
        }
      } else {
        key = (date.getMonth() + 1) + '月'
      }

      if (key && trendMap[key]) {
        trendMap[key].revenue += (o.totalAmount || 0)
        trendMap[key].count += 1
      }
    })

    var trendLabels = Object.keys(trendMap)
    var trendValues = trendLabels.map(function (k) { return trendMap[k].revenue })
    var maxTrendValue = Math.max.apply(null, trendValues) || 1

    // 支付方式分布
    var payMethodMap = { '1': '现付', '2': '挂账' }
    var payAmountMap = {}
    orders.forEach(function (o) {
      var label = payMethodMap[o.payMethod] || '现付'
      payAmountMap[label] = (payAmountMap[label] || 0) + (o.totalAmount || 0)
    })
    // 确保现付和挂账都有条目
    if (!payAmountMap['现付']) payAmountMap['现付'] = 0
    if (!payAmountMap['挂账']) payAmountMap['挂账'] = 0
    var paymentStats = Object.keys(payAmountMap).map(function (k) {
      return {
        name: k,
        amount: payAmountMap[k],
        percent: totalRevenue > 0 ? Math.round(payAmountMap[k] / totalRevenue * 10000) / 100 : 0
      }
    }).sort(function (a, b) { return b.amount - a.amount })

    // 服务项目排行
    var itemMap = {}
    orders.forEach(function (o) {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach(function (item) {
          var name = item.name || item.itemName || '未命名'
          if (!itemMap[name]) itemMap[name] = { name: name, count: 0, revenue: 0 }
          itemMap[name].count += 1
          itemMap[name].revenue += (item.total || item.amount || 0)
        })
      }
    })
    var serviceStats = Object.values(itemMap).sort(function (a, b) { return b.revenue - a.revenue }).slice(0, 10)

    // 今日订单清单（仅 activeTab === 'today' 时填充）
    var todayOrders = []
    if (tab === 'today') {
      // P1#5: 先用原始时间戳排序，排序后再转 formatTimeAgo（避免 new Date("3分钟前") 失效）
      todayOrders = orders.map(function (o) {
        return {
          _id: o._id,
          plate: o.plate || '未知车牌',
          totalAmount: o.totalAmount || 0,
          payMethod: o.payMethod || '现金',
          _rawTime: new Date(o.createTime).getTime(),
          createTime: '',  // 排序后再填充
          status: o.status || '施工中'
        }
      }).sort(function (a, b) {
        return b._rawTime - a._rawTime
      })
      todayOrders.forEach(function (o) {
        o.createTime = util.formatTimeAgo(new Date(o._rawTime))
        delete o._rawTime
      })
    }

    // 消费排行（今日本地计算，非今日tab由云函数异步加载）
    var topCustomers = []
    var hasMoreCustomers = false
    if (tab === 'today') {
      var custMap = {}
      orders.forEach(function (o) {
        var plate = o.plate || '未知车牌'
        if (!custMap[plate]) custMap[plate] = { plate: plate, total: 0, count: 0 }
        custMap[plate].total += (o.totalAmount || 0)
        custMap[plate].count += 1
      })
      topCustomers = Object.values(custMap).sort(function (a, b) { return b.total - a.total })
    }

    this.setData({
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      avgAmount: avgAmount,
      isEmpty: totalOrders === 0,
      trendLabels: trendLabels,
      trendValues: trendValues,
      maxTrendValue: maxTrendValue,
      paymentStats: paymentStats,
      serviceStats: serviceStats,
      todayOrders: todayOrders,
      topCustomers: topCustomers,
      hasMoreCustomers: hasMoreCustomers,
      showAllCustomers: false,
      loading: false
    })
  },

  // 跳转注册
  onGoRegister() {
    wx.navigateTo({ url: '/pages/welcome/welcome' })
  },

  // 跳转工单详情
  goToOrder(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/orderDetail/orderDetail?id=' + id })
  },

  // 加载消费排行（云函数端聚合）
  _fetchCustomerRanking(page, pageSize) {
    var self = this
    var reqData = {
      startTime: self._rankingStartTime,
      page: page,
      pageSize: pageSize
    }
    // P1#4: 传 endTime 精确限定排行范围
    if (self._rankingEndTime) {
      reqData.endTime = self._rankingEndTime
    }
    return util.callRepair('getCustomerRanking', reqData).then(function (res) {
      if (!res || res.code !== 0 || !res.data) return
      var list = res.data.list || []
      self.setData({
        topCustomers: list,
        hasMoreCustomers: list.length < res.data.total,
        _rankingTotal: res.data.total,
        _rankingPage: page
      })
    }).catch(function (err) {
      console.error('消费排行加载失败', err)
    })
  },

  // 展开全部消费排行（从云函数加载全量）
  onShowAllCustomers() {
    var total = this.data._rankingTotal || 0
    var currentLen = (this.data.topCustomers || []).length
    if (currentLen >= total) {
      this.setData({ showAllCustomers: true })
      return
    }
    var self = this
    self._fetchCustomerRanking(1, total).then(function () {
      self.setData({ showAllCustomers: true, hasMoreCustomers: false })
    })
  },
  goToPro() {
    wx.switchTab({ url: '/pages/proUnlock/proUnlock' })
  },

  // 点击消费排行条目 → 跳转车辆详情
  goToCarDetail(e) {
    var plate = e.currentTarget.dataset.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
    }
  },

  // 分享配置
  onShareAppMessage() {
    return {
      title: '营收报表一目了然，生意好坏随时看！',
      path: '/pages/report/report',
      imageUrl: this.data.shareImagePath || ''
    }
  }
})
