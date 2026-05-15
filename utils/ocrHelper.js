/**
 * utils/ocrHelper.js
 * 车牌OCR识别统一入口（v6.1.0）
 * 所有页面共享同一套拍照→压缩→识别→回填流程
 * 方案：云函数 repair_main (action: ocrPlate) → 腾讯云OCR API
 */

var app = getApp()

/**
 * 打开相机/相册 → OCR识别 → 回调
 * @param {Function} callback 识别成功回调(plate)
 * @param {Object} [options]
 * @param {boolean} [options.useCamera=true] 默认优先相机，false=相册
 */
function scanPlate(callback, options) {
  var useCamera = (options && options.useCamera !== false)

  wx.chooseImage({
    count: 1,
    sourceType: useCamera ? ['camera'] : ['album', 'camera'],
    sizeType: ['compressed'],
    success: function (res) {
      var tempPath = res.tempFilePaths[0]

      // 转为 base64
      var fs = wx.getFileSystemManager()
      var base64 = ''
      try {
        base64 = fs.readFileSync(tempPath, 'base64')
      } catch (e) {
        wx.showToast({ title: '图片读取失败', icon: 'none' })
        return
      }

      // base64 过大则提示（云函数 event 限制 ~6MB）
      if (base64.length > 4 * 1024 * 1024) {
        wx.showToast({ title: '图片过大，请重拍', icon: 'none' })
        return
      }

      wx.showLoading({ title: '识别中...' })

      app.callFunction('repair_main', {
        action: 'ocrPlate',
        imgBase64: base64
      }).then(function (res) {
        wx.hideLoading()
        if (res && res.code === 0 && res.data && res.data.plate) {
          callback && callback(res.data.plate)
        } else {
          wx.showToast({ title: res && res.msg || '未识别到车牌', icon: 'none' })
        }
      }).catch(function (err) {
        wx.hideLoading()
        console.error('[ocrHelper] 识别失败:', err)
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      })
    },
    fail: function (err) {
      // 用户取消选择不提示
      if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
        wx.showToast({ title: '无法获取图片', icon: 'none' })
      }
    }
  })
}

/**
 * VIN OCR识别（仿 scanPlate）
 * @param {Function} callback 识别成功回调(vin)
 * @param {Object} [options]
 * @param {boolean} [options.useCamera=true] 默认优先相机，false=相册
 */
function scanVIN(callback, options) {
  var useCamera = (options && options.useCamera !== false)

  wx.chooseImage({
    count: 1,
    sourceType: useCamera ? ['camera'] : ['album', 'camera'],
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
        wx.showToast({ title: '图片过大，请重拍', icon: 'none' })
        return
      }

      wx.showLoading({ title: '识别中...' })

      app.callFunction('repair_main', {
        action: 'ocrVIN',
        imgBase64: base64
      }).then(function (res) {
        wx.hideLoading()
        if (res && res.code === 0 && res.data && res.data.vin) {
          callback && callback(res.data.vin)
        } else {
          wx.showToast({ title: res && res.msg || '未识别到车架号', icon: 'none' })
        }
      }).catch(function (err) {
        wx.hideLoading()
        console.error('[ocrHelper] VIN识别失败:', err)
        wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      })
    },
    fail: function (err) {
      if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
        wx.showToast({ title: '无法获取图片', icon: 'none' })
      }
    }
  })
}

module.exports = { scanPlate, scanVIN }
