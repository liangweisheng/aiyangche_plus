// pages/product/productSelect/productSelect.js
const app = getApp()

Page({
  data: {
    keyword: '',
    currentCategory: '全部',
    categoryOptions: ['全部', '其他', '机油', '轮胎', '刹车系统', '空调系统', '电器', '美容保养', '传动系统', '悬挂系统', '冷却系统'],
    productList: [],
    rawProducts: [],
    selectedItems: [],
    totalAmount: 0,
    loading: false,
    searchTimer: null
  },

  onLoad() {
    this.setData({ categoryOptions: this.data.categoryOptions })
    this.loadProducts()
  },

  onSearchInput(e) {
    var page = this
    var val = e.detail.value
    this.setData({ keyword: val })
    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
    }
    page.data.searchTimer = setTimeout(function () {
      page.filterProducts()
    }, 400)
  },

  onCategoryTap(e) {
    var cat = e.currentTarget.dataset.cat
    this.setData({ currentCategory: cat })
    this.filterProducts()
  },

  loadProducts() {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    page.setData({ loading: true })
    app.callFunction('repair_inventory', {
      action: 'listProducts',
      shopPhone: shopPhone,
      pageSize: 500
    }).then(function (res) {
      page.setData({ loading: false })
      if (res && res.code === 0 && res.data) {
        var list = (res.data.list || []).map(function (p) {
          return page._decorateProduct(p)
        })
        page.setData({
          rawProducts: list,
          selectedItems: [],
          totalAmount: 0
        })
        page.filterProducts()
      }
    }).catch(function () {
      page.setData({ loading: false })
    })
  },

  _decorateProduct(product) {
    // 为每个商品构建显示规格列表
    var specs = product.specs || []
    var displaySpecs = specs.map(function (s) {
      return { label: s, quantity: 0 }
    })
    product.displaySpecs = displaySpecs
    product._qty = 0 // 无规格时的总数量
    return product
  },

  filterProducts() {
    var keyword = this.data.keyword.trim().toLowerCase()
    var cat = this.data.currentCategory
    var list = this.data.rawProducts

    if (cat && cat !== '全部') {
      list = list.filter(function (p) { return p.category === cat })
    }
    if (keyword) {
      list = list.filter(function (p) {
        return p.name.toLowerCase().indexOf(keyword) !== -1
      })
    }

    // 更新显示占位
    this.setData({ productList: list })
  },

  onQtyChange(e) {
    var ds = e.currentTarget.dataset
    var pid = ds.pid
    var specLabel = ds.spec
    var delta = parseInt(ds.delta)

    var raw = this.data.rawProducts.map(function (p) {
      if (p._id !== pid) return p
      p = JSON.parse(JSON.stringify(p))
      if (specLabel === '') {
        // 无规格
        p._qty = Math.max(0, (p._qty || 0) + delta)
      } else {
        var displaySpecs = p.displaySpecs.map(function (s) {
          if (s.label === specLabel) {
            s.quantity = Math.max(0, (s.quantity || 0) + delta)
          }
          return s
        })
        p.displaySpecs = displaySpecs
      }
      return p
    })

    this.setData({ rawProducts: raw })
    this.filterProducts()
    this.updateSelectedItems()
  },

  updateSelectedItems() {
    var items = []
    var total = 0
    this.data.rawProducts.forEach(function (p) {
      if (p.specs && p.specs.length > 0) {
        p.displaySpecs.forEach(function (s) {
          if (s.quantity > 0) {
            items.push({
              _productId: p._id,
              name: p.name,
              spec: s.label,
              quantity: s.quantity,
              price: p.price,
              unit: p.unit,
              _fromProduct: true
            })
            total += p.price * s.quantity
          }
        })
      } else if (p._qty > 0) {
        items.push({
          _productId: p._id,
          name: p.name,
          spec: '',
          quantity: p._qty,
          price: p.price,
          unit: p.unit,
          _fromProduct: true
        })
        total += p.price * p._qty
      }
    })
    this.setData({
      selectedItems: items,
      totalAmount: total
    })
  },

  onConfirm() {
    var items = this.data.selectedItems
    if (items.length === 0) {
      wx.showToast({ title: '请选择商品', icon: 'none' })
      return
    }
    // 序列化为 orderAdd 可识别的格式
    var exportItems = items.map(function (item) {
      var displayName = item.name + (item.spec ? ' - ' + item.spec : '')
      return {
        name: displayName,
        spec: '',
        amount: String(item.price * item.quantity),
        _productId: item._productId,
        _productItemSpec: item.spec,
        _productQuantity: item.quantity,
        _fromProduct: true
      }
    })
    wx.setStorageSync('orderAdd_selectedProducts', exportItems)
    wx.navigateBack()
  }
})
