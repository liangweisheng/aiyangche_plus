// components/case-modal/case-modal.js
// 标杆案例图片弹窗（云存储版）
// v5.0.0 Phase 4 - 支持云存储 fileID 自动转换为临时 URL

var caseImages = require('../../utils/caseImages')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: '_onVisibleChange'
    },
    caseTag: {
      type: String,
      value: ''
    },
    caseTitle: {
      type: String,
      value: ''
    }
  },

  data: {
    images: [],           // 当前案例图片列表（已转换的可访问 URL）
    currentIndex: 0,      // 当前显示的图片索引
    totalImages: 0,
    imageLoading: false,  // 图片转换中的 loading 状态
    loadFailed: false     // 加载失败标记
  },

  // ★ 健壮性升级：标记组件是否已销毁（防止超时后回调操作已关闭组件）
  _destroyed: false,

  lifetimes: {
    detached: function () {
      this._destroyed = true
    }
  },

  methods: {
    _onVisibleChange(val) {
      if (val && this.data.caseTag) {
        // ★ 缓存命中：相同 caseTag 且已加载过 → 直接复用，不重复请求
        if (this._cachedTag === this.data.caseTag && this.data.images.length > 0) {
          return
        }
        this._loadCaseImages()
      } else {
        this.setData({ currentIndex: 0 })  // 关闭时不清空 images，保留缓存
      }
    },

    /** 根据 caseTag 加载对应案例图片（含云存储 fileID → tempURL 转换） */
    _loadCaseImages() {
      var page = this
      var app = getApp()              // ★ 修复：方法内获取，确保 _resourceCloud 引用有效
      var tag = page.data.caseTag || ''
      var fileIds = caseImages.getCaseImages(tag)
      // 使用 _resourceCloud 跨账号实例（多端兼容）
      var cloudInst = (app && app._resourceCloud) || wx.cloud

      // 无图片 → 显示空态
      if (!fileIds || fileIds.length === 0) {
        page.setData({
          images: [],
          totalImages: 0,
          currentIndex: 0,
          imageLoading: false,
          loadFailed: false
        })
        return
      }

      // 有图片 → 开始加载
      page.setData({ imageLoading: true, loadFailed: false })

      // 构造原始 Promise（使用 _resourceCloud 跨账号实例）
      var requestPromise = cloudInst.getTempFileURL({
        fileList: fileIds.map(function (fid) { return { fileID: fid, maxAge: 60 * 60 } })
      })

      // ★ 超时保护（10秒）：防止 getTempFileURL 挂起无响应
      var timeoutPromise = new Promise(function (_, reject) {
        setTimeout(function () {
          reject({ code: 'TIMEOUT', message: 'getTempFileURL 超时(10s)，云环境可能未就绪' })
        }, 10000)
      })

      Promise.race([requestPromise, timeoutPromise]).then(function (res) {
        // ★ 健壮性升级：组件已销毁时不更新状态（防止超时后回调操作已关闭组件）
        if (page._destroyed) return

        if (!res.fileList || res.fileList.length === 0) {
          return
        }

        // 提取成功转换的 URL
        var urls = []
        res.fileList.forEach(function (item) {
          if (item.status === 0 && item.tempFileURL) {
            urls.push(item.tempFileURL)
          }
        })

        if (urls.length > 0) {
          page._cachedTag = tag
          page.setData({
            images: urls,
            totalImages: urls.length,
            currentIndex: 0,
            imageLoading: false,
            loadFailed: false
          })
        } else {
          page._setLoadError()
        }
      }).catch(function (err) {
        // ★ 健壮性升级：组件已销毁时不更新状态
        if (page._destroyed) return

        page._setLoadError()
      })
    },

    /** 设置加载失败状态 */
    _setLoadError() {
      this.setData({
        images: [],
        totalImages: 0,
        currentIndex: 0,
        imageLoading: false,
        loadFailed: true
      })
    },

    /** 关闭弹窗 */
    onClose() {
      this.triggerEvent('close')
    },

    onMaskTap() {
      this.triggerEvent('close')
    },

    onPrev() {
      var idx = this.data.currentIndex
      var total = this.data.totalImages
      if (total <= 1) return
      this.setData({
        currentIndex: idx <= 0 ? total - 1 : idx - 1
      })
    },

    onNext() {
      var idx = this.data.currentIndex
      var total = this.data.totalImages
      if (total <= 1) return
      this.setData({
        currentIndex: idx >= total - 1 ? 0 : idx + 1
      })
    },

    /** 阻止事件冒泡到遮罩层 */
    preventBubble() {},

    onImageError(e) {
      // 图片加载失败时静默处理，不阻塞用户操作
    }
  }
})
