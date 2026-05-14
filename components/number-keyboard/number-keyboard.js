// 自定义数字键盘组件（用于金额输入）
Component({
  properties: {
    visible: { type: Boolean, value: false },
    value: { type: String, value: '' },
    decimal: { type: Boolean, value: true }
  },

  data: {
    inputValue: ''
  },

  observers: {
    'visible': function(vis) {
      if (vis) {
        this.setData({ inputValue: this.properties.value || '' })
      }
    },
    'value': function(val) {
      if (this.data.visible) {
        this.setData({ inputValue: val || '' })
      }
    }
  },

  methods: {
    stopPropagation() {},

    onMaskTap() {
      this.triggerEvent('cancel')
    },

    onKeyPress(e) {
      var val = e.currentTarget.dataset.val
      var cur = this.data.inputValue
      cur += val
      this.setData({ inputValue: cur })
      this.triggerEvent('input', { value: cur })
    },

    onDelete() {
      var cur = this.data.inputValue
      if (cur.length > 0) {
        cur = cur.substring(0, cur.length - 1)
        this.setData({ inputValue: cur })
        this.triggerEvent('input', { value: cur })
      }
    },

    onConfirm() {
      var val = this.data.inputValue
      this.triggerEvent('confirm', { value: val })
    },

    onNext() {
      var val = this.data.inputValue
      this.triggerEvent('next', { value: val })
    }
  }
})
