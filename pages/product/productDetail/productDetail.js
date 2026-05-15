// pages/product/productDetail/productDetail.js
const app = getApp()
const util = require('../../../utils/util')

Page({
  data: {
    product: null,
    stockLogs: [],
    loadingLogs: false
  },
  util: util,

  onLoad(options) {
    var id = options.id || ''
    if (id) {
      this.loadProduct(id)
      this.loadStockLogs(id)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    }
  },

  loadProduct(productId) {
    var page = this
    var shopPhone = app.getShopPhone()
    app.callFunction('repair_inventory', {
      action: 'getProductDetail',
      productId: productId,
      shopPhone: shopPhone
    }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        page.setData({ product: res.data })
        wx.setNavigationBarTitle({ title: res.data.name })
      } else {
        wx.showToast({ title: '商品不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      }
    }).catch(function () {
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  loadStockLogs(productId) {
    var page = this
    var shopPhone = app.getShopPhone()
    page.setData({ loadingLogs: true })
    app.callFunction('repair_inventory', {
      action: 'getStockLogs',
      productId: productId,
      shopPhone: shopPhone,
      pageSize: 50
    }).then(function (res) {
      page.setData({ loadingLogs: false })
      if (res && res.code === 0 && res.data) {
        page.setData({ stockLogs: res.data.list || [] })
      }
    }).catch(function () {
      page.setData({ loadingLogs: false })
    })
  }
})
