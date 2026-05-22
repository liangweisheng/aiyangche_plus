/**
 * 工单服务项目数据迁移云函数 - migrate_service_items
 *
 * 职责：1) backfill 双写 2) cleanupOldFormat 清理旧字段
 *
 * 调用方式：云控制台传入 {"action":"backfill"}
 * 支持断点续传：传入 {"action":"backfill","offset":N}
 *
 * 前置条件：在云控制台将该云函数超时时间改为 60 秒
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const BATCH = 100 // 每批查 100 条

function parseServiceItems(serviceItems, serviceAmounts, serviceQuantities, serviceCategories) {
  if (Array.isArray(serviceItems)) return serviceItems
  if (!serviceItems || typeof serviceItems !== 'string' || !serviceItems.trim()) return []
  var names = serviceItems.trim().split(/[,，]/).map(function (s) { return s.trim() }).filter(function (s) { return s })
  var amounts = (serviceAmounts || '').split(',').map(function (a) { return Number(a) || 0 })
  var quantities = (serviceQuantities || '').split(',').map(function (q) { return Number(q) || 1 })
  var categories = (serviceCategories || '').split(',').map(function (c) { return c.trim() })
  var result = []
  for (var i = 0; i < names.length; i++) {
    var parts = names[i].split(/\s+/)
    result.push({ name: parts[0] || names[i], spec: parts.slice(1).join(' ') || '', amount: amounts[i] || 0, qty: quantities[i] || 1, category: categories[i] || '' })
  }
  return result
}

async function backfill(event) {
  var offset = Number(event.offset) || 0
  console.log('[backfill] offset=' + offset)

  var ok = 0, skip = 0, fail = 0

  while (true) {
    var batchRes = await db.collection('repair_orders')
      .where({ _serviceItemsArr: _.exists(false) })
      .skip(offset)
      .limit(BATCH)
      .get()

    var orders = batchRes.data || []
    if (orders.length === 0) break

    for (var i = 0; i < orders.length; i++) {
      var order = orders[i]
      try {
        var parsed = parseServiceItems(order.serviceItems, order.serviceAmounts, order.serviceQuantities, order.serviceCategories)
        if (!parsed || parsed.length === 0) { skip++ }
        else {
          await db.collection('repair_orders').doc(order._id).update({ data: { _serviceItemsArr: parsed } })
          ok++
        }
      } catch (e) {
        console.warn('[backfill] 失败 orderId=' + order._id + ':', e.message)
        fail++
      }
    }
    offset += orders.length
    console.log('[backfill] 已处理 ' + offset + ' 条')
  }

  console.log('[backfill] 完成: ok=' + ok + ' skip=' + skip + ' fail=' + fail)
  return { code: 0, msg: '双写完成', data: { ok: ok, skip: skip, fail: fail, nextOffset: -1, remaining: 0 } }
}

async function cleanupOldFormat(event) {
  var offset = Number(event.offset) || 0
  console.log('[cleanupOldFormat] offset=' + offset)

  var ok = 0, fail = 0

  while (true) {
    var batchRes = await db.collection('repair_orders')
      .where({ _serviceItemsArr: _.exists(true), serviceItems: _.exists(true) })
      .skip(offset)
      .limit(BATCH)
      .get()

    var orders = batchRes.data || []
    if (orders.length === 0) break

    for (var i = 0; i < orders.length; i++) {
      try {
        await db.collection('repair_orders').doc(orders[i]._id).update({
          data: { serviceItems: _.remove(), serviceAmounts: _.remove(), serviceQuantities: _.remove(), serviceCategories: _.remove() }
        })
        ok++
      } catch (e) {
        console.warn('[cleanupOldFormat] 失败 orderId=' + orders[i]._id + ':', e.message)
        fail++
      }
    }
    offset += orders.length
    console.log('[cleanupOldFormat] 已处理 ' + offset + ' 条')
  }

  console.log('[cleanupOldFormat] 完成: ok=' + ok + ' fail=' + fail)
  return { code: 0, msg: '清理完成', data: { ok: ok, fail: fail, nextOffset: -1, remaining: 0 } }
}

exports.main = async (event, context) => {
  switch (event.action) {
    case 'backfill': return await backfill(event)
    case 'cleanupOldFormat': return await cleanupOldFormat(event)
    default: return { code: -1, msg: '未知 action' }
  }
}
