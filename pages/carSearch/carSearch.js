// pages/carSearch/carSearch.js
// 车牌搜索页面 - 核心入口

const app = getApp()

Page({
  data: {
    plateNumber: '',
    searchList: [],
    searchHistory: [],
    loading: false,
    isEmpty: false,
    recentCars: [],
    searchTimer: null,
    from: ''
  },

  onLoad(options) {
    this.setData({ from: options.from || '' })
    this.loadRecentCars()
  },

  onShow() {
    this.loadRecentCars()
  },

  // 预加载最近10条车辆（按门店隔离 + 创建时间倒序）
  loadRecentCars() {
    var page = this
    var db = app.db()
    var whereCondition = app.shopWhere()
    db.collection('repair_cars')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(12)
      .get({
        success: function (res) {
          var cars = res.data || []
          page.setData({ recentCars: cars })
        },
        fail: function () { }
      })
  },

  // 点击最近车辆 → 跳转详情
  onRecentTap(e) {
    var plate = e.currentTarget.dataset.plate || ''
    wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
  },

  onPlateInput(e) {
    var page = this
    var rawVal = e.detail.value
    // 过滤：仅允许数字和大写字母，自动转大写
    var filteredVal = rawVal.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
    page.setData({ plateNumber: filteredVal })

    // 清除之前的定时器
    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
      page.setData({ searchTimer: null })
    }

    // 清空输入时重置结果
    if (!filteredVal || filteredVal.length < 3) {
      page.setData({ searchList: [], isEmpty: false, loading: false })
      return
    }

    // 输入满3位后，500ms防抖自动搜索
    page.setData({
      searchTimer: setTimeout(function () {
        page.doSearch(filteredVal.trim())
      }, 500)
    })
  },

  onClearInput() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
    this.setData({ plateNumber: '', searchList: [], isEmpty: false, loading: false, searchTimer: null })
  },

  // 执行搜索
  doSearch(keyword) {
    var page = this
    if (!keyword || keyword.length < 3) return
    var db = app.db()
    page.setData({ loading: true, isEmpty: false })

    var isPhone = /^\d{11}$/.test(keyword)
    var whereCondition

    if (isPhone) {
      whereCondition = app.shopWhere({
        phone: db.RegExp({ regexp: keyword, options: 'i' })
      })
    } else {
      whereCondition = app.shopWhere({
        plate: db.RegExp({ regexp: keyword.replace(/\./g, '\\.'), options: 'i' })
      })
    }

    db.collection('repair_cars')
      .where(whereCondition)
      .get({
        success: function (res) {
          page.setData({ loading: false })
          if (res.data.length === 0) {
            page.setData({ searchList: [], isEmpty: true })
          } else {
            page.setData({ searchList: res.data, isEmpty: false })
          }
        },
        fail: function () {
          page.setData({ loading: false })
          wx.showToast({ title: '查询失败', icon: 'none' })
        }
      })
  },

  onSearch() {
    var keyword = this.data.plateNumber.trim()
    if (keyword.length >= 3) {
      if (this.data.searchTimer) {
        clearTimeout(this.data.searchTimer)
        this.setData({ searchTimer: null })
      }
      this.doSearch(keyword)
    }
  },

  onAddCar() {
    wx.navigateTo({ url: '/pages/carAdd/carAdd' })
  },

  onResultTap(e) {
    var plate = e.currentTarget.dataset.plate
    // 从开单页跳来的 → 缓存车牌并返回
    if (this.data.from === 'orderAdd') {
      wx.setStorageSync('orderAdd_selectedPlate', plate)
      wx.navigateBack()
      return
    }
    wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
  }
})
