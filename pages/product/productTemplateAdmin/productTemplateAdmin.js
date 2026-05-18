// pages/product/productTemplateAdmin/productTemplateAdmin.js
// 创建/编辑模板商品

const app = getApp()

Page({
  data: {
    isEdit: false,
    editTemplateId: '',
    name: '',
    categoryIndex: 0,
    categoryOptions: ['其他', '机油', '轮胎', '刹车系统', '空调系统', '电器', '美容保养', '传动系统', '悬挂系统', '冷却系统'],
    unitIndex: 0,
    unitOptions: ['个', '瓶', '桶', '套', '只', '根', '对', '片', '支', '盒', '袋', '包'],
    price: '',
    cost: '',
    sortOrder: '',
    specRows: [{ name: '', cost: '', price: '' }],
    showSpecSection: false,
    remark: '',
    saving: false
  },

  onToggleSpecSection() {
    this.setData({ showSpecSection: !this.data.showSpecSection })
  },

  onLoad(options) {
    // 拦截非管理员访问（模板商品只有管理员可创建/编辑）
    if (!app.checkPageAccess('admin')) return
    var editId = options.id || ''
    if (editId) {
      this.setData({ isEdit: true, editTemplateId: editId })
      wx.setNavigationBarTitle({ title: '编辑模板商品' })
      this._loadTemplate(editId)
    } else {
      wx.setNavigationBarTitle({ title: '创建模板商品' })
    }
  },

  _loadTemplate(templateId) {
    var page = this
    wx.showLoading({ title: '加载中...' })
    app.callFunction('repair_inventory', {
      action: 'getTemplateProductDetail',
      templateId: templateId
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0 && res.data) {
        var t = res.data
        var catIdx = page.data.categoryOptions.indexOf(t.category)
        if (catIdx < 0) catIdx = 0
        var unitIdx = page.data.unitOptions.indexOf(t.unit)
        if (unitIdx < 0) unitIdx = 0
        page.setData({
          name: t.name || '',
          categoryIndex: catIdx,
          unitIndex: unitIdx,
          price: String(t.price || ''),
          cost: String(t.cost || ''),
          sortOrder: String(t.sortOrder || ''),
          specRows: (t.specs && t.specs.length > 0)
            ? t.specs.map(function (s, idx) {
                var sp = t.specPrice && t.specPrice[idx] ? t.specPrice[idx] : {}
                var sc = t.specCost && t.specCost[idx] ? t.specCost[idx] : {}
                return {
                  name: s,
                  cost: String(sc.cost || ''),
                  price: String(sp.price || '')
                }
              })
            : [{ name: '', cost: '', price: '' }],
          showSpecSection: !!(t.specs && t.specs.length > 0 && t.specs[0]),
          remark: t.remark || ''
        })
      } else {
        wx.showToast({ title: '模板不存在', icon: 'none' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  onInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  onCategoryChange(e) {
    this.setData({ categoryIndex: parseInt(e.detail.value) })
  },

  onUnitChange(e) {
    this.setData({ unitIndex: parseInt(e.detail.value) })
  },

  onSpecRowInput(e) {
    var idx = parseInt(e.currentTarget.dataset.index)
    var field = e.currentTarget.dataset.field
    var val = e.detail.value
    var key = 'specRows[' + idx + '].' + field
    this.setData({ [key]: val })
  },

  onAddSpec() {
    var rows = this.data.specRows.concat([{ name: '', cost: '', price: '' }])
    this.setData({ specRows: rows })
  },

  onDelSpec(e) {
    var idx = parseInt(e.currentTarget.dataset.index)
    var rows = this.data.specRows.filter(function (_, i) { return i !== idx })
    this.setData({ specRows: rows })
  },

  onSave() {
    var page = this
    var name = page.data.name.trim()
    if (!name) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' })
      return
    }
    var price = Number(page.data.price)
    if (!price || price <= 0) {
      wx.showToast({ title: '请输入有效售价', icon: 'none' })
      return
    }

    var validRows = page.data.specRows.filter(function (r) { return r.name.trim() })
    var specs = []
    var specPrice = []
    var specCost = []
    if (validRows.length > 0) {
      validRows.forEach(function (r) {
        var label = r.name.trim()
        specs.push(label)
        specPrice.push({ label: label, price: Number(r.price) || price })
        specCost.push({ label: label, cost: Number(r.cost) || 0 })
      })
    }

    var sortOrder = parseInt(page.data.sortOrder) || 0

    page.setData({ saving: true })

    var callData = {
      action: 'saveTemplateProduct',
      templateId: page.data.isEdit ? page.data.editTemplateId : '',
      name: name,
      category: page.data.categoryOptions[page.data.categoryIndex],
      specs: specs,
      specPrice: specPrice,
      specCost: specCost,
      price: price,
      cost: Number(page.data.cost) || 0,
      unit: page.data.unitOptions[page.data.unitIndex],
      sortOrder: sortOrder,
      remark: page.data.remark.trim()
    }
    app.callFunction('repair_inventory', callData).then(function (res) {
      page.setData({ saving: false })
      if (res && res.code === 0) {
        wx.showToast({ title: page.data.isEdit ? '保存成功' : '创建成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      } else {
        wx.showToast({ title: (res && res.msg) || (page.data.isEdit ? '保存失败' : '创建失败'), icon: 'none' })
      }
    }).catch(function (err) {
      page.setData({ saving: false })
      console.error('[saveTemplateProduct] catch error:', err)
      console.error('[saveTemplateProduct] err.stack:', err && err.stack)
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  }
})
