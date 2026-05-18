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
    searchTimer: null
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

  /** 按分类/搜索过滤 */
  filterTemplates() {
    var list = this.data.rawTemplates
    var cat = this.data.currentCategory
    var kw = this.data.keyword.trim().toLowerCase()

    if (cat && cat !== '全部') {
      list = list.filter(function (t) { return t.category === cat })
    }
    if (kw) {
      list = list.filter(function (t) {
        return t.name.toLowerCase().indexOf(kw) !== -1
      })
    }

    this.setData({ templateList: list })
  },

  /** 切换分类 */
  onCategoryTap(e) {
    this.setData({ currentCategory: e.currentTarget.dataset.cat })
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

  /** 批量导入所有未导入模板 */
  onBatchImport() {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    wx.showModal({
      title: '批量导入',
      content: '将导入所有未上架的商品，已上架的商品保持不变。确认批量导入？',
      success: function (res) {
        if (!res.confirm) return
        page.setData({ batchLoading: true })
        app.callFunction('repair_inventory', {
          action: 'batchImportTemplates',
          shopPhone: shopPhone
        }).then(function (res) {
          page.setData({ batchLoading: false })
          if (res && res.code === 0) {
            var msg = res.msg || '导入完成'
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

  // ========== 辅助方法 ==========

  _findTemplate(templateId) {
    var raw = this.data.rawTemplates
    for (var i = 0; i < raw.length; i++) {
      if (raw[i]._id === templateId) return raw[i]
    }
    return null
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
