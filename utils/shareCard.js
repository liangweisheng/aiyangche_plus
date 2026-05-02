/**
 * 分享卡片生成工具 v2
 * 为 dashboard、memberList、report 三个页面生成自定义分享卡片
 * 设计风格：浅灰背景 + 白色数据卡片 + 深色文字（与小程序UI协调）
 */

// 卡片尺寸（2倍图，适配高清屏）
var CARD_W = 500
var CARD_H = 400

// 颜色配置（统一浅色风格，各类型仅数据卡片颜色不同）
var THEME = {
  // 三张迷你统计卡的配色
  cardColors: {
    dashboard: ['#1677ff', '#52c41a', '#fa8c16'],   // 蓝/绿/橙
    memberList: ['#722ed1', '#13c2c2', '#eb2f96'],    // 紫/青/玫红
    report: ['#1677ff', '#52c41a', '#fa8c16']          // 蓝/绿/橙
  }
}

/**
 * 加载图片为 Promise（兼容性保留，当前不使用外部图片）
 */
function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var img = 'share_img_' + Date.now()
    wx.getImageInfo({
      src: src,
      success: function (res) {
        resolve(res.path)
      },
      fail: function (err) {
        resolve(null)
      }
    })
  })
}

/**
 * 绘制圆角矩形路径（不填充/不描边，需调用方自行操作）
 */
function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/**
 * 绘制装饰性几何图案（替代 outline.png）
 */
