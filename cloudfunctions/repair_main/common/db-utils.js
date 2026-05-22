/**
 * 共享数据库工具函数 — v6.5.0
 * 依赖：db, _ 通过函数参数注入（避免顶层 require 顺序问题）
 * 
 * ⚠️ 此文件是云函数内部子目录，部署时随云函数一同上传
 * ⚠️ repair_aux 将持有一份同步副本，修改时需同步两处
 */

const MAX_LIMIT = 100

/**
 * 分页获取全部记录（突破单次 limit 限制）
 * @param {Object} db - 云数据库实例
 * @param {Object} _ - 数据库命令
 * @param {Object} where - 查询条件
 * @param {Object} field - 字段投影
 * @returns {Promise<Array>}
 */
async function fetchAllOrders(db, _, where, field) {
  var countRes = await db.collection('repair_orders').where(where).count()
  var total = countRes.total
  if (total === 0) return []
  var allData = []
  var batch = 0
  var batchSize = Math.min(MAX_LIMIT, total)
  while (batch * MAX_LIMIT < total) {
    var query = db.collection('repair_orders').where(where).field(field).skip(batch * MAX_LIMIT).limit(batchSize)
    var res = await query.get()
    allData = allData.concat(res.data || [])
    batch++
    batchSize = Math.min(MAX_LIMIT, total - batch * MAX_LIMIT)
  }
  return allData
}

module.exports = { fetchAllOrders, MAX_LIMIT }
