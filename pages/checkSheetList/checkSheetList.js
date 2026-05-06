// pages/checkSheetList/checkSheetList.js
// 电子查车单列表页（复用 memberList 搜索+分页模式）

const app = getApp()

Page({
  data: {
    keyword: '',
    list: [],
    totalCount: 0,
    page: 0,
    loading: false,
    noMore: false,
    firstLoad: true
  },

  PAGE_SIZE: 20,

  onLoad(options) {
    if (options && options.keyword) {
      this.setData({ keyword: options.keyword })
    }
    this.fetchList(true)
  },

  onPullDownRefresh() {
    this.setData({ page: 0, noMore: false, list: [] })
    this.fetchList(true)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.noMore || this.data.loading) return
    this.fetchList(false)
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 0, noMore: false, list: [] })
    this.fetchList(true)
  },

  onClear() {
    this.setData({ keyword: '', page: 0, noMore: false, list: [] })
    this.fetchList(true)
  },

  onCardTap(e) {
    var id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/checkSheetDetail/checkSheetDetail?id=' + id })
  },

  fetchList(isRefresh) {
    var page = this
    if (page.data.loading) return
    page.setData({ loading: true })

    var db = app.db()
    var whereCondition = app.shopWhere({})
    var keyword = page.data.keyword.trim()

    if (keyword) {
      whereCondition.plate = db.RegExp({
        regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        options: 'i'
      })
    }

    var skip = isRefresh ? 0 : page.data.page * page.PAGE_SIZE

    db.collection('repair_checkSheets')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(page.PAGE_SIZE)
      .get({
        success: function (res) {
          // 检查项 key 列表（与 checkSheetDetail / checkSheet 保持一致）
          var checkKeys = ['exterior', 'tire', 'oil', 'battery', 'brake', 'light', 'chassis', 'other']

          var items = res.data.map(function (item) {
            if (item.createTime) {
              var d = new Date(item.createTime)
              var pad = function (n) { return n < 10 ? '0' + n : '' + n }
              item.dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
              item.timeStr = pad(d.getHours()) + ':' + pad(d.getMinutes())
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
            totalCount: newList.length,
            page: (isRefresh ? 0 : page.data.page) + 1,
            loading: false,
            noMore: noMore,
            firstLoad: false
          })
        },
        fail: function () {
          page.setData({ loading: false, firstLoad: false })
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  }
})
