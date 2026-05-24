/**
 * 通用导出工具
 */

/**
 * 导出 JSON 数据为 CSV 文件并触发下载
 * @param {string} filename - 文件名（不含扩展名）
 * @param {Array<object>} rows - 数据行数组
 * @param {Array<{key: string, label: string}>} columns - 列定义
 */
export function exportToCSV(filename, rows, columns) {
  if (!rows || rows.length === 0) {
    throw new Error('没有数据可导出')
  }

  // BOM 头确保 Excel 正确识别 UTF-8 中文
  const bom = '\uFEFF'

  // 表头
  const header = columns.map(c => escapeCSV(c.label)).join(',')

  // 数据行
  const body = rows.map(row =>
    columns.map(c => {
      const val = row[c.key]
      return escapeCSV(formatCSVValue(val))
    }).join(',')
  )

  const csv = bom + [header, ...body].join('\n')
  downloadFile(`${filename}.csv`, csv, 'text/csv;charset=utf-8')
}

/**
 * 导出任意文本内容为文件并触发下载
 * @param {string} filename - 完整文件名
 * @param {string} content - 文件内容
 * @param {string} mimeType - MIME 类型
 */
export function downloadFile(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * CSV 值格式化
 */
function formatCSVValue(val) {
  if (val === null || val === undefined) return ''
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  if (typeof val === 'boolean') return val ? '是' : '否'
  return String(val)
}

/**
 * CSV 字段转义（含逗号/引号/换行的字段加引号包裹）
 */
function escapeCSV(str) {
  const s = String(str || '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
