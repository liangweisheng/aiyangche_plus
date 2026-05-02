// pages/orderDetail/orderDetail.js
// 工单详情

const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    order: null,
    loading: true,
    plate: '',
    payMethodText: '',
    createTimeStr: '',
    itemRows: []
  },

  onLoad(options) {
    if (options.id) {
      this._orderId = options.id
      this.fetchOrderDetail(options.id)
    }
  },

  onShow() {
    if (this._orderId) {
      this.fetchOrderDetail(this._orderId)
    }
  },

  fetchOrderDetail(id) {
    var page = this
    var db = app.db()

    db.collection('repair_orders').doc(id).get({
      success: function (res) {
        var order = res.data
        var payMap = { '1': '现付', '2': '挂账' }

        // 解析服务项目表格数据
        var items = (order.serviceItems || '').split(/[,，]/).filter(function (s) { return s.trim() })
        var amounts = (order.serviceAmounts || '').split(',').map(function (a) { return Number(a) || 0 })
        var itemRows = items.map(function (item, idx) {
          var text = item.trim()
          var parts = text.split(/\s+/)
          return {
            index: idx + 1,
            name: parts[0] || '',
            spec: parts.slice(1).join(' ') || '',
            amount: amounts[idx] || 0
          }
        })

        page.setData({
          order: order,
          plate: order.plate || '',
          payMethodText: payMap[order.payMethod] || '未知',
          createTimeStr: order.createTime ? util.formatDateTime(order.createTime) : '',
          itemRows: itemRows,
          loading: false
        })

        // 查询该车牌是否为会员车辆
        if (order.plate) {
          db.collection('repair_members').where({ plate: order.plate }).count({
            success: function (res) {
              page.setData({ isMemberVehicle: res.total > 0 })
            }
          })
        }
      },
      fail: function () {
        page.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  onReorder() {
    var plate = this.data.plate
    if (plate) {
      wx.redirectTo({ url: '/pages/orderAdd/orderAdd?plate=' + plate })
    } else {
      wx.redirectTo({ url: '/pages/orderAdd/orderAdd' })
    }
  },

  onEdit() {
    var order = this.data.order
    if (!order || !order._id) return
    wx.navigateTo({ url: '/pages/orderAdd/orderAdd?id=' + order._id })
  },

  onCallPhone() {
    var shopPhone = this.data.order && this.data.order.shopPhone
    if (!shopPhone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['拨打 ' + shopPhone, '复制号码'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.makePhoneCall({ phoneNumber: shopPhone })
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({ data: shopPhone })
        }
      }
    })
  },

  onShareOrder() {
    var page = this
    var order = page.data.order
    if (!order) return
    wx.showLoading({ title: '生成图片中...' })

    // 获取门店信息
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var shopName = shopInfo.name || wx.getStorageSync('shopName') || 'AI养车'
    var shopTel = wx.getStorageSync('shopTel') || ''
    var shopAddr = wx.getStorageSync('shopAddr') || ''

    var ctx = wx.createCanvasContext('shareCanvas', page)
    var W = 600
    var pad = 40

    // ====== 动态计算高度 ======
    var items = (order.serviceItems || '').split(/[,，]/).filter(function (s) { return s.trim() })
    var amounts = (order.serviceAmounts || '').split(',').map(function (a) { return Number(a) || 0 })
    var tableRowH = 32
    var tableH = 50 + items.length * tableRowH + 16
    if (tableH < 100) tableH = 100
    var remarkH = (order.remark && order.remark.trim()) ? 70 : 0
    var sumH = 80
    var H = 170 + tableH + sumH + remarkH + 100

    // ====== 背景 ======
    ctx.setFillStyle('#f0f5ff')
    ctx.fillRect(0, 0, W, H)

    // ====== 顶部蓝色区域（170px，包含标题+车牌+时间） ======
    page._drawRoundRect(ctx, 0, 0, W, 170, 0)
    var grad = ctx.createLinearGradient(0, 0, W, 0)
    grad.addColorStop(0, '#1677ff')
    grad.addColorStop(1, '#4096ff')
    ctx.setFillStyle(grad)
    ctx.fill()

    // 第一行：门店名称 + 服务工单（居中，加大字号）
    ctx.setFillStyle('#ffffff')
    ctx.setFontSize(22)
    ctx.setTextAlign('center')
    var headerText = shopName + '  服务工单'
    ctx.fillText(headerText, W / 2, pad + 20)
    ctx.setTextAlign('left')

    // 第二行：车牌号（加大）+ 右侧支付方式（小字）
    ctx.setFontSize(28)
    ctx.setFillStyle('#ffffff')
    ctx.fillText(order.plate || '未知车牌', pad, pad + 58)
    var payText = page.data.payMethodText
    ctx.setFontSize(14)
    ctx.setFillStyle('rgba(255,255,255,0.85)')
    ctx.fillText(payText, W - pad - ctx.measureText(payText).width, pad + 58)

    // 第三行：开单时间
    ctx.setFontSize(13)
    ctx.setFillStyle('rgba(255,255,255,0.65)')
    ctx.fillText('开单时间：' + page.data.createTimeStr, pad, pad + 92)

    // ====== 白色服务项目卡片 ======
    var cardX = pad
    var cardY = 186
    var cardW = W - pad * 2
    var cardH = tableH
    page._drawRoundRect(ctx, cardX, cardY, cardW, cardH, 16)
    ctx.setFillStyle('#ffffff')
    ctx.fill()

    // 表头
    var y = cardY + 30
    var col1 = cardX + 16      // 序号
    var col2 = cardX + 56      // 项目
    var col3 = cardX + 280     // 规格
    var colAmtL = cardX + cardW - 90  // 金额左对齐位置
    var colAmtR = cardX + cardW - 24  // 金额右边界

    ctx.setFillStyle('#999999')
    ctx.setFontSize(12)
    ctx.fillText('序号', col1, y)
    ctx.fillText('项目', col2, y)
    ctx.fillText('规格', col3, y)
    // 金额表头右对齐
    ctx.fillText('金额', colAmtR - ctx.measureText('金额').width, y)

    // 分割线
    y += 10
    ctx.setStrokeStyle('#f0f0f0')
    ctx.setLineWidth(1)
    ctx.beginPath()
    ctx.moveTo(cardX + 16, y)
    ctx.lineTo(cardX + cardW - 16, y)
    ctx.stroke()
    y += 16

    // 服务项目行
    ctx.setFontSize(13)
    items.forEach(function (item, idx) {
      if (idx >= 10) return
      var text = item.trim()
      var parts = text.split(/\s+/)
      var name = parts[0] || ''
      var spec = parts.slice(1).join(' ') || ''
      var amt = amounts[idx] || 0

      // 偶数行交替背景
      if (idx % 2 === 1) {
        ctx.setFillStyle('#f8faff')
        page._drawRoundRect(ctx, cardX + 12, y - 18, cardW - 24, tableRowH, 6)
        ctx.fill()
      }

      ctx.setFillStyle('#999999')
      ctx.fillText(String(idx + 1), col1, y)
      ctx.setFillStyle('#333333')
      var nameShow = name.length > 8 ? name.substring(0, 8) + '…' : name
      ctx.fillText(nameShow, col2, y)
      ctx.setFillStyle('#666666')
      ctx.fillText(spec.length > 5 ? spec.substring(0, 5) + '…' : spec, col3, y)
      // 金额右对齐
      if (amt > 0) {
        ctx.setFillStyle('#1677ff')
        var amtStr = '\u00a5' + amt
        ctx.fillText(amtStr, colAmtR - ctx.measureText(amtStr).width, y)
      }
      y += tableRowH
    })

    // ====== 金额汇总（两行布局：总金额 + 实收金额） ======
    var sumY = cardY + cardH + 16
    page._drawRoundRect(ctx, cardX, sumY, cardW, sumH, 12)
    ctx.setFillStyle('#f8faff')
    ctx.fill()

    var leftX = cardX + 24
    var rightX = cardX + cardW - 24
    var rowY = sumY + 36
    var lineH = 36

    // 第一行：总金额
    ctx.setFillStyle('#999999')
    ctx.setFontSize(13)
    ctx.fillText('总金额', leftX, rowY)
    ctx.setFillStyle('#1677ff')
    ctx.setFontSize(18)
    var totalStr = '\u00a5' + (order.totalAmount || 0)
    ctx.fillText(totalStr, rightX - ctx.measureText(totalStr).width, rowY)

    // 第二行：实收金额
    if (order.paidAmount > 0) {
      ctx.setFillStyle('#999999')
      ctx.setFontSize(13)
      ctx.fillText('实收金额', leftX, rowY + lineH)
      ctx.setFillStyle('#52c41a')
      ctx.setFontSize(18)
      var paidStr = '\u00a5' + order.paidAmount
      ctx.fillText(paidStr, rightX - ctx.measureText(paidStr).width, rowY + lineH)
    }

    // ====== 备注 ======
    var remarkY = sumY + sumH + 12
    if (order.remark && order.remark.trim()) {
      page._drawRoundRect(ctx, cardX, remarkY, cardW, 56, 10)
      ctx.setFillStyle('#fffbe6')
      ctx.fill()
      ctx.setFillStyle('#ad6800')
      ctx.setFontSize(11)
      var remarkShow = order.remark.trim()
      if (remarkShow.length > 50) remarkShow = remarkShow.substring(0, 50) + '...'
      ctx.fillText('备注：' + remarkShow, cardX + 20, remarkY + 32)
      remarkY += 56 + 12
    }

    // ====== 底部门店信息 ======
    var bottomY = H - 36
    ctx.setFillStyle('#bbbbbb')
    ctx.setFontSize(11)
    ctx.setTextAlign('center')
    var bottomLines = []
    if (shopName) bottomLines.push(shopName)
    if (shopAddr) bottomLines.push(shopAddr)
    if (shopTel) bottomLines.push('电话：' + shopTel)
    var bottomText = bottomLines.join('  |  ')
    ctx.fillText(bottomText, W / 2, bottomY)
    ctx.setTextAlign('left')

    // ====== 导出图片 ======
    ctx.draw(false, function () {
      setTimeout(function () {
        wx.canvasToTempFilePath({
          canvasId: 'shareCanvas',
          x: 0,
          y: 0,
          width: W,
          height: H,
          destWidth: W * 2,
          destHeight: H * 2,
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

  _drawRoundRect(ctx, x, y, w, h, r) {
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
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  onVoidOrder() {
    if (getApp().isStaff()) {
      wx.showToast({ title: '店员无权作废工单', icon: 'none' })
      return
    }
    var page = this
    wx.showModal({
      title: '确认作废',
      content: '作废后该工单将不参与任何数据统计，此操作不可撤销。确认作废？',
      confirmColor: '#ff4d4f',
      confirmText: '确认作废',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        util.callRepair('voidOrder', { orderId: page.data.order._id }).then(function (result) {
          wx.hideLoading()
          if (result && result.code === 0) {
            page.setData({ 'order.isVoided': true })
            wx.showToast({ title: '已作废', icon: 'success' })
          } else {
            wx.showToast({ title: result.msg || '操作失败', icon: 'none' })
          }
        }).catch(function () {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        })
      }
    })
  }
})
