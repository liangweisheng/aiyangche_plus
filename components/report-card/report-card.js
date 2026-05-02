// components/report-card/report-card.js
// Dashboard 月报摘要卡片

Component({
  properties: {
    // 报告数据（由父组件传入）
    report: {
      type: Object,
      value: null,
      observer: '_onReportChange'
    },
    loading: {
      type: Boolean,
      value: false
    }
  },

  data: {
    score: '--',
    level: '',
    levelText: '',
    revenue: 0,
    orderCount: 0,
    yearMonthLabel: '',
    hasData: false,
    showDot: false
  },

  lifetimes: {
    attached() {
      this._updateDisplay()
    }
  },

  methods: {
    _onReportChange(newVal) {
      if (newVal) {
        this._updateDisplay()
      }
    },

    _updateDisplay() {
      var r = this.data.report
      if (!r || !r.healthScore) {
        this.setData({ hasData: false, score: '--', level: '', levelText: '' })
        return
      }

      var hs = r.healthScore
      var levelMap = { excellent: '优秀', good: '良好', warning: '需改善', critical: '堪忧' }

      // 格式化月份显示
      var ym = r.yearMonth || ''
      var ymlabel = ''
      if (ym) {
        var parts = ym.split('-')
        ymlabel = parts[1] + '月'
        if (parts[1]) ymlabel = parseInt(parts[1], 10) + '月'
        // 显示为"X月报告"
        ymlabel = (parseInt(parts[1], 10)) + '月报告'
      }

      this.setData({
        hasData: true,
        score: hs.total || '--',
        level: hs.level || '',
        levelText: levelMap[hs.level] || '未知',
        revenue: r.revenue || 0,
        orderCount: r.orderCount || 0,
        yearMonthLabel: ymlabel,
        metrics: r.metrics || null,
        showDot: this._checkUnread(ym)
      })
    },

    onCardTap() {
      // 标记已读（清除红点）
      var ym = (this.data.report && this.data.report.yearMonth) || ''
      if (ym) this._markAsRead(ym)
      this.setData({ showDot: false })

      // ★ 只通知父组件，由父组件决定：弹窗 or 跳转
      this.triggerEvent('cardtap', { yearMonth: ym, report: this.data.report })
    },

    /**
     * 检查该月报告是否未读
     * @param {string} yearMonth 格式 '2026-05'
     */
    _checkUnread(yearMonth) {
      if (!yearMonth) return false
      try {
        var readStatus = wx.getStorageSync('report_read_status') || {}
        return !readStatus[yearMonth]
      } catch (e) {
        return false
      }
    },

    /**
     * 标记某月报告为已读
     * @param {string} yearMonth
     */
    _markAsRead(yearMonth) {
      if (!yearMonth) return
      try {
        var readStatus = wx.getStorageSync('report_read_status') || {}
        readStatus[yearMonth] = Date.now()
        wx.setStorageSync('report_read_status', readStatus)
      } catch (e) {
        // 静默失败
      }
    }
  }
})
