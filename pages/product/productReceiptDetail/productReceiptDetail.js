// pages/product/productReceiptDetail/productReceiptDetail.js
// 入库单详情页 - 展示入库单完整快照
const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    receipt: null,
    loading: true,
    displayTime: ''
  },

  onLoad(options) {
    var batchId = options.batchId || ''
    var logId = options.logId || ''

    if (batchId) {
      this.fetchByBatchId(batchId)
    } else if (logId) {
      this.fetchByLogId(logId)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    }
  },

  /** 按入库单号查询 */
  fetchByBatchId(batchId) {
    var page = this
    var shopPhone = app.getShopPhone()
    page.setData({ loading: true })

    app.callFunction('repair_inventory', {
      action: 'getReceiptDetail',
      batchId: batchId,
      shopPhone: shopPhone
    }).then(function (res) {
      page.setData({ loading: false })
      if (res && res.code === 0 && res.data) {
        page._renderReceipt(res.data)
      } else {
        wx.showToast({ title: (res && res.msg) || '入库单不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      }
    }).catch(function () {
      page.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    })
  },

  /** 按流水 ID 反查入库单 */
  fetchByLogId(logId) {
    var page = this
    var shopPhone = app.getShopPhone()
    page.setData({ loading: true })

    app.callFunction('repair_inventory', {
      action: 'getReceiptByLogId',
      logId: logId,
      shopPhone: shopPhone
    }).then(function (res) {
      page.setData({ loading: false })
      if (res && res.code === 0 && res.data) {
        page._renderReceipt(res.data)
      } else {
        wx.showToast({ title: (res && res.msg) || '未找到入库单', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      }
    }).catch(function () {
      page.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    })
  },

  /** 渲染入库单 */
  _renderReceipt(receipt) {
    var page = this
    // 预计算每行小计
    var items = (receipt.items || []).map(function (item) {
      item._subtotal = parseFloat(((item.quantity || 0) * (item.cost || 0)).toFixed(2))
      return item
    })

    page.setData({
      receipt: receipt,
      items: items,
      displayTime: util.formatDateTime(receipt.createTime),
      loading: false
    })
  }
})
