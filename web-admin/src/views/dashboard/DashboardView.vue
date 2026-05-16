<template>
  <div class="dashboard">
    <!-- 门店信息头 -->
    <el-card class="shop-header" shadow="never">
      <div class="shop-info">
        <div class="shop-detail">
          <h2 class="shop-name">{{ userStore.displayName }}</h2>
          <p class="shop-meta">
            <span>手机号：{{ formatPhone(userStore.phone) }}</span>
            <el-divider direction="vertical" />
            <span>门店码：{{ userStore.shopCode }}</span>
            <el-divider direction="vertical" />
            <span>角色：管理员</span>
          </p>
        </div>
        <div class="shop-badges">
          <el-tag v-if="userStore.isPro" type="warning" effect="dark" size="large">Pro 版</el-tag>
          <el-tag v-else type="info" effect="plain" size="large">免费版</el-tag>
        </div>
      </div>
    </el-card>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-wrapper">
      <el-skeleton :rows="5" animated />
    </div>

    <!-- 错误状态 -->
    <el-alert
      v-else-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      closable
      class="error-alert"
    />

    <!-- 主内容 -->
    <template v-else>
      <!-- 今日概况 -->
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6">
          <StatCard label="今日工单" :value="stats.todayOrders" icon="order" color="#409eff" />
        </el-col>
        <el-col :span="6">
          <StatCard label="今日营收(元)" :value="formatYuan(stats.todayRevenue)" icon="revenue" color="#67c23a" />
        </el-col>
        <el-col :span="6">
          <StatCard label="会员总数" :value="stats.totalMembers" icon="member" color="#e6a23c" />
        </el-col>
        <el-col :span="6">
          <StatCard label="总车辆" :value="stats.totalCars" icon="customer" color="#f56c6c" />
        </el-col>
      </el-row>

      <!-- ECharts 折线图 + 商机提醒 -->
      <el-row :gutter="16" class="chart-row">
        <el-col :span="16">
          <el-card shadow="hover">
            <template #header>
              <span class="card-title">最近 7 天营收趋势</span>
            </template>
            <div ref="chartRef" class="chart-container"></div>
            <div v-if="chartLoading" class="chart-loading">
              <el-skeleton :rows="3" animated />
            </div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover">
            <template #header>
              <span class="card-title">商机提醒</span>
              <el-tag size="small" type="danger" v-if="alerts.length">{{ alerts.length }}项</el-tag>
            </template>
            <div v-if="alerts.length === 0" class="no-data">暂无待处理提醒</div>
            <div v-else class="alert-list">
              <div
                v-for="(item, index) in alerts"
                :key="index"
                class="alert-item"
                :class="{ urgent: item.urgent }"
              >
                <div class="alert-header">
                  <span class="alert-plate">{{ item.plate }}</span>
                  <el-tag
                    :type="item.urgent ? 'danger' : 'warning'"
                    size="small"
                    effect="plain"
                  >
                    {{ formatDays(item.days) }}
                  </el-tag>
                </div>
                <div class="alert-desc">{{ item.typeName }} · {{ formatDate(item.date, 'MM-DD') }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useUserStore } from '@/stores/user'
import { fetchDashboardStats, fetchRevenueTrend } from '@/api/dashboard'
import { formatYuan, formatPhone, formatDate, formatDays } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'

const userStore = useUserStore()

const loading = ref(true)
const loadError = ref('')

const stats = ref({
  todayOrders: 0,
  todayRevenue: 0,
  totalRevenue: 0,
  totalCars: 0,
  totalMembers: 0,
  totalOrderCount: 0
})

const alerts = ref([])
const chartRef = ref(null)
const chartLoading = ref(true)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  loadError.value = ''

  try {
    // 并行拉取仪表盘数据和趋势数据
    const [dashboardResult, trendData] = await Promise.all([
      fetchDashboardStats(),
      fetchRevenueTrend(7).catch(() => []) // 趋势数据失败不阻塞主流程
    ])

    // 更新统计
    if (dashboardResult.stats) {
      stats.value = {
        todayOrders: dashboardResult.stats.todayOrders || 0,
        todayRevenue: dashboardResult.stats.todayRevenue || 0,
        totalRevenue: dashboardResult.stats.totalRevenue || 0,
        totalCars: dashboardResult.stats.totalCars || 0,
        totalMembers: dashboardResult.totalMemberCount || 0,
        totalOrderCount: dashboardResult.totalOrderCount || 0
      }
    }

    alerts.value = dashboardResult.alertList || []

    // 渲染折线图
    chartLoading.value = false
    nextTick(() => {
      if (trendData && trendData.length > 0) {
        renderChart(trendData)
      }
    })
  } catch (err) {
    loadError.value = err.message || '加载仪表盘数据失败'
    console.error('[Dashboard] 加载失败:', err)
  } finally {
    loading.value = false
  }
}

function renderChart(data) {
  if (!chartRef.value) return

  const myChart = echarts.init(chartRef.value)
  const dates = data.map(d => d.date.slice(5)) // MM-DD 格式
  const revenues = data.map(d => (d.revenue / 100).toFixed(2)) // 分→元
  const counts = data.map(d => d.count)

  myChart.setOption({
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['营收(元)', '工单数'],
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates
    },
    yAxis: [
      {
        type: 'value',
        name: '营收(元)',
        min: 0
      },
      {
        type: 'value',
        name: '工单数',
        min: 0
      }
    ],
    series: [
      {
        name: '营收(元)',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 3 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64,158,255,0.3)' },
            { offset: 1, color: 'rgba(64,158,255,0.05)' }
          ])
        },
        data: revenues
      },
      {
        name: '工单数',
        type: 'bar',
        yAxisIndex: 1,
        barWidth: '40%',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103,194,58,0.8)' },
            { offset: 1, color: 'rgba(103,194,58,0.2)' }
          ]),
          borderRadius: [4, 4, 0, 0]
        },
        data: counts
      }
    ]
  })

  // 窗口大小变化时自适应
  window.addEventListener('resize', () => myChart.resize())
}
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
}
.shop-header {
  margin-bottom: 16px;
  border-radius: 8px;
}
.shop-header :deep(.el-card__body) {
  padding: 20px 24px;
}
.shop-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.shop-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}
.shop-meta {
  color: #999;
  font-size: 13px;
  margin: 6px 0 0;
}
.shop-badges {
  display: flex;
  gap: 8px;
  align-items: center;
}
.loading-wrapper {
  padding: 40px;
}
.error-alert {
  margin-bottom: 16px;
}
.stat-row {
  margin-bottom: 16px;
}
.chart-row {
  margin-bottom: 16px;
}
.chart-container {
  height: 320px;
}
.chart-loading {
  padding: 40px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
}
.alert-list {
  max-height: 320px;
  overflow-y: auto;
}
.alert-item {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}
.alert-item:last-child {
  border-bottom: none;
}
.alert-item.urgent {
  background: #fef0f0;
  margin: 0 -12px;
  padding: 12px;
  border-radius: 6px;
}
.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.alert-plate {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
.alert-desc {
  font-size: 12px;
  color: #999;
}
.no-data {
  text-align: center;
  color: #ccc;
  padding: 40px 0;
  font-size: 14px;
}
</style>
