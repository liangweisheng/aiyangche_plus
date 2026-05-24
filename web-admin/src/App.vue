<template>
  <div v-if="globalError" class="global-error">
    <div class="error-content">
      <h2>页面加载异常</h2>
      <p>{{ globalError }}</p>
      <el-button type="primary" @click="reloadPage">刷新页面</el-button>
    </div>
  </div>
  <router-view v-else />
</template>

<script setup>
import { ref, onErrorCaptured } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElButton } from 'element-plus'

const globalError = ref('')

onErrorCaptured((err, instance, info) => {
  globalError.value = err.message || '发生未知错误'
  console.error('[Global Error]', err, info)
  return false // 阻止错误继续向上传播
})

function reloadPage() {
  window.location.reload()
}

onMounted(() => {
  const userStore = useUserStore()
  userStore.restoreSession()
})
</script>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background-color: #f0f2f5;
}

.global-error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
}

.error-content {
  text-align: center;
  padding: 48px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.error-content h2 {
  color: #f56c6c;
  margin: 0 0 12px;
  font-size: 20px;
}

.error-content p {
  color: #999;
  margin: 0 0 20px;
  font-size: 14px;
}
</style>
