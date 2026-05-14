// pages/orderAdd/orderAdd.js
// 快速开单（工单/施工单）- 按门店手机号隔离

const app = getApp()
const util = require('../../utils/util')
var constants = require('../../utils/constants')

Page({
  data: {
    editId: '',
    plate: '',
    plateChars: ['', '', '', '', '', '', '', ''],
    showKeyboard: false,
    totalSpent: 0,
    serviceRows: [
      { name: '', spec: '', amount: '' },
      { name: '', spec: '', amount: '' },
      { name: '', spec: '', amount: '' }
    ],
    activeRow: 0,
    form: {
      serviceItems: '',
      totalAmount: '',
      paidAmount: '',
      payMethod: '1',
      remark: '',
      setMaintainDate: '',
      setPartName: '',
      setPartDate: '',
      partCost: ''         // 配件成本
    },
    memberInfo: null,
    isMember: false,
    carInfo: null,
    today: util.formatDate(new Date()),
    payOptions: [
      { value: '1', label: '现付', icon: '💵' },
      { value: '2', label: '挂账', icon: '📌' }
    ],
    phrases: [],
    phraseExpanded: false,
    phraseNeedExpand: false,
    showPhraseEdit: false,
    phraseEditText: '',
    defaultPhrases: ['洗车', '底盘维修', '补胎', '机油保养', '轮胎更换', '刹车片更换', '空调清洗', '雨刮更换', '电瓶更换', '全车检查', '洗车打蜡', '玻璃水补充', '防冻液更换', '变速箱油更换', '火花塞更换'],
    // 内嵌式车牌选择器
    showCarPicker: false,
    carPickerKeyword: '',
    carPickerResults: [],
    carPickerRecent: [],
    carPickerSearching: false,
    carPickerEmpty: false,
    carPickerTimer: null,
    carPickerKbHeight: 0,
    carPickerInputFocus: false,
    carPickerWaiting: false,
    // 数字键盘
    showNumberKeyboard: false,
    numberKeyboardValue: '',
    nameInputFocusIndex: -1,
    // 实收金额修改弹窗
    showPaidAmountEdit: false,
    paidAmountEditValue: '',
    paidEditInputFocus: false,
    // 毛利相关
    grossProfit: 0,                   // 本单毛利（实收金额-配件成本）
    showPartCostEdit: false,          // 配件成本编辑弹窗
    partCostEditValue: '',
    partCostEditInputFocus: false,
    partCostEditPreview: 0,           // 弹窗中实时预览利润
    partCostEditGrossRate: ''          // 弹窗中实时毛利率
  },

  onUnload() {
    var page = this
    // 清计时器，防止内存泄漏
    if (page.data.carPickerTimer) {
      clearTimeout(page.data.carPickerTimer)
    }
    // 清理车牌回调 storage（编辑未完成退出时）
    wx.removeStorageSync('orderAdd_selectedPlate')
  },

  onLoad(options) {
    var page = this
    var plate = options.plate || ''
    var editId = options.id || ''
    // 初始化屏幕信息（用于智能键盘高度限制）
    page._initScreenInfo()
    // 清除可能残留的回调车牌（上次编辑未完成退出时）
    wx.removeStorageSync('orderAdd_selectedPlate')
    page.loadPhrases()
    if (editId) {
      page.setData({ editId: editId })
      page.loadOrderForEdit(editId)
    } else if (plate) {
      page.setPlate(plate)
    }
  },

  // 编辑模式：加载已有工单数据
  loadOrderForEdit(id) {
    var page = this
    wx.showLoading({ title: '加载中...' })
    app.db().collection('repair_orders').doc(id).get({
      success: function (res) {
        wx.hideLoading()
        var order = res.data
        // 校验工单是否属于当前门店
        var shopPhone = app.getShopPhone()
        if (order.shopPhone && order.shopPhone !== shopPhone) {
          wx.showToast({ title: '无权操作此工单', icon: 'none' })
          setTimeout(function () { wx.navigateBack() }, 1500)
          return
        }
        // 回填车牌
        page.setPlate(order.plate || '')
        // 回填服务项目（从 serviceItems 文本拆分为行）
        var items = (order.serviceItems || '').split(/[,，]/).filter(function (s) { return s.trim() })
        var amounts = (order.serviceAmounts || '').split(',').map(function (a) { return a })
        var rows = items.map(function (item, idx) {
          var parts = item.trim().split(/\s+/)
          return { name: parts[0] || '', spec: parts.slice(1).join(' ') || '', amount: amounts[idx] || '' }
        })
        if (rows.length === 0) {
          rows = [{ name: '', spec: '', amount: '' }, { name: '', spec: '', amount: '' }, { name: '', spec: '', amount: '' }]
        }
        // 回填表单
        page.setData({
          serviceRows: rows,
          'form.totalAmount': order.totalAmount ? String(order.totalAmount) : '',
          'form.paidAmount': order.paidAmount ? String(order.paidAmount) : '',
          'form.payMethod': order.payMethod || '1',
          'form.remark': order.remark || '',
          'form.partCost': order.partCost ? String(order.partCost) : ''
        })
        // 加载完后重算利润
        page.computeProfit()
        // 设置标题
        wx.setNavigationBarTitle({ title: '编辑工单' })
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '加载工单失败', icon: 'none' })
      }
    })
  },

  onShow() {
    // 从车辆搜索页返回时检查是否有回调车牌
    var selectedPlate = wx.getStorageSync('orderAdd_selectedPlate') || ''
    if (selectedPlate && selectedPlate !== this.data.plate) {
      wx.removeStorageSync('orderAdd_selectedPlate')
      this.setPlate(selectedPlate)
    }
  },

  // 设置车牌（同步 plate、plateChars、加载会员/车辆信息）
  setPlate(plate) {
    var chars = plate.split('')
    while (chars.length < 8) { chars.push('') }
    this.setData({
      plate: plate,
      plateChars: chars,
      showKeyboard: false
    })
    if (plate) {
      this.fetchMemberInfo(plate)
      this.fetchCarInfo(plate)
      this.fetchTotalSpent(plate)
    } else {
      this.setData({ memberInfo: null, isMember: false, carInfo: null, totalSpent: 0 })
    }
  },

  // 查询历史消费总额（云函数端聚合）⭐ 优化：单次请求替代客户端多次分页
  fetchTotalSpent(plate) {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone || !plate) return

    app.callFunction('repair_main', {
      action: 'getTotalSpent',
      shopPhone: shopPhone,
      plate: plate
    }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        page.setData({ totalSpent: res.data.totalSpent || 0 })
      } else {
        page.setData({ totalSpent: 0 })
      }
    }).catch(function () {
      page.setData({ totalSpent: 0 })
    })
  },

  // ========== 车牌输入 ==========

  onPlateGridTap() {
    this.setData({ showKeyboard: true })
  },

  onPlateConfirm(e) {
    var plate = e.detail.value
    if (plate) {
      this.setPlate(plate)
    }
  },

  onPlateCancel() {
    this.setData({ showKeyboard: false })
  },

  onSelectCar() {
    this.setData({
      showCarPicker: true,
      carPickerKeyword: '',
      carPickerResults: [],
      carPickerSearching: false,
      carPickerEmpty: false,
      carPickerInputFocus: false
    })
    this.loadCarPickerRecent()
    // 延迟触发 focus，确保 input 渲染完成后再弹出键盘
    var page = this
    setTimeout(function () {
      page.setData({ carPickerInputFocus: true })
    }, 300)
  },

  // ========== 内嵌式车牌选择器 ==========

  // 初始化屏幕信息，用于智能限制键盘上浮高度（防平板超屏）
  _initScreenInfo() {
    var info = wx.getSystemInfoSync()
    this._screenHeight = info.windowHeight || 600
    this._maxKbOffset = Math.floor(this._screenHeight * 0.40)
  },

  loadCarPickerRecent() {
    var page = this
    var db = app.db()
    var whereCondition = app.shopWhere()
    db.collection('repair_cars')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(3)
      .get({
        success: function (res) {
          page.setData({ carPickerRecent: res.data || [] })
        },
        fail: function () {}
      })
  },

  // 键盘弹出时获取高度，智能计算面板底部间距
  onCarPickerSearchFocus(e) {
    var rawH = e.detail.height || 0
    // iOS 经常返回0/undefined，用保守估计替代硬编码450
    var h = rawH > 100 ? rawH : Math.min(280, this._maxKbOffset)
    // 严格限制不超过安全上限（防止平板端超出屏幕）
    h = Math.min(h, this._maxKbOffset)
    this.setData({ carPickerKbHeight: h })
  },

  // 键盘高度变化时更新面板位置（最可靠的数据源）
  onCarPickerKBChange(e) {
    var h = e.detail.height || 0
    if (h > 50) {
      h = Math.min(h, this._maxKbOffset)
      this.setData({ carPickerKbHeight: h })
    }
  },

  onCarPickerInput(e) {
    var page = this
    var rawVal = e.detail.value
    var filteredVal = rawVal.replace(/[^0-9A-Za-z\u4e00-\u9fa5]/g, '').toUpperCase()
    page.setData({ carPickerKeyword: filteredVal })

    if (page.data.carPickerTimer) {
      clearTimeout(page.data.carPickerTimer)
      page.setData({ carPickerTimer: null })
    }

    if (!filteredVal || filteredVal.length < 2) {
      page.setData({
        carPickerResults: [],
        carPickerSearching: false,
        carPickerEmpty: false,
        carPickerWaiting: !!filteredVal
      })
      return
    }

    page.setData({
      carPickerTimer: setTimeout(function () {
        page.doCarPickerSearch(filteredVal.trim())
      }, 400),
      carPickerWaiting: false
    })
  },

  doCarPickerSearch(keyword) {
    var page = this
    if (!keyword || keyword.length < 2) return
    var db = app.db()
    page.setData({ carPickerSearching: true, carPickerEmpty: false })

    var isPhone = /^\d{11}$/.test(keyword)
    var whereCondition

    if (isPhone) {
      whereCondition = app.shopWhere({ phone: db.RegExp({ regexp: keyword, options: 'i' }) })
    } else {
      whereCondition = app.shopWhere({ plate: db.RegExp({ regexp: keyword.replace(/\./g, '\\.'), options: 'i' }) })
    }

    db.collection('repair_cars')
      .where(whereCondition)
      .limit(20)
      .get({
        success: function (res) {
          page.setData({ carPickerSearching: false })
          if (res.data.length === 0) {
            page.setData({ carPickerResults: [], carPickerEmpty: true })
          } else {
            page.setData({ carPickerResults: res.data, carPickerEmpty: false })
          }
        },
        fail: function () {
          page.setData({ carPickerSearching: false })
          wx.showToast({ title: '查询失败', icon: 'none' })
        }
      })
  },

  onCarPickerClear() {
    if (this.data.carPickerTimer) {
      clearTimeout(this.data.carPickerTimer)
    }
    this.setData({ carPickerKeyword: '', carPickerResults: [], carPickerSearching: false, carPickerEmpty: false, carPickerWaiting: false, carPickerTimer: null })
  },

  onPickCar(e) {
    var plate = e.currentTarget.dataset.plate || ''
    if (plate) {
      this.setPlate(plate)
    }
    this.setData({ showCarPicker: false })
  },

  onCloseCarPicker() {
    if (this.data.carPickerTimer) {
      clearTimeout(this.data.carPickerTimer)
    }
    this.setData({ showCarPicker: false, carPickerKeyword: '', carPickerResults: [], carPickerSearching: false, carPickerEmpty: false, carPickerWaiting: false, carPickerTimer: null, carPickerInputFocus: false })
  },

  onCarPickerMask() {
    // 空操作，阻止冒泡
  },

  onViewHistory() {
    wx.navigateTo({ url: '/pages/orderList/orderList?plate=' + this.data.plate })
  },

  onClearPlate() {
    this.setData({
      plate: '',
      plateChars: ['', '', '', '', '', '', '', ''],
      memberInfo: null,
      isMember: false,
      carInfo: null,
      totalSpent: 0
    })
  },

  // 跳转到车辆详情页（会员权益核销）
  onGoCarDetail() {
    var carId = (this.data.carInfo && this.data.carInfo._id) || ''
    if (carId) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?id=' + carId })
    } else {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + this.data.plate })
    }
  },

  // 查询车辆信息（用于回填提醒字段）
  fetchCarInfo(plate) {
    var page = this
    var db = app.db()
    var carWhere = app.shopWhere({ plate: plate })
    db.collection('repair_cars').where(carWhere).get({
      success: function (res) {
        if (res.data.length > 0) {
          page.setData({ carInfo: res.data[0] })
        }
      }
    })
  },

  // 查询会员信息（按门店隔离）
  // ★ 适配一人多车：先按车牌号精确匹配会员，未找到再按车辆的车主手机号查找
  fetchMemberInfo(plate) {
    var page = this
    var db = app.db()
    var whereCondition = app.shopWhere({ plate: plate })
    db.collection('repair_members')
      .where(whereCondition)
      .get({
        success: function (res) {
          if (res.data.length > 0) {
            page.setData({ memberInfo: res.data[0], isMember: true })
            return
          }
          // 车牌号未匹配到会员 → 查该车辆的车主手机号，再按手机号查会员（一人多车）
          var carWhere = app.shopWhere({ plate: plate })
          db.collection('repair_cars').where(carWhere).get({
            success: function (carRes) {
              var ownerPhone = (carRes.data.length > 0 && carRes.data[0].phone) || ''
              if (!ownerPhone) return
              var memberPhoneWhere = app.shopWhere({ phone: ownerPhone })
              db.collection('repair_members').where(memberPhoneWhere).get({
                success: function (memberRes) {
                  if (memberRes.data.length > 0) {
                    page.setData({ memberInfo: memberRes.data[0], isMember: true })
                  }
                }
              })
            }
          })
        }
      })
  },

  // ========== 快捷短语 ==========

  loadPhrases() {
    var page = this
    var custom = wx.getStorageSync('servicePhrases') || []
    var list = custom.length > 0 ? custom : page.data.defaultPhrases
    var phrases = list.map(function (t) {
      return {
        text: t,
        displayText: t.length > 8 ? t.substring(0, 8) + '…' : t,
        selected: false
      }
    })
    // 检查是否需要折叠（超过3行，约9个标签）
    var needExpand = phrases.length > 9
    page.setData({ phrases: phrases, phraseNeedExpand: needExpand })
  },

  onPhraseTap(e) {
    var text = e.currentTarget.dataset.text
    var activeRow = this.data.activeRow
    var key = 'serviceRows[' + activeRow + '].name'
    this.setData({ [key]: text })
  },

  onToggleExpand() {
    this.setData({ phraseExpanded: !this.data.phraseExpanded })
  },

  onRowFocus(e) {
    this.setData({ activeRow: e.currentTarget.dataset.index })
  },

  onRowBlur() {
    // blur 不需要特殊处理
  },

  // ========== 数字键盘（金额输入） ==========

  onAmountTap(e) {
    var idx = e.currentTarget.dataset.index
    this._activeAmountField = 'row_' + idx
    var val = this.data.serviceRows[idx].amount || ''
    this.setData({ numberKeyboardValue: val, showNumberKeyboard: true })
  },

  onEditPaidAmount() {
    var page = this
    var currentVal = page.data.form.paidAmount || ''
    page.setData({
      showPaidAmountEdit: true,
      paidAmountEditValue: currentVal,
      paidEditInputFocus: false
    })
    setTimeout(function () {
      page.setData({ paidEditInputFocus: true })
    }, 300)
  },

  onPaidEditInput(e) {
    this.setData({ paidAmountEditValue: e.detail.value })
  },

  onPaidEditCancel() {
    this.setData({
      showPaidAmountEdit: false,
      paidAmountEditValue: '',
      paidEditInputFocus: false
    })
  },

  onPaidEditModalTap() {
    // 空操作，阻止冒泡到遮罩层
  },

  onPaidEditSave() {
    var val = this.data.paidAmountEditValue.trim()
    if (val && Number(val) < 0) {
      wx.showToast({ title: '金额不能为负数', icon: 'none' })
      return
    }
    if (Number(val) > 999999) {
      wx.showToast({ title: '金额过大，请检查', icon: 'none' })
      return
    }
    this.setData({
      'form.paidAmount': val || '',
      showPaidAmountEdit: false,
      paidAmountEditValue: '',
      paidEditInputFocus: false
    })
    this.computeProfit()
  },

  onNumberKeyboardConfirm(e) {
    var val = e.detail.value || ''
    var field = this._activeAmountField
    if (!field) return
    this.setData({ showNumberKeyboard: false })
    if (field === 'paidAmount') {
      this.setData({ 'form.paidAmount': val })
    } else {
      var idx = parseInt(field.replace('row_', ''))
      var key = 'serviceRows[' + idx + '].amount'
      this.setData({ [key]: val })
      this.calcTotalAmount()
    }
    this._activeAmountField = null
  },

  onNumberKeyboardCancel() {
    this.setData({ showNumberKeyboard: false })
    this._activeAmountField = null
  },

  onNumberKeyboardNext(e) {
    var val = e.detail.value || ''
    var field = this._activeAmountField
    if (!field) return
    this.setData({ showNumberKeyboard: false })
    if (field === 'paidAmount') {
      this.setData({ 'form.paidAmount': val })
    } else {
      var idx = parseInt(field.replace('row_', ''))
      var key = 'serviceRows[' + idx + '].amount'
      this.setData({ [key]: val })
      this.calcTotalAmount()
      // 聚焦下一行的项目名输入框
      var nextIdx = idx + 1
      if (nextIdx < this.data.serviceRows.length) {
        var page = this
        page.setData({ nameInputFocusIndex: nextIdx }, function() {
          setTimeout(function() {
            page.setData({ nameInputFocusIndex: -1 })
          }, 100)
        })
      }
    }
    this._activeAmountField = null
  },

  onRowInput(e) {
    var idx = e.currentTarget.dataset.index
    var field = e.currentTarget.dataset.field
    var key = 'serviceRows[' + idx + '].' + field
    this.setData({ [key]: e.detail.value })
  },

  onAddRow() {
    var rows = this.data.serviceRows.concat([{ name: '', spec: '', amount: '' }])
    this.setData({ serviceRows: rows })
  },

  // 计算服务项目总额
  // - 新增模式：实收金额始终与总金额保持一致
  // - 编辑模式：实收金额保持原有值，不自动覆盖
  calcTotalAmount() {
    var rows = this.data.serviceRows
    var total = 0
    rows.forEach(function (r) { total += Number(r.amount) || 0 })
    var totalStr = total > 0 ? String(total) : ''
    var updateData = { 'form.totalAmount': totalStr }
    // 编辑模式下不自动覆盖实收金额，避免覆盖用户原有的实收值
    if (!this.data.editId) {
      updateData['form.paidAmount'] = totalStr
    }
    this.setData(updateData)
    this.computeProfit()
  },

  // 计算本单毛利
  computeProfit() {
    var paid = Number(this.data.form.paidAmount) || 0
    var cost = Number(this.data.form.partCost) || 0
    this.setData({
      grossProfit: paid - cost
    })
  },

  // 管理短语（增删改）
  onManagePhrases() {
    var page = this
    var phrases = this.data.phrases.map(function (p) { return p.text })
    var content = phrases.join('，')
    page.setData({ showPhraseEdit: true, phraseEditText: content })
  },

  // +++ 配件成本编辑 +++
  onEditPartCost() {
    var page = this
    var currentVal = page.data.form.partCost || ''
    var paid = Number(page.data.form.paidAmount) || Number(page.data.form.totalAmount) || 0
    var preview = paid - (Number(currentVal) || 0)
    var grossRate = paid > 0 ? (preview / paid * 100).toFixed(1) : ''
    page.setData({
      showPartCostEdit: true,
      partCostEditValue: currentVal,
      partCostEditInputFocus: false,
      partCostEditPreview: preview,
      partCostEditGrossRate: grossRate
    })
    setTimeout(function () {
      page.setData({ partCostEditInputFocus: true })
    }, 300)
  },

  onPartCostEditInput(e) {
    var val = e.detail.value
    var paid = Number(this.data.form.paidAmount) || Number(this.data.form.totalAmount) || 0
    var preview = paid - (Number(val) || 0)
    var grossRate = paid > 0 ? (preview / paid * 100).toFixed(1) : ''
    this.setData({
      partCostEditValue: val,
      partCostEditPreview: preview,
      partCostEditGrossRate: grossRate
    })
  },

  onPartCostEditCancel() {
    this.setData({
      showPartCostEdit: false,
      partCostEditValue: '',
      partCostEditInputFocus: false,
      partCostEditPreview: 0,
      partCostEditGrossRate: ''
    })
  },

  onPartCostEditModalTap() {
    // 阻止冒泡到遮罩层
  },

  onPartCostEditSave() {
    var val = this.data.partCostEditValue.trim()
    if (val && Number(val) < 0) {
      wx.showToast({ title: '成本不能为负数', icon: 'none' })
      return
    }
    if (Number(val) > 999999) {
      wx.showToast({ title: '金额过大，请检查', icon: 'none' })
      return
    }
    this.setData({
      'form.partCost': val || '',
      showPartCostEdit: false,
      partCostEditValue: '',
      partCostEditInputFocus: false,
      partCostEditPreview: 0,
      partCostEditGrossRate: ''
    })
    this.computeProfit()
  },

  onPhraseEditInput(e) {
    this.setData({ phraseEditText: e.detail.value })
  },

  onPhraseEditCancel() {
    this.setData({ showPhraseEdit: false, phraseEditText: '' })
  },

  onPhraseModalTap() {
    // 空操作，仅阻止事件冒泡到遮罩层
  },

  onPhraseEditSave() {
    var page = this
    var text = page.data.phraseEditText.trim()
    if (!text) {
      wx.showToast({ title: '至少保留一个短语', icon: 'none' })
      return
    }
    var newList = text.split(/[,，\n]/).map(function (s) { return s.trim() }).filter(function (s) { return s })
    if (newList.length > 0) {
      wx.setStorageSync('servicePhrases', newList)
      page.setData({ showPhraseEdit: false, phraseEditText: '' })
      page.loadPhrases()
      wx.showToast({ title: '已保存 ' + newList.length + ' 个短语', icon: 'success' })
    }
  },

  onPhraseResetDefault() {
    wx.removeStorageSync('servicePhrases')
    this.setData({ showPhraseEdit: false, phraseEditText: '' })
    this.loadPhrases()
    wx.showToast({ title: '已恢复默认', icon: 'success' })
  },

  // ========== 表单操作 ==========

  onDatePick(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 清除到期提醒日期
  onClearDateField(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: '' })
  },

  onInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onPayMethodChange(e) {
    this.setData({ 'form.payMethod': e.currentTarget.dataset.value })
  },

  onSave() {
    var page = this
    var data = page.data
    var plate = data.plate
    var form = data.form
    var memberInfo = data.memberInfo
    var isMember = data.isMember

    if (!plate) {
      wx.showToast({ title: '请先输入或选择车牌', icon: 'none' })
      return
    }

    // 汇总服务项目总额（不覆盖实收金额，保留用户手动输入的值）
    var _total = 0
    page.data.serviceRows.forEach(function (r) { _total += Number(r.amount) || 0 })
    page.setData({ 'form.totalAmount': _total > 0 ? String(_total) : '' })
    var latestForm = page.data.form
    var rows = page.data.serviceRows
    var hasItem = false
    var itemsText = []
    rows.forEach(function (r) {
      if (r.name.trim()) {
        hasItem = true
        var line = r.name.trim()
        if (r.spec.trim()) line += ' ' + r.spec.trim()
        itemsText.push(line)
      }
    })
    if (!hasItem) {
      wx.showToast({ title: '请输入服务项目', icon: 'none' })
      return
    }
    // 验证：项目有内容时金额不能为空
    var amountError = false
    rows.forEach(function (r, i) {
      if (r.name.trim() && r.amount.toString().trim() === '') {
        amountError = true
      }
    })
    if (amountError) {
      wx.showToast({ title: '有项目的金额未填写', icon: 'none' })
      return
    }
    var totalAmount = latestForm.totalAmount ? Number(latestForm.totalAmount) : 0
    // ★ v6.x 编辑模式允许金额为 0（权益核销工单无金额）
    if (totalAmount <= 0 && !page.data.editId) {
      wx.showToast({ title: '请输入服务金额', icon: 'none' })
      return
    }
    var paidAmount = latestForm.paidAmount ? Number(latestForm.paidAmount) : 0
    if (paidAmount > totalAmount) {
      // ★ v6.x 实收金额大于总金额时弹窗确认
      wx.showModal({
        title: '实收金额大于总金额',
        content: '实收金额（' + paidAmount + '）大于总金额（' + totalAmount + '），是否确认保存？',
        confirmText: '确认保存',
        cancelText: '取消',
        success: function (modalRes) {
          if (modalRes.confirm) {
            page._finalizeOrderSave(latestForm, itemsText, rows, page)
          }
        }
      })
      return
    }
    page._finalizeOrderSave(latestForm, itemsText, rows, page)
  },

  // 暂存工单（状态：施工中，仅要求车牌，允许项目和金额为空）
  onSaveDraft() {
    var page = this
    var plate = page.data.plate

    if (!plate) {
      wx.showToast({ title: '请先输入或选择车牌', icon: 'none' })
      return
    }

    // 汇总服务项目总额（不覆盖实收金额，保留用户手动输入的值）
    var _total = 0
    page.data.serviceRows.forEach(function (r) { _total += Number(r.amount) || 0 })
    page.setData({ 'form.totalAmount': _total > 0 ? String(_total) : '' })
    var form = Object.assign({}, page.data.form)
    var rows = page.data.serviceRows
    var itemsText = []
    var amounts = []
    rows.forEach(function (r) {
      if (r.name.trim()) {
        var line = r.name.trim()
        if (r.spec.trim()) line += ' ' + r.spec.trim()
        itemsText.push(line)
        amounts.push(Number(r.amount) || 0)
      }
    })
    form.serviceItems = itemsText.join('，')
    form.serviceAmounts = amounts.join(',')

    page.saveOrder(plate, form, '施工中')
  },

  // 普通支付保存工单（新建或编辑）
  saveOrder(plate, form, status) {
    var page = this
    var shopPhone = app.getShopPhone()
    var editId = page.data.editId
    var isEdit = !!editId

    // 免费版工单数量校验（仅新建时检查）
    if (!isEdit && !app.isPro()) {
      var checkDb = app.db()
      var checkWhere = app.shopWhere()
      checkWhere.isVoided = checkDb.command.neq(true)
      wx.showLoading({ title: '检查额度...' })
      checkDb.collection('repair_orders').where(checkWhere).count()
        .then(function (countRes) {
          var cnt = countRes.total || 0
          if (cnt >= constants.FREE_MAX_ORDERS) {
            wx.hideLoading()
            wx.showModal({
              title: '已达免费版上限',
              content: '免费版最多创建' + constants.FREE_MAX_ORDERS + '个工单（当前' + cnt + '个）\n升级Pro版即可无限使用',
              confirmText: '去升级',
              success: function (m) { if (m.confirm) wx.switchTab({ url: '/pages/proUnlock/proUnlock' }) }
            })
            return
          }
          page._doSaveOrder(plate, form, status, shopPhone, editId, isEdit)
        })
        .catch(function (err) {
          console.warn('工单数量校验失败，允许继续', err)
          wx.hideLoading()
          page._doSaveOrder(plate, form, status, shopPhone, editId, isEdit)
        })
      return
    }

    page._doSaveOrder(plate, form, status, shopPhone, editId, isEdit)
  },

  _doSaveOrder(plate, form, status, shopPhone, editId, isEdit) {
    var page = this
    wx.showLoading({ title: '保存中...' })

    var amount = Number(form.totalAmount) || 0
    var paidAmount = Number(form.paidAmount) || 0
    var partCost = Number(form.partCost) || 0
    var profit = paidAmount - partCost

    var orderData = {
      plate: plate,
      serviceItems: form.serviceItems.trim(),
      serviceAmounts: form.serviceAmounts || '',
      totalAmount: amount,
      paidAmount: paidAmount,
      payMethod: form.payMethod || '1',
      remark: form.remark.trim(),
      status: status || '施工中',
      setMaintainDate: form.setMaintainDate || '',
      setPartName: form.setPartName || '',
      setPartDate: form.setPartDate || '',
      operatorPhone: app.getOperatorPhone(),
      operatorName: app.getOperatorName(),
      partCost: partCost,
      profit: profit
    }

    var carDocId = (page.data.carInfo && page.data.carInfo._id) || ''

    var promise
    if (isEdit) {
      promise = util.callRepair('editOrder', { orderId: editId, updateData: orderData })
    } else {
      // 暂存工单（施工中）金额为0时，直接本地写入，绕过云函数金额校验
      if (status === '施工中' && amount <= 0) {
        promise = util.callRepair('createOrder', Object.assign({ carDocId: carDocId, _skipAmountCheck: true }, orderData))
      } else {
        promise = util.callRepair('createOrder', Object.assign({ carDocId: carDocId }, orderData))
      }
    }

    promise.then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: isEdit ? '修改成功' : '开单成功', icon: 'success' })
        
        // 设置全局刷新标志
        getApp().globalData.shouldRefreshOrderList = true
        
        // 保存后跳转到工单详情页
        var orderId = isEdit ? editId : (res.data && res.data.orderId)
        if (orderId) {
          setTimeout(function () {
            wx.redirectTo({ url: '/pages/orderDetail/orderDetail?id=' + orderId })
          }, 1500)
        } else {
          setTimeout(function () { wx.navigateBack() }, 1500)
        }
      } else {
        wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  // 最终保存处理（提取为独立方法，支持实收金额超限确认后继续执行）
  _finalizeOrderSave: function (form, itemsText, rows, page) {
    // 金额过大校验
    var paidAmount = Number(form.paidAmount) || 0
    if (paidAmount > 999999) {
      wx.showToast({ title: '金额过大，请检查！', icon: 'none' })
      return
    }

    form.serviceItems = itemsText.join('，')

    // 保存各项金额（逗号分隔）
    var amounts = []
    rows.forEach(function (r) {
      if (r.name.trim()) {
        amounts.push(Number(r.amount) || 0)
      }
    })
    form.serviceAmounts = amounts.join(',')

    var status = form.payMethod === '2' ? '待结算' : '已完成'
    page.saveOrder(page.data.plate, form, status)
  }
})
