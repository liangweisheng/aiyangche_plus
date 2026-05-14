// pages/monthlyReport/monthlyReport.js
// 经营月报详情页（Phase 4 完整版 - 含边界处理+动态参考范围）

const app = getApp()
var constants = require('../../utils/constants')

Page({
  data: {
    // 月份切换
    months: [],          // [{yearMonth, label, hasData}]
    currentIndex: 0,     // 当前选中月份索引

    // 报告数据
    report: null,
    loading: true,
    shopPhone: '',

    // 门店配置（用于展示）
    shopProfile: null,

    // Phase 3/4: 诊断展开/折叠
    expandedIndex: -1,   // 当前展开的诊断索引，-1=全部折叠

    // Phase 3/4: 案例弹窗
    caseModalVisible: false,
    currentCaseTag: '',
    currentCaseTitle: '',

    // Phase 4: 边界状态
    emptyType: '',       // '' | 'new_shop' | 'no_data' | 'low_data'
    emptyHint: '',       // 空态提示文案
    benchmarkText: ''    // 动态参考范围文案
  },

  onLoad(options) {
    if (!app.checkPageAccess('admin+pro')) return
    var page = this
    var sp = app.getShopPhone ? app.getShopPhone() : (wx.getStorageSync('shopInfo') || {}).phone || ''
    page.setData({ shopPhone: sp })

    // 从云端获取有报告的月份列表，再加载报告数据
    page._initFromRemote().then(function () {
      // 如果传入了指定月份，跳到该月份
      if (options.yearMonth) {
        var idx = page.data.months.findIndex(function (m) { return m.yearMonth === options.yearMonth })
        if (idx >= 0) {
          page.setData({ currentIndex: idx })
          page._loadCurrentReport()
          return
        }
        // 指定月份未找到 → fallback 到默认月份
      }
      // 默认加载当前选中的月报
      page._loadCurrentReport()
    }).catch(function () {
      // 接口失败时回退到本地计算近3个月
      page._initMonthsFallback()
      page._loadCurrentReport()
    })
  },

  onUnload() {
    // 关闭案例弹窗，防止页面栈混乱
    if (this.data.caseModalVisible) {
      this._onCaseModalClose()
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init(0)
    }
  },

  onPullDownRefresh() {
    var page = this
    page._loadCurrentReport().then(function () {
      wx.stopPullDownRefresh()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  // ====== 初始化月份列表（优先从云端获取有报告的月份）======
  _initFromRemote() {
    var page = this
    var shopPhone = page.data.shopPhone
    if (!shopPhone) return Promise.reject(new Error('no shopPhone'))

    return app.callFunction('repair_main', {
      action: 'listRecentReports',
      shopPhone: shopPhone,
      limit: 6  // 多取几个月，用于智能选择
    }).then(function (res) {
      if (res.code !== 0 || !res.data || !Array.isArray(res.data.list) || res.data.list.length === 0) {
        return Promise.reject(new Error('no reports'))
      }

      // 将返回的报告列表转换为月份 tab（倒序排列：最新在前）
      var list = res.data.list.sort(function (a, b) { return (b.yearMonth || '').localeCompare(a.yearMonth) })
      var months = list.map(function (item) {
        var parts = (item.yearMonth || '').split('-')
        return {
          yearMonth: item.yearMonth,
          label: parts[1] ? parseInt(parts[1], 10) + '月' : item.yearMonth,
          hasData: true
        }
      })

      // ★ 默认选中"上个月"（如果存在），否则选最新的
      var now = new Date()
      var lastMonthYm = now.getFullYear() + '-' + ('0' + now.getMonth()).slice(-2)
      var defaultIndex = months.findIndex(function (m) { return m.yearMonth === lastMonthYm })
      if (defaultIndex < 0) defaultIndex = 0  // 上个月无报告则选最新的

      page.setData({ months: months, currentIndex: defaultIndex })
    })
  },

  /**
   * 本地回退：当云端接口失败时，使用本地计算近3个月
   */
  _initMonthsFallback() {
    var now = new Date()
    var months = []
    for (var i = 2; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      var ym = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2)
      months.push({
        yearMonth: ym,
        label: (d.getMonth() + 1) + '月',
        hasData: false
      })
    }
    this.setData({ months: months, currentIndex: 0 })
  },

  // ====== 切换月份 =====
  onMonthTap(e) {
    var idx = e.currentTarget.dataset.idx
    if (idx === this.data.currentIndex) return
    if (idx >= this.data.months.length) return

    // 保存旧报告以便加载失败时恢复
    var oldReport = this.data.report
    var oldShopProfile = this.data.shopProfile
    var oldBenchmarkText = this.data.benchmarkText

    this.setData({
      currentIndex: idx,
      loading: true,
      report: null,
      expandedIndex: -1,
      emptyType: '',
      emptyHint: '',
      benchmarkText: ''
    })
    var page = this
    this._loadCurrentReport().catch(function () {
      // 加载失败时恢复旧报告，避免白屏空态
      if (oldReport) {
        page.setData({
          report: oldReport,
          shopProfile: oldShopProfile,
          benchmarkText: oldBenchmarkText,
          loading: false
        })
      }
    })
  },

  // ====== 加载当前选中的月报 =====
  _loadCurrentReport() {
    var page = this
    var currentMonth = page.data.months[page.data.currentIndex]
    if (!currentMonth) return Promise.resolve()

    var shopPhone = page.data.shopPhone
    if (!shopPhone) {
      page._showEmpty('no_data', '请先登录门店账号')
      return Promise.resolve()
    }

    // 显示 loading
    page.setData({ loading: true, emptyType: '' })

    return app.callFunction('repair_main', {
      action: 'getMonthlyReport',
      yearMonth: currentMonth.yearMonth,
      shopPhone: shopPhone
    }).then(function (res) {
      if (res.code === 0 && res.data) {
        var reportData = res.data

        // ====== Phase 4: 边界检测 ======

        // 检测数据不足（工单 < 5 单）
        var orderCount = reportData.orderCount || 0
        if (orderCount < 5) {
          // 仍然展示报告但标记为"低数据"模式
          reportData._lowDataMode = true
          reportData._lowDataHint = `本月经营数据较少（仅${orderCount}单），诊断参考性有限。积累更多数据后分析将更准确。`
        }

        // 预计算 WXML 需要的派生字段
        reportData = page._enrichReportData(reportData)

        // ★ 获取最新门店配置用于基准文案（reportData中的shopProfile是历史快照）
        var myOpenid = app.globalData._openid || (wx.getStorageSync('shopInfo') || {}).openid || ''
        return app.callFunction('repair_main', {
          action: 'getShopProfile',
          shopPhone: shopPhone,
          clientOpenid: myOpenid   // ★ 传入 openid 做鉴权（修复 -3 "未登录" bug）
        }).then(function (profileRes) {
          // 用最新配置覆盖报告中的旧快照（仅影响benchmarkText展示）
          if (profileRes.code === 0 && profileRes.data && profileRes.data.bayCount !== undefined) {
            if (!reportData.shopProfile) reportData.shopProfile = {}
            reportData.shopProfile.bayCount = profileRes.data.bayCount
          }

          // 动态生成参考范围文案（使用更新后的bayCount）
          var benchText = page._buildBenchmarkText(reportData.shopProfile)

          var months = page.data.months
          months[page.data.currentIndex].hasData = true
          page.setData({
            report: reportData,
            months: months,
            loading: false,
            shopProfile: reportData.shopProfile || null,
            expandedIndex: -1,
            emptyType: '',
            benchmarkText: benchText
          })
        }).catch(function () {
          // getShopProfile 失败时 fallback 到报告自带快照
          var benchText = page._buildBenchmarkText(reportData.shopProfile)
          var months = page.data.months
          months[page.data.currentIndex].hasData = true
          page.setData({
            report: reportData,
            months: months,
            loading: false,
            shopProfile: reportData.shopProfile || null,
            expandedIndex: -1,
            emptyType: '',
            benchmarkText: benchText
          })
        })
      } else if (res.code !== 0) {
        // [BUG#6 修复] 统一非成功码处理（兼容云函数返回的 -2/10001 等各种错误码）
        page._handleEmptyResponse(res.message || res.msg || '')
      } else {
        // 无报告数据 — 尝试判断原因
        page._handleEmptyResponse('')
      }
    }).catch(function (err) {
      console.error('[monthlyReport] 加载失败:', err)
      page.setData({ loading: false })
      // 网络异常不显示空态，保留上次数据或空白
    })
  },

  /**
   * Phase 4: 预计算 WXML 所需的派生字段
   * WXML 不支持 Math.abs / Date 等全局函数调用，需在此预处理
   * [BUG#1+BUG#2 修复] 增加嵌套对象空保护，防止云函数返回数据不完整时崩溃
   */
  _enrichReportData(data) {
    // ★ 确保嵌套对象存在（防止云函数返回数据不完整时崩溃）
    if (!data.comparison) data.comparison = { prevMonthRevenueChange: 0, prevYearRevenueChange: null }
    if (!data.metrics) data.metrics = {
      newCustomerRatio: 0,
      maintenanceRatio: 0,
      valueAddedRatio: 0,
      repeatRate: 0,
      avgTicketTrend: 'stable',
      avgTicketChangePercent: 0
    }

    // 环比绝对值
    data.comparison._revChangeAbs = Math.abs(data.comparison.prevMonthRevenueChange || 0)
    data.comparison._hasPrevYear = typeof data.comparison.prevYearRevenueChange === 'number'
    data.comparison._prevYearAbs = Math.abs(data.comparison.prevYearRevenueChange || 0)

    // 客单价变化百分比格式化 + 比例指标百分比值预计算（WXML 不支持 .toFixed）
    data.metrics._avgTicketChangeDisplay = typeof data.metrics.avgTicketChangePercent === 'number'
      ? data.metrics.avgTicketChangePercent.toFixed(1) + '%'
      : ''
    data.metrics._newCustomerRatioPct = Math.round((data.metrics.newCustomerRatio || 0) * 100)
    data.metrics._maintenanceRatioPct = Math.round((data.metrics.maintenanceRatio || 0) * 100)
    data.metrics._valueAddedRatioPct = Math.round((data.metrics.valueAddedRatio || 0) * 100)
    data.metrics._repeatRatePct = Math.round((data.metrics.repeatRate || 0) * 100)

    // 确保 diagnoses 是数组
    if (!Array.isArray(data.diagnoses)) {
      data.diagnoses = []
    }

    // 确保 healthScore 存在
    if (!data.healthScore) {
      data.healthScore = { total: 0, level: 'critical', dimensions: {} }
    }
    // 预计算评分显示值（防止 WXML 中 0 || '--' 的 falsy 陷阱）
    data.healthScore._displayTotal = data.healthScore.total != null ? String(data.healthScore.total) : '--'

    return data
  },

  /**
   * Phase 4: 处理空数据响应，判断空态类型
   */
  _handleEmptyResponse(hint) {
    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var openYear = shopInfo.openYear
    var now = new Date()
    var monthsSinceOpen = openYear
      ? (now.getFullYear() - openYear) * 12 + now.getMonth()
      : 999

    var emptyType = 'no_data'
    var emptyHint = hint || '暂无该月经营报告'

    // 新店判断：开业不到 1 个月
    if (monthsSinceOpen < 1) {
      emptyType = 'new_shop'
      emptyHint = '积累更多数据后即可生成报告，通常需要满 1 个月经营数据'
    } else if (monthsSinceOpen < 3) {
      // 开业 1-3 个月：提示数据积累中
      emptyHint = '门店开业时间较短，部分分析维度数据仍在积累中'
    }

    page.setData({
      report: null,
      loading: false,
      emptyType: emptyType,
      emptyHint: emptyHint,
      benchmarkText: ''
    })
  },

  /**
   * Phase 4: 根据门店规模生成参考范围文案
   */
  _buildBenchmarkText(shopProfile) {
    var bayCount = (shopProfile && shopProfile.bayCount) || 2

    // 规模分级文案（与 benchmarks.js 数据一致）
    var scaleLabel = ''
    var orderRange = ''
    var ticketRange = ''
    var maintRatio = ''

    if (bayCount <= 2) {
      scaleLabel = '小微型(1-2工位)'
      orderRange = '40-60单/月'
      ticketRange = '¥250-400'
      maintRatio = '≥50%'
    } else if (bayCount <= 5) {
      scaleLabel = '中型(3-5工位)'
      orderRange = '80-120单/月'
      ticketRange = '¥350-500'
      maintRatio = '≥50%'
    } else {
      scaleLabel = '大型(6+工位)'
      orderRange = '150单+/月'
      ticketRange = '¥420-600'
      maintRatio = '≥45%'
    }

    return '同规模(' + scaleLabel + ')优秀门店参考：客单价 ' + ticketRange + ' · 工单 ' + orderRange + ' · 维保占比 ' + maintRatio
  },

  /**
   * Phase 4: 显示空态
   */
  _showEmpty(type, hint) {
    this.setData({
      report: null,
      loading: false,
      emptyType: type || 'no_data',
      emptyHint: hint || '暂无数据',
      benchmarkText: ''
    })
  },

  // ====== 跳转回首页 =====
  goBack() {
    wx.navigateBack()
  },

  // ====== 诊断项展开/折叠 =====

  onDiagToggle(e) {
    var index = e.currentTarget.dataset.index
    var curExpanded = this.data.expandedIndex

    if (curExpanded === index) {
      this.setData({ expandedIndex: -1 })
    } else {
      this.setData({ expandedIndex: index })
    }
  },

  // ====== 案例弹窗 =====

  /** 打开案例弹窗 */
  onOpenCaseModal(e) {
    var tag = e.currentTarget.dataset.caseTag || ''
    var title = e.currentTarget.dataset.caseTitle || '标杆案例'
    this.setData({
      caseModalVisible: true,
      currentCaseTag: tag,
      currentCaseTitle: title
    })
  },

  /** 关闭案例弹窗 */
  _onCaseModalClose() {
    this.setData({
      caseModalVisible: false,
      currentCaseTag: '',
      currentCaseTitle: ''
    })
  }
})
