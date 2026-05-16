<template>
  <el-card class="stat-card" shadow="hover">
    <div class="stat-content">
      <div class="stat-icon" :style="{ background: iconBg }">
        <el-icon :size="24" color="#fff">{{ iconComponent }}</el-icon>
      </div>
      <div class="stat-info">
        <div class="stat-value">{{ value }}</div>
        <div class="stat-label">{{ label }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { Coin, User, ShoppingCart, TrendCharts } from '@element-plus/icons-vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '-' },
  icon: { type: String, default: 'order' },
  color: { type: String, default: '#409eff' }
})

const iconBg = computed(() => props.color)

const iconComponent = computed(() => {
  const map = {
    order: ShoppingCart,
    revenue: Coin,
    member: User,
    customer: TrendCharts
  }
  return map[props.icon] || TrendCharts
})
</script>

<style scoped>
.stat-card {
  border-radius: 8px;
}
.stat-card :deep(.el-card__body) {
  padding: 20px;
}
.stat-content {
  display: flex;
  align-items: center;
  gap: 16px;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-info {
  flex: 1;
  min-width: 0;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
  line-height: 1.2;
}
.stat-label {
  font-size: 13px;
  color: #999;
  margin-top: 4px;
}
</style>
