// pages/orderList/orderList.js
// 历史工单列表 - v6.0
// 云函数统一数据获取（listOrders），服务端分页+会员状态聚合

const app = getApp()
const util = require('../../utils/util')
var constants = require('../../utils/constants')
var ocrHelper = require('../../utils/ocrHelper')
const PAGE_SIZE = constants.DEFAULT_PAGE_LIMIT || 20

Page({
  data: {
    searchKeyword: '',
    statusFilter: '',          // 状态筛选值：空=全部, '施工中', '待结算', '已完成'
    filterOptions: [
      { label: '全部', value: '', style: '' },
      { label: '施工中', value: '施工中', style: 'style-working' },
      { label: '待结算', value: '待结算', style: 'style-pending' },
      { label: '已完成', value: '已完成', style: 'style-done' }
    ],
    orderList: [],
    loading: false,
    isEmpty: false,
    noMore: false,
    totalCount: 0,
    searchTimer: null          // 搜索防抖定时器
  },

  onLoad(options) {
    if (options.keyword) {
      this.setData({ searchKeyword: options.keyword })
    }
    if (options.plate) {
      this.setData({ searchKeyword: options.plate })
    }
    this._resetAndFetch()
  },

  onUnload() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
  },

  onShow() {
   // 检查是否需要刷新（从编辑页面返回时）
   const app = getApp()
    if (app.globalData.shouldRefreshOrderList) {
      app.globalData.shouldRefreshOrderList = false
      this._resetAndFetch()
    }
  },
  
  onSearchInput(e) {
    var page = this
    var val = e.detail.value
    page.setData({ searchKeyword: val })

    // 清除之前的定时器
    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
      page.setData({ searchTimer: null })
    }

    // 清空内容时重置为全量列表
    if (!val || !val.trim()) {
      page._resetAndFetch()
      return
    }

    // 少于3字符时不自动搜索（保留手动搜索能力）
    if (val.trim().length < 3) {
      return
    }

    // 输入满3位后，500ms防抖自动搜索
    page.setData({
      searchTimer: setTimeout(function () {
        page.setData({ searchTimer: null })
        page._resetAndFetch()
      }, 500)
    })
  },

  onClearSearch() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
    this.setData({ searchKeyword: '', searchTimer: null })
    this._resetAndFetch()
  },

  onSearch() {
    this._resetAndFetch()
  },

  // 状态筛选切换
  onFilterTap(e) {
    var value = e.currentTarget.dataset.value
    if (this.data.statusFilter === value) return
    this.setData({ statusFilter: value })
    this._resetAndFetch()
  },

  // 触底加载更多
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.fetchOrderList()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    var page = this
    this._resetAndFetch().then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  // 重置列表并重新加载
  _resetAndFetch() {
    this._reqVersion = (this._reqVersion || 0) + 1
    this.setData({ orderList: [], noMore: false, isEmpty: false, totalCount: 0 })
    this._page = 1
    return this.fetchOrderList()
  },

  // 获取工单列表（云函数分页）
  fetchOrderList() {
    var page = this
    var reqVersion = page._reqVersion || 0
    page.setData({ loading: true, isEmpty: false })

    return util.callRepair('listOrders', {
      shopPhone: app.getShopPhone(),
      page: page._page,
      pageSize: PAGE_SIZE,
      keyword: (page.data.searchKeyword || '').trim(),
      statusFilter: page.data.statusFilter || ''
    }).then(function (res) {
      if (reqVersion !== page._reqVersion) return  // 竞态保护

      if (res.code !== 0 || !res.data) {
        page.setData({ loading: false })
        return
      }

      var newData = (res.data.list || []).map(function (item) {
        return Object.assign({}, item, {
          createTime: item.createTime ? util.formatDateTime(item.createTime) : '',
          isMember: !!item.isMember
        })
      })

      var list = page.data.orderList.concat(newData)
      var noMore = newData.length < PAGE_SIZE
      page._page++

      page.setData({
        loading: false,
        orderList: list,
        isEmpty: list.length === 0,
        noMore: noMore,
        totalCount: res.data.total || 0
      })
    }).catch(function (err) {
      console.error('[orderList] 加载失败:', err)
      if (reqVersion !== page._reqVersion) return
      page.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  onOrderTap(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/orderDetail/orderDetail?id=' + id })
  },

  onRefresh() {
    this._resetAndFetch()
  },

  onNewOrder() {
    wx.navigateTo({ url: '/pages/orderAdd/orderAdd' })
  },

  onGoHome: function () {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  // 📷 车牌OCR识别（v6.1.0）
  onScanPlate() {
    var page = this
    ocrHelper.scanPlate(function (plate) {
      page.setData({ searchKeyword: plate })
      if (page.data.searchTimer) clearTimeout(page.data.searchTimer)
      page.setData({
        searchTimer: setTimeout(function () {
          page.setData({ searchTimer: null })
          page._resetAndFetch()
        }, 100)
      })
    })
  },

  _reqVersion: 0,
  _page: 1
})
