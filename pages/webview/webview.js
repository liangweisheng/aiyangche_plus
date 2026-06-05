// pages/webview/webview.js
// 通用 WebView 页面：加载外部 URL（公众号文章等）
const constants = require('../../utils/constants')

Page({
  data: {
    url: constants.QUICK_START_ARTICLE_URL || ''
  },

  onLoad(options) {
    // 优先使用 URL 参数，否则使用 constants 默认值
    const paramUrl = decodeURIComponent(options.url || '')
    if (paramUrl) {
      this.setData({ url: paramUrl })
    }
    // 支持传入 title 参数动态设置导航栏标题
    const paramTitle = decodeURIComponent(options.title || '')
    if (paramTitle) {
      wx.setNavigationBarTitle({ title: paramTitle })
    }
  },

  // web-view 加载失败
  onWebViewError(e) {
    console.error('[webview] 加载失败:', e.detail)
    wx.showToast({ title: '页面加载失败，请稍后重试', icon: 'none' })
  }
})
