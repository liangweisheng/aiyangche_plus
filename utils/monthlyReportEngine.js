// utils/monthlyReportEngine.js
// 经营月报规则引擎核心（纯函数，可测试，无副作用）
// v5.0.0 AI月报功能 - Phase 2
//
// 职责：
//   1. 接收原始聚合订单数据 + 门店配置
//   2. 计算5项核心指标
//   3. 计算健康评分
//   4. 匹配诊断规则
//   5. 输出完整报告对象
//
// 设计原则：
//   - 所有函数为纯函数（输入确定 → 输出确定）
//   - 无网络请求，无 DOM 操作，无全局状态依赖
//   - 可在 Node.js 和小程序环境运行
//   - 可独立单元测试

var benchmarks = require('./benchmarks')
var diagnosisRules = require('./diagnosisRules')

// ============================
// 公开 API
// ============================

/**
 * 主入口：从原始订单数据生成完整报告
 *
 * @param {Object} params
 * @param {Array}  params.orders             当月订单列表（需含 plate, totalAmount, serviceItems, createTime）
 * @param {Array}  params.allHistoricalOrders 历史全部订单（用于新老客判断，需含 plate, createTime）
 * @param {Array}  [params.prevMonthOrders]   上月订单（用于环比，需含 totalAmount）
 * @param {Object} [params.shopProfile]       门店配置 { bayCount, openYear, city }
 * @param {string} params.shopPhone           门店手机号
 * @param {string} params.yearMonth           报告月份 "YYYY-MM"
 * @returns {Object} 完整报告对象（与 repair_monthlyReports 数据模型一致）
 */
function generateReport(params) {
  var orders = params.orders || []
  var allHistoricalOrders = params.allHistoricalOrders || []
  var prevMonthOrders = params.prevMonthOrders || []
  var shopProfile = params.shopProfile || {}
  var shopPhone = params.shopPhone || ''
  var yearMonth = params.yearMonth || ''

  if (!shopPhone || !yearMonth) {
    return { error: '缺少必要参数 shopPhone 或 yearMonth' }
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    return { error: '月份格式错误，应为 YYYY-MM（如 2026-01）' }
  }

  if (orders.length === 0 && allHistoricalOrders.length === 0) {
    return { error: '该月份暂无经营数据' }
  }

  // ====== 1. 解析时间范围 ======
  var year = parseInt(yearMonth.split('-')[0]) || new Date().getFullYear()
  var month = (parseInt(yearMonth.split('-')[1]) || 1) - 1
  var monthStart = new Date(year, month, 1)
  var monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

  // ====== 2. 计算基础指标 ======
  var baseMetrics = _calcBaseMetrics(orders)

  // ====== 3. 计算5项核心指标 ======
  var historicalPlates = _extractHistoricalPlates(allHistoricalOrders, monthStart)
  var coreMetrics = _calcCoreMetrics(orders, historicalPlates, baseMetrics.avgTicket, prevMonthOrders, baseMetrics.revenue)

  // ====== 4. 获取基准值 ======
  var bench = benchmarks.getBenchmarks(shopProfile.bayCount)
  var avgTicketBench = (shopProfile && shopProfile.avgTicketBenchmark)
    ? shopProfile.avgTicketBenchmark
    : bench.avgTicketDefaultBenchmark

  // ====== 5. 计算健康评分 ======
  var healthScore = _calcHealthScore(coreMetrics, bench, avgTicketBench, baseMetrics.avgTicket)

  // ====== 6. 匹配诊断规则 ======
  var diagnoses = _matchDiagnoses(coreMetrics, healthScore, baseMetrics.avgTicket, avgTicketBench)

  // ====== 7. 组装报告 ======
  return _buildReport({
    shopPhone: shopPhone,
    yearMonth: yearMonth,
    baseMetrics: baseMetrics,
    coreMetrics: coreMetrics,
    healthScore: healthScore,
    diagnoses: diagnoses,
    shopProfile: shopProfile,
    avgTicketBenchmark: avgTicketBench
  })
}

// ============================
// 指标计算函数（公开，供单独调用和测试）
// ============================

/**
 * 计算新客占比
 * @param {Array} orders 当月订单
 * @param {Object} historicalPlates 历史车牌集合 { plate: true }
 * @returns {number} 0~1 之间的小数
 */
