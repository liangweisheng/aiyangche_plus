// pages/orderList/orderList.js
// 历史工单列表（按门店手机号隔离 + 分页加载）

const app = getApp()
const util = require('../../utils/util')
const PAGE_SIZE = 20

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
    totalCount: 0
  },

  onLoad(options) {
    if (options.keyword) {
      this.setData({ searchKeyword: options.keyword })
    }
    this._resetAndFetch()
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
    this.setData({ searchKeyword: e.detail.value })
  },

  onClearSearch() {
    this.setData({ searchKeyword: '' })
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
    this._resetAndFetch()
    wx.stopPullDownRefresh()
  },

  // 重置列表并重新加载
  _resetAndFetch() {
    this._reqVersion = (this._reqVersion || 0) + 1
    this.setData({ orderList: [], noMore: false, isEmpty: false, totalCount: 0 })
    this._page = 0
    this.fetchOrderList()
  },

  // 获取工单列表（分页）
  fetchOrderList() {
    var page = this
    var searchKeyword = page.data.searchKeyword
    var db = app.db()
    var reqVersion = page._reqVersion || 0
    page.setData({ loading: true, isEmpty: false })

    var baseCondition = app.shopWhere()
    baseCondition.isVoided = db.command.neq(true)

    if (searchKeyword.trim()) {
      baseCondition.plate = db.RegExp({ regexp: searchKeyword.trim(), options: 'i' })
    }

    // 状态筛选
    var statusFilter = page.data.statusFilter
    if (statusFilter) {
      baseCondition.status = statusFilter
    }

    // 先查总数（仅在第一页时）
    if (page._page === 0) {
      db.collection('repair_orders').where(baseCondition).count().then(function (countRes) {
        page.setData({ totalCount: countRes.total })
      })
    }

    db.collection('repair_orders')
      .where(baseCondition)
      .orderBy('createTime', 'desc')
      .skip(page._page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get({
        success: function (res) {
          // 忽略过期请求的回调，防止竞态导致重复数据
          if (reqVersion !== page._reqVersion) return
          page._page++
          var data = res.data
          // 批量查询会员状态
          var plates = []
          for (var i = 0; i < data.length; i++) {
            if (data[i].plate && plates.indexOf(data[i].plate) === -1) {
              plates.push(data[i].plate)
            }
          }
          var memberPlateSet = {}
          var finishLoad = function () {
            var newData = data.map(function (item) {
              return Object.assign({}, item, {
                createTime: item.createTime ? util.formatDateTime(item.createTime) : '',
                isMember: !!memberPlateSet[item.plate]
              })
            })
            var list = page.data.orderList.concat(newData)
            var noMore = newData.length < PAGE_SIZE
            page.setData({
              loading: false,
              orderList: list,
              isEmpty: list.length === 0,
              noMore: noMore
            })
          }
          if (plates.length === 0) {
            finishLoad()
            return
          }
          db.collection('repair_members').where({
            plate: db.command.in(plates)
          }).get({
            success: function (memRes) {
              for (var j = 0; j < memRes.data.length; j++) {
                memberPlateSet[memRes.data[j].plate] = true
              }
              finishLoad()
            },
            fail: function () {
              finishLoad()
            }
          })
        },
        fail: function () {
          page.setData({ loading: false })
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      })
  },

  onOrderTap(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/orderDetail/orderDetail?id=' + id })
  },

  onRefresh() {
    this._resetAndFetch()
  },

  _page: 0
})
