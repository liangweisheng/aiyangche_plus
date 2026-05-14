// 车牌键盘组件
// 规则：第1位汉字(省份)，第2位字母，第3位起数字+字母，燃油车7位/新能源车8位
Component({
  properties: {
    visible: { type: Boolean, value: false },
    value: { type: String, value: '' },
    mode: { type: String, value: 'plate' } // 'plate' | 'alnum'
  },

  data: {
    plate: [],
    currentPos: 0,
    maxLength: 7,
    isEnergy: false,
    _alnumValue: '',

    // 第1位：省份简称
    provinceKeys: [
      '桂','京','津','沪','渝','冀','豫','云','辽','黑','湘',
      '皖','鲁','新','苏','浙','赣','鄂','甘','晋',
      '蒙','陕','吉','闽','贵','粤','川','青','藏','琼','宁'
    ],
    // 第2位：字母（排除I）
    letterKeys: [
      'A','B','C','D','E','F','G',
      'H','J','K','L','M','N','P',
      'Q','R','S','T','U','V','W',
      'X','Y','Z'
    ],
    // 第3-7/8位：数字+字母（排除I和O）
    mixKeys: [
      '0','1','2','3','4','5','6','7','8','9',
      'A','B','C','D','E','F','G',
      'H','J','K','L','M','N','P',
      'Q','R','S','T','U','V','W',
      'X','Y','Z'
    ],
    // 拆分键盘：数字区 + 字母区
    digitKeys: ['0','1','2','3','4','5','6','7','8','9'],
    remainingLetterKeys: [
      'A','B','C','D','E','F','G',
      'H','J','K','L','M','N','P',
      'Q','R','S','T','U','V','W',
      'X','Y','Z'
    ]
  },

  observers: {
    'value': function(val) {
      if (this.data.mode === 'alnum') {
        this.setData({ _alnumValue: val || '' });
      } else if (val) {
        this.setData({ plate: val.split('') });
      }
    }
  },

  lifetimes: {
    attached() {
      if (this.data.value) {
        this.setData({ plate: this.data.value.split('') });
      }
    }
  },

  methods: {
    stopPropagation() {},

    onMaskTap() {
      this.triggerEvent('cancel');
    },

    onCellTap(e) {
      var pos = e.currentTarget.dataset.pos;
      this.setData({ currentPos: pos });
    },

    onKeyPress(e) {
      var val = e.currentTarget.dataset.val;

      // alnum 模式：直接拼接，最多17位
      if (this.data.mode === 'alnum') {
        var cur = this.data._alnumValue || '';
        if (cur.length >= 17) return;
        cur += val;
        this.setData({ _alnumValue: cur });
        this.triggerEvent('input', { value: cur });
        return;
      }

      var plate = this.data.plate.slice();
      var pos = this.data.currentPos;
      var maxLen = this.data.maxLength;

      if (pos >= maxLen) return;

      plate[pos] = val;
      this.setData({ plate: plate });

      // 自动跳到下一个位置
      if (pos < maxLen - 1) {
        this.setData({ currentPos: pos + 1 });
      }
    },

    onDelete() {
      // alnum 模式：删除最后一个字符
      if (this.data.mode === 'alnum') {
        var cur = this.data._alnumValue || '';
        if (cur.length > 0) {
          cur = cur.substring(0, cur.length - 1);
          this.setData({ _alnumValue: cur });
          this.triggerEvent('input', { value: cur });
        }
        return;
      }

      var plate = this.data.plate.slice();
      var pos = this.data.currentPos;

      if (pos > 0) {
        plate[pos - 1] = '';
        this.setData({ plate: plate, currentPos: pos - 1 });
      }
    },

    switchType(e) {
      var isEnergy = e.currentTarget.dataset.energy;
      var plate = this.data.plate.slice();
      var maxLen = isEnergy ? 8 : 7;

      // 切换到普通车时，截掉第8位
      if (!isEnergy && plate.length > 7) {
        plate = plate.slice(0, 7);
        if (this.data.currentPos >= 7) {
          this.setData({ currentPos: 6 });
        }
      }

      this.setData({
        isEnergy: isEnergy,
        maxLength: maxLen,
        plate: plate
      });
    },

    onConfirm() {
      // alnum 模式：直接返回当前值，不校验长度
      if (this.data.mode === 'alnum') {
        var val = this.data._alnumValue || '';
        this.triggerEvent('cancel');
        this.triggerEvent('confirm', { value: val });
        return;
      }

      var plateStr = this.data.plate.join('');
      var minLen = this.data.maxLength;

      if (plateStr.length < minLen) {
        wx.showToast({ title: '车牌号位数不足', icon: 'none' });
        return;
      }

      // 先隐藏键盘，再触发事件（确保父页面能正确接收）
      this.triggerEvent('cancel');
      this.triggerEvent('confirm', { value: plateStr });
    }
  }
});
