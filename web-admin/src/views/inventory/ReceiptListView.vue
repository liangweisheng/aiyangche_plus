<template>
  <div class="receipt-page">
    <div class="page-header">
      <h2 class="page-title">入库单列表</h2>
      <el-button type="primary" @click="$router.push('/inventory/stock-in')">
        <el-icon><Plus /></el-icon> 新建入库
      </el-button>
    </div>

    <el-card shadow="hover" class="table-card">
      <!-- 加载状态 -->
      <div v-if="loading && receiptList.length === 0" class="loading-wrapper">
        <el-skeleton :rows="8" animated />
      </div>

      <!-- 错误状态 -->
      <div v-else-if="loadError" class="error-wrapper">
        <el-alert :title="loadError" type="error" show-icon :closable="false" />
        <el-button type="primary" class="retry-btn" @click="loadData">重新加载</el-button>
      </div>

      <!-- 空状态 -->
      <div v-else-if="total === 0 && !loading" class="empty-wrapper">
        <el-empty description="暂无入库记录" />
      </div>

      <!-- 正常表格 -->
      <template v-else>
      <el-table :data="receiptList" stripe v-loading="loading" @row-click="goDetail" highlight-current-row>
        <el-table-column label="入库单号" width="180" fixed>
          <template #default="{ row }">
            <span class="batch-cell">{{ row.batchId }}</span>
          </template>
        </el-table-column>
        <el-table-column label="商品数" width="80" align="center">
          <template #default="{ row }">{{ row.items?.length || 0 }}种</template>
        </el-table-column>
        <el-table-column label="合计数量" width="90" align="center">
          <template #default="{ row }">
            <strong>{{ row.totalQuantity || 0 }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="合计金额(元)" width="130" align="right">
          <template #default="{ row }">
            <span class="amount-cell">¥{{ formatYuan(row.totalCost || 0) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="90" />
        <el-table-column prop="supplier" label="供货商" width="120" />
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDate(row.createTime, 'YYYY-MM-DD hh:mm') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text size="small" type="primary" @click.stop="goDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-wrapper" v-if="total > 0">
        <el-pagination
          v-model:current-page="currentPage" :page-size="pageSize" :total="total"
          layout="total, prev, pager, next" @current-change="loadData"
        />
      </div>
      </template>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchReceiptList } from '@/api/inventory'
import { formatYuan, formatDate } from '@/utils/format'
import { Plus } from '@element-plus/icons-vue'

const router = useRouter()
const loading = ref(false)
const loadError = ref('')
const receiptList = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

onMounted(() => loadData())

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchReceiptList({ page: currentPage.value, pageSize: pageSize.value })
    receiptList.value = result.list
    total.value = result.total
  } catch (err) {
    loadError.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function goDetail(row) { router.push(`/inventory/receipts/${row.batchId}`) }
</script>

<style scoped>
.receipt-page { max-width: 1200px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-title { margin: 0; font-size: 20px; font-weight: 600; }
.table-card { border-radius: 8px; }
.table-card :deep(.el-card__body) { padding: 0; }
.loading-wrapper { padding: 20px; }
.error-wrapper { text-align: center; padding: 40px 0; }
.retry-btn { margin-top: 16px; }
.empty-wrapper { padding: 60px 0; }
.batch-cell { font-family: monospace; font-weight: 600; color: #409eff; }
.amount-cell { color: #f56c6c; font-weight: 600; font-family: 'Helvetica Neue', monospace; }
.pagination-wrapper { padding: 16px 20px; display: flex; justify-content: flex-end; }
</style>
