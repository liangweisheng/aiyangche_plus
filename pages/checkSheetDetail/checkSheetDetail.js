// pages/checkSheetDetail/checkSheetDetail.js
// 电子查车单详情页（只读展示 + 分享生成图片）

const app = getApp()

Page({
  data: {
    detail: null,
    checkItems: [
      { key: 'exterior', label: '外观检查', icon: '🚗' },
      { key: 'tire', label: '轮胎检查', icon: '🛞' },
      { key: 'oil', label: '机油检查', icon: '💧' },
      { key: 'battery', label: '电瓶检查', icon: '🔋' },
      { key: 'brake', label: '刹车检查', icon: '🛑' },
      { key: 'light', label: '灯光检查', icon: '💡' }
    ]
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
      return
    }
    this.fetchDetail(options.id)
  },

  fetchDetail(id) {
    var page = this
    var db = app.db()
    wx.showLoading({ title: '加载中...' })

    db.collection('repair_checkSheets').doc(id).get({
      success: function (res) {
        wx.hideLoading()
        var d = res.data
        if (d.createTime) {
          var dt = new Date(d.createTime)
          var pad = function (n) { return n < 10 ? '0' + n : '' + n }
          d.createTimeStr = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes())
        } else {
          d.createTimeStr = ''
        }
        page.setData({ detail: d })
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  // 生成分享图片
  onShareSheet() {
    var page = this
    var detail = page.data.detail
    if (!detail) {
      wx.showToast({ title: '数据未加载', icon: 'none' })
      return
    }

    wx.showLoading({ title: '生成图片中...' })

    var ctx = wx.createCanvasContext('shareCanvas', page)
    var W = 600
    var H = 900
    var checkItems = page.data.checkItems

    // 背景
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, W, H)

    // 顶部品牌条
    ctx.setFillStyle('#1677ff')
    ctx.fillRect(0, 0, W, 70)

    ctx.setFillStyle('#ffffff')
    ctx.setFontSize(28)
    ctx.setTextAlign('center')
    ctx.fillText('AI养车 · 电子查车单', W / 2, 45)

    // 车辆信息区
    var y = 100
    ctx.setTextAlign('left')
    ctx.setFontSize(36)
    ctx.setFillStyle('#333333')
    ctx.fillText((detail.plate || '未知车牌'), 30, y + 30)

    y += 55
    ctx.setFontSize(18)
    ctx.setFillStyle('#666666')
    var carInfoLine = (detail.carType || '未知车型')
    if (detail.carColor) carInfoLine += ' | ' + detail.carColor
    ctx.fillText(carInfoLine, 30, y)

    y += 25
    var ownerLine = (detail.ownerName || '') + (detail.phone ? '  ' + detail.phone : '')
    if (ownerLine.trim()) {
      ctx.fillText(ownerLine, 30, y)
    }

    // 分割线
    y += 20
    ctx.setStrokeStyle('#eeeeee')
    ctx.setLineWidth(1)
    ctx.moveTo(30, y)
    ctx.lineTo(W - 30, y)
    ctx.stroke()

    // ===== 检查结果区（2列3行网格卡片布局）=====
    y += 15
    ctx.setFontSize(20)
    ctx.setFillStyle('#1677ff')
    ctx.fillText('检查结果', 30, y + 18)

    y += 35
    var cardW = 270       // 单个卡片宽度（含间距）
    var cardH = 68        // 单个卡片高度
    var cardGapX = 15     // 卡片水平间距
    var cardStartX = 30   // 第1列起始x
    var rowGap = 12       // 行间距

    checkItems.forEach(function (item, idx) {
      var ci = detail.checkItems && detail.checkItems[item.key]
      var value = ci ? (ci.value || '未检查') : '未检查'
      var isNormal = ci && ci.normal

      // 每2个换行
      if (idx > 0 && idx % 2 === 0) {
        y += cardH + rowGap
      }

      var col = idx % 2
      var cx = cardStartX + col * (cardW + cardGapX)
      var cy = y

      // ── 卡片背景（圆角矩形）──
      ctx.save()
      page._roundRect(ctx, cx, cy, cardW, cardH, 8, isNormal ? '#f6ffed' : '#fff7e6')
      ctx.restore()

      // 图标
      ctx.setFontSize(24)
      ctx.setTextAlign('left')
      ctx.fillText(item.icon, cx + 12, cy + 26)

      // 标签名
      ctx.setFontSize(15)
      ctx.setFillStyle('#333333')
      ctx.fillText(item.label, cx + 44, cy + 27)

      // 状态值（卡片下半部分）
      ctx.setFontSize(13)
      if (isNormal) {
        ctx.setFillStyle('#52c41a')
        ctx.fillText('✓ ' + value, cx + 12, cy + 52)
      } else {
        ctx.setFillStyle('#fa8c16')
        ctx.fillText('● ' + value, cx + 12, cy + 52)
      }
    })

    // 最后一行结束后更新y（3行 × 高度 + 2个行间距）
    y += cardH + 16

    // 分割线
    ctx.setStrokeStyle('#eeeeee')
    ctx.moveTo(30, y)
    ctx.lineTo(W - 30, y)
    ctx.stroke()

    // 问题
    y += 15
    ctx.setFontSize(20)
    ctx.setFillStyle('#1677ff')
    ctx.fillText('问题描述', 30, y + 18)

    y += 30
    ctx.setFontSize(16)
    ctx.setFillStyle('#333333')
    var issueText = detail.issue || '无'
    y = page._wrapText(ctx, issueText, W - 60, 30, y)

    y += 15

    // 建议
    ctx.setFontSize(20)
    ctx.setFillStyle('#1677ff')
    ctx.fillText('维修建议', 30, y + 18)

    y += 30
    ctx.setFontSize(16)
    ctx.setFillStyle('#333333')
    var sugText = detail.suggestion || '无'
    y = page._wrapText(ctx, sugText, W - 60, 30, y)

    // 底部
    var footerY = H - 50
    ctx.setStrokeStyle('#eeeeee')
    ctx.moveTo(30, footerY - 10)
    ctx.lineTo(W - 30, footerY - 10)
    ctx.stroke()

    ctx.setFontSize(14)
    ctx.setFillStyle('#999999')
    ctx.setTextAlign('left')
    if (detail.createTimeStr) {
      ctx.fillText(detail.createTimeStr, 30, footerY + 10)
    }
    ctx.setTextAlign('right')
    ctx.fillText('AI养车门店管理系统', W - 30, footerY + 10)

    ctx.draw(false, function () {
      setTimeout(function () {
        wx.canvasToTempFilePath({
          canvasId: 'shareCanvas',
          success: function (res) {
            wx.hideLoading()
            wx.previewImage({
              current: res.tempFilePath,
              urls: [res.tempFilePath]
            })
          },
          fail: function () {
            wx.hideLoading()
            wx.showToast({ title: '生成失败', icon: 'none' })
          }
        }, page)
      }, 300)
    })
  },

  // 圆角矩形辅助（用于检查项卡片背景）
  _roundRect(ctx, x, y, w, h, r, fillColor) {
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
    ctx.setFillStyle(fillColor || '#f5f5f5')
    ctx.fill()
  },

  // 文本自动换行辅助
  _wrapText(ctx, text, maxWidth, x, y) {
    if (!text) return y
    var line = ''
    for (var i = 0; i < text.length; i++) {
      var testLine = line + text[i]
      var metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && line.length > 0) {
        y += 24
        ctx.fillText(line, x, y)
        line = text[i]
      } else {
        line = testLine
      }
    }
    if (line) {
      y += 24
      ctx.fillText(line, x, y)
    }
    return y
  }
})
