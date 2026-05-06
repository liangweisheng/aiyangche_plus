// utils/caseImages.js
// 标杆案例图片映射配置（云存储版）
// v5.0.0 Phase 4 - 从本地图片迁移至云存储

/**
 * 云存储配置
 * 环境ID: cloud1-2gwoxtay6a4d8181
 * 目录: /carRepair/
 *
 * 文件命名规范: case_{分类}_{编号}.{ext}
 *   case_new_01.jpg   → new_customer（新客获取不足）
 *   case_new_02.jpg   → new_customer（第2张图）
 *   case_value_01.png → value_added（增值服务）
 *   case_retain_01.jpg→ retention（客户留存）
 *   case_maintain_01.jpg → maintenance（维保占比）
 *   case_ticket_01.jpg  → ticket（客单价）
 *   case_excellent_01.jpg→ excellent（综合优秀）
 */

var CLOUD_ENV_ID = 'cloud1-2gwoxtay6a4d8181'
var CLOUD_DIR = 'carRepair'

// ============================
// 云存储 fileID 清单（实际图片列表）
// ============================
// 后续新增图片只需在此数组中添加 fileID 即可
// 系统会根据文件名前缀自动分类到对应场景
//
// 获取方式: 上传图片到云存储 /carRepair/ 目录后，
//           右键复制 fileID 格式如:
//           cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/xxx.jpg
var CLOUD_FILE_LIST = [
  // ====== maintenance - 维保业务类 (4张) ======
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_maintain_01.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_maintain_02.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_maintain_03.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_maintain_04.jpg',

  // ====== excellent - 综合优秀类 (5张) ======
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_excellent_01.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_excellent_02.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_excellent_03.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_excellent_04.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_excellent_05.jpg',

  // ====== retention - 客户留存类 (5张) ======
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_retain_01.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_retain_02.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_retain_03.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_retain_04.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_retain_05.jpg',

  // ====== new_customer - 新客获取类 (8张) ======
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_01.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_02.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_03.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_04.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_05.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_06.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_07.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_new_08.jpg',

  // ====== value_added - 增值服务类 (2张) ======
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_value_01.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_value_02.jpg',

  // ====== ticket - 客单价类 (2张) ======
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_ticket_01.jpg',
  'cloud://cloud1-2gwoxtay6a4d8181.636c-cloud1-2gwoxtay6a4d8181-1258182356/carRepair/case_ticket_02.jpg'
]

// ============================
// 文件名前缀 → caseTag 映射表
// ============================
var PREFIX_TO_TAG = {
  'case_new':      'new_customer',
  'case_value':    'value_added',
  'case_retain':   'retention',
  'case_maintain': 'maintenance',
  'case_ticket':   'ticket',
  'case_excellent':'excellent'
}

// ============================
// 内部方法：从 fileID 提取文件名
// 输入: cloud://env.env-id.xxx/carRepair/case_new_01.jpg
// 输出: case_new_01.jpg
// ============================
function _extractFileName(fileId) {
  if (!fileId) return ''
  var parts = fileId.split('/')
  return parts[parts.length - 1] || ''
}

// ============================
// 核心：构建 CASE_IMAGE_MAP（运行时自动生成）
// ============================
function _buildCaseImageMap() {
  var map = {}
  // 初始化所有标签为空数组
  var allTags = []
  for (var k in PREFIX_TO_TAG) {
    if (PREFIX_TO_TAG.hasOwnProperty(k)) {
      allTags.push(PREFIX_TO_TAG[k])
    }
  }
  allTags.forEach(function (tag) { map[tag] = [] })

  // 按 fileID 分类
  CLOUD_FILE_LIST.forEach(function (fileId) {
    if (!fileId || fileId.indexOf('//') === -1) return
    var fileName = _extractFileName(fileId)
    if (!fileName) return
    // 解析 case_xxx_NN.ext → 提取 case_xxx 前缀
    var match = fileName.match(/^case_(\w+)_\d+\./)
    if (!match) return
    var prefix = 'case_' + match[1]
    var tag = PREFIX_TO_TAG[prefix]
    if (tag) {
      map[tag].push(fileId)
    }
  })

  return map
}

// 缓存构建结果（模块加载时执行一次）
var _cachedMap = _buildCaseImageMap()

/**
 * 根据 caseTag 获取案例图片 fileID 列表（云存储格式）
 * @param {string} tag - 诊断规则的 caseTag
 * @returns {string[]} 云存储 fileID 数组，未匹配返回空数组
 */
function getCaseImages(tag) {
  if (!tag || typeof tag !== 'string') return []
  // 兼容带 case_ 前缀的标签（如 case_retention → retention）
  var normalizedTag = tag.replace(/^case_/, '')
  return _cachedMap[normalizedTag] || []
}

/**
 * 获取所有可用的 caseTag 列表
 * @returns {string[]}
 */
function getAllCaseTags() {
  return Object.keys(_cachedMap)
}

/**
 * 获取完整的 fileID 清单（用于批量转换临时URL）
 * @returns {string[]}
 */
function getAllCloudFileIds() {
  return CLOUD_FILE_LIST.filter(function (f) { return !!f && f.indexOf('//') !== -1 })
}

module.exports = {
  CLOUD_ENV_ID: CLOUD_ENV_ID,
  CLOUD_DIR: CLOUD_DIR,
  CLOUD_FILE_LIST: CLOUD_FILE_LIST,
  CASE_IMAGE_MAP: _cachedMap,
  PREFIX_TO_TAG: PREFIX_TO_TAG,
  getCaseImages: getCaseImages,
  getAllCaseTags: getAllCaseTags,
  getAllCloudFileIds: getAllCloudFileIds
}
