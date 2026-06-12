// pages/dataExport/dataExport.js
// 数据导出功能 - v6.0
// 云函数统一数据获取（exportData），替代客户端 _fetchAll 多次分批请求

const app = getApp()
var util = require('../../utils/util')
var constants = require('../../utils/constants')

const XLSX = require('./xlsx.full.min.js')

Page({
  data: {
    exporting: false,
    loadingText: '正在导出...',
    // 库存流水筛选弹窗
    showStockFilter: false,
    filterLogType: '',
    filterStartDate: '',
    filterEndDate: '',
    today: util.formatDate(new Date())
  },

  onLoad() {
    // 重置导出状态（防止上次中断残留）
    this.setData({ exporting: false, today: util.formatDate(new Date()) })
    if (!app.checkPageAccess('superAdmin+pro')) return
  },

  // 点击导出分类
  onExport(e) {
    if (!app.isPro() || !app.isSuperAdmin()) {
      wx.showModal({
        title: '无权限',
        content: '仅店主账号可使用数据导出功能',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    var type = e.currentTarget.dataset.type

    // 库存流水：先弹筛选窗，选完后统一导出
    if (type === 'stock_logs') {
      this.setData({
        showStockFilter: true,
        filterLogType: '',
        filterStartDate: '',
        filterEndDate: ''
      })
      return
    }

    // 其他类型直接导出
    this._startExport(type)
  },

  // 真正开始导出的入口
  _startExport(type, filterParams) {
    filterParams = filterParams || {}
    var labels = { cars: '车辆信息', members: '会员权益', orders: '订单明细', stock_logs: '库存明细' }
    this.setData({
      exporting: true,
      loadingText: '正在生成' + (labels[type] || '') + 'Excel...'
    })

    var page = this
    page._fetchAndExport(type, filterParams).then(function () {
      page.setData({ exporting: false })
    }).catch(function (err) {
      console.error('导出失败:', err)
      page.setData({ exporting: false })
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    })
  },

  // ========== 库存流水筛选弹窗 ==========
  // 选择流水类型
  onSelectLogType(e) {
    var val = e.currentTarget.dataset.value
    this.setData({ filterLogType: this.data.filterLogType === val ? '' : val })
  },

  // 选择开始日期
  onFilterStartDate(e) {
    this.setData({ filterStartDate: e.detail.value })
  },

  // 选择结束日期
  onFilterEndDate(e) {
    this.setData({ filterEndDate: e.detail.value })
  },

  // 取消筛选
  onCancelFilter() {
    this.setData({ showStockFilter: false })
  },

  // 确认筛选并导出
  onConfirmFilter() {
    var filterParams = {}
    if (this.data.filterLogType) filterParams.logType = this.data.filterLogType
    if (this.data.filterStartDate) filterParams.startDate = this.data.filterStartDate
    if (this.data.filterEndDate) filterParams.endDate = this.data.filterEndDate
    this.setData({ showStockFilter: false })
    this._startExport('stock_logs', filterParams)
  },

  // ========== 统一云函数获取数据 ==========
  _fetchExportData(type, filterParams) {
    filterParams = filterParams || {}
    var params = {
      shopPhone: app.getShopPhone(),
      type: type
    }
    // 合并筛选参数
    if (filterParams.logType) params.logType = filterParams.logType
    if (filterParams.startDate) params.startDate = filterParams.startDate
    if (filterParams.endDate) params.endDate = filterParams.endDate
    return util.callRepair('exportData', params).then(function (res) {
      if (res.code !== 0 || !res.data) return []
      return res.data.list || []
    })
  },

  // ========== 车辆信息清单 ==========
  _fetchAndExport(type, filterParams) {
    filterParams = filterParams || {}
    var page = this
    return page._fetchExportData(type, filterParams).then(function (dataList) {
      if (dataList.length === 0) {
        var labels = { cars: '车辆', members: '会员', orders: '订单', stock_logs: '库存' }
        wx.showToast({ title: '暂无' + (labels[type] || '') + '数据', icon: 'none' })
        return
      }

      var rows
      if (type === 'cars') {
        rows = page._buildCarRows(dataList)
      } else if (type === 'members') {
        rows = page._buildMemberRows(dataList)
      } else if (type === 'orders') {
        rows = page._buildOrderRows(dataList)
      } else if (type === 'stock_logs') {
        rows = page._buildStockLogRows(dataList)
      }

      if (rows) {
        var fileName = page._buildFileName(type, filterParams)
        return page._generateAndShare(rows, fileName)
      }
    })
  },

  // 根据类型和筛选条件动态生成文件名
  _buildFileName(type, filterParams) {
    filterParams = filterParams || {}
    var names = { cars: '车辆信息清单', members: '会员权益清单', orders: '订单明细清单', stock_logs: '库存明细清单' }
    var base = names[type] || '数据清单'
    if (type === 'stock_logs') {
      var suffix = ''
      var typeLabels = { in: '入库', out: '出库', adjust: '调整' }
      if (filterParams.logType) suffix += '_' + (typeLabels[filterParams.logType] || filterParams.logType)
      if (filterParams.startDate && filterParams.endDate) {
        suffix += '_' + filterParams.startDate + '~' + filterParams.endDate
      } else if (filterParams.startDate) {
        suffix += '_' + filterParams.startDate + '起'
      } else if (filterParams.endDate) {
        suffix += '_' + filterParams.endDate + '止'
      }
      return base + suffix
    }
    return base
  },

  _buildCarRows(cars) {
    var headers = ['序号', '车牌号', '品牌/车型', 'VIN码（车架号）', '发动机号', '车主姓名', '车主手机号', '上牌日期', '保险到期日', '年检到期日', '车辆颜色', '当前行驶里程', '车辆状态', '首次入店日期', '最后更新时间', '备注']
    var rows = [headers]
    cars.forEach(function (c, i) {
      rows.push([
        i + 1,
        c.plate || '',
        c.carType || '',
        c.vin || '',
        c.engineNo || '',
        c.ownerName || '',
        c.phone || '',
        c.registerDate || '',
        c.insuranceDate || '',
        c.inspectDate || '',
        c.color || '',
        c.mileage || 0,
        '在册',
        util.formatDate(c.createTime),
        util.formatDateTime(c.updateTime || c.createTime),
        c.remark || ''
      ])
    })
    return rows
  },

  _buildMemberRows(members) {
    var headers = ['序号', '车主姓名', '车主手机号', '绑定车牌号', '权益套餐名称', '权益总次数', '已使用次数', '剩余次数', '生效日期', '到期日期', '登记日期', '登记门店', '备注']
    var rows = [headers]
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    members.forEach(function (m, i) {
      var benefits = m.benefits || []
      if (benefits.length === 0 && m.benefitName) {
        benefits = [{ name: m.benefitName, total: m.benefitTotal || 0, remain: m.benefitRemain || 0 }]
      }
      if (benefits.length === 0) {
        rows.push([
          i + 1, m.ownerName || m.name || '', m.phone || '', m.plate || '',
          '', 0, 0, 0, '', '', util.formatDate(m.createTime),
          shopInfo.name || '', m.remark || ''
        ])
      } else {
        benefits.forEach(function (b, j) {
          var total = Number(b.total) || 0
          var remain = Number(b.remain) || 0
          var used = total - remain
          rows.push([
            j === 0 ? (i + 1) : '',
            j === 0 ? (m.ownerName || m.name || '') : '',
            j === 0 ? (m.phone || '') : '',
            j === 0 ? (m.plate || '') : '',
            b.name || '',
            total,
            used,
            remain,
            b.startDate || '',
            b.expireDate || '',
            j === 0 ? util.formatDate(m.createTime) : '',
            j === 0 ? (shopInfo.name || '') : '',
            j === 0 ? (m.remark || '') : ''
          ])
        })
      }
    })
    return rows
  },

  _buildOrderRows(orders) {
    var headers = ['序号', '订单编号', '车牌号', '车主姓名', '车主手机号', '工单类型', '服务项目明细', '配件明细', '工时费', '配件费', '总金额', '优惠金额', '实付金额', '开工时间', '交车时间', '订单状态', '创建时间', '技师/经办人', '备注']
    var rows = [headers]
    orders.forEach(function (o, i) {
      var status = o.status || '已完成'
      if (o.isVoided) status = '已作废'
      var payLabel = (o.payMethod === '2') ? '挂账' : '现付'
      rows.push([
        i + 1,
        o._id ? o._id.substring(0, 8).toUpperCase() : '',
        o.plate || '',
        '', // 车主姓名需要关联合并，留空
        '', // 车主手机号
        payLabel,
        o.serviceItems || '',
        o.partReplaceName || '',
        o.totalAmount || 0,
        0,
        o.totalAmount || 0,
        0,
        o.paidAmount || 0,
        '', // 开工时间
        '', // 交车时间
        status,
        util.formatDateTime(o.createTime),
        util.formatOperatorName(o.operatorName, o.operatorPhone) || '',
        o.remark || ''
      ])
    })
    return rows
  },

  _buildStockLogRows(logs) {
    var typeLabels = { in: '入库', out: '出库', adjust: '调整' }
    var headers = ['序号', '商品名称', '规格', '流水类型', '数量', '单价', '供货商', '关联工单', '时间', '操作人', '备注']
    var rows = [headers]
    logs.forEach(function (l, i) {
      var qty = Number(l.quantity) || 0
      if (l.type === 'out') qty = -qty  // 出库显示负数
      rows.push([
        i + 1,
        l.productName || '',
        l.spec || '',
        typeLabels[l.type] || l.type || '',
        qty,
        l.cost || 0,
        l.supplier || '',
        l.orderRef ? l.orderRef.substring(0, 8).toUpperCase() : '',
        l.createTime ? util.formatDateTime(l.createTime) : '',
        l.operator || '',
        l.remark || ''
      ])
    })
    return rows
  },

  // ========== 生成Excel并分享 ==========
  _generateAndShare(rows, fileName) {
    var page = this
    page.setData({ loadingText: '正在生成Excel文件...' })

    return new Promise(function (resolve, reject) {
      try {
        var wb = XLSX.utils.book_new()
        var ws = XLSX.utils.aoa_to_sheet(rows)

        // 设置列宽
        var colWidths = []
        rows.forEach(function (row) {
          row.forEach(function (cell, ci) {
            var len = String(cell || '').length
            var w = Math.max(len * 2, 8)
            if (w > 30) w = 30
            if (!colWidths[ci] || w > colWidths[ci]) {
              colWidths[ci] = w
            }
          })
        })
        ws['!cols'] = colWidths.map(function (w) { return { wch: w + 2 } })

        // 表头样式（浅灰背景+加粗）
        if (rows.length > 0) {
          for (var ci = 0; ci < rows[0].length; ci++) {
            var cellRef = XLSX.utils.encode_cell({ r: 0, c: ci })
            if (ws[cellRef]) {
              ws[cellRef].s = {
                font: { bold: true },
                fill: { fgColor: { rgb: 'F0F0F0' } },
                alignment: { horizontal: 'center', vertical: 'center' }
              }
            }
          }
        }

        XLSX.utils.book_append_sheet(wb, ws, fileName)
        var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

        page.setData({ loadingText: '正在准备分享...' })

        // 先写入临时文件，再 saveFile 到持久化存储（沙箱外可访问）
        var tmpPath = wx.env.USER_DATA_PATH + '/_tmp_' + fileName + '.xlsx'
        var fs = wx.getFileSystemManager()
        fs.writeFile({
          filePath: tmpPath,
          data: wbout.buffer || wbout,
          success: function () {
            // saveFile: 临时文件 → 小程序持久化存储（不会被立即清理）
            fs.saveFile({
              tempFilePath: tmpPath,
              success: function (res) {
                var savedPath = res.savedFilePath
                page._doShare(savedPath, fileName + '.xlsx', resolve)
              },
              fail: function () {
                // saveFile 失败，直接用临时路径
                page._doShare(tmpPath, fileName + '.xlsx', resolve)
              }
            })
          },
          fail: function (err) {
            console.error('写文件失败:', err)
            page.setData({ exporting: false })
            wx.showToast({ title: '文件生成失败', icon: 'none' })
            reject(err)
          }
        })
      } catch (err) {
        console.error('生成Excel异常:', err)
        page.setData({ exporting: false })
        wx.showToast({ title: '导出失败', icon: 'none' })
        reject(err)
      }
    })
  },

  // ========== 分享文件（先尝试 shareFileMessage，失败降级 openDocument） ==========
  _doShare(filePath, fileName, resolveCb) {
    var page = this
    var fs = wx.getFileSystemManager()

    function done() {
      page.setData({ exporting: false })
      if (resolveCb) resolveCb()
    }

    function cleanup() {
      // 清理持久化存储中的导出文件，避免占用空间
      setTimeout(function () {
        try { fs.unlinkSync(filePath) } catch (e) { }
      }, 60000)
    }

    wx.shareFileMessage({
      filePath: filePath,
      fileName: fileName,
      success: function () {
        wx.showToast({ title: '分享成功', icon: 'success' })
        done()
        cleanup()
      },
      fail: function (err) {
        console.error('shareFileMessage失败:', err)
        // 降级：让用户选择操作方式
        wx.showActionSheet({
          itemList: ['保存到手机', '用其他应用打开'],
          success: function (res) {
            if (res.tapIndex === 0) {
              // 保存到手机
              if (wx.saveFileToDisk) {
                wx.saveFileToDisk({
                  filePath: filePath,
                  success: function () {
                    wx.showToast({ title: '已保存', icon: 'success' })
                    done()
                  },
                  fail: function () {
                    page._openDocFallback(filePath, done)
                  }
                })
              } else {
                page._openDocFallback(filePath, done)
              }
            } else {
              page._openDocFallback(filePath, done)
            }
          },
          fail: function () {
            done()
            cleanup()
          }
        })
      }
    })
  },

  // openDocument 降级方案
  _openDocFallback(filePath, doneCb) {
    var page = this
    wx.openDocument({
      filePath: filePath,
      showMenu: true,
      fileType: 'xlsx',
      success: function () {
        page.setData({ exporting: false })
        if (doneCb) doneCb()
        wx.showToast({ title: '请在右上角菜单中操作', icon: 'none', duration: 3000 })
      },
      fail: function (err) {
        console.error('openDocument失败:', err)
        page.setData({ exporting: false })
        if (doneCb) doneCb()
        wx.showModal({
          title: '提示',
          content: '文件已生成，但无法打开。请检查手机是否安装了Excel或WPS应用',
          showCancel: false
        })
      }
    })
  },

})
