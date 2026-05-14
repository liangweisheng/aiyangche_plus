// pages/staffProfile/staffProfile.js
// 员工"我的资料"独立页面

const app = getApp()
const util = require('../../utils/util')
const constants = require('../../utils/constants')

Page({
  data: {
    staffPhone: '',
    staffDisplayName: '',
    versionLabel: '',
    staffContactExpanded: false,
    servicePhone: '',
    serviceWechat: '',
    _isMultiEnd: false
  },

  onLoad() {
    var page = this
    // 多端模式检测
    var _isMultiEnd = !!(app.globalData && app.globalData._isMultiEndMode)
    page.setData({
      _isMultiEnd: _isMultiEnd,
      servicePhone: constants.SERVICE_PHONE,
      serviceWechat: constants.SERVICE_WECHAT
    })

    // 权限守卫：仅店员可访问
    var isStaff = app.isStaff ? app.isStaff() : false
    if (!isStaff) {
      wx.showToast({ title: '无权限', icon: 'none' })
      var pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/dashboard/dashboard' })
      }
      return
    }

    // 加载资料
    page._loadStaffProfile()
  },

  /** 加载员工个人资料 */
  _loadStaffProfile() {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var phone = shopInfo.phone || ''
    var displayName = shopInfo.displayName || ''
    var isPro = app.isPro ? app.isPro() : false
    var ver = constants.APP_VERSION
    var versionLabel = ver + (isPro ? ' Pro版' : ' 免费版')
    this.setData({
      staffPhone: phone ? util.maskPhone(phone) : '未绑定',
      staffDisplayName: displayName,
      versionLabel: versionLabel
    })
  },

  /** 编辑显示名称 */
  onEditStaffDisplayName() {
    var page = this
    wx.showModal({
      title: '编辑显示名称',
      editable: true,
      placeholderText: '如：张师傅、小王',
      content: page.data.staffDisplayName || '',
      success: function (res) {
        if (res.confirm) {
          var name = (res.content || '').trim()
          page.setData({ staffDisplayName: name })
          // 更新云端（使用专用 action，避免 admin 权限限制）
          util.callRepair('updateMyDisplayName', { value: name })
            .then(function (res) {
              if (res && res.code === 0) {
                wx.showToast({ title: '已保存', icon: 'success' })
              } else {
                wx.showToast({ title: (res && res.msg) || '保存失败', icon: 'none' })
              }
            })
            .catch(function () {
              wx.showToast({ title: '网络异常', icon: 'none' })
            })
          // 更新本地缓存
          var shopInfo = wx.getStorageSync('shopInfo') || {}
          shopInfo.displayName = name
          wx.setStorageSync('shopInfo', shopInfo)
        }
      }
    })
  },

  /** 切换联系客服折叠 */
  toggleStaffContact() {
    this.setData({ staffContactExpanded: !this.data.staffContactExpanded })
  },

  /** 复制微信号 */
  onCopyStaffWechat() {
    wx.setClipboardData({
      data: constants.SERVICE_WECHAT,
      success: function () {
        wx.showToast({ title: '微信号已复制', icon: 'success' })
      }
    })
  },

  /** 拨打客服电话 */
  onCallStaffPhone() {
    wx.makePhoneCall({
      phoneNumber: constants.SERVICE_PHONE,
      fail: function () {
        wx.setClipboardData({
          data: constants.SERVICE_PHONE,
          success: function () {
            wx.showToast({ title: '电话号码已复制', icon: 'success' })
          }
        })
      }
    })
  },

  /** 使用帮助（跳转视频号，多端提示不可用） */
  onGoStaffVideoHelp() {
    if (this.data._isMultiEnd) {
      wx.showToast({ title: '仅小程序端可用', icon: 'none' })
      return
    }
    wx.openChannelsUserProfile({
      finderUserName: 'sphcnacQ1SzOvLi',
      fail: function (err) {
        console.error('打开视频号失败', err)
        wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
      }
    })
  },

  /** 下载APP入口 */
  onDownloadApp() {
    wx.showModal({
      title: '下载手机APP',
      content: '请联系客服下载和安装。',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /** 查看隐私政策 */
  onGoPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  },

  /** 查看用户服务协议 */
  onGoAgreement() {
    wx.navigateTo({ url: '/pages/userAgreement/userAgreement' })
  },

  /** 员工退出登录 */
  onStaffLogout() {
    getApp().staffLogout()
  }
})
