// pages/product/productDetail/productDetail.js
const app = getApp()
const util = require('../../../utils/util')
const constants = require('../../../utils/constants')

Page({
  data: {
    product: null,
    stockLogs: [],
    loadingLogs: false,
    // 触底分页
    pageLogs: 1,
    pageSizeLogs: 20,
    hasMoreLogs: false,
    totalLogs: 0,
    loadingMoreLogs: false,
    // 库存流水筛选
    showStockFilter: false,
    filterLogType: '',
    filterStartDate: '',
    filterEndDate: '',
    hasFilter: false,
    today: util.formatDate(new Date()),
    // 调整库存弹窗
    showAdjustModal: false,
    adjustQty: '',
    adjustReason: '盘盈',
    adjustReasonIndex: 0,
    adjustRemark: '',
    adjustReasons: ['盘盈', '盘亏', '退货入库', '损耗报损', '手动调整'],
    previewStock: '',
    // 多规格选择（库存调整弹窗）
    adjustSpec: '',
    adjustSpecIndex: 0,
    adjustSpecOptions: [],
    adjustCurrentStock: 0,
    // 常量引用
    constants: constants
  },
  util: util,
  _currentProductId: '',
  _currentFilterParams: null,

  onLoad(options) {
    // 拦截店员访问
    if (!app.checkPageAccess('admin')) return
    var id = options.id || ''
    if (id) {
      this._currentProductId = id
      this.loadProduct(id)
      this._currentFilterParams = {}
      this.loadStockLogs(id, {}, false)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
    }
  },

  loadProduct(productId) {
    var page = this
    var shopPhone = app.getShopPhone()
    app.callFunction('repair_inventory', {
      action: 'getProductDetail',
      productId: productId,
      shopPhone: shopPhone
    }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        var p = res.data
        // 预计算规格库存/价格展示数据
        if (p.specs && p.specs.length > 0) {
          var specStockMap = {}
          ;(p.specStock || []).forEach(function (s) { specStockMap[s.label] = s.stock || 0 })
          var specPriceMap = {}
          ;(p.specPrice || []).forEach(function (s) { specPriceMap[s.label] = s.price })
          var specCostMap = {}
          ;(p.specCost || []).forEach(function (s) { specCostMap[s.label] = s.cost })
          p._specDetails = p.specs.map(function (label) {
            return {
              label: label,
              stock: specStockMap[label] || 0,
              price: specPriceMap[label] || p.price || 0,
              cost: specCostMap[label] || p.cost || 0
            }
          })
        }
        page.setData({ product: p })
        wx.setNavigationBarTitle({ title: p.name })
      } else {
        wx.showToast({ title: '商品不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      }
    }).catch(function () {
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  // 加载出入库流水（支持触底分页）
  // append=true 时加载下一页追加到列表末尾，否则重置到第 1 页
  loadStockLogs(productId, filterParams, append) {
    var page = this
    var shopPhone = app.getShopPhone()
    filterParams = filterParams || {}
    append = !!append

    var currentPage = append ? page.data.pageLogs + 1 : 1
    var pageSize = page.data.pageSizeLogs

    // 保存筛选条件供翻页时复用
    if (!append) {
      this._currentFilterParams = filterParams
      page.setData({ loadingLogs: true })
    } else {
      page.setData({ loadingMoreLogs: true })
    }

    var params = {
      action: 'getStockLogs',
      productId: productId,
      shopPhone: shopPhone,
      page: currentPage,
      pageSize: pageSize
    }
    // 传递筛选参数
    if (filterParams.logType) params.logType = filterParams.logType
    if (filterParams.startDate) params.startDate = filterParams.startDate
    if (filterParams.endDate) params.endDate = filterParams.endDate

    app.callFunction('repair_inventory', params).then(function (res) {
      page.setData({ loadingLogs: false, loadingMoreLogs: false })
      if (res && res.code === 0 && res.data) {
        var newLogs = (res.data.list || []).map(function (item) {
          item._displayTime = util.formatDateTime(item.createTime)
          return item
        })
        var total = res.data.total || 0
        var hasMore = (currentPage * pageSize) < total
        if (append) {
          page.setData({
            stockLogs: page.data.stockLogs.concat(newLogs),
            pageLogs: currentPage,
            hasMoreLogs: hasMore,
            totalLogs: total
          })
        } else {
          page.setData({
            stockLogs: newLogs,
            pageLogs: 1,
            hasMoreLogs: newLogs.length < total && newLogs.length > 0,
            totalLogs: total
          })
        }
      }
    }).catch(function () {
      page.setData({ loadingLogs: false, loadingMoreLogs: false })
    })
  },

  // 触底加载更多
  onReachBottom() {
    if (!this.data.hasMoreLogs || this.data.loadingMoreLogs || this.data.loadingLogs) return
    this.loadStockLogs(this._currentProductId, this._currentFilterParams, true)
  },

  // ========== 出入库流水筛选 ==========

  // 切换筛选弹窗
  onToggleStockFilter() {
    this.setData({ showStockFilter: !this.data.showStockFilter })
  },

  // 关闭筛选弹窗（遮罩点击）
  onCloseStockFilter() {
    this.setData({ showStockFilter: false })
  },

  // 选择流水类型（点击切换选中/取消）
  onSelectLogType(e) {
    var val = e.currentTarget.dataset.value
    this.setData({ filterLogType: this.data.filterLogType === val ? '' : val })
  },

  // 选择开始日期
  onFilterStartDate(e) {
    this.setData({ filterStartDate: e.detail.value })
  },

  // 选择结束日期
  onFilterEndDate(e) {
    this.setData({ filterEndDate: e.detail.value })
  },

  // 取消筛选（关闭弹窗，不清除已选条件）
  onCancelStockFilter() {
    this.setData({ showStockFilter: false })
  },

  // 重置筛选条件
  onResetStockFilter() {
    this.setData({
      filterLogType: '',
      filterStartDate: '',
      filterEndDate: '',
      hasFilter: false,
      showStockFilter: false
    })
    this.loadStockLogs(this._currentProductId, {}, false)
  },

  // 确认筛选
  onConfirmStockFilter() {
    var filterParams = {}
    if (this.data.filterLogType) filterParams.logType = this.data.filterLogType
    if (this.data.filterStartDate) filterParams.startDate = this.data.filterStartDate
    if (this.data.filterEndDate) filterParams.endDate = this.data.filterEndDate
    var hasFilter = !!(filterParams.logType || filterParams.startDate || filterParams.endDate)
    this.setData({ showStockFilter: false, hasFilter: hasFilter })
    this.loadStockLogs(this._currentProductId, filterParams, false)
  },

  // ========== 库存调整 ==========

  onOpenAdjust() {
    var page = this
    if (!page.data.product) return
    var product = page.data.product
    var hasSpecs = product.specs && product.specs.length > 0
    var initData = {
      showAdjustModal: true,
      adjustQty: '',
      adjustReason: '盘盈',
      adjustReasonIndex: 0,
      adjustRemark: '',
      previewStock: ''
    }
    if (hasSpecs) {
      initData.adjustSpecOptions = product.specs
      initData.adjustSpecIndex = 0
      initData.adjustSpec = product.specs[0]
      var specStockMap = {}
      ;(product.specStock || []).forEach(function (s) { specStockMap[s.label] = s.stock || 0 })
      initData.adjustCurrentStock = specStockMap[product.specs[0]] || 0
    } else {
      initData.adjustSpecOptions = []
      initData.adjustSpecIndex = 0
      initData.adjustSpec = ''
      initData.adjustCurrentStock = product.stock || 0
    }
    page.setData(initData)
  },

  onCloseAdjust() {
    this.setData({ showAdjustModal: false })
  },

  onAdjustModalTap() {
    // 阻止冒泡到遮罩层
  },

  preventTouchMove() {
    // 阻止遮罩层 touchmove 事件
  },

  // ========== 编辑商品 ==========

  // 判断当前用户是否为管理员（编辑按钮可见性由 JS 控制）
  _isAdmin: function () {
    try {
      var userInfo = wx.getStorageSync('userInfo') || {}
      return userInfo.role === 'admin' || !userInfo.role
    } catch (e) {
      return true
    }
  },

  onEditProduct() {
    var product = this.data.product
    if (!product || !product._id) return
    wx.navigateTo({ url: '/pages/product/productAdd/productAdd?id=' + product._id })
  },

  /** 上架/下架切换 */
  onToggleShelf() {
    var page = this
    var product = page.data.product
    if (!product || !product._id) return

    var newStatus = product.productStatus === 'on_shelf' ? 'off_shelf' : 'on_shelf'
    var actionText = newStatus === 'on_shelf' ? '上架' : '下架'

    wx.showModal({
      title: '确认' + actionText,
      content: actionText === '下架' ?
        '下架后该商品将不出现在开单选择列表中，确认下架？' :
        '确认上架该商品？',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: actionText + '中...' })
        app.callFunction('repair_inventory', {
          action: 'toggleProductStatus',
          shopPhone: app.getShopPhone(),
          productId: product._id,
          status: newStatus
        }).then(function (res) {
          wx.hideLoading()
          if (res && res.code === 0) {
            wx.showToast({ title: '已' + actionText, icon: 'success' })
            page.loadProduct(product._id)
          } else {
            wx.showToast({ title: (res && res.msg) || '操作失败', icon: 'none' })
          }
        }).catch(function () {
          wx.hideLoading()
          wx.showToast({ title: '网络异常', icon: 'none' })
        })
      }
    })
  },

  onStopPropagation() {
    // 通用阻止事件冒泡（用于筛选弹窗等）
  },

  // ========== 流水跳转 ==========

  /** 点击流水记录跳转详情 */
  onLogTap(e) {
    var dataset = e.currentTarget.dataset
    var logId = dataset.id
    var logType = dataset.type
    var orderRef = dataset.orderref

    if (logType === 'out' && orderRef) {
      // 出库流水：跳转工单详情
      wx.navigateTo({ url: '/pages/orderDetail/orderDetail?id=' + orderRef })
    } else if (logId) {
      // 入库/调整流水：跳转通用流水详情页
      wx.navigateTo({ url: '/pages/product/productStockLogDetail/productStockLogDetail?id=' + logId })
    }
  },

  onAdjustQtyInput(e) {
    var val = e.detail.value
    // 只允许数字和小数点
    var filtered = val.replace(/[^0-9.]/g, '')
    // 确保只有一个小数点
    var parts = filtered.split('.')
    if (parts.length > 2) {
      filtered = parts[0] + '.' + parts.slice(1).join('')
    }
    this.setData({ adjustQty: filtered })
    this._updatePreviewStock(filtered)
  },

  onAdjustReasonChange(e) {
    var idx = parseInt(e.detail.value) || 0
    this.setData({
      adjustReasonIndex: idx,
      adjustReason: this.data.adjustReasons[idx]
    })
    this._updatePreviewStock()
  },

  onAdjustSpecChange(e) {
    var idx = parseInt(e.detail.value) || 0
    var product = this.data.product
    if (!product || !product.specs) return
    var label = product.specs[idx]
    var specStockMap = {}
    ;(product.specStock || []).forEach(function (s) { specStockMap[s.label] = s.stock || 0 })
    this.setData({
      adjustSpecIndex: idx,
      adjustSpec: label,
      adjustCurrentStock: specStockMap[label] || 0,
      adjustQty: '',
      previewStock: ''
    })
  },

  _updatePreviewStock(qtyStr) {
    qtyStr = qtyStr !== undefined ? qtyStr : this.data.adjustQty
    var targetStock = Number(qtyStr) || 0
    var currentStock = this.data.adjustCurrentStock
    var diff = targetStock - currentStock
    var sign = diff > 0 ? '+' : ''
    var unit = this.data.product ? (this.data.product.unit || '') : ''
    this.setData({
      previewStock: sign + diff + (unit ? ' ' + unit : '')
    })
  },

  onAdjustRemarkInput(e) {
    this.setData({ adjustRemark: e.detail.value })
  },

  onAdjustConfirm() {
    var page = this
    var qtyStr = page.data.adjustQty.trim()
    if (!qtyStr || isNaN(Number(qtyStr))) {
      wx.showToast({ title: '请输入有效库存数', icon: 'none' })
      return
    }
    var targetStock = Number(qtyStr)
    var currentStock = page.data.adjustCurrentStock || (page.data.product && page.data.product.stock) || 0
    var quantity = targetStock - currentStock

    if (quantity === 0) {
      wx.showToast({ title: '库存无变化', icon: 'none' })
      return
    }

    wx.showLoading({ title: '调整中...' })
    var product = page.data.product
    var params = {
      action: 'adjustStock',
      shopPhone: app.getShopPhone(),
      productId: product._id,
      quantity: quantity,
      operator: app.getOperatorName() || '管理员',
      reason: page.data.adjustReason,
      remark: page.data.adjustRemark.trim()
    }
    // 多规格时传入选中的规格标签
    if (page.data.adjustSpec) {
      params.spec = page.data.adjustSpec
    }
    app.callFunction('repair_inventory', params).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: res.msg, icon: 'success' })
        page.setData({ showAdjustModal: false })
        // 刷新商品详情和流水（重置到第 1 页）
        page.loadProduct(product._id)
        page._currentFilterParams = {}
        page.loadStockLogs(product._id, {}, false)
      } else {
        wx.showToast({ title: (res && res.msg) || '调整失败', icon: 'none' })
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '调整失败，请重试', icon: 'none' })
    })
  }
})
