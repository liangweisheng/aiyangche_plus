<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useUserStore } from '@/stores/user'

onMounted(() => {
  // 页面加载时恢复登录态
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
</style>
