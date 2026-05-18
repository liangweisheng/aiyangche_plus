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

  onLoad(options) {
    this.setData({
      categoryOptions: this.data.categoryOptions,
      storageKey: (options && options.storageKey) || 'orderAdd_selectedProducts',
      existingKey: (options && options.existingKey) || 'orderAdd_existingProducts',
      showAll: (options && options.showAll === 'true') || false
    })
    var existingProducts = wx.getStorageSync(this.data.existingKey) || []
    this.loadProducts(existingProducts)
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

  loadProducts(existingProducts) {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    page.setData({ loading: true })
    var params = {
      action: 'listProducts',
      shopPhone: shopPhone,
      pageSize: 500
    }
    // 入库模式显示所有商品（含下架），开单模式仅显示已上架
    if (!page.data.showAll) {
      params.status = 'on_shelf'
    }
    app.callFunction('repair_inventory', params).then(function (res) {
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
        // 恢复已选商品的选中状态（replace 模式）
        if (existingProducts && existingProducts.length > 0) {
          page._restoreSelection(existingProducts)
        }
        page.filterProducts()
      }
    }).catch(function () {
      page.setData({ loading: false })
    })
  },

  _decorateProduct(product) {
    // 为每个商品构建显示规格列表
    var specs = product.specs || []
    // 构建规格库存映射
    var specStockMap = {}
    ;(product.specStock || []).forEach(function (s) { specStockMap[s.label] = s.stock || 0 })
    // 构建规格价格映射
    var specPriceMap = {}
    ;(product.specPrice || []).forEach(function (s) { specPriceMap[s.label] = s.price })
    // 构建规格进价映射
    var specCostMap = {}
    ;(product.specCost || []).forEach(function (s) { specCostMap[s.label] = s.cost })
    var displaySpecs = specs.map(function (s) {
      return {
        label: s,
        quantity: 0,
        stock: specStockMap[s] || 0,
        price: specPriceMap[s] || product.price || 0,
        cost: specCostMap[s] !== undefined ? specCostMap[s] : (product.cost || 0)
      }
    })
    product.displaySpecs = displaySpecs
    product._qty = 0 // 无规格时的总数量
    return product
  },

  /** 恢复已选商品的选中数量（从 orderAdd 传过来的现有商品） */
  _restoreSelection(existingProducts) {
    var raw = this.data.rawProducts.map(function (p) {
      p = JSON.parse(JSON.stringify(p))
      var matchedItems = existingProducts.filter(function (ep) {
        return ep._productId === p._id
      })
      matchedItems.forEach(function (item) {
        if (item.spec) {
          // 有规格：恢复对应规格的数量
          var displaySpecs = p.displaySpecs.map(function (s) {
            if (s.label === item.spec) {
              s.quantity = item.quantity
            }
            return s
          })
          p.displaySpecs = displaySpecs
        } else {
          // 无规格
          p._qty = item.quantity
        }
      })
      return p
    })
    this.setData({ rawProducts: raw })
    this.filterProducts()
    this.updateSelectedItems()
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
            var specPrice = s.price || p.price || 0
            items.push({
              _productId: p._id,
              name: p.name,
              spec: s.label,
              quantity: s.quantity,
              price: specPrice,
              unit: p.unit,
              _fromProduct: true,
              cost: s.cost,
              _itemTotalCost: s.cost * s.quantity
            })
            total += specPrice * s.quantity
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
          _fromProduct: true,
          cost: p.cost || 0,
          _itemTotalCost: (p.cost || 0) * p._qty
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
    var page = this
    var items = page.data.selectedItems
    var existingProducts = wx.getStorageSync(page.data.existingKey) || []
    if (items.length === 0) {
      if (existingProducts.length > 0) {
        // 编辑模式：允许返回空（移除所有已选商品）
        wx.setStorageSync(page.data.storageKey, [])
        wx.navigateBack()
        return
      }
      wx.showToast({ title: '请选择商品', icon: 'none' })
      return
    }
    // 序列化为可识别的格式
    var exportItems = items.map(function (item) {
      return {
        name: item.name,
        spec: item.spec || '',
        amount: String(item.price * item.quantity),
        _productId: item._productId,
        _productItemSpec: item.spec,
        _productQuantity: item.quantity,
        _fromProduct: true,
        _productCost: item.cost || 0,
        _productTotalCost: item._itemTotalCost || 0
      }
    })
    wx.setStorageSync(page.data.storageKey, exportItems)
    wx.navigateBack()
  }
})