function calcNewCustomerRatio(orders, historicalPlates) {
  var currentPlates = _extractUniquePlates(orders)
  if (currentPlates.length === 0) return 0

  var newCount = 0
  for (var i = 0; i < currentPlates.length; i++) {
    if (!historicalPlates[currentPlates[i]]) newCount++
  }
  return Math.round(newCount / currentPlates.length * 10000) / 10000
}

/**
 * 计算维保占比
 * @param {Array} orders 当月订单（每个订单需含 serviceItems 字段）
 * @returns {number} 0~1 之间的小数
 */
function calcMaintenanceRatio(orders) {
  if (orders.length === 0) return 0
  var count = 0
  for (var i = 0; i < orders.length; i++) {
    if (diagnosisRules.hasMaintenanceKeyword(orders[i].serviceItems)) {
      count++
    }
  }
  return Math.round(count / orders.length * 10000) / 10000
}

/**
 * 计算增值项目占比
 * @param {Array} orders 当月订单
 * @returns {number} 0~1 之间的小数
 */
function calcValueAddedRatio(orders) {
  if (orders.length === 0) return 0
  var count = 0
  for (var i = 0; i < orders.length; i++) {
    if (diagnosisRules.hasValueAddedKeyword(orders[i].serviceItems)) {
      count++
    }
  }
  return Math.round(count / orders.length * 10000) / 10000
}

/**
 * 计算老客复购率
 * @param {Array|Object} currentPlates 当月不重复车牌数组或集合
 * @param {Object} historicalPlates 历史车牌集合
 * @returns {number} 0~1 之间的小数
 */
function calcRepeatRate(currentPlates, historicalPlates) {
  var plates = Array.isArray(currentPlates) ? currentPlates : Object.keys(currentPlates || {})
  if (plates.length === 0) return 0
  var repeatCount = 0
  for (var i = 0; i < plates.length; i++) {
    if (historicalPlates[plates[i]]) repeatCount++
  }
  return Math.round(repeatCount / plates.length * 10000) / 10000
}

/**
 * 计算客单价趋势
 * @param {number} currentAvg 当前月均客单价
 * @param {number} prevAvg 上月均客单价
 * @returns {Object} { trend: 'up'|'down'|'stable', changePercent: number }
 */
function calcAvgTicketTrend(currentAvg, prevAvg) {
  var result = { trend: 'stable', changePercent: 0 }
  if (prevAvg > 0 && currentAvg > 0) {
    result.changePercent = Math.round((currentAvg - prevAvg) / prevAvg * 10000) / 100
    result.trend = result.changePercent > 2 ? 'up' : result.changePercent < -2 ? 'down' : 'stable'
  }
  return result
}

/**
 * 计算健康评分
 * @param {Object} coreMetrics 5项核心指标
 * @param {Object} bench 基准值配置
 * @param {number} avgTicketBench 客单价基准值
 * @param {number} rawAvgTicket 原始平均客单价
 * @returns {Object} { total, level, dimensions }
 */
function calcHealthScore(coreMetrics, bench, avgTicketBench, rawAvgTicket) {
  var dims = {
    newCustomer: _scoreDimension(
      coreMetrics.newCustomerRatio,
      [bench.newCustomerRatio.excellent, bench.newCustomerRatio.good, bench.newCustomerRatio.normal],
      benchmarks.SCORE_TIERS
    ),
    maintenance: _scoreDimension(
      coreMetrics.maintenanceRatio,
      [bench.maintenanceRatio.excellent, bench.maintenanceRatio.good, bench.maintenanceRatio.normal],
      benchmarks.SCORE_TIERS
    ),
    valueAdded: _scoreDimension(
      coreMetrics.valueAddedRatio,
      [bench.valueAddedRatio.excellent, bench.valueAddedRatio.good, bench.valueAddedRatio.normal],
      benchmarks.SCORE_TIERS
    ),
    repeatCustomer: _scoreDimension(
      coreMetrics.repeatRate,
      [bench.repeatRate.excellent, bench.repeatRate.good, bench.repeatRate.normal],
      benchmarks.SCORE_TIERS
    ),
    avgTicket: _scoreDimension(
      avgTicketBench > 0 ? rawAvgTicket / avgTicketBench : 0,
      [bench.ticketRatio.excellent, bench.ticketRatio.good, bench.ticketRatio.normal],
      benchmarks.SCORE_TIERS
    )
  }

  var total = dims.newCustomer + dims.maintenance + dims.valueAdded + dims.repeatCustomer + dims.avgTicket
  var levelInfo = benchmarks.getScoreLevel(total)

  return {
    total: total,
    level: levelInfo.bgClass,
    dimensions: dims
  }
}

