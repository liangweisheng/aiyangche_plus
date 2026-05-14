/**
 * wx-server-sdk Mock
 * 模拟云开发 SDK 的数据库链式调用，供 Jest 单元测试使用
 *
 * 用法：
 *   1. 测试前调用 resetMockData(collections) 设置模拟数据
 *   2. 每个测试用例前应重新调用 resetMockData，避免数据污染
 */

// ============================
// 模拟数据存储
// ============================
var _collections = {}

/**
 * 重置模拟数据
 * @param {Object} collections - 集合数据，格式：{ collectionName: [record1, record2, ...] }
 *
 * 示例：
 *   resetMockData({
 *     repair_activationCodes: [
 *       { _id: '1', phone: '13800001111', openid: 'oXXX', type: 'free', role: 'admin', code: 'PRO123', expireTime: '2099-01-01' }
 *     ],
 *     repair_cars: [
 *       { _id: 'c1', plate: '桂A12345', shopPhone: '13800001111' }
 *     ]
 *   })
 */
function resetMockData(collections) {
  _collections = {}
  for (var name in collections) {
    // 深拷贝避免测试间互相污染
    _collections[name] = collections[name].map(function(doc) { return Object.assign({}, doc) })
  }
}

// ============================
// 链式查询构建器
// ============================
function createChain(collectionName) {
  var _where = {}
  var _fields = null
  var _limitVal = 100
  var _skipVal = 0
  var _orderByFields = []

  var chain = {
    where: function(cond) {
      _where = cond || {}
      return chain
    },
    field: function(proj) {
      _fields = proj
      return chain
    },
    limit: function(n) {
      _limitVal = n
      return chain
    },
    skip: function(n) {
      _skipVal = n
      return chain
    },
    orderBy: function(field, order) {
      _orderByFields.push({ field: field, order: order })
      return chain
    },
    get: async function() {
      var data = (_collections[collectionName] || []).filter(function(doc) {
        return matchWhere(doc, _where)
      })

      // field 投影
      if (_fields) {
        data = data.map(function(doc) {
          var projected = { _id: doc._id }
          for (var key in _fields) {
            if (_fields[key] && doc[key] !== undefined) {
              projected[key] = doc[key]
            }
          }
          return projected
        })
      }

      // orderBy 排序
      for (var i = 0; i < _orderByFields.length; i++) {
        var ob = _orderByFields[i]
        var dir = ob.order === 'desc' ? -1 : 1
        data.sort(function(a, b) {
          if (a[ob.field] < b[ob.field]) return -1 * dir
          if (a[ob.field] > b[ob.field]) return 1 * dir
          return 0
        })
      }

      // skip + limit
      data = data.slice(_skipVal, _skipVal + _limitVal)

      return { data: data }
    },
    count: async function() {
      var data = (_collections[collectionName] || []).filter(function(doc) {
        return matchWhere(doc, _where)
      })
      return { total: data.length }
    },
    add: async function(options) {
      var newDoc = Object.assign({ _id: 'mock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) }, options.data || {})
      if (!_collections[collectionName]) _collections[collectionName] = []
      _collections[collectionName].push(newDoc)
      return { _id: newDoc._id }
    },
    doc: function(id) {
      return {
        update: async function(options) {
          var docs = _collections[collectionName] || []
          for (var i = 0; i < docs.length; i++) {
            if (docs[i]._id === id) {
              var updateData = options.data || {}
              for (var key in updateData) {
                docs[i][key] = updateData[key]
              }
              return { updated: 1 }
            }
          }
          return { updated: 0 }
        },
        remove: async function() {
          var docs = _collections[collectionName] || []
          for (var i = 0; i < docs.length; i++) {
            if (docs[i]._id === id) {
              docs.splice(i, 1)
              return { removed: 1 }
            }
          }
          return { removed: 0 }
        },
        get: async function() {
          var docs = _collections[collectionName] || []
          var found = docs.find(function(d) { return d._id === id })
          return { data: found ? [found] : [] }
        }
      }
    }
  }

  return chain
}

// ============================
// where 条件匹配
// 支持：精确匹配 / _.or() / _.neq() / _.in() / _.and() / db.RegExp()
// ============================
function matchWhere(doc, where) {
  if (!where || Object.keys(where).length === 0) return true

  // 顶级 _.or()：where 本身就是 { __or: true, conditions: [...] }
  if (where.__or) {
    for (var i = 0; i < where.conditions.length; i++) {
      if (matchWhere(doc, where.conditions[i])) return true
    }
    return false
  }

  // 顶级 _.and()：where 本身就是 { __and: true, conditions: [...] }
  if (where.__and) {
    for (var j = 0; j < where.conditions.length; j++) {
      if (!matchWhere(doc, where.conditions[j])) return false
    }
    return true
  }

  for (var key in where) {
    var val = where[key]

    // _.or() 返回的对象带 __or 标记
    if (val && val.__or) {
      var orMatched = false
      for (var i = 0; i < val.conditions.length; i++) {
        if (matchWhere(doc, val.conditions[i])) {
          orMatched = true
          break
        }
      }
      if (!orMatched) return false
      continue
    }

    // _.and() 返回的对象带 __and 标记
    if (val && val.__and) {
      for (var j = 0; j < val.conditions.length; j++) {
        if (!matchWhere(doc, val.conditions[j])) return false
      }
      continue
    }

    // _.neq() 返回的对象带 __neq 标记
    if (val && val.__neq) {
      if (doc[key] === val.value) return false
      continue
    }

    // _.in() 返回的对象带 __in 标记
    if (val && val.__in) {
      if (val.values.indexOf(doc[key]) === -1) return false
      continue
    }

    // db.RegExp() 返回的对象带 __regexp 标记
    if (val && val.__regexp) {
      var re = new RegExp(val.regexp, val.options || '')
      if (!re.test(String(doc[key] || ''))) return false
      continue
    }

    // _.gte() 返回的对象带 __gte 标记
    if (val && val.__gte) {
      if (doc[key] === undefined || doc[key] < val.value) return false
      continue
    }

    // _.lte() 返回的对象带 __lte 标记
    if (val && val.__lte) {
      if (doc[key] === undefined || doc[key] > val.value) return false
      continue
    }

    // 普通字段精确匹配
    if (doc[key] !== val) return false
  }
  return true
}

// ============================
// 导出
// ============================
var cloud = {
  init: function() {},
  DYNAMIC_CURRENT_ENV: 'mock-env',
  getWXContext: function() {
    return {
      OPENID: 'oMockOpenId123456',
      APPID: 'wxMockAppId',
      ENV: 'mock-env'
    }
  },
  database: function() {
    return {
      collection: function(name) {
        return createChain(name)
      },
      // db.command 模拟
      command: {
        or: function(conditions) {
          return { __or: true, conditions: conditions }
        },
        and: function(conditions) {
          return { __and: true, conditions: conditions }
        },
        neq: function(value) {
          return { __neq: true, value: value }
        },
        in: function(values) {
          return { __in: true, values: values }
        },
        gte: function(value) {
          return { __gte: true, value: value }
        },
        lte: function(value) {
          return { __lte: true, value: value }
        }
      },
      // db.RegExp 模拟
      RegExp: function(options) {
        return { __regexp: true, regexp: options.regexp, options: options.options }
      },
      serverDate: function(options) {
        if (options && options.offset) {
          return new Date(Date.now() + options.offset)
        }
        return new Date()
      }
    }
  }
}

module.exports = {
  init: cloud.init,
  DYNAMIC_CURRENT_ENV: cloud.DYNAMIC_CURRENT_ENV,
  getWXContext: cloud.getWXContext,
  database: cloud.database,
  resetMockData: resetMockData
}
