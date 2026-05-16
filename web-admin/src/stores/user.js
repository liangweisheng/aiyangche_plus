import { defineStore } from 'pinia'
import { loginByPhoneCode } from '@/api/auth'

const STORAGE_KEY_TOKEN = 'web_token'
const STORAGE_KEY_USER = 'web_user_info'
const STORAGE_KEY_EXPIRE = 'web_token_expire'
const TOKEN_TTL_DAYS = 7

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    phone: '',
    shopPhone: '',
    shopCode: '',
    shopName: '',
    role: '',
    isPro: false,
    code: '',
    expireTime: '',
    createTime: '',
    isStaff: false,
    opened: true, // 侧边栏折叠状态
    _lastLoginTime: 0
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.role === 'admin',
    displayName: (state) => {
      return state.shopName || '未设置门店名称'
    },
    showProBadge: (state) => state.isPro
  },

  actions: {
    /**
     * 手机号 + 门店码登录
     */
    async login(phone, shopCode) {
      const result = await loginByPhoneCode(phone, shopCode)
      if (result.code !== 0) {
        throw new Error(result.msg || '登录失败')
      }

      const { record, isStaff, ownerName } = result.data

      // 仅超级管理员（门店注册者，type='free'，非员工）可登录 Web 后台
      if (isStaff) {
        throw new Error('仅门店管理员可登录管理后台')
      }

      const token = `web_${phone}_${shopCode}_${Date.now()}`
      const now = Date.now()

      // 判断 Pro 状态
      const hasCode = !!(record.code)
      const hasExpiry = !!(record.expireTime)
      const isPro = hasCode && (!hasExpiry || new Date(record.expireTime).getTime() > now)

      // 更新状态
      this.token = token
      this.phone = record.phone || phone
      this.shopPhone = record.phone || phone
      this.shopCode = shopCode
      this.shopName = record.name || ownerName || ''
      this.role = record.role || 'admin'
      this.isPro = isPro
      this.code = record.code || ''
      this.expireTime = record.expireTime || ''
      this.createTime = record.createTime || ''
      this.isStaff = false
      this._lastLoginTime = now

      // 持久化到 localStorage
      this._persist(token)
    },

    /**
     * 从 localStorage 恢复登录态
     */
    restoreSession() {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN)
      const expireStr = localStorage.getItem(STORAGE_KEY_EXPIRE)
      const userStr = localStorage.getItem(STORAGE_KEY_USER)

      if (!token || !userStr) return

      // 检查是否过期（7天）
      if (expireStr) {
        const expireTime = parseInt(expireStr, 10)
        if (Date.now() > expireTime) {
          this.logout()
          return
        }
      }

      try {
        const user = JSON.parse(userStr)
        Object.assign(this, { ...user, token })
      } catch (e) {
        this.logout()
      }
    },

    /**
     * 退出登录
     */
    logout() {
      this.token = ''
      this.phone = ''
      this.shopPhone = ''
      this.shopCode = ''
      this.shopName = ''
      this.role = ''
      this.isPro = false
      this.code = ''
      this.expireTime = ''
      this.createTime = ''
      this.isStaff = false
      this._lastLoginTime = 0

      localStorage.removeItem(STORAGE_KEY_TOKEN)
      localStorage.removeItem(STORAGE_KEY_USER)
      localStorage.removeItem(STORAGE_KEY_EXPIRE)
    },

    /**
     * 持久化登录信息
     */
    _persist(token) {
      const expireAt = Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
      localStorage.setItem(STORAGE_KEY_TOKEN, token)
      localStorage.setItem(STORAGE_KEY_EXPIRE, String(expireAt))
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify({
        phone: this.phone,
        shopPhone: this.shopPhone,
        shopCode: this.shopCode,
        shopName: this.shopName,
        role: this.role,
        isPro: this.isPro,
        code: this.code,
        expireTime: this.expireTime,
        createTime: this.createTime,
        isStaff: this.isStaff,
        _lastLoginTime: this._lastLoginTime
      }))
    }
  }
})
