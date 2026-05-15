// pages/product/productStockIn/productStockIn.js
const app = getApp()

Page({
  data: {
    products: [],
    productNames: [],
    productIndex: -1,
    selectedProduct: null,
    specIndex: -1,
    quantity: '',
    cost: '',
    remark: '',
    saving: false
  },

  onLoad() {
    this.loadProducts()
  },

  onInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  loadProducts() {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    wx.showLoading({ title: '加载商品...' })
    app.callFunction('repair_inventory', {
      action: 'listProducts',
      shopPhone: shopPhone,
      pageSize: 200
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0 && res.data) {
        var list = res.data.list || []
        var names = list.map(function (p) { return p.name })
        page.setData({ products: list, productNames: names })
      }
    }).catch(function () {
      wx.hideLoading()
    })
  },

  onProductChange(e) {
    var idx = parseInt(e.detail.value)
    var product = this.data.products[idx] || null
    this.setData({
      productIndex: idx,
      selectedProduct: product,
      specIndex: -1,
      cost: product ? String(product.cost || '') : ''
    })
  },

  onSpecChange(e) {
    this.setData({ specIndex: parseInt(e.detail.value) })
  },

  onSave() {
    var page = this
    if (page.data.productIndex < 0 || !page.data.selectedProduct) {
      wx.showToast({ title: '请选择商品', icon: 'none' })
      return
    }
    var qty = parseInt(page.data.quantity)
    if (!qty || qty <= 0) {
      wx.showToast({ title: '请输入有效数量', icon: 'none' })
      return
    }
    var shopPhone = app.getShopPhone()
    var product = page.data.selectedProduct
    var spec = ''
    if (product.specs && product.specs.length > 0 && page.data.specIndex >= 0) {
      spec = product.specs[page.data.specIndex]
    }

    page.setData({ saving: true })
    app.callFunction('repair_inventory', {
      action: 'addStock',
      shopPhone: shopPhone,
      productId: product._id,
      spec: spec,
      quantity: qty,
      cost: Number(page.data.cost) || 0,
      operator: app.getOperatorName() || '管理员',
      remark: page.data.remark.trim()
    }).then(function (res) {
      page.setData({ saving: false })
      if (res && res.code === 0) {
        wx.showToast({ title: '入库成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      } else {
        wx.showToast({ title: (res && res.msg) || '入库失败', icon: 'none' })
      }
    }).catch(function () {
      page.setData({ saving: false })
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  }
})
