import cloudbase from '@cloudbase/js-sdk'

const RESOURCE_ENV = import.meta.env.VITE_RESOURCE_ENV || 'cloud1-2gwoxtay6a4d8181'
const CLOUD_FN = import.meta.env.VITE_CLOUD_FUNCTION_NAME || 'repair_main'

let app = null
let anonymousAuthed = false

/**
 * 获取 CloudBase 应用实例（单例）
 */
export function getCloudApp() {
  if (!app) {
    app = cloudbase.init({ env: RESOURCE_ENV })
  }
  return app
}

/**
 * 匿名登录（首次调用时自动执行）
 */
export async function ensureAnonymousAuth() {
  if (anonymousAuthed) return
  const cloudApp = getCloudApp()
  const auth = cloudApp.auth()
  await auth.signInAnonymously()
  anonymousAuthed = true
}

/**
 * 调用云函数（统一封装）
 * @param {string} action - action 名称
 * @param {object} data - 业务参数
 * @param {object} options - { shopPhone, clientPhone }
 * @returns {Promise<object>}
 */
export async function callCloudFunction(action, data = {}, options = {}) {
  await ensureAnonymousAuth()

  const cloudApp = getCloudApp()
  const shopPhone = options.shopPhone || ''
  const clientPhone = options.clientPhone || shopPhone

  try {
    const res = await cloudApp.callFunction({
      name: CLOUD_FN,
      data: {
        action,
        ...data,
        shopPhone,
        clientPhone,
        source: 'web'
      }
    })

    // 统一错误处理
    if (res.code) {
      const errMsg = res.msg || `云函数错误: ${res.code}`
      console.error(`[Cloud] ${action} 返回错误:`, res)
      throw new Error(errMsg)
    }

    return res.result || res.data || {}
  } catch (err) {
    // 区分网络错误和业务错误
    if (err.message && (err.message.includes('超时') || err.message.includes('timeout'))) {
      throw new Error('请求超时，请检查网络后重试')
    }
    throw err
  }
}
