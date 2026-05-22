// pages/product/productSelect/productSelect.js
const app = getApp()

Page({
  data: {
    keyword: '',
    currentCategory: '全部',
    categoryOptions: ['全部', '其他', '机油', '轮胎', '刹车系统', '空调系统', '电器车灯', '美容保养', '动力系统', '传动系统', '悬挂系统', '冷却系统', '模板商品库'],
    productList: [],
    rawProducts: [],
    rawTemplates: [],
    selectedItems: [],
    totalAmount: 0,
    loading: false,
    templateMode: false,
    templateLoading: false,
    importingTemplateId: null,
    searchTimer: null
  },

  onLoad(options) {
    // 入库/权益核销等场景跳过库存检查
    this._skipStockCheck = (options && options.skipStockCheck === 'true') ||
      (options && options.storageKey === 'stockIn_selectedProducts')
    // 权益关联模式：跳过库存检查 + 隐藏金额合计
    this._benefitMode = options && options.mode === 'benefitSelect'
    this.setData({
      skipStockCheck: this._skipStockCheck,
      categoryOptions: this.data.categoryOptions,
      storageKey: (options && options.storageKey) || 'orderAdd_selectedProducts',
      existingKey: (options && options.existingKey) || 'orderAdd_existingProducts',
      showAll: (options && options.showAll === 'true') || false
    })
    var existingProducts = wx.getStorageSync(this.data.existingKey) || []
    this.loadProducts(existingProducts)
  },

  onSearchInput(e) {
    var page = this
    var val = e.detail.value
    this.setData({ keyword: val })
    if (page.data.searchTimer) {
      clearTimeout(page.data.searchTimer)
    }
    page.data.searchTimer = setTimeout(function () {
      page.filterProducts()
    }, 400)
  },

  onCategoryTap(e) {
    var cat = e.currentTarget.dataset.cat
    this.setData({ currentCategory: cat })
    if (cat === '模板商品库') {
      this._loadTemplateProducts()
    } else {
      this.setData({ templateMode: false, rawTemplates: [] })
      this.filterProducts()
    }
  },

  loadProducts(existingProducts) {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone) return

    page.setData({ loading: true })
    var params = {
      action: 'listProducts',
      shopPhone: shopPhone,
      pageSize: 500
    }
    // 入库模式显示所有商品（含下架），开单模式仅显示已上架
    if (!page.data.showAll) {
      params.status = 'on_shelf'
    }
    app.callFunction('repair_inventory', params).then(function (res) {
      page.setData({ loading: false })
      if (res && res.code === 0 && res.data) {
        var list = (res.data.list || []).map(function (p) {
          return page._decorateProduct(p)
        })
        page.setData({
          rawProducts: list,
          selectedItems: [],
          totalAmount: 0
        })
        // 恢复已选商品的选中状态（replace 模式）
        if (existingProducts && existingProducts.length > 0) {
          page._restoreSelection(existingProducts)
        }
        page.filterProducts()
      }
    }).catch(function () {
      page.setData({ loading: false })
    })
  },

  _decorateProduct(product) {
    // 为每个商品构建显示规格列表
    var specs = product.specs || []
    // 构建规格库存映射
    var specStockMap = {}
    ;(product.specStock || []).forEach(function (s) { specStockMap[s.label] = s.stock || 0 })
    // 构建规格价格映射
    var specPriceMap = {}
    ;(product.specPrice || []).forEach(function (s) { specPriceMap[s.label] = s.price })
    // 构建规格进价映射
    var specCostMap = {}
    ;(product.specCost || []).forEach(function (s) { specCostMap[s.label] = s.cost })
    var displaySpecs = specs.map(function (s) {
      return {
        label: s,
        quantity: 0,
        stock: specStockMap[s] || 0,
        price: specPriceMap[s] || product.price || 0,
        cost: specCostMap[s] !== undefined ? specCostMap[s] : (product.cost || 0)
      }
    })
    product.displaySpecs = displaySpecs
    product._qty = 0 // 无规格时的总数量
    return product
  },

  /** 获取指定商品/规格的库存上限 */
  _getStockLimit(pid, specLabel) {
    var products = this.data.rawProducts
    for (var i = 0; i < products.length; i++) {
      if (products[i]._id === pid) {
        if (specLabel === '') {
          return products[i].stock || 0
        } else {
          var specs = products[i].displaySpecs || []
          for (var j = 0; j < specs.length; j++) {
            if (specs[j].label === specLabel) {
              return specs[j].stock || 0
            }
          }
        }
      }
    }
    return 0
  },

  /** 恢复已选商品的选中数量（从 orderAdd 传过来的现有商品） */
  _restoreSelection(existingProducts) {
    var raw = this.data.rawProducts.map(function (p) {
      p = JSON.parse(JSON.stringify(p))
      var matchedItems = existingProducts.filter(function (ep) {
        return ep._productId === p._id
      })
      matchedItems.forEach(function (item) {
        if (item.spec) {
          // 有规格：恢复对应规格的数量
          var displaySpecs = p.displaySpecs.map(function (s) {
            if (s.label === item.spec) {
              s.quantity = item.quantity
            }
            return s
          })
          p.displaySpecs = displaySpecs
        } else {
          // 无规格
          p._qty = item.quantity
        }
      })
      return p
    })
    this.setData({ rawProducts: raw })
    this.filterProducts()
    this.updateSelectedItems()
  },

  filterProducts() {
    // 模板商品库模式：过滤 rawTemplates
    if (this.data.templateMode) {
      var keyword = this.data.keyword.trim().toLowerCase()
      var list = this.data.rawTemplates
      if (keyword) {
        list = list.filter(function (p) {
          return p.name.toLowerCase().indexOf(keyword) !== -1
        })
      }
      this.setData({ productList: list })
      return
    }

    var keyword = this.data.keyword.trim().toLowerCase()
    var cat = this.data.currentCategory
    var list = this.data.rawProducts

    if (cat && cat !== '全部') {
      list = list.filter(function (p) { return p.category === cat })
    }
    if (keyword) {
      list = list.filter(function (p) {
        return p.name.toLowerCase().indexOf(keyword) !== -1
      })
    }

    // 更新显示占位
    this.setData({ productList: list })
  },

  /** 加载模板商品库（并行获取本店已导入商品以标记已导入状态） */
  _loadTemplateProducts() {
    var page = this
    var shopPhone = app.getShopPhone()
    page.setData({ templateMode: true, templateLoading: true })

    Promise.all([
      app.callFunction('repair_inventory', { action: 'listTemplateProducts', pageSize: 1000 }),
      app.callFunction('repair_inventory', { action: 'listProducts', shopPhone: shopPhone, pageSize: 500 })
    ]).then(function (results) {
      page.setData({ templateLoading: false })

      var tmplRes = results[0]
      var prodRes = results[1]
      var templates = []

      // 构建本店商品索引：_templateId → 已导入
      var shopIndex = {}
      if (prodRes && prodRes.code === 0 && prodRes.data) {
        var products = prodRes.data.list || []
        products.forEach(function (p) {
          if (p._templateId) {
            shopIndex[p._templateId] = true
          }
        })
      }

      if (tmplRes && tmplRes.code === 0 && tmplRes.data) {
        var rawList = tmplRes.data.list || []
        // 按 _id 去重，避免 wx:key 重复警告
        var seen = {}
        rawList.forEach(function (t) {
          if (!seen[t._id]) {
            seen[t._id] = true
            templates.push(t)
          }
        })
      }

      var list = templates.map(function (t) {
        return page._decorateTemplate(t, !!shopIndex[t._id])
      })
      page.setData({ rawTemplates: list })
      page.filterProducts()
    }).catch(function () {
      page.setData({ templateLoading: false })
      wx.showToast({ title: '加载模板失败', icon: 'none' })
    })
  },

  /** 装饰模板用于显示 */
  _decorateTemplate(t, isImported) {
    return {
      _id: t._id,
      name: t.name,
      category: t.category || '其他',
      specs: t.specs || [],
      price: t.price || 0,
      cost: t.cost || 0,
      unit: t.unit || '个',
      remark: t.remark || '',
      isTemplate: true,
      isImported: !!isImported,
      importing: false
    }
  },

  /** 导入模板到本店商品库，再供用户选择数量 */
  onImportTemplate(e) {
    var page = this
    var templateId = e.currentTarget.dataset.id
    var template = page._findTemplate(templateId)
    if (!template || template.importing || template.isImported) return

    // 标记导入中
    var rawTemplates = page.data.rawTemplates.map(function (t) {
      if (t._id === templateId) t.importing = true
      return t
    })
    page.setData({ rawTemplates: rawTemplates, importingTemplateId: templateId })
    page.filterProducts()

    app.callFunction('repair_inventory', {
      action: 'importTemplateProduct',
      shopPhone: app.getShopPhone(),
      templateId: templateId
    }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        // 构建已导入的产品对象
        var imported = page._buildImportedProduct(template, res.data._id)
        var rawProducts = page.data.rawProducts.concat([imported])
        // 本地切换为已导入状态，不再重新查库
        var rawTemplates = page.data.rawTemplates.map(function (t) {
          if (t._id === templateId) {
            t.isImported = true
            t.importing = false
          }
          return t
        })
        page.setData({
          rawProducts: rawProducts,
          rawTemplates: rawTemplates,
          importingTemplateId: null
        })
        page.filterProducts()
        wx.showToast({ title: '导入成功', icon: 'success' })
      } else {
        page._resetTemplateImporting(templateId)
        wx.showToast({ title: (res && res.msg) || '导入失败', icon: 'none' })
      }
    }).catch(function () {
      page._resetTemplateImporting(templateId)
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  },

  /** 从模板数据构建产品对象（匹配 _decorateProduct 输入格式） */
  _buildImportedProduct(template, productId) {
    var specs = template.specs || []
    var product = {
      _id: productId,
      _templateId: template._id,
      name: template.name,
      category: template.category || '其他',
      specs: specs,
      specStock: specs.map(function (s) { return { label: s, stock: 0 } }),
      specPrice: template.specPrice || [],
      specCost: template.specCost || [],
      price: template.price || 0,
      cost: template.cost || 0,
      stock: 0,
      unit: template.unit || '个',
      remark: template.remark || '',
      productStatus: 'on_shelf'
    }
    return this._decorateProduct(product)
  },

  /** 查找模板项 */
  _findTemplate(templateId) {
    var raw = this.data.rawTemplates
    for (var i = 0; i < raw.length; i++) {
      if (raw[i]._id === templateId) return raw[i]
    }
    return null
  },

  /** 重置模板导入中状态 */
  _resetTemplateImporting(templateId) {
    var rawTemplates = this.data.rawTemplates.map(function (t) {
      if (t._id === templateId) t.importing = false
      return t
    })
    this.setData({ rawTemplates: rawTemplates, importingTemplateId: null })
    this.filterProducts()
  },

  onQtyChange(e) {
    var ds = e.currentTarget.dataset
    var pid = ds.pid
    var specLabel = ds.spec
    var delta = parseInt(ds.delta)

    if (delta > 0 && !this._skipStockCheck) {
      // 加操作：检查库存上限
      var stockLimit = this._getStockLimit(pid, specLabel)
      var currentQty = 0
      var product = this.data.rawProducts.filter(function (p) { return p._id === pid })[0]
      if (product) {
        if (specLabel === '') {
          currentQty = product._qty || 0
        } else {
          var matched = (product.displaySpecs || []).filter(function (s) { return s.label === specLabel })[0]
          if (matched) currentQty = matched.quantity || 0
        }
      }
      if (currentQty + delta > stockLimit) {
        if (stockLimit <= 0) {
          wx.showToast({ title: '该商品已无货', icon: 'none' })
        } else {
          wx.showToast({ title: '库存不足（最多 ' + stockLimit + '）', icon: 'none' })
        }
        return
      }
    }

    var raw = this.data.rawProducts.map(function (p) {
      if (p._id !== pid) return p
      p = JSON.parse(JSON.stringify(p))
      if (specLabel === '') {
        // 无规格
        p._qty = Math.max(0, (p._qty || 0) + delta)
      } else {
        var displaySpecs = p.displaySpecs.map(function (s) {
          if (s.label === specLabel) {
            s.quantity = Math.max(0, (s.quantity || 0) + delta)
          }
          return s
        })
        p.displaySpecs = displaySpecs
      }
      return p
    })

    this.setData({ rawProducts: raw })
    this.filterProducts()
    this.updateSelectedItems()
  },

  /** 手动输入数量 → 实时过滤非数字并更新模型 */
  onQtyInput(e) {
    var ds = e.currentTarget.dataset
    var pid = ds.pid
    var specLabel = ds.spec
    var val = parseInt(e.detail.value) || 0
    if (val < 0) val = 0

    // 手动输入截断至库存上限（非入库/权益核销场景）
    if (!this._skipStockCheck) {
      var stockLimit = this._getStockLimit(pid, specLabel)
      if (val > stockLimit) {
        val = stockLimit
      }
    }

    var raw = this.data.rawProducts.map(function (p) {
      if (p._id !== pid) return p
      p = JSON.parse(JSON.stringify(p))
      if (specLabel === '') {
        p._qty = val
      } else {
        var displaySpecs = p.displaySpecs.map(function (s) {
          if (s.label === specLabel) {
            s.quantity = val
          }
          return s
        })
        p.displaySpecs = displaySpecs
      }
      return p
    })

    this.setData({ rawProducts: raw })
    this.filterProducts()
    this.updateSelectedItems()
  },

  /** 输入框失去焦点 → 校验（空/非数字恢复为 0，超库存截断） */
  onQtyBlur(e) {
    var ds = e.currentTarget.dataset
    var pid = ds.pid
    var specLabel = ds.spec
    var val = parseInt(e.detail.value)
    if (isNaN(val) || val < 0) val = 0

    // 失焦时截断至库存上限（非入库/权益核销场景）
    if (!this._skipStockCheck) {
      var stockLimit = this._getStockLimit(pid, specLabel)
      if (val > stockLimit) {
        val = stockLimit
      }
    }

    var raw = this.data.rawProducts.map(function (p) {
      if (p._id !== pid) return p
      p = JSON.parse(JSON.stringify(p))
      if (specLabel === '') {
        if (p._qty !== val) p._qty = val
      } else {
        var displaySpecs = p.displaySpecs.map(function (s) {
          if (s.label === specLabel && s.quantity !== val) {
            s.quantity = val
          }
          return s
        })
        p.displaySpecs = displaySpecs
      }
      return p
    })

    this.setData({ rawProducts: raw })
    this.filterProducts()
    this.updateSelectedItems()
  },

  updateSelectedItems() {
    var items = []
    var total = 0
    this.data.rawProducts.forEach(function (p) {
      if (p.specs && p.specs.length > 0) {
        p.displaySpecs.forEach(function (s) {
          if (s.quantity > 0) {
            var specPrice = s.price || p.price || 0
            items.push({
              _productId: p._id,
              name: p.name,
              category: p.category || '',
              spec: s.label,
              quantity: s.quantity,
              price: specPrice,
              unit: p.unit,
              _fromProduct: true,
              cost: s.cost,
              _itemTotalCost: s.cost * s.quantity
            })
            total += specPrice * s.quantity
          }
        })
      } else if (p._qty > 0) {
        items.push({
          _productId: p._id,
          name: p.name,
          category: p.category || '',
          spec: '',
          quantity: p._qty,
          price: p.price,
          unit: p.unit,
          _fromProduct: true,
          cost: p.cost || 0,
          _itemTotalCost: (p.cost || 0) * p._qty
        })
        total += p.price * p._qty
      }
    })
    this.setData({
      selectedItems: items,
      totalAmount: total
    })
  },

  onConfirm() {
    var page = this
    var items = page.data.selectedItems
    var existingProducts = wx.getStorageSync(page.data.existingKey) || []
    if (items.length === 0) {
      if (existingProducts.length > 0) {
        // 编辑模式：允许返回空（移除所有已选商品）
        wx.setStorageSync(page.data.storageKey, [])
        wx.navigateBack()
        return
      }
      wx.showToast({ title: '请选择商品', icon: 'none' })
      return
    }

    // 二次校验：确认所有商品库存充足（非入库/权益核销场景跳过）
    if (!page._skipStockCheck) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        var stockLimit = page._getStockLimit(item._productId, item.spec || '')
        if (item.quantity > stockLimit) {
          wx.showToast({ title: '"' + item.name + '" 库存不足', icon: 'none' })
          return
        }
      }
    }

    if (page._benefitMode) {
      // 权益关联模式：返回简化格式（无金额相关字段）
      var benefitItems = items.map(function (item) {
        return {
          productId: item._productId,
          productName: item.name,
          spec: item.spec || '',
          quantity: item.quantity,
          unit: item.unit || '个'
        }
      })
      wx.setStorageSync(page.data.storageKey, benefitItems)
      wx.navigateBack()
      return
    }

    // 序列化为可识别的格式
    var exportItems = items.map(function (item) {
      return {
        name: item.name,
        spec: item.spec || '',
        amount: String(item.price * item.quantity),
        _productId: item._productId,
        _productItemSpec: item.spec,
        _productQuantity: item.quantity,
        _fromProduct: true,
        _productCost: item.cost || 0,
        _productTotalCost: item._itemTotalCost || 0,
        _productCategory: item.category || ''
      }
    })
    wx.setStorageSync(page.data.storageKey, exportItems)
    wx.navigateBack()
  }
})
