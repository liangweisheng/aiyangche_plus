<template>
  <div class="report-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-title">报表中心</h2>
      <span class="date-range">{{ periodLabel }}</span>
    </div>

    <!-- Tab 切换 -->
    <el-tabs v-model="activeTab" class="report-tabs" @tab-change="onTabChange">
      <el-tab-pane name="today">
        <template #label>今日</template>
      </el-tab-pane>
      <el-tab-pane name="week">
        <template #label>
          本周
          <el-icon v-if="!isPro" class="lock-icon"><Lock /></el-icon>
        </template>
      </el-tab-pane>
      <el-tab-pane name="month">
        <template #label>
          本月
          <el-icon v-if="!isPro" class="lock-icon"><Lock /></el-icon>
        </template>
      </el-tab-pane>
      <el-tab-pane name="year">
        <template #label>
          本年
          <el-icon v-if="!isPro" class="lock-icon"><Lock /></el-icon>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 免费版升级引导（非Pro账号点击本周/本月/本年时显示） -->
    <el-alert
      v-if="showFreeUpgrade"
      type="warning"
      :closable="false"
      show-icon
      class="upgrade-alert"
    >
      <template #title>
        <span>开通 Pro 版可查看高级报表数据</span>
        <el-button type="warning" size="small" class="upgrade-btn" @click="goUpgrade">
          立即升级
        </el-button>
      </template>
    </el-alert>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-wrapper">
      <el-skeleton :rows="6" animated />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="loadError" class="error-wrapper">
      <el-alert
        :title="loadError"
        type="error"
        show-icon
        :closable="false"
        class="error-alert"
      />
      <el-button type="primary" class="retry-btn" @click="loadData">重新加载</el-button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="summary.orderCount === 0" class="empty-wrapper">
      <el-empty description="当前时段暂无工单数据" />
    </div>

    <!-- 主内容 -->
    <template v-else>
      <!-- 概览卡片 -->
      <el-row :gutter="16" class="summary-row">
        <el-col :xs="12" :sm="6">
          <StatCard label="工单数" :value="summary.orderCount" icon="order" color="#409eff" />
        </el-col>
        <el-col :xs="12" :sm="6">
          <StatCard label="营收(元)" :value="formatYuan(summary.revenue)" icon="revenue" color="#67c23a" />
        </el-col>
        <el-col :xs="12" :sm="6">
          <StatCard label="客单价(元)" :value="formatYuan(summary.avgTicket)" icon="customer" color="#e6a23c" />
        </el-col>
        <el-col :xs="12" :sm="6">
          <StatCard label="到店车辆" :value="summary.carCount" icon="member" color="#f56c6c" />
        </el-col>
      </el-row>

      <!-- 折线图 + 排行表格 -->
      <el-row :gutter="16" class="content-row">
        <el-col :xs="24" :lg="14">
          <el-card shadow="hover" class="chart-card">
            <template #header>
              <span class="card-title">营收趋势</span>
            </template>
            <div ref="chartRef" class="chart-container" />
            <div v-if="chartLoading" class="chart-skeleton">
              <el-skeleton :rows="4" animated />
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="10">
          <el-card shadow="hover" class="ranking-card">
            <template #header>
              <div class="card-header-row">
                <span class="card-title">客户消费排行</span>
                <el-tag v-if="ranking.list.length > 0" size="small" type="info">
                  共 {{ ranking.total }} 位
                </el-tag>
              </div>
            </template>
            <div v-if="ranking.list.length === 0" class="no-data">
              暂无排行数据
            </div>
            <el-table
              v-else
              :data="ranking.list"
              stripe
              size="small"
              max-height="340"
              class="ranking-table"
            >
              <el-table-column type="index" label="排名" width="60" align="center">
                <template #default="{ $index }">
                  <span
                    class="rank-badge"
                    :class="{ 'rank-top': $index < 3 }"
                    :style="{ background: rankBg($index) }"
                  >
                    {{ $index + 1 }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="plate" label="车牌号" min-width="100" />
              <el-table-column prop="total" label="消费金额" width="110" align="right">
                <template #default="{ row }">
                  <span class="amount-cell">{{ formatYuan(row.total) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="count" label="工单数" width="70" align="center">
                <template #default="{ row }">
                  <el-tag size="small" type="info" effect="plain">{{ row.count }}单</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { fetchReportOrders, fetchCustomerRanking } from '@/api/report'
import { formatYuan } from '@/utils/format'
import StatCard from '@/components/StatCard.vue'
import { Lock } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'

const router = useRouter()
const userStore = useUserStore()

// ============ 权限 ============
const isPro = computed(() => userStore.isPro)

// ============ 状态 ============
const activeTab = ref('today')
const showFreeUpgrade = ref(false)
const loading = ref(false)
const loadError = ref('')
const chartLoading = ref(false)

const summary = reactive({
  orderCount: 0,
  revenue: 0,
  avgTicket: 0,
  carCount: 0
})

const ranking = reactive({
  list: [],
  total: 0
})

const chartRef = ref(null)
let chartInstance = null
let allOrders = [] // 当前 tab 的全部订单数据
let requestSeq = 0   // 请求序列号，防止竞态乱序

// ============ 计算属性 ============
const periodLabel = computed(() => {
  const now = dayjs()
  switch (activeTab.value) {
    case 'today':
      return now.format('YYYY年MM月DD日')
    case 'week':
      return `${now.startOf('week').format('MM/DD')} - ${now.endOf('week').format('MM/DD')}`
    case 'month':
      return now.format('YYYY年MM月')
    case 'year':
      return now.format('YYYY年')
    default:
      return ''
  }
})

// ============ 生命周期 ============
onMounted(() => {
  loadData()
})

onUnmounted(() => {
  if (chartInstance) {
    if (chartInstance._resizeHandler) {
      window.removeEventListener('resize', chartInstance._resizeHandler)
    }
    chartInstance.dispose()
    chartInstance = null
  }
})

// ============ 方法 ============

/** 获取时间范围 */
function getTimeRange() {
  const now = dayjs()
  let start, end
  switch (activeTab.value) {
    case 'today':
      start = now.startOf('day').valueOf()
      end = now.endOf('day').valueOf()
      break
    case 'week':
      start = now.startOf('week').valueOf()
      end = now.endOf('week').valueOf()
      break
    case 'month':
      start = now.startOf('month').valueOf()
      end = now.endOf('month').valueOf()
      break
    case 'year':
      start = now.startOf('year').valueOf()
      end = now.endOf('year').valueOf()
      break
    default:
      start = now.startOf('day').valueOf()
      end = now.endOf('day').valueOf()
  }
  return { start, end }
}

/** Tab 切换 */
function onTabChange(tabName) {
  // 免费版只能看"今日"，其他 Tab 显示升级引导
  if (!isPro.value && tabName !== 'today') {
    showFreeUpgrade.value = true
    // 清空旧数据，避免显示今日的缓存数据
    summary.orderCount = 0
    ranking.list = []
    ranking.total = 0
    allOrders = []
    return
  }
  showFreeUpgrade.value = false
  loadData()
}

/** 跳转到升级页面 */
function goUpgrade() {
  router.push('/settings#upgrade')
}

/** 加载数据 */
async function loadData() {
  const seq = ++requestSeq
  loading.value = true
  loadError.value = ''

  try {
    const { start, end } = getTimeRange()

    // 并行拉取订单和排行数据
    const [orders, rankingResult] = await Promise.all([
      fetchReportOrders(start, end),
      fetchCustomerRanking(start, end, 1, 20) // 排行仅取 Top 20
    ])

    // 丢弃过期请求（防止 Tab 快速切换导致的乱序渲染）
    if (seq !== requestSeq) return

    allOrders = orders

    // 计算概览
    computeSummary(orders)

    // 更新排行
    ranking.list = rankingResult.list || []
    ranking.total = rankingResult.total || 0

    // 渲染折线图
    await nextTick()
    renderChart(orders)

  } catch (err) {
    // 同样丢弃过期请求的错误
    if (seq !== requestSeq) return
    loadError.value = err.message || '加载报表数据失败'
    console.error('[Report] 加载失败:', err)
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

/** 计算概览数据 */
function computeSummary(orders) {
  summary.orderCount = orders.length
  summary.revenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)
  summary.avgTicket = summary.orderCount > 0
    ? Math.round(summary.revenue / summary.orderCount)
    : 0
  // 到店车辆 = 去重车牌号
  const carSet = new Set()
  orders.forEach(o => {
    if (o.plate) carSet.add(o.plate)
  })
  summary.carCount = carSet.size
}

/** 渲染折线图 */
function renderChart(orders) {
  chartLoading.value = true

  if (!chartRef.value) {
    chartLoading.value = false
    return
  }

  // 销毁旧实例前先保存并移除旧监听器
  if (chartInstance) {
    if (chartInstance._resizeHandler) {
      window.removeEventListener('resize', chartInstance._resizeHandler)
      delete chartInstance._resizeHandler
    }
    chartInstance.dispose()
    chartInstance = null
  }

  // 无数据不渲染
  if (!orders || orders.length === 0) {
    chartLoading.value = false
    return
  }

  // 按日期聚合
  const dateMap = {}
  orders.forEach(order => {
    if (!order.createTime) return
    const dateKey = dayjs(order.createTime).format('YYYY-MM-DD')
    if (!dateMap[dateKey]) {
      dateMap[dateKey] = { date: dateKey, revenue: 0, count: 0 }
    }
    dateMap[dateKey].revenue += (order.totalAmount || 0)
    dateMap[dateKey].count += 1
  })

  // 按日期排序
  const dateList = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))

  // 如果是"今日"，仅一个数据点也要展示
  if (dateList.length === 0) {
    chartLoading.value = false
    return
  }

  chartInstance = echarts.init(chartRef.value)

  const dates = dateList.map(d => d.date.slice(5)) // MM-DD
  const revenues = dateList.map(d => (d.revenue / 100).toFixed(2))
  const counts = dateList.map(d => d.count)

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
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
      data: dates,
      axisLabel: {
        rotate: dates.length > 7 ? 45 : 0
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '营收(元)',
        min: 0,
        axisLabel: {
          formatter: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v
        }
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
        symbol: dateList.length <= 3 ? 'circle' : 'none',
        symbolSize: 8,
        lineStyle: { width: 3, color: '#409eff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64,158,255,0.35)' },
            { offset: 1, color: 'rgba(64,158,255,0.02)' }
          ])
        },
        data: revenues
      },
      {
        name: '工单数',
        type: 'bar',
        yAxisIndex: 1,
        barWidth: dateList.length <= 7 ? '40%' : '60%',
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

  // 响应式（旧监听器已在 dispose 前清理，直接注册新的）
  const resizeHandler = () => {
    if (chartInstance && !chartInstance.isDisposed()) {
      chartInstance.resize()
    }
  }
  window.addEventListener('resize', resizeHandler)
  chartInstance._resizeHandler = resizeHandler

  chartLoading.value = false
}

