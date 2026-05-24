<template>
  <el-container class="app-layout">
    <!-- 侧边栏 -->
    <el-aside :width="asideWidth" class="app-aside">
      <div class="aside-header">
        <span v-show="!userStore.opened" class="logo-text">AI</span>
        <span v-show="userStore.opened" class="logo-text-full">爱养车 · 后台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :default-openeds="openedSubMenus"
        :collapse="!userStore.opened"
        background-color="#001529"
        text-color="rgba(255,255,255,0.65)"
        active-text-color="#fff"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <template #title>仪表盘</template>
        </el-menu-item>
        <el-menu-item index="/report">
          <el-icon><TrendCharts /></el-icon>
          <template #title>报表中心</template>
        </el-menu-item>
        <el-menu-item index="/cars">
          <el-icon><Van /></el-icon>
          <template #title>车辆管理</template>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><Document /></el-icon>
          <template #title>工单管理</template>
        </el-menu-item>
        <el-menu-item index="/members">
          <el-icon><UserFilled /></el-icon>
          <template #title>会员管理</template>
        </el-menu-item>
        <el-sub-menu index="/inventory">
          <template #title>
            <el-icon><Box /></el-icon>
            <span>库存管理</span>
          </template>
          <el-menu-item index="/inventory/products">
            <el-icon><Goods /></el-icon>
            <template #title>商品管理</template>
          </el-menu-item>
          <el-menu-item index="/inventory/stock-in">
            <el-icon><ShoppingCart /></el-icon>
            <template #title>入库管理</template>
          </el-menu-item>
          <el-menu-item index="/inventory/receipts">
            <el-icon><Tickets /></el-icon>
            <template #title>入库单列表</template>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <template #title>门店设置</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主区域 -->
    <el-container>
      <!-- 顶栏 -->
      <el-header class="app-header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="toggleSidebar">
            <Fold v-if="userStore.opened" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta.title">{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tag v-if="userStore.isPro" type="warning" size="small" effect="dark">Pro</el-tag>
          <span class="user-info">
            {{ userStore.displayName }}
            <el-icon><User /></el-icon>
          </span>
          <el-button text size="small" @click="handleLogout">退出</el-button>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { Fold, Expand, Odometer, TrendCharts, Van, Document, UserFilled, Box, Goods, ShoppingCart, Tickets, Setting, User } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const activeMenu = computed(() => {
  const path = route.path
  // 库存子路由映射到父级 index 以便高亮
  if (path.startsWith('/inventory')) {
    if (path.startsWith('/inventory/products')) return '/inventory/products'
    return path
  }
  return path
})
const openedSubMenus = computed(() => {
  if (route.path.startsWith('/inventory')) return ['/inventory']
  return []
})
const asideWidth = computed(() => userStore.opened ? '220px' : '64px')

function toggleSidebar() {
  userStore.opened = !userStore.opened
}

function handleLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-layout {
  height: 100vh;
}
.app-aside {
  background-color: #001529;
  transition: width 0.3s;
  overflow: auto;
}
.aside-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.logo-text-full {
  font-size: 16px;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 20px;
  height: 60px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.collapse-btn {
  font-size: 20px;
  cursor: pointer;
  color: #666;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 14px;
}
.app-main {
  background: #f0f2f5;
  padding: 20px;
  height: calc(100vh - 60px);
  overflow: auto;
}
</style>
