<template>
  <div class="product-page">
    <div class="page-header">
      <h2 class="page-title">商品管理</h2>
      <div class="header-actions">
        <el-button type="primary" @click="$router.push('/inventory/products/add')">
          <el-icon><Plus /></el-icon> 新增商品
        </el-button>
        <el-button @click="$router.push('/inventory/stock-in')">
          <el-icon><ShoppingCart /></el-icon> 入库
        </el-button>
      </div>
    </div>

    <!-- 搜索/筛选 -->
    <el-card shadow="never" class="search-card">
      <el-row :gutter="12" align="middle">
        <el-col :span="6">
          <el-input v-model="keyword" placeholder="搜索商品名" :prefix-icon="Search" clearable @keyup.enter="onSearch" @clear="onSearch" />
        </el-col>
        <el-col :span="3">
          <el-select v-model="category" placeholder="分类" clearable @change="onSearch">
            <el-option label="全部" value="" />
            <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
          </el-select>
        </el-col>
        <el-col :span="3">
          <el-select v-model="statusFilter" placeholder="状态" clearable @change="onSearch">
            <el-option label="全部" value="" />
            <el-option label="已上架" value="on_shelf" />
            <el-option label="已下架" value="off_shelf" />
          </el-select>
        </el-col>
        <el-col :span="3">
          <el-button type="primary" @click="onSearch"><el-icon><Search /></el-icon> 搜索</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="hover" class="table-card">
      <!-- 加载状态 -->
      <div v-if="loading && productList.length === 0" class="loading-wrapper">
        <el-skeleton :rows="8" animated />
      </div>

      <!-- 错误状态 -->
      <div v-else-if="loadError" class="error-wrapper">
        <el-alert :title="loadError" type="error" show-icon :closable="false" />
        <el-button type="primary" class="retry-btn" @click="loadData">重新加载</el-button>
      </div>

      <!-- 空状态 -->
      <div v-else-if="total === 0 && !loading" class="empty-wrapper">
        <el-empty description="暂无商品数据" />
      </div>

      <!-- 正常表格 -->
      <template v-else>
      <el-table :data="productList" stripe v-loading="loading" @row-click="goDetail" highlight-current-row>
        <el-table-column label="商品名称" min-width="160">
          <template #default="{ row }">
            <span class="product-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" type="info">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="售价(元)" width="100" align="right">
          <template #default="{ row }">{{ formatYuan(row.price) }}</template>
        </el-table-column>
        <el-table-column label="库存" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="stockType(row.stock)" size="small" effect="dark">{{ row.stock || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.productStatus !== 'off_shelf'"
              active-color="#13ce66"
              inactive-color="#ff4949"
              size="small"
              @change="() => handleToggle(row)"
              @click.stop
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text size="small" type="primary" @click.stop="goDetail(row)">详情</el-button>
            <el-button text size="small" @click.stop="goEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
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
      </template>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchProductList, toggleProductStatus } from '@/api/inventory'
import { formatYuan } from '@/utils/format'
import { Search, Plus, ShoppingCart } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()

const categories = ['机油', '滤清器', '刹车片', '轮胎', '电瓶', '火花塞', '雨刷', '灯泡', '冷媒', '清洗类', '添加剂', '皮带', '减震器', '轮毂', '其他']

const loading = ref(false)
const loadError = ref('')
const productList = ref([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(30)
const keyword = ref('')
const category = ref('')
const statusFilter = ref('')

onMounted(() => loadData())

function stockType(stock) {
  if (stock <= 0) return 'danger'
  if (stock <= 10) return 'warning'
  return 'success'
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchProductList({
      keyword: keyword.value,
      category: category.value,
      page: currentPage.value,
      pageSize: pageSize.value,
      status: statusFilter.value
    })
    productList.value = result.list
    total.value = result.total
  } catch (err) {
    loadError.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function onSearch() { currentPage.value = 1; loadData() }
function goDetail(row) { router.push(`/inventory/products/${row._id}`) }
function goEdit(row) { router.push(`/inventory/products/${row._id}/edit`) }

async function handleToggle(row) {
  try {
    await toggleProductStatus(row._id)
    ElMessage.success(row.productStatus === 'off_shelf' ? '已上架' : '已下架')
    // 乐观更新
    row.productStatus = row.productStatus === 'off_shelf' ? 'on_shelf' : 'off_shelf'
  } catch (err) {
    ElMessage.error(err.message || '操作失败')
  }
}
</script>

<style scoped>
.product-page { max-width: 1400px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-title { margin: 0; font-size: 20px; font-weight: 600; }
.header-actions { display: flex; gap: 8px; }
.search-card { margin-bottom: 16px; border-radius: 8px; }
.search-card :deep(.el-card__body) { padding: 16px 20px; }
.table-card { border-radius: 8px; }
.table-card :deep(.el-card__body) { padding: 0; }
.loading-wrapper { padding: 20px; }
.error-wrapper { text-align: center; padding: 40px 0; }
.retry-btn { margin-top: 16px; }
.empty-wrapper { padding: 60px 0; }
.product-name { font-weight: 600; color: #333; }
.pagination-wrapper { padding: 16px 20px; display: flex; justify-content: flex-end; }
</style>
