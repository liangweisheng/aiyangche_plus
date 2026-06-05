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
      this._firstLoad = true
      this.fetchOrderDetail(options.id)
    }
  },

  onUnload() {
    this._firstLoad = true
  },

  onShow() {
    // 首次加载跳过（onLoad已拉取），仅从编辑页返回时刷新
    if (this._firstLoad) {
      this._firstLoad = false
      return
    }
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
        // 校验工单是否属于当前门店
        var shopPhone = app.getShopPhone()
        if (order.shopPhone && order.shopPhone !== shopPhone) {
          wx.showToast({ title: '无权查看此工单', icon: 'none' })
          setTimeout(function () { wx.navigateBack() }, 1500)
          return
        }
        var payMap = { '1': '现付', '2': '挂账' }

        // 解析服务项目表格数据：优先读 _serviceItemsArr（新格式），旧格式兜底
        var itemsArr = order._serviceItemsArr
        var isBenefitOrder = order.remark && order.remark.indexOf('权益核销') === 0
        var itemRows
        if (itemsArr && itemsArr.length > 0) {
          itemRows = itemsArr.map(function (item, idx) {
            var name = item.name || ''
            if (idx === 0 && isBenefitOrder && name) {
              name = '[核销]' + name
            }
            return {
              index: idx + 1,
              name: name,
              spec: item.spec || '',
              amount: item.amount || 0,
              qty: item.qty || 1
            }
          })
        } else {
          // 旧格式兜底
          var items = (order.serviceItems || '').split(/[,，]/).filter(function (s) { return s.trim() })
          var amounts = (order.serviceAmounts || '').split(',').map(function (a) { return Number(a) || 0 })
          var quantities = (order.serviceQuantities || '').split(',').map(function (q) { return Number(q) || 1 })
          itemRows = items.map(function (item, idx) {
            var text = item.trim()
            var parts = text.split(/\s+/)
            var name = parts[0] || ''
            if (idx === 0 && isBenefitOrder && name) {
              name = '[核销]' + name
            }
            return {
              index: idx + 1,
              name: name,
              spec: parts.slice(1).join(' ') || '',
              amount: amounts[idx] || 0,
              qty: quantities[idx] || 1
            }
          })
        }

        page.setData({
          order: order,
          plate: order.plate || '',
          payMethodText: payMap[order.payMethod] || '未知',
          createTimeStr: order.createTime ? util.formatDateTime(order.createTime) : '',
          itemRows: itemRows,
          loading: false,
          shopPhoneMasked: order.shopPhone ? util.maskPhone(order.shopPhone) : '',
          operatorPhoneMasked: order.operatorPhone ? util.formatOperatorName(order.operatorName, order.operatorPhone) : ''
        })

        // 查询该车牌是否为会员车辆（按门店隔离）
        if (order.plate) {
          var memberCountWhere = app.shopWhere({ plate: order.plate })
          db.collection('repair_members').where(memberCountWhere).count({
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
    if (order.status !== '施工中') {
      wx.showToast({ title: '仅暂存工单可编辑', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/orderAdd/orderAdd?id=' + order._id })
  },

  // 收银：待结算 → 已完成（挂账→现付）
  onSettleOrder() {
    var page = this
    var order = page.data.order
    if (!order || order.status !== '待结算') return

    wx.showModal({
      title: '收银确认',
      content: '确认将该挂账工单标记为已收款？',
      confirmText: '确认收款',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...' })
        util.callRepair('editOrder', {
          orderId: order._id,
          updateData: {
            payMethod: '1',
            status: '已完成'
          }
        }).then(function (result) {
          wx.hideLoading()
          if (result && result.code === 0) {
            page.fetchOrderDetail(order._id)
            wx.showToast({ title: '已收款', icon: 'success' })
          } else {
            wx.showToast({ title: result.msg || '操作失败', icon: 'none' })
          }
        }).catch(function () {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        })
      }
    })
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
    this._drawShareCanvas('share')
  },

  onGenerateQuote() {
    this._drawShareCanvas('quote')
  },

  _drawShareCanvas(mode) {
    var page = this
    var order = page.data.order
    if (!order) return
    wx.showLoading({ title: '生成图片中...' })

    // 获取门店信息
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var shopName = shopInfo.name || wx.getStorageSync('shopName') || 'AI养车'
    var shopTel = wx.getStorageSync('shopTel') || (shopInfo.cloudRecord && shopInfo.cloudRecord.shopTel) || ''
    var shopAddr = wx.getStorageSync('shopAddr') || (shopInfo.cloudRecord && shopInfo.cloudRecord.shopAddr) || ''

    var ctx = wx.createCanvasContext('shareCanvas', page)
    var W = 600
    var H = 850   // A4比例 1:√2 ≈ 1:1.414

    // ====== 解析服务项目 ======
    var itemsArrS = order._serviceItemsArr
    var items, amounts, quantities
    if (itemsArrS && itemsArrS.length > 0) {
      items = itemsArrS.map(function (si) { return si.name + (si.spec ? ' ' + si.spec : '') })
      amounts = itemsArrS.map(function (si) { return si.amount || 0 })
      quantities = itemsArrS.map(function (si) { return si.qty || 1 })
    } else {
      items = (order.serviceItems || '').split(/[,，]/).filter(function (s) { return s.trim() })
      amounts = (order.serviceAmounts || '').split(',').map(function (a) { return Number(a) || 0 })
      quantities = (order.serviceQuantities || '').split(',').map(function (q) { return Number(q) || 1 })
    }
    var isBenefitOrder = order.remark && order.remark.indexOf('权益核销') === 0

    // ====== 1. 纯白背景 ======
    ctx.setFillStyle('#fcfcfc')
    ctx.fillRect(0, 0, W, H)

    // ====== 2. 斜排水印 ======
    ctx.save()
    ctx.setGlobalAlpha(0.03)
    ctx.setFillStyle('#1677ff')
    ctx.setFontSize(64)
    ctx.setTextAlign('center')
    ctx.translate(W / 2, H * 0.4)
    ctx.rotate(-22 * Math.PI / 180)
    ctx.fillText('AI养车', 0, 0)
    ctx.restore()
    ctx.setTextAlign('left')

    // ====== 3. 蓝色单据外框 ======
    ctx.setStrokeStyle('#1677ff')
    ctx.setLineWidth(2)
    ctx.strokeRect(16, 16, W - 32, H - 32)

    // ====== 4. 顶部蓝色标题条 ======
    var barX = 22, barY = 22, barW = W - 44, barH = 54
    page._drawRoundRect(ctx, barX, barY, barW, barH, 6)
    ctx.setFillStyle('#1677ff')
    ctx.fill()

    ctx.setFillStyle('#ffffff')
    ctx.setFontSize(21)
    ctx.setTextAlign('center')
    ctx.fillText((shopName || 'AI养车') + ' · ' + (mode === 'quote' ? '报价单' : '服务工单'), W / 2, barY + 34)

    ctx.setFontSize(11)
    ctx.setFillStyle('rgba(255,255,255,0.7)')
    ctx.fillText(mode === 'quote' ? '报价联' : '客户联', W - 60, barY + barH - 12)
    ctx.setTextAlign('left')

    // ====== 5. 车辆信息区 ======
    var y = barY + barH + 64   // 140

    // 车牌号（大号）
    ctx.setFillStyle('#1a1a1a')
    ctx.setFontSize(32)
    ctx.fillText(order.plate || '未知车牌', 40, y + 24)

    // 状态标签 + 支付方式（仅服务工单模式显示）
    if (mode !== 'quote') {
      ctx.setFontSize(13)
      var statusColors = { '已完成': '#52c41a', '待结算': '#fa8c16' }
      var statusColor = statusColors[order.status] || '#1677ff'
      ctx.setFillStyle(statusColor)
      ctx.setTextAlign('right')
      ctx.fillText(order.status || '施工中', barX + barW - 16, y + 20)

      ctx.setFontSize(11)
      ctx.setFillStyle('#999999')
      ctx.fillText(page.data.payMethodText || '未知', barX + barW - 16, y + 38)
      ctx.setTextAlign('left')
    }

    // 开单时间
    ctx.setFontSize(12)
    ctx.setFillStyle('#999999')
    ctx.fillText('开单时间：' + (page.data.createTimeStr || ''), 40, y + 52)

    // 分割线
    y = y + 62   // 146
    ctx.setStrokeStyle('#e0e0e0')
    ctx.setLineWidth(0.8)
    ctx.beginPath()
    ctx.moveTo(40, y)
    ctx.lineTo(barX + barW - 16, y)
    ctx.stroke()

    // ====== 6. 服务项目表格 ======
    var tableX = 40
    var tableW = barX + barW - 16 - tableX   // 522
    var tableY = y + 16   // 162

    // 表格列坐标（序号80 | 项目名208 | 规格100 | 数量60 | 金额74）
    var colX = [tableX, 120, 328, 428, 488, tableX + tableW]

    var hdrH = 32
    var rowH = 32
    var maxRows = 10
    var actualRows = Math.min(items.length, maxRows)

    // 表头背景
    ctx.setFillStyle('#e6f0ff')
    ctx.fillRect(colX[0], tableY, tableW, hdrH)

    // 表头文字
    ctx.setFillStyle('#1677ff')
    ctx.setFontSize(12)
    ctx.setTextAlign('center')
    ctx.fillText('序号', 80, tableY + 20)
    ctx.fillText('服务项目', 224, tableY + 20)
    ctx.fillText('规格', 378, tableY + 20)
    ctx.fillText('数量', 458, tableY + 20)
    ctx.fillText('金额(元)', 525, tableY + 20)
    ctx.setTextAlign('left')

    // 数据行
    var dataY = tableY + hdrH
    for (var i = 0; i < actualRows; i++) {
      var text = (items[i] || '').trim()
      var parts = text.split(/\s+/)
      var name = parts[0] || ''
      if (i === 0 && isBenefitOrder && name) name = '[核销]' + name
      var spec = parts.slice(1).join(' ') || ''
      var amt = amounts[i] || 0
      var qty = quantities[i] || 1

      var rowMid = dataY + i * rowH + 20

      // 交替行背景
      if (i % 2 === 1) {
        ctx.setFillStyle('#f8faff')
        ctx.fillRect(colX[0] + 1, dataY + i * rowH, tableW - 2, rowH)
      }

      // 序号
      ctx.setFillStyle('#aaaaaa')
      ctx.setFontSize(11)
      ctx.setTextAlign('center')
      ctx.fillText(String(i + 1), 80, rowMid)

      // 项目名
      ctx.setFillStyle('#333333')
      ctx.setFontSize(12)
      ctx.setTextAlign('left')
      var nameShow = name.length > 16 ? name.substring(0, 15) + '…' : name
      ctx.fillText(nameShow, colX[1] + 6, rowMid)

      // 规格
      ctx.setFillStyle('#888888')
      ctx.setFontSize(11)
      var specShow = spec.length > 8 ? spec.substring(0, 7) + '…' : spec
      ctx.fillText(specShow, colX[2] + 6, rowMid)

      // 数量
      ctx.setFillStyle('#555555')
      ctx.setTextAlign('center')
      ctx.fillText(String(qty), 458, rowMid)

      // 金额
      if (amt > 0) {
        ctx.setFillStyle('#1677ff')
        ctx.setFontSize(12)
        ctx.setTextAlign('right')
        ctx.fillText('¥' + amt, colX[5] - 6, rowMid)
      }
    }
    ctx.setTextAlign('left')

    var dataEndY = dataY + actualRows * rowH

    // 画表格网格线
    ctx.setStrokeStyle('#e4e4e4')
    ctx.setLineWidth(0.5)
    // 垂直线
    for (var c = 0; c < colX.length; c++) {
      ctx.beginPath()
      ctx.moveTo(colX[c], tableY)
      ctx.lineTo(colX[c], dataEndY)
      ctx.stroke()
    }
    // 水平线（数据行间）
    for (var r = 0; r <= actualRows; r++) {
      ctx.beginPath()
      ctx.moveTo(colX[0], dataY + r * rowH)
      ctx.lineTo(colX[5], dataY + r * rowH)
      ctx.stroke()
    }
    // 表头底线加粗
    ctx.setStrokeStyle('#c8d8f0')
    ctx.setLineWidth(1)
    ctx.beginPath()
    ctx.moveTo(colX[0], tableY + hdrH)
    ctx.lineTo(colX[5], tableY + hdrH)
    ctx.stroke()
    // 表格外框
    ctx.setStrokeStyle('#b0b0b0')
    ctx.setLineWidth(1)
    ctx.strokeRect(colX[0], tableY, tableW, dataEndY - tableY)

    var tableBottom = dataEndY + 6

    // ====== 7. 金额汇总 ======
    ctx.setStrokeStyle('#d8d8d8')
    ctx.setLineWidth(0.6)
    ctx.beginPath()
    ctx.moveTo(colX[0], tableBottom)
    ctx.lineTo(colX[5], tableBottom)
    ctx.stroke()

    var sumY = tableBottom + 10

    // ====== 7. 金额汇总（单行：合计 + 实收 + 优惠金额） ======
    var hasPaid = order.paidAmount !== undefined && order.paidAmount > 0
    var discountAmount = 0
    if (hasPaid && order.paidAmount !== order.totalAmount) {
      discountAmount = order.totalAmount - order.paidAmount
    }

    if (hasPaid && discountAmount > 0) {
      ctx.setFillStyle('#333333')
      ctx.setFontSize(15)
      ctx.fillText('合计：¥' + (order.totalAmount || 0), colX[0] + 8, sumY + 16)
      ctx.setFillStyle('#555555')
      ctx.setFontSize(13)
      ctx.setTextAlign('right')
      ctx.fillText('实收：¥' + order.paidAmount + '（优惠金额：¥' + discountAmount + '）', colX[5] - 4, sumY + 16)
      ctx.setTextAlign('left')
    } else if (hasPaid) {
      ctx.setFillStyle('#333333')
      ctx.setFontSize(15)
      ctx.fillText('合计：¥' + (order.totalAmount || 0), colX[0] + 8, sumY + 16)
      ctx.setFillStyle('#52c41a')
      ctx.setFontSize(14)
      ctx.setTextAlign('right')
      ctx.fillText('实收：¥' + order.paidAmount, colX[5] - 4, sumY + 16)
      ctx.setTextAlign('left')
    } else {
      ctx.setFillStyle('#333333')
      ctx.setFontSize(16)
      ctx.fillText('合计：¥' + (order.totalAmount || 0), colX[0] + 8, sumY + 18)
    }

    var afterTableY = sumY + 32

    // ====== 8. 备注（浅灰底+蓝色左边条） ======
    if (order.remark && order.remark.trim()) {
      var remarkH = 42
      var remarkY = afterTableY

      ctx.setFillStyle('#f9f9f9')
      ctx.fillRect(colX[0], remarkY, tableW, remarkH)
      ctx.setFillStyle('#1677ff')
      ctx.fillRect(colX[0], remarkY, 3, remarkH)

      ctx.setFillStyle('#666666')
      ctx.setFontSize(11)
      var remarkShow = order.remark.trim()
      if (remarkShow.length > 40) remarkShow = remarkShow.substring(0, 40) + '…'
      ctx.fillText('备注：' + remarkShow, colX[0] + 12, remarkY + 26)

      afterTableY = remarkY + remarkH + 14
    } else {
      afterTableY += 10
    }

    // 分割线
    ctx.setStrokeStyle('#e0e0e0')
    ctx.setLineWidth(0.6)
    ctx.beginPath()
    ctx.moveTo(40, afterTableY)
    ctx.lineTo(barX + barW - 16, afterTableY)
    ctx.stroke()

    // ====== 9. 底部信息区（左：门店 + 右：开单人+客户签字） ======
    var footerY = afterTableY + 20
    var rightX = 340

    // 左侧：门店信息
    ctx.setFillStyle('#555555')
    ctx.setFontSize(12)
    ctx.fillText('门店：' + shopName, 40, footerY)

    if (shopAddr) {
      footerY += 20
      ctx.setFillStyle('#888888')
      ctx.setFontSize(11)
      var addrShow = shopAddr.length > 28 ? shopAddr.substring(0, 27) + '…' : shopAddr
      ctx.fillText('地址：' + addrShow, 40, footerY)
    }

    if (shopTel) {
      footerY += 20
      ctx.fillText('电话：' + shopTel, 40, footerY)
    }

    // 右侧：开单人
    var rightBaseY = afterTableY + 20
    ctx.setFillStyle('#555555')
    ctx.setFontSize(12)
    var operatorText = '开单人：'
    if (order.operatorName) {
      operatorText += order.operatorName
    } else if (order.operatorPhone) {
      operatorText += util.maskPhone(order.operatorPhone)
    }
    ctx.fillText(operatorText, rightX, rightBaseY)

    // 客户签字区域（虚线框）
    var sigX = rightX
    var sigY = rightBaseY + 8
    var sigW = 200
    var sigH = 44

    ctx.setStrokeStyle('#bbbbbb')
    ctx.setLineWidth(0.8)
    ctx.setLineDash([4, 3])
    ctx.strokeRect(sigX, sigY, sigW, sigH)
    ctx.setLineDash([])

    ctx.setFillStyle('#bbbbbb')
    ctx.setFontSize(11)
    ctx.fillText('客户签字：', sigX + 8, sigY + 27)

    // ====== 10. 底部品牌标识 ======
    var brandY = Math.max(footerY, sigY + sigH) + 24

    ctx.setStrokeStyle('#e8e8e8')
    ctx.setLineWidth(0.6)
    ctx.beginPath()
    ctx.moveTo(60, brandY)
    ctx.lineTo(W - 60, brandY)
    ctx.stroke()

    ctx.setFillStyle('#cccccc')
    ctx.setFontSize(11)
    ctx.setTextAlign('center')
    ctx.fillText('AI养车 · 智能门店管理系统', W / 2, brandY + 16)
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

  onPlateTap() {
    var plate = this.data.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
    }
  },

  onNewCheckSheet() {
    var plate = this.data.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/checkSheet/checkSheet?plate=' + plate })
    }
  },

  onViewCheckSheets() {
    var plate = this.data.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/checkSheetList/checkSheetList?keyword=' + plate })
    }
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
