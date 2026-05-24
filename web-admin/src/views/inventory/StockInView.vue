<template>
  <div class="stockin-page">
    <el-page-header @back="$router.push('/inventory/products')">
      <template #content><span class="back-title">入库管理</span></template>
    </el-page-header>

    <!-- 基本信息 -->
    <el-card shadow="hover" class="info-card">
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="供货商" label-position="top">
            <el-input v-model="supplier" placeholder="如：XX汽配城" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="操作人" label-position="top">
            <el-input v-model="operator" placeholder="入库操作人" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="备注" label-position="top">
            <el-input v-model="remark" placeholder="备注信息" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>

    <!-- 添加商品按钮 -->
    <el-card shadow="hover" class="action-card">
      <el-button type="primary" @click="showPicker = true"><el-icon><Plus /></el-icon> 选择商品</el-button>
      <span class="hint-text">已选 {{ selectedItems.length }} 种商品</span>
    </el-card>

    <!-- 已选商品列表 -->
    <el-card v-if="selectedItems.length > 0" shadow="hover" class="items-card">
      <el-table :data="selectedItems" size="small" border>
        <el-table-column label="商品" min-width="160">
          <template #default="{ row }">{{ row.productName }}</template>
        </el-table-column>
        <el-table-column label="规格" width="100">
          <template #default="{ row }">
            <el-select v-if="row.specs && row.specs.length > 0" v-model="row.spec" placeholder="选择" size="small" style="width:100%">
              <el-option v-for="s in row.specs" :key="s" :label="s" :value="s" />
            </el-select>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="进价(元)" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.cost" :min="0" :precision="2" size="small" controls-position="right" style="width:100%" />
          </template>
        </el-table-column>
        <el-table-column label="数量" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.quantity" :min="1" size="small" controls-position="right" style="width:100%" />
          </template>
        </el-table-column>
        <el-table-column label="小计(元)" width="110" align="right">
          <template #default="{ row }">{{ formatYuan((row.cost || 0) * (row.quantity || 0)) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="70" align="center">
          <template #default="{ $index }">
            <el-button type="danger" :icon="Delete" circle size="small" @click="selectedItems.splice($index, 1)" />
          </template>
        </el-table-column>
      </el-table>

      <!-- 汇总 -->
      <div class="total-row">
        <span>合计数量：<strong>{{ totalQty }}</strong></span>
        <span class="total-amount">合计金额：<strong>¥{{ formatYuan(totalAmount) }}</strong></span>
      </div>

      <el-button type="success" size="large" :loading="submitting" class="submit-btn" @click="doStockIn">
        <el-icon><Check /></el-icon> 确认入库
      </el-button>
    </el-card>

    <!-- 商品选择器弹窗 -->
    <el-dialog v-model="showPicker" title="选择商品" width="700px" destroy-on-close>
      <el-input v-model="pickerKeyword" placeholder="搜索商品名" :prefix-icon="Search" clearable class="picker-search" />
      <el-table
        :data="filteredPickerList"
        stripe
        size="small"
        max-height="400"
        @selection-change="onPickerSelect"
        ref="pickerTable"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="name" label="商品名称" min-width="160" />
        <el-table-column prop="category" label="分类" width="90">
          <template #default="{ row }"><el-tag size="small" type="info">{{ row.category }}</el-tag></template>
        </el-table-column>
        <el-table-column label="库存" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.stock <= 0 ? 'danger' : 'success'" size="small">{{ row.stock || 0 }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showPicker = false">取消</el-button>
        <el-button type="primary" @click="confirmPicker">确认添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchProductList, batchAddStock } from '@/api/inventory'
import { formatYuan } from '@/utils/format'
import { Search, Plus, Delete, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()

const supplier = ref('')
const operator = ref('')
const remark = ref('')

// 已选商品
const selectedItems = reactive([])
const submitting = ref(false)

const totalQty = computed(() => selectedItems.reduce((s, i) => s + (i.quantity || 0), 0))
const totalAmount = computed(() => selectedItems.reduce((s, i) => s + (i.cost || 0) * (i.quantity || 0), 0))

// 选择器
const showPicker = ref(false)
const pickerKeyword = ref('')
const pickerList = ref([])
const pickerSelection = ref([])

const filteredPickerList = computed(() => {
  if (!pickerKeyword.value.trim()) return pickerList.value
  const kw = pickerKeyword.value.trim().toLowerCase()
  return pickerList.value.filter(p => p.name.toLowerCase().includes(kw))
})

onMounted(async () => {
  try {
    const result = await fetchProductList({ pageSize: 200, status: 'on_shelf' })
    pickerList.value = result.list
  } catch (err) {
    ElMessage.error('加载商品列表失败')
  }
})

function onPickerSelect(selection) { pickerSelection.value = selection }

function confirmPicker() {
  pickerSelection.value.forEach(p => {
    if (!selectedItems.find(i => i.productId === p._id)) {
      selectedItems.push({
        productId: p._id,
        productName: p.name,
        specs: p.specs || [],
        spec: (p.specs && p.specs.length > 0) ? p.specs[0] : '',
        cost: p.cost || 0,
        quantity: 1
      })
    }
  })
  showPicker.value = false
}

async function doStockIn() {
  if (selectedItems.length === 0) { ElMessage.warning('请先选择商品'); return }
  submitting.value = true
  try {
    const items = selectedItems.map(i => ({
      productId: i.productId,
      spec: i.spec || '',
      quantity: i.quantity,
      cost: i.cost || 0
    }))
    const result = await batchAddStock({ items, operator: operator.value || '管理员', supplier: supplier.value, remark: remark.value })
    ElMessage.success('入库成功')
    if (result && result.batchId) {
      router.push(`/inventory/receipts/${result.batchId}`)
    } else {
      router.push('/inventory/products')
    }
  } catch (err) {
    ElMessage.error(err.message || '入库失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.stockin-page { max-width: 1000px; margin: 0 auto; }
.back-title { font-size: 16px; font-weight: 600; }
.info-card, .action-card, .items-card { margin-top: 16px; margin-bottom: 16px; border-radius: 8px; }
.hint-text { margin-left: 12px; color: #999; font-size: 14px; }
.total-row { display: flex; justify-content: space-between; padding: 16px 0 8px; font-size: 15px; border-top: 1px solid #f0f0f0; margin-top: 12px; }
.total-amount { color: #f56c6c; }
.submit-btn { margin-top: 12px; width: 100%; }
.picker-search { margin-bottom: 12px; }
</style>
