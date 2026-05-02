// components/radar-chart/radar-chart.js
// 五维度健康评分雷达图（Canvas 2D API）
// v5.0.0 Phase 3

Component({
  properties: {
    // 维度数据 { newCustomer: 45, maintenance: 80, valueAdded: 40, repeatCustomer: 85, avgTicket: 75 }
    dimensions: {
      type: Object,
      value: null,
      observer: '_onDataChange'
    },
    // 等级决定配色: excellent/good/warning/critical
    level: {
      type: String,
      value: 'good'
    },
    // canvas 宽度 (rpx，会转换为 px)
    width: {
      type: Number,
      value: 600
    },
    // canvas 高度 (rpx)
    height: {
      type: Number,
      value: 500
    }
  },

  data: {
    canvasId: 'radarCanvas_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    dpr: 1,
    ready: false
  },

  lifetimes: {
    attached() {
      this._initDpr()
    },
    ready() {
      this.setData({ ready: true })
      // 延迟绘制确保 DOM 就绪
      setTimeout(() => { this._draw() }, 100)
    }
  },

  observers: {
    'dimensions, level': function () {
      if (this.data.ready) {
        setTimeout(() => { this._draw() }, 50)
      }
    }
  },

  methods: {
    _initDpr() {
      try {
        var sysInfo = wx.getSystemInfoSync()
        this.setData({ dpr: sysInfo.pixelRatio || 1 })
      } catch (e) {
        this.setData({ dpr: 1 })
      }
    },

    _onDataChange(newVal) {
      if (newVal && this.data.ready) {
        this._draw()
      }
    },

    /**
     * 主绘制方法
     */
    _draw() {
      var dims = this.data.dimensions
      if (!dims || typeof dims !== 'object') return

      var component = this
      var query = component.createSelectorQuery()

      query.select('#' + this.data.canvasId).fields({ node: true, size: true }).exec(function (res) {
        if (!res || !res[0] || !res[0].node) return

        var canvas = res[0].node
        var ctx = canvas.getContext('2d')
        var dpr = component.data.dpr

        // 设置 canvas 尺寸（物理像素 = 显示像素 * dpr）
        var displayWidth = res[0].width || 300
        var displayHeight = res[0].height || 250
        canvas.width = displayWidth * dpr
        canvas.height = displayHeight * dpr
        ctx.scale(dpr, dpr)

        // 绘制参数
        var cx = displayWidth / 2
        var cy = displayHeight / 2 + 10
        var radius = Math.min(cx, cy) - 35   // 雷达图半径

        var labels = ['新客', '维保', '增值', '复购', '客单价']
        var keys = ['newCustomer', 'maintenance', 'valueAdded', 'repeatCustomer', 'avgTicket']
        var values = keys.map(function (k) { return Math.max(0, Math.min(20, dims[k] || 0)) })

        // 配色方案
        var colorMap = {
          excellent: { main: '#52c41a', light: 'rgba(82,196,26,0.15)', fill: 'rgba(82,196,26,0.25)' },
          good:       { main: '#1677ff', light: 'rgba(22,119,255,0.12)', fill: 'rgba(22,119,255,0.20)' },
          warning:    { main: '#faad14', light: 'rgba(250,173,20,0.12)', fill: 'rgba(250,173,20,0.20)' },
          critical:   { main: '#ff4d4f', light: 'rgba(255,77,79,0.12)', fill: 'rgba(255,77,79,0.20)' }
        }
        var colors = colorMap[component.data.level] || colorMap.good

        // 清空画布
        ctx.clearRect(0, 0, displayWidth, displayHeight)

        // 1. 绘制背景网格（5圈五边形）
        _drawGrid(ctx, cx, cy, radius, 5, colors.light)

        // 2. 绘制轴线 + 标签
        _drawAxes(ctx, cx, cy, radius, labels)

        // 3. 绘制数据多边形
        _drawDataPolygon(ctx, cx, cy, radius, values, 20, colors)

        // 4. 绘制数据点 + 分数标签
        _drawDataPoints(ctx, cx, cy, radius, values, 20, colors.main)
      })
    }
  }
})

// ============================
// 内部绘制函数
// ============================

/**
 * 获取五边形顶点坐标
 * @param {number} cx 中心x
 * @param {number} cy 中心y
 * @param {number} radius 半径
 * @param {number} index 顶点索引 0-4
 * @param {number} total 总顶点数
 */
function _getPoint(cx, cy, radius, index, total) {
  var angle = -Math.PI / 2 + (Math.PI * 2 * index / total)
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  }
}

/** 绘制背景网格（多层五边形） */
function _drawGrid(ctx, cx, cy, radius, layers, color) {
  for (var layer = 1; layer <= layers; layer++) {
    var r = radius * (layer / layers)
    ctx.beginPath()
    for (var i = 0; i < 5; i++) {
      var pt = _getPoint(cx, cy, r, i, 5)
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
    ctx.closePath()
    ctx.strokeStyle = color
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  // 从中心到各顶点的辐射线
  for (var j = 0; j < 5; j++) {
    var endPt = _getPoint(cx, cy, radius, j, 5)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(endPt.x, endPt.y)
    ctx.strokeStyle = color
    ctx.lineWidth = 0.6
    ctx.stroke()
  }
}

/** 绘制轴线和文字标签 */
function _drawAxes(ctx, cx, cy, radius, labels) {
  for (var i = 0; i < 5; i++) {
    var labelPt = _getPoint(cx, cy, radius + 18, i, 5)
    ctx.fillStyle = '#666'
    ctx.font = '11px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(labels[i] || '', labelPt.x, labelPt.y)
  }
}

/** 绘制数据多边形区域 */
function _drawDataPolygon(ctx, cx, cy, radius, values, maxScore, colors) {
  ctx.beginPath()
  for (var i = 0; i < values.length; i++) {
    var ratio = maxScore > 0 ? (values[i] / maxScore) : 0
    var r = radius * ratio
    var pt = _getPoint(cx, cy, r, i, 5)
    if (i === 0) ctx.moveTo(pt.x, pt.y)
    else ctx.lineTo(pt.x, pt.y)
  }
  ctx.closePath()
  ctx.fillStyle = colors.fill
  ctx.fill()
  ctx.strokeStyle = colors.main
  ctx.lineWidth = 1.8
  ctx.stroke()
}

/** 绘制数据点和分数值 */
function _drawDataPoints(ctx, cx, cy, radius, values, maxScore, colorStr) {
  for (var i = 0; i < values.length; i++) {
    var ratio = maxScore > 0 ? (values[i] / maxScore) : 0
    var r = radius * ratio
    var pt = _getPoint(cx, cy, r, i, 5)

    // 数据点圆
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = colorStr
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 分数值标签（在数据点外侧一点）
    var labelR = r + 14
    if (labelR > radius - 10) labelR = radius - 10
    var labelPt = _getPoint(cx, cy, labelR, i, 5)
    ctx.fillStyle = colorStr
    ctx.font = 'bold 9px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(values[i]), labelPt.x, labelPt.y)
  }
}
