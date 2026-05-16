<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">爱养车 · 管理后台</h1>
        <p class="login-desc">使用门店管理员账号登录</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="手机号"
            :prefix-icon="Phone"
            maxlength="11"
            clearable
          />
        </el-form-item>

        <el-form-item prop="shopCode">
          <el-input
            v-model="form.shopCode"
            placeholder="门店码（6位数字）"
            :prefix-icon="Lock"
            maxlength="6"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            class="login-btn"
            :loading="loading"
            @click="handleLogin"
          >
            {{ loading ? '登录中...' : '登 录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 错误提示 -->
      <el-alert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        show-icon
        :closable="true"
        @close="errorMsg = ''"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { Phone, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()

const formRef = ref(null)
const loading = ref(false)
const errorMsg = ref('')

const form = reactive({
  phone: '',
  shopCode: ''
})

const rules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
  shopCode: [
    { required: true, message: '请输入门店码', trigger: 'blur' },
    { pattern: /^\d{6}$/, message: '门店码为6位数字', trigger: 'blur' }
  ]
}

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true

  try {
    await formRef.value.validate()
    await userStore.login(form.phone, form.shopCode)
    ElMessage.success('登录成功')
    router.push('/dashboard')
  } catch (err) {
    errorMsg.value = err.message || '登录失败，请重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 400px;
  padding: 40px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}
.login-header {
  text-align: center;
  margin-bottom: 32px;
}
.login-title {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin: 0;
}
.login-desc {
  font-size: 14px;
  color: #999;
  margin-top: 8px;
}
.login-btn {
  width: 100%;
  font-size: 16px;
}
</style>