/** 排行前3名颜色 */
function rankBg(index) {
  const colors = ['#f56c6c', '#e6a23c', '#409eff']
  return index < 3 ? colors[index] : '#c0c4cc'
}
</script>

<style scoped>
.report-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.date-range {
  font-size: 14px;
  color: #999;
}

.report-tabs {
  margin-bottom: 16px;
}

/* 免费版锁图标 */
.lock-icon {
  font-size: 13px;
  margin-left: 2px;
  vertical-align: -1px;
  color: #c0c4cc;
}

/* 升级引导条 */
.upgrade-alert {
  margin-bottom: 16px;
}

.upgrade-btn {
  margin-left: 12px;
}

/* 加载/错误/空态 */
.loading-wrapper {
  padding: 20px 0;
}

.error-wrapper {
  text-align: center;
  padding: 40px 0;
}

.error-alert {
  max-width: 500px;
  margin: 0 auto 16px;
}

.retry-btn {
  margin-top: 8px;
}

.empty-wrapper {
  padding: 60px 0;
}

/* 概览卡片 */
.summary-row {
  margin-bottom: 16px;
}

/* 内容区 */
.content-row {
  margin-bottom: 16px;
}

.chart-card,
.ranking-card {
  border-radius: 8px;
}

.chart-card :deep(.el-card__body),
.ranking-card :deep(.el-card__body) {
  padding: 0 20px 20px;
}

.chart-card :deep(.el-card__header),
.ranking-card :deep(.el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  height: 340px;
}

.chart-skeleton {
  padding: 20px 0;
}

.no-data {
  text-align: center;
  color: #ccc;
  padding: 50px 0;
  font-size: 14px;
}

/* 排行表格 */
.ranking-table :deep(.el-table__body-wrapper) {
  overflow-y: auto;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.rank-badge.rank-top {
  width: 28px;
  height: 28px;
  font-size: 14px;
}

.amount-cell {
  font-family: 'Helvetica Neue', monospace;
  font-weight: 500;
}
</style>
