// utils/diagnosisRules.js
// 诊断规则配置（与引擎分离，方便独立调整规则）
// v5.0.0 规则引擎

// ============================
// 维保类关键词（基础保养、维修、检测）
// ============================
var MAINTENANCE_KEYWORDS = [
  '保养', '机油', '机滤', '空滤', '空调滤',
  '刹车油', '防冻液', '冷却液', '变速箱', '波箱',
  '火花塞', '皮带', '轮胎', '电瓶', '蓄电池',
  '维修', '检查', '检测', '诊断', '大保养', '小保养'
]

// ============================
// 增值项目关键词（高利润项目）
// ============================
var VALUE_ADDED_KEYWORDS = [
  // 波箱/变速箱
  '波箱油', '变速箱油', 'ATF', 'CVT',
  // 刹车系统
  '刹车片', '刹车盘', '制动片', '制动盘',
  // 冷却系统
  '防冻液', '冷却液', '水箱水',
  // 空调系统
  '空调清洗', '氟利昂', '冷媒', '蒸发箱清洗',
  // 燃油系统
  '燃油清洗', '喷油嘴', '节气门', '积碳',
  // 美容/养护
  '发动机清洗', '内饰消毒', '漆面养护', '镀晶', '打蜡',
  // 四轮
  '四轮定位', '动平衡'
]

// ============================
// 诊断规则列表
// ============================
// 规则结构：
//   id          — 唯一标识
//   metric      — 对应的指标字段名（metrics 对象中的 key）
//   condition   — 判断函数(metrics) => boolean
//   severity    — 严重级别: warning / info / success
//   title       — 诊断标题
//   detailTpl   — 详情模板（支持 {value} 和 {benchmark} 变量替换）
//   suggestions — 建议数组（2-3条可执行建议）
//   caseTag     — 关联的案例图片标签
//
// 执行顺序：数组顺序即优先级。引擎会按顺序匹配，最多返回 N 条。
// 严重级别排序：warning > info > success
var DIAGNOSIS_RULES = [
  {
    id: 'new_customer_low',
    metric: 'newCustomerRatio',
    condition: function (metrics) { return metrics.newCustomerRatio < 0.15 },
    severity: 'warning',
    title: '新客获取不足',
    detailTpl: '本月新客占比{value}%，低于同规模门店平均水平（约25%）。',
    suggestions: [
      '推出"老带新"优惠活动（如：推荐新客送免费洗车一次）',
      '在门店周边3公里社区投放地推物料',
      '利用微信朋友圈定期发布养护知识，吸引周边车主'
    ],
    caseTag: 'new_customer'
  },
  {
    id: 'value_added_low',
    metric: 'valueAddedRatio',
    condition: function (metrics) { return metrics.valueAddedRatio < 0.10 },
    severity: 'warning',
    title: '增值服务渗透不足',
    detailTpl: '增值项目仅占{value}%，有较大提升空间。每增加1个刹车油/波箱油项目≈+200元营收。',
    suggestions: [
      '建立检查清单流程：每次接待主动检查刹车油/冷却液/空调滤芯',
      '制作车内检查卡，让客户看到实物状态更易接受',
      '将增值项目套餐化（如："夏季养车套餐"含空调清洗+冷媒）'
    ],
    caseTag: 'value_added'
  },
  {
    id: 'repeat_customer_low',
    metric: 'repeatRate',
    condition: function (metrics) { return metrics.repeatRate < 0.40 },
    severity: 'warning',
    title: '客户流失风险',
    detailTpl: '老客复购率{value}%偏低，需关注客户留存。',
    suggestions: [
      '建立客户档案，在保养到期前7天主动微信提醒',
      '为常客户提供专属折扣或优先服务权益',
      '关注超90天未回访的老客户，电话回访关怀'
    ],
    caseTag: 'retention'
  },
  {
    id: 'maintenance_ratio_low',
    metric: 'maintenanceRatio',
    condition: function (metrics) { return metrics.maintenanceRatio < 0.40 },
    severity: 'info',
    title: '维保业务占比较低',
    detailTpl: '维保类工单占{value}%，以快修/美容为主。维保是稳定收入来源。',
    suggestions: [
      '培训技师掌握标准保养流程话术',
      '制作保养套餐价格透明化展示板'
    ],
    caseTag: 'maintenance'
  },
  {
    id: 'avg_ticket_low',
    metric: 'ticketRatio',  // 使用计算后的比率而非原始值
    condition: function (metrics) { return (metrics._ticketRatio || 0) < 0.7 && (metrics._rawAvgTicket || 0) > 0 },
    severity: 'warning',
    title: '客单价偏低',
    detailTpl: '平均客单价¥{_rawAvgTicket}低于行业基准¥{_benchmark}，有提升空间。',
    suggestions: [
      '优化服务项目组合，推荐性价比高的升级方案',
      '对高价值车型提供差异化服务包',
      '制作"养车套餐"阶梯价格表，引导客户选择中高端方案'
    ],
    caseTag: 'ticket'
  },
  // 正面反馈兜底规则（当无任何 warning 时自动添加）
  {
    id: 'all_good',
    metric: '_special',
    condition: function () { return true },  // 由引擎控制何时使用
    severity: 'success',
    title: '经营状况良好',
    detailTpl: '综合评分{score}分，各项指标表现优异！继续保持。',
    suggestions: [],
    caseTag: 'excellent'
  }
]

// 案例-规则映射表（用于案例弹窗匹配）
var CASE_IMAGE_MAP = {
  new_customer: [],   // Phase 4 注入实际图片路径
  value_added: [],
  retention: [],
  maintenance: [],
  ticket: [],
  excellent: []
}

module.exports = {
  MAINTENANCE_KEYWORDS: MAINTENANCE_KEYWORDS,
  VALUE_ADDED_KEYWORDS: VALUE_ADDED_KEYWORDS,
  DIAGNOSIS_RULES: DIAGNOSIS_RULES,
  CASE_IMAGE_MAP: CASE_IMAGE_MAP,

  /**
   * 从 serviceItems 文本判断是否包含维保关键词
   * @param {string} serviceItems 服务项目文本
   * @returns {boolean}
   */
  hasMaintenanceKeyword: function (serviceItems) {
    if (!serviceItems) return false
    var text = String(serviceItems).toLowerCase()
    return MAINTENANCE_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1 })
  },

  /**
   * 从 serviceItems 文本判断是否包含增值项目关键词
   * @param {string} serviceItems 服务项目文本
   * @returns {boolean}
   */
  hasValueAddedKeyword: function (serviceItems) {
    if (!serviceItems) return false
    var text = String(serviceItems).toLowerCase()
    return VALUE_ADDED_KEYWORDS.some(function (kw) { return text.indexOf(kw) !== -1 })
  },

  /**
   * 渲染诊断详情模板，替换变量占位符
   * 支持的变量：{value}, {benchmark}, {_rawAvgTicket}, {_benchmark}, {score}
   * @param {string} template 模板字符串
   * @param {Object} data 变量键值对
   * @returns {string} 渲染后的文本
   */
  renderTemplate: function (template, data) {
    if (!template) return ''
    var text = template
    Object.keys(data || {}).forEach(function (key) {
      var val = data[key]
      var displayVal = (typeof val === 'number')
        ? (Number.isInteger(val) ? val : val.toFixed(1))
        : (val || '')
      text = text.replace(new RegExp('\\{' + key + '\\}', 'g'), displayVal)
    })
    return text
  }
}
