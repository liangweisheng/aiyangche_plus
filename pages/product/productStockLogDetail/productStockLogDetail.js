// pages/product/productStockLogDetail/productStockLogDetail.js
// 出入库流水详情页（方案B：通用流水详情页）

const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    log: null,
    loading: true,
    displayTime: '',
    typeText: '',
    typeClass: ''
  },

  onLoad(options) {
    if (options.id) {
      this.fetchLog(options.id)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    }
  },

  fetchLog(logId) {
    var page = this
    var shopPhone = (app.globalData.shopInfo && app.globalData.shopInfo.phone) || ''

    app.callFunction('repair_inventory', {
      action: 'getStockLogDetail',
      logId: logId,
      shopPhone: shopPhone
    }).then(function (res) {
      var result = res
      if (!result || result.code !== 0) {
        wx.showToast({ title: (result && result.msg) || '加载失败', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
        return
      }

      var logData = result.data
      if (!logData) {
        wx.showToast({ title: '流水不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
        return
      }

      var typeText = logData.type === 'in' ? '入库' : logData.type === 'out' ? '出库' : '库存调整'
      var typeClass = logData.type === 'in' ? 'type-in' : logData.type === 'out' ? 'type-out' : 'type-adjust'
      var qtyDisplay = ''
      if (logData.type === 'in') {
        qtyDisplay = '+' + logData.quantity
      } else if (logData.type === 'out') {
        qtyDisplay = '-' + logData.quantity
      } else {
        qtyDisplay = (logData.quantity > 0 ? '+' : '') + logData.quantity
      }

      // 调整原因的映射（adjust 类型特有）
      var adjustReason = ''
      if (logData.type === 'adjust') {
        adjustReason = logData.reason || logData.remark || ''
      }

      page.setData({
        log: logData,
        displayTime: util.formatDateTime(logData.createTime),
        typeText: typeText,
        typeClass: typeClass,
        qtyDisplay: qtyDisplay,
        adjustReason: adjustReason,
        loading: false
      })
    }).catch(function () {
      page.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    })
  },

  /** 查看关联工单（出库流水） */
  onViewOrder() {
    var log = this.data.log
    if (log && log.orderRef) {
      wx.navigateTo({ url: '/pages/orderDetail/orderDetail?id=' + log.orderRef })
    }
  },

  /** 查看完整入库单（入库流水） */
  onViewReceipt() {
    var log = this.data.log
    if (log && log._id) {
      wx.navigateTo({ url: '/pages/product/productReceiptDetail/productReceiptDetail?logId=' + log._id })
    }
  }
})
