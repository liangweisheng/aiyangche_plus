// pages/checkSheet/checkSheet.js
// 电子查车单页面（按门店手机号隔离）
// v5.4.1：无 plate 参数时显示车牌搜索，选车后进入检查表单

const app = getApp()
const util = require('../../utils/util')
var constants = require('../../utils/constants')

Page({
  data: {
    plate: '',
    carInfo: null,
    // 搜索状态
    searchPlate: '',
    searchResults: [],
    searched: false,
    autoFocusSearch: true,
    recentCars: [],
    searching: false,
    form: {
      exterior: '',
      tire: '',
      oil: '',
      battery: '',
      brake: '',
      light: '',
      chassis: '',
      other: '',
      issue: '',
      suggestion: ''
    },
    checkItems: constants.CHECK_ITEMS
  },

  searchTimer: null,

  onLoad(options) {
    if (!app.checkPageAccess('registered')) return
    var plate = options.plate
    if (plate) {
      // 有车牌参数：直接加载车辆信息
      this.setData({ plate: plate, autoFocusSearch: false })
      this.fetchCarInfo(plate)
    } else {
      // 无车牌参数：显示搜索界面
      this.loadRecentCars()
    }
  },

  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
  },

  // ============================
  // 车牌搜索（无 plate 参数时）
  // ============================

  loadRecentCars() {
    var page = this
    var db = app.db()
    var whereCondition = app.shopWhere()
    db.collection('repair_cars')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(20)
      .get({
        success: function (res) {
          page.setData({ recentCars: res.data || [] })
        },
        fail: function (err) {
          console.warn('[checkSheet] 最近车辆加载失败', err)
        }
      })
  },

  onSearchPlateInput(e) {
    var val = e.detail.value.trim().toUpperCase()
    this.setData({ searchPlate: val, searchResults: [], searched: false })
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    if (val.length < 3) return
    this.searchTimer = setTimeout(function () {
      this.fuzzySearch(val)
    }.bind(this), 300)
  },

  fuzzySearch(keyword) {
    var page = this
    var db = app.db()
    try {
      var whereCondition = app.shopWhere({
        plate: db.RegExp({ regexp: keyword, options: 'i' })
      })
      db.collection('repair_cars')
        .where(whereCondition)
        .limit(5)
        .get()
        .then(function (res) {
          page.setData({ searchResults: res.data || [], searched: true })
        })
        .catch(function (err) {
          console.error('[checkSheet] 模糊搜索失败', err)
        })
    } catch (err) {
      console.error('[checkSheet] 模糊搜索失败', err)
    }
  },

  onSelectCar(e) {
    var plate = e.currentTarget.dataset.plate
    this.setData({ searchPlate: plate, searchResults: [], searched: false })
    this.setData({ plate: plate })
    this.fetchCarInfo(plate)
  },

  onRecentTap(e) {
    var plate = e.currentTarget.dataset.plate || ''
    this.setData({ searchPlate: plate, searchResults: [], searched: false })
    this.setData({ plate: plate })
    this.fetchCarInfo(plate)
  },

  onSearchCar() {
    var plate = this.data.searchPlate
    if (!plate) {
      wx.showToast({ title: '请输入车牌号', icon: 'none' })
      return
    }
    this.setData({ searchResults: [], searched: false })
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
              carData.createTime = util.formatDateTime(carData.createTime)
            }
            page.setData({ carInfo: carData, plate: plate })
          } else {
            // 未找到车辆：回到搜索状态
            wx.showToast({ title: '未找到该车辆，请先新增', icon: 'none' })
            page.setData({ carInfo: null, plate: '', searchPlate: plate, autoFocusSearch: false })
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

  // 取消并返回上一页
  onCancel() {
    wx.navigateBack()
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  onPlateTap() {
    var plate = this.data.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/carDetail/carDetail?plate=' + plate })
    }
  },

  onViewHistory() {
    var plate = this.data.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/checkSheetList/checkSheetList?keyword=' + plate })
    }
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

    // 空单校验：检查全部 8 项是否都未填写内容或标记正常
    var allEmpty = checkItems.every(function (item) {
      var val = form[item.key]
      if (!val) return true                           // 无输入
      if (typeof val === 'string') return !val.trim() // 输入为空字符串
      // val 为 checkbox 对象 { normal: bool, value?: string }
      if (val.normal) return false                     // 标记正常 → 已填写
      return !(val.value || '').trim()                 // 无异常描述文字
    })
    if (allEmpty) {
      wx.showToast({ title: '空检测单无法保存', icon: 'none' })
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
      issue: (form.issue || '').trim() || '无',
      suggestion: (form.suggestion || '').trim() || '无',
      operatorPhone: app.getOperatorPhone(),
      operatorName: app.getOperatorName()
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
