// components/shop-guide/shop-guide.js
// 门店信息引导弹窗（首次使用月报功能时弹出）

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: '_onVisibleChange'
    }
  },

  data: {
    bayCount: 2,
    bayCountIndex: 1,
    bayCountOptions: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'],
    openYear: new Date().getFullYear(),
    yearRange: [],
    submitting: false
  },

  lifetimes: {
    attached() {
      // 生成年份选择范围（当前年份往前推20年）
      var now = new Date()
      var curYear = now.getFullYear()
      var years = []
      for (var y = curYear; y >= curYear - 20; y--) {
        years.push(y)
      }
      this.setData({ openYear: curYear, yearRange: years })
    }
  },

  methods: {
    _onVisibleChange(val) {
      // 弹窗显示时重置
      if (val) {
        this.setData({
          bayCount: 2,
          bayCountIndex: 1,
          openYear: new Date().getFullYear(),
          submitting: false
        })
      }
    },

    onBayCountChange(e) {
      var idx = parseInt(e.detail.value)
      var val = parseInt(this.data.bayCountOptions[idx])
      this.setData({ bayCount: val, bayCountIndex: idx })
    },

    onYearChange(e) {
      this.setData({ openYear: this.data.yearRange[e.detail.value] })
    },

    // 提交保存
    onSubmit() {
      var page = this
      var app = getApp()
      var shopInfo = wx.getStorageSync('shopInfo') || {}
      var shopPhone = shopInfo.phone || ''

      if (!shopPhone) {
        wx.showToast({ title: '未登录', icon: 'none' })
        return
      }

      page.setData({ submitting: true })

      app.callFunction('repair_main', {
        action: 'updateShopProfile',
        shopPhone: shopPhone,
        bayCount: page.data.bayCount,
        openYear: page.data.openYear
      }).then(function (res) {
        page.setData({ submitting: false })

        if (res.code === 0) {
          wx.showToast({ title: '已保存', icon: 'success' })
          // 标记已引导过
          try { wx.setStorageSync('monthlyReportGuideShown', true) } catch (e) {}

          // 触发父组件事件
          page.triggerEvent('confirm', {
            bayCount: page.data.bayCount,
            openYear: page.data.openYear
          })

          // 关闭弹窗
          page.triggerEvent('close')
        } else {
          wx.showToast({ title: res.msg || '保存失败', icon: 'none' })
        }
      }).catch(function () {
        page.setData({ submitting: false })
        wx.showToast({ title: '网络异常', icon: 'none' })
      })
    },

    // 稍后再说
    onLater() {
      try { wx.setStorageSync('monthlyReportGuideShown', true) } catch (e) {}
      this.triggerEvent('close')
    },

    // 遮罩关闭（阻止）
    onMaskTap() {
      // 不做任何事，必须选择
    }
  }
})
