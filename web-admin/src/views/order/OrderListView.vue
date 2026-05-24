<template>
  <div class="order-page">
    <div class="page-header">
      <h2 class="page-title">工单管理</h2>
      <div class="header-right">
        <span class="subtitle" v-if="!loading">共 {{ total }} 个工单</span>
        <el-button size="small" :disabled="total === 0 || loading" @click="exportOrders">
          <el-icon><Download /></el-icon> 导出
        </el-button>
      </div>
    </div>

    <!-- 搜索/筛选 -->
    <el-card shadow="never" class="search-card">
      <el-row :gutter="12" align="middle">
        <el-col :span="6">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索车牌号"
            :prefix-icon="Search"
            clearable
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
        </el-col>
        <el-col :span="4">
          <el-select v-model="statusFilter" placeholder="工单状态" clearable @change="onSearch">
            <el-option label="全部" value="" />
            <el-option label="已完成" value="已完成" />
            <el-option label="进行中" value="进行中" />
            <el-option label="待结算" value="待结算" />
          </el-select>
        </el-col>
        <el-col :span="3">
          <el-button type="primary" @click="onSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-wrapper">
      <el-skeleton :rows="8" animated />
    </div>

    <!-- 错误状态 -->
    <div v-else-if="loadError" class="error-wrapper">
      <el-alert :title="loadError" type="error" show-icon :closable="false" />
      <el-button type="primary" class="retry-btn" @click="loadData">重新加载</el-button>
    </div>

    <!-- 空状态 -->
    <div v-else-if="total === 0" class="empty-wrapper">
      <el-empty description="暂无工单数据" />
    </div>

    <!-- 工单表格 -->
    <el-card v-else shadow="hover" class="table-card">
      <el-table
        :data="orderList"
        stripe
        v-loading="tableLoading"
        @row-click="openDetail"
        highlight-current-row
        class="order-table"
      >
        <el-table-column label="车牌号" width="120" fixed>
          <template #default="{ row }">
            <span class="plate-cell">{{ row.plate || '-' }}</span>
            <el-tag v-if="row.isMember" size="small" type="warning" effect="dark" class="vip-tag">VIP</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="金额(元)" width="110" align="right">
          <template #default="{ row }">
            <span class="amount-cell">{{ formatYuan(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="支付方式" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ payMethodLabel(row.payMethod) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="dark">
              {{ row.status || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服务项目" min-width="180">
          <template #default="{ row }">
            <span class="items-text">{{ formatItems(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160" align="center">
          <template #default="{ row }">
            {{ formatDate(row.createTime, 'YYYY-MM-DD hh:mm') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text size="small" type="primary" @click.stop="openDetail(row)">详情</el-button>
            <el-popconfirm
              v-if="row.status === '已完成' && !row.isVoided"
              title="确定作废此工单？此操作不可撤销。"
              confirm-button-text="确定作废"
              cancel-button-text="取消"
              confirm-button-type="danger"
              @confirm="handleVoid(row)"
            >
              <template #reference>
                <el-button text size="small" type="danger" @click.stop>作废</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="total > 0">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[15, 30, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="'工单详情 · ' + (currentOrder ? currentOrder.plate : '')"
      size="480px"
      destroy-on-close
    >
      <template v-if="currentOrder">
        <!-- 状态 + 金额 -->
        <div class="order-header-card">
          <div class="header-top">
            <el-tag :type="statusType(currentOrder.status)" size="large" effect="dark">
              {{ currentOrder.status || '-' }}
            </el-tag>
            <span v-if="currentOrder.isVoided" class="voided-badge">已作废</span>
          </div>
          <div class="header-amount">¥{{ formatYuan(currentOrder.totalAmount) }}</div>
        </div>

        <!-- 基本信息 -->
        <el-descriptions :column="1" border size="small" class="detail-desc">
          <el-descriptions-item label="车牌号">
            <strong>{{ currentOrder.plate }}</strong>
          </el-descriptions-item>
          <el-descriptions-item label="支付方式">
            {{ payMethodLabel(currentOrder.payMethod) }}
          </el-descriptions-item>
          <el-descriptions-item label="会员">
            <el-tag v-if="currentOrder.isMember" type="warning" size="small">VIP</el-tag>
            <span v-else>非会员</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(currentOrder.createTime, 'YYYY-MM-DD hh:mm:ss') }}
          </el-descriptions-item>
          <el-descriptions-item v-if="currentOrder.mileage" label="里程">
            {{ currentOrder.mileage.toLocaleString() }} km
          </el-descriptions-item>
        </el-descriptions>

        <!-- 服务项目 -->
        <el-divider />
        <h4 class="section-title">服务项目</h4>
        <div v-if="formatItems(currentOrder) === '-'" class="no-data">暂无服务项目</div>
        <el-table
          v-else
          :data="parseServiceItems(currentOrder)"
          size="small"
          border
          class="items-table"
        >
          <el-table-column prop="name" label="项目名称" min-width="120" />
          <el-table-column prop="spec" label="规格" width="80" />
          <el-table-column prop="amount" label="金额(元)" width="100" align="right">
            <template #default="{ row: item }">
              {{ formatYuan(item.amount || 0) }}
            </template>
          </el-table-column>
          <el-table-column prop="qty" label="数量" width="60" align="center" />
          <el-table-column prop="category" label="分类" width="80" />
        </el-table>

        <!-- 备注 -->
        <el-divider />
        <h4 class="section-title">备注</h4>
        <p class="remark-text">{{ currentOrder.remark || '无' }}</p>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchOrderList, voidOrder as voidOrderApi } from '@/api/order'
import { formatYuan, formatDate } from '@/utils/format'
import { exportToCSV } from '@/utils/export'
import { Search, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// ============ 数据 ============
const loading = ref(true)
const tableLoading = ref(false)
const loadError = ref('')
const orderList = ref([])
const total = ref(0)

const searchKeyword = ref('')
const statusFilter = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// 抽屉
const drawerVisible = ref(false)
const currentOrder = ref(null)
const voiding = ref(false)

// ============ 生命周期 ============
onMounted(() => {
  loadData()
})

// ============ 工具方法 ============

function statusType(status) {
  const map = { '已完成': 'success', '进行中': 'warning', '待结算': 'danger' }
  return map[status] || 'info'
}

function payMethodLabel(method) {
  const map = { cash: '现金', wechat: '微信', alipay: '支付宝', card: '刷卡' }
  return map[method] || method || '-'
}

function formatItems(order) {
  const arr = parseServiceItems(order)
  if (arr.length === 0) return '-'
  return arr.map(i => i.name + (i.spec ? ` ${i.spec}` : '')).join('、')
}

function parseServiceItems(order) {
  // 优先使用 _serviceItemsArr
  if (Array.isArray(order._serviceItemsArr) && order._serviceItemsArr.length > 0) {
    return order._serviceItemsArr
  }
  // 兼容旧格式
  if (order.serviceItems && typeof order.serviceItems === 'string') {
    const names = order.serviceItems.split(/[,，]/).map(s => s.trim()).filter(s => s)
    const amounts = (order.serviceAmounts || '').split(',').map(a => Number(a) || 0)
    const quantities = (order.serviceQuantities || '').split(',').map(q => Number(q) || 1)
    const categories = (order.serviceCategories || '').split(',').map(c => c.trim())
    return names.map((name, idx) => {
      const parts = name.split(/\s+/)
      return {
        name: parts[0] || name,
        spec: parts.slice(1).join(' ') || '',
        amount: amounts[idx] || 0,
        qty: quantities[idx] || 1,
        category: categories[idx] || ''
      }
    })
  }
  return []
}

// ============ 方法 ============

async function loadData() {
  tableLoading.value = true
  loadError.value = ''

  try {
    const result = await fetchOrderList({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
      statusFilter: statusFilter.value
    })
    orderList.value = result.list
    total.value = result.total
  } catch (err) {
    loadError.value = err.message || '加载工单数据失败'
    console.error('[OrderList] 加载失败:', err)
  } finally {
    loading.value = false
    tableLoading.value = false
  }
}

function onSearch() {
  currentPage.value = 1
  loadData()
}

function openDetail(order) {
  currentOrder.value = order
  drawerVisible.value = true
}

async function handleVoid(order) {
  if (voiding.value) return
  voiding.value = true
  try {
    await voidOrderApi(order._id)
    // 先刷新列表，成功后再提示+关闭抽屉
    await loadData()
    drawerVisible.value = false
    ElMessage.success('工单已作废')
  } catch (err) {
    ElMessage.error(err.message || '作废失败')
    console.error('[OrderList] 作废失败:', err)
  } finally {
    voiding.value = false
  }
}

function exportOrders() {
  try {
    const columns = [
      { key: 'plate', label: '车牌号' },
      { key: 'totalAmount', label: '金额(元)' },
      { key: 'payMethod', label: '支付方式' },
      { key: 'status', label: '状态' },
      { key: 'itemsText', label: '服务项目' },
      { key: 'createTime', label: '创建时间' }
    ]
    const rows = orderList.value.map(o => ({
      ...o,
      totalAmount: formatYuan(o.totalAmount),
      payMethod: payMethodLabel(o.payMethod),
      itemsText: formatItems(o),
      createTime: formatDate(o.createTime, 'YYYY-MM-DD hh:mm')
    }))
    const now = formatDate(new Date(), 'YYYYMMDD')
    exportToCSV(`工单导出_${now}`, rows, columns)
    ElMessage.success(`已导出 ${rows.length} 条记录`)
  } catch (err) {
    ElMessage.error(err.message || '导出失败')
  }
}
</script>

<style scoped>
.order-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.subtitle {
  font-size: 13px;
  color: #999;
}

.search-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.search-card :deep(.el-card__body) {
  padding: 16px 20px;
}

.loading-wrapper {
  padding: 20px 0;
}

.error-wrapper {
  text-align: center;
  padding: 40px 0;
}

.retry-btn {
  margin-top: 16px;
}

.empty-wrapper {
  padding: 60px 0;
}

.table-card {
  border-radius: 8px;
}

.table-card :deep(.el-card__body) {
  padding: 0;
}

.order-table {
  cursor: pointer;
}

.plate-cell {
  font-weight: 600;
  font-family: 'Helvetica Neue', monospace;
  color: #333;
}

.vip-tag {
  margin-left: 6px;
}

.amount-cell {
  font-family: 'Helvetica Neue', monospace;
  font-weight: 500;
}

.items-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #666;
  font-size: 13px;
}

.pagination-wrapper {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
}

/* 详情抽屉 */
.order-header-card {
  background: linear-gradient(135deg, #409eff 0%, #337ecc 100%);
  color: #fff;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 16px;
  text-align: center;
}

.header-top {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.header-amount {
  font-size: 32px;
  font-weight: 700;
  font-family: 'Helvetica Neue', monospace;
}

.voided-badge {
  background: rgba(255,255,255,0.2);
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 13px;
}

.detail-desc {
  margin-bottom: 4px;
}

.section-title {
  margin: 8px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.remark-text {
  color: #666;
  font-size: 14px;
  line-height: 1.6;
}

.items-table {
  margin-bottom: 4px;
}

.no-data {
  text-align: center;
  color: #ccc;
  padding: 16px 0;
  font-size: 13px;
}
</style>
