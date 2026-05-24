<template>
  <div class="order-add-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="goBack" text>返回</el-button>
      <h2 class="page-title">新开工单</h2>
    </div>

    <!-- Step 1: 选择车辆 -->
    <el-card v-if="step === 1" shadow="never" class="form-card">
      <el-alert
        title="请先搜索并选择车辆，确认车主信息"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom:20px"
      />

      <el-input
        v-model="searchPlate"
        placeholder="搜索车牌号（如：京A12345）"
        :prefix-icon="Search"
        clearable
        size="large"
        @keyup.enter="searchCar"
        @clear="carResults = []"
      >
        <template #append>
          <el-button :icon="Search" :loading="searching" @click="searchCar">搜索</el-button>
        </template>
      </el-input>

      <div v-if="carResults.length > 0" class="car-results">
        <el-table :data="carResults" stripe @row-click="selectCar" highlight-current-row>
          <el-table-column prop="plate" label="车牌号" width="120" />
          <el-table-column prop="ownerName" label="车主" width="100" />
          <el-table-column prop="carType" label="车型" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.carType" size="small" effect="plain">{{ row.carType }}</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="会员" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="isVip(row)" type="warning" size="small" effect="dark">VIP</el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="已消费(元)" width="110" align="right">
            <template #default="{ row }">
              {{ formatYuan(getOrderAmount(row)) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click.stop="selectCar(row)">选择</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <el-empty v-if="!searching && searchPlate && carResults.length === 0" description="未找到匹配车辆" />
    </el-card>

    <!-- Step 2: 填写工单详情 -->
    <el-card v-if="step === 2" shadow="never" class="form-card">
      <!-- 选中的车辆信息 -->
      <div class="selected-car-bar">
        <div class="car-info">
          <span class="car-plate">{{ selectedCar.plate }}</span>
          <span v-if="selectedCar.ownerName" class="car-owner">{{ selectedCar.ownerName }}</span>
          <el-tag v-if="isVip(selectedCar)" type="warning" size="small" effect="dark">VIP</el-tag>
          <span v-if="selectedCar.phone" class="car-phone">{{ formatPhone(selectedCar.phone) }}</span>
        </div>
        <el-button link type="primary" size="small" @click="step = 1">更换车辆</el-button>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        label-width="100px"
        label-position="right"
        size="default"
      >
        <el-divider content-position="left">服务项目</el-divider>

        <div v-if="form.items.length === 0" class="items-empty">
          <span class="text-muted">暂未添加服务项目</span>
          <el-button type="primary" link @click="addItem">+ 添加服务项目</el-button>
        </div>

        <div v-for="(item, idx) in form.items" :key="idx" class="item-row">
          <el-row :gutter="10" align="middle">
            <el-col :span="7">
              <el-input v-model="item.name" placeholder="项目名称" />
            </el-col>
            <el-col :span="3">
              <el-input v-model="item.spec" placeholder="规格" />
            </el-col>
            <el-col :span="3">
              <el-input-number v-model="item.qty" :min="1" placeholder="数量" controls-position="right" style="width:100%" />
            </el-col>
            <el-col :span="4">
              <el-input-number v-model="item.amount" :min="0" :precision="2" placeholder="金额" controls-position="right" style="width:100%" />
            </el-col>
            <el-col :span="4">
              <el-input v-model="item.category" placeholder="分类" />
            </el-col>
            <el-col :span="2">
              <el-button type="danger" link @click="removeItem(idx)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-col>
          </el-row>
        </div>

        <el-button v-if="form.items.length > 0" type="primary" link size="small" style="margin-top:8px" @click="addItem">
          + 添加更多项目
        </el-button>

        <!-- 汇总 -->
        <div v-if="form.items.length > 0" class="summary-bar">
          <span>合计：</span>
          <strong class="summary-amount">¥{{ formatYuan(totalAmount) }}</strong>
        </div>

        <el-divider content-position="left">收款信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="实收金额">
              <el-input-number v-model="form.paidAmount" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="支付方式">
              <el-select v-model="form.payMethod" style="width:100%">
                <el-option label="现金" value="cash" />
                <el-option label="微信" value="wechat" />
                <el-option label="支付宝" value="alipay" />
                <el-option label="刷卡" value="card" />
                <el-option label="挂账" value="credit" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="工单状态">
              <el-select v-model="form.status" style="width:100%">
                <el-option label="已完成" value="已完成" />
                <el-option label="施工中" value="施工中" />
                <el-option label="待结算" value="待结算" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">补充信息</el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="保养到期">
              <el-date-picker
                v-model="form.setMaintainDate"
                type="date"
                placeholder="选择日期（可选）"
                value-format="YYYY-MM-DD"
                style="width:100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="里程(km)">
              <el-input-number v-model="form.setMileage" :min="0" :step="10000" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="工单备注（可选）" />
        </el-form-item>

        <div class="form-actions">
          <el-button @click="step = 1">上一步</el-button>
          <el-button type="success" :loading="saving" @click="handleSave('施工中')">
            暂存（施工中）
          </el-button>
          <el-button type="primary" :loading="saving" @click="handleSave('已完成')" size="large">
            完成开单
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fetchCarList } from '@/api/car'
import { createOrder } from '@/api/order'
import { formatYuan, formatPhone } from '@/utils/format'
import { ArrowLeft, Search, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const formRef = ref(null)
const saving = ref(false)
const step = ref(1)

const searchPlate = ref('')
const searching = ref(false)
const carResults = ref([])
const memberMap = ref({})
const orderStatsMap = ref({})

const selectedCar = ref({})

const form = reactive({
  items: [],      // [{name, spec, qty, amount, category}]
  paidAmount: 0,
  payMethod: 'cash',
  status: '已完成',
  setMaintainDate: '',
  setMileage: 0,
  remark: ''
})

const totalAmount = computed(() => {
  return form.items.reduce((sum, item) => sum + (Number(item.amount) || 0) * (Number(item.qty) || 1), 0)
})

function goBack() {
  router.push('/orders')
}

function isVip(car) {
  return !!memberMap.value[car.plate]
}

function getOrderAmount(car) {
  const stats = orderStatsMap.value[car.plate]
  return stats ? stats.totalAmount : 0
}

async function searchCar() {
  if (!searchPlate.value.trim()) return
  searching.value = true
  try {
    const result = await fetchCarList()
    memberMap.value = result.memberMap
    orderStatsMap.value = result.orderStats

    const kw = searchPlate.value.trim().toLowerCase()
    carResults.value = result.list.filter(car =>
      car.plate && car.plate.toLowerCase().includes(kw)
    )
    if (carResults.value.length === 0) {
      ElMessage.info('未找到匹配车辆')
    }
  } catch (err) {
    ElMessage.error(err.message || '搜索失败')
  } finally {
    searching.value = false
  }
}

function selectCar(car) {
  selectedCar.value = car
  form.items = [{ name: '', spec: '', qty: 1, amount: 0, category: '' }]
  form.paidAmount = 0
  form.payMethod = 'cash'
  form.status = '已完成'
  form.setMaintainDate = ''
  form.setMileage = car.mileage || 0
  form.remark = ''
  step.value = 2
}

function addItem() {
  form.items.push({ name: '', spec: '', qty: 1, amount: 0, category: '' })
}

function removeItem(idx) {
  form.items.splice(idx, 1)
}

async function handleSave(statusOverride) {
  if (!selectedCar.value.plate) return

  // 校验至少有一个服务项目
  const items = form.items.filter(i => i.name.trim())
  if (statusOverride !== '施工中' && items.length === 0) {
    ElMessage.warning('请至少添加一个服务项目')
    return
  }

  saving.value = true
  try {
    const serviceItems = items.map(i => `${i.name}${i.spec ? ' ' + i.spec : ''}`).join(',')
    const serviceAmounts = items.map(i => i.amount).join(',')
    const serviceQuantities = items.map(i => i.qty).join(',')
    const serviceCategories = items.map(i => i.category || '').join(',')

    // ★ payMethod 映射：Web端 → 小程序端（1=现付, 2=挂账）
    const payMethodMap = { cash: '1', wechat: '1', alipay: '1', card: '1', credit: '2' }
    const payload = {
      plate: selectedCar.value.plate,
      serviceItems,
      serviceAmounts,
      serviceQuantities,
      serviceCategories,
      totalAmount: totalAmount.value,
      paidAmount: form.paidAmount || totalAmount.value,
      payMethod: payMethodMap[form.payMethod] || '1',
      status: statusOverride,
      remark: form.remark,
      setMaintainDate: form.setMaintainDate,
      setMileage: form.setMileage,
      carDocId: selectedCar.value._id,
      _skipAmountCheck: statusOverride === '施工中'
    }

    await createOrder(payload)

    const label = statusOverride === '施工中' ? '工单暂存成功' : '开单成功'
    ElMessage.success(label)
    router.push('/orders')
  } catch (err) {
    ElMessage.error(err.message || '开单失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.order-add-page {
  max-width: 1000px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

.form-card {
  border-radius: 8px;
}

.form-card :deep(.el-card__body) {
  padding: 24px 32px;
}

.form-card :deep(.el-divider__text) {
  font-weight: 600;
  font-size: 14px;
  color: #555;
}

.car-results {
  margin-top: 16px;
}

.selected-car-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f0f7ff;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #d6e9ff;
}

.car-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.car-plate {
  font-size: 18px;
  font-weight: 700;
  font-family: 'Helvetica Neue', monospace;
  color: #333;
}

.car-owner {
  color: #666;
  font-size: 14px;
}

.car-phone {
  color: #999;
  font-size: 13px;
}

.items-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.text-muted {
  color: #999;
  font-size: 13px;
}

.item-row {
  margin-bottom: 8px;
  padding: 10px;
  background: #fafafa;
  border-radius: 6px;
}

.summary-bar {
  text-align: right;
  padding: 12px 0;
  font-size: 16px;
  color: #333;
}

.summary-amount {
  font-size: 22px;
  font-family: 'Helvetica Neue', monospace;
  color: #e6a23c;
}

.form-actions {
  margin-top: 32px;
  text-align: center;
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
