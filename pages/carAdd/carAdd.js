// pages/carAdd/carAdd.js
// 新增车辆档案页面

const app = getApp()
const util = require('../../utils/util')
var constants = require('../../utils/constants')

Page({
  data: {
    form: {
      plateNumber: '',
      ownerName: '',
      carModel: '',
      color: '',
      mileage: '',
      ownerPhone: '',
      maintainDate: '',
      insuranceDate: '',
      partReplaceName: '',
      partReplaceDate: '',
      remark: '',
      vin: ''
    },
    colorOptions: ['白色', '黑色', '银色', '红色', '蓝色', '灰色'],
    colorExpanded: false,
    keyboardVisible: false,
    vinKeyboardVisible: false,
    showDetail: false
  },

  onLoad() {
    if (!app.checkPageAccess('registered')) return
  },

  showPlateKeyboard() {
    this.setData({ keyboardVisible: true })
  },

  hidePlateKeyboard() {
    this.setData({ keyboardVisible: false })
  },

  onPlateConfirm(e) {
    var plate = e.detail.value || ''
    this.setData({ 'form.plateNumber': plate, keyboardVisible: false })
  },

  onInput(e) {
    var field = e.currentTarget.dataset.field
    var data = {}
    data['form.' + field] = e.detail.value
    this.setData(data)
  },

  toggleColorPanel() {
    this.setData({ colorExpanded: !this.data.colorExpanded })
  },

  onColorPick(e) {
    var color = e.currentTarget.dataset.color
    this.setData({ 'form.color': color, colorExpanded: false })
  },

  onDatePick(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 清除日期选择
  onClearDateField(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: '' })
  },

  // ========== VIN键盘 ==========

  showVinKeyboard() {
    this.setData({ vinKeyboardVisible: true })
  },

  hideVinKeyboard() {
    this.setData({ vinKeyboardVisible: false })
  },

  onVinInput(e) {
    this.setData({ 'form.vin': e.detail.value || '' })
  },

  onVinConfirm(e) {
    var vin = e.detail.value || ''
    this.setData({ 'form.vin': vin, vinKeyboardVisible: false })
  },

  toggleDetail() {
    this.setData({ showDetail: !this.data.showDetail })
  },


  onUnload() {
    if (this.data.keyboardVisible) {
      this.setData({ keyboardVisible: false })
    }
    if (this.data.vinKeyboardVisible) {
      this.setData({ vinKeyboardVisible: false })
    }
  },

  // 保存车辆（自动写入 shopPhone 实现门店隔离）
  onSave() {
    var page = this
    var form = page.data.form
    var plateNumber = form.plateNumber
    var carModel = form.carModel
    var color = form.color
    var mileage = form.mileage
    var ownerPhone = form.ownerPhone
    var maintainDate = form.maintainDate
    var insuranceDate = form.insuranceDate
    var partReplaceName = form.partReplaceName
    var partReplaceDate = form.partReplaceDate
    var remark = form.remark

    if (!plateNumber.trim()) {
      wx.showToast({ title: '请输入车牌号', icon: 'none' })
      return
    }

    var db = app.db()
    var shopPhone = app.getShopPhone()
    wx.showLoading({ title: '保存中...' })

    // ★ 校验同门店下车牌号唯一性（核心索引：shopPhone + plate）
    var plateTrim = plateNumber.trim()
    var checkWhere = app.shopWhere({ plate: plateTrim })

    db.collection('repair_cars')
      .where(checkWhere)
      .count()
      .then(function (countRes) {
        if (countRes.total > 0) {
          wx.hideLoading()
          wx.showToast({ title: '该车牌号已存在', icon: 'none' })
          return
        }

        // 车牌号唯一 → 通过云函数保存
        return util.callRepair('addCar', {
          plate: plateTrim,
          carType: carModel.trim(),
          color: color.trim(),
          mileage: Number(mileage) || 0,
          phone: ownerPhone.trim(),
          maintainDate: maintainDate.trim(),
          insuranceDate: insuranceDate.trim(),
          partReplaceName: partReplaceName.trim(),
          partReplaceDate: partReplaceDate.trim(),
          remark: remark.trim(),
          ownerName: form.ownerName.trim(),
          vin: form.vin.trim()
        })
      })
      .then(function (res) {
        if (!res) return
        wx.hideLoading()
        if (res.code === 0) {
          wx.showToast({ title: '保存成功', icon: 'success' })
          setTimeout(function () { wx.navigateTo({ url: '/pages/carDetail/carDetail?id=' + res.data._id }) }, 1500)
        } else {
          wx.showToast({ title: res.msg || '保存失败', icon: 'none' })
        }
      })
      .catch(function (err) {
        wx.hideLoading()
        console.error('保存车辆失败', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
  }
})
