/**
 * sync-common.js — Common 模块同步脚本
 * 从 cloudfunctions/shared/ 同步到 repair_main/common/ 和 repair_aux/common/
 *
 * 用法: node scripts/sync-common.js
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const SHARED_DIR = path.join(ROOT, 'cloudfunctions', 'shared')
const TARGETS = [
  'cloudfunctions/repair_main/common',
  'cloudfunctions/repair_aux/common'
]

// 要同步的文件列表（排除 README.md）
const FILES = fs.readdirSync(SHARED_DIR).filter(function(f) {
  return f.endsWith('.js')
})

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8)
}

function syncFile(srcFile, targetDir, filename) {
  var srcPath = path.join(SHARED_DIR, filename)
  var destPath = path.join(ROOT, targetDir, filename)
  var srcContent = fs.readFileSync(srcPath, 'utf8')
  var srcHash = sha256(srcContent)

  // 检查目标文件是否已存在且内容一致
  if (fs.existsSync(destPath)) {
    var destContent = fs.readFileSync(destPath, 'utf8')
    var destHash = sha256(destContent)
    if (srcHash === destHash) {
      return { file: filename, target: targetDir, status: 'unchanged', hash: srcHash }
    }
  }

  // 写入目标文件
  var destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }
  fs.writeFileSync(destPath, srcContent, 'utf8')
  return { file: filename, target: targetDir, status: 'synced', hash: srcHash }
}

console.log('🔗 common 模块同步脚本 (v6.5.0)')
console.log('  源: ' + path.relative(ROOT, SHARED_DIR))
console.log('')

var results = []
FILES.forEach(function(filename) {
  TARGETS.forEach(function(targetDir) {
    try {
      var result = syncFile(SHARED_DIR, targetDir, filename)
      results.push(result)

      var icon = result.status === 'unchanged' ? '✅' : '📝'
      console.log('  ' + icon + ' ' + result.file + ' → ' + result.target + ' [' + result.hash + '] ' + result.status)
    } catch (err) {
      console.error('  ❌ ' + filename + ' → ' + targetDir + ' 失败: ' + err.message)
      results.push({ file: filename, target: targetDir, status: 'error', error: err.message })
    }
  })
})

var syncedCount = results.filter(function(r) { return r.status === 'synced' }).length
var unchangedCount = results.filter(function(r) { return r.status === 'unchanged' }).length
var errorCount = results.filter(function(r) { return r.status === 'error' }).length

console.log('')
console.log('同步完成: ' + syncedCount + ' 个已同步, ' + unchangedCount + ' 个未变化, ' + errorCount + ' 个失败')

if (errorCount > 0) {
  process.exit(1)
}
