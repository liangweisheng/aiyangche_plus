// pages/product/productTemplateImport/productTemplateImport.js
// 从模板导入商品 — 上架/下架管理（分页加载，每页100条）

const app = getApp()
const constants = require('../../../utils/constants')

Page({
  data: {
    currentCategory: '全部',
    categoryOptions: ['全部', '其他', '机油', '轮胎', '刹车系统', '空调系统', '电器车灯', '美容保养', '动力系统', '传动系统', '悬挂系统', '冷却系统'],
    templateList: [],            // 经 importStatus 过滤后展示的列表
    allLoadedTemplates: [],      // 已加载的所有模板（跨页累计，用于勾选/导入）
    shopProducts: {},            // 本店 repair_products 按 _templateId 索引
    loading: false,              // 首次加载中
    loadingPage: false,          // 翻页加载中
    page: 1,
    pageSize: 100,
    totalCount: 0,
    hasMore: false,
    keyword: '',
    searchTimer: null,
    importStatusFilter: '',      // ''=全部, imported=已导入, notImported=未导入
    selectedIds: {},
    selectedCount: 0,
    filteredCount: 0,
    selectableCount: 0,
    allSelected: false,
    batchLoading: false
  },

  onLoad() {
    if (!app.checkPageAccess('admin')) return
    this.loadData()
  },

  /** 加载本店商品索引 + 模板第1页 */
  loadData() {
    var page = this
    var shopPhone = app.getShopPhone()
    page.setData({ loading: true, allLoadedTemplates: [], templateList: [] })

    // 先加载本店商品索引，再加载模板第1页
    app.callFunction('repair_inventory', {
      action: 'listProducts',
      shopPhone: shopPhone,
      pageSize: 500
    }).then(function (prodRes) {
      var shopIndex = {}
      if (prodRes && prodRes.code === 0 && prodRes.data) {
        var products = prodRes.data.list || []
        products.forEach(function (p) {
          if (p._templateId) {
            shopIndex[p._templateId] = {
              _id: p._id,
              productStatus: p.productStatus || 'on_shelf',
              price: p.price,
              stock: p.stock || 0
            }
          }
        })
      }
      page.setData({ shopProducts: shopIndex })
      page._loadPage(1)
    }).catch(function (err) {
      console.error('加载本店商品失败', err)
      page._loadPage(1)
    })
  },

  /** 加载指定页码的模板列表 */
  _loadPage(n) {
    var page = this
    var cat = page.data.currentCategory
    var kw = page.data.keyword.trim()
    page.setData({ loadingPage: true })

    app.callFunction('repair_inventory', {
      action: 'listTemplateProducts',
      category: cat,
      keyword: kw || undefined,
      page: n,
      pageSize: page.data.pageSize
    }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        var newItems = (res.data.list || []).map(function (t) {
          var shop = page.data.shopProducts[t._id]
          return {
            _id: t._id,
            name: t.name,
            category: t.category || '其他',
            specs: t.specs || [],
            price: t.price || 0,
            cost: t.cost || 0,
            unit: t.unit || '个',
            remark: t.remark || '',
            sortOrder: t.sortOrder || 0,
            isImported: !!shop,
            shopProductId: shop ? shop._id : '',
            importedPrice: shop ? shop.price : 0,
            stock: shop ? shop.stock : 0
          }
        })

        var allLoaded = page.data.allLoadedTemplates
        var totalCount = res.data.total || 0

        if (n === 1) {
          allLoaded = newItems
        } else {
          // 追加，去重
          var existingIds = {}
          allLoaded.forEach(function (t) { existingIds[t._id] = true })
          newItems.forEach(function (t) {
            if (!existingIds[t._id]) {
              allLoaded.push(t)
              existingIds[t._id] = true
            }
          })
        }

        var hasMore = allLoaded.length < totalCount

        page.setData({
          allLoadedTemplates: allLoaded,
          page: n,
          totalCount: totalCount,
          hasMore: hasMore,
          loadingPage: false,
          loading: false
        })
        page.filterTemplates()
      } else {
        page.setData({ loadingPage: false, loading: false })
      }
    }).catch(function (err) {
      console.error('加载模板列表失败', err)
      page.setData({ loadingPage: false, loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /** 滚动到底部或点击加载更多 */
  loadMore() {
    if (this.data.loadingPage || !this.data.hasMore) return
    this._loadPage(this.data.page + 1)
  },

  /** 按导入状态过滤 + 排序（分类/关键词已由服务端处理） */
  filterTemplates() {
    var list = this.data.allLoadedTemplates
    var st = this.data.importStatusFilter

    if (st === 'imported') {
      list = list.filter(function (t) { return t.isImported })
    } else if (st === 'notImported') {
      list = list.filter(function (t) { return !t.isImported })
    }

    // 默认排序：未导入在前、已导入在后
    if (!st) {
      list = [].concat(list).sort(function (a, b) {
        if (a.isImported !== b.isImported) {
          return a.isImported ? 1 : -1
        }
        return 0
      })
    }

    this.setData({ templateList: list })
    this._recalcSelected(list)
  },

  /** 切换分类 */
  onCategoryTap(e) {
    this.setData({ currentCategory: e.currentTarget.dataset.cat })
    this._loadPage(1)
  },

  /** 切换导入状态筛选 */
  onImportStatusTap(e) {
    this.setData({ importStatusFilter: e.currentTarget.dataset.status || '' })
    this.filterTemplates()
  },

  /** 搜索输入（防抖） */
  onSearchInput(e) {
    var page = this
    var val = e.detail.value
    this.setData({ keyword: val })
    if (page.data.searchTimer) clearTimeout(page.data.searchTimer)
    page.data.searchTimer = setTimeout(function () {
      page.setData({ allLoadedTemplates: [], templateList: [] })
      page._loadPage(1)
    }, 400)
  },

  /** 导入单个模板商品 */
  onImportTemplate(e) {
    var page = this
    var templateId = e.currentTarget.dataset.id
    var template = page._findTemplate(templateId)
    if (!template) return
    if (template.isImported || template.importing) return

    wx.showModal({
      title: '导入商品',
      content: '确认将"' + template.name + '"导入到本店商品库？',
      success: function (res) {
        if (!res.confirm) return
        page._doImport(template)
      }
    })
  },

  _doImport(template) {
    var page = this
    page._setTemplateImporting(template._id, true)

    app.callFunction('repair_inventory', {
      action: 'importTemplateProduct',
      shopPhone: app.getShopPhone(),
      templateId: template._id
    }).then(function (res) {
      page._setTemplateImporting(template._id, false)
      if (res && res.code === 0) {
        page._markImported(template._id)
        wx.showToast({ title: '导入成功', icon: 'success' })
      } else {
        wx.showToast({ title: (res && res.msg) || '导入失败', icon: 'none' })
      }
    }).catch(function () {
      page._setTemplateImporting(template._id, false)
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  },

  /** 勾选/取消勾选 */
  onToggleSelect(e) {
    var templateId = e.currentTarget.dataset.id
    if (!templateId) return
    var template = this._findTemplate(templateId)
    if (!template) return

    var selectedIds = Object.assign({}, this.data.selectedIds)
    if (selectedIds[templateId]) {
      delete selectedIds[templateId]
    } else {
      if (template.isImported) {
        wx.showToast({ title: '该商品已导入无需再次导入', icon: 'none' })
      }
      selectedIds[templateId] = true
    }
    this.setData({ selectedIds: selectedIds })
    this._recalcSelected()
  },

  /** 全选/取消全选 */
  onSelectAllTap() {
    var templateList = this.data.templateList
    var allSelected = this.data.allSelected
    var selectedIds = Object.assign({}, this.data.selectedIds)

    if (allSelected) {
      templateList.forEach(function (t) { delete selectedIds[t._id] })
    } else {
      templateList.forEach(function (t) {
        if (!t.isImported) selectedIds[t._id] = true
      })
    }
    this.setData({ selectedIds: selectedIds })
    this._recalcSelected()
  },

  /** 批量导入勾选的模板商品 */
  onBatchImport() {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    // 从 allLoadedTemplates 收集勾选且未导入的模板ID
    var templateIds = []
    var selectedIds = page.data.selectedIds
    var allLoaded = page.data.allLoadedTemplates
    allLoaded.forEach(function (t) {
      if (selectedIds[t._id] && !t.isImported) {
        templateIds.push(t._id)
      }
    })

    if (templateIds.length === 0) {
      wx.showToast({ title: '请选择未导入的模板商品', icon: 'none' })
      return
    }

    wx.showModal({
      title: '批量导入',
      content: '确认将选中的 ' + templateIds.length + ' 个模板商品导入到本店商品库？',
      success: function (res) {
        if (!res.confirm) return
        page.setData({ batchLoading: true })
        app.callFunction('repair_inventory', {
          action: 'batchImportTemplates',
          shopPhone: shopPhone,
          templateIds: templateIds
        }).then(function (res) {
          page.setData({ batchLoading: false, selectedIds: {}, selectedCount: 0 })
          if (res && res.code === 0) {
            wx.showToast({ title: '导入完成', icon: 'success' })
            page.loadData()
          } else {
            wx.showToast({ title: (res && res.msg) || '导入失败', icon: 'none' })
          }
        }).catch(function () {
          page.setData({ batchLoading: false })
          wx.showToast({ title: '网络异常', icon: 'none' })
        })
      }
    })
  },

  /** 跳转新建商品页面 */
  onGoProductAdd() {
    wx.navigateTo({ url: '/pages/product/productAdd/productAdd' })
  },

  /** 跳转创建模板商品页面 */
  onGoCreateTemplate() {
    var page = this
    wx.showModal({
      title: '创建模板商品',
      content: '请输入管理密码',
      editable: true,
      placeholderText: '请输入管理密码',
      success: function (res) {
        if (!res.confirm) return
        if (res.content === '17807725166') {
          wx.navigateTo({ url: '/pages/product/productTemplateAdmin/productTemplateAdmin' })
        } else {
          wx.showToast({ title: '密码错误', icon: 'none' })
        }
      }
    })
  },

  /** 点击编辑按钮 */
  onEditTemplate(e) {
    var page = this
    var templateId = e.currentTarget.dataset.id
    if (!templateId) return
    wx.showModal({
      title: '编辑模板商品',
      content: '请输入管理密码',
      editable: true,
      placeholderText: '请输入管理密码',
      success: function (res) {
        if (!res.confirm) return
        if (res.content === '17807725166') {
          wx.navigateTo({ url: '/pages/product/productTemplateAdmin/productTemplateAdmin?id=' + templateId })
        } else {
          wx.showToast({ title: '密码错误', icon: 'none' })
        }
      }
    })
  },

  // ========== 辅助方法 ==========

  _findTemplate(templateId) {
    var all = this.data.allLoadedTemplates
    for (var i = 0; i < all.length; i++) {
      if (all[i]._id === templateId) return all[i]
    }
    return null
  },

  _recalcSelected(list) {
    var templateList = list || this.data.templateList
    var selectedIds = this.data.selectedIds
    var selectedCount = 0
    var selectableCount = 0

    templateList.forEach(function (t) {
      if (!t.isImported) {
        selectableCount++
        if (selectedIds[t._id]) selectedCount++
      }
    })

    var allSelected = selectableCount > 0 && selectedCount === selectableCount
    this.setData({
      selectedCount: selectedCount,
      filteredCount: templateList.length,
      selectableCount: selectableCount,
      allSelected: allSelected
    })
  },

  _setTemplateImporting(templateId, val) {
    var all = this.data.allLoadedTemplates.map(function (t) {
      if (t._id === templateId) t.importing = val
      return t
    })
    this.setData({ allLoadedTemplates: all })
    this.filterTemplates()
  },

  _markImported(templateId) {
    var all = this.data.allLoadedTemplates.map(function (t) {
      if (t._id === templateId) {
        t.isImported = true
        t.importing = false
      }
      return t
    })
    this.setData({ allLoadedTemplates: all })
    this.filterTemplates()
  }
})
