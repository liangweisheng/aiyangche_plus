// pages/memberList/memberList.js
// 会员列表页面 - v6.0
// 云函数统一数据获取（listMembers），服务端分页+多字段搜索

const app = getApp()
var util = require('../../utils/util')
var shareCardUtil = require('../../utils/shareCard')
var constants = require('../../utils/constants')
var ocrHelper = require('../../utils/ocrHelper')
const PAGE_SIZE = constants.DEFAULT_PAGE_LIMIT || 20

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
    shareImagePath: '', // 分享卡片图片路径
    searchTimer: null // 搜索防抖定时器
  },

  onLoad(options) {
    // 权限检查：店员不可访问会员列表
    if (!app.checkPageAccess('admin')) return

    var page = this
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var isGuest = app.isGuest ? app.isGuest() : false
    this.setData({ isGuest: isGuest, freeMaxMembers: constants.FREE_MAX_MEMBERS })
    if (options.keyword) {
      this.setData({ searchKeyword: options.keyword })
    }
    this._firstLoad = true

    page._resetAndFetch()
  },

  onUnload() {
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer)
    }
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
      this.getTabBar().init()
    }
    // Pro状态实时同步（统一方法）
    var page = this
    app.syncProStatus().then(function (isPro) {
      page.setData({ isPro: isPro })
    }).catch(function () {
      // 同步失败保持现有 isPro 值，不做覆盖
    })
    if (!this._firstLoad) {
      // 返回时清空搜索关键字，重新加载全量列表
      page.setData({ searchKeyword: '' })
      page._resetAndFetch()
    }
    this._firstLoad = false
  },

  onSearchInput(e) {
    var page = this
    var val = e.detail.value
    page.setData({ searchKeyword: val })

    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
      page.setData({ searchTimer: null })
    }

    // 清空内容时重置为全量列表
    if (!val || !val.trim()) {
      page._resetAndFetch()
      return
    }

    // 不足3字暂不搜索，等待用户继续输入
    if (val.trim().length < 3) {
      return
    }

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

  // 触底加载更多
  onReachBottom() {
    if (!this.data.noMore && !this.data.loading) {
      this.fetchMemberList()
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
    this.setData({ memberList: [], noMore: false, isEmpty: false, totalCount: 0, memberLimitReached: false })
    this._page = 1
    return this.fetchMemberList()
  },

  // 获取会员列表（云函数分页）
  fetchMemberList() {
    var page = this
    var reqVersion = page._reqVersion || 0
    page.setData({ loading: true, isEmpty: false })

    return util.callRepair('listMembers', {
      shopPhone: app.getShopPhone(),
      page: page._page,
      pageSize: PAGE_SIZE,
      keyword: (page.data.searchKeyword || '').trim()
    }).then(function (res) {
      if (page._reqVersion !== reqVersion) return  // 竞态保护

      if (res.code !== 0 || !res.data) {
        page.setData({ loading: false })
        return
      }

      var total = res.data.total || 0
      var newData = (res.data.list || []).map(function(item) {
        item.phoneMasked = util.maskPhone(item.phone)
        return item
      })
      var list = page.data.memberList.concat(newData)
      var noMore = newData.length < PAGE_SIZE

      var updateData = {
        loading: false,
        memberList: list,
        isEmpty: list.length === 0,
        noMore: noMore,
        totalCount: total
      }
      // 免费版会员上限提示
      if (!page.data.isPro && total >= constants.FREE_MAX_MEMBERS) {
        updateData.memberLimitReached = true
      }
      page._page++
      page.setData(updateData)
    }).catch(function (err) {
      if (page._reqVersion !== reqVersion) return
      console.error('[memberList] 加载失败:', err)
      page.setData({ loading: false })
      if (page._page <= 1) {
        page.setData({ memberList: [], isEmpty: true })
      }
      wx.showToast({ title: '加载失败', icon: 'none' })
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

  onGoHome: function () {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  // 分享配置
  onShareAppMessage() {
    return {
      title: '会员管理利器，客户信息一目了然！',
      path: '/pages/memberList/memberList',
      imageUrl: this.data.shareImagePath || ''
    }
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

  _page: 1,
  _reqVersion: 0
})
