// pages/memberList/memberList.js
// 会员列表页面（按门店手机号隔离 + 分页加载）

const app = getApp()
const PAGE_SIZE = 20
var shareCardUtil = require('../../utils/shareCard')

Page({
  data: {
    searchKeyword: '',
    memberList: [],
    loading: false,
    isEmpty: false,
    noMore: false,
    totalCount: 0,
    isGuest: false,
    isPro: !!wx.getStorageSync('isPro'),
    memberLimitReached: false,
    shareImagePath: '' // 分享卡片图片路径
  },

  onLoad(options) {
    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var isGuest = !!(shopInfo.isGuest || shopInfo.phone === '13507720000' || wx.getStorageSync('isGuestMode'))
    this.setData({ isGuest: isGuest })
    if (options.keyword) {
      this.setData({ searchKeyword: options.keyword })
    }
    this._firstLoad = true

    app.whenCloudReady().then(function () {
      page._resetAndFetch()
    })
  },

  onReady() {
    // 页面渲染完成后，预生成分享卡片（确保Canvas DOM已就绪）
    var page = this
    shareCardUtil.generateMemberCard(page, function (err, tempFilePath) {
      if (!err && tempFilePath) {
        page.setData({ shareImagePath: tempFilePath })
        console.log('[memberList] 分享卡片已保存:', tempFilePath)
      } else {
        console.warn('[memberList] 分享卡片生成失败:', err)
      }
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init(1)
    }
    // Pro状态实时同步（统一方法）
    var page = this
    app.syncProStatus().then(function (isPro) {
      page.setData({ isPro: isPro })
    })
    if (!this._firstLoad) {
      var page = this
      // 返回时清空搜索关键字，重新加载全量列表
      page.setData({ searchKeyword: '' })
      app.whenCloudReady().then(function () {
        page._resetAndFetch()
      })
    }
    this._firstLoad = false
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

  // 触底加载更多
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.fetchMemberList()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this._resetAndFetch()
    wx.stopPullDownRefresh()
  },

  // 重置列表并重新加载
  _resetAndFetch() {
    this.setData({ memberList: [], noMore: false, isEmpty: false, totalCount: 0 })
    this._page = 0
    this.fetchMemberList()
  },

  // 获取会员列表（分页）
  fetchMemberList() {
    var page = this
    var searchKeyword = page.data.searchKeyword
    var db = app.db()
    page.setData({ loading: true, isEmpty: false })

    var baseCondition = app.shopWhere()

    if (searchKeyword.trim()) {
      baseCondition.$or = [
        { plate: db.RegExp({ regexp: searchKeyword.trim(), options: 'i' }) },
        { ownerName: db.RegExp({ regexp: searchKeyword.trim(), options: 'i' }) },
        { phone: db.RegExp({ regexp: searchKeyword.trim(), options: 'i' }) }
      ]
    }

    // 先查总数（仅在第一页时）
    if (page._page === 0) {
      db.collection('repair_members').where(baseCondition).count().then(function (countRes) {
        var total = countRes.total
        var updateData = { totalCount: total }
        if (!page.data.isPro && total >= 10) {
          updateData.memberLimitReached = true
        }
        page.setData(updateData)
      })
    }

    db.collection('repair_members')
      .where(baseCondition)
      .orderBy('createTime', 'desc')
      .skip(page._page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get({
        success: function (res) {
          page._page++
          var newData = res.data || []
          var list = page.data.memberList.concat(newData)
          var noMore = newData.length < PAGE_SIZE
          page.setData({
            loading: false,
            memberList: list,
            isEmpty: list.length === 0,
            noMore: noMore
          })
        },
        fail: function (err) {
          console.error('加载会员列表失败', err)
          page.setData({ loading: false })
          if (page._page === 0) {
            page.setData({ memberList: [], isEmpty: true })
          }
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      })
  },

  onMemberTap(e) {
    var plate = e.currentTarget.dataset.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
    }
  },

  onAddMember() {
    wx.navigateTo({ url: '/pages/memberAdd/memberAdd' })
  },

  goToPro() {
    wx.switchTab({ url: '/pages/proUnlock/proUnlock' })
  },

  // 分享配置
  onShareAppMessage() {
    return {
      title: '会员管理利器，客户信息一目了然！',
      path: '/pages/memberList/memberList',
      imageUrl: this.data.shareImagePath || ''
    }
  },

  _page: 0
})
