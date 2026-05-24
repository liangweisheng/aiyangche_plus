<template>
  <div class="detail-page">
    <el-page-header @back="$router.push('/inventory/products')" title="返回商品列表">
      <template #content><span class="back-title">商品详情</span></template>
    </el-page-header>

    <div v-if="loading" class="loading-wrapper"><el-skeleton :rows="6" animated /></div>

    <template v-else-if="product">
      <!-- 商品信息卡片 -->
      <el-card shadow="hover" class="info-card">
        <div class="info-header">
          <h3>{{ product.name }}</h3>
          <div class="info-badges">
            <el-tag :type="product.productStatus === 'off_shelf' ? 'danger' : 'success'" size="small">
              {{ product.productStatus === 'off_shelf' ? '已下架' : '已上架' }}
            </el-tag>
            <el-tag v-if="product.category" type="info" size="small">{{ product.category }}</el-tag>
          </div>
        </div>
        <el-row :gutter="24" class="info-grid">
          <el-col :span="6"><div class="kv"><span class="kv-label">售价</span><span class="kv-value">¥{{ formatYuan(product.price) }}</span></div></el-col>
          <el-col :span="6"><div class="kv"><span class="kv-label">进价</span><span class="kv-value">¥{{ formatYuan(product.cost) }}</span></div></el-col>
          <el-col :span="6"><div class="kv"><span class="kv-label">总库存</span><span class="kv-value">{{ product.stock || 0 }} {{ product.unit }}</span></div></el-col>
          <el-col :span="6"><div class="kv"><span class="kv-label">单位</span><span class="kv-value">{{ product.unit || '-' }}</span></div></el-col>
        </el-row>
        <div v-if="product.remark" class="remark-box"><span class="kv-label">备注：</span>{{ product.remark }}</div>
      </el-card>

      <!-- 多规格库存 -->
      <el-card v-if="product.specStock && product.specStock.length > 0" shadow="hover" class="spec-card">
        <template #header><span class="card-title">规格库存</span></template>
        <el-table :data="product.specStock" size="small" border>
          <el-table-column prop="label" label="规格" width="140" />
          <el-table-column label="库存" width="100" align="center">
            <template #default="{ row: s }">
              <el-tag :type="s.stock <= 0 ? 'danger' : s.stock <= 10 ? 'warning' : 'success'" size="small">{{ s.stock }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="售价(元)" width="100" align="right">
            <template #default="{ $index }">{{ formatYuan((product.specPrice || [])[$index]?.price || product.price) }}</template>
          </el-table-column>
          <el-table-column label="进价(元)" width="100" align="right">
            <template #default="{ $index }">{{ formatYuan((product.specCost || [])[$index]?.cost || product.cost) }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 库存调整按钮 -->
      <el-card shadow="hover" class="adjust-card">
        <el-button type="warning" @click="showAdjust = true"><el-icon><Edit /></el-icon> 库存调整</el-button>
      </el-card>

      <!-- 库存流水 -->
      <el-card shadow="hover" class="logs-card">
        <template #header>
          <div class="card-header-row">
            <span class="card-title">库存流水</span>
            <div class="log-filters">
              <el-select v-model="logType" placeholder="类型" size="small" clearable @change="loadLogs" style="width:100px">
                <el-option label="全部" value="" />
                <el-option label="入库" value="in" />
                <el-option label="出库" value="out" />
                <el-option label="调整" value="adjust" />
              </el-select>
              <el-date-picker
                v-model="logDateRange"
                type="daterange"
                range-separator="-"
                start-placeholder="开始"
                end-placeholder="结束"
                size="small"
                @change="loadLogs"
              />
            </div>
          </div>
        </template>
        <el-table :data="logList" size="small" stripe v-loading="logLoading" @row-click="handleLogClick">
          <el-table-column label="类型" width="70" align="center">
            <template #default="{ row: l }">
              <el-tag :type="logTypeTag(l.type)" size="small" effect="dark">{{ l.type === 'in' ? '入库' : l.type === 'out' ? '出库' : '调整' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="spec" label="规格" width="80" />
          <el-table-column label="数量" width="70" align="center">
            <template #default="{ row: l }">{{ l.quantity > 0 ? '+' : '' }}{{ l.quantity }}</template>
          </el-table-column>
          <el-table-column label="进价(元)" width="90" align="right">
            <template #default="{ row: l }">{{ l.cost ? formatYuan(l.cost) : '-' }}</template>
          </el-table-column>
          <el-table-column prop="operator" label="操作人" width="80" />
          <el-table-column prop="supplier" label="供货商" width="90" />
          <el-table-column prop="remark" label="备注" min-width="120">
            <template #default="{ row: l }">{{ l.remark || '-' }}</template>
          </el-table-column>
          <el-table-column label="时间" width="160">
            <template #default="{ row: l }">{{ formatDate(l.createTime, 'YYYY-MM-DD hh:mm') }}</template>
          </el-table-column>
        </el-table>
        <div class="pagination-wrapper" v-if="logTotal > 0">
          <el-pagination
            v-model:current-page="logPage" :page-size="logPageSize" :total="logTotal"
            layout="prev, pager, next" small @current-change="loadLogs"
          />
        </div>
      </el-card>
    </template>

    <!-- 库存调整弹窗 -->
    <el-dialog v-model="showAdjust" title="库存调整" width="420px" destroy-on-close>
      <el-form :model="adjustForm" label-position="top" size="small">
        <el-form-item v-if="hasSpecs" label="规格">
          <el-select v-model="adjustForm.spec" placeholder="选择规格" clearable style="width:100%">
            <el-option v-for="s in (product?.specStock || [])" :key="s.label" :label="`${s.label} (库存:${s.stock})`" :value="s.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标库存">
          <el-input-number v-model="adjustForm.quantity" :min="0" :step="1" controls-position="right" style="width:100%" />
          <span class="form-tip">当前库存：{{ currentSpecStock }}</span>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-select v-model="adjustForm.reason" style="width:100%">
            <el-option label="盘盈" value="盘盈" />
            <el-option label="盘亏" value="盘亏" />
            <el-option label="退货入库" value="退货入库" />
            <el-option label="损耗报损" value="损耗报损" />
            <el-option label="手动调整" value="手动调整" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="adjustForm.remark" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAdjust = false">取消</el-button>
        <el-button type="primary" :loading="adjusting" @click="doAdjust">确认调整</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { fetchProductDetail, fetchStockLogs, adjustStock } from '@/api/inventory'
import { fetchReceiptByLogId } from '@/api/inventory'
import { formatYuan, formatDate } from '@/utils/format'
import { Edit } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const productId = route.params.id

const loading = ref(false)
const product = ref(null)
const hasSpecs = computed(() => product.value?.specStock?.length > 0)

// 流水
const logLoading = ref(false)
const logList = ref([])
const logTotal = ref(0)
const logPage = ref(1)
const logPageSize = ref(20)
const logType = ref('')
const logDateRange = ref([])

// 调整
const showAdjust = ref(false)
const adjusting = ref(false)
const adjustForm = reactive({ spec: '', quantity: 0, reason: '盘盈', remark: '' })

const currentSpecStock = computed(() => {
  if (!product.value) return 0
  if (hasSpecs.value && adjustForm.spec) {
    const s = product.value.specStock.find(s => s.label === adjustForm.spec)
    return s ? s.stock : 0
  }
  return product.value.stock || 0
})

onMounted(async () => {
  loading.value = true
  try {
    product.value = await fetchProductDetail(productId)
    loadLogs()
  } catch (err) {
    ElMessage.error(err.message || '加载失败')
  } finally {
    loading.value = false
  }
})

async function loadLogs() {
  logLoading.value = true
  try {
    let startDate = '', endDate = ''
    if (logDateRange.value && logDateRange.value.length === 2) {
      startDate = logDateRange.value[0]
      endDate = logDateRange.value[1]
    }
    const result = await fetchStockLogs({
      productId, page: logPage.value, pageSize: logPageSize.value,
      logType: logType.value, startDate, endDate
    })
    logList.value = result.list
    logTotal.value = result.total
  } catch (err) {
    ElMessage.error(err.message || '加载流水失败')
  } finally {
    logLoading.value = false
  }
}

async function doAdjust() {
  adjusting.value = true
  try {
    // quantity 是目标库存，云函数接受 delta，此处计算差值传入
    const delta = adjustForm.quantity - currentSpecStock.value
    if (delta === 0) { ElMessage.warning('目标库存与当前库存相同'); return }
    await adjustStock({
      productId, spec: adjustForm.spec || '',
      quantity: delta,
      reason: adjustForm.reason,
      remark: adjustForm.remark,
      operator: userStore.displayName || '管理员'
    })
    ElMessage.success('调整成功')
    showAdjust.value = false
    product.value = await fetchProductDetail(productId)
    loadLogs()
  } catch (err) {
    ElMessage.error(err.message || '调整失败')
  } finally {
    adjusting.value = false
  }
}

function logTypeTag(type) {
  const map = { in: 'success', out: 'danger', adjust: 'warning' }
  return map[type] || 'info'
}

async function handleLogClick(log) {
  if (log.type === 'in' && log.batchId) {
    try {
      const receipt = await fetchReceiptByLogId(log._id)
      if (receipt && receipt.batchId) {
        router.push(`/inventory/receipts/${receipt.batchId}`)
      }
    } catch { /* 无关联入库单，忽略 */ }
  }
}
</script>

<style scoped>
.detail-page { max-width: 1100px; margin: 0 auto; }
.back-title { font-size: 16px; font-weight: 600; }
.loading-wrapper { padding: 20px 0; }
.info-card { margin-top: 16px; margin-bottom: 16px; border-radius: 8px; }
.info-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.info-header h3 { margin: 0; font-size: 18px; }
.info-badges { display: flex; gap: 6px; }
.info-grid { margin-bottom: 8px; }
.kv .kv-label { font-size: 12px; color: #999; display: block; margin-bottom: 2px; }
.kv .kv-value { font-size: 16px; font-weight: 600; color: #333; }
.remark-box { color: #666; font-size: 13px; padding-top: 8px; border-top: 1px solid #f0f0f0; }
.spec-card, .adjust-card, .logs-card { margin-bottom: 16px; border-radius: 8px; }
.card-title { font-size: 15px; font-weight: 600; }
.card-header-row { display: flex; justify-content: space-between; align-items: center; }
.log-filters { display: flex; gap: 8px; align-items: center; }
.pagination-wrapper { padding: 16px 0 4px; display: flex; justify-content: flex-end; }
.form-tip { color: #999; font-size: 12px; margin-left: 8px; }
</style>
