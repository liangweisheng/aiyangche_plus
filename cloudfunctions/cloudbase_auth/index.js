// cloudbase_auth 云函数
// 跨账号资源共享鉴权 - 部署在资源方环境（cloud1-2gwoxtay6a4d8181）

const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  console.log('cloudbase_auth 调用:', JSON.stringify(event))
  console.log('FROM_APPID:', wxContext.FROM_APPID)
  console.log('FROM_OPENID:', wxContext.FROM_OPENID)

  return {
    errCode: 0,
    errMsg: '',
    auth: JSON.stringify({
      // 允许所有跨账号调用方访问数据库和云函数
      access: 'granted'
    })
  }
}
