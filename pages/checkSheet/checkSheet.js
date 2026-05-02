// pages/checkSheet/checkSheet.js
// 电子查车单页面（按门店手机号隔离）

const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    plate: '',
    carInfo: null,
    form: {
      exterior: '',
      tire: '',
      oil: '',
      battery: '',
      brake: '',
      light: '',
      issue: '',
      suggestion: ''
    },
    checkItems: [
      { key: 'exterior', label: '外观检查', icon: '🚗' },
      { key: 'tire', label: '轮胎检查', icon: '🛞' },
      { key: 'oil', label: '机油检查', icon: '💧' },
      { key: 'battery', label: '电瓶检查', icon: '🔋' },
      { key: 'brake', label: '刹车检查', icon: '🛑' },
      { key: 'light', label: '灯光检查', icon: '💡' }
    ]
  },

  onLoad(options) {
    var plate = options.plate
    if (!plate) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
      return
    }
    this.setData({ plate: plate })
    this.fetchCarInfo(plate)
  },

  // 获取车辆信息（按门店手机号隔离）
  fetchCarInfo(plate) {
    var page = this
    var db = app.db()
    wx.showLoading({ title: '加载中...' })

    var whereCondition = app.shopWhere({ plate: plate })

    db.collection('repair_cars')
      .where(whereCondition)
      .get({
        success: function (res) {
          wx.hideLoading()
          if (res.data.length > 0) {
            var carData = res.data[0]
            if (carData.createTime) {
              carData.createTime = new Date(carData.createTime).toLocaleString()
            }
            page.setData({ carInfo: carData })
          }
        },
        fail: function () {
          wx.hideLoading()
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
      })
  },

  onInput(e) {
    var field = e.currentTarget.dataset.field
    var key = 'form.' + field
    this.setData({ [key]: e.detail.value })
  },

  onToggleNormal(e) {
    var key = e.currentTarget.dataset.key
    var checkItems = this.data.checkItems
    var idx = checkItems.findIndex(function (item) { return item.key === key })
    if (idx >= 0) {
      var newVal = !checkItems[idx].normal
      var ckKey = 'checkItems[' + idx + '].normal'
      this.setData({ [ckKey]: newVal })
      if (newVal) {
        var fKey = 'form.' + key
        this.setData({ [fKey]: '正常' })
      }
    }
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  // 保存查车单（自动写入 shopPhone）
  onSave() {
    var page = this
    var data = page.data
    var plate = data.plate
    var carInfo = data.carInfo
    var form = data.form
    var checkItems = data.checkItems

    if (!plate) {
      wx.showToast({ title: '车牌号不能为空', icon: 'none' })
      return
    }

    var shopPhone = app.getShopPhone()
    wx.showLoading({ title: '保存中...' })

    var checkItemsData = {}
    checkItems.forEach(function (item) {
      checkItemsData[item.key] = {
        value: form[item.key] ? form[item.key].trim() : '该项未检查',
        normal: item.normal
      }
    })

    util.callRepair('saveCheckSheet', {
      plate: plate,
      ownerName: (carInfo && carInfo.ownerName) || '',
      phone: (carInfo && carInfo.phone) || '',
      carType: (carInfo && carInfo.carType) || '',
      carColor: (carInfo && carInfo.color) || '',
      checkItems: checkItemsData,
      issue: form.issue.trim() || '无',
      suggestion: form.suggestion.trim() || '无'
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 1500)
      } else {
        wx.showToast({ title: res.msg || '保存失败', icon: 'none' })
      }
    }).catch(function (err) {
      wx.hideLoading()
      console.error('保存查车单失败：', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