/**
 * 匹配诊断规则
 * @param {Object} coreMetrics 核心指标
 * @param {Object} healthScore 健康评分
 * @param {number} rawAvgTicket 原始客单价
 * @param {number} benchmark 基准客单价
 * @param {number} [maxResults=4] 最大返回条数
 * @returns {Array} 诊断结果数组
 */
function matchDiagnoses(coreMetrics, healthScore, rawAvgTicket, benchmark, maxResults) {
  maxResults = maxResults || 4

  // 构建完整的 metrics 对象传给规则条件函数
  var evalMetrics = {
    newCustomerRatio: coreMetrics.newCustomerRatio,
    maintenanceRatio: coreMetrics.maintenanceRatio,
    valueAddedRatio: coreMetrics.valueAddedRatio,
    repeatRate: coreMetrics.repeatRate,
    avgTicketTrend: coreMetrics.avgTicketTrend,
    avgTicketChangePercent: coreMetrics.avgTicketChangePercent,
    // 内部辅助字段
    _ticketRatio: benchmark > 0 ? rawAvgTicket / benchmark : 0,
    _rawAvgTicket: rawAvgTicket,
    _benchmark: benchmark,
    _score: healthScore.total
  }

  var results = []

  // 先执行常规规则（排除 all_good 兜底规则）
  var rules = diagnosisRules.DIAGNOSIS_RULES.filter(function (r) { return r.id !== 'all_good' })

  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i]
    try {
      if (rule.condition(evalMetrics)) {
        results.push(_buildDiagnosisItem(rule, evalMetrics, rawAvgTicket, benchmark, healthScore.total))
      }
    } catch (e) {
      console.error('[monthlyReportEngine] 规则执行错误:', rule.id, e)
    }
  }

  // 如果没有 warning 级别的诊断，添加正面反馈
  var hasWarning = results.some(function (d) { return d.severity === 'warning' })
  if (!hasWarning) {
    var allGoodRule = diagnosisRules.DIAGNOSIS_RULES.find(function (r) { return r.id === 'all_good' })
    if (allGoodRule) {
      results.push(_buildDiagnosisItem(allGoodRule, evalMetrics, rawAvgTicket, benchmark, healthScore.total))
    }
  }

  return results.slice(0, maxResults)
}

// ============================
// 内部工具函数
// ============================

/** 计算基础指标（营收、工单数、客单价、不重复车牌） */
function _calcBaseMetrics(orders) {
  var revenue = 0
  var orderCount = orders.length
  var plateSet = {}

  for (var i = 0; i < orders.length; i++) {
    revenue += parseFloat(orders[i].totalAmount) || 0
    if (orders[i].plate) plateSet[orders[i].plate] = true
  }

  var avgTicket = orderCount > 0
    ? Math.round(revenue / orderCount * 100) / 100
    : 0

  return {
    revenue: Math.round(revenue * 100) / 100,
    orderCount: orderCount,
    avgTicket: avgTicket,
    uniquePlates: Object.keys(plateSet).length,
    _plateSet: plateSet
  }
}

/** 提取历史车牌（不含当月的） */
function _extractHistoricalPlates(allOrders, monthStart) {
  var plates = {}
  for (var i = 0; i < allOrders.length; i++) {
    var o = allOrders[i]
    if (o.plate && o.createTime) {
      var t = new Date(o.createTime)
      if (t < monthStart) plates[o.plate] = true
    }
  }
  return plates
}

/** 提取不重复车牌列表 */
function _extractUniquePlates(orders) {
  var set = {}
  for (var i = 0; i < orders.length; i++) {
    if (orders[i].plate) set[orders[i].plate] = true
  }
  return Object.keys(set)
}

