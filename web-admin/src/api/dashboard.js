import { callCloudFunction } from './cloud'
import { useUserStore } from '@/stores/user'

/**
 * 获取仪表盘数据（今日概况 + 商机提醒）
 * @returns {Promise<{stats, alertList, totalOrderCount, totalMemberCount}>}
 */
export async function fetchDashboardStats() {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  // ★ Web端用每天 0 点作为 todayStart
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const result = await callCloudFunction('getDashboardStats', {
    todayStartMs: todayStart
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取仪表盘数据失败')
  }

  return result.data || result
}

/**
 * 获取最近 N 天的营收趋势数据
 * 复用 getReportOrders 按日聚合
 * @param {number} days - 天数，默认 7
 * @returns {Promise<Array<{date: string, revenue: number, count: number}>>}
 */
export async function fetchRevenueTrend(days = 7) {
  const userStore = useUserStore()
  const shopPhone = userStore.shopPhone

  const now = new Date()
  // 当前时间往前推 days 天，取 0 点
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - days + 1)
  const startTime = start.getTime()

  const result = await callCloudFunction('getReportOrders', {
    startTime,
    endTime: now.getTime()
  }, { shopPhone, clientPhone: shopPhone })

  if (result.code !== 0) {
    throw new Error(result.msg || '获取趋势数据失败')
  }

  const orders = result.data || []
  // 按日期聚合
  const dateMap = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const key = formatDate(d)
    dateMap[key] = { date: key, revenue: 0, count: 0 }
  }

  orders.forEach(order => {
    if (!order.createTime) return
    const d = new Date(order.createTime)
    const key = formatDate(d)
    if (dateMap[key]) {
      dateMap[key].revenue += (order.totalAmount || 0)
      dateMap[key].count += 1
    }
  })

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
}

function formatDate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
