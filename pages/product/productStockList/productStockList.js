// pages/product/productStockList/productStockList.js
const app = getApp()

Page({
  data: {
    keyword: '',
    currentCategory: '全部',
    categoryOptions: ['全部', '其他', '机油', '轮胎', '刹车系统', '空调系统', '电器', '美容保养', '传动系统', '悬挂系统', '冷却系统'],
    productList: [],
    loading: false,
    searchTimer: null
  },

  onLoad() {
    this.loadProducts()
  },

  onShow() {
    // 从其他页面返回时刷新列表
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
      page.loadProducts()
    }, 400)
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    this.loadProducts()
  },

  onCategoryTap(e) {
    var cat = e.currentTarget.dataset.cat
    this.setData({ currentCategory: cat })
    this.loadProducts()
  },

  loadProducts() {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    page.setData({ loading: true })
    app.callFunction('repair_inventory', {
      action: 'listProducts',
      shopPhone: shopPhone,
      category: page.data.currentCategory,
      keyword: page.data.keyword,
      pageSize: 100
    }).then(function (res) {
      page.setData({ loading: false })
      if (res && res.code === 0 && res.data) {
        page.setData({ productList: res.data.list || [] })
      }
    }).catch(function () {
      page.setData({ loading: false })
    })
  },

  onGoDetail(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/product/productDetail/productDetail?id=' + id })
  }
})
