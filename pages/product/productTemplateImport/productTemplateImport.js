// pages/product/productTemplateImport/productTemplateImport.js
// 从模板导入商品 — 上架/下架管理

const app = getApp()
const constants = require('../../../utils/constants')

Page({
  data: {
    currentCategory: '全部',
    categoryOptions: ['全部', '其他', '机油', '轮胎', '刹车系统', '空调系统', '电器', '美容保养', '传动系统', '悬挂系统', '冷却系统'],
    templateList: [],       // 当前分类/搜索过滤后的模板列表
    rawTemplates: [],       // 所有模板（原始数据）
    shopProducts: {},       // 本店 repair_products 按 _templateId 索引
    loading: false,
    importing: false,
    batchLoading: false,
    keyword: '',
    searchTimer: null,
    importStatusFilter: '',  // ''=全部, imported=已导入, notImported=未导入
    selectedIds: {},         // 勾选的模板ID { [templateId]: true }
    selectedCount: 0,        // 当前列表中已勾选数量
    filteredCount: 0,        // 当前过滤列表总数量
    selectableCount: 0,      // 当前列表中可勾选（未导入）数量
    allSelected: false       // 是否全选（当前列表中所有未导入项都已勾选）
  },

  onLoad() {
    // 拦截店员访问
    if (!app.checkPageAccess('admin')) return
    this.loadData()
  },

  /** 加载模板列表 + 本店已导入商品 */
  loadData() {
    var page = this
    var shopPhone = app.getShopPhone()
    page.setData({ loading: true })

    // 并行请求：模板列表 + 本店商品
    Promise.all([
      // 1. 获取模板列表
      app.callFunction('repair_inventory', { action: 'listTemplateProducts' }),
      // 2. 获取本店已导入商品（含 _templateId 的）
      app.callFunction('repair_inventory', {
        action: 'listProducts',
        shopPhone: shopPhone,
        pageSize: 500
      })
    ]).then(function (results) {
      var tmplRes = results[0]
      var prodRes = results[1]
      var templates = []
      var shopIndex = {}

      if (tmplRes && tmplRes.code === 0 && tmplRes.data) {
        templates = tmplRes.data.list || []
      }

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

      // 装饰模板列表：标记是否已导入
      var decorated = templates.map(function (t) {
        var shop = shopIndex[t._id]
        return {
          _id: t._id,
          name: t.name,
          category: t.category || '其他',
          specs: t.specs || [],
          price: t.price || 0,
          cost: t.cost || 0,
          unit: t.unit || '个',
          remark: t.remark || '',
          isImported: !!shop,                   // 是否已导入到本店
          shopProductId: shop ? shop._id : '',   // 本店商品ID
          importedPrice: shop ? shop.price : 0,  // 本店售价
          stock: shop ? shop.stock : 0
        }
      })

      page.setData({
        rawTemplates: decorated,
        loading: false
      })
      page.filterTemplates()
    }).catch(function (err) {
      console.error('加载模板数据失败', err)
      page.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  /** 按分类/导入状态/搜索过滤 */
  filterTemplates() {
    var list = this.data.rawTemplates
    var cat = this.data.currentCategory
    var kw = this.data.keyword.trim().toLowerCase()
    var st = this.data.importStatusFilter

    if (cat && cat !== '全部') {
      list = list.filter(function (t) { return t.category === cat })
    }
    // 导入状态筛选（与分类可组合为多条件）
    if (st === 'imported') {
      list = list.filter(function (t) { return t.isImported })
    } else if (st === 'notImported') {
      list = list.filter(function (t) { return !t.isImported })
    }
    if (kw) {
      list = list.filter(function (t) {
        return t.name.toLowerCase().indexOf(kw) !== -1
      })
    }

    this.setData({ templateList: list })
    this._recalcSelected(list)
  },

  /** 切换分类 */
  onCategoryTap(e) {
    this.setData({ currentCategory: e.currentTarget.dataset.cat })
    this.filterTemplates()
  },

  /** 切换导入状态筛选（全部/已导入/未导入） */
  onImportStatusTap(e) {
    this.setData({ importStatusFilter: e.currentTarget.dataset.status || '' })
    this.filterTemplates()
  },

  /** 搜索输入 */
  onSearchInput(e) {
    var page = this
    var val = e.detail.value
    this.setData({ keyword: val })
    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
    }
    page.data.searchTimer = setTimeout(function () {
      page.filterTemplates()
    }, 400)
  },

  /** 导入模板商品 */
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

  /** 执行导入操作 */
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

  /** 勾选/取消勾选某个模板 */
  onToggleSelect(e) {
    var templateId = e.currentTarget.dataset.id
    if (!templateId) return
    var template = this._findTemplate(templateId)
    if (!template) return

    // 已导入的模板显示提示但不阻止勾选（导入时会过滤掉）
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

  /** 全选/取消全选切换 */
  onSelectAllTap() {
    var templateList = this.data.templateList
    var allSelected = this.data.allSelected
    var selectedIds = Object.assign({}, this.data.selectedIds)

    if (allSelected) {
      // 取消全选：清除当前列表所有项
      templateList.forEach(function (t) {
        delete selectedIds[t._id]
      })
    } else {
      // 全选：选择当前列表中所有未导入项
      templateList.forEach(function (t) {
        if (!t.isImported) {
          selectedIds[t._id] = true
        }
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

    // 收集勾选且未导入的模板ID
    var templateIds = []
    var selectedIds = page.data.selectedIds
    var raw = page.data.rawTemplates
    raw.forEach(function (t) {
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
            // 重新加载数据
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

  /** 跳转创建模板商品页面（密码验证） */
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

  /** 点击编辑按钮 → 编辑模板商品（需密码验证） */
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
    var raw = this.data.rawTemplates
    for (var i = 0; i < raw.length; i++) {
      if (raw[i]._id === templateId) return raw[i]
    }
    return null
  },

  /** 重算当前列表的勾选统计 */
  _recalcSelected(list) {
    var templateList = list || this.data.templateList
    var selectedIds = this.data.selectedIds
    var selectedCount = 0
    var selectableCount = 0

    templateList.forEach(function (t) {
      if (!t.isImported) {
        selectableCount++
        if (selectedIds[t._id]) {
          selectedCount++
        }
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
    var raw = this.data.rawTemplates.map(function (t) {
      if (t._id === templateId) t.importing = val
      return t
    })
    this.setData({ rawTemplates: raw })
    this.filterTemplates()
  },

  _markImported(templateId) {
    var raw = this.data.rawTemplates.map(function (t) {
      if (t._id === templateId) {
        t.isImported = true
        t.importing = false
      }
      return t
    })
    this.setData({ rawTemplates: raw })
    this.filterTemplates()
  }
})
