<template>
  <div class="car-page">
    <div class="page-header">
      <h2 class="page-title">车辆管理</h2>
      <div class="header-right">
        <span class="subtitle" v-if="!loading">共 {{ filteredList.length }} 辆车</span>
        <el-button type="primary" size="small" @click="$router.push('/cars/add')">
          <el-icon><Plus /></el-icon> 新建车辆
        </el-button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <el-card shadow="never" class="search-card">
      <el-row :gutter="12" align="middle">
        <el-col :span="8">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索车牌号 / 车主姓名 / 手机号"
            :prefix-icon="Search"
            clearable
            @input="onSearch"
          />
        </el-col>
        <el-col :span="4">
          <el-select v-model="filterType" placeholder="车辆类型" clearable @change="onSearch">
            <el-option label="全部" value="" />
            <el-option label="轿车" value="轿车" />
            <el-option label="SUV" value="SUV" />
            <el-option label="MPV" value="MPV" />
            <el-option label="皮卡" value="皮卡" />
            <el-option label="货车" value="货车" />
            <el-option label="客车" value="客车" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filterVip" placeholder="会员状态" clearable @change="onSearch">
            <el-option label="全部" value="" />
            <el-option label="VIP" :value="true" />
            <el-option label="非会员" :value="false" />
          </el-select>
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
    <div v-else-if="rawList.length === 0" class="empty-wrapper">
      <el-empty description="暂无车辆数据" />
    </div>

    <!-- 数据表格 -->
    <el-card v-else shadow="hover" class="table-card">
      <el-table
        :data="pagedList"
        stripe
        v-loading="tableLoading"
        @row-click="openDetail"
        highlight-current-row
        class="car-table"
      >
        <el-table-column prop="plate" label="车牌号" width="120" fixed>
          <template #default="{ row }">
            <span class="plate-cell">{{ row.plate || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ownerName" label="车主" width="90">
          <template #default="{ row }">
            {{ row.ownerName || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="carType" label="车型" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.carType" size="small" effect="plain" type="info">
              {{ row.carType }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130">
          <template #default="{ row }">
            {{ formatPhone(row.phone) }}
          </template>
        </el-table-column>
        <el-table-column label="会员" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="isVip(row)" type="warning" size="small" effect="dark">VIP</el-tag>
            <span v-else class="text-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="工单数" width="80" align="center">
          <template #default="{ row }">
            {{ getOrderStats(row).count || 0 }}
          </template>
        </el-table-column>
        <el-table-column label="消费总额(元)" width="120" align="right">
          <template #default="{ row }">
            {{ formatYuan(getOrderStats(row).amount || 0) }}
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="添加时间" width="110" align="center">
          <template #default="{ row }">
            {{ formatDate(row.createTime, 'YYYY-MM-DD') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text size="small" type="primary" @click.stop="openDetail(row)">
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="filteredTotal > 0">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[15, 30, 50, 100]"
          :total="filteredTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="onPageChange"
          @current-change="onPageChange"
        />
      </div>
    </el-card>

    <!-- 详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="'车辆详情 · ' + (currentCar ? currentCar.plate : '')"
      size="480px"
      destroy-on-close
    >
      <template v-if="currentCar">
        <!-- 基本信息 -->
        <el-descriptions :column="1" border size="small" class="detail-desc">
          <el-descriptions-item label="车牌号">
            <strong>{{ currentCar.plate }}</strong>
          </el-descriptions-item>
          <el-descriptions-item label="车主">
            {{ currentCar.ownerName || '未填写' }}
          </el-descriptions-item>
          <el-descriptions-item label="车型">
            {{ currentCar.carType || '未填写' }}
          </el-descriptions-item>
          <el-descriptions-item label="颜色">
            {{ currentCar.color || '未填写' }}
          </el-descriptions-item>
          <el-descriptions-item label="手机号">
            {{ formatPhone(currentCar.phone) }}
          </el-descriptions-item>
          <el-descriptions-item label="里程(km)">
            {{ currentCar.mileage ? currentCar.mileage.toLocaleString() : '未填写' }}
          </el-descriptions-item>
          <el-descriptions-item label="VIN">
            {{ currentCar.vin || '未填写' }}
          </el-descriptions-item>
          <el-descriptions-item label="会员状态">
            <el-tag v-if="isVip(currentCar)" type="warning" size="small">VIP</el-tag>
            <span v-else>非会员</span>
          </el-descriptions-item>
          <el-descriptions-item label="工单数">
            {{ getOrderStats(currentCar).count || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="消费总额">
            ¥{{ formatYuan(getOrderStats(currentCar).amount || 0) }}
          </el-descriptions-item>
          <el-descriptions-item label="添加时间">
            {{ formatDate(currentCar.createTime, 'YYYY-MM-DD hh:mm') }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 提醒信息 -->
        <el-divider />
        <h4 class="section-title">到期提醒</h4>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="保养到期">
            <span :class="getDateClass(currentCar.maintainDate)">
              {{ currentCar.maintainDate ? formatDate(currentCar.maintainDate, 'YYYY-MM-DD') : '未设置' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="保险到期">
            <span :class="getDateClass(currentCar.insuranceDate)">
              {{ currentCar.insuranceDate ? formatDate(currentCar.insuranceDate, 'YYYY-MM-DD') : '未设置' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="配件更换">
            <span :class="getDateClass(currentCar.partReplaceDate)">
              {{ currentCar.partReplaceName || currentCar.partReplaceDate
                  ? formatDate(currentCar.partReplaceDate, 'YYYY-MM-DD')
                  : '未设置' }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="备注">
            {{ currentCar.remark || '无' }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 快速编辑 -->
        <el-divider />
        <h4 class="section-title">快速编辑</h4>
        <el-form :model="editForm" label-position="top" size="small">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="车型">
                <el-select v-model="editForm.carType" placeholder="选择车型" clearable>
                  <el-option label="轿车" value="轿车" />
                  <el-option label="SUV" value="SUV" />
                  <el-option label="MPV" value="MPV" />
                  <el-option label="皮卡" value="皮卡" />
                  <el-option label="货车" value="货车" />
                  <el-option label="客车" value="客车" />
                  <el-option label="其他" value="其他" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="颜色">
                <el-input v-model="editForm.color" placeholder="如：白色" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="车主">
                <el-input v-model="editForm.ownerName" placeholder="车主姓名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="手机号">
                <el-input v-model="editForm.phone" placeholder="11位手机号" maxlength="11" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="里程(km)">
            <el-input-number v-model="editForm.mileage" :min="0" :step="10000" controls-position="right" style="width:100%" />
          </el-form-item>
          <el-form-item label="保养到期">
            <el-date-picker v-model="editForm.maintainDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <el-form-item label="保险到期">
            <el-date-picker v-model="editForm.insuranceDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="editForm.remark" type="textarea" :rows="2" placeholder="备注信息" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveEdit">
              {{ saving ? '保存中...' : '保存修改' }}
            </el-button>
            <el-button @click="drawerVisible = false">取消</el-button>
          </el-form-item>
        </el-form>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { fetchCarList, updateCarInfo } from '@/api/car'
import { formatYuan, formatPhone, formatDate } from '@/utils/format'
import { Search, Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// ============ 数据状态 ============
const loading = ref(true)
const loadError = ref('')
const tableLoading = ref(false)

const rawList = ref([])       // 云函数返回的全部车辆
const memberMap = ref({})     // plate → true (会员标记)
const orderStats = ref({})    // plate → { count, amount }

// 搜索/筛选
const searchKeyword = ref('')
const filterType = ref('')
const filterVip = ref('')

// 分页
const currentPage = ref(1)
const pageSize = ref(30)

// 抽屉
const drawerVisible = ref(false)
const currentCar = ref(null)
const saving = ref(false)
const editForm = reactive({
  carType: '',
  color: '',
  ownerName: '',
  phone: '',
  mileage: 0,
  maintainDate: '',
  insuranceDate: '',
  remark: ''
})

// ============ 计算属性 ============

/** 筛选后的列表 */
const filteredList = computed(() => {
  let list = rawList.value

  // 关键词搜索
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(car => {
      return (car.plate && car.plate.toLowerCase().includes(kw))
        || (car.ownerName && car.ownerName.toLowerCase().includes(kw))
        || (car.phone && car.phone.includes(kw))
    })
  }

  // 车型筛选
  if (filterType.value) {
    list = list.filter(car => car.carType === filterType.value)
  }

  // VIP 筛选
  if (filterVip.value !== '' && filterVip.value !== null) {
    list = list.filter(car => isVip(car) === filterVip.value)
  }

  return list
})

const filteredTotal = computed(() => filteredList.value.length)

const pagedList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

// ============ 工具方法 ============

function isVip(car) {
  return !!memberMap.value[car.plate]
}

function getOrderStats(car) {
  const stats = orderStats.value[car.plate]
  return {
    count: stats ? stats.orderCount : 0,
    amount: stats ? stats.totalAmount : 0
  }
}

function getDateClass(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const days = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return 'date-expired'
  if (days <= 7) return 'date-urgent'
  if (days <= 30) return 'date-warning'
  return 'date-ok'
}

// ============ 生命周期 ============

onMounted(() => {
  loadData()
})

// ============ 方法 ============

async function loadData() {
  loading.value = true
  loadError.value = ''

  try {
    tableLoading.value = true
    const result = await fetchCarList()
    rawList.value = result.list
    memberMap.value = result.memberMap
    orderStats.value = result.orderStats
    currentPage.value = 1
  } catch (err) {
    loadError.value = err.message || '加载车辆数据失败'
    console.error('[CarList] 加载失败:', err)
  } finally {
    loading.value = false
    tableLoading.value = false
  }
}

function onSearch() {
  currentPage.value = 1
}

function onPageChange() {
  // 分页计算由 computed 自动处理
}

function openDetail(car) {
  currentCar.value = car
  // 回填编辑表单
  editForm.carType = car.carType || ''
  editForm.color = car.color || ''
  editForm.ownerName = car.ownerName || ''
  editForm.phone = car.phone || ''
  editForm.mileage = car.mileage || 0
  editForm.maintainDate = car.maintainDate || ''
  editForm.insuranceDate = car.insuranceDate || ''
  editForm.remark = car.remark || ''
  drawerVisible.value = true
}

async function saveEdit() {
  if (!currentCar.value) return

  saving.value = true
  try {
    await updateCarInfo(currentCar.value._id, { ...editForm })

    // 乐观更新本地数据
    const idx = rawList.value.findIndex(c => c._id === currentCar.value._id)
    if (idx !== -1) {
      Object.assign(rawList.value[idx], { ...editForm })
    }
    Object.assign(currentCar.value, { ...editForm })

    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error(err.message || '保存失败')
    console.error('[CarList] 保存失败:', err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.car-page {
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

.car-table {
  cursor: pointer;
}

.plate-cell {
  font-weight: 600;
  font-family: 'Helvetica Neue', monospace;
  color: #333;
}

.text-muted {
  color: #ccc;
}

.pagination-wrapper {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
}

/* 日期状态 */
.date-expired { color: #f56c6c; font-weight: 600; }
.date-urgent  { color: #f56c6c; }
.date-warning { color: #e6a23c; }
.date-ok      { color: #67c23a; }

/* 详情抽屉 */
.detail-desc {
  margin-bottom: 12px;
}

.section-title {
  margin: 8px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
</style>
