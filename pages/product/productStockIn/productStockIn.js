// pages/product/productStockIn/productStockIn.js
const app = getApp()

Page({
  data: {
    selectedItems: [],
    supplier: '',
    remark: '',
    saving: false
  },

  onLoad() {
    // 拦截店员访问
    if (!app.checkPageAccess('admin')) return
  },

  onShow() {
    // 从 storage 读取已选商品（由 productSelect 写入）
    var items = wx.getStorageSync('stockIn_selectedProducts') || []
    if (items.length > 0) {
      // 重置 cost 为空，让用户自行填写
      items = items.map(function (item) {
        return {
          _productId: item._productId,
          name: item.name,
          spec: item.spec || '',
          quantity: item.quantity,
          unit: item.unit || '个',
          cost: ''
        }
      })
      this.setData({ selectedItems: items })
      // 清空 storage 避免重复读取
      wx.removeStorageSync('stockIn_selectedProducts')
    }
  },

  /** 跳转到商品选择页 */
  onSelectProducts() {
    wx.navigateTo({
      url: '/pages/product/productSelect/productSelect?storageKey=stockIn_selectedProducts&showAll=true'
    })
  },

  /** 输入进价 */
  onCostInput(e) {
    var idx = e.currentTarget.dataset.index
    var val = e.detail.value
    var items = this.data.selectedItems.map(function (item, i) {
      if (i === idx) {
        item.cost = val
      }
      return item
    })
    this.setData({ selectedItems: items })
  },

  /** 删除某行 */
  onRemoveItem(e) {
    var idx = e.currentTarget.dataset.index
    var items = this.data.selectedItems.filter(function (_, i) { return i !== idx })
    this.setData({ selectedItems: items })
  },

  /** 通用输入 */
  onInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  /** 确认入库 */
  onSave() {
    var page = this
    var items = page.data.selectedItems

    if (items.length === 0) {
      wx.showToast({ title: '请先选择商品', icon: 'none' })
      return
    }

    // 校验进价：允许为 0（供货商赠送），但不能为负数或空
    for (var i = 0; i < items.length; i++) {
      var costStr = items[i].cost
      if (costStr === '' || costStr === undefined || costStr === null) {
        wx.showToast({ title: '第' + (i + 1) + '行进价未填写', icon: 'none' })
        return
      }
      var cost = Number(costStr)
      if (cost < 0) {
        wx.showToast({ title: '第' + (i + 1) + '行进价不能为负数', icon: 'none' })
        return
      }
    }

    page.setData({ saving: true })
    var shopPhone = app.getShopPhone()

    // 构建云函数参数
    var stockItems = items.map(function (item) {
      return {
        productId: item._productId,
        spec: item.spec || '',
        quantity: Number(item.quantity),
        cost: Number(item.cost) || 0
      }
    })

    app.callFunction('repair_inventory', {
      action: 'batchAddStock',
      shopPhone: shopPhone,
      items: stockItems,
      operator: app.getOperatorName() || '管理员',
      supplier: page.data.supplier.trim(),
      remark: page.data.remark.trim()
    }).then(function (res) {
      page.setData({ saving: false })
      if (res && res.code === 0) {
        wx.showToast({ title: '批量入库成功', icon: 'success' })
        page.setData({ selectedItems: [], supplier: '', remark: '' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      } else {
        var msg = (res && res.msg) || '入库失败'
        if (res && res.data && res.data.errors) {
          msg += '（' + (res.data.succeeded || 0) + '项成功，' + res.data.errors.length + '项失败）'
        }
        wx.showToast({ title: msg, icon: 'none' })
      }
    }).catch(function () {
      page.setData({ saving: false })
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  }
})
