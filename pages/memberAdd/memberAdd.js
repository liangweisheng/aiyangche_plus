// pages/memberAdd/memberAdd.js
// 新增会员 - 车牌搜索 → 加载车辆 → 权益登记（支持多个权益，按门店手机号隔离）

const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    searchPlate: '',
    searching: false,
    carFound: false,
    searchResults: [],
    searched: false,
    plate: '',
    carId: '',
    name: '',
    phone: '',
    benefits: [],
    curBenefit: { name: '', total: '', remain: '' },
    remark: '',
    benefitPresets: ['10次洗车卡', '5次保养卡', '5次洗车卡', '3次洗车卡', '年检套餐'],
    autoFocusSearch: true,
    recentCars: [],
    submitting: false
  },

  searchTimer: null,

  // 加载最近20条车辆（按门店隔离 + 创建时间倒序）
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
        fail: function () { }
      })
  },

  // 点击最近车辆 → 自动填入搜索
  onRecentTap(e) {
    var plate = e.currentTarget.dataset.plate || ''
    this.setData({
      searchPlate: plate,
      searchResults: [],
      searched: false
    })
    this.searchCar(plate)
  },

  onLoad(options) {
    // 兼容 plate 和 searchPlate 两种参数名
    const plate = options.plate || options.searchPlate
    if (plate) {
      this.setData({ searchPlate: plate, autoFocusSearch: false })
      this.searchCar(plate)
    }
    this.loadRecentCars()
  },

  onSearchPlateInput(e) {
    var val = e.detail.value.trim().toUpperCase()
    this.setData({
      searchPlate: val,
      searchResults: [],
      searched: false
    })
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
          page.setData({
            searchResults: res.data || [],
            searched: true
          })
        })
        .catch(function (err) {
          console.error('模糊搜索失败', err)
        })
    } catch (err) {
      console.error('模糊搜索失败', err)
    }
  },

  onSelectCar(e) {
    var plate = e.currentTarget.dataset.plate
    this.setData({
      searchPlate: plate,
      searchResults: [],
      searched: false
    })
    this.searchCar(plate)
  },

  onSearchCar() {
    var searchPlate = this.data.searchPlate
    if (!searchPlate) {
      wx.showToast({ title: '请输入车牌号', icon: 'none' })
      return
    }
    this.setData({ searchResults: [], searched: false })
    this.searchCar(searchPlate)
  },

  searchCar(plate) {
    var page = this
    var db = app.db()
    page.setData({ searching: true })
    try {
      var whereCondition = app.shopWhere({ plate: plate })
      db.collection('repair_cars')
        .where(whereCondition)
        .get()
        .then(function (res) {
          if (res.data.length === 0) {
            wx.showModal({
              title: '未找到车辆',
              content: '未找到该车牌的车辆信息，请先新增车辆',
              confirmText: '去新增',
              cancelText: '取消',
              success: function (modalRes) {
                if (modalRes.confirm) {
                  wx.navigateTo({
                    url: '/pages/carAdd/carAdd?plate=' + plate + '&from=memberAdd'
                  })
                }
              }
            })
            page.setData({ searching: false })
            return
          }
          var carData = res.data[0]
          page.setData({
            carFound: true,
            carId: carData._id || '',
            plate: plate,
            name: carData.ownerName || '',
            phone: carData.phone || '',
            searching: false
          })
        })
        .catch(function (err) {
          console.error('搜索车辆失败', err)
          page.setData({ searching: false })
          wx.showToast({ title: '搜索失败', icon: 'none' })
        })
    } catch (err) {
      console.error('搜索车辆失败', err)
      page.setData({ searching: false })
      wx.showToast({ title: '搜索失败', icon: 'none' })
    }
  },

  onReSearch() {
    this.setData({
      carFound: false,
      plate: '',
      carId: '',
      name: '',
      phone: '',
      benefits: [],
      curBenefit: { name: '', total: '', remain: '' },
      remark: ''
    })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value.trim() })
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.trim() })
  },

  // 当前权益输入
  onCurNameInput(e) {
    this.setData({ 'curBenefit.name': e.detail.value.trim() })
  },

  onCurTotalInput(e) {
    var val = e.detail.value.trim()
    this.setData({ 'curBenefit.total': val })
    if (val && !this.data.curBenefit.remain) {
      this.setData({ 'curBenefit.remain': val })
    }
  },

  onCurRemainInput(e) {
    this.setData({ 'curBenefit.remain': e.detail.value.trim() })
  },

  onPresetTap(e) {
    var preset = e.currentTarget.dataset.preset
    var match = preset.match(/(\d+)次/)
    var total = match ? match[1] : ''
    this.setData({
      curBenefit: { name: preset, total: total, remain: total }
    })
  },

  // 添加当前权益到列表
  onAddBenefit() {
    var cur = this.data.curBenefit
    if (!cur.name) {
      wx.showToast({ title: '请输入权益名称', icon: 'none' })
      return
    }
    var exists = this.data.benefits.some(function (b) { return b.name === cur.name })
    if (exists) {
      wx.showToast({ title: '该权益已添加，请勿重复', icon: 'none' })
      return
    }
    var benefits = this.data.benefits.concat([{
      name: cur.name,
      total: Number(cur.total) || 0,
      remain: Number(cur.remain) || 0
    }])
    this.setData({
      benefits: benefits,
      curBenefit: { name: '', total: '', remain: '' }
    })
  },

  // 移除已添加的权益
  onRemoveBenefit(e) {
    var idx = e.currentTarget.dataset.index
    var benefits = this.data.benefits
    benefits.splice(idx, 1)
    this.setData({ benefits: benefits })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value.trim() })
  },

  onSubmit() {
    var page = this
    var db = app.db()
    var data = page.data
    var plate = data.plate
    var carId = data.carId
    var name = data.name
    var phone = data.phone
    var benefits = data.benefits
    var remark = data.remark

    if (!plate) {
      wx.showToast({ title: '车牌号不能为空', icon: 'none' })
      return
    }
    if (benefits.length === 0) {
      wx.showToast({ title: '请至少添加一个权益', icon: 'none' })
      return
    }

    page.setData({ submitting: true })
    wx.showLoading({ title: '检查额度...' })
    var shopPhone = app.getShopPhone()

    var existWhere = app.shopWhere({ plate: plate })

    // 免费版会员数量前置校验
    if (!app.isPro()) {
      app.db().collection('repair_members').where(app.shopWhere()).count()
        .then(function (cntRes) {
          var totalCount = cntRes.total || 0
          // 先查该车牌是否已有会员（已有则追加权益，不受限制）
          return app.db().collection('repair_members').where(existWhere).get().then(function (existRes) {
            if (existRes.data.length > 0) {
              // 已有会员 → 追加权益，不限
              page._doSubmitMember(plate, carId, name, phone, benefits, remark, existWhere)
            } else if (totalCount >= 10) {
              // 新增会员且已达上限
              wx.hideLoading()
              wx.showModal({
                title: '已达免费版上限',
                content: '免费版最多添加10个会员（当前' + totalCount + '个）\n升级Pro版即可无限添加',
                confirmText: '去升级',
                success: function (m) { if (m.confirm) wx.switchTab({ url: '/pages/proUnlock/proUnlock' }) }
              })
              page.setData({ submitting: false })
            } else {
              page._doSubmitMember(plate, carId, name, phone, benefits, remark, existWhere)
            }
          })
        })
        .catch(function (err) {
          console.warn('会员数量校验失败，允许继续', err)
          wx.hideLoading()
          page._doSubmitMember(plate, carId, name, phone, benefits, remark, existWhere)
        })
      return
    }

    page._doSubmitMember(plate, carId, name, phone, benefits, remark, existWhere)
  },

  _doSubmitMember(plate, carId, name, phone, benefits, remark, existWhere) {
    var page = this
    var db = app.db()
    wx.showLoading({ title: '保存中...' })

    var memberWhere = {}
    if (plate) memberWhere.plate = plate
    if (phone) memberWhere.phone = phone

    return db.collection('repair_members').where(memberWhere).get()
      .then(function (existRes) {
        if (existRes.data.length > 0) {
          // 会员已存在 → 追加权益到现有记录
          var member = existRes.data[0]
          var existingBenefits = member.benefits || []
          if (existingBenefits.length === 0 && member.benefitName) {
            existingBenefits = [{ name: member.benefitName, total: member.benefitTotal || 0, remain: member.benefitRemain || 0 }]
          }
          var mergedBenefits = existingBenefits.concat(benefits)

          var updateData = {
            benefits: mergedBenefits,
            benefitName: mergedBenefits[0].name,
            benefitTotal: mergedBenefits[0].total,
            benefitRemain: mergedBenefits[0].remain
          }
          if (name) updateData.ownerName = name
          if (name) updateData.name = name
          if (phone) updateData.phone = phone

          return util.callRepair('updateMember', { docId: member._id, updateData: updateData })
            .then(function (res) {
              if (res && res.code === 0 && carId && (name || phone)) {
                var carUpdateData = {}
                if (name) carUpdateData.ownerName = name
                if (phone) carUpdateData.phone = phone
                return util.callRepair('updateCarInfo', { docId: carId, updateData: carUpdateData })
              }
              return res
            })
        }

        // 新会员 → 创建记录
        return util.callRepair('addMember', {
          plate: plate,
          ownerName: name || '未填写',
          phone: phone || '无',
          benefits: benefits,
          remark: remark || ''
        }).then(function (res) {
          if (res && res.code === 0 && carId && (name || phone)) {
            var carUpdateData = {}
            if (name) carUpdateData.ownerName = name
            if (phone) carUpdateData.phone = phone
            return util.callRepair('updateCarInfo', { docId: carId, updateData: carUpdateData })
          }
          return res
        })
      })
      .then(function () {
        wx.hideLoading()
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(function () {
          wx.navigateBack()
        }, 1500)
      })
      .catch(function (err) {
        console.error('保存会员失败', err)
        wx.hideLoading()
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      })
      .finally(function () {
        page.setData({ submitting: false })
      })
  },

  onCancel() {
    wx.navigateBack()
  }
})

