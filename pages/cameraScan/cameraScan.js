// pages/cameraScan/cameraScan.js
// 全屏拍照OCR扫描页面（蒙层镂空效果）
// mode=plate → 车牌识别 | mode=vin → 车架号识别
// 识别结果通过 EventChannel 回传到调用页，降级方案：app.globalData._ocrResult

const app = getApp()
var util = require('../../utils/util')

Page({
  data: {
    mode: 'plate',
    cameraReady: false,
    cameraError: false,
    flashMode: 'off',
    scanTitle: '拍照识别车牌',
    scanTip: '请将车牌对准扫描框',
    heroTitle: '拍照识别车牌号'
  },

  onLoad(options) {
    var mode = options.mode || 'plate'
    var scanTitle = mode === 'plate' ? '拍照识别车牌' : '拍照识别车架号'
    var scanTip = mode === 'plate'
      ? '请将车牌置于框内，点击拍照识别'
      : '请将车架号置于框内，点击拍照识别'
    var heroTitle = mode === 'plate' ? '拍照识别车牌号' : '拍照识别车架号'
    this.setData({ mode: mode, scanTitle: scanTitle, scanTip: scanTip, heroTitle: heroTitle })

    this._cameraReady = false
    this._processing = false
    this._ocrResult = ''
  },

  // ===== 相机生命周期 =====

  onCameraReady() {
    this._cameraReady = true
    this.setData({ cameraReady: true })
    try {
      this._cameraContext = wx.createCameraContext()
    } catch (e) {
      console.warn('[cameraScan] 创建CameraContext失败:', e)
    }
  },

  onCameraError(e) {
    console.warn('[cameraScan] 相机初始化失败:', e.detail)
    this.setData({ cameraError: true, cameraReady: false })
    
    // 自动降级：询问是否使用相册
    wx.showModal({
      title: '相机启动失败',
      content: '是否使用相册识别？',
      confirmText: '从相册选择',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.onChooseAlbum()
        } else {
          this.onGoBack()
        }
      }
    })
  },

  // ===== 拍照 =====

  takePhoto() {
    if (this._processing) return
    if (!this._cameraContext) {
      wx.showToast({ title: '相机未就绪', icon: 'none' })
      return
    }
    this._processing = true
    wx.showLoading({ title: '识别中...' })

    var page = this
    page._cameraContext.takePhoto({
      quality: 'normal',
      success: function (res) {
        console.log('[cameraScan] takePhoto成功, tempPath:', typeof res.tempImagePath, res.tempImagePath ? res.tempImagePath.substring(0, 50) : 'EMPTY')
        page._doOcr(res.tempImagePath)
      },
      fail: function (err) {
        wx.hideLoading()
        page._processing = false
        wx.showToast({ title: '拍照失败，请重试', icon: 'none' })
      }
    })
  },

  // ===== OCR 识别 =====

  _doOcr(tempPath) {
    var page = this
    try {
      var fs = wx.getFileSystemManager()
      var base64 = fs.readFileSync(tempPath, 'base64')

      if (base64.length > 4 * 1024 * 1024) {
        wx.hideLoading()
        page._processing = false
        wx.showToast({ title: '图片过大，请重拍', icon: 'none' })
        return
      }

      var action = page.data.mode === 'plate' ? 'ocrPlate' : 'ocrVIN'
      var resultKey = page.data.mode === 'plate' ? 'plate' : 'vin'
      console.log('[cameraScan] base64长度:', base64.length, '字节')
      console.log('[cameraScan] 开始调用云函数:', action, 'base64前50位:', base64.substring(0, 50))
      console.log('[cameraScan] isCloudReady:', app.isCloudReady ? app.isCloudReady() : 'N/A')

      util.callRepair(action, {
        imgBase64: base64
      }).then(function (res) {
        wx.hideLoading()
        page._processing = false
        console.log('[cameraScan] 云函数返回:', JSON.stringify(res).substring(0, 200))
        if (res && res.code === 0 && res.data && res.data[resultKey]) {
          page._onResult(res.data[resultKey])
        } else {
          wx.showToast({ title: (res && res.msg) || '未识别到内容', icon: 'none' })
        }
      }).catch(function (err) {
        wx.hideLoading()
        page._processing = false
        console.error('[cameraScan] 云函数调用失败, 错误详情:', err)
        console.error('[cameraScan] err.message:', err.message)
        console.error('[cameraScan] err.errCode:', err.errCode)
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      })
    } catch (e) {
      wx.hideLoading()
      page._processing = false
      wx.showToast({ title: '图片读取失败', icon: 'none' })
    }
  },

  // ===== 成功回传结果 =====

  _onResult(value) {
    // 方式1: EventChannel（推荐）
    try {
      var eventChannel = this.getOpenerEventChannel()
      if (eventChannel) {
        eventChannel.emit('ocrResult', { value: value })
      }
    } catch (e) {
      // getOpenerEventChannel 在某些场景可能不可用
    }

    // 方式2: 全局存储 fallback
    if (app.globalData) {
      app.globalData._ocrResult = { value: value, mode: this.data.mode }
      // 兼容旧版调用方（读取 .plate 或 .vin）
      if (this.data.mode === 'plate') {
        app.globalData._ocrResult.plate = value
      } else if (this.data.mode === 'vin') {
        app.globalData._ocrResult.vin = value
      }
    }

    wx.showToast({ title: '识别成功', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 400)
  },

  // ===== 从相册选择 =====

  onChooseAlbum() {
    var page = this
    var action = page.data.mode === 'plate' ? 'ocrPlate' : 'ocrVIN'
    var resultKey = page.data.mode === 'plate' ? 'plate' : 'vin'

    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var tempPath = res.tempFilePaths[0]
        var fs = wx.getFileSystemManager()
        var base64 = ''
        try {
          base64 = fs.readFileSync(tempPath, 'base64')
        } catch (e) {
          wx.showToast({ title: '图片读取失败', icon: 'none' })
          return
        }

        if (base64.length > 4 * 1024 * 1024) {
          wx.showToast({ title: '图片过大', icon: 'none' })
          return
        }

        wx.showLoading({ title: '识别中...' })

        util.callRepair(action, {
          imgBase64: base64
        }).then(function (res) {
          wx.hideLoading()
          if (res && res.code === 0 && res.data && res.data[resultKey]) {
            page._onResult(res.data[resultKey])
          } else {
            wx.showToast({ title: (res && res.msg) || '未识别到内容', icon: 'none' })
          }
        }).catch(function (err) {
          wx.hideLoading()
          console.error('[cameraScan] 相册识别失败:', err)
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
        })
      },
      fail: function (err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '无法获取图片', icon: 'none' })
        }
      }
    })
  },

  // ===== 功能按钮 =====

  onSwitchFlash() {
    var newFlash = this.data.flashMode === 'torch' ? 'off' : 'torch'
    this.setData({ flashMode: newFlash })
  },

  onGoBack() {
    wx.navigateBack()
  }
})
