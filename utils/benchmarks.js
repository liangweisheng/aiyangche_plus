// utils/benchmarks.js
// 行业基准值配置（按门店规模分级）
// v5.0.0 规则引擎 - 纯数据，无副作用

/**
 * 小微型门店基准值（1-2工位）
 * 来源：行业调研 + 经验数据
 */
var SMALL_SHOP = {
  // 月工单量基准（单/月）
  orderCount: {
    excellent: 60,
    good: 40,
    normal: 20,
    low: 0
  },

  // 平均客单价基准（元）
  avgTicket: {
    excellent: 400,
    good: 250,
    normal: 150,
    low: 0
  },
  // 客单价默认基准（用于评分计算）
  avgTicketDefaultBenchmark: 300,

  // 新客占比阈值
  newCustomerRatio: {
    excellent: 0.30,   // ≥30% = 优秀
    good: 0.20,        // 20-30% = 良好
    normal: 0.10,      // 10-20% = 一般
    low: 0.10          // <10% = 偏低
  },

  // 维保占比阈值（保养+维修类工单 / 总工单）
  maintenanceRatio: {
    excellent: 0.70,   // ≥70%
    good: 0.50,        // 50-70%
    normal: 0.30,      // 30-50%
    low: 0.30          // <30%
  },

  // 增值项目占比阈值
  valueAddedRatio: {
    excellent: 0.20,   // ≥20%
    good: 0.10,        // 10-20%
    normal: 0.05,      // 5-10%
    low: 0.05          // <5%
  },

  // 老客复购率阈值
  repeatRate: {
    excellent: 0.70,   // ≥70%
    good: 0.50,        // 50-70%
    normal: 0.30,      // 30-50%
    low: 0.30          // <30%
  },

  // 客单价比率阈值（当月平均 / 行业基准）
  ticketRatio: {
    excellent: 1.2,    // ≥120%基准
    good: 0.8,         // 80-120%
    normal: 0.5,       // 50-80%
    low: 0.5           // <50%
  }
}

/**
 * 中型门店基准值（3-5工位）
 * 来源：行业调研 + 经验数据
 */
var MEDIUM_SHOP = {
  // 月工单量基准（单/月）
  orderCount: {
    excellent: 120,
    good: 80,
    normal: 40,
    low: 0
  },

  // 平均客单价基准（元）
  avgTicket: {
    excellent: 500,
    good: 350,
    normal: 220,
    low: 0
  },
  // 客单价默认基准（用于评分计算）
  avgTicketDefaultBenchmark: 380,

  // 新客占比阈值
  newCustomerRatio: {
    excellent: 0.25,   // ≥25% = 优秀
    good: 0.18,        // 18-25% = 良好
    normal: 0.10,      // 10-18% = 一般
    low: 0.10          // <10% = 偏低
  },

  // 维保占比阈值（保养+维修类工单 / 总工单）
  maintenanceRatio: {
    excellent: 0.65,   // ≥65%
    good: 0.50,        // 50-65%
    normal: 0.35,      // 35-50%
    low: 0.35          // <35%
  },

  // 增值项目占比阈值
  valueAddedRatio: {
    excellent: 0.18,   // ≥18%
    good: 0.10,        // 10-18%
    normal: 0.05,      // 5-10%
    low: 0.05          // <5%
  },

  // 老客复购率阈值
  repeatRate: {
    excellent: 0.60,   // ≥60%
    good: 0.45,        // 45-60%
    normal: 0.28,      // 28-45%
    low: 0.28          // <28%
  },

  // 客单价比率阈值（当月平均 / 行业基准）
  ticketRatio: {
    excellent: 1.15,   // ≥115%基准
    good: 0.85,        // 85-115%
    normal: 0.55,      // 55-85%
    low: 0.55           // <55%
  }
}

/**
 * 大型门店基准值（6工位以上）
 * 来源：行业调研 + 经验数据
 */
var LARGE_SHOP = {
  // 月工单量基准（单/月）
  orderCount: {
    excellent: 200,
    good: 150,
    normal: 80,
    low: 0
  },

  // 平均客单价基准（元）
  avgTicket: {
    excellent: 600,
    good: 420,
    normal: 280,
    low: 0
  },
  // 客单价默认基准（用于评分计算）
  avgTicketDefaultBenchmark: 450,

  // 新客占比阈值
  newCustomerRatio: {
    excellent: 0.22,   // ≥22% = 优秀
    good: 0.15,        // 15-22% = 良好
    normal: 0.08,      // 8-15% = 一般
    low: 0.08          // <8% = 偏低
  },

  // 维保占比阈值（保养+维修类工单 / 总工单）
  maintenanceRatio: {
    excellent: 0.60,   // ≥60%
    good: 0.45,        // 45-60%
    normal: 0.30,      // 30-45%
    low: 0.30          // <30%
  },

  // 增值项目占比阈值
  valueAddedRatio: {
    excellent: 0.15,   // ≥15%
    good: 0.08,        // 8-15%
    normal: 0.04,      // 4-8%
    low: 0.04          // <4%
  },

  // 老客复购率阈值
  repeatRate: {
    excellent: 0.55,   // ≥55%
    good: 0.40,        // 40-55%
    normal: 0.25,      // 25-40%
    low: 0.25          // <25%
  },

  // 客单价比率阈值（当月平均 / 行业基准）
  ticketRatio: {
    excellent: 1.10,   // ≥110%基准
    good: 0.85,        // 85-110%
    normal: 0.55,      // 55-85%
    low: 0.55           // <55%
  }
}

// 健康评分等级划分
var SCORE_LEVELS = {
  excellent: { minScore: 85, label: '优秀', color: '#52c41a', bgClass: 'excellent' },
  good:       { minScore: 70, label: '良好', color: '#1890ff', bgClass: 'good' },
  warning:    { minScore: 50, label: '需改善', color: '#faad14', bgClass: 'warning' },
  critical:   { minScore: 0,  label: '堪忧', color: '#ff4d4f', bgClass: 'critical' }
}

// 各维度满分分值
var DIMENSION_MAX_SCORE = 20

// 评分档位对应分数 [优秀分, 良好分, 一般分, 低分]
var SCORE_TIERS = [20, 15, 10, 5]

module.exports = {
  SMALL_SHOP: SMALL_SHOP,
  MEDIUM_SHOP: MEDIUM_SHOP,
  LARGE_SHOP: LARGE_SHOP,
  SCORE_LEVELS: SCORE_LEVELS,
  DIMENSION_MAX_SCORE: DIMENSION_MAX_SCORE,
  SCORE_TIERS: SCORE_TIERS,

  /**
   * 根据工位数获取对应的基准值配置
   * @param {number} bayCount 工位数
   * @returns {Object} 基准值配置对象
   */
  getBenchmarks: function (bayCount) {
    var bc = parseInt(bayCount) || 2
    if (bc >= 6 && LARGE_SHOP) return LARGE_SHOP
    if (bc >= 3 && MEDIUM_SHOP) return MEDIUM_SHOP
    return SMALL_SHOP
  },

  /**
   * 根据总分获取等级信息
   * @param {number} totalScore 总分(0-100)
   * @returns {Object} { level, label, color, bgClass }
   */
  getScoreLevel: function (totalScore) {
    var score = totalScore || 0
    if (score >= SCORE_LEVELS.excellent.minScore) return SCORE_LEVELS.excellent
    if (score >= SCORE_LEVELS.good.minScore) return SCORE_LEVELS.good
    if (score >= SCORE_LEVELS.warning.minScore) return SCORE_LEVELS.warning
    return SCORE_LEVELS.critical
  }
}
