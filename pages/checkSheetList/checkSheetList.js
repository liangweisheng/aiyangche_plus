// pages/checkSheetList/checkSheetList.js
// 电子查车单列表页 - v6.0
// 云函数统一数据获取（listCheckSheets），服务端分页

const app = getApp()
var util = require('../../utils/util')
var constants = require('../../utils/constants')

Page({
  data: {
    keyword: '',
    list: [],
    totalCount: 0,
    page: 1,
    loading: false,
    noMore: false,
    firstLoad: true
  },

  PAGE_SIZE: constants.DEFAULT_PAGE_LIMIT || 20,

  onLoad(options) {
    this._reqVersion = 0
    if (!app.checkPageAccess('registered')) return
    if (options && options.keyword) {
      this.setData({ keyword: options.keyword })
    }
    this.fetchList(true)
  },

  onPullDownRefresh() {
    var page = this
    page._reqVersion = (page._reqVersion || 0) + 1
    page.setData({ page: 1, noMore: false, list: [] })
    page.fetchList(true).then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.noMore || this.data.loading) return
    this.fetchList(false)
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this._reqVersion = (this._reqVersion || 0) + 1
    this.setData({ page: 1, noMore: false, list: [] })
    this.fetchList(true)
  },

  onClear() {
    this._reqVersion = (this._reqVersion || 0) + 1
    this.setData({ keyword: '', page: 1, noMore: false, list: [] })
    this.fetchList(true)
  },

  onCardTap(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/checkSheetDetail/checkSheetDetail?id=' + id })
  },

  fetchList(isRefresh) {
    var page = this
    if (page.data.loading) return Promise.resolve()
    var reqVersion = page._reqVersion || 0
    page.setData({ loading: true })

    var currentPage = isRefresh ? 1 : page.data.page

    return util.callRepair('listCheckSheets', {
      shopPhone: app.getShopPhone(),
      page: currentPage,
      pageSize: page.PAGE_SIZE,
      keyword: (page.data.keyword || '').trim()
    }).then(function (res) {
      if (reqVersion !== page._reqVersion) return  // 竞态保护

      if (res.code !== 0 || !res.data) {
        page.setData({ loading: false, firstLoad: false })
        return
      }

      // 检查项 key 列表
      var checkKeys = ['exterior', 'tire', 'oil', 'battery', 'brake', 'light', 'chassis', 'other']

      var items = (res.data.list || []).map(function (item) {
        if (item.createTime) {
          item.dateStr = util.formatDate(item.createTime)
          var dtStr = util.formatDateTime(item.createTime)
          item.timeStr = dtStr.split(' ')[1] ? dtStr.split(' ')[1].substring(0, 5) : ''
        }
        // 计算每条查车单的三态统计
        var s = { normal: 0, abnormal: 0, pending: 0 }
        var ci = item.checkItems
        if (ci) {
          for (var k = 0; k < checkKeys.length; k++) {
            var v = ci[checkKeys[k]]
            if (v && v.normal === true) {
              s.normal++
            } else if (v && v.value && v.value !== '该项未检查') {
              s.abnormal++
            } else {
              s.pending++
            }
          }
        } else {
          s.pending = 8
        }
        item._stats = s
        return item
      })

      var newList = isRefresh ? items : page.data.list.concat(items)
      var noMore = items.length < page.PAGE_SIZE

      page.setData({
        list: newList,
        page: currentPage + 1,
        loading: false,
        noMore: noMore,
        firstLoad: false,
        totalCount: res.data.total || 0
      })
    }).catch(function (err) {
      if (reqVersion !== page._reqVersion) return  // 竞态保护
      console.error('[checkSheetList] 加载失败:', err)
      page.setData({ loading: false, firstLoad: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  onNewCheckSheet() {
    wx.navigateTo({ url: '/pages/checkSheet/checkSheet' })
  },

  onGoHome: function () {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  }
})
