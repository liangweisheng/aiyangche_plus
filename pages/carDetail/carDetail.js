// pages/carDetail/carDetail.js
// 车辆详情页（含会员权益展示与扣减）

const app = getApp()
const util = require('../../utils/util')
var ocrHelper = require('../../utils/ocrHelper')

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
      mileage: '',
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
    this._firstLoad = true
    if (plate) {
      this.fetchCarDetail(plate)
      this.fetchMemberInfo(plate)
    } else if (id) {
      this.fetchCarById(id)
    }
  },

  onUnload() {
    // 重置重入守卫，下次从其他页面返回时可正常刷新
    this._firstLoad = true
  },

  // 从子页面（memberAdd/orderAdd等）返回时刷新数据
  onShow() {
    // 首次加载跳过（onLoad已拉取），仅从子页面返回时刷新
    if (this._firstLoad) {
      this._firstLoad = false
      return
    }
    var plate = this.data.carInfo && this.data.carInfo.plate
    if (plate) {
      // 只刷新会员信息和统计数据，车辆基础数据（含照片）不会从子页面改变
      this.fetchMemberInfo(plate)
      this._fetchCarStats(plate)
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
        // 归属校验：确保只能查看本门店车辆
        var shopPhone = app.getShopPhone()
        if (carData.shopPhone && carData.shopPhone !== shopPhone) {
          wx.showToast({ title: '无权查看此车辆', icon: 'none' })
          setTimeout(function () { wx.navigateBack() }, 1500)
          return
        }
        if (carData.createTime) {
          carData.createTime = util.formatDateTime(carData.createTime)
        }
        carData._maskedPhone = util.maskPhone(carData.phone)
        carData._displayPhotoUrls = (carData.photos || []).slice()
        page.setData({ carInfo: carData })
        page.fetchMemberInfo(carData.plate)
        page._fetchCarStats(carData.plate)
        // 异步转换跨账号云存储 fileID 为可访问临时 URL
        if (carData.photos && carData.photos.length > 0) {
          page._convertPhotosToUrls(carData.photos).then(function(urls) {
            page.setData({ 'carInfo._displayPhotoUrls': urls })
          })
        }
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    })
  },

  // 按车牌聚合查询：累计消费金额 + 工单数（云函数端聚合）⭐ 优化
  _fetchCarStats(plate) {
    var page = this
    var shopPhone = app.getShopPhone()
    if (!shopPhone || !plate) return

    app.callFunction('repair_main', {
      action: 'getCarOrderStats',
      shopPhone: shopPhone,
      plate: plate
    }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        page.setData({
          'carInfo._totalAmount': res.data.totalAmount || 0,
          'carInfo._orderCount': res.data.orderCount || 0
        })
      } else {
        page.setData({ 'carInfo._totalAmount': 0, 'carInfo._orderCount': 0 })
      }
    }).catch(function () {
      page.setData({ 'carInfo._totalAmount': 0, 'carInfo._orderCount': 0 })
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
              carData.createTime = util.formatDateTime(carData.createTime)
            }
            carData._maskedPhone = util.maskPhone(carData.phone)
            carData._displayPhotoUrls = (carData.photos || []).slice()
            page.setData({ carInfo: carData })
            page._fetchCarStats(carData.plate)
            // 异步转换跨账号云存储 fileID 为可访问临时 URL
            if (carData.photos && carData.photos.length > 0) {
              page._convertPhotosToUrls(carData.photos).then(function(urls) {
                page.setData({ 'carInfo._displayPhotoUrls': urls })
              })
            }
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
            var info = res.data[0]
            // 格式化每条权益的新增时间
            if (info.benefits && info.benefits.length > 0) {
              info.benefits = info.benefits.map(function(b) {
                if (b.addedTime) {
                  b.addedTimeFormatted = util.formatDateTime(b.addedTime).replace(/:\d{2}$/, '')
                }
                return b
              })
            }
            info._displayOperator = util.formatOperatorName(info.operatorName, info.operatorPhone)
            page.setData({ memberInfo: info })
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
                    var mInfo = memberRes.data[0]
                    mInfo._displayOperator = util.formatOperatorName(mInfo.operatorName, mInfo.operatorPhone)
                    page.setData({ memberInfo: mInfo })
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
          // 数组模式：拷贝后移除指定项（避免API失败时本地数据已损坏）
          var updatedBenefits = benefits.slice()
          updatedBenefits.splice(idx, 1)
          var updateData = {
            benefits: updatedBenefits,
            updateTime: db.serverDate()
          }
          // 同步旧字段
          if (updatedBenefits.length > 0) {
            updateData.benefitName = updatedBenefits[0].name
            updateData.benefitTotal = updatedBenefits[0].total
            updateData.benefitRemain = updatedBenefits[0].remain
          } else {
            updateData.benefitName = ''
            updateData.benefitTotal = 0
            updateData.benefitRemain = 0
          }

          util.callRepair('updateMember', { docId: memberInfo._id, updateData: updateData })
            .then(function (res) {
              wx.hideLoading()
              if (res && res.code === 0) {
                if (updatedBenefits.length === 0) {
                  page.setData({
                    'memberInfo.benefits': [],
                    'memberInfo.benefitName': '',
                    'memberInfo.benefitTotal': 0,
                    'memberInfo.benefitRemain': 0
                  })
                } else {
                  page.setData({ 'memberInfo.benefits': updatedBenefits })
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
          amount: Number(benefit.amount) || 0,
          plate: plate,
          operatorPhone: app.getOperatorPhone(),
          operatorName: app.getOperatorName()
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
            // 核销成功后跳转到对应工单详情页
            if (res.data && res.data.orderId) {
              setTimeout(function () {
                wx.navigateTo({ url: '/pages/orderDetail/orderDetail?id=' + res.data.orderId })
              }, 800)
            }
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

  // 📷 VIN车架号OCR识别
  onScanVin() {
    var page = this
    ocrHelper.scanVIN(function (vin) {
      wx.showModal({
        title: '识别结果',
        content: '识别到车架号：' + vin,
        success: function (res) {
          if (res.confirm) {
            page.setData({ 'vehicleForm.vin': vin })
          }
        }
      })
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
        mileage: car.mileage ? String(car.mileage) : '',
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

  // 清除提醒事项日期
  onClearAlertDate(e) {
    var field = e.currentTarget.dataset.field
    this.setData({ ['alertForm.' + field]: '' })
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
        mileage: form.mileage ? Number(form.mileage) : 0,
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
          'carInfo.mileage': form.mileage ? Number(form.mileage) : 0,
          'carInfo.partReplaceName': form.partReplaceName,
          'carInfo.partReplaceDate': form.partReplaceDate
        })
      } else {
        wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
      }
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  // ===== 车辆照片管理 =====

  // 选择照片（最多9张）
  onChoosePhoto() {
    var page = this
    var carInfo = page.data.carInfo
    if (!carInfo || !carInfo._id) return

    var existing = carInfo.photos || []
    var remain = 9 - existing.length
    if (remain <= 0) {
      wx.showToast({ title: '最多9张照片', icon: 'none' })
      return
    }

    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var tempFiles = res.tempFilePaths
        if (!tempFiles || tempFiles.length === 0) return
        page._doUploadPhotos(tempFiles)
      }
    })
  },

  // 执行批量上传
  _doUploadPhotos(tempFiles) {
    var page = this
    var carInfo = page.data.carInfo
    var total = tempFiles.length

    // 确保资源方云环境已就绪（跨账号实例）
    if (!app._resourceCloud) {
      wx.hideLoading()
      wx.showToast({ title: '云环境未就绪，请重试', icon: 'none' })
      return
    }

    wx.showLoading({ title: '上传中 0/' + total })

    var uploadTasks = tempFiles.map(function(filePath, index) {
      var match = filePath.match(/\.(\w+)$/)
      var ext = (match && match[1]) || 'jpg'
      var cloudPath = 'carPhotos/' + app.getShopPhone() + '/' + carInfo._id + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext

      // 使用跨账号资源方云实例上传（小程序模式下 wx.cloud 无资源方环境直接访问权限）
      return app._resourceCloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      }).then(function(res) {
        wx.showLoading({ title: '上传中 ' + (index + 1) + '/' + total })
        return res.fileID
      })
    })

    Promise.all(uploadTasks).then(function(fileIDs) {
      var existing = carInfo.photos || []
      var newPhotos = existing.concat(fileIDs)

      wx.showLoading({ title: '保存中...' })
      util.callRepair('updateCarInfo', {
        docId: carInfo._id,
        updateData: { photos: newPhotos }
      }).then(function(res) {
        if (res && res.code === 0) {
          // 先全量转换 URL，再一次性 setData，避免增量合并的复杂性
          page._convertPhotosToUrls(newPhotos).then(function(urls) {
            wx.hideLoading()
            page.setData({ 'carInfo.photos': newPhotos, 'carInfo._displayPhotoUrls': urls })
            wx.showToast({ title: '上传成功', icon: 'success' })
          })
        } else {
          wx.hideLoading()
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }).catch(function() {
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
      })
    }).catch(function(err) {
      wx.hideLoading()
      console.error('[carDetail] 照片上传失败:', err.errMsg || err)
      wx.showToast({ title: '上传失败', icon: 'none' })
    })
  },

  // 将资源方云存储 fileID 转换为可访问临时 URL（返回 Promise<urls>）
  _convertPhotosToUrls(fileIDs) {
    if (!fileIDs || fileIDs.length === 0) {
      return Promise.resolve([])
    }
    var cloudInst = app._resourceCloud || wx.cloud
    return cloudInst.getTempFileURL({
      fileList: fileIDs.map(function(fid) {
        return { fileID: fid, maxAge: 60 * 60 }
      })
    }).then(function(res) {
      return res.fileList.map(function(item) {
        return item.tempFileURL || item.fileID
      })
    }).catch(function() {
      // fallback: 保持原始 cloud:// fileID
      return fileIDs.slice()
    })
  },

  // 预览照片（全屏浏览）
  onPreviewPhoto(e) {
    var urls = this.data.carInfo._displayPhotoUrls || this.data.carInfo.photos || []
    var idx = e.currentTarget.dataset.index
    wx.previewImage({
      urls: urls,
      current: urls[idx] || urls[0]
    })
  },

  // 删除照片（同步删除云端存储）
  onDeletePhoto(e) {
    var page = this
    var carInfo = page.data.carInfo
    var photos = carInfo.photos || []
    var idx = e.currentTarget.dataset.index

    wx.showModal({
      title: '删除照片',
      content: '确定删除这张照片吗？',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: function(modalRes) {
        if (!modalRes.confirm) return

        var newPhotos = photos.slice()
        var deletedFileID = newPhotos.splice(idx, 1)[0]

        wx.showLoading({ title: '删除中...' })

        // 先尝试删除云端文件（fire-and-forget：失败不阻断 DB 更新）
        var cloudDeletePromise
        if (deletedFileID && app._resourceCloud) {
          cloudDeletePromise = app._resourceCloud.deleteFile({
            fileList: [deletedFileID]
          }).catch(function(err) {
            console.warn('[carDetail] 云端文件删除失败，继续更新数据库:', err)
          })
        } else {
          cloudDeletePromise = Promise.resolve()
        }

        cloudDeletePromise.then(function() {
          util.callRepair('updateCarInfo', {
            docId: carInfo._id,
            updateData: { photos: newPhotos }
          }).then(function(res) {
            if (res && res.code === 0) {
              // 先全量转换 URL，再一次性 setData
              page._convertPhotosToUrls(newPhotos).then(function(urls) {
                wx.hideLoading()
                page.setData({ 'carInfo.photos': newPhotos, 'carInfo._displayPhotoUrls': urls })
                wx.showToast({ title: '已删除', icon: 'success' })
              })
            } else {
              wx.hideLoading()
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          }).catch(function() {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
          })
        })
      }
    })
  }
})
