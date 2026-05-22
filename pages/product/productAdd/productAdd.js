// pages/product/productAdd/productAdd.js
const app = getApp()
const constants = require('../../../utils/constants')

Page({
  data: {
    isEdit: false,
    editProductId: '',
    name: '',
    categoryIndex: 0,
    categoryOptions: ['其他', '机油', '轮胎', '刹车系统', '空调系统', '电器车灯', '美容保养', '动力系统', '传动系统', '悬挂系统', '冷却系统'],
    unitIndex: 0,
    unitOptions: ['个', '瓶', '桶', '套', '只', '根', '对', '片', '支', '盒', '袋', '包'],
    price: '',
    cost: '',
    specRows: [{ name: '', cost: '', price: '' }],
    showSpecSection: false,
    remark: '',
    saving: false
  },

  onToggleSpecSection() {
    this.setData({ showSpecSection: !this.data.showSpecSection })
  },

  onLoad(options) {
    // 拦截店员访问
    if (!app.checkPageAccess('admin')) return
    var editId = options.id || ''
    if (editId) {
      this.setData({ isEdit: true, editProductId: editId })
      wx.setNavigationBarTitle({ title: '编辑商品' })
      this._loadProduct(editId)
    }
  },

  _loadProduct(productId) {
    var page = this
    var shopPhone = app.getShopPhone()
    wx.showLoading({ title: '加载中...' })
    app.callFunction('repair_inventory', {
      action: 'getProductDetail',
      productId: productId,
      shopPhone: shopPhone
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0 && res.data) {
        var p = res.data
        var catIdx = page.data.categoryOptions.indexOf(p.category)
        if (catIdx < 0) catIdx = 0
        var unitIdx = page.data.unitOptions.indexOf(p.unit)
        if (unitIdx < 0) unitIdx = 0
        page.setData({
          name: p.name || '',
          categoryIndex: catIdx,
          unitIndex: unitIdx,
          price: String(p.price || ''),
          cost: String(p.cost || ''),
          specRows: (p.specs && p.specs.length > 0)
            ? p.specs.map(function (s, idx) {
                var sp = p.specPrice && p.specPrice[idx] ? p.specPrice[idx] : {}
                var sc = p.specCost && p.specCost[idx] ? p.specCost[idx] : {}
                return {
                  name: s,
                  cost: String(sc.cost || ''),
                  price: String(sp.price || '')
                }
              })
            : [{ name: '', cost: '', price: '' }],
          showSpecSection: !!(p.specs && p.specs.length > 0 && p.specs[0]),
          remark: p.remark || ''
        })
      } else {
        wx.showToast({ title: '商品不存在', icon: 'none' })
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
    var shopPhone = app.getShopPhone()
    if (!shopPhone) {
      wx.showToast({ title: '未获取到门店信息', icon: 'none' })
      return
    }

    var validRows = page.data.specRows.filter(function (r) { return r.name.trim() })
    // 构建 specs / specPrice / specCost 数组
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

    page.setData({ saving: true })

    var action = page.data.isEdit ? 'updateProduct' : 'addProduct'
    var params = {
      action: action,
      shopPhone: shopPhone,
      name: name,
      category: page.data.categoryOptions[page.data.categoryIndex],
      specs: specs,
      specPrice: specPrice,
      specCost: specCost,
      price: price,
      cost: Number(page.data.cost) || 0,
      unit: page.data.unitOptions[page.data.unitIndex],
      remark: page.data.remark.trim()
    }
    if (page.data.isEdit) {
      params.productId = page.data.editProductId
    }

    app.callFunction('repair_inventory', params).then(function (res) {
      page.setData({ saving: false })
      if (res && res.code === 0) {
        wx.showToast({ title: page.data.isEdit ? '保存成功' : '添加成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      } else {
        wx.showToast({ title: (res && res.msg) || (page.data.isEdit ? '保存失败' : '添加失败'), icon: 'none' })
      }
    }).catch(function () {
      page.setData({ saving: false })
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  }
})