/** 计算5项核心指标汇总 */
function _calcCoreMetrics(orders, historicalPlates, avgTicket, prevMonthOrders, currentRevenue) {
  var currentPlates = _extractUniquePlates(orders)

  var ncr = calcNewCustomerRatio(orders, historicalPlates)
  var mr = calcMaintenanceRatio(orders)
  var var_ = calcValueAddedRatio(orders)
  var rr = calcRepeatRate(currentPlates, historicalPlates)

  // 上月环比
  var prevRevenue = 0
  var prevCount = 0
  for (var i = 0; i < prevMonthOrders.length; i++) {
    prevRevenue += parseFloat(prevMonthOrders[i].totalAmount) || 0
    prevCount++
  }
  var prevAvgTicket = prevCount > 0 ? Math.round(prevRevenue / prevCount * 100) / 100 : 0
  var ticketTrend = calcAvgTicketTrend(avgTicket, prevAvgTicket)

  var prevMonthRevChange = (prevRevenue > 0 && typeof currentRevenue === 'number')
    ? Math.round((currentRevenue - prevRevenue) / prevRevenue * 10000) / 100
    : 0

  return {
    newCustomerRatio: ncr,
    maintenanceRatio: mr,
    valueAddedRatio: var_,
    repeatRate: rr,
    avgTicketTrend: ticketTrend.trend,
    avgTicketChangePercent: ticketTrend.changePercent,
    _prevMonthRevenueChange: prevMonthRevChange
  }
}

/** 单维度评分 */
function _scoreDimension(value, thresholds, scores) {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) return scores[3]
  if (!thresholds || thresholds.length !== 3) return scores[3]
  if (value >= thresholds[0]) return scores[0]
  if (value >= thresholds[1]) return scores[1]
  if (value >= thresholds[2]) return scores[2]
  return scores[3]
}

/** 构建单条诊断结果 */
function _buildDiagnosisItem(rule, evalMetrics, rawAvgTicket, benchmark, score) {
  var templateData = {
    value: (evalMetrics[rule.metric] !== undefined)
      ? Math.round((evalMetrics[rule.metric] || 0) * 100) + '%'
      : '--',
    benchmark: benchmark || '--',
    _rawAvgTicket: rawAvgTicket || 0,
    _benchmark: benchmark || 0,
    score: score || 0
  }

  return {
    type: rule.id,
    severity: rule.severity,
    title: rule.title,
    detail: diagnosisRules.renderTemplate(rule.detailTpl, templateData),
    suggestion: (rule.suggestions || []).join('；'),
    suggestions: rule.suggestions || [],
    relatedCaseImageId: 'case_' + rule.caseTag,
    caseTag: rule.caseTag
  }
}

/** 组装最终报告对象 */
function _buildReport(params) {
  return {
    shopPhone: params.shopPhone,
    yearMonth: params.yearMonth,
    revenue: params.baseMetrics.revenue,
    orderCount: params.baseMetrics.orderCount,
    avgTicket: params.baseMetrics.avgTicket,
    uniquePlates: params.baseMetrics.uniquePlates,
    metrics: {
      newCustomerRatio: params.coreMetrics.newCustomerRatio,
      maintenanceRatio: params.coreMetrics.maintenanceRatio,
      valueAddedRatio: params.coreMetrics.valueAddedRatio,
      repeatRate: params.coreMetrics.repeatRate,
      avgTicketTrend: params.coreMetrics.avgTicketTrend,
      avgTicketChangePercent: params.coreMetrics.avgTicketChangePercent
    },
    comparison: {
      prevMonthRevenueChange: params.coreMetrics._prevMonthRevenueChange,
      prevYearRevenueChange: null
    },
    healthScore: {
      total: params.healthScore.total,
      level: params.healthScore.level,
      dimensions: params.healthScore.dimensions
    },
    diagnoses: params.diagnoses,
    shopProfile: params.shopProfile
      ? Object.assign({}, params.shopProfile, { avgTicketBenchmark: params.avgTicketBenchmark })
      : {
          bayCount: 2,
          openYear: '',
          city: '',
          avgTicketBenchmark: params.avgTicketBenchmark
        }
  }
}

// ============================
// 导出
// ============================

module.exports = {
  generateReport: generateReport,
  calcNewCustomerRatio: calcNewCustomerRatio,
  calcMaintenanceRatio: calcMaintenanceRatio,
  calcValueAddedRatio: calcValueAddedRatio,
  calcRepeatRate: calcRepeatRate,
  calcAvgTicketTrend: calcAvgTicketTrend,
  calcHealthScore: calcHealthScore,
  matchDiagnoses: matchDiagnoses
}