function drawDecorations(ctx) {
  ctx.save()
  // 右上角大圆
  ctx.globalAlpha = 0.04
  ctx.fillStyle = '#1677ff'
  ctx.beginPath()
  ctx.arc(CARD_W - 60, 20, 140, 0, Math.PI * 2)
  ctx.fill()
  // 左下角中圆
  ctx.globalAlpha = 0.03
  ctx.fillStyle = '#52c41a'
  ctx.beginPath()
  ctx.arc(40, CARD_H - 30, 100, 0, Math.PI * 2)
  ctx.fill()
  // 右下角小圆
  ctx.globalAlpha = 0.03
  ctx.fillStyle = '#fa8c16'
  ctx.beginPath()
  ctx.arc(CARD_W - 80, CARD_H - 60, 70, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 绘制顶部数据卡片区域（白色大圆角卡片 + 内部三张迷你统计卡）
 * 仅 dashboard 类型显示真实数据，其他类型显示 "--"
 */
function drawDataSection(ctx, type, data) {
  var colors = THEME.cardColors[type] || THEME.cardColors.dashboard

  // 外层白色大卡片
  ctx.fillStyle = '#ffffff'
  drawRoundRect(ctx, 20, 16, CARD_W - 40, 116, 12)
  ctx.fill()

  // 阴影效果（底部细线模拟）
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'
  ctx.lineWidth = 1
  drawRoundRect(ctx, 20, 17, CARD_W - 40, 116, 12)
  ctx.stroke()

  // 标题 "今日数据"
  ctx.fillStyle = '#999999'
  ctx.font = '12px sans-serif'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.fillText('今日数据', 34, 26)

  // 三张迷你统计卡
  var cardW = (CARD_W - 90) / 3  // 扣除左右padding和间距
  var gap = 10
  var startX = 32
  var cardY = 48
  var cardH = 72

  var items = [
    { label: '今日开单', value: '--单', color: colors[0] },
    { label: '今日营收', value: '¥--', color: colors[1] },
    { label: '车辆总数', value: '--辆', color: colors[2] }
  ]

  items.forEach(function (item, i) {
    var cx = startX + i * (cardW + gap)

    // 迷你卡片背景（极淡的彩色）
    ctx.globalAlpha = 0.06
    ctx.fillStyle = item.color
    drawRoundRect(ctx, cx, cardY, cardW, cardH, 8)
    ctx.fill()
    ctx.globalAlpha = 1.0

    // 数值
    ctx.fillStyle = item.color
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // 数值过长时缩小字体
    var valStr = String(item.value)
    if (valStr.length > 8) {
      ctx.font = 'bold 16px sans-serif'
    } else if (valStr.length > 6) {
      ctx.font = 'bold 18px sans-serif'
    }
    ctx.fillText(item.value, cx + cardW / 2, cardY + 14)

    // 标签
    ctx.fillStyle = '#888888'
    ctx.font = '11px sans-serif'
    ctx.fillText(item.label, cx + cardW / 2, cardY + 48)
  })

  // 恢复默认对齐
  ctx.textAlign = 'left'
}

/**
 * 绘制功能点列表（根据类型不同）
 */
function drawFeaturePoints(ctx, type) {
  var features = []
  if (type === 'dashboard') {
    features = [
      { icon: '🧾', title: '快速开单', desc: '一键创建工单' },
      { icon: '🔍', title: '秒查记录', desc: '车牌秒搜历史' },
      { icon: '⏰', title: '到期提醒', desc: '保养保险不遗漏' }
    ]
  } else if (type === 'memberList') {
    features = [
      { icon: '💳', title: '会员卡核销', desc: '次卡权益一键核销' },
      { icon: '👥', title: 'VIP客户管理', desc: '客户信息一目了然' },
      { icon: '⚡', title: '操作便捷', desc: '简单上手效率高' }
    ]
  } else if (type === 'report') {
    features = [
      { icon: '📊', title: '生意看板', desc: '营收数据实时看' },
      { icon: '🏆', title: '消费排行榜', desc: 'TOP客户精准营销' },
      { icon: '📈', title: '多维度报表', desc: '日/月/年全面分析' }
    ]
  }

  var startY = 146
  features.forEach(function (f, i) {
    var y = startY + i * 64

    // 左侧竖条装饰
    ctx.fillStyle = '#e8e8e8'
    roundRectFill(ctx, 24, y, 4, 44, 2)

    // 图标
    ctx.font = '22px sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(f.icon, 42, y + 22)

    // 标题
    ctx.fillStyle = '#333333'
    ctx.font = 'bold 19px sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(f.title, 72, y + 8)

    // 描述
    ctx.fillStyle = '#888888'
    ctx.font = '15px sans-serif'
    ctx.fillText(f.desc, 72, y + 30)
  })
}

/**
 * 圆角矩形快捷填充
 */
function roundRectFill(ctx, x, y, w, h, r) {
  drawRoundRect(ctx, x, y, w, h, r)
  ctx.fill()
}

/**
 * 绘制底部 Slogan
 */
function drawSlogan(ctx) {
  var sloganY = CARD_H - 58

  // 分割线
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(50, sloganY - 12)
  ctx.lineTo(CARD_W - 50, sloganY - 12)
  ctx.stroke()

  // Slogan 文字
  ctx.fillStyle = '#bbbbbb'
  ctx.font = '16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('专为汽修店打造 · 轻便易用', CARD_W / 2, sloganY + 12)
  ctx.textAlign = 'left'
}

// ==================== Canvas 2D 主绘制 ====================

/**
 * 绘制卡片内容（Canvas 2D API）— 全新 v2 布局
 */
function drawCard(ctx, type, data, callback) {
  // 1. 浅灰背景
  ctx.fillStyle = '#f5f7fa'
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 2. 几何装饰（替代outline.png）
  drawDecorations(ctx)

  // 3. 数据卡片区域（白底+三张迷你统计卡）
  drawDataSection(ctx, type, data)

  // 4. 功能点列表
  drawFeaturePoints(ctx, type)

  // 5. 底部Slogan
  drawSlogan(ctx)

  callback()
}

// ==================== 旧版 API 降级方案 ====================

/**
 * 绘制卡片内容（旧版 Canvas API — 降级方案）
 */
function drawCardLegacy(ctx, type, data) {
  var colors = THEME.cardColors[type] || THEME.cardColors.dashboard

  // 1. 浅灰背景
  ctx.setFillStyle('#f5f7fa')
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // 2. 装饰圆形（简化版）
  ctx.setGlobalAlpha(0.04)
  ctx.setFillStyle('#1677ff')
  ctx.beginPath()
  ctx.arc(CARD_W - 60, 20, 140, 0, 2 * Math.PI)
  ctx.fill()
  ctx.setGlobalAlpha(0.03)
  ctx.setFillStyle('#52c41a')
  ctx.beginPath()
  ctx.arc(40, CARD_H - 30, 100, 0, 2 * Math.PI)
  ctx.fill()
  ctx.setGlobalAlpha(1.0)

  // 3. 外层白色大卡片
  ctx.setFillStyle('#ffffff')
  drawRoundRect(ctx, 20, 16, CARD_W - 40, 116, 12)
  ctx.fill()

  // 标题
  ctx.setFillStyle('#999999')
  ctx.setFontSize(12)
  ctx.fillText('今日数据', 34, 28)

  // 4. 三张迷你统计卡
  var cardW = (CARD_W - 64) / 3
  var gap = 10
  var items = [
    { label: '今日开单', value: '--单' },
    { label: '今日营收', value: '¥--' },
    { label: '车辆总数', value: '--辆' }
  ]

  items.forEach(function (item, i) {
    var cx = 32 + i * (cardW + gap)
    // 迷你卡背景
    ctx.setGlobalAlpha(0.06)
    ctx.setFillStyle(colors[i])
    drawRoundRect(ctx, cx, 48, cardW, 72, 8)
    ctx.fill()
    ctx.setGlobalAlpha(1.0)

    // 数值
    ctx.setFillStyle(colors[i])
    ctx.setFontSize(22)
    ctx.setTextAlign('center')
    ctx.fillText(item.value, cx + cardW / 2, 66)

    // 标签
    ctx.setFillStyle('#888888')
    ctx.setFontSize(11)
    ctx.fillText(item.label, cx + cardW / 2, 100)
  })
  ctx.setTextAlign('left')

  // 5. 功能点
  drawFeaturePointsLegacy(ctx, type)

  // 6. Slogan
  drawSloganLegacy(ctx)
}

/**
 * 功能点（旧版API）
 */
function drawFeaturePointsLegacy(ctx, type) {
  var features = []
  if (type === 'dashboard') {
    features = [
      { icon: '🧾', title: '快速开单', desc: '一键创建工单' },
      { icon: '🔍', title: '秒查记录', desc: '车牌秒搜历史' },
      { icon: '⏰', title: '到期提醒', desc: '保养保险不遗漏' }
    ]
  } else if (type === 'memberList') {
    features = [
      { icon: '💳', title: '会员卡核销', desc: '次卡权益一键核销' },
      { icon: '👥', title: 'VIP客户管理', desc: '客户信息一目了然' },
      { icon: '⚡', title: '操作便捷', desc: '简单上手效率高' }
    ]
  } else if (type === 'report') {
    features = [
      { icon: '📊', title: '生意看板', desc: '营收数据实时看' },
      { icon: '🏆', title: '消费排行榜', desc: 'TOP客户精准营销' },
      { icon: '📈', title: '多维度报表', desc: '日/月/年全面分析' }
    ]
  }

  var startY = 146
  features.forEach(function (f, i) {
    var y = startY + i * 64
    // 竖条
    ctx.setFillStyle('#e8e8e8')
    // 图标
    ctx.setFontSize(22)
    ctx.fillText(f.icon, 42, y + 26)
    // 标题
    ctx.setFillStyle('#333333')
    ctx.setFontSize(19)
    ctx.fillText(f.title, 72, y + 12)
    // 描述
    ctx.setFillStyle('#888888')
    ctx.setFontSize(15)
    ctx.fillText(f.desc, 72, y + 36)
  })
}

/**
 * Slogan（旧版API）
 */
function drawSloganLegacy(ctx) {
  var sloganY = CARD_H - 58
  ctx.setFillStyle('#bbbbbb')
  ctx.setFontSize(16)
  ctx.setTextAlign('center')
  ctx.fillText('专为汽修店打造 · 轻便易用', CARD_W / 2, sloganY + 16)
  ctx.setTextAlign('left')
}

// ==================== 公共接口 ====================

/**
 * 通用卡片生成方法
 * @param {string} type - 卡片类型：dashboard/memberList/report
 * @param {Page} page - 页面实例
 * @param {Object|null} data - 业务数据 { todayOrders, todayRevenue, totalCards }
 * @param {Function} callback - 回调 (err, tempFilePath)
 */
function generateCard(type, page, data, callback) {
  // 不再预加载图片资源（v2 改为纯代码绘制）
  setTimeout(function() {
    // 使用 Canvas 2D（新接口）
    var query = wx.createSelectorQuery().in(page)
    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          // 降级：使用旧版 Canvas API
          drawCardOldApi(type, page, data, callback)
          return
        }

        var canvas = res[0].node
        var ctx = canvas.getContext('2d')

        // 设置画布尺寸
        var dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = CARD_W * dpr
        canvas.height = CARD_H * dpr
        ctx.scale(dpr, dpr)

        drawCard(ctx, type, data, function () {
          // 导出图片
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: CARD_W * dpr,
            height: CARD_H * dpr,
            destWidth: CARD_W * 2,
            destHeight: CARD_H * 2,
            fileType: 'png',
            success: function (res) {
              callback(null, res.tempFilePath)
            },
            fail: function (err) {
              callback(err)
            }
          })
        })
      })
  }, 500) // 延迟500ms确保DOM渲染
}

/**
 * 使用旧版 Canvas API 绘制（降级方案）
 */
function drawCardOldApi(type, page, data, callback) {
  var ctx = wx.createCanvasContext('shareCanvas', page)
  drawCardLegacy(ctx, type, data)
  ctx.draw(false, function () {
    setTimeout(function () {
      wx.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        success: function (res) {
          callback(null, res.tempFilePath)
        },
        fail: function (err) {
          callback(err)
        }
      }, page)
    }, 300)
  })
}

// ==================== 对外暴露的便捷方法 ====================

function generateDashboardCard(page, callback) {
  // 从页面实例获取 stats 数据（如果已加载完成）
  var stats = null
  try {
    stats = page.data.stats || null
  } catch (e) {}
  generateCard('dashboard', page, stats, callback)
}

function generateMemberCard(page, callback) {
  generateCard('memberList', page, null, callback)
}

function generateReportCard(page, callback) {
  generateCard('report', page, null, callback)
}

module.exports = {
  generateDashboardCard: generateDashboardCard,
  generateMemberCard: generateMemberCard,
  generateReportCard: generateReportCard
}
