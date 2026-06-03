/**
 * sync-common 一致性检测测试
 * 验证 cloudfunctions/shared/ 与各云函数 common/ 目录的文件内容一致
 *
 * 运行方式: npx jest sync-common --verbose
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const SHARED_DIR = path.join(ROOT, 'cloudfunctions', 'shared')
const TARGETS = [
  { name: 'repair_main', dir: 'cloudfunctions/repair_main/common' },
  { name: 'repair_aux', dir: 'cloudfunctions/repair_aux/common' }
]

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function getSharedFiles() {
  return fs.readdirSync(SHARED_DIR).filter(function(f) {
    return f.endsWith('.js')
  })
}

describe('common 模块同步一致性检测', function() {
  var sharedFiles = getSharedFiles()

  test('shared/ 目录存在且有 JS 文件', function() {
    expect(sharedFiles.length).toBeGreaterThan(0)
  })

  sharedFiles.forEach(function(filename) {
    var srcPath = path.join(SHARED_DIR, filename)
    var srcContent = fs.readFileSync(srcPath, 'utf8')
    var srcHash = sha256(srcContent)

    TARGETS.forEach(function(target) {
      var destPath = path.join(ROOT, target.dir, filename)

      test(target.name + '/common/' + filename + ' 应与 shared/' + filename + ' 一致', function() {
        expect(fs.existsSync(destPath)).toBe(true)
        var destContent = fs.readFileSync(destPath, 'utf8')
        var destHash = sha256(destContent)
        expect(destHash).toBe(srcHash)
      })
    })
  })
})

describe('公共模块内容完整性', function() {
  test('auth.js 应导出 createAuthModule', function() {
    var authPath = path.join(SHARED_DIR, 'auth.js')
    var content = fs.readFileSync(authPath, 'utf8')
    expect(content).toContain('function createAuthModule')
    expect(content).toContain('module.exports')
    expect(content).toContain('createAuthModule')
    expect(content).toContain('checkPermission')
    expect(content).toContain('_checkShopAccess')
    expect(content).toContain('_getCallerRecord')
    expect(content).toContain('_validatePhoneAccess')
  })

  test('db-utils.js 应导出 fetchAllOrders 和 MAX_LIMIT', function() {
    var dbPath = path.join(SHARED_DIR, 'db-utils.js')
    var content = fs.readFileSync(dbPath, 'utf8')
    expect(content).toContain('fetchAllOrders')
    expect(content).toContain('MAX_LIMIT')
    expect(content).toContain('module.exports')
  })
})
