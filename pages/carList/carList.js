// pages/carList/carList.js
// 车辆列表页面 - v6.0
// 云函数统一数据获取 + 客户端筛选/分页 + 双层缓存

const app = getApp()
const util = require('../../utils/util')
const constants = require('../../utils/constants')
const ocrHelper = require('../../utils/ocrHelper')

const PAGE_SIZE = constants.DEFAULT_PAGE_LIMIT || 20

// 缓存 TTL（毫秒）
const CACHE_TTL_BASE = 5 * 60 * 1000    // 基础车辆数据 5 分钟
const CACHE_TTL_AGG = 2 * 60 * 1000     // 聚合统计 2 分钟

Page({
  data: {
    loading: true,
    isEmpty: false,
    searchValue: '',

    // 统计
    totalCount: 0,

    // 筛选
    filters: {
      member: false,      // 会员
      nonMember: false,   // 非会员
      fuel: false,        // 燃油车（7位车牌）
      newEnergy: false    // 新能源车（8位车牌）
    },
    hasActiveFilter: false,

    // 列表
    carList: [],
    page: 1,
    hasMore: true,
    loadingMore: false,

    // 骨架屏
    skeletonCount: 4
  },

  // ============================
  // 内部状态
  // ============================
  _reqVersion: 0,
  _lastFilterTime: 0,
  _lastReachBottomTime: 0,
  _allCars: [],             // 全量车辆基础数据
  _memberMap: {},           // { plate: true }
  _orderStats: {},          // { plate: { orderCount, totalAmount } }
  _isDestroyed: false,
  _searchTimer: null,

  // ============================
  // 生命周期
  // ============================

  onLoad() {
    // 权限检查：店员不可访问车辆列表
    if (!app.checkPageAccess('admin')) return
    this._loadData()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init()
    }
    // 非首次进入时静默刷新
    if (this._allCars.length > 0 && !this._isDestroyed) {
      this._silentRefresh()
    }
  },

  onUnload() {
    this._isDestroyed = true
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = null
    }
  },

  // ============================
  // 下拉刷新
  // ============================
  onPullDownRefresh() {
    this._clearCache()
    this._reqVersion++
    var version = this._reqVersion
    this._resetFilters()
    this._freshLoad(version).finally(function () {
      wx.stopPullDownRefresh()
    })
  },

  // ============================
  // 触底加载更多
  // ============================
  onReachBottom() {
    var now = Date.now()
    if (now - this._lastReachBottomTime < 1000) return
    this._lastReachBottomTime = now

    if (!this.data.hasMore || this.data.loadingMore) return
    this._loadMorePage()
  },

  // ============================
  // 搜索
  // ============================
  onSearchInput(e) {
    var value = e.detail.value || ''
    this.setData({ searchValue: value })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(this._applyFiltersAndRender.bind(this, 1), 500)
  },

  onSearchClear() {
    this.setData({ searchValue: '' })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._applyFiltersAndRender(1)
  },

  // ============================
  // 筛选
  // ============================
  onFilterTap(e) {
    var now = Date.now()
    if (now - this._lastFilterTime < 800) return
    this._lastFilterTime = now

    var type = e.currentTarget.dataset.type
    var filters = Object.assign({}, this.data.filters)

    // 互斥组1：会员 / 非会员
    if (type === 'member') {
      filters.member = !filters.member
      if (filters.member) filters.nonMember = false
    } else if (type === 'nonMember') {
      filters.nonMember = !filters.nonMember
      if (filters.nonMember) filters.member = false
    // 互斥组2：燃油车 / 新能源车
    } else if (type === 'fuel') {
      filters.fuel = !filters.fuel
      if (filters.fuel) filters.newEnergy = false
    } else if (type === 'newEnergy') {
      filters.newEnergy = !filters.newEnergy
      if (filters.newEnergy) filters.fuel = false
    // 全部（重置）
    } else if (type === 'all') {
      filters.member = false
      filters.nonMember = false
      filters.fuel = false
      filters.newEnergy = false
    }

    var hasActive = filters.member || filters.nonMember || filters.fuel || filters.newEnergy
    this.setData({ filters: filters, hasActiveFilter: hasActive })
    this._applyFiltersAndRender(1)
  },

  // ============================
  // 卡片点击 → 跳转 carDetail
  // ============================
  onCardTap(e) {
    var plate = e.currentTarget.dataset.plate
    if (!plate) return
    wx.navigateTo({
      url: '/pages/carDetail/carDetail?plate=' + plate
    })
  },

  // ============================
  // 数据加载
  // ============================

  _loadData() {
    var baseCache = this._getCache('base')
    var aggCache = this._getCache('agg')

    if (baseCache && baseCache.cars && baseCache.cars.length > 0 && aggCache && aggCache.memberMap) {
      this._allCars = baseCache.cars
      this._memberMap = aggCache.memberMap
      this._orderStats = aggCache.orderStats || {}
      this.setData({ loading: false })
      this._applyFiltersAndRender(1)
      // 静默后台刷新
      this._silentRefresh()
      return
    }

    this._freshLoad()
  },

  _freshLoad(version) {
    var v = version || ++this._reqVersion
    var shopPhone = app.getShopPhone()
    var that = this

    this.setData({ loading: true, isEmpty: false })

    return util.callRepair('listCars', { shopPhone: shopPhone }).then(function (res) {
      if (that._isDestroyed || v !== that._reqVersion) return

      if (res && res.code === 0 && res.data) {
        that._allCars = res.data.list || []
        that._memberMap = res.data.memberMap || {}
        that._orderStats = res.data.orderStats || {}
      }

      that._setCache('base', { cars: that._allCars, time: Date.now() })
      that._setCache('agg', { memberMap: that._memberMap, orderStats: that._orderStats, time: Date.now() })

      if (that._allCars.length === 0) {
        that.setData({ loading: false, isEmpty: true, totalCount: 0 })
        return
      }

      that.setData({ loading: false })
      that._applyFiltersAndRender(1)
    }).catch(function (err) {
      console.error('[carList] 加载失败:', err)
      if (that._isDestroyed) return
      that.setData({ loading: false })
      if (that._allCars.length > 0) {
        that._applyFiltersAndRender(1)
      } else {
        that.setData({ isEmpty: true })
      }
    })
  },

  _silentRefresh() {
    var that = this
    var shopPhone = app.getShopPhone()

    util.callRepair('listCars', { shopPhone: shopPhone }).then(function (res) {
      if (that._isDestroyed) return

      if (res && res.code === 0 && res.data) {
        that._allCars = res.data.list || []
        that._memberMap = res.data.memberMap || {}
        that._orderStats = res.data.orderStats || {}
      }

      that._setCache('base', { cars: that._allCars, time: Date.now() })
      that._setCache('agg', { memberMap: that._memberMap, orderStats: that._orderStats, time: Date.now() })

      // 静默更新当前列表
      that._applyFiltersAndRender(that.data.page)
    }).catch(function () {
      // 静默失败不提示
    })
  },

  // ============================
  // 筛选过滤
  // ============================
  _filterCars(cars) {
    if (!cars || cars.length === 0) return []

    var filters = this.data.filters
    var keyword = (this.data.searchValue || '').trim().toUpperCase()
    var hasKeyword = keyword.length > 0
    var hasFilter = filters.member || filters.nonMember || filters.fuel || filters.newEnergy
    var memberMap = this._memberMap

    if (!hasFilter && !hasKeyword) return cars

    return cars.filter(function (car) {
      var plate = (car.plate || '')

      // 会员筛选
      if (filters.member && !memberMap[plate]) return false
      if (filters.nonMember && memberMap[plate]) return false

      // 燃料类型筛选
      var plen = plate.length
      if (filters.fuel && plen !== 7) return false
      if (filters.newEnergy && plen !== 8) return false

      // 搜索
      if (hasKeyword && plate.toUpperCase().indexOf(keyword) === -1) return false

      return true
    })
  },

  // ============================
  // 筛选 + 渲染
  // ============================
  _applyFiltersAndRender(targetPage) {
    var filtered = this._filterCars(this._allCars)
    var start = (targetPage - 1) * PAGE_SIZE
    var pageCars = filtered.slice(start, start + PAGE_SIZE)
    var carList = pageCars.map(this._buildCardData.bind(this))

    this.setData({
      totalCount: filtered.length,
      carList: carList,
      page: targetPage,
      hasMore: start + PAGE_SIZE < filtered.length,
      loadingMore: false
    })
  },

  // ============================
  // 加载更多页
  // ============================
  _loadMorePage() {
    var filtered = this._filterCars(this._allCars)
    var start = this.data.carList.length
    var moreCars = filtered.slice(start, start + PAGE_SIZE)

    if (moreCars.length === 0) {
      this.setData({ hasMore: false, loadingMore: false })
      return
    }

    this.setData({ loadingMore: true })

    var carList = this.data.carList.concat(
      moreCars.map(this._buildCardData.bind(this))
    )

    this.setData({
      carList: carList,
      page: this.data.page + 1,
      hasMore: start + PAGE_SIZE < filtered.length,
      loadingMore: false
    })
  },

  // ============================
  // 卡片数据组装
  // ============================
  _buildCardData(car) {
    var plate = car.plate || ''
    var stats = this._orderStats[plate] || {}
    var isMember = !!this._memberMap[plate]

    return {
      plate: plate,
      ownerName: car.ownerName || '未填写',
      phone: util.maskPhone(car.phone),
      carType: car.carType || '未知车型',
      isMember: isMember,
      orderCount: stats.orderCount || 0,
      totalAmount: util.formatMoneySimple(stats.totalAmount || 0),
      createTime: util.formatDate(car.createTime),
      isFuel: plate.length === 7,
      isNewEnergy: plate.length === 8
    }
  },

  // ============================
  // 重置筛选条件
  // ============================
  _resetFilters() {
    this.setData({
      searchValue: '',
      filters: { member: false, nonMember: false, fuel: false, newEnergy: false },
      hasActiveFilter: false
    })
  },

  // ============================
  // 缓存工具
  // ============================
  _getCacheKey(subKey) {
    var shopPhone = app.getShopPhone()
    return 'carList_' + subKey + '_' + shopPhone
  },

  _getCache(subKey) {
    var key = this._getCacheKey(subKey)
    try {
      var data = wx.getStorageSync(key)
      if (!data || !data.time) return null
      var ttl = subKey === 'base' ? CACHE_TTL_BASE : CACHE_TTL_AGG
      if (Date.now() - data.time > ttl) return null
      return data
    } catch (e) {
      return null
    }
  },

  _setCache(subKey, data) {
    var key = this._getCacheKey(subKey)
    try {
      wx.setStorageSync(key, data)
    } catch (e) {
      console.warn('[carList] 缓存写入失败:', e)
    }
  },

  _clearCache() {
    try {
      wx.removeStorageSync(this._getCacheKey('base'))
      wx.removeStorageSync(this._getCacheKey('agg'))
    } catch (e) { }
  },

  onAddCar() {
    wx.navigateTo({ url: '/pages/carAdd/carAdd' })
  },

  onGoHome: function () {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  // 📷 车牌OCR识别（v6.1.0）
  onScanPlate() {
    var page = this
    ocrHelper.scanPlate(function (plate) {
      page.setData({ searchValue: plate })
      if (page._searchTimer) clearTimeout(page._searchTimer)
      page._searchTimer = setTimeout(page._applyFiltersAndRender.bind(page, 1), 100)
    })
  }
})
