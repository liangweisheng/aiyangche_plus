// pages/dataExport/dataExport.js
// 数据导出功能（仅Pro版用户可用）

const app = getApp()

const XLSX = require('../../lib/xlsx.full.min.js')

Page({
  data: {
    exporting: false,
    loadingText: '正在导出...'
  },

  onLoad() {
    if (app.isStaff()) {
      wx.showModal({
        title: '无权限',
        content: '店员无权访问此页面',
        showCancel: false,
        confirmText: '我知道了',
        success: function () { wx.navigateBack() }
      })
      return
    }
    if (!app.isPro()) {
      wx.showModal({
        title: 'Pro版专属功能',
        content: '数据导出功能需要升级Pro版才能使用，请联系客服获取激活码',
        showCancel: false,
        confirmText: '我知道了',
        success: function () { wx.navigateBack() }
      })
      return
    }
    if (!app.isSuperAdmin()) {
      wx.showModal({
        title: '无权限',
        content: '仅超级管理员可使用数据导出功能',
        showCancel: false,
        confirmText: '我知道了',
        success: function () { wx.navigateBack() }
      })
      return
    }
  },

  // 点击导出分类
  onExport(e) {
    if (!app.isPro() || !app.isSuperAdmin()) {
      wx.showModal({
        title: '无权限',
        content: '仅超级管理员可使用数据导出功能',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    var type = e.currentTarget.dataset.type
    var labels = { cars: '车辆信息', members: '会员权益', orders: '订单明细' }
    this.setData({
      exporting: true,
      loadingText: '正在生成' + (labels[type] || '') + 'Excel...'
    })

    var page = this
    app.whenCloudReady().then(function () {
      if (type === 'cars') return page._fetchAndExportCars()
      if (type === 'members') return page._fetchAndExportMembers()
      if (type === 'orders') return page._fetchAndExportOrders()
    }).then(function () {
      page.setData({ exporting: false })
    }).catch(function (err) {
      console.error('导出失败:', err)
      page.setData({ exporting: false })
      wx.showToast({ title: '导出失败，请重试', icon: 'none' })
    })
  },

  // ========== 车辆信息清单 ==========
  _fetchAndExportCars() {
    var page = this
    var db = app.db()
    var shopPhone = app.getShopPhone()
    var where = { shopPhone: shopPhone }

    return page._fetchAll('repair_cars', where).then(function (cars) {
      if (cars.length === 0) {
        wx.showToast({ title: '暂无车辆数据', icon: 'none' })
        return
      }
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
          page._fmtDate(c.createTime),
          page._fmtDateTime(c.updateTime || c.createTime),
          c.remark || ''
        ])
      })
      page._generateAndShare(rows, '车辆信息清单')
    })
  },

  // ========== 会员权益清单 ==========
  _fetchAndExportMembers() {
    var page = this
    var db = app.db()
    var shopPhone = app.getShopPhone()
    var where = { shopPhone: shopPhone }

    return page._fetchAll('repair_members', where).then(function (members) {
      if (members.length === 0) {
        wx.showToast({ title: '暂无会员数据', icon: 'none' })
        return
      }
      var headers = ['序号', '车主姓名', '车主手机号', '绑定车牌号', '权益套餐名称', '权益总次数', '已使用次数', '剩余次数', '生效日期', '到期日期', '登记日期', '登记门店', '备注']
      var rows = [headers]
      var shopInfo = wx.getStorageSync('shopInfo') || {}
      members.forEach(function (m, i) {
        var benefits = m.benefits || []
        if (benefits.length === 0 && m.benefitName) {
          benefits = [{ name: m.benefitName, total: m.benefitTotal || 0, remain: m.benefitRemain || 0 }]
        }
        // 每个权益生成一行
        if (benefits.length === 0) {
          rows.push([
            i + 1, m.ownerName || m.name || '', m.phone || '', m.plate || '',
            '', 0, 0, 0, '', '', page._fmtDate(m.createTime),
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
              j === 0 ? page._fmtDate(m.createTime) : '',
              j === 0 ? (shopInfo.name || '') : '',
              j === 0 ? (m.remark || '') : ''
            ])
          })
        }
      })
      page._generateAndShare(rows, '会员权益清单')
    })
  },

  // ========== 订单明细清单 ==========
  _fetchAndExportOrders() {
    var page = this
    var db = app.db()
    var shopPhone = app.getShopPhone()
    var where = { shopPhone: shopPhone, isVoided: db.command.neq(true) }

    return page._fetchAll('repair_orders', where).then(function (orders) {
      if (orders.length === 0) {
        wx.showToast({ title: '暂无订单数据', icon: 'none' })
        return
      }
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
          page._fmtDateTime(o.createTime),
          '', // 技师
          o.remark || ''
        ])
      })
      page._generateAndShare(rows, '订单明细清单')
    })
  },

  // ========== 分页全量获取 ==========
  _fetchAll(collection, where) {
    var db = app.db()
    var MAX_LIMIT = 100
    var allData = []
    var batch = 0

    function doFetch() {
      return db.collection(collection)
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(batch * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()
        .then(function (res) {
          var data = res.data || []
          allData = allData.concat(data)
          if (data.length === MAX_LIMIT) {
            batch++
            return doFetch()
          }
          return allData
        })
    }

    return doFetch()
  },

  // ========== 生成Excel并分享 ==========
  _generateAndShare(rows, fileName) {
    var page = this
    page.setData({ loadingText: '正在生成Excel文件...' })

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
              page._doShare(savedPath, fileName + '.xlsx')
            },
            fail: function () {
              // saveFile 失败，直接用临时路径
              page._doShare(tmpPath, fileName + '.xlsx')
            }
          })
        },
        fail: function (err) {
          console.error('写文件失败:', err)
          wx.showToast({ title: '文件生成失败', icon: 'none' })
        }
      })
    } catch (err) {
      console.error('生成Excel异常:', err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  },

  // ========== 分享文件（先尝试 shareFileMessage，失败降级 openDocument） ==========
  _doShare(filePath, fileName) {
    var page = this
    var fs = wx.getFileSystemManager()

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
        page.setData({ loading: false })
        wx.showToast({ title: '分享成功', icon: 'success' })
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
                    page.setData({ loading: false })
                    wx.showToast({ title: '已保存', icon: 'success' })
                  },
                  fail: function () {
                    page._openDocFallback(filePath)
                  }
                })
              } else {
                page._openDocFallback(filePath)
              }
            } else {
              page._openDocFallback(filePath)
            }
          },
          fail: function () {
            page.setData({ loading: false })
            cleanup()
          }
        })
      }
    })
  },

  // openDocument 降级方案
  _openDocFallback(filePath) {
    var page = this
    wx.openDocument({
      filePath: filePath,
      showMenu: true,
      fileType: 'xlsx',
      success: function () {
        page.setData({ loading: false })
        wx.showToast({ title: '请在右上角菜单中操作', icon: 'none', duration: 3000 })
      },
      fail: function (err) {
        console.error('openDocument失败:', err)
        page.setData({ loading: false })
        wx.showModal({
          title: '提示',
          content: '文件已生成，但无法打开。请检查手机是否安装了Excel或WPS应用',
          showCancel: false
        })
      }
    })
  },

  // ========== 工具方法 ==========
  _fmtDate(val) {
    if (!val) return ''
    try {
      var d = new Date(val)
      if (isNaN(d.getTime())) return ''
      var y = d.getFullYear()
      var m = ('0' + (d.getMonth() + 1)).slice(-2)
      var day = ('0' + d.getDate()).slice(-2)
      return y + '-' + m + '-' + day
    } catch (e) { return '' }
  },

  _fmtDateTime(val) {
    if (!val) return ''
    try {
      var d = new Date(val)
      if (isNaN(d.getTime())) return ''
      var y = d.getFullYear()
      var mo = ('0' + (d.getMonth() + 1)).slice(-2)
      var day = ('0' + d.getDate()).slice(-2)
      var h = ('0' + d.getHours()).slice(-2)
      var mi = ('0' + d.getMinutes()).slice(-2)
      var s = ('0' + d.getSeconds()).slice(-2)
      return y + '-' + mo + '-' + day + ' ' + h + ':' + mi + ':' + s
    } catch (e) { return '' }
  }
})
