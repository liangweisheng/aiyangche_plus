// cloudfunctions/repair_main/benchmarks.js
// 行业基准值配置（按门店规模分级）
// 副本与 utils/benchmarks.js 保持同步（维护模式：修改任一需同步另一份）

var SMALL_SHOP = {
  orderCount: { excellent: 60, good: 40, normal: 20, low: 0 },
  avgTicket: { excellent: 400, good: 250, normal: 150, low: 0 },
  avgTicketDefaultBenchmark: 300,
  newCustomerRatio: { excellent: 0.30, good: 0.20, normal: 0.10, low: 0.10 },
  maintenanceRatio: { excellent: 0.70, good: 0.50, normal: 0.30, low: 0.30 },
  valueAddedRatio: { excellent: 0.20, good: 0.10, normal: 0.05, low: 0.05 },
  repeatRate: { excellent: 0.70, good: 0.50, normal: 0.30, low: 0.30 },
  ticketRatio: { excellent: 1.2, good: 0.8, normal: 0.5, low: 0.5 }
}

var MEDIUM_SHOP = {
  orderCount: { excellent: 120, good: 80, normal: 40, low: 0 },
  avgTicket: { excellent: 500, good: 350, normal: 220, low: 0 },
  avgTicketDefaultBenchmark: 380,
  newCustomerRatio: { excellent: 0.25, good: 0.18, normal: 0.10, low: 0.10 },
  maintenanceRatio: { excellent: 0.65, good: 0.50, normal: 0.35, low: 0.35 },
  valueAddedRatio: { excellent: 0.18, good: 0.10, normal: 0.05, low: 0.05 },
  repeatRate: { excellent: 0.60, good: 0.45, normal: 0.28, low: 0.28 },
  ticketRatio: { excellent: 1.15, good: 0.85, normal: 0.55, low: 0.55 }
}

var LARGE_SHOP = {
  orderCount: { excellent: 200, good: 150, normal: 80, low: 0 },
  avgTicket: { excellent: 600, good: 420, normal: 280, low: 0 },
  avgTicketDefaultBenchmark: 450,
  newCustomerRatio: { excellent: 0.22, good: 0.15, normal: 0.08, low: 0.08 },
  maintenanceRatio: { excellent: 0.60, good: 0.45, normal: 0.30, low: 0.30 },
  valueAddedRatio: { excellent: 0.15, good: 0.08, normal: 0.04, low: 0.04 },
  repeatRate: { excellent: 0.55, good: 0.40, normal: 0.25, low: 0.25 },
  ticketRatio: { excellent: 1.10, good: 0.85, normal: 0.55, low: 0.55 }
}

var SCORE_LEVELS = {
  excellent: { minScore: 85, label: '优秀', color: '#52c41a', bgClass: 'excellent' },
  good:       { minScore: 70, label: '良好', color: '#1890ff', bgClass: 'good' },
  warning:    { minScore: 50, label: '需改善', color: '#faad14', bgClass: 'warning' },
  critical:   { minScore: 0,  label: '堪忧', color: '#ff4d4f', bgClass: 'critical' }
}

var DIMENSION_MAX_SCORE = 20
var SCORE_TIERS = [20, 15, 10, 5]

module.exports = {
  SMALL_SHOP: SMALL_SHOP,
  MEDIUM_SHOP: MEDIUM_SHOP,
  LARGE_SHOP: LARGE_SHOP,
  SCORE_LEVELS: SCORE_LEVELS,
  DIMENSION_MAX_SCORE: DIMENSION_MAX_SCORE,
  SCORE_TIERS: SCORE_TIERS,
  getBenchmarks: function (bayCount) {
    var bc = parseInt(bayCount) || 2
    if (bc >= 6 && LARGE_SHOP) return LARGE_SHOP
    if (bc >= 3 && MEDIUM_SHOP) return MEDIUM_SHOP
    return SMALL_SHOP
  },
  getScoreLevel: function (totalScore) {
    var score = totalScore || 0
    if (score >= SCORE_LEVELS.excellent.minScore) return SCORE_LEVELS.excellent
    if (score >= SCORE_LEVELS.good.minScore) return SCORE_LEVELS.good
    if (score >= SCORE_LEVELS.warning.minScore) return SCORE_LEVELS.warning
    return SCORE_LEVELS.critical
  }
}
