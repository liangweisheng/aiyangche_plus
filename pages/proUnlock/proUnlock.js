// pages/proUnlock/proUnlock.js
// 我的页面 - 门店信息展示 + Pro激活状态判断
// Pro判定规则：code 有值 && expireTime 未过期

const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    activationCode: '',
    isPro: false,
    isAdmin: false,
    usedCount: 0,
    unlocking: false,
    shopName: '',
    shopPhone: '',
    shopCode: '',
    versionLabel: '免费版',
    expireLabel: '无',
    registerDate: '',
    renewTip: '',     // 续费提醒文案
    showRenew: false,   // 是否显示续费提醒
    shopTel: '',      // 门店联系电话
    shopAddr: '',     // 门店地址
    isGuest: false,   // 游客模式
    roleLabel: '',    // 账号类型标签
    roleTagClass: '', // 账号类型样式类
    contactExpanded: false,    // 联系客服折叠状态
    shopCodeExpanded: false,   // 门店码折叠状态
    isOwner: false,            // 是否超级管理员（注册者本人）
    // 员工管理
    staffExpanded: false,
    staffList: [],
    staffPhoneInput: '',
    staffRoleIndex: 0,
    staffRoleOptions: [{ label: '店员', value: 'staff' }, { label: '管理员', value: 'admin' }],
    staffAdding: false,
    // v5.0.0 门店设置（经营诊断配置）
    shopProfileExpanded: false,
    shopBayCount: 2,
    shopBayCountIndex: 1,  // 默认索引（对应值2）
    bayCountOptions: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20'],
    shopOpenYear: new Date().getFullYear(),
    shopProfileSaving: false,
    currentYear: new Date().getFullYear()
  },

  onLoad: function () {
    var page = this
    // 统一用 shopPhone 判断游客模式（与 dashboard 保持一致）
    var sp = (app.getShopPhone && app.getShopPhone()) || ''
    var isGuest = (sp === '13507720000')
    if (isGuest) {
      page.setData({ isGuest: true, isAdmin: false, shopPhone: '135****0000 (演示账号)' })
    }
    app.whenCloudReady().then(function () {
      page.loadShopInfo()
      if (!page.data.isGuest) {
        page.loadUsedCount()
      }
    })
    // 设置账号类型标签
    page._updateRoleLabel()
    // 设置 isOwner（是否超级管理员/注册者本人）
    page._updateOwnerFlag()
  },

  onShow: function () {
    var page = this
    // ★ v4.0.0 自定义TabBar：初始化第4个tab（索引3）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().init(3)
    }
    // 同步刷新游客状态（与 dashboard 判断逻辑一致）
    var sp2 = (app.getShopPhone && app.getShopPhone()) || ''
    var isGuest = (sp2 === '13507720000')
    if (isGuest && !this.data.isGuest) {
      page.setData({ isGuest: true, isAdmin: false, shopPhone: '135****0000 (演示账号)' })
    }
    app.whenCloudReady().then(function () {
      page.loadShopInfo()
      page._updateOwnerFlag()
    })
    // 从本地缓存快速加载门店联系信息（不需要云端）
    var tel = wx.getStorageSync('shopTel') || ''
    var addr = wx.getStorageSync('shopAddr') || ''
    if (tel) this.setData({ shopTel: tel })
    if (addr) this.setData({ shopAddr: addr })
  },

  /**
   * 检查Pro版到期续费提醒（剩余 < 30天时提示）
   * @param {Object} record 云数据库记录
   */
  checkRenewTip: function (record) {
    if (!record || !record.expireTime) return
    var expireDate = new Date(record.expireTime)
    if (isNaN(expireDate.getTime())) return
    var now = new Date()
    var remainMs = expireDate.getTime() - now.getTime()
    var remainDays = Math.ceil(remainMs / (24 * 60 * 60 * 1000))

    if (remainDays <= 30 && remainDays > 0) {
      this.setData({
        showRenew: true,
        renewTip: 'Pro版将于 ' + remainDays + ' 天后到期，请及时续费以免影响使用'
      })
    } else if (remainDays <= 0) {
      this.setData({
        showRenew: true,
        renewTip: 'Pro版已到期，请续费以继续使用全部功能'
      })
    } else {
      this.setData({ showRenew: false, renewTip: '' })
    }
  },

  /**
   * 从云端记录判断Pro状态
   * 规则：code 有值 && expireTime 未过期
   * @param {Object} record 云数据库记录
   * @returns {boolean}
   */
  checkProFromRecord: function (record) {
    if (!record || !record.code) return false
    if (record.expireTime) {
      return new Date(record.expireTime).getTime() > Date.now()
    }
    return true
  },

  /**
   * 加载门店信息 + Pro状态（一次数据库请求完成）
   * 从 repair_activationCodes 读取当前门店记录
   * Pro判定：code == unlockKey && 当前时间 < expireTime
   */
  loadShopInfo: function () {
    var page = this
    var db = app.db()

    // 1. 先从本地缓存读取，立刻显示
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var localName = shopInfo.name || wx.getStorageSync('shopName') || ''
    var localPhone = shopInfo.phone || ''
    var localRecord = shopInfo.cloudRecord || null
    if (shopInfo.isGuest) {
      page.setData({ isGuest: true, shopPhone: (localPhone || '游客') + ' (演示账号)' })
    }
    if (localName) {
      page.setData({ shopName: localName })
    }
    if (localPhone) {
      page.setData({ shopPhone: util.maskPhone(localPhone) })
    }
    // 从本地缓存的云端记录预判Pro状态（code有值即已激活，与checkProFromRecord一致）
    if (localRecord && localRecord.code) {
      var localPro = page.checkProFromRecord(localRecord)
      if (localPro) {
        page.setData({ isPro: true })
        page.updateVersionLabels(localRecord)
      }
    }

    // 2. 从云数据库读取最新值（一次请求获取门店信息 + Pro状态）
    // ★ v5.1.0 多端模式安全检查：无有效 openid 时跳过云端查询，
    // 防止 query={ type:'free' } 返回别人的门店记录导致误显示
    try {
      var openid = wx.getStorageSync('openid') || ''
      var _isMultiEnd = (app.globalData && app.globalData._isMultiEndMode)
      if (_isMultiEnd && !openid) {
        console.log('[loadShopInfo] 多端模式无openid，跳过云端查询（防止误加载他人数据）')
        return
      }

      var query = { type: 'free' }
      if (openid) {
        query.openid = openid
      }
      db.collection('repair_activationCodes')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(1)
        .get({
          success: function (res) {
            if (res.data && res.data.length > 0) {
              var record = res.data[0]

              // 读取门店名称
              if (record.name) {
                page.setData({ shopName: record.name })
                wx.setStorageSync('shopName', record.name)
              }

              // 读取手机号
              if (record.phone) {
                page.setData({ shopPhone: util.maskPhone(record.phone) })
              }

              // 读取注册时间
              if (record.createTime) {
                page.setData({ registerDate: util.formatDate(record.createTime) })
              }

              // 读取门店码
              if (record.shopCode) {
                page.setData({ shopCode: record.shopCode })
              }


              // 读取门店联系信息
              if (record.shopTel) {
                page.setData({ shopTel: record.shopTel })
              }
              if (record.shopAddr) {
                page.setData({ shopAddr: record.shopAddr })
              }

              // 缓存云端记录到本地（避免重复请求）
              var cachedShopInfo = wx.getStorageSync('shopInfo') || {}
              var isStaffUser = cachedShopInfo.role === 'staff'
              cachedShopInfo.name = record.name || cachedShopInfo.name
              // 员工不覆盖 phone（record 是店主记录，phone 是店主手机号）
              if (!isStaffUser) {
                cachedShopInfo.phone = record.phone || cachedShopInfo.phone
              }
              cachedShopInfo.cloudRecord = record
              wx.setStorageSync('shopInfo', cachedShopInfo)

              // ★ Pro激活判断：code 有值 && expireTime 未过期
              var isPro = page.checkProFromRecord(record)

              // 更新页面状态
              page.setData({ isPro: isPro, isAdmin: app.isAdmin() })

              // 同步本地Pro缓存
              wx.setStorageSync('isPro', isPro)
              if (isPro && record.type) {
                wx.setStorageSync('proType', record.type)
              }

              // 更新版本标签
              page.updateVersionLabels(record)

              // ★ Pro已激活时，顶部标题改为"AI养车 Pro版"
              if (isPro) {
                wx.setNavigationBarTitle({ title: 'AI养车 Pro版' })
                page.checkRenewTip(record)
              } else {
                wx.setNavigationBarTitle({ title: 'Pro版升级' })
                page.setData({ showRenew: false })
              }
            }
          },
          fail: function (err) {
            console.error('加载门店信息失败', err)
            page.setData({ isPro: !!wx.getStorageSync('isPro'), isAdmin: app.isAdmin() })
            page.updateVersionLabels()
          }
        })
    } catch (err) {
      console.error('加载门店信息异常', err)
      page.setData({ isPro: !!wx.getStorageSync('isPro'), isAdmin: app.isAdmin() })
      page.updateVersionLabels()
    }
  },

  // 加载已用工单数量
  loadUsedCount: function () {
    var page = this
    var db = app.db()
    try {
      var where = app.shopWhere()
      where.isVoided = db.command.neq(true)
      db.collection('repair_orders').where(where).count({
        success: function (res) {
          page.setData({ usedCount: res.total })
        },
        fail: function (err) {
          console.error('加载工单数量失败', err)
        }
      })
    } catch (err) {
      console.error('加载工单数量异常', err)
    }
  },

  /**
   * 更新版本和有效期标签
   * @param {Object} [record] 云数据库记录（用于读取 expireTime 字段）
   */
  updateVersionLabels: function (record) {
    var isPro = this.data.isPro
    var versionLabel = '免费版'
    var expireLabel = '无'

    if (isPro) {
      if (record && record.expireTime) {
        versionLabel = 'Pro版'
        expireLabel = util.formatDateTime(record.expireTime)
      } else {
        versionLabel = 'Pro版'
        expireLabel = '永久有效'
      }
    }

    this.setData({ versionLabel: versionLabel, expireLabel: expireLabel })
  },

  // 激活码输入
  onCodeInput: function (e) {
    this.setData({
      activationCode: e.detail.value.trim()
    })
  },

  // 解锁Pro（输入激活码写入 unlockKey 字段）
  onUnlock: function () {
    var page = this
    var db = app.db()
    var activationCode = page.data.activationCode

    if (!activationCode) {
      app.toastFail('请输入激活码')
      return
    }

    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var currentPhone = shopInfo.phone || ''
    if (!currentPhone) {
      app.toastFail('请先绑定联系电话')
      return
    }

    if (!util.isValidActivationCode(activationCode)) {
      app.toastFail('激活码格式不正确')
      return
    }

    if (page.data.unlocking) return
    page.setData({ unlocking: true })
    app.showLoading('激活中...')

    // 获取当前openid
    app.getOpenId().then(function (currentOpenId) {
      if (!currentOpenId) {
        page.setData({ unlocking: false })
        app.hideLoading()
        app.toastFail('网络异常，请重试')
        return
      }

      // 查找当前门店记录
      var query = { type: 'free' }
      var openid = wx.getStorageSync('openid') || ''
      if (openid) {
        query.openid = openid
      }

      db.collection('repair_activationCodes')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()
        .then(function (res) {
          if (!res.data || res.data.length === 0) {
            page.setData({ unlocking: false })
            app.hideLoading()
            app.toastFail('未找到门店信息')
            return
          }

          var shopRecord = res.data[0]

          // 校验激活码：兼容大小写字段名（unlockKey / unlockkey）
          var dbUnlockKey = (shopRecord.unlockKey || shopRecord.unlockkey || '').trim()

          if (activationCode.toLowerCase() !== dbUnlockKey.toLowerCase()) {
            page.setData({ unlocking: false })
            app.hideLoading()
            app.toastFail('激活码不正确')
            return
          }

          // 验证成功：通过云函数写入 code + expireTime，并清除 unlockKey
          return util.callRepair('activatePro', { code: activationCode })
        })
        .then(function (result) {
          if (!result || result.code !== 0) {
            page.setData({ unlocking: false })
            app.hideLoading()
            app.toastFail((result && result.msg) || '激活失败')
            return
          }

          // 激活成功 → 更新本地缓存
          wx.setStorageSync('isPro', true)
          wx.setStorageSync('proType', 'year')
          wx.setStorageSync('proActivationTime', new Date().toISOString())

          // 更新 shopInfo 中的云端记录缓存
          var cachedShopInfo = wx.getStorageSync('shopInfo') || {}
          if (cachedShopInfo.cloudRecord) {
            cachedShopInfo.cloudRecord.code = activationCode
            var exp = new Date()
            exp.setFullYear(exp.getFullYear() + 1)
            cachedShopInfo.cloudRecord.expireTime = exp.toISOString()
          } else {
            cachedShopInfo.cloudRecord = {
              code: activationCode,
              expireTime: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            }
          }
          wx.setStorageSync('shopInfo', cachedShopInfo)

          page.setData({
            isPro: true,
            unlocking: false
          })
          page.updateVersionLabels(cachedShopInfo.cloudRecord)

          // ★ 已激活，顶部标题改为"AI养车 Pro版"
          wx.setNavigationBarTitle({ title: 'AI养车 Pro版' })

          app.hideLoading()
          app.toastSuccess('Pro版激活成功！')
        })
    }).catch(function (err) {
      console.error('激活失败', err)
      page.setData({ unlocking: false })
      app.hideLoading()
      app.toastFail('激活失败，请重试')
    })
  },

  // 修改门店名称
  onEditShopName: function () {
    var page = this
    wx.showModal({
      title: '修改门店名称',
      editable: true,
      placeholderText: '请输入新的门店名称',
      content: page.data.shopName,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var newName = res.content.trim()
          util.callRepair('updateShopInfo', { field: 'name', value: newName })
          page.setData({ shopName: newName })
          wx.setStorageSync('shopName', newName)
          var shopInfo = wx.getStorageSync('shopInfo') || {}
          shopInfo.name = newName
          wx.setStorageSync('shopInfo', shopInfo)
          wx.showToast({ title: '已更新', icon: 'success' })
        }
      }
    })
  },


  // 查看隐私政策
  onGoPrivacy: function () {
    wx.navigateTo({ url: '/pages/privacy/privacy' })
  },

  // 查看用户服务协议
  onGoAgreement: function () {
    wx.navigateTo({ url: '/pages/userAgreement/userAgreement' })
  },

  // 编辑门店联系电话
  onEditShopTel: function () {
    var page = this
    wx.showModal({
      title: '门店联系电话',
      editable: true,
      placeholderText: '请输入门店联系电话',
      content: page.data.shopTel,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var tel = res.content.trim()
          page.setData({ shopTel: tel })
          page._updateShopField('shopTel', tel)
          wx.setStorageSync('shopTel', tel)
        }
      }
    })
  },

  // 编辑门店地址
  onEditShopAddr: function () {
    var page = this
    wx.showModal({
      title: '门店地址',
      editable: true,
      placeholderText: '请输入门店地址',
      content: page.data.shopAddr,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var addr = res.content.trim()
          page.setData({ shopAddr: addr })
          page._updateShopField('shopAddr', addr)
          wx.setStorageSync('shopAddr', addr)
        }
      }
    })
  },

  // 更新云端门店字段
  _updateShopField: function (field, value) {
    util.callRepair('updateShopInfo', { field: field, value: value })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // 跳转数据导出页（仅 Pro+超级管理员可用）
  onGoDataExport: function () {
    if (!this.data.isPro || !this.data.isOwner) {
      wx.showToast({ title: '仅超级管理员可使用此功能', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/dataExport/dataExport' })
  },

  // 复制门店码
  onCopyShopCode: function () {
    var code = this.data.shopCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '门店码已复制', icon: 'success' })
      }
    })
  },

  // 切换联系客服展开/收起
  toggleContact: function () {
    this.setData({ contactExpanded: !this.data.contactExpanded })
  },

  // 复制微信号到剪贴板
  onCopyWechat: function () {
    wx.setClipboardData({
      data: 'liang-weisheng',
      success: function () {
        wx.showToast({ title: '微信号已复制', icon: 'success' })
      }
    })
  },

  // 拨打客服电话（失败时复制号码）
  onCallPhone: function () {
    wx.makePhoneCall({
      phoneNumber: '17807725166',
      fail: function () {
        wx.setClipboardData({
          data: '17807725166',
          success: function () {
            wx.showToast({ title: '电话号码已复制', icon: 'success' })
          }
        })
      }
    })
  },

  // 切换门店码展开/收起
  toggleShopCode: function () {
    this.setData({ shopCodeExpanded: !this.data.shopCodeExpanded })
  },

  // 游客模式 - 跳转登录/注册
  onGuestLogin: function () {
    wx.reLaunch({ url: '/pages/welcome/welcome' })
  },

  // 跳转视频号使用帮助
  onGoVideoHelp: function () {
    wx.openChannelsUserProfile({
      finderUserName: 'sphcnacQ1SzOvLi',
      fail: function (err) {
        console.error('打开视频号失败', err)
        wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
      }
    })
  },

  // ===========================
  // 账号类型标签
  // ===========================

  _updateRoleLabel: function () {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var role = app.getRole()
    var isOwner = !!(shopInfo.openid && !shopInfo.addedBy)
    if (isOwner) {
      this.setData({ roleLabel: '超级管理员', roleTagClass: 'tag-super-admin' })
    } else if (role === 'admin') {
      this.setData({ roleLabel: '管理员', roleTagClass: 'tag-admin-role' })
    } else if (role === 'staff') {
      this.setData({ roleLabel: '店员', roleTagClass: 'tag-staff-role' })
    }
  },

  /**
   * 更新 isOwner 标志（是否超级管理员/注册者本人）
   */
  _updateOwnerFlag: function () {
    var shopInfo = wx.getStorageSync('shopInfo') || {}
    var isOwner = !!(shopInfo.openid && !shopInfo.addedBy && shopInfo.role === 'admin')
    this.setData({ isOwner: isOwner })
  },

  // ===========================
  // v4.0.0 员工管理
  // ===========================

  toggleStaff: function () {
    var page = this
    var expanded = !this.data.staffExpanded
    this.setData({ staffExpanded: expanded })
    if (expanded && app.isSuperAdmin() && app.isPro()) {
      this.loadStaffList()
    }
  },

  loadStaffList: function () {
    var page = this
    util.callRepair('listStaffs', { shopPhone: app.getShopPhone() })
      .then(function (res) {
        if (res.code === 0) {
          page.setData({ staffList: res.data.list || [] })
        }
      })
      .catch(function () {})
  },

  onStaffPhoneInput: function (e) {
    this.setData({ staffPhoneInput: (e.detail.value || '').replace(/\D/g, '') })
  },

  onStaffRoleChange: function (e) {
    this.setData({ staffRoleIndex: Number(e.detail.value) })
  },

  onAddStaff: function () {
    var page = this
    var phone = page.data.staffPhoneInput
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      app.toastFail('请输入正确的11位手机号')
      return
    }
    var role = page.data.staffRoleOptions[page.data.staffRoleIndex].value
    page.setData({ staffAdding: true })
    util.callRepair('addStaff', { staffPhone: phone, staffRole: role, shopPhone: app.getShopPhone() })
      .then(function (res) {
        page.setData({ staffAdding: false })
        if (res.code === 0) {
          app.toastSuccess(res.msg || '添加成功')
          page.setData({ staffPhoneInput: '' })
          page.loadStaffList()
        } else {
          app.toastFail(res.msg || '添加失败')
        }
      })
      .catch(function () {
        page.setData({ staffAdding: false })
        app.toastFail('网络异常')
      })
  },

  onRemoveStaff: function (e) {
    var page = this
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认移除',
      content: '移除后该员工将无法登录',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (!res.confirm) return
        util.callRepair('removeStaff', { staffDocId: id, shopPhone: app.getShopPhone() })
          .then(function (res) {
            if (res.code === 0) {
              app.toastSuccess('已移除')
              page.loadStaffList()
            } else {
              app.toastFail(res.msg || '操作失败')
            }
          })
      }
    })
  },

  onToggleStaffRole: function (e) {
    var page = this
    var id = e.currentTarget.dataset.id
    var currentRole = e.currentTarget.dataset.role
    var newRole = currentRole === 'staff' ? 'admin' : 'staff'
    var roleLabel = newRole === 'admin' ? '管理员' : '店员'
    wx.showModal({
      title: '修改角色',
      content: '确认将该员工设为' + roleLabel + '？',
      success: function (res) {
        if (!res.confirm) return
        util.callRepair('updateStaffRole', { staffDocId: id, newRole: newRole, shopPhone: app.getShopPhone() })
          .then(function (res) {
            if (res.code === 0) {
              app.toastSuccess('已更新')
              page.loadStaffList()
            } else {
              app.toastFail(res.msg || '操作失败')
            }
          })
      }
    })
  },

  // ====== v5.0.0 门店设置（经营诊断配置） ======

  toggleShopProfile: function () {
    var expanded = !this.data.shopProfileExpanded
    this.setData({ shopProfileExpanded: expanded })
    if (expanded) {
      this._loadShopProfile()
    }
  },

  // 加载已有门店配置
  _loadShopProfile: function () {
    var page = this
    util.callRepair('getShopProfile', { shopPhone: app.getShopPhone() })
      .then(function (res) {
        if (res.code === 0 && res.data) {
          var bayCount = res.data.bayCount || 2
          var idx = Math.max(0, Math.min(bayCount - 1, page.data.bayCountOptions.length - 1))
          page.setData({
            shopBayCount: bayCount,
            shopBayCountIndex: idx,
            shopOpenYear: res.data.openYear || new Date().getFullYear()
          })
        }
      })
      .catch(function () { /* 静默 */ })
  },

  onBayCountChange: function (e) {
    var idx = parseInt(e.detail.value)
    var val = parseInt(this.data.bayCountOptions[idx])
    this.setData({ shopBayCount: val, shopBayCountIndex: idx })
  },

  onOpenYearChange: function (e) {
    var val = e.detail.value
    if (val) {
      this.setData({ shopOpenYear: parseInt(val.substring(0, 4)) })
    }
  },

  onSaveShopProfile: function () {
    var page = this
    page.setData({ shopProfileSaving: true })

    util.callRepair('updateShopProfile', {
      bayCount: page.data.shopBayCount,
      openYear: page.data.shopOpenYear
    }).then(function (res) {
      page.setData({ shopProfileSaving: false })
      if (res.code === 0) {
        app.toastSuccess('已保存')
        // 清除月报页面缓存，引导用户刷新获取新基准值
        try {
          wx.removeStorageSync('monthlyReportCache')
          // 兼容多 tab 缓存格式
          var keys = ['reportCache_week', 'reportCache_month', 'reportCache_year']
          keys.forEach(function (k) { try { wx.removeStorageSync(k) } catch (e) {} })
        } catch (e) {}
        // 延迟弹出引导提示
        setTimeout(function () {
          wx.showModal({
            title: '设置已更新',
            content: '经营诊断基准已按新工位数调整，请前往「AI月报」页面下拉刷新查看最新报告',
            confirmText: '前往月报',
            success: function (modalRes) {
              if (modalRes.confirm) {
                wx.navigateTo({ url: '/pages/monthlyReport/monthlyReport' })
              }
            }
          })
        }, 600)
        // 清除引导标记，下次可重新触发引导
        try { wx.removeStorageSync('monthlyReportGuideShown') } catch (e) {}
      } else {
        app.toastFail(res.msg || '保存失败')
      }
    }).catch(function () {
      page.setData({ shopProfileSaving: false })
      app.toastFail('网络异常')
    })
  }
})
