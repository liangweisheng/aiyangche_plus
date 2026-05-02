// pages/carDetail/carDetail.js
// 车辆详情页（含会员权益展示与扣减）

const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    carInfo: null,
    memberInfo: null,
    showAlertModal: false,
    showVehicleModal: false,
    showDetailModal: false,
    alertForm: {
      maintainDate: '',
      insuranceDate: '',
      partReplaceName: '',
      partReplaceDate: ''
    },
      vehicleForm: {
      carType: '',
      color: '',
      mileage: '',
      vin: ''
    },
    detailForm: {
      ownerName: '',
      phone: '',
      remark: ''
    }
  },

  onLoad(options) {
    var plate = options.plate
    var id = options.id
    if (!plate && !id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1500)
      return
    }
    if (plate) {
      this.fetchCarDetail(plate)
      this.fetchMemberInfo(plate)
    } else if (id) {
      this.fetchCarById(id)
    }
  },

  // 按 _id 直接读取车辆记录
  fetchCarById(id) {
    var page = this
    var db = app.db()
    wx.showLoading({ title: '加载中...' })
    db.collection('repair_cars').doc(id).get({
      success: function (res) {
        wx.hideLoading()
        var carData = res.data
        if (carData.createTime) {
          var d = new Date(carData.createTime)
          var pad = function (n) { return n < 10 ? '0' + n : '' + n }
          carData.createTime = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
        }
        page.setData({ carInfo: carData })
        page.fetchMemberInfo(carData.plate)
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  // 获取车辆详情（按门店手机号隔离）
  fetchCarDetail(plate) {
    var page = this
    var db = app.db()
    wx.showLoading({ title: '加载中...' })

    var whereCondition = app.shopWhere({ plate: plate })

    db.collection('repair_cars')
      .where(whereCondition)
      .get({
        success: function (res) {
          wx.hideLoading()
          if (res.data.length === 0) {
            wx.showToast({ title: '未找到该车辆', icon: 'none' })
            setTimeout(function () { wx.navigateBack() }, 1500)
          } else {
            var carData = res.data[0]
            if (carData.createTime) {
              var d = new Date(carData.createTime)
              var pad = function (n) { return n < 10 ? '0' + n : '' + n }
              carData.createTime = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
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

  // 查询会员权益信息
  fetchMemberInfo(plate) {
    var page = this
    var db = app.db()
    var whereCondition = app.shopWhere({ plate: plate })
    db.collection('repair_members')
      .where(whereCondition)
      .get({
        success: function (res) {
          if (res.data.length > 0) {
            page.setData({ memberInfo: res.data[0] })
            return
          }
          // 车牌未匹配 → 按车主手机号查
          var carWhere = app.shopWhere({ plate: plate })
          db.collection('repair_cars').where(carWhere).get({
            success: function (carRes) {
              var ownerPhone = (carRes.data.length > 0 && carRes.data[0].phone) || ''
              if (!ownerPhone) return
              var memberPhoneWhere = app.shopWhere({ phone: ownerPhone })
              db.collection('repair_members').where(memberPhoneWhere).get({
                success: function (memberRes) {
                  if (memberRes.data.length > 0) {
                    page.setData({ memberInfo: memberRes.data[0] })
                  }
                }
              })
            }
          })
        }
      })
  },

  onCreateOrder() {
    var plate = this.data.carInfo && this.data.carInfo.plate
    if (!plate) {
      wx.showToast({ title: '获取车牌失败', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/orderAdd/orderAdd?plate=' + plate })
  },

  onViewOrders() {
    var plate = this.data.carInfo && this.data.carInfo.plate
    if (!plate) {
      wx.showToast({ title: '获取车牌失败', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/orderList/orderList?keyword=' + plate })
  },

  onViewChecklist() {
    var plate = this.data.carInfo && this.data.carInfo.plate
    if (!plate) {
      wx.showToast({ title: '获取车牌失败', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/checkSheet/checkSheet?plate=' + plate })
  },

  onViewCheckSheetList() {
    var plate = this.data.carInfo && this.data.carInfo.plate
    wx.navigateTo({ url: '/pages/checkSheetList/checkSheetList' + (plate ? '?keyword=' + plate : '') })
  },

  onBackToSearch() {
    wx.navigateBack()
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/dashboard/dashboard' })
  },

  // 跳转到会员权益登记页
  onGoMemberBenefit() {
    var plate = this.data.carInfo && this.data.carInfo.plate
    if (plate) {
      wx.navigateTo({ url: '/pages/memberAdd/memberAdd?plate=' + plate })
    }
  },

  // 删除已用完的权益卡片
  onRemoveBenefit(e) {
    var page = this
    var memberInfo = page.data.memberInfo
    if (!memberInfo) return

    var idx = e.currentTarget.dataset.index
    var benefits = memberInfo.benefits
    if (!benefits || benefits.length === 0) {
      // 兼容旧数据：单权益模式
      benefits = memberInfo.benefitName ? [{ name: memberInfo.benefitName, total: memberInfo.benefitTotal || 0, remain: memberInfo.benefitRemain || 0 }] : []
    }
    if (idx === undefined || idx === null) idx = 0
    var benefit = benefits[idx]
    if (!benefit) return

    var remain = Number(benefit.remain) || 0
    if (remain > 0) {
      wx.showToast({ title: '仅可删除已用完的权益', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认删除',
      content: '删除「' + (benefit.name || '权益') + '」卡片？历史核销记录将保留。',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: function (modalRes) {
        if (!modalRes.confirm) return

        var db = app.db()
        wx.showLoading({ title: '删除中...' })

        if (memberInfo.benefits && memberInfo.benefits.length > 0) {
          // 数组模式：移除指定项
          benefits.splice(idx, 1)
          var updateData = {
            benefits: benefits,
            updateTime: db.serverDate()
          }
          // 同步旧字段
          if (benefits.length > 0) {
            updateData.benefitName = benefits[0].name
            updateData.benefitTotal = benefits[0].total
            updateData.benefitRemain = benefits[0].remain
          } else {
            updateData.benefitName = ''
            updateData.benefitTotal = 0
            updateData.benefitRemain = 0
          }

          util.callRepair('updateMember', { docId: memberInfo._id, updateData: updateData })
            .then(function (res) {
              wx.hideLoading()
              if (res && res.code === 0) {
                if (benefits.length === 0) {
                  page.setData({
                    'memberInfo.benefits': [],
                    'memberInfo.benefitName': '',
                    'memberInfo.benefitTotal': 0,
                    'memberInfo.benefitRemain': 0
                  })
                } else {
                  page.setData({ 'memberInfo.benefits': benefits })
                }
                wx.showToast({ title: '已删除', icon: 'success' })
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' })
              }
            }).catch(function () {
              wx.hideLoading()
              wx.showToast({ title: '删除失败', icon: 'none' })
            })
        } else {
          // 兼容旧单字段模式：清空
          util.callRepair('updateMember', {
            docId: memberInfo._id,
            updateData: { benefitName: '', benefitTotal: 0, benefitRemain: 0 }
          }).then(function (res) {
            wx.hideLoading()
            page.setData({
              'memberInfo.benefitName': '',
              'memberInfo.benefitTotal': 0,
              'memberInfo.benefitRemain': 0
            })
            wx.showToast({ title: '已删除', icon: 'success' })
          }).catch(function () {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  // 使用权益（扣减1次 + 生成工单记录）
  onUseBenefit(e) {
    var page = this
    var memberInfo = page.data.memberInfo
    var carInfo = page.data.carInfo
    if (!memberInfo || !carInfo) return

    var idx = e.currentTarget.dataset.index
    // 获取权益数组（兼容旧数据）
    var benefits = memberInfo.benefits
    if (!benefits || benefits.length === 0) {
      benefits = memberInfo.benefitName ? [{ name: memberInfo.benefitName, total: memberInfo.benefitTotal || 0, remain: memberInfo.benefitRemain || 0 }] : []
    }
    if (idx === undefined || idx === null) idx = 0
    var benefit = benefits[idx]
    if (!benefit) return

    var remain = Number(benefit.remain) || 0
    if (remain <= 0) {
      wx.showToast({ title: '权益次数已用完', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认使用权益',
      content: '使用1次「' + (benefit.name || '权益') + '」，剩余 ' + (remain - 1) + ' 次',
      confirmText: '确认使用',
      cancelText: '取消',
      success: function (modalRes) {
        if (!modalRes.confirm) return

        var shopPhone = app.getShopPhone()
        var plate = carInfo.plate
        var newRemain = remain - 1
        wx.showLoading({ title: '处理中...' })

        util.callRepair('useBenefit', {
          memberDocId: memberInfo._id,
          benefitIdx: idx,
          newRemain: newRemain,
          benefitName: benefit.name || '权益',
          benefitTotal: benefit.total || 0,
          plate: plate
        }).then(function (res) {
          wx.hideLoading()
          if (res && res.code === 0) {
            if (memberInfo.benefits && memberInfo.benefits.length > 0) {
              var key = 'memberInfo.benefits[' + idx + '].remain'
              page.setData({ [key]: newRemain })
            } else {
              page.setData({ 'memberInfo.benefitRemain': newRemain })
            }
            wx.showToast({ title: '已使用，剩余' + newRemain + '次', icon: 'success' })
          } else {
            wx.showToast({ title: res.msg || '操作失败', icon: 'none' })
          }
        }).catch(function () {
          wx.hideLoading()
          wx.showToast({ title: '操作失败', icon: 'none' })
        })
      }
    })
  },

  // 车主电话 → 拨打/复制
  onPhoneTap(e) {
    var phone = e.currentTarget.dataset.phone
    if (!phone) return
    wx.showActionSheet({
      itemList: ['拨打 ' + phone, '复制号码'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.makePhoneCall({ phoneNumber: phone })
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({ data: phone })
        }
      }
    })
  },

  onEditVehicle() {
    if (getApp().isStaff()) {
      wx.showToast({ title: '店员无权编辑车辆信息', icon: 'none' })
      return
    }
    var car = this.data.carInfo
    this.setData({
      showVehicleModal: true,
      vehicleForm: {
        carType: car.carType || '',
        color: car.color || '',
        mileage: car.mileage ? String(car.mileage) : '',
        vin: car.vin || ''
      }
    })
  },

  onCloseVehicle() {
    this.setData({ showVehicleModal: false })
  },

  onVehicleInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['vehicleForm.' + field]: e.detail.value })
  },

  onSaveVehicle() {
    var page = this
    var carInfo = page.data.carInfo
    var form = page.data.vehicleForm

    wx.showLoading({ title: '保存中...' })
    util.callRepair('updateCarInfo', {
      docId: carInfo._id,
      updateData: {
        carType: form.carType,
        color: form.color,
        mileage: form.mileage ? Number(form.mileage) : 0,
        vin: form.vin
      }
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        page.setData({
          showVehicleModal: false,
          'carInfo.carType': form.carType,
          'carInfo.color': form.color,
          'carInfo.mileage': form.mileage ? Number(form.mileage) : 0,
          'carInfo.vin': form.vin
        })
      } else {
        wx.showToast({ title: res.msg || '保存失败', icon: 'none' })
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  // 编辑详细信息
  onEditDetail() {
    var car = this.data.carInfo
    this.setData({
      showDetailModal: true,
      detailForm: {
        ownerName: car.ownerName || '',
        phone: car.phone || '',
        remark: car.remark || ''
      }
    })
  },

  onCloseDetail() {
    this.setData({ showDetailModal: false })
  },

  onDetailInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['detailForm.' + field]: e.detail.value })
  },

  onSaveDetail() {
    var page = this
    var carInfo = page.data.carInfo
    var form = page.data.detailForm

    wx.showLoading({ title: '保存中...' })
    util.callRepair('updateCarInfo', {
      docId: carInfo._id,
      updateData: { ownerName: form.ownerName, phone: form.phone, remark: form.remark }
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        page.setData({
          showDetailModal: false,
          'carInfo.ownerName': form.ownerName,
          'carInfo.phone': form.phone,
          'carInfo.remark': form.remark
        })
      } else {
        wx.showToast({ title: res.msg || '保存失败', icon: 'none' })
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  // 编辑提醒事项
  onEditAlert() {
    var car = this.data.carInfo
    this.setData({
      showAlertModal: true,
      alertForm: {
        maintainDate: car.maintainDate || '',
        insuranceDate: car.insuranceDate || '',
        partReplaceName: car.partReplaceName || '',
        partReplaceDate: car.partReplaceDate || ''
      }
    })
  },

  onCloseAlert() {
    this.setData({ showAlertModal: false })
  },

  stopPropagation() {},

  onAlertDatePick(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['alertForm.' + field]: e.detail.value })
  },

  onAlertInput(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['alertForm.' + field]: e.detail.value })
  },

  // 保存提醒事项到车辆档案
  onSaveAlert() {
    var page = this
    var carInfo = page.data.carInfo
    var form = page.data.alertForm

    wx.showLoading({ title: '保存中...' })
    util.callRepair('updateCarInfo', {
      docId: carInfo._id,
      updateData: {
        maintainDate: form.maintainDate,
        insuranceDate: form.insuranceDate,
        partReplaceName: form.partReplaceName,
        partReplaceDate: form.partReplaceDate
      }
    }).then(function (res) {
      wx.hideLoading()
      if (res && res.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' })
        page.setData({
          showAlertModal: false,
          'carInfo.maintainDate': form.maintainDate,
          'carInfo.insuranceDate': form.insuranceDate,
          'carInfo.partReplaceName': form.partReplaceName,
          'carInfo.partReplaceDate': form.partReplaceDate
        })
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  }
})
