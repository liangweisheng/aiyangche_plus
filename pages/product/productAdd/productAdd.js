// pages/product/productAdd/productAdd.js
const app = getApp()
const constants = require('../../../utils/constants')

Page({
  data: {
    name: '',
    categoryIndex: 0,
    categoryOptions: ['其他', '机油', '轮胎', '刹车系统', '空调系统', '电器', '美容保养', '传动系统', '悬挂系统', '冷却系统'],
    unitIndex: 0,
    unitOptions: ['个', '瓶', '桶', '套', '只', '根', '对', '片', '支', '盒', '袋', '包'],
    price: '',
    cost: '',
    specs: [''],
    remark: '',
    saving: false
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

  onSpecInput(e) {
    var idx = parseInt(e.currentTarget.dataset.index)
    var val = e.detail.value
    var key = 'specs[' + idx + ']'
    this.setData({ [key]: val })
  },

  onAddSpec() {
    var specs = this.data.specs.concat([''])
    this.setData({ specs: specs })
  },

  onDelSpec(e) {
    var idx = parseInt(e.currentTarget.dataset.index)
    var specs = this.data.specs.filter(function (_, i) { return i !== idx })
    this.setData({ specs: specs })
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

    var specs = page.data.specs.filter(function (s) { return s.trim() })
    page.setData({ saving: true })

    app.callFunction('repair_inventory', {
      action: 'addProduct',
      shopPhone: shopPhone,
      name: name,
      category: page.data.categoryOptions[page.data.categoryIndex],
      specs: specs,
      price: price,
      cost: Number(page.data.cost) || 0,
      unit: page.data.unitOptions[page.data.unitIndex],
      remark: page.data.remark.trim()
    }).then(function (res) {
      page.setData({ saving: false })
      if (res && res.code === 0) {
        wx.showToast({ title: '添加成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      } else {
        wx.showToast({ title: (res && res.msg) || '添加失败', icon: 'none' })
      }
    }).catch(function () {
      page.setData({ saving: false })
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  }
})
