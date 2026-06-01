<template>
  <div class="member-add-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" @click="goBack" text>返回</el-button>
      <h2 class="page-title">新增会员</h2>
    </div>

    <!-- Step 1: 选择车辆 -->
    <el-card v-if="step === 1" shadow="never" class="form-card">
      <el-alert
        title="请先搜索并选择车辆，会员信息将基于车辆数据自动填充"
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
          <el-table-column prop="phone" label="手机号" width="130">
            <template #default="{ row }">
              {{ formatPhone(row.phone) }}
            </template>
          </el-table-column>
          <el-table-column prop="carType" label="车型" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.carType" size="small" effect="plain">{{ row.carType }}</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click.stop="selectCar(row)">选择</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!searching && searchPlate && carResults.length === 0" description="未找到匹配车辆" />
      </div>

      <el-divider />

      <div class="skip-section">
        <span class="skip-hint">车辆还未录系统？手动填写信息</span>
        <el-button type="primary" link @click="skipCarSearch">跳过搜索，手动填写</el-button>
      </div>
    </el-card>

    <!-- Step 2: 填写会员详情 -->
    <el-card v-if="step === 2" shadow="never" class="form-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        label-position="right"
        size="default"
      >
        <el-divider content-position="left">车辆信息（来自搜索）</el-divider>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="车牌号" prop="plate">
              <el-input v-model="form.plate" placeholder="车牌号" maxlength="10" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="车主姓名">
              <el-input v-model="form.ownerName" placeholder="车主姓名" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="手机号">
              <el-input v-model="form.phone" placeholder="11位手机号" maxlength="11" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="会员等级">
              <el-select v-model="form.level" placeholder="选择等级" style="width:100%">
                <el-option label="普通" value="普通" />
                <el-option label="银卡" value="银卡" />
                <el-option label="金卡" value="金卡" />
                <el-option label="钻石" value="钻石" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">权益信息（可选）</el-divider>

        <div v-if="form.benefits.length === 0" class="benefits-empty">
          <span class="text-muted">暂未添加权益</span>
          <el-button type="primary" link @click="addBenefit">+ 添加权益</el-button>
        </div>

        <div v-for="(item, idx) in form.benefits" :key="idx" class="benefit-row">
          <el-row :gutter="12" align="middle">
            <el-col :span="6">
              <el-form-item label="" label-width="0">
                <el-input v-model="item.name" placeholder="权益名称" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="" label-width="0">
                <el-input-number v-model="item.total" :min="0" placeholder="总次数" controls-position="right" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="" label-width="0">
                <el-input-number v-model="item.remain" :min="0" placeholder="剩余" controls-position="right" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item label="" label-width="0">
                <el-input-number v-model="item.amount" :min="0" :precision="2" placeholder="金额" controls-position="right" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-button type="danger" link @click="removeBenefit(idx)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-col>
          </el-row>
        </div>

        <el-button v-if="form.benefits.length > 0" type="primary" link size="small" style="margin-top:8px" @click="addBenefit">
          + 添加更多权益
        </el-button>

        <el-divider content-position="left">备注</el-divider>

        <el-form-item label="备注" label-width="100px">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="其他备注信息" />
        </el-form-item>

        <div class="form-actions">
          <el-button @click="step = 1">上一步</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave" size="large">
            {{ saving ? '保存中...' : '提交保存' }}
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { fetchCarList } from '@/api/car'
import { addMember } from '@/api/member'
import { formatPhone } from '@/utils/format'
import { ArrowLeft, Search, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const formRef = ref(null)
const saving = ref(false)
const step = ref(1)

const searchPlate = ref('')
const searching = ref(false)
const carResults = ref([])

const form = reactive({
  plate: '',
  ownerName: '',
  phone: '',
  level: '普通',
  benefits: [],
  remark: ''
})

const rules = {
  plate: [
    { required: true, message: '请输入车牌号', trigger: 'blur' },
    { min: 2, message: '车牌号至少2位', trigger: 'blur' }
  ]
}

function goBack() {
  router.push('/members')
}

async function searchCar() {
  if (!searchPlate.value.trim()) return
  searching.value = true
  try {
    const result = await fetchCarList()
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
  form.plate = car.plate || ''
  form.ownerName = car.ownerName || ''
  form.phone = car.phone || ''
  step.value = 2
}

function skipCarSearch() {
  form.plate = ''
  form.ownerName = ''
  form.phone = ''
  step.value = 2
}

function addBenefit() {
  form.benefits.push({ name: '', total: 0, remain: 0, amount: 0 })
}

function removeBenefit(idx) {
  form.benefits.splice(idx, 1)
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    // 过滤空权益
    const benefits = form.benefits.filter(b => b.name.trim())

    const payload = {
      plate: form.plate,
      ownerName: form.ownerName,
      phone: form.phone,
      remark: form.remark,
      benefits
    }

    await addMember(payload)
    ElMessage.success('会员添加成功')
    router.push('/members')
  } catch (err) {
    ElMessage.error(err.message || '添加失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.member-add-page {
  max-width: 900px;
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

.skip-section {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.skip-hint {
  color: #999;
  font-size: 14px;
}

.benefits-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.text-muted {
  color: #999;
  font-size: 13px;
}

.benefit-row {
  margin-bottom: 4px;
  padding: 8px;
  background: #fafafa;
  border-radius: 6px;
}

.form-actions {
  margin-top: 32px;
  text-align: center;
  display: flex;
  justify-content: center;
  gap: 16px;
}
</style>
