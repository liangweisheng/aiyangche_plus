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

  methods: {
    _onVisibleChange(val) {
      if (val && this.data.caseTag) {
        this._loadCaseImages()
      } else {
        this.setData({ images: [], currentIndex: 0, totalImages: 0, loadFailed: false })
      }
    },

    /** 根据 caseTag 加载对应案例图片（含云存储 fileID → tempURL 转换） */
    _loadCaseImages() {
      var page = this
      var tag = page.data.caseTag || ''
      var fileIds = caseImages.getCaseImages(tag)

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

      // 批量将 fileID 转换为临时下载链接
      wx.cloud.getTempFileURL({
        fileList: fileIds.map(function (fid) { return { fileID: fid, maxAge: 60 * 60 } })  // 有效期1小时
      }).then(function (res) {
        if (!res.fileList || res.fileList.length === 0) {
          page._setLoadError()
          return
        }

        // 提取成功转换的 URL
        var urls = []
        res.fileList.forEach(function (item) {
          if (item.status === 0 && item.tempFileURL) {
            urls.push(item.tempFileURL)
          } else {
            console.warn('[case-modal] fileID 转换失败:', item.fileID, item.errMsg)
          }
        })

        if (urls.length > 0) {
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
        console.error('[case-modal] getTempFileURL 失败:', err)
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
      console.warn('[case-modal] 图片加载失败:', e.detail)
    }
  }
})
