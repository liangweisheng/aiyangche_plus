// pages/changelog/changelog.js
// 系统更新日志 - 向用户展示持续迭代的功能演进
const app = getApp()
const constants = require('../../utils/constants')

Page({
  data: {
    _isMultiEnd: false,
    // 按时间倒序排列，最新版本在最前面
    // 仅包含对用户有价值的功能演进，不包含内部重构/bug修复
    changelog: [
      {
        version: 'v6.6.1',
        date: '2026-06-06',
        changes: [
          '暂存工单支持生成报价单，一键分享给客户确认',
          '暂存工单支持作废操作，无需完成后再作废',
          'OCR车牌识别迁移至云函数，识别更稳定可靠',
          '首页新增"快速入门"引导，新用户上手更轻松',
          '使用帮助页面全新改版，功能说明更清晰'
        ]
      },
      {
        version: 'v6.6.0',
        date: '2026-06-03',
        changes: [
          '新增更新日志页面，随时了解系统功能演进',
          '新增问题反馈入口，可通过小程序客服在线反馈',
          '开单服务项数据结构优化，提升工单读写稳定性'
        ]
      },
      {
        version: 'v6.5.0',
        date: '2026-06-01',
        changes: [
          '拍照识别车牌和行驶证更稳定、更准确',
          '开单流程优化，操作更省步骤',
          'AI月报生成更可靠'
        ]
      },
      {
        version: 'v6.3.0',
        date: '2026-05-16',
        changes: [
          '电脑端管理后台上线，大屏管理门店更高效'
        ]
      },
      {
        version: 'v6.0',
        date: '2026-05-09',
        changes: [
          '列表页面加载速度大幅提升，翻页更顺滑',
          '数据安全性全面增强'
        ]
      },
      {
        version: 'v5.4.0',
        date: '2026-05-04',
        changes: [
          '底部导航栏可自定义，自由选择显示的功能入口'
        ]
      },
      {
        version: 'v5.3.0',
        date: '2026-05-03',
        changes: [
          'Pro版价格展示优化，体验价和续费价格一目了然'
        ]
      },
      {
        version: 'v5.0.0',
        date: '2026-05-01',
        changes: [
          'AI智能月报，每月自动生成经营诊断报告',
          '行业基准对标，了解门店在同规模中的经营水平',
          '经营趋势分析，掌握新客转化、维保占比等核心指标'
        ]
      },
      {
        version: 'v4.0.0',
        date: '2026-04-18',
        changes: [
          '账号权限系统，支持店主/管理员/店员多种角色',
          '员工管理功能，多人协作管理门店更方便',
          '自定义底部导航栏，按角色显示不同功能'
        ]
      }
    ]
  },

  onLoad: function () {
    var page = this
    var _isMultiEnd = !!(app.globalData && app.globalData._isMultiEndMode)
    page.setData({ _isMultiEnd: _isMultiEnd })
  },

  /** 反馈问题 - 优先使用小程序客服，多端模式降级为拨打电话 */
  onFeedback: function () {
    if (this.data._isMultiEnd) {
      // 多端环境下 open-type="contact" 不可用，降级拨打电话
      wx.makePhoneCall({
        phoneNumber: constants.SERVICE_PHONE,
        fail: function () {
          wx.setClipboardData({
            data: constants.SERVICE_PHONE,
            success: function () {
              wx.showToast({ title: '电话已复制', icon: 'success' })
            }
          })
        }
      })
    }
    // 小程序端通过 WXML 中的 button open-type="contact" 直接触发
    // 此方法仅处理多端降级
  },

  /** 多端模式反馈 - 展示联系方式 */
  onMultiEndFeedback: function () {
    wx.showActionSheet({
      itemList: ['拨打电话', '复制微信'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.makePhoneCall({
            phoneNumber: constants.SERVICE_PHONE,
            fail: function () {
              wx.setClipboardData({
                data: constants.SERVICE_PHONE,
                success: function () {
                  wx.showToast({ title: '电话已复制', icon: 'success' })
                }
              })
            }
          })
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({
            data: constants.SERVICE_WECHAT,
            success: function () {
              wx.showToast({ title: '微信号已复制', icon: 'success' })
            }
          })
        }
      }
    })
  }
})
