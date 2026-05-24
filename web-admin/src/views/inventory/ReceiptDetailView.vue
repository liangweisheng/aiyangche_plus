<template>
  <div class="receipt-detail-page">
    <el-page-header @back="$router.push('/inventory/receipts')">
      <template #content><span class="back-title">入库单详情</span></template>
    </el-page-header>

    <div v-if="loading" class="loading-wrapper"><el-skeleton :rows="6" animated /></div>

    <div v-else-if="loadError" class="error-wrapper">
      <el-alert :title="loadError" type="error" show-icon :closable="false" />
      <el-button type="primary" class="retry-btn" @click="loadDetail">重新加载</el-button>
    </div>

    <template v-else-if="receipt">
      <!-- 顶部卡片 -->
      <div class="receipt-header-card">
        <div class="receipt-title">入库单 · {{ receipt.batchId }}</div>
        <div class="receipt-meta">
          <span>操作人：{{ receipt.operator || '-' }}</span>
          <el-divider direction="vertical" />
          <span>时间：{{ formatDate(receipt.createTime, 'YYYY-MM-DD hh:mm:ss') }}</span>
        </div>
      </div>

      <!-- 商品明细 -->
      <el-card shadow="hover" class="items-card">
        <template #header><span class="card-title">商品明细</span></template>
        <el-table :data="receipt.items || []" size="small" border>
          <el-table-column label="商品名称" min-width="160">
            <template #default="{ row: item }">{{ item.productName }}</template>
          </el-table-column>
          <el-table-column prop="spec" label="规格" width="100">
            <template #default="{ row: item }">{{ item.spec || '-' }}</template>
          </el-table-column>
          <el-table-column label="进价(元)" width="110" align="right">
            <template #default="{ row: item }">¥{{ formatYuan(item.cost || 0) }}</template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="center">
            <template #default="{ row: item }">×{{ item.quantity }}</template>
          </el-table-column>
          <el-table-column label="小计(元)" width="120" align="right">
            <template #default="{ row: item }">
              <span class="subtotal">¥{{ formatYuan((item.cost || 0) * (item.quantity || 0)) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 汇总行 -->
        <div class="summary-bar">
          <span>合计数量：<strong>{{ receipt.totalQuantity || 0 }}</strong></span>
          <span class="summary-amount">合计金额：<strong>¥{{ formatYuan(receipt.totalCost || 0) }}</strong></span>
        </div>
      </el-card>

      <!-- 其他信息 -->
      <el-card shadow="hover" class="info-card-bottom">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="供货商">{{ receipt.supplier || '无' }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ receipt.operator || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ receipt.remark || '无' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>
    </template>

    <div v-else class="empty-wrapper"><el-empty description="入库单不存在" /></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { fetchReceiptDetail, fetchReceiptByLogId } from '@/api/inventory'
import { formatYuan, formatDate } from '@/utils/format'

const route = useRoute()
const loading = ref(false)
const loadError = ref('')
const receipt = ref(null)

onMounted(() => loadDetail())

async function loadDetail() {
  loading.value = true
  loadError.value = ''
  try {
    const batchId = route.params.batchId
    const logId = route.query.logId

    if (batchId && batchId !== 'by-log') {
      receipt.value = await fetchReceiptDetail(batchId)
    } else if (logId) {
      receipt.value = await fetchReceiptByLogId(logId)
    } else {
      loadError.value = '缺少入库单号或流水ID'
    }
  } catch (err) {
    loadError.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.receipt-detail-page { max-width: 900px; margin: 0 auto; }
.back-title { font-size: 16px; font-weight: 600; }
.loading-wrapper { padding: 20px 0; }
.error-wrapper { text-align: center; padding: 40px 0; }
.retry-btn { margin-top: 16px; }
.empty-wrapper { padding: 60px 0; }

.receipt-header-card {
  background: linear-gradient(135deg, #67c23a 0%, #529b2e 100%);
  color: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  margin-top: 16px;
  margin-bottom: 16px;
}
.receipt-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
.receipt-meta { font-size: 13px; opacity: 0.85; display: flex; align-items: center; gap: 4px; }
.receipt-meta :deep(.el-divider) { border-color: rgba(255,255,255,0.3); }

.items-card, .info-card-bottom { margin-bottom: 16px; border-radius: 8px; }
.card-title { font-size: 15px; font-weight: 600; }

.subtotal { color: #f56c6c; font-weight: 600; }
.summary-bar {
  display: flex;
  justify-content: space-between;
  padding: 16px 0 4px;
  font-size: 16px;
  border-top: 2px solid #409eff;
  margin-top: 12px;
}
.summary-amount { color: #f56c6c; }
</style>
