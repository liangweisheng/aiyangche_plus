/**
 * 共享鉴权模块 — v6.5.0
 * 依赖：db, _ 通过工厂函数参数注入
 * 
 * ⚠️ 此文件是云函数内部子目录，部署时随云函数一同上传
 * ⚠️ repair_aux 将持有一份同步副本，修改时需同步两处
 * 
 * 提供：createAuthModule(db, _, permissions) → { checkPermission, _checkShopAccess, _getCallerRecord, _validatePhoneAccess }
 */

/**
 * @param {Object} db      - 云数据库实例（依赖注入）
 * @param {Object} _        - 数据库命令（依赖注入）
 * @param {Object} permissions - ACTION_PERMISSIONS 配置（由调用方传入）
 * @returns {{ checkPermission, _checkShopAccess, _getCallerRecord, _validatePhoneAccess }}
 */
function createAuthModule(db, _, permissions) {

  // ============================
  // _checkShopAccess - 轻量级门店访问权限校验
  // 验证调用者（openid）是否属于该门店（店主或员工）
  // 返回 true/false
  // ============================
  async function _checkShopAccess(openid, shopPhone) {
    if (!shopPhone) return false             // 必须有 shopPhone
    if (!openid) return true                 // 空 openid 信任 shopPhone（多端模式）
    // 游客共享账号放行：shopPhone 为游客账号时，任何 openid 均可访问（与 checkPermission 保持一致）
    var GUEST_PHONE = '13507720000'
    if (shopPhone === GUEST_PHONE) return true
    try {
      var res = await db.collection('repair_activationCodes')
        .where(_.or([
          { openid: openid, phone: shopPhone },
          { staffOpenid: openid, shopPhone: shopPhone, status: 'active' }  // ★ 员工必须 status=active
        ]))
        .limit(1)
        .get()
      return !!(res.data && res.data.length > 0)
    } catch (e) {
      console.error('[ACCESS] _checkShopAccess异常 shopPhone=' + shopPhone, e)
      return false
    }
  }

  // ============================
  // _getCallerRecord - 获取调用者记录（含角色判断）
  // 返回 { role, isSuperAdmin, code, expireTime, _ownerCode, _ownerExpireTime } 或 null
  // ============================
  async function _getCallerRecord(openid, clientPhone, shopPhone) {
    try {
      // ★ 优化：分层短路 + 每层内并行
      // 原逻辑4次串行 → 现在2轮并行，同时保持短路减少不必要的查询

      // 第1层：openid 查询（店主+员工并行）
      if (openid && openid.length > 5) {
        var openidResults = await Promise.all([
          db.collection('repair_activationCodes')
            .where({ openid: openid, type: 'free' })
            .field({ phone: true, role: true, code: true, expireTime: true, openid: true, addedBy: true })
            .limit(1).get(),
          db.collection('repair_activationCodes')
            .where({ staffOpenid: openid, shopPhone: shopPhone, status: 'active' })
            .field({ phone: true, role: true, shopPhone: true, status: true })
            .limit(1).get()
        ])
        // 优先级1: openid → 店主（phone 必须匹配 shopPhone）
        if (openidResults[0].data && openidResults[0].data.length > 0) {
          var owner = openidResults[0].data[0]
          if (owner.phone === shopPhone) {
            return { role: 'admin', isSuperAdmin: true, code: owner.code, expireTime: owner.expireTime }
          }
        }
        // 优先级2: openid → 员工
        if (openidResults[1].data && openidResults[1].data.length > 0) {
          var staff = openidResults[1].data[0]
          return { role: staff.role || 'staff', isSuperAdmin: false }
        }
      }

      // 第2层：clientPhone 查询（店主+员工并行）
      if (clientPhone) {
        var phoneResults = await Promise.all([
          db.collection('repair_activationCodes')
            .where({ type: 'free', phone: clientPhone })
            .field({ phone: true, role: true, code: true, expireTime: true })
            .limit(1).get(),
          db.collection('repair_activationCodes')
            .where({ phone: clientPhone, shopPhone: shopPhone, status: 'active' })
            .field({ phone: true, role: true, shopPhone: true, status: true })
            .limit(1).get()
        ])
        // 优先级3: clientPhone → 店主（phone 必须匹配 shopPhone）
        if (phoneResults[0].data && phoneResults[0].data.length > 0) {
          var phoneOwner = phoneResults[0].data[0]
          if (phoneOwner.phone === shopPhone) {
            return { role: 'admin', isSuperAdmin: true, code: phoneOwner.code, expireTime: phoneOwner.expireTime }
          }
        }
        // 优先级4: clientPhone → 员工
        if (phoneResults[1].data && phoneResults[1].data.length > 0) {
          var phoneStaff = phoneResults[1].data[0]
          return { role: phoneStaff.role || 'staff', isSuperAdmin: false }
        }
      }

      return null
    } catch (e) {
      console.error('[_getCallerRecord] 查询失败:', e)
      return null
    }
  }

  // ============================
  // _validatePhoneAccess - 通过手机号验证用户是否属于该门店
  // 返回 true/false
  // ============================
  async function _validatePhoneAccess(clientPhone, shopPhone) {
    try {
      // 查是否是员工
      var staffRes = await db.collection('repair_activationCodes')
        .where({ phone: clientPhone, shopPhone: shopPhone, status: 'active' })
        .limit(1).get()
      if (staffRes.data && staffRes.data.length > 0) return true

      // 查是否是店主
      var ownerRes = await db.collection('repair_activationCodes')
        .where({ type: 'free', phone: clientPhone })
        .limit(1).get()
      if (ownerRes.data && ownerRes.data.length > 0 && ownerRes.data[0].phone === shopPhone) return true

      return false
    } catch (e) {
      return false
    }
  }

  // ============================
  // checkPermission - 统一鉴权函数 (Phase 2)
  // 根据 permissions 配置校验调用者权限
  // 返回 { ok: true } 或 { ok: false, code, msg }
  // ============================
  async function checkPermission(action, event, openid) {
    var required = permissions[action]
    if (!required) return { ok: true }   // 未配置权限的 action，默认放行

    // public：任何人可调用
    if (required === 'public') return { ok: true }

    // 以下权限等级需要 shopPhone
    var shopPhone = event.shopPhone || ''
    if (!shopPhone) {
      console.warn('[PERM] action=' + action + ' REJECTED: 缺少shopPhone')
      return { ok: false, code: -403, msg: '缺少门店标识' }
    }

    // 游客账号识别：共享演示账号，无真实 openid，继承管理员权限（不含 superAdmin）
    var GUEST_PHONE = '13507720000'
    var isGuestShop = (shopPhone === GUEST_PHONE)

    // registered：已注册用户（店主或员工）
    if (required === 'registered') {
      // 游客账号放行（共享真实注册账号，视为已注册）
      if (isGuestShop) return { ok: true }

      // ★ 优化：保持短路降级逻辑，每层内部并行化
      // 原逻辑最差5次串行DB查询 → 现在3轮并行（1+2+2），大幅减少等待时间

      // 第1层：openid 验证（1次 $or 查询）
      if (openid && openid.length > 5) {
        var hasAccess = await _checkShopAccess(openid, shopPhone)
        if (hasAccess) return { ok: true }
      }

      // 第2层：clientPhone 验证（员工+店主并行）
      if (event.clientPhone) {
        var phoneResults = await Promise.all([
          db.collection('repair_activationCodes')
            .where({ phone: event.clientPhone, shopPhone: shopPhone, status: 'active' })
            .limit(1).get(),
          db.collection('repair_activationCodes')
            .where({ type: 'free', phone: event.clientPhone })
            .limit(1).get()
        ])
        // 员工匹配
        if (phoneResults[0].data && phoneResults[0].data.length > 0) return { ok: true }
        // 店主匹配（phone 必须等于 shopPhone）
        if (phoneResults[1].data && phoneResults[1].data.length > 0 &&
            phoneResults[1].data[0].phone === shopPhone) return { ok: true }
      }

      // 第3层：shopPhone 兜底（员工+店主并行）
      var shopResults = await Promise.all([
        db.collection('repair_activationCodes')
          .where({ phone: shopPhone, shopPhone: shopPhone, status: 'active' })
          .limit(1).get(),
        db.collection('repair_activationCodes')
          .where({ type: 'free', phone: shopPhone })
          .limit(1).get()
      ])
      if (shopResults[0].data && shopResults[0].data.length > 0) return { ok: true }
      if (shopResults[1].data && shopResults[1].data.length > 0 &&
          shopResults[1].data[0].phone === shopPhone) return { ok: true }

      console.warn('[PERM] action=' + action + ' REJECTED: openid/clientPhone/shopPhone 均验证失败')
      return { ok: false, code: -403, msg: '未登录' }
    }

    // 解析组合标记（如 'admin+pro'）
    var parts = required.split('+')
    var roleRequired = parts[0]   // 'admin' | 'superAdmin'
    var needPro = parts.indexOf('pro') !== -1

    // 游客账号继承管理员权限（superAdmin 需 openid 匹配，游客无法满足）
    if (isGuestShop) {
      if (roleRequired === 'superAdmin') {
        console.warn('[PERM] action=' + action + ' REJECTED: 游客无superAdmin权限')
        return { ok: false, code: -403, msg: '需要店主账号权限' }
      }
      // admin 级别放行，Pro 状态按需检查
      if (needPro) {
        var guestRecord = await db.collection('repair_activationCodes')
          .where({ phone: GUEST_PHONE, type: 'free' })
          .field({ code: true, expireTime: true })
          .limit(1).get()
        if (guestRecord.data && guestRecord.data.length > 0) {
          var gRec = guestRecord.data[0]
          var isPro = !!(gRec.code && new Date(gRec.expireTime).getTime() > Date.now())
          if (!isPro) {
            console.warn('[PERM] action=' + action + ' REJECTED: 游客Pro已过期')
            return { ok: false, code: -403, msg: '仅Pro版可使用此功能' }
          }
        } else {
          console.warn('[PERM] action=' + action + ' REJECTED: 游客账号记录不存在')
          return { ok: false, code: -403, msg: '仅Pro版可使用此功能' }
        }
      }
      return { ok: true }
    }

    // admin / superAdmin：需要验证角色
    var callerRecord = await _getCallerRecord(openid, event.clientPhone, shopPhone)
    if (!callerRecord) {
      console.warn('[PERM] action=' + action + ' REJECTED: _getCallerRecord返回null')
      return { ok: false, code: -403, msg: '账号已失效，请重新登录' }
    }

    if (roleRequired === 'admin') {
      if (callerRecord.role !== 'admin') {
        console.warn('[PERM] action=' + action + ' REJECTED: role=' + callerRecord.role + ' 需要admin')
        return { ok: false, code: -403, msg: '需要管理员权限' }
      }
    } else if (roleRequired === 'superAdmin') {
      if (!callerRecord.isSuperAdmin) {
        console.warn('[PERM] action=' + action + ' REJECTED: isSuperAdmin=false')
        return { ok: false, code: -403, msg: '需要店主账号权限' }
      }
    }

    // +pro：需要 Pro 版
    if (needPro) {
      var proRecord = {
        code: callerRecord._ownerCode || callerRecord.code || '',
        expireTime: callerRecord._ownerExpireTime || callerRecord.expireTime || ''
      }
      var isPro = !!(proRecord.code && new Date(proRecord.expireTime).getTime() > Date.now())
      if (!isPro) {
        console.warn('[PERM] action=' + action + ' REJECTED: 非Pro用户')
        return { ok: false, code: -403, msg: '仅Pro版可使用此功能' }
      }
    }

    return { ok: true }
  }

  return {
    checkPermission: checkPermission,
    _checkShopAccess: _checkShopAccess,
    _getCallerRecord: _getCallerRecord,
    _validatePhoneAccess: _validatePhoneAccess
  }
}

module.exports = { createAuthModule }
